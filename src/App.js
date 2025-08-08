import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { callOpenAI } from './api';
import NewChatInterface from './NewChatInterface';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isNetworkEnabled, setIsNetworkEnabled] = useState(true); // 联网模式
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(true); // 思考模式
  const [isLoading, setIsLoading] = useState(false);
  const [isRagLoading, setIsRagLoading] = useState(false); // RAG接口加载状态
  const [isNewInterface, setIsNewInterface] = useState(false); // 界面切换状态
  const messagesEndRef = useRef(null);

  // 界面切换函数
  const toggleInterface = () => {
    setIsNewInterface(!isNewInterface);
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

  // 从搜索结果中提取引用信息
  const extractSearchResults = (content) => {
    const searchResults = [];

    // 提取 <search_results> 标签内的内容
    const searchResultsMatch = content.match(/<search_results>([\s\S]*?)<\/search_results>/);
    if (searchResultsMatch) {
      const searchData = searchResultsMatch[1].trim();
      console.log('=== SEARCH_RESULTS 前端提取的原始数据 ===');
      console.log('数据来源: https://oneapi.hkgai.net/v1/chat/completions 响应中的 <search_results> 标签');
      console.log('原始搜索数据长度:', searchData.length);
      console.log('原始搜索数据:', searchData);

      // 尝试解析并显示每个原始JSON对象
      try {
        const lines = searchData.split('\n').filter(line => line.trim());
        console.log('分割后的行数:', lines.length);
        lines.forEach((line, index) => {
          console.log(`原始行 ${index + 1}:`, line);
          try {
            const parsed = JSON.parse(line);
            console.log(`解析后的对象 ${index + 1}:`, parsed);
            console.log(`  - doc_index: ${parsed.doc_index}`);
            console.log(`  - title: ${parsed.title}`);
            console.log(`  - source: ${parsed.source}`);
            console.log(`  - url: ${parsed.url}`);
          } catch (e) {
            console.log(`行 ${index + 1} 解析失败:`, e.message);
          }
        });
      } catch (e) {
        console.log('整体解析失败:', e.message);
      }

      // 解码Unicode字符的函数
      const decodeText = (text) => {
        if (!text) return text;
        const originalText = text;
        const decodedText = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
          return String.fromCharCode(parseInt(code, 16));
        });

        // 如果有Unicode解码，打印调试信息
        if (originalText !== decodedText) {
          console.log('Unicode解码:', {
            原始: originalText.substring(0, 100) + '...',
            解码后: decodedText.substring(0, 100) + '...'
          });
        }

        return decodedText;
      };

      try {
        // 尝试解析为JSON数组
        const results = JSON.parse(`[${searchData}]`);
        if (Array.isArray(results)) {
          results.forEach(result => {
            if (result && result.doc_index) {
              console.log('=== 原始搜索结果数据 ===', {
                doc_index: result.doc_index,
                title_原始: result.title,
                snippet_原始: result.snippet || result.result,
                source_原始: result.source,
                url_原始: result.url,
                score: result.score
              });

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
        console.log('JSON数组解析失败，尝试逐行解析JSON对象');

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
          console.log('尝试正则表达式提取');

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

      console.log('=== 最终解析出的搜索结果 ===');
      console.log('搜索结果数量:', searchResults.length);
      searchResults.forEach((result, index) => {
        console.log(`结果 ${index + 1}:`, {
          id: result.id,
          title: result.title,
          snippet: result.snippet ? result.snippet.substring(0, 100) + '...' : 'N/A',
          source: result.source,
          url: result.url,
          score: result.score
        });
      });
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

    try {
      const response = await callOpenAI(getModelName(), currentInput);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = {
        role: 'assistant',
        content: '',
        rawContent: '',
        thinkContent: '',
        mainContent: '',
        searchResults: []
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
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

                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
      }
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

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        isError: true
      }]);
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
        <div className={`interface-slide ${!isNewInterface ? 'active' : 'slide-left'}`}>
          <div className="chat-container">
            <div className="chat-header">
              <h1>测试Demo界面</h1>
              <div className="model-controls">
                <div className="model-name">
                  <span className="model-label">HKGAI-V1</span>
                  <span className="model-status">
                    {isThinkingEnabled && "🧠"} {isNetworkEnabled && "🌐"}
                  </span>
                </div>
                <div className="control-buttons">
                  <button
                    className="interface-toggle"
                    onClick={toggleInterface}
                    title="切换到Fin测试界面"
                  >
                    <span className="toggle-icon">🔄</span>
                    Fin测试界面
                  </button>
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
                    {/* RAG响应特殊显示 */}
                    {message.isRagResponse ? (
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
                              {message.searchResults.map((result, index) => {
                                console.log('显示搜索结果:', result); // 调试信息
                                return (
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

        <div className={`interface-slide ${isNewInterface ? 'active' : 'slide-right'}`}>
          <NewChatInterface onToggleInterface={toggleInterface} />
        </div>
      </div>
    </div>
  );
}

export default App;
