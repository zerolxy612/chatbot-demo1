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
  const [selectedVersion, setSelectedVersion] = useState('v2'); // 'v1', 'v2'
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null); // 用于控制流式输出的中止

  // 检查是否有正在进行的法律RAG流式响应
  const hasActiveLawRagStreaming = () => {
    return messages.some(msg =>
      msg.role === 'assistant' &&
      msg.isLawRagResponse &&
      msg.isStreaming === true
    );
  };

  // 检查是否有正在进行的普通聊天流式响应
  const hasActiveChatStreaming = () => {
    return messages.some(msg =>
      msg.role === 'assistant' &&
      !msg.isLawRagResponse &&
      !msg.isRagResponse &&
      !msg.isLawMultisearchResponse &&
      msg.isStreaming === true
    );
  };

  // 根据版本和开关状态生成模型名称
  const getModelName = () => {
    // V1和V2都根据开关状态切换，只是使用不同的API密钥
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

      // 更新所有正在流式输出的消息状态
      setMessages(prev => prev.map((msg) => {
        if (msg.role === 'assistant' && msg.isStreaming) {
          // 根据消息类型提供不同的中断提示
          let interruptMessage = '回答被中断';
          if (msg.isLawRagResponse) {
            interruptMessage = '法律咨询回答被用户中断';
          } else if (msg.isRagResponse) {
            interruptMessage = 'RAG查询被用户中断';
          }

          return {
            ...msg,
            isStreaming: false,
            content: msg.content || msg.mainContent || interruptMessage,
            mainContent: msg.mainContent || msg.content || interruptMessage
          };
        }
        return msg;
      }));
    }
  };



  // 流式搜索结果解析器 - 使用状态机处理 <search_results> 区间
  const createSearchResultsParser = () => {
    let state = 'OUTSIDE'; // 'OUTSIDE' | 'INSIDE' | 'COMPLETE'
    let buffer = '';
    let searchResults = new Map(); // 使用 Map 以 doc_index 为 key 去重

    // 解码Unicode字符的函数
    const decodeText = (text) => {
      if (!text) return text;
      return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });
    };

    // 处理单个搜索结果JSON对象
    const processSearchResult = (jsonStr) => {
      try {
        // 第一层解析：解析转义后的JSON字符串
        const unescapedJson = JSON.parse(jsonStr);

        // 第二层解析：解析真正的搜索结果对象
        if (typeof unescapedJson === 'string') {
          const result = JSON.parse(unescapedJson);
          if (result && result.doc_index) {
            searchResults.set(result.doc_index, {
              id: result.doc_index,
              title: decodeText(result.title) || '搜索结果',
              snippet: decodeText(result.snippet || result.result) || '',
              url: result.url || '',
              source: decodeText(result.source || result.kb) || 'Unknown',
              score: result.score || 0
            });

          }
        } else if (unescapedJson && unescapedJson.doc_index) {
          // 直接是对象的情况
          searchResults.set(unescapedJson.doc_index, {
            id: unescapedJson.doc_index,
            title: decodeText(unescapedJson.title) || '搜索结果',
            snippet: decodeText(unescapedJson.snippet || unescapedJson.result) || '',
            url: unescapedJson.url || '',
            source: decodeText(unescapedJson.source || unescapedJson.kb) || 'Unknown',
            score: unescapedJson.score || 0
          });

        }
      } catch (e) {
        console.warn('❌ 解析搜索结果失败:', e.message, '原始JSON:', jsonStr.substring(0, 100));
      }
    };

    // 尝试从缓冲区中提取完整的JSON对象
    const extractJsonObjects = () => {
      let startIndex = 0;

      while (startIndex < buffer.length) {
        // 查找下一个 JSON 对象的开始
        const jsonStart = buffer.indexOf('{', startIndex);
        if (jsonStart === -1) break;

        // 使用括号匹配找到完整的JSON对象
        let braceCount = 0;
        let jsonEnd = -1;
        let inString = false;
        let escaped = false;

        for (let i = jsonStart; i < buffer.length; i++) {
          const char = buffer[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\' && inString) {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i;
                break;
              }
            }
          }
        }

        if (jsonEnd !== -1) {
          // 找到完整的JSON对象
          const jsonStr = buffer.substring(jsonStart, jsonEnd + 1);
          processSearchResult(jsonStr);
          startIndex = jsonEnd + 1;
        } else {
          // 没有找到完整的JSON对象，等待更多数据
          break;
        }
      }

      // 清理已处理的部分
      if (startIndex > 0) {
        buffer = buffer.substring(startIndex);
      }
    };

    return {
      // 添加新的内容片段
      addContent: (content) => {
        if (state === 'COMPLETE') return;

        let remainingContent = content;

        // 循环处理，直到没有更多的搜索结果标签
        while (remainingContent && state !== 'COMPLETE') {
          if (state === 'OUTSIDE') {
            // 查找搜索结果开始标签
            const startTagIndex = remainingContent.indexOf('<search_results>');
            if (startTagIndex !== -1) {
              state = 'INSIDE';
              const afterStartTag = startTagIndex + '<search_results>'.length;
              remainingContent = remainingContent.substring(afterStartTag);

              continue; // 继续处理剩余内容
            } else {
              break; // 没有开始标签，退出循环
            }
          } else if (state === 'INSIDE') {
            // 查找搜索结果结束标签
            const endTagIndex = remainingContent.indexOf('</search_results>');
            if (endTagIndex !== -1) {
              // 添加结束标签之前的内容到缓冲区
              buffer += remainingContent.substring(0, endTagIndex);
              state = 'COMPLETE';


              // 处理缓冲区中的所有JSON对象
              extractJsonObjects();

              // 更新剩余内容（结束标签之后的部分）
              remainingContent = remainingContent.substring(endTagIndex + '</search_results>'.length);

              // 如果还有剩余内容，可能包含新的搜索结果区间
              if (remainingContent.includes('<search_results>')) {
                state = 'OUTSIDE'; // 重置状态，准备处理下一个搜索结果区间
                continue;
              } else {
                break; // 没有更多搜索结果，退出循环
              }
            } else {
              // 没有结束标签，将所有内容添加到缓冲区
              buffer += remainingContent;
              break; // 等待更多数据
            }
          }
        }

        // 如果在搜索结果区间内，尝试提取JSON对象
        if (state === 'INSIDE') {
          extractJsonObjects();
        }
      },

      // 获取当前解析出的搜索结果
      getResults: () => {
        // 按 doc_index 排序返回
        return Array.from(searchResults.values()).sort((a, b) => a.id - b.id);
      },

      // 获取解析状态
      getState: () => state,

      // 重置解析器
      reset: () => {
        state = 'OUTSIDE';
        buffer = '';
        searchResults.clear();
      }
    };
  };

  // 兼容旧版本的 extractSearchResults 函数（用于非流式场景）
  const extractSearchResults = (content) => {
    const parser = createSearchResultsParser();
    parser.addContent(content);
    return parser.getResults();
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

  // 使用流式解析器的内容解析函数
  const parseContentWithParser = (content, searchResultsParser) => {
    // 从解析器获取搜索结果
    const searchResults = searchResultsParser.getResults();

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
      const response = await callOpenAI(getModelName(), currentInput, abortControllerRef.current.signal, selectedVersion);

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

      let sseBuffer = ''; // SSE缓冲区，处理跨read()的半行问题

      while (true) {
        // 检查是否被中止
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // 将新数据添加到缓冲区
        sseBuffer += decoder.decode(value, { stream: true });

        // 按SSE规范处理事件边界（\n\n分隔事件，\n分隔行）
        const events = sseBuffer.split('\n\n');

        // 保留最后一个可能不完整的事件
        sseBuffer = events.pop() || '';

        // 处理完整的事件
        for (const event of events) {
          if (!event.trim()) continue;

          // 处理事件中的多条data行
          const lines = event.split('\n');
          let eventData = '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
              // 提取data内容，处理可能的前缀空格
              const dataContent = trimmedLine.slice(5).trim();
              if (dataContent === '[DONE]') {
                break;
              }
              // 多条data行需要拼接
              eventData += dataContent;
            }
          }

          // 解析拼接后的完整JSON
          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
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
              console.warn('❌ 普通聊天SSE JSON解析失败:', e.message, '原始数据:', eventData.substring(0, 100));
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
  const MarkdownWithCitations = ({ children, searchResults = [], messageIndex }) => {
    // 处理引用点击
    const handleCitationClick = (citationId) => {
      const result = searchResults.find(r => r.id === citationId);

      // 构建唯一的引用元素ID，包含消息索引
      const uniqueRefId = `citation-${messageIndex}-${citationId}`;
      const refElement = document.getElementById(uniqueRefId);

      if (result && result.url) {
        // 如果有URL，先打开URL，然后滚动到对应的引用信息
        window.open(result.url, '_blank');
        if (refElement) {
          refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          refElement.style.backgroundColor = '#fff3cd';
          setTimeout(() => {
            refElement.style.backgroundColor = '';
          }, 2000);
        }
      } else {
        // 如果没有URL，只滚动到引用信息
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
    const processContent = (content) => {
      // 处理数组情况（ReactMarkdown的children可能是数组）
      if (Array.isArray(content)) {
        return content.map((item) => {
          if (typeof item === 'string') {
            return processContent(item);
          }
          return item;
        });
      }

      // 处理非字符串情况
      if (typeof content !== 'string') {
        return content;
      }

      // 先解码Unicode字符
      let text = content.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });

      // 检查是否包含引用标记
      if (!text.includes('[citation:')) {
        return text;
      }

      // 分割文本，保留引用标记
      const parts = text.split(/(\[citation:\d+\])/g);

      return parts.map((part, index) => {
        const citationMatch = part.match(/\[citation:(\d+)\]/);
        if (citationMatch) {
          const citationId = parseInt(citationMatch[1]);
          const result = searchResults.find(r => r.id === citationId);

          return (
            <sup
              key={`citation-${index}-${citationId}`}
              className="citation-link"
              title={result ? `${result.title} - ${result.source}` : `引用来源 ${citationId}`}
              onClick={() => handleCitationClick(citationId)}
              style={{
                color: result ? '#1976d2' : '#666',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '0.8em',
                marginLeft: '2px',
                fontWeight: 'bold',
                opacity: result ? 1 : 0.7
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
            // 处理段落
            p: ({ children }) => <p>{processContent(children)}</p>,
            // 处理列表项
            li: ({ children }) => <li>{processContent(children)}</li>,
            // 处理标题
            h1: ({ children }) => <h1>{processContent(children)}</h1>,
            h2: ({ children }) => <h2>{processContent(children)}</h2>,
            h3: ({ children }) => <h3>{processContent(children)}</h3>,
            h4: ({ children }) => <h4>{processContent(children)}</h4>,
            h5: ({ children }) => <h5>{processContent(children)}</h5>,
            h6: ({ children }) => <h6>{processContent(children)}</h6>,
            // 处理强调和加粗
            em: ({ children }) => <em>{processContent(children)}</em>,
            strong: ({ children }) => <strong>{processContent(children)}</strong>,
            // 处理其他可能包含文本的元素
            span: ({ children }) => <span>{processContent(children)}</span>,
            div: ({ children }) => <div>{processContent(children)}</div>,
            // 处理引用块
            blockquote: ({ children }) => <blockquote>{processContent(children)}</blockquote>,
            // 处理表格单元格
            td: ({ children }) => <td>{processContent(children)}</td>,
            th: ({ children }) => <th>{processContent(children)}</th>
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
        },
        // 为股票图表设置纵轴范围为最低点和最高点，突出显示波动
        min: isStockChart ? (() => {
          const minValue = chartData.stockInfo.lowestPrice;
          const maxValue = chartData.stockInfo.highestPrice;
          const range = maxValue - minValue;
          // 在最低点基础上留出5%的缓冲空间
          return Math.max(0, minValue - range * 0.05);
        })() : undefined,
        max: isStockChart ? (() => {
          const minValue = chartData.stockInfo.lowestPrice;
          const maxValue = chartData.stockInfo.highestPrice;
          const range = maxValue - minValue;
          // 在最高点基础上留出5%的缓冲空间
          return maxValue + range * 0.05;
        })() : undefined
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

      // 创建搜索结果解析器
      const searchResultsParser = createSearchResultsParser();

      const response = await fetch('/api/law/rag/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "HKGAI-V1-Thinking-RAG-Legal-Chat",
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
      let sseBuffer = ''; // SSE缓冲区，处理跨read()的半行问题

      while (true) {
        // 检查是否被中止
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // 将新数据添加到缓冲区
        sseBuffer += decoder.decode(value, { stream: true });

        // 按SSE规范处理事件边界（\n\n分隔事件，\n分隔行）
        const events = sseBuffer.split('\n\n');

        // 保留最后一个可能不完整的事件
        sseBuffer = events.pop() || '';

        // 处理完整的事件
        for (const event of events) {
          if (!event.trim()) continue;

          // 处理事件中的多条data行
          const lines = event.split('\n');
          let eventData = '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
              // 提取data内容，处理可能的前缀空格
              const dataContent = trimmedLine.slice(5).trim();
              if (dataContent === '[DONE]') {
                setIsLawRagLoading(false);
                break;
              }
              // 多条data行需要拼接
              eventData += dataContent;
            }
          }

          // 解析拼接后的完整JSON
          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
              if (parsed.choices?.[0]?.delta?.content) {
                const deltaContent = parsed.choices[0].delta.content;

                // 一旦开始接收内容，立即清除加载状态
                setIsLawRagLoading(false);

                // 将新内容添加到搜索结果解析器
                searchResultsParser.addContent(deltaContent);

                if (!messageCreated) {
                  const assistantMessage = {
                    id: tempMessageId,
                    role: 'assistant',
                    isLawRagResponse: true,
                    isStreaming: true,
                    rawContent: deltaContent,
                    content: deltaContent,
                    thinkContent: '',
                    mainContent: '',
                    searchResults: searchResultsParser.getResults()
                  };

                  setMessages(prev => [...prev, assistantMessage]);
                  messageCreated = true;
                } else {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === tempMessageId) {
                      const newRawContent = (msg.rawContent || '') + deltaContent;

                      // 解析内容（使用改进的解析逻辑）
                      const parsedContent = parseContentWithParser(newRawContent, searchResultsParser);

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
              console.warn('❌ SSE JSON解析失败:', e.message, '原始数据:', eventData.substring(0, 100));
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

      // 检查是否是用户主动中断
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        // 用户主动停止，不显示错误消息，让stopStreaming函数处理
        console.log('法律RAG流式响应被用户中断');
      } else {
        // 真正的错误才显示错误消息
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ 法律咨询服务暂时不可用: ${error.message}`,
          isError: true
        }]);
      }
    } finally {
      setIsLawRagLoading(false);
      abortControllerRef.current = null; // 清理 AbortController
    }
  };

  // 法律多源检索API调用 - 已移除，法律界面不再使用multisearch

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
                              {message.searchResults.map((result, refIndex) => (
                                <div key={refIndex} id={`citation-${index}-${result.id}`} className="reference-item">
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
                            <MarkdownWithCitations searchResults={message.searchResults || []} messageIndex={index}>
                              {message.mainContent}
                            </MarkdownWithCitations>
                          </div>
                        )}

                        {/* 兼容旧格式 */}
                        {!message.thinkContent && !message.mainContent && message.content && (
                          <div className="law-rag-content" data-streaming={message.isStreaming}>
                            <MarkdownWithCitations searchResults={message.searchResults || []} messageIndex={index}>
                              {message.content}
                            </MarkdownWithCitations>
                          </div>
                        )}


                      </div>
                    ) : message.isLawMultisearchResponse ? (
                      // 法律多源检索响应显示 - 已移除，法律界面不再使用
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
                          <div className="law-compact-markdown">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
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
                              {message.searchResults.map((result, refIndex) => (
                                <div key={refIndex} id={`citation-${index}-${result.id}`} className="reference-item">
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
                            <MarkdownWithCitations searchResults={message.searchResults || []} messageIndex={index}>
                              {message.mainContent}
                            </MarkdownWithCitations>
                          </div>
                        )}

                        {/* 兼容旧格式 */}
                        {!message.thinkContent && !message.mainContent && message.content && (
                          <div className="main-content compact">
                            <MarkdownWithCitations searchResults={message.searchResults || []} messageIndex={index}>
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

          {/* 法律RAG加载状态提示 - 只在没有活跃流式响应时显示 */}
          {isLawRagLoading && !hasActiveLawRagStreaming() && (
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



            {/* 聊天模式的功能控制按钮 - 放在版本选择器下方 */}
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
                  disabled={isLoading || isRagLoading || isLawRagLoading || isLawMultisearchLoading || hasActiveLawRagStreaming() || hasActiveChatStreaming()}
                />

              {/* 发送按钮组 */}
              <div className="button-group">
                {selectedMode === 'chat' && (
                  <>
                    {(isLoading || isRagLoading || hasActiveChatStreaming()) ? (
                      <button
                        onClick={stopStreaming}
                        className="send-btn stop"
                      >
                        ⏹️ 停止
                      </button>
                    ) : (
                      <>
                        {/* RAG按钮和版本选择器组合 */}
                        <div className="rag-button-group">
                          <button
                            onClick={sendMessage}
                            disabled={!inputValue.trim()}
                            className="send-btn primary rag-main-btn"
                          >
                            RAG
                          </button>
                          <select
                            className="version-selector-attached"
                            value={selectedVersion}
                            onChange={(e) => setSelectedVersion(e.target.value)}
                            title="选择模型版本"
                          >
                            <option value="v2">V2</option>
                            <option value="v1">V1</option>
                          </select>
                        </div>
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
                    {(isLawRagLoading || isLawMultisearchLoading || hasActiveLawRagStreaming()) ? (
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
                        {/* Multisearch按钮已移除 */}
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
