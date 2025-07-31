import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { callGemini } from './api';
import ChartComponent from './ChartComponent';

// Gemini数据提取提示词模板
const GEMINI_EXTRACT_PROMPT = `你是一个专业的数据分析师。请从以下内容中提取尽可能多的真实数据点，并生成对应的图表JSON格式。

关键要求：
1. 提取所有包含时间和数值的数据点（如：2019年1月6,784,406人次、2025年4月3,847,934人次）
2. 包含历史最高、最低等关键数据点
3. 保持原始的时间格式（如：2019年1月、2025年4月）
4. 数值保持原始精度，去除千位分隔符
5. 如果有多个时间点数据，优先生成折线图显示趋势
6. 严格按照JSON格式返回，不要添加解释文字

数据提取示例：
- "2019年1月，达到了6,784,406人次" → xAxis: "2019年1月", yAxis: 6784406
- "2025年4月，访港旅客人次反弹至3,847,934" → xAxis: "2025年4月", yAxis: 3847934
- "历史最低点，只有1,800人次" → 也要包含在数据中

JSON格式要求：
{
  "isChart": true,
  "type": "line",
  "title": "基于实际数据的完整标题",
  "xAxis": ["2019年1月", "2022年3月", "2025年4月", "2025年5月"],
  "yAxis": [6784406, 1800, 3847934, 4078938],
  "description": "包含X个关键时间点的趋势分析"
}

图表类型选择：
- "line": 优先选择，适合时间序列数据
- "bar": 当有分类对比数据时
- "pie": 当有百分比或占比数据时

请仔细分析以下内容，提取其中所有的时间+数值数据点：

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

  // 验证图表数据是否与overview内容匹配
  const validateChartData = (chartData, overview) => {
    if (!chartData || !overview) return false;

    // 检查图表数据中的数值是否在overview中存在
    const overviewNumbers = overview.match(/\d+\.?\d*/g) || [];
    const chartNumbers = chartData.yAxis || [];

    // 至少有一半的图表数据能在overview中找到对应
    let matchCount = 0;
    chartNumbers.forEach(num => {
      if (overviewNumbers.some(overviewNum => Math.abs(parseFloat(overviewNum) - num) < 0.1)) {
        matchCount++;
      }
    });

    const matchRatio = matchCount / chartNumbers.length;
    console.log('数据匹配验证:', { matchCount, total: chartNumbers.length, matchRatio });

    return matchRatio >= 0.3; // 至少30%的数据匹配
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
            // 验证数据匹配度
            if (validateChartData(chartData, hkgaiResponse)) {
              console.log('✅ Gemini成功提取图表数据，数据匹配:', chartData);
              return chartData;
            } else {
              console.log('❌ Gemini提取的数据与overview不匹配');
              return null;
            }
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

  // 从overview内容中智能提取数据生成图表
  const generateChartFromOverview = (overview, userInput) => {
    console.log('从overview内容生成图表数据:', { overview, userInput });

    if (!overview) {
      return generateDefaultChartData(userInput);
    }

    // 更精确的数据提取策略

    // 1. 提取年份+数值的组合（如：2019年1月，达到了6,784,406人次）
    const yearDataMatches = overview.match(/(\d{4})年[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/g) || [];
    const monthDataMatches = overview.match(/(\d{4})年(\d{1,2})月[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/g) || [];

    console.log('年份数据匹配:', yearDataMatches);
    console.log('月份数据匹配:', monthDataMatches);

    // 2. 提取具体的时间点数据
    const timeSeriesData = [];

    // 处理月份数据（优先级更高）
    monthDataMatches.forEach(match => {
      const monthMatch = match.match(/(\d{4})年(\d{1,2})月[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
      if (monthMatch) {
        const year = monthMatch[1];
        const month = monthMatch[2];
        const value = parseFloat(monthMatch[3].replace(/,/g, ''));
        timeSeriesData.push({
          label: `${year}年${month}月`,
          value: value,
          sortKey: parseInt(year) * 100 + parseInt(month)
        });
      }
    });

    // 如果没有月份数据，处理年份数据
    if (timeSeriesData.length === 0) {
      yearDataMatches.forEach(match => {
        const yearMatch = match.match(/(\d{4})年[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
        if (yearMatch) {
          const year = yearMatch[1];
          const value = parseFloat(yearMatch[2].replace(/,/g, ''));
          timeSeriesData.push({
            label: `${year}年`,
            value: value,
            sortKey: parseInt(year)
          });
        }
      });
    }

    // 3. 提取关键数据点（历史最高、最低、当前等）
    const keyDataPoints = [];

    // 历史最高
    const highestMatch = overview.match(/历史最高[^，。]*?(\d{4})年(\d{1,2})?月?[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/);
    if (highestMatch) {
      const year = highestMatch[1];
      const month = highestMatch[2] || '1';
      const value = parseFloat(highestMatch[3].replace(/,/g, ''));
      keyDataPoints.push({
        label: `${year}年${month}月(最高)`,
        value: value,
        sortKey: parseInt(year) * 100 + parseInt(month)
      });
    }

    // 历史最低
    const lowestMatch = overview.match(/历史最低[^，。]*?(\d{4})年(\d{1,2})月[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/);
    if (lowestMatch) {
      const year = lowestMatch[1];
      const month = lowestMatch[2];
      const value = parseFloat(lowestMatch[3].replace(/,/g, ''));
      keyDataPoints.push({
        label: `${year}年${month}月(最低)`,
        value: value,
        sortKey: parseInt(year) * 100 + parseInt(month)
      });
    }

    // 最近数据点
    const recentMatches = overview.match(/(\d{4})年(\d{1,2})月[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/g) || [];
    recentMatches.slice(-3).forEach(match => { // 取最后3个数据点
      const recentMatch = match.match(/(\d{4})年(\d{1,2})月[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
      if (recentMatch) {
        const year = recentMatch[1];
        const month = recentMatch[2];
        const value = parseFloat(recentMatch[3].replace(/,/g, ''));
        keyDataPoints.push({
          label: `${year}年${month}月`,
          value: value,
          sortKey: parseInt(year) * 100 + parseInt(month)
        });
      }
    });

    // 合并并去重数据
    const allDataPoints = [...timeSeriesData, ...keyDataPoints];
    const uniqueDataPoints = allDataPoints.filter((item, index, self) =>
      index === self.findIndex(t => t.sortKey === item.sortKey)
    );

    // 按时间排序
    uniqueDataPoints.sort((a, b) => a.sortKey - b.sortKey);

    console.log('提取的时间序列数据:', uniqueDataPoints);

    if (uniqueDataPoints.length >= 3) {
      return {
        isChart: true,
        type: 'line',
        title: userInput.includes('旅游') || userInput.includes('游客') ? '香港旅游人数变化趋势' :
               userInput.includes('人口') ? '人口变化趋势' : '数据变化趋势',
        xAxis: uniqueDataPoints.map(d => d.label),
        yAxis: uniqueDataPoints.map(d => d.value),
        description: `基于overview中提取的${uniqueDataPoints.length}个关键时间点数据`
      };
    }

    // 如果时间序列数据不足，尝试其他类型的数据
    const percentages = overview.match(/\d+\.?\d*%/g) || [];
    if (percentages.length >= 3) {
      const validPercentages = percentages.slice(0, 5).map(p => parseFloat(p.replace('%', '')));
      const categories = ['类别1', '类别2', '类别3', '类别4', '类别5'].slice(0, validPercentages.length);

      return {
        isChart: true,
        type: 'pie',
        title: '数据占比分析',
        xAxis: categories,
        yAxis: validPercentages,
        description: `基于overview百分比数据生成的饼图`
      };
    }

    // 最后备用：提取所有数值
    const allNumbers = overview.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || [];
    if (allNumbers.length >= 3) {
      const validNumbers = allNumbers.slice(0, 6).map(n => parseFloat(n.replace(/,/g, '')));
      const categories = validNumbers.map((_, index) => `数据点${index + 1}`);

      return {
        isChart: true,
        type: 'bar',
        title: '关键数据对比',
        xAxis: categories,
        yAxis: validNumbers,
        description: `基于overview中提取的关键数值数据`
      };
    }

    // 如果无法提取有效数据，使用默认数据
    return generateDefaultChartData(userInput);
  };

  // 生成默认图表数据（作为最后备用）
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

      // 备用方案2：从overview内容智能提取数据
      if (!chartData && assistantMessage.ragData && assistantMessage.ragData.overview) {
        console.log('步骤3: 从overview内容智能提取数据');
        chartData = generateChartFromOverview(assistantMessage.ragData.overview, currentInput);
        console.log('✅ 从overview提取数据完成:', chartData);
      }

      // 备用方案3：生成默认图表数据
      if (!chartData) {
        console.log('步骤4: 使用默认图表数据生成');
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
