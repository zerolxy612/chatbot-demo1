import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// 解析法律RAG内容的函数 - 分离think内容和正文内容
const parseLawRagContent = (content) => {
  if (!content) return { thinkContent: '', mainContent: '' };

  let processedContent = content;

  // 如果内容以 <search_results> 开头但还没有结束标签，暂时不显示任何内容
  if (processedContent.startsWith('<search_results>') && !processedContent.includes('</search_results>')) {
    return { thinkContent: '', mainContent: '' };
  }

  // 如果内容以 <think> 开头但还没有结束标签，暂时不显示任何内容
  if (processedContent.startsWith('<think>') && !processedContent.includes('</think>')) {
    return { thinkContent: '', mainContent: '' };
  }

  // 移除搜索结果标签内容（完整的标签对）
  processedContent = processedContent.replace(/<search_results>[\s\S]*?<\/search_results>/gi, '');

  // 查找<think>标签的位置
  const thinkMatch = processedContent.match(/<think>([\s\S]*?)<\/think>/);
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : '';

  // 移除think标签后的内容
  let mainContent = processedContent.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 清理主要内容
  // 1. 移除最外层的代码块标记（包括语言标识符）
  mainContent = mainContent.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/g, '');

  // 2. 移除所有剩余的代码块标记
  mainContent = mainContent.replace(/```[a-zA-Z]*\n?/g, '').replace(/\n?```/g, '');

  // 3. 清理多余的换行符
  mainContent = mainContent.replace(/^\n+/, '').replace(/\n+$/, '');

  // 4. 标准化换行符（确保段落间有适当间距）
  mainContent = mainContent.replace(/\n{3,}/g, '\n\n');

  return {
    thinkContent,
    mainContent
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
          model: "HKGAI-V1-Thinking-RAG-Chat",
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
                    content: ''
                  };

                  // 解析初始内容
                  const parsedContent = parseLawRagContent(assistantMessage.rawContent);
                  assistantMessage.thinkContent = parsedContent.thinkContent;
                  assistantMessage.mainContent = parsedContent.mainContent;
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
            hk_ordinance: {},
            hk_case: {},
            google: {}
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

                  {/* 法律RAG主要内容 - 只有在有内容时才显示 */}
                  {(message.mainContent || message.content) && (
                    <div className="law-rag-response">
                      <div className="law-rag-header">
                        <span className="law-rag-icon">🤖</span>
                        <span className="law-rag-label">法律RAG咨询</span>
                      </div>
                      <div className="law-rag-content" data-streaming={message.isStreaming}>
                        <ReactMarkdown>{message.mainContent || message.content}</ReactMarkdown>
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
