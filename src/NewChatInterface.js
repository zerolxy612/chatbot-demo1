import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { callGemini } from './api';
import ChartComponent from './ChartComponent';

// Gemini数据提取提示词模板
const GEMINI_EXTRACT_PROMPT = `你是一个专业的数据分析师。请从以下搜索结果和回复内容中提取数据，并生成适合的图表JSON格式。

要求：
1. 仔细分析内容中的数值数据、时间序列、分类信息
2. 根据数据特点选择最合适的图表类型
3. 严格按照JSON格式返回，不要添加任何其他文字
4. 如果数据不足，请基于内容合理推断和补充

JSON格式要求：
{
  "isChart": true,
  "type": "图表类型(line/bar/pie)",
  "title": "图表标题",
  "xAxis": ["X轴标签1", "X轴标签2", "X轴标签3"],
  "yAxis": [数值1, 数值2, 数值3],
  "description": "图表描述"
}

图表类型选择指南：
- "line": 时间序列、趋势变化数据
- "bar": 分类对比、排名数据
- "pie": 占比、构成比例数据

请分析以下内容并生成图表JSON：

`;



function NewChatInterface({ onToggleInterface }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `欢迎使用图表测试demo界面！

快来试试吧！`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);



  // 构建Gemini数据提取提示词
  const buildGeminiPrompt = (hkgaiResponse) => {
    return GEMINI_EXTRACT_PROMPT + hkgaiResponse;
  };

  // 使用Gemini提取图表数据
  const extractChartDataWithGemini = async (hkgaiResponse) => {
    try {
      console.log('开始使用Gemini提取图表数据...');

      const prompt = buildGeminiPrompt(hkgaiResponse);
      const geminiResponse = await callGemini(prompt);

      console.log('Gemini原始响应:', geminiResponse);

      // 尝试从Gemini响应中提取JSON
      const jsonMatch = geminiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const chartData = JSON.parse(jsonMatch[0]);
          if (chartData.isChart && chartData.type && chartData.title) {
            console.log('Gemini成功提取图表数据:', chartData);
            return chartData;
          }
        } catch (parseError) {
          console.log('Gemini JSON解析失败:', parseError);
        }
      }

      console.log('Gemini提取失败，使用备用方案');
      return null;
    } catch (error) {
      console.error('Gemini数据提取失败:', error);
      return null;
    }
  };



  // 将图表数据转换为ECharts配置
  const convertToEChartsConfig = (chartData) => {
    const baseConfig = {
      title: {
        text: chartData.title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      }
    };

    switch (chartData.type) {
      case 'line':
        return {
          ...baseConfig,
          xAxis: {
            type: 'category',
            data: chartData.xAxis
          },
          yAxis: {
            type: 'value'
          },
          series: [{
            data: chartData.yAxis,
            type: 'line',
            smooth: true,
            lineStyle: {
              color: '#ff6b6b'
            },
            itemStyle: {
              color: '#ff6b6b'
            }
          }]
        };

      case 'bar':
        return {
          ...baseConfig,
          xAxis: {
            type: 'category',
            data: chartData.xAxis
          },
          yAxis: {
            type: 'value'
          },
          series: [{
            data: chartData.yAxis,
            type: 'bar',
            itemStyle: {
              color: '#ff6b6b'
            }
          }]
        };

      case 'pie':
        return {
          ...baseConfig,
          tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)'
          },
          series: [{
            name: chartData.title,
            type: 'pie',
            radius: '50%',
            data: chartData.xAxis.map((name, index) => ({
              value: chartData.yAxis[index],
              name: name
            })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        };

      default:
        return baseConfig;
    }
  };

  // 生成默认图表数据
  const generateDefaultChartData = (userInput) => {
    console.log('生成默认图表数据，用户输入:', userInput);

    // 根据用户输入推断图表类型和内容
    let chartType = 'line';
    let title = '数据图表';
    let xAxis = ['项目1', '项目2', '项目3', '项目4', '项目5'];
    let yAxis = [120, 200, 150, 80, 170];

    if (userInput.includes('天气') || userInput.includes('温度')) {
      chartType = 'line';
      title = '天气温度变化';
      xAxis = ['周一', '周二', '周三', '周四', '周五'];
      yAxis = [22, 25, 23, 27, 24];
    } else if (userInput.includes('销售') || userInput.includes('营业额')) {
      chartType = 'bar';
      title = '销售数据统计';
      xAxis = ['1月', '2月', '3月', '4月', '5月'];
      yAxis = [1200, 1900, 1500, 2100, 1800];
    } else if (userInput.includes('占比') || userInput.includes('比例') || userInput.includes('饼图')) {
      chartType = 'pie';
      title = '数据占比分析';
      xAxis = ['类别A', '类别B', '类别C', '类别D'];
      yAxis = [30, 25, 20, 25];
    }

    return {
      isChart: true,
      type: chartType,
      title: title,
      xAxis: xAxis,
      yAxis: yAxis,
      description: `这是根据您的请求"${userInput}"生成的示例图表`
    };
  };



  // 处理图表数据的函数 - RAG + Gemini方案
  const processChartData = async (assistantMessage, currentInput) => {
    try {
      let chartData = null;

      console.log('开始处理图表数据，使用RAG + Gemini方案');

      // 主方案：使用Gemini从RAG的overview中提取图表数据
      if (assistantMessage.ragData && assistantMessage.ragData.overview) {
        console.log('步骤1: 使用Gemini从RAG overview提取图表数据');
        console.log('RAG overview内容:', assistantMessage.ragData.overview);

        chartData = await extractChartDataWithGemini(assistantMessage.ragData.overview);

        if (chartData) {
          console.log('✅ Gemini成功从overview提取图表数据:', chartData);
        } else {
          console.log('❌ Gemini从overview提取失败，尝试完整RAG数据');

          // 尝试从完整的RAG数据中提取
          const fullRagContent = JSON.stringify(assistantMessage.ragData);
          chartData = await extractChartDataWithGemini(fullRagContent);

          if (chartData) {
            console.log('✅ Gemini从完整RAG数据提取成功:', chartData);
          }
        }
      }

      // 备用方案1：从RAG参考资料中提取数据
      if (!chartData && assistantMessage.ragData && assistantMessage.ragData.reference) {
        console.log('步骤2: 从RAG参考资料提取数据');
        const referenceContent = assistantMessage.ragData.reference.map(ref => ref.snippet || ref.result || '').join('\n');
        chartData = await extractChartDataWithGemini(referenceContent);

        if (chartData) {
          console.log('✅ 从参考资料提取数据成功:', chartData);
        }
      }

      // 备用方案2：生成默认图表数据
      if (!chartData) {
        console.log('步骤3: 使用默认图表数据生成');
        chartData = generateDefaultChartData(currentInput);
        console.log('✅ 默认数据生成完成:', chartData);
      }

      if (chartData) {
        console.log('最终使用的图表数据:', chartData);
        assistantMessage.chartData = chartData;
        assistantMessage.chartConfig = convertToEChartsConfig(chartData);

        // 优化overview内容的显示格式
        if (assistantMessage.ragData && assistantMessage.ragData.overview) {
          assistantMessage.content = formatOverviewContent(assistantMessage.ragData.overview);
        } else if (!assistantMessage.content) {
          assistantMessage.content = chartData.description || '已为您生成相关图表';
        }

        console.log('✅ 图表处理完成，配置:', assistantMessage.chartConfig);
      } else {
        assistantMessage.chartError = '图表生成失败，请尝试更明确的图表请求';
        console.log('❌ 所有图表生成方案都失败了');
      }

      // 更新消息状态
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { ...assistantMessage };
        return newMessages;
      });

    } catch (error) {
      console.error('图表处理错误:', error);
      // 最后的备用方案
      const fallbackData = generateDefaultChartData(currentInput);
      assistantMessage.chartData = fallbackData;
      assistantMessage.chartConfig = convertToEChartsConfig(fallbackData);
      assistantMessage.content = fallbackData.description;

      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { ...assistantMessage };
        return newMessages;
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 构建RAG查询的提示词
  const buildRagQuery = (userInput) => {
    return `${userInput}，请多提供一些具体的数据和数值信息，包括时间序列、分类统计、对比数据等，以便进行数据可视化分析。`;
  };

  // 格式化overview内容，使其更用户友好
  const formatOverviewContent = (overview) => {
    if (!overview) return '';

    let formatted = overview;

    // 首先处理转义的换行符
    formatted = formatted.replace(/\\n/g, '\n');

    // 1. 移除原始的表格格式，提取关键信息
    const tableRegex = /\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|/g;
    const tableMatches = formatted.match(tableRegex);

    if (tableMatches) {
      // 提取表格数据并格式化为更友好的格式
      const dataRows = tableMatches.filter(row => !row.includes('---') && !row.includes('日期'));
      if (dataRows.length > 0) {
        let tableData = '\n📊 **数据详情**\n';
        dataRows.forEach((row) => {
          const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
          if (cells.length >= 5) {
            tableData += `• ${cells[0]}: 最高 **${cells[1]}**, 最低 **${cells[2]}**, 平均 **${cells[3]}**, 湿度 **${cells[4]}**\n`;
          }
        });

        // 替换原表格
        formatted = formatted.replace(/\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[\s\S]*?\n\n/g, tableData + '\n');
      }
    }

    // 2. 优化标题格式
    formatted = formatted.replace(/### ([^:\n]+)[:：]?\s*/g, '\n🔍 **$1**\n');
    formatted = formatted.replace(/## ([^:\n]+)[:：]?\s*/g, '\n📈 **$1**\n');

    // 3. 优化列表格式
    formatted = formatted.replace(/^- /gm, '• ');

    // 4. 处理统计数据格式
    formatted = formatted.replace(/- ([^:：]+)[:：]\s*([^\n]+)/g, '• **$1**: $2');

    // 5. 高亮重要数据
    formatted = formatted.replace(/(\d+\.?\d*[°℃%])/g, '**$1**');
    formatted = formatted.replace(/(\d{4}-\d{2}-\d{2})/g, '**$1**');
    formatted = formatted.replace(/(\d+\.?\d*mm)/g, '**$1**');

    // 6. 清理格式
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    formatted = formatted.replace(/^\s+|\s+$/g, '');
    formatted = formatted.replace(/根据[^，。]*[，。]\s*/g, ''); // 移除"根据...提供的数据"

    // 7. 添加简洁的开头
    if (!formatted.startsWith('📈') && !formatted.startsWith('📊')) {
      formatted = '📈 **数据分析**\n\n' + formatted;
    }

    // 8. 优化结尾
    formatted = formatted.replace(/希望这些信息对您有用！[^]*$/g, '');
    formatted = formatted.replace(/如果您需要[^]*$/g, '');

    return formatted.trim();
  };

  // 调用RAG接口获取数据
  const callRagForChart = async (query) => {
    try {
      console.log('调用RAG接口获取图表数据...');

      // 构建增强的查询
      const enhancedQuery = buildRagQuery(query);
      console.log('增强后的查询:', enhancedQuery);

      const requestParams = {
        query: enhancedQuery,
        generate_overview: true, // 启用overview生成
        streaming: false, // 图表生成不使用流式
        recalls: {
          serpapi: {},
          elasticsearch: {},
          faq: {}
        }
      };

      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams)
      });

      if (!response.ok) {
        throw new Error(`RAG API error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('RAG API响应:', data);

      return data;
    } catch (error) {
      console.error('RAG API调用失败:', error);
      throw error;
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue };
    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 所有请求都使用RAG接口生成图表
      console.log('使用RAG接口处理请求并生成图表');

      const ragData = await callRagForChart(currentInput);

      // 创建助手消息
      let assistantMessage = {
        role: 'assistant',
        content: ragData.overview || '已获取相关数据',
        isChartRequest: true,
        chartData: null,
        chartConfig: null,
        ragData: ragData
      };

      setMessages(prev => [...prev, assistantMessage]);

      // 处理图表数据
      await processChartData(assistantMessage, currentInput);
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
    <div className="new-chat-interface">
      <div className="new-chat-header">
        <h1>Chat-Chart-Demo</h1>
        <div className="new-interface-controls">
          <button
            className="interface-toggle"
            onClick={onToggleInterface}
            title="切换到原界面"
          >
            <span className="toggle-icon">🔄</span>
            切换界面
          </button>
          <div className="new-interface-badge">
            <span className="badge-icon">✨</span>
            <span className="badge-text">New Interface</span>
          </div>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {/* 图表消息特殊处理 */}
              {message.role === 'assistant' && message.isChartRequest ? (
                <div className="chart-message">
                  <div className="chart-header">
                    <span className="chart-icon">📊</span>
                    <span className="chart-label">Data Visualization</span>
                  </div>

                  {/* 图表渲染成功 */}
                  {message.chartConfig && (
                    <ChartComponent
                      config={message.chartConfig}
                      description={message.chartData?.description}
                    />
                  )}

                  {/* 图表错误处理 */}
                  {message.chartError && (
                    <div className="chart-error">
                      <span className="chart-error-icon">⚠️</span>
                      {message.chartError}
                    </div>
                  )}

                  {/* 文字内容 */}
                  {message.content && (
                    <div className="chart-text-content">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
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
                <span className="loading-text">正在处理中...</span>
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
          placeholder="在新界面中输入您的问题... (这是为新需求设计的界面)"
          disabled={isLoading}
          rows="3"
        />
        <div className="button-group">
          <button onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
            {isLoading ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewChatInterface;
