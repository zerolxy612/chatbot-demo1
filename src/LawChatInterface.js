import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// 自定义ReactMarkdown组件，处理引用链接（参考主界面实现）
const LawMarkdownWithCitations = ({ children, searchResults = [], messageIndex }) => {
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

// 解析法律RAG内容的函数 - 分离think内容、搜索结果和正文内容
const parseLawRagContent = (content) => {
  if (!content) return { thinkContent: '', mainContent: '', searchResults: [] };

  // 如果内容以 <think> 开头但还没有结束标签，暂时不显示任何内容
  if (content.startsWith('<think>') && !content.includes('</think>')) {
    return { thinkContent: '', mainContent: '', searchResults: [] };
  }

  // 提取搜索结果（支持不完整的标签）
  const searchResults = extractLawSearchResults(content);

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

  console.log('法律RAG - 解析结果:', {
    原始内容长度: content.length,
    thinkContent: thinkContent.length,
    mainContent: mainContent.length,
    searchResults: searchResults.length,
    原始内容前100字符: content.substring(0, 100)
  });

  return {
    thinkContent,
    mainContent,
    searchResults
  };
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

// 提取法律搜索结果的函数（参考主界面的实现）
const extractLawSearchResults = (content) => {
  const searchResults = [];

  // 解码Unicode字符的函数
  const decodeText = (text) => {
    if (!text) return text;
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  };

  // 首先尝试提取完整的 <search_results> 标签内容
  const searchResultsMatch = content.match(/<search_results>([\s\S]*?)<\/search_results>/);
  if (searchResultsMatch) {
    const searchData = searchResultsMatch[1].trim();
    console.log('法律RAG - 找到完整搜索结果数据:', searchData.substring(0, 200) + '...');

    // 检查是否是连续的JSON对象（没有换行符分隔）
    if (searchData.includes('}{')) {
      console.log('法律RAG - 检测到连续JSON对象，使用 }{ 分割...');
      const separatedJson = searchData.replace(/\}\{/g, '}\n{');
      const jsonLines = separatedJson.split('\n').filter(line => line.trim());

      jsonLines.forEach((line, index) => {
        try {
          const result = JSON.parse(line);
          if (result && result.doc_index) {
            searchResults.push({
              id: result.doc_index,
              title: decodeText(result.title) || '法律文档',
              snippet: decodeText(result.snippet || result.result) || '',
              url: result.url || '',
              source: decodeText(result.source) || 'Unknown',
              score: result.score || 0
            });
            console.log(`✅ 成功解析JSON第${index + 1}个:`, result.doc_index, decodeText(result.title));
          }
        } catch (jsonError) {
          console.warn(`❌ 解析JSON第${index + 1}个失败:`, jsonError.message);
          console.log('失败的JSON前100字符:', line.substring(0, 100));
        }
      });
    } else {
      // 尝试其他解析方法
      try {
        // 尝试解析为JSON数组
        const results = JSON.parse(`[${searchData}]`);
        if (Array.isArray(results)) {
          results.forEach(result => {
            if (result && result.doc_index) {
              searchResults.push({
                id: result.doc_index,
                title: decodeText(result.title) || '法律文档',
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
        const lines = searchData.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          try {
            const result = JSON.parse(line);
            if (result && result.doc_index) {
              searchResults.push({
                id: result.doc_index,
                title: decodeText(result.title) || '法律文档',
                snippet: decodeText(result.snippet || result.result) || '',
                url: result.url || '',
                source: decodeText(result.source) || 'Unknown',
                score: result.score || 0
              });
            }
          } catch (lineError) {
            console.warn('解析法律搜索结果行失败:', line, lineError);
          }
        });
      }
    }
  } else {
    // 如果没有找到完整的标签，尝试处理不完整的搜索结果（流式数据）
    const incompleteMatch = content.match(/<search_results>([\s\S]*?)$/);
    if (incompleteMatch) {
      const searchData = incompleteMatch[1].trim();
      console.log('法律RAG - 处理流式搜索结果数据:', searchData.substring(0, 200) + '...');

      // 方法1：尝试逐行解析JSON对象（如果有换行符）
      const lines = searchData.split('\n').filter(line => line.trim());

      if (lines.length > 1) {
        // 有换行符，按行解析
        lines.forEach(line => {
          try {
            const result = JSON.parse(line);
            if (result && result.doc_index) {
              searchResults.push({
                id: result.doc_index,
                title: decodeText(result.title) || '法律文档',
                snippet: decodeText(result.snippet || result.result) || '',
                url: result.url || '',
                source: decodeText(result.source) || 'Unknown',
                score: result.score || 0
              });
            }
          } catch (lineError) {
            console.warn('解析流式搜索结果行失败:', line, lineError);
          }
        });
      } else {
        // 方法2：没有换行符，可能是连续的JSON对象，需要手动分割
        console.log('法律RAG - 检测到连续JSON对象，尝试手动分割...');

        // 先尝试简单的 }{ 分割方法
        if (searchData.includes('}{')) {
          console.log('法律RAG - 使用 }{ 分割方法...');
          const separatedJson = searchData.replace(/\}\{/g, '}\n{');
          const jsonLines = separatedJson.split('\n').filter(line => line.trim());

          jsonLines.forEach((line, index) => {
            try {
              const result = JSON.parse(line);
              if (result && result.doc_index) {
                searchResults.push({
                  id: result.doc_index,
                  title: decodeText(result.title) || '法律文档',
                  snippet: decodeText(result.snippet || result.result) || '',
                  url: result.url || '',
                  source: decodeText(result.source) || 'Unknown',
                  score: result.score || 0
                });
                console.log(`成功解析连续JSON第${index + 1}个:`, result.doc_index, decodeText(result.title));
              }
            } catch (jsonError) {
              console.warn(`解析连续JSON第${index + 1}个失败:`, jsonError.message);
              console.log('失败的JSON内容前100字符:', line.substring(0, 100));
            }
          });
        }

        // 如果 }{ 分割方法没有成功，再尝试手动大括号匹配
        if (searchResults.length === 0) {
          console.log('法律RAG - }{ 分割失败，尝试手动大括号匹配...');

          let braceCount = 0;
        let currentJson = '';
        let inJson = false;

        for (let i = 0; i < searchData.length; i++) {
          const char = searchData[i];

          if (char === '{') {
            if (!inJson) {
              inJson = true;
              currentJson = '';
            }
            braceCount++;
            currentJson += char;
          } else if (char === '}' && inJson) {
            braceCount--;
            currentJson += char;

            if (braceCount === 0) {
              // 完整的JSON对象
              try {
                const result = JSON.parse(currentJson);
                if (result && result.doc_index) {
                  searchResults.push({
                    id: result.doc_index,
                    title: decodeText(result.title) || '法律文档',
                    snippet: decodeText(result.snippet || result.result) || '',
                    url: result.url || '',
                    source: decodeText(result.source) || 'Unknown',
                    score: result.score || 0
                  });
                }
              } catch (parseError) {
                console.warn('手动分割JSON解析失败:', currentJson.substring(0, 100) + '...', parseError);
              }
              inJson = false;
              currentJson = '';
            }
          } else if (inJson) {
            currentJson += char;
          }
        }
        }
      }
    }

    // 额外处理：直接在内容中查找JSON对象（以防标签不完整）
    if (searchResults.length === 0 && content.includes('"doc_index"')) {
      console.log('法律RAG - 尝试手动解析连续JSON对象...');

      // 手动解析大括号，处理连续的JSON对象（无换行符分隔）
      let braceCount = 0;
      let currentJson = '';
      let inJson = false;

      for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (char === '{') {
          if (!inJson) {
            inJson = true;
            currentJson = '';
          }
          braceCount++;
          currentJson += char;
        } else if (char === '}' && inJson) {
          braceCount--;
          currentJson += char;

          if (braceCount === 0) {
            // 完整的JSON对象
            try {
              const result = JSON.parse(currentJson);
              if (result && result.doc_index) {
                console.log(`法律RAG - 成功解析JSON对象 ${result.doc_index}:`, decodeText(result.title));
                searchResults.push({
                  id: result.doc_index,
                  title: decodeText(result.title) || '法律文档',
                  snippet: decodeText(result.snippet || result.result) || '',
                  url: result.url || '',
                  source: decodeText(result.source) || 'Unknown',
                  score: result.score || 0
                });
              }
            } catch (parseError) {
              console.warn('手动解析JSON失败:', parseError.message);
              console.warn('失败的JSON前100字符:', currentJson.substring(0, 100) + '...');
            }
            inJson = false;
            currentJson = '';
          }
        } else if (inJson) {
          currentJson += char;
        }
      }
    }
  }

  console.log('法律RAG - 提取到的搜索结果数量:', searchResults.length);
  if (searchResults.length > 0) {
    console.log('法律RAG - 搜索结果详情:', searchResults);
  }
  return searchResults;
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
    if (!inputValue.trim() || isLoading || isStreaming) return;

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // 流式传输完成，重置所有状态
              setIsLoading(false);
              setIsStreaming(false);

              // 如果消息已创建，解析最终内容
              if (messageCreated) {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === tempMessageId) {
                    const parsedContent = parseLawRagContent(msg.rawContent || '');
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

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                // 第一次收到内容时结束loading状态并创建消息
                setIsLoading(false);

                if (!messageCreated) {
                  // 第一次接收到内容，创建消息并设置流式状态
                  setIsStreaming(true);

                  const assistantMessage = {
                    id: tempMessageId,
                    role: 'assistant',
                    isLawRagResponse: true,
                    isStreaming: true,
                    rawContent: parsed.choices[0].delta.content,
                    thinkContent: '',
                    mainContent: '',
                    searchResults: [],
                    content: ''
                  };

                  // 解析初始内容
                  const parsedContent = parseLawRagContent(assistantMessage.rawContent);
                  assistantMessage.thinkContent = parsedContent.thinkContent;
                  assistantMessage.mainContent = parsedContent.mainContent;
                  assistantMessage.searchResults = parsedContent.searchResults;
                  assistantMessage.content = parsedContent.mainContent;

                  setMessages(prev => [...prev, assistantMessage]);
                  messageCreated = true;
                } else {
                  // 累积原始内容
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === tempMessageId) {
                      const newRawContent = (msg.rawContent || '') + parsed.choices[0].delta.content;
                      // 实时解析内容用于显示
                      const parsedContent = parseLawRagContent(newRawContent);
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



  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 检查是否可以发送（不在loading或streaming过程中）
      if (!isLoading && !isStreaming && inputValue.trim()) {
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

                  {/* 法律RAG主要内容 - 只有在有内容时才显示 */}
                  {(message.mainContent || message.content) && (
                    <div className="law-rag-response">
                      <div className="law-rag-header">
                        <span className="law-rag-icon">🤖</span>
                        <span className="law-rag-label">法律RAG咨询</span>
                      </div>
                      <div className="law-rag-content" data-streaming={message.isStreaming}>
                        <LawMarkdownWithCitations searchResults={message.searchResults || []} messageIndex={index}>
                          {message.mainContent || message.content}
                        </LawMarkdownWithCitations>
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



        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请描述您的法律问题"
          disabled={isLoading || isStreaming}
          rows="3"
        />
        <div className="button-group">
          <button
            onClick={callLawRagApi}
            disabled={isLoading || isStreaming || !inputValue.trim()}
            className="law-rag-button"
          >
            {isLoading || isStreaming ? '咨询中...' : '法律咨询'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LawChatInterface;
