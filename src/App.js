import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { callOpenAI } from './api';

const MODEL_OPTIONS = {
  "HKGAI-V1-Thinking-RAG-Chat": "thinking-websearch-reflink",
  "HKGAI-V1-Thinking-RAG-NOSEARCH-Chat": "thinking",
  "HKGAI-V1-RAG-Chat": "websearch-reflink",
  "HKGAI-V1-RAG-NOSEARCH-Chat": "",
};

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState('HKGAI-V1-Thinking-RAG-Chat');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 内容解析函数 - 分离think内容和正文内容
  const parseContent = (content) => {
    // 查找<think>标签的位置
    const thinkIndex = content.indexOf('<think>');
    if (thinkIndex === -1) {
      // 没有think标签，直接过滤其他内容
      return {
        thinkContent: '',
        mainContent: filterMainContent(content)
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
      mainContent
    };
  };

  // 过滤主要内容
  const filterMainContent = (content) => {
    // 过滤掉搜索结果（包括JSON格式的搜索结果）
    content = content.replace(/<search_results>[\s\S]*?<\/search_results>/g, '');
    content = content.replace(/<search_results>\{[\s\S]*?\}<\/search_results>/g, '');

    // 过滤掉单独的JSON搜索结果
    content = content.replace(/\{"query":\s*"[^"]*",[\s\S]*?\}/g, '');

    // 过滤掉引用标记，如[citation:3]
    content = content.replace(/\[citation:\d+\]/g, '');

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
      const response = await callOpenAI(selectedModel, currentInput);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = {
        role: 'assistant',
        content: '',
        rawContent: '',
        thinkContent: '',
        mainContent: ''
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
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，发生了错误，请稍后再试。' }]);
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

  return (
    <div className="App">
      <div className="chat-container">
        <div className="chat-header">
          <h1>AI 聊天机器人</h1>
          <div className="model-selector">
            <label htmlFor="model-select">选择模型：</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {Object.entries(MODEL_OPTIONS).map(([model, description]) => (
                <option key={model} value={model}>
                  {model} ({description || 'basic'})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="messages-container">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                {message.role === 'assistant' ? (
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

                    {/* 主要内容显示 */}
                    {message.mainContent && (
                      <div className="main-content">
                        <ReactMarkdown>{message.mainContent}</ReactMarkdown>
                      </div>
                    )}

                    {/* 兼容旧格式 */}
                    {!message.thinkContent && !message.mainContent && message.content && (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    )}
                  </div>
                ) : (
                  // 用户消息
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}

          {/* 加载状态提示 */}
          {isLoading && (
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

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题..."
            disabled={isLoading}
            rows="3"
          />
          <button onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
