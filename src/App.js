import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { callOpenAI } from './api';
import NewChatInterface from './NewChatInterface';
import LawChatInterface from './LawChatInterface';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isNetworkEnabled, setIsNetworkEnabled] = useState(true); // 联网模式
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(true); // 思考模式
  const [isLoading, setIsLoading] = useState(false);
  const [isRagLoading, setIsRagLoading] = useState(false); // RAG接口加载状态
  const [isNewInterface, setIsNewInterface] = useState(false); // 界面切换状态
  const [isLawInterface, setIsLawInterface] = useState(false); // Law界面切换状态
  const messagesEndRef = useRef(null);

  // 界面切换函数11
  const toggleInterface = () => {
    setIsNewInterface(!isNewInterface);
    setIsLawInterface(false); // 确保law界面关闭
  };

  // law界面切换函数
  const toggleLawInterface = () => {
    setIsLawInterface(!isLawInterface);
    setIsNewInterface(false); // 确保fin界面关闭
  };

  // 返回主界面函数
  const returnToMainInterface = () => {
    setIsNewInterface(false);
    setIsLawInterface(false);
  };

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
      const response = await callOpenAI(getModelName(), currentInput);

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
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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

          // 添加调试信息
          console.log(`处理引用标记 [citation:${citationId}]:`, {
            找到结果: !!result,
            结果详情: result ? { id: result.id, title: result.title, hasUrl: !!result.url } : null,
            searchResults总数: searchResults.length
          });

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

    // 输出请求参数到控制台
    console.log('RAG API 请求参数:', requestParams);

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
        body: JSON.stringify(requestParams)
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
                console.log('TTFT:', ttft + 'ms');
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
    }
  };

  return (
    <div className="App">
      <div className="interface-container">
        <div className={`interface-slide ${!isNewInterface && !isLawInterface ? 'active' : 'slide-left'}`}>
          <div className="chat-container">
            <div className="chat-header">
              <h1>测试Demo界面</h1>
              <div className="model-controls">
                <div className="interface-buttons">
                  <button
                    className="interface-toggle"
                    onClick={toggleInterface}
                    title="切换到Fin测试界面"
                  >
                    <span className="toggle-icon">🔄</span>
                    Fin测试界面
                  </button>
                  <button
                    className="interface-toggle law-toggle"
                    onClick={toggleLawInterface}
                    title="切换到law测试界面"
                  >
                    <span className="toggle-icon">⚖️</span>
                    law测试界面
                  </button>
                </div>
                <div className="model-name">
                  <span className="model-label">HKGAI-V1</span>
                  <span className="model-status">
                    {isThinkingEnabled && "🧠"} {isNetworkEnabled && "🌐"}
                  </span>
                </div>
                <div className="control-buttons">
                  <button
                    className={`control-btn ${isThinkingEnabled ? 'active' : ''}`}
                    onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                    title="思考模式"
                  >
                    🧠 思考
                  </button>
                  <button
                    className={`control-btn ${isNetworkEnabled ? 'active' : ''}`}
                    onClick={() => setIsNetworkEnabled(!isNetworkEnabled)}
                    title="联网模式"
                  >
                    🌐 联网
                  </button>
                </div>
              </div>
            </div>

        <div className="messages-container">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                {message.role === 'assistant' ? (
                  <div>
                    {/* OneAPI Loading状态显示 */}
                    {message.isLoading ? (
                      <div className="rag-response">
                        <div className="rag-header">
                          <span className="rag-icon">🤖</span>
                          <span className="rag-label">HKGAI-V1</span>
                        </div>
                        <div className="rag-content" data-streaming={message.isStreaming}>
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
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
                              {message.searchResults.map((result, refIndex) => {
                                console.log('显示搜索结果:', result); // 调试信息
                                return (
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
                                    {/* 调试信息 */}
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                      调试: URL = "{result.url}", 长度 = {result.url ? result.url.length : 0}
                                    </div>
                                  </div>
                                );
                              })}
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

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题..."
            disabled={isLoading || isRagLoading}
            rows="3"
          />
          <div className="button-group">
            <button onClick={sendMessage} disabled={isLoading || isRagLoading || !inputValue.trim()}>
              {isLoading ? '发送中...' : 'rag'}
            </button>
            <button
              onClick={callRagApi}
              disabled={isLoading || isRagLoading || !inputValue.trim()}
              className="rag-button"
            >
              {isRagLoading ? '查询中...' : 'multisearch'}
            </button>
          </div>
            </div>
          </div>
        </div>

        <div className={`interface-slide ${isNewInterface && !isLawInterface ? 'active' : 'slide-right'}`}>
          <NewChatInterface onToggleInterface={returnToMainInterface} />
        </div>

        <div className={`interface-slide ${isLawInterface ? 'active' : 'slide-right'}`}>
          <LawChatInterface onToggleInterface={returnToMainInterface} />
        </div>
      </div>
    </div>
  );
}

export default App;
