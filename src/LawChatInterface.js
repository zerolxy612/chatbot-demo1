import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// 处理法律RAG内容的函数
const cleanLawRagContent = (content) => {
  if (!content) return content;

  let cleaned = content;

  // 1. 移除 <think> 标签及其内容
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. 移除最外层的代码块标记（包括语言标识符）
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/g, '');

  // 3. 移除所有剩余的代码块标记
  cleaned = cleaned.replace(/```[a-zA-Z]*\n?/g, '').replace(/\n?```/g, '');

  // 4. 清理多余的换行符
  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');

  // 5. 标准化换行符（确保段落间有适当间距）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 调用法律RAG API
  const callLawRagApi = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      console.log('调用法律RAG API:', currentInput);

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
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('法律RAG API响应:', data);

      let assistantContent = '';
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const rawContent = data.choices[0].message.content;
        console.log('原始内容:', rawContent);

        // 使用清理函数处理内容
        assistantContent = cleanLawRagContent(rawContent);
        console.log('清理后内容:', assistantContent);

      } else {
        assistantContent = '抱歉，未能获取到有效的法律咨询回复。';
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantContent,
        isLawRagResponse: true
      }]);

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
      setIsLoading(false);
    }
  };

  // 调用法律多源检索API
  const callLawMultisearchApi = async () => {
    if (!inputValue.trim() || isMultisearchLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsMultisearchLoading(true);

    try {
      console.log('调用法律多源检索API:', currentInput);

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
      console.log('法律多源检索API响应:', data);

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
      // 默认使用rag API
      callLawRagApi();
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
                <div className="law-rag-response">
                  <div className="law-rag-header">
                    <span className="law-rag-icon">🤖</span>
                    <span className="law-rag-label">法律RAG咨询</span>
                  </div>
                  <div className="law-rag-content">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ) : message.role === 'assistant' && message.isLawMultisearchResponse ? (
                <div className="law-multisearch-response">
                  <div className="law-multisearch-header">
                    <span className="law-multisearch-icon">🔍</span>
                    <span className="law-multisearch-label">法律多源检索结果</span>
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
          disabled={isLoading}
          rows="3"
        />
        <div className="button-group">
          <button
            onClick={callLawRagApi}
            disabled={isLoading || isMultisearchLoading || !inputValue.trim()}
            className="law-rag-button"
          >
            {isLoading ? '咨询中...' : 'rag'}
          </button>
          <button
            onClick={callLawMultisearchApi}
            disabled={isLoading || isMultisearchLoading || !inputValue.trim()}
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
