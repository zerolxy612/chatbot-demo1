import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// 自定义ReactMarkdown组件，处理引用链接（参考主界面实现）
const LawMarkdownWithCitations = ({ children, searchResults = [] }) => {
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
        console.log(`法律界面 - 处理引用标记 [citation:${citationId}]:`, {
          找到结果: !!result,
          结果详情: result ? { id: result.id, title: result.title, hasUrl: !!result.url } : null,
          searchResults总数: searchResults.length
        });

        return (
          <sup
            key={`law-citation-${index}-${citationId}`}
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



// 解码Unicode字符
const decodeLawUnicodeContent = (content) => {
  try {
    // 解码 \uXXXX 格式的Unicode字符
    return content.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  } catch (error) {
    console.warn('法律RAG - Unicode解码失败:', error);
    return content;
  }
};

// 过滤法律RAG主要内容
const filterLawMainContent = (content) => {
  // 先解码Unicode字符
  content = decodeLawUnicodeContent(content);

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

  // 移除最外层的代码块标记（包括语言标识符）
  content = content.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/g, '');

  // 移除所有剩余的代码块标记
  content = content.replace(/```[a-zA-Z]*\n?/g, '').replace(/\n?```/g, '');

  // 清理多余的空行
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  content = content.replace(/^\s*\n/gm, '');

  return content.trim();
};

// 流式法律搜索结果解析器 - 使用状态机处理 <search_results> 区间
const createLawSearchResultsParser = () => {
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
            title: decodeText(result.title) || '法律文档',
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
          title: decodeText(unescapedJson.title) || '法律文档',
          snippet: decodeText(unescapedJson.snippet || unescapedJson.result) || '',
          url: unescapedJson.url || '',
          source: decodeText(unescapedJson.source || unescapedJson.kb) || 'Unknown',
          score: unescapedJson.score || 0
        });
      }
    } catch (e) {
      console.warn('❌ 法律RAG解析搜索结果失败:', e.message, '原始JSON:', jsonStr.substring(0, 100));
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

// 兼容旧版本的 extractLawSearchResults 函数（用于非流式场景）
const extractLawSearchResults = (content) => {
  const parser = createLawSearchResultsParser();
  parser.addContent(content);
  return parser.getResults();
};

// 使用流式解析器的法律RAG内容解析函数
const parseLawRagContentWithParser = (content, searchResultsParser) => {
  if (!content) return { thinkContent: '', mainContent: '', searchResults: [] };

  // 如果内容以 <think> 开头但还没有结束标签，暂时不显示任何内容
  if (content.startsWith('<think>') && !content.includes('</think>')) {
    return { thinkContent: '', mainContent: '', searchResults: [] };
  }

  // 从解析器获取搜索结果
  const searchResults = searchResultsParser.getResults();

  // 查找<think>标签的位置
  const thinkIndex = content.indexOf('<think>');
  if (thinkIndex === -1) {
    // 没有think标签，直接过滤其他内容
    return {
      thinkContent: '',
      mainContent: filterLawMainContent(content),
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
  const mainContent = filterLawMainContent(afterThink);

  return {
    thinkContent,
    mainContent,
    searchResults
  };
};

function LawChatInterface({ onToggleInterface }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `⚖️ **Law 测试界面**！

`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMultisearchLoading, setIsMultisearchLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 调用法律RAG API
  const callLawRagApi = async () => {
    if (!inputValue.trim() || isLoading || isStreaming || isMultisearchLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 创建临时消息ID
      const tempMessageId = Date.now().toString();
      let messageCreated = false;

      const response = await fetch('/api/law/rag/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "HKGAI-V1-Thinking-RAG-Legal-Chat",
          messages: [
            {
              role: "user",
              content: currentInput
            }
          ],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // 创建搜索结果解析器
      const searchResultsParser = createLawSearchResultsParser();
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
                // 流式传输完成，重置所有状态
                setIsLoading(false);
                setIsStreaming(false);

                // 如果消息已创建，解析最终内容
                if (messageCreated) {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === tempMessageId) {
                      const parsedContent = parseLawRagContentWithParser(msg.rawContent || '', searchResultsParser);
                      return {
                        ...msg,
                        isStreaming: false,
                        thinkContent: parsedContent.thinkContent,
                        mainContent: parsedContent.mainContent,
                        searchResults: parsedContent.searchResults,
                        content: parsedContent.mainContent
                      };
                    }
                    return msg;
                  }));
                }
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
                const deltaContent = parsed.choices[0].delta.content;

                // 第一次收到内容时结束loading状态并创建消息
                setIsLoading(false);

                // 将新内容添加到搜索结果解析器
                searchResultsParser.addContent(deltaContent);

                if (!messageCreated) {
                  // 第一次接收到内容，创建消息并设置流式状态
                  setIsStreaming(true);

                  const assistantMessage = {
                    id: tempMessageId,
                    role: 'assistant',
                    isLawRagResponse: true,
                    isStreaming: true,
                    rawContent: deltaContent,
                    thinkContent: '',
                    mainContent: '',
                    searchResults: searchResultsParser.getResults(),
                    content: ''
                  };

                  setMessages(prev => [...prev, assistantMessage]);
                  messageCreated = true;
                } else {
                  // 累积原始内容
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === tempMessageId) {
                      const newRawContent = (msg.rawContent || '') + deltaContent;
                      // 使用流式解析器解析内容
                      const parsedContent = parseLawRagContentWithParser(newRawContent, searchResultsParser);
                      return {
                        ...msg,
                        rawContent: newRawContent,
                        thinkContent: parsedContent.thinkContent,
                        mainContent: parsedContent.mainContent,
                        searchResults: parsedContent.searchResults,
                        content: parsedContent.mainContent
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

    } catch (error) {
      console.error('法律RAG API调用失败:', error);

      let errorMessage = '法律咨询服务暂时不可用，请稍后再试。';
      if (error.message.includes('404')) {
        errorMessage = '法律咨询服务未找到，请检查服务状态。';
      } else if (error.message.includes('500')) {
        errorMessage = '法律咨询服务器暂时繁忙，请稍后重试。';
      } else if (error.message.includes('network') || error.name === 'TypeError') {
        errorMessage = '网络连接异常，无法访问法律咨询服务。';
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **法律RAG服务错误**\n\n${errorMessage}\n\n**错误详情**: ${error.message}`,
        isError: true
      }]);
    } finally {
      // 确保所有状态结束（如果还没有结束的话）
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // 调用法律多源检索API
  const callLawMultisearchApi = async () => {
    if (!inputValue.trim() || isLoading || isStreaming || isMultisearchLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsMultisearchLoading(true);

    try {
      const response = await fetch('/api/law/multisearch/multisearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: currentInput,
          generate_overview: false,
          streaming: false,
          recalls: {
            legal_hk_ordinance: {},
            legal_hk_case: {},
            legal_google: {}
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // 处理检索结果
      let searchResults = [];
      if (data.results && data.results.reference && Array.isArray(data.results.reference)) {
        searchResults = data.results.reference;
      } else if (data.reference && Array.isArray(data.reference)) {
        // 兼容旧的数据格式
        searchResults = data.reference;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: searchResults.length > 0
          ? `找到 ${searchResults.length} 个相关法律资料`
          : '未找到相关法律资料',
        isLawMultisearchResponse: true,
        searchResults: searchResults,
        searchQuery: currentInput
      }]);

    } catch (error) {
      console.error('法律多源检索API调用失败:', error);

      let errorMessage = '法律检索服务暂时不可用，请稍后再试。';
      if (error.message.includes('404')) {
        errorMessage = '法律检索服务未找到，请检查服务状态。';
      } else if (error.message.includes('500')) {
        errorMessage = '法律检索服务器暂时繁忙，请稍后重试。';
      } else if (error.message.includes('network') || error.name === 'TypeError') {
        errorMessage = '网络连接异常，无法访问法律检索服务。';
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **法律多源检索服务错误**\n\n${errorMessage}\n\n**错误详情**: ${error.message}`,
        isError: true
      }]);
    } finally {
      setIsMultisearchLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 检查是否可以发送（不在loading、streaming或multisearch过程中）
      if (!isLoading && !isStreaming && !isMultisearchLoading && inputValue.trim()) {
        // 默认使用rag API
        callLawRagApi();
      }
    }
  };

  return (
    <div className="law-chat-interface">
      <div className="law-chat-header">
        <h1>Law Demo</h1>
        <div className="law-interface-controls">
          <button
            className="interface-toggle"
            onClick={onToggleInterface}
            title="返回主界面"
          >
            <span className="toggle-icon">🔄</span>
            返回主界面
          </button>
          <div className="law-interface-badge">
            <span className="badge-icon">⚖️</span>
            <span className="badge-text">Law Interface</span>
          </div>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {/* 法律RAG响应特殊处理 */}
              {message.role === 'assistant' && message.isLawRagResponse ? (
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



                  {/* 显示搜索结果引用信息 - 参考主界面格式 */}
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

                  {/* 法律RAG主要内容 - 只有在有内容时才显示 */}
                  {(message.mainContent || message.content) && (
                    <div className="law-rag-response">
                      <div className="law-rag-header">
                        <span className="law-rag-icon">🤖</span>
                        <span className="law-rag-label">法律RAG咨询</span>
                      </div>
                      <div className="law-rag-content" data-streaming={message.isStreaming}>
                        <LawMarkdownWithCitations searchResults={message.searchResults || []}>
                          {message.mainContent || message.content}
                        </LawMarkdownWithCitations>
                      </div>
                    </div>
                  )}
                </div>
              ) : message.role === 'assistant' && message.isLawMultisearchResponse ? (
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
                              {result.type && <span className="result-type">🏷️ 类型: {result.type}</span>}
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
              ) : (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="loading-indicator">
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="loading-text">法律RAG咨询中...</span>
              </div>
            </div>
          </div>
        )}

        {isMultisearchLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="loading-indicator">
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="loading-text">法律多源检索中...</span>
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
          placeholder="请描述您的法律问题"
          disabled={isLoading || isStreaming || isMultisearchLoading}
          rows="3"
        />
        <div className="button-group">
          <button
            onClick={callLawRagApi}
            disabled={isLoading || isStreaming || isMultisearchLoading || !inputValue.trim()}
            className="law-rag-button"
          >
            {isLoading || isStreaming ? '咨询中...' : 'rag'}
          </button>
          <button
            onClick={callLawMultisearchApi}
            disabled={isLoading || isStreaming || isMultisearchLoading || !inputValue.trim()}
            className="law-multisearch-button"
          >
            {isMultisearchLoading ? '检索中...' : 'multisearch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LawChatInterface;
