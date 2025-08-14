import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { callStockAPI } from './api';
import ChartComponent from './ChartComponent';





function NewChatInterface({ onToggleInterface }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Fin 测试界面！

🎯 **专门功能**：
📈 **港股实时查询**：
  • 输入 "700" 或 "0700" - 查看腾讯控股股价走势
  • 输入 "1810" - 查看小米集团股价走势
  • 输入 "700.HK" 或 "0700.HK" - 带后缀格式
  • 支持3-4位港股代码查询

  • 数据源：Yahoo Finance
`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);



  // 已删除：Gemini提示词构建函数

  // 已删除：图表数据验证函数

  // 已删除：Gemini图表数据提取函数



  // 股票数据转换为图表数据
  const convertStockDataToChart = (stockData, timeRange = '1M') => {
    if (!stockData || !stockData.ranges || !stockData.ranges[timeRange]) {
      throw new Error('股票数据格式不正确');
    }

    const rangeData = stockData.ranges[timeRange];

    // 计算涨跌情况和价格范围
    const firstPrice = rangeData[0]?.close || 0;
    const lastPrice = rangeData[rangeData.length - 1]?.close || 0;
    const priceChange = lastPrice - firstPrice;
    const priceChangePercent = firstPrice > 0 ? ((priceChange / firstPrice) * 100).toFixed(2) : 0;
    const isUp = priceChange >= 0;

    // 计算时段内的最高价和最低价
    const highestPrice = Math.max(...rangeData.map(item => item.high));
    const lowestPrice = Math.min(...rangeData.map(item => item.low));
    const priceRange = highestPrice - lowestPrice;

    return {
      isChart: true,
      type: 'line', // 可以是 'line', 'candlestick'
      title: `${stockData.ticker} 股价走势 (${isUp ? '↗' : '↘'} ${priceChangePercent}%)`,
      xAxis: rangeData.map(item => {
        // 格式化日期显示
        const date = new Date(item.date);
        return `${date.getMonth() + 1}-${date.getDate()}`;
      }),
      yAxis: rangeData.map(item => item.close),
      description: `${stockData.ticker} ${timeRange}时间段股价数据，当前价格: ${stockData.currency} ${lastPrice.toFixed(2)}`,
      // 保存原始数据用于高级图表
      rawData: {
        ohlc: rangeData.map(item => [item.open, item.high, item.low, item.close]),
        volume: rangeData.map(item => item.volume),
        dates: rangeData.map(item => item.date)
      },
      stockInfo: {
        ticker: stockData.ticker,
        market: stockData.market,
        currency: stockData.currency,
        timezone: stockData.timezone,
        currentPrice: lastPrice,
        priceChange: priceChange,
        priceChangePercent: priceChangePercent,
        isUp: isUp,
        highestPrice: highestPrice,
        lowestPrice: lowestPrice,
        priceRange: priceRange
      }
    };
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
        trigger: 'axis',
        formatter: function(params) {
          if (params && params.length > 0) {
            const dataIndex = params[0].dataIndex;
            const value = params[0].value;
            const date = params[0].axisValue;

            // 如果有原始股票数据，显示更详细的信息
            if (chartData.rawData && chartData.rawData.ohlc && chartData.rawData.ohlc[dataIndex]) {
              const ohlc = chartData.rawData.ohlc[dataIndex];
              const volume = chartData.rawData.volume[dataIndex];

              return `
                <div style="padding: 8px;">
                  <div style="font-weight: bold; margin-bottom: 5px;">${date}</div>
                  <div>开盘: <span style="color: #666;">${chartData.stockInfo?.currency || ''} ${ohlc[0].toFixed(2)}</span></div>
                  <div>最高: <span style="color: #00da3c;">${chartData.stockInfo?.currency || ''} ${ohlc[1].toFixed(2)}</span></div>
                  <div>最低: <span style="color: #ec0000;">${chartData.stockInfo?.currency || ''} ${ohlc[2].toFixed(2)}</span></div>
                  <div>收盘: <span style="color: #333; font-weight: bold;">${chartData.stockInfo?.currency || ''} ${ohlc[3].toFixed(2)}</span></div>
                  <div style="margin-top: 5px; color: #888;">成交量: ${volume.toLocaleString()}</div>
                </div>
              `;
            }

            return `${date}<br/>价格: ${chartData.stockInfo?.currency || ''} ${value.toFixed(2)}`;
          }
          return '';
        }
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
        // 检查是否为股票数据，应用特殊样式
        const isStockChart = chartData.stockInfo;
        const lineColor = isStockChart ?
          (chartData.stockInfo.isUp ? '#00da3c' : '#ec0000') : '#ff6b6b';

        const config = {
          ...baseConfig,
          xAxis: {
            type: 'category',
            data: chartData.xAxis,
            axisLabel: {
              rotate: isStockChart ? 0 : 0, // 股票图表不旋转标签
              fontSize: 12
            }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: isStockChart ?
                (value) => `${chartData.stockInfo?.currency || ''} ${value.toFixed(2)}` :
                undefined
            },
            // 为股票图表设置纵轴范围为最低点和最高点，突出显示波动
            min: isStockChart ? () => {
              const minValue = Math.min(...chartData.yAxis);
              const maxValue = Math.max(...chartData.yAxis);
              const range = maxValue - minValue;
              // 在最低点基础上留出5%的缓冲空间
              return Math.max(0, minValue - range * 0.05);
            } : undefined,
            max: isStockChart ? () => {
              const minValue = Math.min(...chartData.yAxis);
              const maxValue = Math.max(...chartData.yAxis);
              const range = maxValue - minValue;
              // 在最高点基础上留出5%的缓冲空间
              return maxValue + range * 0.05;
            } : undefined
          },
          series: [{
            data: chartData.yAxis,
            type: 'line',
            smooth: true,
            lineStyle: {
              color: lineColor,
              width: 2,
              shadowColor: lineColor,
              shadowBlur: 4,
              shadowOffsetY: 2
            },
            itemStyle: {
              color: lineColor,
              borderColor: lineColor,
              borderWidth: 2
            },
            areaStyle: isStockChart ? {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: lineColor + '40' },
                  { offset: 1, color: lineColor + '10' }
                ]
              }
            } : undefined,
            // 暂时注释掉标记点，查看基础图表效果
            /*
            markPoint: isStockChart ? {
              data: [
                {
                  type: 'max',
                  name: '最高点',
                  label: {
                    formatter: (params) => {
                      const currency = chartData.stockInfo?.currency || '';
                      return `${currency} ${params.value.toFixed(2)}`;
                    },
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#fff',
                    backgroundColor: '#00da3c',
                    padding: [4, 8],
                    borderRadius: 4
                  }
                },
                {
                  type: 'min',
                  name: '最低点',
                  label: {
                    formatter: (params) => {
                      const currency = chartData.stockInfo?.currency || '';
                      return `${currency} ${params.value.toFixed(2)}`;
                    },
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#fff',
                    backgroundColor: '#ec0000',
                    padding: [4, 8],
                    borderRadius: 4
                  }
                }
              ],
              itemStyle: {
                color: (params) => {
                  // 最高点用绿色，最低点用红色
                  return params.data.type === 'max' ? '#00da3c' : '#ec0000';
                },
                borderColor: '#fff',
                borderWidth: 2
              },
              symbolSize: 10,
              // 设置标注点的位置
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.3)'
                }
              }
            } : undefined
            */
          }]
        };

        // 为股票图表添加副标题，显示价格范围信息
        if (isStockChart) {
          config.title = {
            ...config.title,
            subtext: `当前: ${chartData.stockInfo.currency} ${chartData.stockInfo.currentPrice.toFixed(2)} (${chartData.stockInfo.priceChangePercent}%) | 区间: ${chartData.stockInfo.lowestPrice.toFixed(2)} - ${chartData.stockInfo.highestPrice.toFixed(2)}`,
            subtextStyle: {
              color: chartData.stockInfo.isUp ? '#00da3c' : '#ec0000',
              fontSize: 12
            }
          };
        }

        return config;

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

  // 已删除：从overview提取图表数据函数

  // 已删除：默认图表数据生成函数



  // 已删除：原Gemini数据处理函数

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 已删除：RAG查询构建函数

  // 已删除：额外数据点提取函数

  // 已删除：数据点扩展函数

  // 格式化overview内容，使其更用户友好 (暂时未使用，已注释)

  // 已删除：RAG接口调用函数

  // 智能路由：判断请求类型
  const routeRequest = (userInput) => {
    // 检测股票代码模式，支持多种格式：
    // 1. 3-4位数字：700, 0700
    // 2. 带.HK后缀：700.HK, 0700.HK
    const stockPatterns = [
      /\b(\d{3,4}\.HK)\b/i,  // 700.HK, 0700.HK
      /\b(\d{3,4})\b/        // 700, 0700
    ];

    for (const pattern of stockPatterns) {
      const match = userInput.match(pattern);
      if (match) {
        const ticker = match[1];
        return { type: 'stock', ticker: ticker };
      }
    }

    // 其他图表请求暂时不支持，直接走聊天
    // if (/图表|图|chart|可视化|数据/.test(userInput)) {
    //   return { type: 'rag' };
    // }

    // 默认聊天（包括图表请求）
    return { type: 'chat' };
  };

  // 处理股票查询
  const handleStockRequest = async (ticker) => {
    try {
      // 调用真实的股票API
      const stockData = await callStockAPI(ticker);

      // 转换为图表数据，默认使用1M数据展示更丰富的走势
      const chartData = convertStockDataToChart(stockData, '1M');

      let assistantMessage = {
        role: 'assistant',
        content: '', // 清空内容，只显示图表
        isChartRequest: true,
        chartData: chartData,
        chartConfig: convertToEChartsConfig(chartData),
        stockData: stockData
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('股票查询失败:', error);

      // 根据错误类型提供不同的提示
      let errorMessage = `股票代码 ${ticker} 查询失败`;

      if (error.message.includes('404')) {
        errorMessage = `股票代码 ${ticker} 不存在，请检查代码是否正确`;
      } else if (error.message.includes('500')) {
        errorMessage = `服务器暂时繁忙，请稍后重试股票代码 ${ticker}`;
      } else if (error.message.includes('network') || error.name === 'TypeError') {
        errorMessage = `网络连接异常，无法获取股票 ${ticker} 的数据`;
      } else {
        errorMessage = `股票代码 ${ticker} 查询失败: ${error.message}`;
      }

      // 股票查询失败时的错误处理
      let assistantMessage = {
        role: 'assistant',
        content: '',
        isChartRequest: true,
        chartError: errorMessage,
        chartData: null,
        chartConfig: null
      };

      setMessages(prev => [...prev, assistantMessage]);
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
      // 智能路由判断请求类型
      const route = routeRequest(currentInput);

      if (route.type === 'stock') {
        // 处理股票查询
        await handleStockRequest(route.ticker);
      } else {
        // 普通聊天请求
        if (currentInput.toLowerCase().includes('test') || currentInput.toLowerCase().includes('测试')) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🔧 **系统状态**：
📡 股票API: https://finapi.hkgai.asia/hk-timeseries/
📊 图表引擎: ECharts 6.0.0
🎯 支持格式: 700, 0700, 700.HK, 0700.HK

试试输入一个股票代码测试连接！`
          }]);
        } else if (/图表|图|chart|可视化|数据/.test(currentInput)) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `📊 **图表功能说明**：
当前界面专注于股票数据可视化，支持港股查询。

🔍 **如何使用**：
• 输入股票代码：700, 0700, 1810, 700.HK 等
• 自动生成专业的股价走势图
• 显示开高低收价格和成交量

💡 如需其他类型的图表，请切换到原界面使用RAG功能。`
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '您好！当前界面专门用于港股数据查询和可视化。请输入股票代码（如：700, 0700, 1810）查看走势图，或输入"测试"查看系统状态。'
          }]);
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
    <div className="new-chat-interface">
      <div className="new-chat-header">
        <h1>Fin Demo</h1>
        <div className="new-interface-controls">
          <button
            className="interface-toggle"
            onClick={onToggleInterface}
            title="返回主界面"
          >
            <span className="toggle-icon">🔄</span>
            返回主界面
          </button>
          <div className="new-interface-badge">
            <span className="badge-icon">✨</span>
            <span className="badge-text">New Interface</span>
          </div>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role} ${message.isChartRequest ? 'chart-message-container' : ''}`}>
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

                  {/* 文字内容 - 隐藏回答，只显示图表 */}
                  {/* {message.content && (
                    <div className="chart-text-content">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )} */}
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
          placeholder="输入股票代码查看走势：700, 0700, 700.HK, 0700.HK..."
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
