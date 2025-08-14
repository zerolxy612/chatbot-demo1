import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { callOpenAI, callStockAPI } from './api';
import ChartComponent from './ChartComponent';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isNetworkEnabled, setIsNetworkEnabled] = useState(true); // 联网模式
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(true); // 思考模式
  const [isLoading, setIsLoading] = useState(false);
  const [isRagLoading, setIsRagLoading] = useState(false); // RAG接口加载状态
  const [isLawRagLoading, setIsLawRagLoading] = useState(false); // 法律RAG加载状态
  const [isLawMultisearchLoading, setIsLawMultisearchLoading] = useState(false); // 法律多源检索加载状态
  const [selectedMode, setSelectedMode] = useState('chat'); // 'chat', 'stock', 'law'
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null); // 用于控制流式输出的中止

  // 根据开关状态生成模型名称
  const getModelName = () => {
    if (isThinkingEnabled && isNetworkEnabled) {
      return "HKGAI-V1-Thinking-RAG-Chat";
    } else if (isThinkingEnabled && !isNetworkEnabled) {
      return "HKGAI-V1-Thinking-RAG-NOSEARCH-Chat";
    } else if (!isThinkingEnabled && isNetworkEnabled) {
      return "HKGAI-V1-RAG-Chat";
    } else {
      return "HKGAI-V1-RAG-NOSEARCH-Chat";
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 停止流式输出
  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setIsRagLoading(false);
      setIsLawRagLoading(false);
      setIsLawMultisearchLoading(false);

      // 更新最后一条消息的流式状态
      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1 && msg.role === 'assistant' && (msg.isStreaming || isLawRagLoading || isLawMultisearchLoading)) {
          return {
            ...msg,
            isStreaming: false,
            content: msg.content || msg.mainContent || '回答被中断',
            mainContent: msg.mainContent || msg.content || '回答被中断'
          };
        }
        return msg;
      }));
    }
  };

  // 从搜索结果中提取引用信息
  const extractSearchResults = (content) => {
    const searchResults = [];

    // 提取 <search_results> 标签内的内容
    const searchResultsMatch = content.match(/<search_results>([\s\S]*?)<\/search_results>/);
    if (searchResultsMatch) {
      const searchData = searchResultsMatch[1].trim();

      // 解码Unicode字符的函数
      const decodeText = (text) => {
        if (!text) return text;
        return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
          return String.fromCharCode(parseInt(code, 16));
        });
      };

      try {
        // 尝试解析为JSON数组
        const results = JSON.parse(`[${searchData}]`);
        if (Array.isArray(results)) {
          results.forEach(result => {
            if (result && result.doc_index) {
              searchResults.push({
                id: result.doc_index,
                title: decodeText(result.title) || '搜索结果',
                snippet: decodeText(result.snippet || result.result) || '',
                url: result.url || '',
                source: decodeText(result.source) || 'Unknown',
                score: result.score || 0
              });
            }
          });
        }
      } catch (e) {
        // JSON数组解析失败，尝试逐行解析JSON对象

        // 按行分割，每行可能是一个JSON对象
        const lines = searchData.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          try {
            const result = JSON.parse(line);
            if (result && result.doc_index) {
              searchResults.push({
                id: result.doc_index,
                title: decodeText(result.title) || '搜索结果',
                snippet: decodeText(result.snippet || result.result) || '',
                url: result.url || '',
                source: decodeText(result.source) || 'Unknown',
                score: result.score || 0
              });
            }
          } catch (lineError) {
            console.warn('解析行失败:', line, lineError);
          }
        });

        // 如果还是失败，尝试正则表达式提取
        if (searchResults.length === 0) {
          // 使用正则表达式匹配JSON对象
          const jsonMatches = searchData.match(/\{[^}]*"doc_index"[^}]*\}/g);
          if (jsonMatches) {
            jsonMatches.forEach(match => {
              try {
                const result = JSON.parse(match);
                if (result && result.doc_index) {
                  searchResults.push({
                    id: result.doc_index,
                    title: decodeText(result.title) || '搜索结果',
                    snippet: decodeText(result.snippet || result.result) || '',
                    url: result.url || '',
                    source: decodeText(result.source) || 'Unknown',
                    score: result.score || 0
                  });
                }
              } catch (matchError) {
                console.warn('正则匹配解析失败:', match, matchError);
              }
            });
          }
        }
      }
    }

    return searchResults;
  };

  // 内容解析函数 - 分离think内容和正文内容
  const parseContent = (content) => {
    // 提取搜索结果
    const searchResults = extractSearchResults(content);

    // 查找<think>标签的位置
    const thinkIndex = content.indexOf('<think>');
    if (thinkIndex === -1) {
      // 没有think标签，直接过滤其他内容
      return {
        thinkContent: '',
        mainContent: filterMainContent(content),
        searchResults: searchResults
      };
    }

    // 从<think>开始截取内容
    content = content.substring(thinkIndex);

    // 提取think内容
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    const thinkContent = thinkMatch ? thinkMatch[1].trim() : '';

    // 提取think标签后的内容
    const afterThink = content.replace(/<think>[\s\S]*?<\/think>/, '');
    const mainContent = filterMainContent(afterThink);

    return {
      thinkContent,
      mainContent,
      searchResults: searchResults
    };
  };

  // 解码Unicode字符
  const decodeUnicodeContent = (content) => {
    try {
      // 解码 \uXXXX 格式的Unicode字符
      return content.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });
    } catch (error) {
      console.warn('Unicode解码失败:', error);
      return content;
    }
  };

  // 过滤主要内容
  const filterMainContent = (content) => {
    // 先解码Unicode字符
    content = decodeUnicodeContent(content);

    // 过滤掉搜索结果（包括JSON格式的搜索结果）
    content = content.replace(/<search_results>[\s\S]*?<\/search_results>/g, '');
    content = content.replace(/<search_results>\{[\s\S]*?\}<\/search_results>/g, '');

    // 过滤掉单独的JSON搜索结果
    content = content.replace(/\{"query":\s*"[^"]*",[\s\S]*?\}/g, '');

    // 保留引用标记，不再过滤 [citation:3]
    // content = content.replace(/\[citation:\d+\]/g, '');

    // 过滤掉"None"（单独出现的）
    content = content.replace(/^\s*None\s*$/gm, '');

    // 过滤掉其他可能的标签（除了think标签）
    content = content.replace(/<\/?(?!think)[^>]+(>|$)/g, '');

    // 清理多余的空行
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    content = content.replace(/^\s*\n/gm, '');

    return content.trim();
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // 创建中止控制器
    abortControllerRef.current = new AbortController();

    // 创建一个临时的loading消息
    const tempMessageId = Date.now();
    const loadingMessage = {
      id: tempMessageId,
      role: 'assistant',
      content: '🤖 HKGAI-V1 正在思考中...',
      isLoading: true,
      isStreaming: true
    };

    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await callOpenAI(getModelName(), currentInput, abortControllerRef.current.signal);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = {
        id: tempMessageId, // 使用相同的ID来替换loading消息
        role: 'assistant',
        content: '',
        rawContent: '',
        thinkContent: '',
        mainContent: '',
        searchResults: [],
        isLoading: false,
        isStreaming: true
      };

      // 替换loading消息为实际消息
      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId ? assistantMessage : msg
      ));

      while (true) {
        // 检查是否被中止
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                // 累积原始内容
                assistantMessage.rawContent += parsed.choices[0].delta.content;

                // 解析内容
                const parsedContent = parseContent(assistantMessage.rawContent);
                assistantMessage.thinkContent = parsedContent.thinkContent;
                assistantMessage.mainContent = parsedContent.mainContent;
                assistantMessage.searchResults = parsedContent.searchResults;
                assistantMessage.content = assistantMessage.mainContent; // 保持兼容性

                setMessages(prev => prev.map(msg =>
                  msg.id === tempMessageId ? { ...assistantMessage } : msg
                ));
              }
            } catch (e) {
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
      }

      // 流式响应完成，更新状态
      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId ? {
          ...msg,
          isStreaming: false
        } : msg
      ));

    } catch (error) {
      console.error('Error:', error);

      let errorMessage = '抱歉，发生了错误，请稍后再试。';

      if (error.message.includes('500')) {
        errorMessage = '🔧 服务器暂时繁忙，请稍后重试。如果问题持续，请尝试使用multisearch按钮。';
      } else if (error.message.includes('network') || error.name === 'TypeError') {
        errorMessage = '🌐 网络连接异常，请检查网络后重试。';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = '🔑 API认证失败，请联系管理员检查API密钥。';
      } else if (error.message.includes('429')) {
        errorMessage = '⏰ API调用频率过高，请稍等片刻后重试。';
      }

      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId ? {
          ...msg,
          content: errorMessage,
          isError: true,
          isLoading: false,
          isStreaming: false
        } : msg
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null; // 清理 AbortController
    }
  };



  // 自定义ReactMarkdown组件，处理引用链接
  const MarkdownWithCitations = ({ children, searchResults = [] }) => {
    // 处理引用点击
    const handleCitationClick = (citationId) => {
      const result = searchResults.find(r => r.id === citationId);
      if (result && result.url) {
        window.open(result.url, '_blank');
      } else {
        // 如果没有URL，滚动到引用信息
        const refElement = document.getElementById(`citation-${citationId}`);
        if (refElement) {
          refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          refElement.style.backgroundColor = '#fff3cd';
          setTimeout(() => {
            refElement.style.backgroundColor = '';
          }, 2000);
        }
      }
    };

    // 处理文本中的引用标记
    const processContent = (text) => {
      if (typeof text !== 'string') return text;

      // 先解码Unicode字符
      text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });

      // 分割文本，保留引用标记
      const parts = text.split(/(\[citation:\d+\])/g);

      return parts.map((part, index) => {
        const citationMatch = part.match(/\[citation:(\d+)\]/);
        if (citationMatch) {
          const citationId = parseInt(citationMatch[1]);
          const result = searchResults.find(r => r.id === citationId);

          return (
            <sup
              key={index}
              className="citation-link"
              title={result ? `${result.title} - ${result.source}` : '引用来源'}
              onClick={() => handleCitationClick(citationId)}
              style={{
                color: '#1976d2',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '0.8em',
                marginLeft: '2px',
                fontWeight: 'bold'
              }}
            >
              [{citationId}]
            </sup>
          );
        }
        return part;
      });
    };

    return (
      <div>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p>{processContent(children)}</p>,
            li: ({ children }) => <li>{processContent(children)}</li>,
            // 处理其他可能包含文本的元素
            span: ({ children }) => <span>{processContent(children)}</span>,
            div: ({ children }) => <div>{processContent(children)}</div>
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
    );
  };

  // 调用新的RAG接口（流式输出）
  const callRagApi = async () => {
    if (!inputValue.trim() || isRagLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsRagLoading(true);

    // 创建中止控制器
    abortControllerRef.current = new AbortController();

    // 记录开始时间
    const startTime = performance.now();
    let ttft = null; // Time To First Token

    // 准备请求参数（启用流式输出）
    const requestParams = {
      query: currentInput,
      generate_overview: false,
      streaming: true, // 启用流式输出
      recalls: {
        serpapi: {},
        elasticsearch: {},
        faq: {}
      }
    };



    // 创建一个临时的助手消息用于实时更新
    const tempMessageId = Date.now();
    const initialAssistantMessage = {
      id: tempMessageId,
      role: 'assistant',
      content: '🔍 正在搜索相关资料...',
      isRagResponse: true,
      isStreaming: true,
      ragResponse: { reference: [] }
    };

    setMessages(prev => [...prev, initialAssistantMessage]);

    // 立即关闭加载状态，避免双重显示
    setIsRagLoading(false);

    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let documents = [];
      let searchFinished = false;

      while (true) {
        // 检查是否被中止
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataContent = line.slice(5).trim();

            // 跳过空的 data 行（SSE 格式中的心跳包）
            if (!dataContent) {
              continue;
            }

            try {
              const data = JSON.parse(dataContent);

              // 记录 TTFT（第一个数据包到达时间）
              if (ttft === null) {
                ttft = Math.round(performance.now() - startTime);
              }

              // 更新消息内容
              if (data.position !== undefined) {
                // 这是一个搜索文档，添加到文档列表
                documents.push(data);

                setMessages(prev => prev.map(msg => {
                  if (msg.id === tempMessageId) {
                    const content = `🔍 已找到 ${documents.length} 个相关资料...`;
                    const updatedRagResponse = {
                      ...msg.ragResponse,
                      reference: [...documents] // 创建新数组确保 React 检测到变化
                    };

                    return {
                      ...msg,
                      content,
                      ragResponse: updatedRagResponse
                    };
                  }
                  return msg;
                }));

                // 添加小延迟确保用户能看到渐进式更新
                await new Promise(resolve => setTimeout(resolve, 50));
              }

            } catch (e) {
              // 只在非空内容时记录警告，避免误报空行
              if (dataContent.length > 0) {
                console.warn('Failed to parse SSE data:', dataContent, 'Error:', e.message);
              }
            }
          } else if (line.startsWith('event:')) {
            const event = line.slice(6).trim();

            if (event === 'SEARCH_FINISHED') {
              searchFinished = true;

              // 搜索完成，更新最终消息
              // eslint-disable-next-line no-loop-func
              setMessages(prev => prev.map(msg => {
                if (msg.id === tempMessageId) {
                  const finalContent = documents.length > 0
                    ? `找到 ${documents.length} 个相关参考资料`
                    : '没有找到相关参考资料';

                  return {
                    ...msg,
                    content: finalContent,
                    isStreaming: false,
                    ttft: ttft, // 保存 TTFT
                    ragResponse: {
                      ...msg.ragResponse,
                      reference: documents,
                      search_keywords: currentInput
                    }
                  };
                }
                return msg;
              }));
            } else {
              // 更新搜索状态
              const statusMap = {
                'PROCESS_START': '🚀 开始处理查询...',
                'TRANSFORM_TO_WEB_SEARCH_START': '🔄 转换搜索查询...',
                'TRANSFORM_TO_WEB_SEARCH_FINISHED': '✅ 查询转换完成',
                'SEARCH_START': '🔍 开始搜索资料...',
                'RERANK_SEARCH_RESULT_START': '📊 重新排序搜索结果...',
                'RERANK_SEARCH_RESULT_FINISHED': '✅ 搜索完成'
              };

              const statusText = statusMap[event] || `📋 ${event}`;

              // 只在有状态文本时更新，并添加延迟确保可见性
              if (statusText && !searchFinished) {
                // eslint-disable-next-line no-loop-func
                setMessages(prev => prev.map(msg => {
                  if (msg.id === tempMessageId) {
                    return {
                      ...msg,
                      content: statusText
                    };
                  }
                  return msg;
                }));

                // 添加延迟让用户看到状态变化
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('RAG API Error:', error);
      setMessages(prev => prev.map(msg => {
        if (msg.id === tempMessageId) {
          return {
            ...msg,
            content: '抱歉，RAG接口调用失败，请稍后再试。错误信息：' + error.message,
            isStreaming: false
          };
        }
        return msg;
      }));
    } finally {
      setIsRagLoading(false);
      abortControllerRef.current = null; // 清理 AbortController
    }
  };

  // 智能数据采样函数 - 移动端优化
  const sampleDataForMobile = (data, maxPoints = 15) => {
    if (data.length <= maxPoints) return data;

    const step = Math.floor(data.length / maxPoints);
    const sampledData = [];

    // 始终包含第一个点
    sampledData.push(data[0]);

    // 采样中间的点
    for (let i = step; i < data.length - step; i += step) {
      sampledData.push(data[i]);
    }

    // 始终包含最后一个点
    if (data.length > 1) {
      sampledData.push(data[data.length - 1]);
    }

    return sampledData;
  };

  // 检测是否为移动设备
  const isMobile = () => {
    return window.innerWidth <= 768;
  };

  // 股票数据转换为图表数据
  const convertStockDataToChart = (stockData, timeRange = '1M') => {
    if (!stockData || !stockData.ranges || !stockData.ranges[timeRange]) {
      throw new Error('股票数据格式不正确');
    }

    let rangeData = stockData.ranges[timeRange];
    const firstPrice = rangeData[0]?.close || 0;
    const lastPrice = rangeData[rangeData.length - 1]?.close || 0;
    const priceChange = lastPrice - firstPrice;
    const priceChangePercent = firstPrice > 0 ? ((priceChange / firstPrice) * 100).toFixed(2) : 0;
    const isUp = priceChange >= 0;

    // 移动端数据采样
    const mobile = isMobile();
    if (mobile && rangeData.length > 15) {
      rangeData = sampleDataForMobile(rangeData, 15);
    }

    return {
      isChart: true,
      type: 'line',
      title: `${stockData.ticker} 股价走势 (${isUp ? '↗' : '↘'} ${priceChangePercent}%)`,
      xAxis: rangeData.map(item => {
        const date = new Date(item.date);
        return mobile ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getMonth() + 1}-${date.getDate()}`;
      }),
      yAxis: rangeData.map(item => item.close),
      description: `${stockData.ticker} ${timeRange}时间段股价数据，当前价格: ${stockData.currency} ${lastPrice.toFixed(2)}`,
      isMobile: mobile,
      rawData: {
        ohlc: rangeData.map(item => [item.open, item.high, item.low, item.close]),
        volume: rangeData.map(item => item.volume),
        dates: rangeData.map(item => item.date)
      },
      stockInfo: {
        ticker: stockData.ticker,
        market: stockData.market,
        currency: stockData.currency,
        timezone: stockData.timezone,
        currentPrice: lastPrice,
        priceChange: priceChange,
        priceChangePercent: priceChangePercent,
        isUp: isUp,
        highestPrice: Math.max(...rangeData.map(item => item.high)),
        lowestPrice: Math.min(...rangeData.map(item => item.low))
      }
    };
  };

  // 将图表数据转换为ECharts配置
  const convertToEChartsConfig = (chartData) => {
    const isStockChart = chartData.stockInfo;
    const lineColor = isStockChart ?
      (chartData.stockInfo.isUp ? '#00da3c' : '#ec0000') : '#ff6b6b';
    const mobile = chartData.isMobile;

    return {
      title: {
        text: chartData.title,
        left: 'center',
        textStyle: {
          fontSize: mobile ? 14 : 16,
          fontWeight: 'bold'
        },
        subtext: isStockChart ?
          `当前: ${chartData.stockInfo.currency} ${chartData.stockInfo.currentPrice.toFixed(2)} (${chartData.stockInfo.priceChangePercent}%)` :
          undefined,
        subtextStyle: {
          color: isStockChart ? (chartData.stockInfo.isUp ? '#00da3c' : '#ec0000') : undefined,
          fontSize: mobile ? 10 : 12
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          if (params && params.length > 0) {
            const value = params[0].value;
            const date = params[0].axisValue;
            return `${date}<br/>价格: ${chartData.stockInfo?.currency || ''} ${value.toFixed(2)}`;
          }
          return '';
        },
        textStyle: {
          fontSize: mobile ? 12 : 14
        }
      },
      grid: {
        left: mobile ? '8%' : '3%',
        right: mobile ? '8%' : '4%',
        bottom: mobile ? '8%' : '3%',
        top: mobile ? '20%' : '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: chartData.xAxis,
        axisLabel: {
          fontSize: mobile ? 10 : 12,
          rotate: mobile ? 45 : 0,
          interval: mobile ? 'auto' : 0
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: mobile ? 10 : 12,
          formatter: isStockChart ?
            (value) => mobile ?
              `${value.toFixed(0)}` :
              `${chartData.stockInfo?.currency || ''} ${value.toFixed(2)}` :
            undefined
        }
      },
      series: [{
        data: chartData.yAxis,
        type: 'line',
        smooth: true,
        lineStyle: {
          color: lineColor,
          width: mobile ? 3 : 2
        },
        itemStyle: {
          color: lineColor,
          borderWidth: mobile ? 2 : 1,
          borderColor: '#fff'
        },
        symbol: mobile ? 'circle' : 'none',
        symbolSize: mobile ? 6 : 4,
        areaStyle: isStockChart ? {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: lineColor + (mobile ? '30' : '40') },
              { offset: 1, color: lineColor + '10' }
            ]
          }
        } : undefined,
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderWidth: mobile ? 3 : 2,
            shadowBlur: mobile ? 8 : 5,
            shadowColor: lineColor
          }
        }
      }]
    };
  };

  // 处理股票查询
  const handleStockRequest = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 提取股票代码
      const stockPatterns = [
        /\b(\d{3,4}\.HK)\b/i,
        /\b(\d{3,4})\b/
      ];

      let ticker = null;
      for (const pattern of stockPatterns) {
        const match = currentInput.match(pattern);
        if (match) {
          ticker = match[1];
          break;
        }
      }

      if (!ticker) {
        throw new Error('未找到有效的股票代码');
      }

      const stockData = await callStockAPI(ticker);
      const chartData = convertStockDataToChart(stockData, '1M');

      let assistantMessage = {
        role: 'assistant',
        content: '',
        isChartRequest: true,
        chartData: chartData,
        chartConfig: convertToEChartsConfig(chartData),
        stockData: stockData
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('股票查询失败:', error);
      let errorMessage = `股票查询失败: ${error.message}`;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 法律RAG API调用
  const callLawRagApi = async () => {
    if (!inputValue.trim() || isLawRagLoading || isLawMultisearchLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLawRagLoading(true);

    // 创建中止控制器
    abortControllerRef.current = new AbortController();

    try {
      const tempMessageId = Date.now().toString();
      let messageCreated = false;

      const response = await fetch('/api/law/rag/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "HKGAI-V1-Thinking-RAG-Chat",
          messages: [{ role: "user", content: currentInput }],
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        // 检查是否被中止
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsLawRagLoading(false);
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                setIsLawRagLoading(false);

                if (!messageCreated) {
                  const assistantMessage = {
                    id: tempMessageId,
                    role: 'assistant',
                    isLawRagResponse: true,
                    isStreaming: true,
                    rawContent: parsed.choices[0].delta.content,
                    content: parsed.choices[0].delta.content,
                    thinkContent: '',
                    mainContent: '',
                    searchResults: []
                  };

                  setMessages(prev => [...prev, assistantMessage]);
                  messageCreated = true;
                } else {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === tempMessageId) {
                      const newRawContent = (msg.rawContent || '') + parsed.choices[0].delta.content;

                      // 解析内容
                      const parsedContent = parseContent(newRawContent);

                      return {
                        ...msg,
                        rawContent: newRawContent,
                        content: parsedContent.mainContent || newRawContent,
                        thinkContent: parsedContent.thinkContent,
                        mainContent: parsedContent.mainContent,
                        searchResults: parsedContent.searchResults
                      };
                    }
                    return msg;
                  }));
                }
              }
            } catch (e) {
              // 忽略JSON解析错误
            }
          }
        }
      }

      // 流式响应完成，更新状态
      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId ? {
          ...msg,
          isStreaming: false
        } : msg
      ));

    } catch (error) {
      console.error('法律RAG API调用失败:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 法律咨询服务暂时不可用: ${error.message}`,
        isError: true
      }]);
    } finally {
      setIsLawRagLoading(false);
      abortControllerRef.current = null; // 清理 AbortController
    }
  };

  // 法律多源检索API调用
  const callLawMultisearchApi = async () => {
    if (!inputValue.trim() || isLawRagLoading || isLawMultisearchLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLawMultisearchLoading(true);

    // 创建中止控制器
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/law/multisearch/multisearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentInput,
          generate_overview: false,
          streaming: false,
          recalls: { hk_ordinance: {}, hk_case: {}, google: {} }
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let searchResults = [];

      if (data.results?.reference && Array.isArray(data.results.reference)) {
        searchResults = data.results.reference;
      } else if (data.reference && Array.isArray(data.reference)) {
        searchResults = data.reference;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: searchResults.length > 0 ?
          `找到 ${searchResults.length} 个相关法律资料` :
          '未找到相关法律资料',
        isLawMultisearchResponse: true,
        searchResults: searchResults,
        searchQuery: currentInput
      }]);

    } catch (error) {
      console.error('法律多源检索API调用失败:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 法律检索服务暂时不可用: ${error.message}`,
        isError: true
      }]);
    } finally {
      setIsLawMultisearchLoading(false);
      abortControllerRef.current = null; // 清理 AbortController
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedMode === 'chat') {
        sendMessage();
      } else if (selectedMode === 'stock') {
        handleStockRequest();
      } else if (selectedMode === 'law') {
        callLawRagApi();
      }
    }
  };

  return (
    <div className="App">
      <div className="chat-container">
        {/* 顶部导航栏 */}
        <div className="chat-header">
          <div className="header-left">
            <h1 className="header-title">Welcome to the testing environment</h1>
          </div>
          <div className="header-right">
            <span className="model-status">
              {selectedMode === 'chat' && (
                <>
                  {isThinkingEnabled && "🧠"} {isNetworkEnabled && "🌐"}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="messages-container">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role} ${message.isChartRequest ? 'chart-message-container' : ''}`}>
              <div className="message-content">
                {message.role === 'assistant' ? (
                  <div>
                    {/* 图表消息特殊处理 */}
                    {message.isChartRequest ? (
                      <div className="chart-message">
                        <div className="chart-header">
                          <span className="chart-icon">📊</span>
                          <span className="chart-label">股票数据可视化</span>
                        </div>

                        {/* 图表渲染 */}
                        {message.chartConfig && (
                          <ChartComponent
                            config={message.chartConfig}
                            description={message.chartData?.description}
                            chartData={message.chartData}
                          />
                        )}

                        {/* 移动端股票数据摘要 */}
                        {message.chartData?.stockInfo && window.innerWidth <= 768 && (
                          <div className="mobile-stock-summary">
                            <div className="stock-summary-row">
                              <span className="summary-label">股票代码:</span>
                              <span className="summary-value">{message.chartData.stockInfo.ticker}</span>
                            </div>
                            <div className="stock-summary-row">
                              <span className="summary-label">当前价格:</span>
                              <span className={`summary-value ${message.chartData.stockInfo.isUp ? 'price-up' : 'price-down'}`}>
                                {message.chartData.stockInfo.currency} {message.chartData.stockInfo.currentPrice.toFixed(2)}
                              </span>
                            </div>
                            <div className="stock-summary-row">
                              <span className="summary-label">涨跌幅:</span>
                              <span className={`summary-value ${message.chartData.stockInfo.isUp ? 'price-up' : 'price-down'}`}>
                                {message.chartData.stockInfo.isUp ? '↗' : '↘'} {message.chartData.stockInfo.priceChangePercent}%
                              </span>
                            </div>
                            <div className="stock-summary-row">
                              <span className="summary-label">最高价:</span>
                              <span className="summary-value">{message.chartData.stockInfo.currency} {message.chartData.stockInfo.highestPrice.toFixed(2)}</span>
                            </div>
                            <div className="stock-summary-row">
                              <span className="summary-label">最低价:</span>
                              <span className="summary-value">{message.chartData.stockInfo.currency} {message.chartData.stockInfo.lowestPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        )}

                        {/* 图表错误处理 */}
                        {message.chartError && (
                          <div className="chart-error">
                            <span className="chart-error-icon">⚠️</span>
                            {message.chartError}
                          </div>
                        )}
                      </div>
                    ) : message.isLawRagResponse ? (
                      <div className="law-rag-response">
                        <div className="law-rag-header">
                          <span className="law-rag-icon">🤖</span>
                          <span className="law-rag-label">法律RAG咨询</span>
                        </div>

                        {/* 显示思考过程 */}
                        {message.thinkContent && isThinkingEnabled && (
                          <div className="think-content">
                            <div className="think-header">
                              <span className="think-icon">🤔</span>
                              <span className="think-label">思考过程</span>
                            </div>
                            <div className="think-text">
                              <ReactMarkdown>{message.thinkContent}</ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* 显示搜索结果引用信息 */}
                        {message.searchResults && message.searchResults.length > 0 && (
                          <div className="rag-references" style={{ marginBottom: '20px' }}>
                            <div className="references-header">📚 引用来源 ({message.searchResults.length})</div>
                            <div className="references-list">
                              {message.searchResults.map((result, index) => (
                                <div key={index} id={`citation-${result.id}`} className="reference-item">
                                  <div className="reference-title">
                                    <span className="citation-number">[{result.id}]</span>
                                    {result.title}
                                  </div>
                                  <div className="reference-snippet">{result.snippet}</div>
                                  <div className="reference-meta">
                                    <span className="reference-source">📄 来源: {result.source}</span>
                                    {result.score && (
                                      <span className="reference-score">📊 相关度: {(result.score * 100).toFixed(1)}%</span>
                                    )}
                                  </div>
                                  {result.url && result.url.trim() && (
                                    <div className="reference-link-container">
                                      <span className="link-label">🔗 链接：</span>
                                      <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="reference-link"
                                        style={{
                                          color: '#1976d2',
                                          textDecoration: 'underline',
                                          wordBreak: 'break-all'
                                        }}
                                      >
                                        {result.url}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 主要内容显示 */}
                        {message.mainContent && (
                          <div className="law-rag-content" data-streaming={message.isStreaming}>
                            <MarkdownWithCitations searchResults={message.searchResults || []}>
                              {message.mainContent}
                            </MarkdownWithCitations>
                          </div>
                        )}

                        {/* 兼容旧格式 */}
                        {!message.thinkContent && !message.mainContent && message.content && (
                          <div className="law-rag-content" data-streaming={message.isStreaming}>
                            <MarkdownWithCitations searchResults={message.searchResults || []}>
                              {message.content}
                            </MarkdownWithCitations>
                          </div>
                        )}
                      </div>
                    ) : message.isLawMultisearchResponse ? (
                      <div className="law-multisearch-response">
                        <div className="law-multisearch-header">
                          <span className="law-multisearch-icon">🔍</span>
                          <span className="law-multisearch-label">法律检索结果</span>
                        </div>
                        <div className="law-multisearch-content">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>

                        {/* 显示检索结果 */}
                        {message.searchResults && message.searchResults.length > 0 && (
                          <div className="law-search-results">
                            <div className="search-results-header">📚 检索结果 ({message.searchResults.length})</div>
                            <div className="search-results-list">
                              {message.searchResults.map((result, resultIndex) => (
                                <div key={resultIndex} className="search-result-item">
                                  <div className="result-title">{result.title || `结果 ${resultIndex + 1}`}</div>
                                  <div className="result-snippet">{result.snippet || result.content}</div>
                                  <div className="result-meta">
                                    {result.source && <span className="result-source">📄 来源: {result.source}</span>}
                                    {result.score && <span className="result-score">📊 相关度: {(result.score * 100).toFixed(1)}%</span>}
                                  </div>
                                  {(result.link || result.url) && (
                                    <div className="result-link-container">
                                      <span className="link-label">🔗 链接：</span>
                                      <a href={result.link || result.url} target="_blank" rel="noopener noreferrer" className="result-link">
                                        {result.link || result.url}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : message.isRagResponse ? (
                      <div className="rag-response">
                        <div className="rag-header">
                          <span className="rag-icon">🔍</span>
                          <span className="rag-label">RAG查询结果</span>
                        </div>
                        <div className="rag-content" data-streaming={message.isStreaming}>
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>

                        {/* TTFT 时间显示 */}
                        {message.ttft && (
                          <div className="rag-timing">
                            <span className="timing-label">⚡ TTFT (首个响应):</span>
                            <span className="timing-value">{message.ttft}ms</span>
                          </div>
                        )}

                        {/* 兼容旧的 requestTime 显示 */}
                        {!message.ttft && message.requestTime && (
                          <div className="rag-timing">
                            <span className="timing-label">⏱️ 查询耗时:</span>
                            <span className="timing-value">{message.requestTime}ms</span>
                          </div>
                        )}

                        {/* 只显示参考资料 */}
                        {message.ragResponse && message.ragResponse.reference && message.ragResponse.reference.length > 0 && (
                          <div className="rag-references">
                            <div className="references-header">📚 参考资料 ({message.ragResponse.reference.length})</div>
                            <div className="references-list">
                              {message.ragResponse.reference.map((ref, index) => (
                                <div key={index} className="reference-item">
                                  <div className="reference-title">{ref.title || `参考资料 ${index + 1}`}</div>
                                  <div className="reference-snippet">{ref.snippet}</div>
                                  <div className="reference-meta">
                                    {ref.source && <span className="reference-source">� {ref.source}</span>}
                                    {ref.score && <span className="reference-score">📊 {(ref.score * 100).toFixed(1)}%</span>}
                                    {ref.recalls && <span className="reference-recalls">🔍 {ref.recalls}</span>}
                                  </div>
                                  {ref.link && (
                                    <div className="reference-link-container">
                                      <span className="link-label">🔗 链接：</span>
                                      <a href={ref.link} target="_blank" rel="noopener noreferrer" className="reference-link">
                                        {ref.link}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {/* Think内容显示 */}
                        {message.thinkContent && (
                          <div className="think-content">
                            <div className="think-header">
                              <span className="think-icon">🤔</span>
                              <span className="think-label">思考过程</span>
                            </div>
                            <div className="think-text">
                              <ReactMarkdown>{message.thinkContent}</ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* 显示搜索结果引用信息 - 移到最前面 */}
                        {message.searchResults && message.searchResults.length > 0 && (
                          <div className="rag-references" style={{ marginBottom: '20px' }}>
                            <div className="references-header">📚 引用来源 ({message.searchResults.length})</div>
                            <div className="references-list">
                              {message.searchResults.map((result, index) => (
                                <div key={index} id={`citation-${result.id}`} className="reference-item">
                                  <div className="reference-title">
                                    <span className="citation-number">[{result.id}]</span>
                                    {result.title}
                                  </div>
                                  <div className="reference-snippet">{result.snippet}</div>
                                  <div className="reference-meta">
                                    <span className="reference-source">📄 来源: {result.source}</span>
                                    {result.score && (
                                      <span className="reference-score">📊 相关度: {(result.score * 100).toFixed(1)}%</span>
                                    )}
                                  </div>
                                  {result.url && result.url.trim() && (
                                    <div className="reference-link-container">
                                      <span className="link-label">🔗 链接：</span>
                                      <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="reference-link"
                                        style={{
                                          color: '#1976d2',
                                          textDecoration: 'underline',
                                          wordBreak: 'break-all'
                                        }}
                                      >
                                        {result.url}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 主要内容显示 */}
                        {message.mainContent && (
                          <div className="main-content compact">
                            <MarkdownWithCitations searchResults={message.searchResults || []}>
                              {message.mainContent}
                            </MarkdownWithCitations>
                          </div>
                        )}

                        {/* 兼容旧格式 */}
                        {!message.thinkContent && !message.mainContent && message.content && (
                          <div className="main-content compact">
                            <MarkdownWithCitations searchResults={message.searchResults || []}>
                              {message.content}
                            </MarkdownWithCitations>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  // 用户消息
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}



          {/* 普通AI加载状态提示 - 只在没有任何回复内容时显示 */}
          {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' &&
           !messages[messages.length - 1].thinkContent && !messages[messages.length - 1].mainContent &&
           !messages[messages.length - 1].content && !messages[messages.length - 1].isRagResponse && (
            <div className="message assistant">
              <div className="message-content">
                <div className="loading-indicator">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">正在思考中...</span>
                </div>
              </div>
            </div>
          )}

          {/* RAG查询加载状态提示 */}
          {isRagLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="rag-loading-indicator">
                  <div className="rag-loading-header">
                    <span className="rag-loading-icon">🔍</span>
                    <span className="rag-loading-label">RAG查询中</span>
                  </div>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">正在搜索相关信息...</span>
                </div>
              </div>
            </div>
          )}

          {/* 法律RAG加载状态提示 */}
          {isLawRagLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="rag-loading-indicator">
                  <div className="rag-loading-header">
                    <span className="rag-loading-icon">⚖️</span>
                    <span className="rag-loading-label">法律RAG咨询中</span>
                  </div>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">正在分析法律问题...</span>
                </div>
              </div>
            </div>
          )}

          {/* 法律多源检索加载状态提示 */}
          {isLawMultisearchLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="rag-loading-indicator">
                  <div className="rag-loading-header">
                    <span className="rag-loading-icon">🔍</span>
                    <span className="rag-loading-label">法律多源检索中</span>
                  </div>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">正在检索法律资料...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>



        {/* 底部输入区域 */}
        <div className="unified-input-container">
          <div className="input-wrapper">
            {/* 模式选择器 */}
            <div className="mode-selector">
              <button
                className={`mode-btn ${selectedMode === 'chat' ? 'active' : ''}`}
                onClick={() => setSelectedMode('chat')}
              >
                💬 聊天
              </button>
              <button
                className={`mode-btn ${selectedMode === 'stock' ? 'active' : ''}`}
                onClick={() => setSelectedMode('stock')}
              >
                📈 股票
              </button>
              <button
                className={`mode-btn ${selectedMode === 'law' ? 'active' : ''}`}
                onClick={() => setSelectedMode('law')}
              >
                ⚖️ 法律
              </button>
            </div>

            {/* 聊天模式的功能控制按钮 - 放在模式选择器下方 */}
            {selectedMode === 'chat' && (
              <div className="chat-controls">
                <button
                  className={`control-btn ${isThinkingEnabled ? 'active' : ''}`}
                  onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                  title={isThinkingEnabled ? "关闭思考模式" : "开启思考模式 - 显示AI的思考过程"}
                >
                  🧠<span className="btn-text"> 思考</span>
                </button>
                <button
                  className={`control-btn ${isNetworkEnabled ? 'active' : ''}`}
                  onClick={() => setIsNetworkEnabled(!isNetworkEnabled)}
                  title={isNetworkEnabled ? "关闭联网模式" : "开启联网模式 - 获取实时信息"}
                >
                  🌐<span className="btn-text"> 联网</span>
                </button>
              </div>
            )}

            {/* 输入框和按钮区域 */}
            <div className="input-container-wrapper">

              <div className="input-area">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedMode === 'chat' ? "有什么可以帮您的吗？" :
                    selectedMode === 'stock' ? "输入股票代码查看走势：700, 0700, 700.HK..." :
                    "请描述您的法律问题"
                  }
                  disabled={isLoading || isRagLoading || isLawRagLoading || isLawMultisearchLoading}
                />

              {/* 发送按钮组 */}
              <div className="button-group">
                {selectedMode === 'chat' && (
                  <>
                    {(isLoading || isRagLoading) ? (
                      <button
                        onClick={stopStreaming}
                        className="send-btn stop"
                      >
                        ⏹️ 停止
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={sendMessage}
                          disabled={!inputValue.trim()}
                          className="send-btn primary"
                        >
                          RAG
                        </button>
                        <button
                          onClick={callRagApi}
                          disabled={!inputValue.trim()}
                          className="send-btn secondary"
                        >
                          Multisearch
                        </button>
                      </>
                    )}
                  </>
                )}

                {selectedMode === 'stock' && (
                  <button
                    onClick={handleStockRequest}
                    disabled={isLoading || !inputValue.trim()}
                    className="send-btn primary"
                  >
                    {isLoading ? '查询中...' : '查询'}
                  </button>
                )}

                {selectedMode === 'law' && (
                  <>
                    {(isLawRagLoading || isLawMultisearchLoading) ? (
                      <button
                        onClick={stopStreaming}
                        className="send-btn stop"
                      >
                        ⏹️ 停止
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={callLawRagApi}
                          disabled={!inputValue.trim()}
                          className="send-btn primary"
                        >
                          RAG
                        </button>
                        <button
                          onClick={callLawMultisearchApi}
                          disabled={!inputValue.trim()}
                          className="send-btn secondary"
                        >
                          Multisearch
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
