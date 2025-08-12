import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function LawChatInterface({ onToggleInterface }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `⚖️ **Law 测试界面**！

🎯 **专门功能**：
📚 **法律咨询服务**：
  • 法律条文查询和解释
  • 合同条款分析
  • 法律风险评估
  • 诉讼程序指导

💼 **业务场景**：
  • 企业合规咨询
  • 个人法律问题
  • 合同审查建议
  • 法律文书起草

🔍 **使用方法**：
  • 直接描述您的法律问题
  • 上传合同或法律文件进行分析
  • 询问特定法律条文的含义
  • 寻求法律程序指导

⚠️ **免责声明**：本服务仅供参考，不构成正式法律建议。重要法律事务请咨询专业律师。`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 模拟法律咨询处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      let response = '';
      
      if (currentInput.toLowerCase().includes('合同') || currentInput.toLowerCase().includes('contract')) {
        response = `📋 **合同相关咨询**

根据您的问题，我为您提供以下法律建议：

**合同要素分析**：
• 合同主体：确认签约双方的法律资格
• 合同内容：明确权利义务关系
• 合同形式：书面合同具有更强的法律效力

**风险提示**：
⚠️ 建议在签署前仔细审查所有条款
⚠️ 注意违约责任和争议解决条款
⚠️ 确保合同条款符合相关法律法规

**建议**：重要合同建议咨询专业律师进行详细审查。`;

      } else if (currentInput.toLowerCase().includes('法律') || currentInput.toLowerCase().includes('法规')) {
        response = `⚖️ **法律条文咨询**

针对您的法律问题，我提供以下信息：

**相关法律依据**：
• 请具体说明涉及的法律领域（民法、商法、劳动法等）
• 不同法律领域有不同的适用规则和程序

**处理建议**：
1. 收集相关证据材料
2. 了解适用的法律条文
3. 评估法律风险和可能后果
4. 制定应对策略

**注意事项**：法律条文的理解和适用需要结合具体情况，建议咨询专业律师。`;

      } else if (currentInput.toLowerCase().includes('诉讼') || currentInput.toLowerCase().includes('起诉')) {
        response = `🏛️ **诉讼程序指导**

关于诉讼相关问题，为您提供以下指导：

**诉讼准备**：
• 证据收集：收集所有相关的书面证据
• 法律依据：明确适用的法律条文
• 诉讼时效：注意诉讼时效期限

**诉讼流程**：
1. 起诉阶段：准备起诉状和证据材料
2. 审理阶段：参加庭审，进行举证质证
3. 判决阶段：等待法院判决结果

**重要提醒**：诉讼是专业性很强的法律程序，强烈建议委托专业律师代理。`;

      } else if (currentInput.toLowerCase().includes('测试') || currentInput.toLowerCase().includes('test')) {
        response = `🔧 **Law界面系统状态**

📡 **服务状态**: 正常运行
⚖️ **法律数据库**: 已连接
🤖 **AI法律助手**: HKGAI-V1-Law版本
📚 **知识库**: 包含民法、商法、劳动法等多个领域

**功能测试**：
✅ 法律咨询问答
✅ 合同条款分析  
✅ 法律风险评估
✅ 诉讼程序指导

试试问一些法律相关的问题吧！`;

      } else {
        response = `⚖️ **法律咨询服务**

感谢您使用Law测试界面！我是您的AI法律助手。

**我可以帮助您**：
• 解答一般性法律问题
• 分析合同条款要点
• 提供法律程序指导
• 评估潜在法律风险

**请注意**：
• 本服务仅供参考，不构成正式法律建议
• 具体法律问题请咨询专业律师
• 重要法律文件建议专业审查

请详细描述您的法律问题，我会尽力为您提供帮助！`;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response
      }]);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '抱歉，法律咨询服务暂时不可用，请稍后再试。' 
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
              <ReactMarkdown>{message.content}</ReactMarkdown>
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
                <span className="loading-text">法律助手思考中...</span>
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
          placeholder="请描述您的法律问题：合同审查、法律咨询、诉讼指导..."
          disabled={isLoading}
          rows="3"
        />
        <div className="button-group">
          <button onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
            {isLoading ? '咨询中...' : '法律咨询'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LawChatInterface;
