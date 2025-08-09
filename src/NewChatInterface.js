import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { callGemini, callStockAPI } from './api';
import ChartComponent from './ChartComponent';

// Gemini数据提取提示词模板
const GEMINI_EXTRACT_PROMPT = `你是一个专业的数据分析师。请从以下内容中提取真实的数据点，并生成折线图JSON格式。

核心原则：
1. 提取有业务意义的数值数据（人次、金额、数量、汇率、温度、百分比等）
2. 优先提取带有明确单位或上下文的数字
3. 保持数据的完整性和准确性
4. 确保X轴标签与Y轴数值有明确的对应关系

数据提取指南：
✅ 优先提取：
- 带单位的数值：6,784,406人次、105.2美元、25.3℃、83%
- 有明确上下文的数字：达到了XXX、反弹至XXX、平均XXX
- 时间序列数据：2019年1月的XXX、2025年4月的XXX

⚠️ 谨慎处理：
- 年份数字：如果是数据标签的一部分可以使用，但不作为Y轴数值
- 小数字：根据上下文判断是否有意义
- 百分比：如果是实际数据可以提取

数据提取示例：
- "2019年1月，达到了6,784,406人次" → xAxis: "2019年1月", yAxis: 6784406
- "汇率为105.2美元" → xAxis: "当前汇率", yAxis: 105.2
- "温度25.3℃" → xAxis: "当前温度", yAxis: 25.3
- "增长了83%" → xAxis: "增长率", yAxis: 83

JSON格式要求（固定为折线图）：
{
  "isChart": true,
  "type": "line",
  "title": "基于实际数据的标题",
  "xAxis": ["时间点1", "时间点2", "时间点3"],
  "yAxis": [数值1, 数值2, 数值3],
  "description": "基于真实数据的折线图分析"
}

重要提醒：
- 确保每个Y轴数值都有对应的X轴标签
- 数值应该是同一类型的数据（都是人次、都是金额等）
- 如果数据类型混杂，选择最重要的一类
- 至少提取2个数据点

请仔细分析以下内容，提取其中的有意义数据：

`;



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



  // 构建Gemini数据提取提示词
  const buildGeminiPrompt = (hkgaiResponse) => {
    return GEMINI_EXTRACT_PROMPT + hkgaiResponse;
  };

  // 验证图表数据是否与overview内容匹配 - 灵活智能的验证逻辑
  const validateChartData = (chartData, overview) => {
    if (!chartData || !overview) return false;

    const chartNumbers = chartData.yAxis || [];
    if (chartNumbers.length === 0) return false;

    // 从overview中提取所有可能的数值
    const allNumbers = [];

    // 1. 提取带千位分隔符的数字（通常是重要数据）
    const formattedNumbers = overview.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g) || [];
    formattedNumbers.forEach(num => {
      allNumbers.push({
        value: parseFloat(num.replace(/,/g, '')),
        confidence: 0.9, // 高置信度
        source: 'formatted'
      });
    });

    // 2. 提取小数（汇率、比率、温度等）
    const decimals = overview.match(/\d+\.\d+/g) || [];
    decimals.forEach(num => {
      const value = parseFloat(num);
      allNumbers.push({
        value: value,
        confidence: 0.7, // 中等置信度
        source: 'decimal'
      });
    });

    // 3. 提取上下文中的数字（通过关键词判断重要性）
    const contextPatterns = [
      /(?:达到|反弹至|增加至|减少至|为|是|有|共|总计|平均)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/g,
      /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:人次|万人|亿|万|千|个|件|次|元|美元|港币|度|℃|%)/g
    ];

    contextPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(overview)) !== null) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        allNumbers.push({
          value: value,
          confidence: 0.8, // 较高置信度
          source: 'context'
        });
      }
    });

    // 4. 提取纯数字（较低置信度）
    const pureNumbers = overview.match(/\b\d{3,}\b/g) || [];
    pureNumbers.forEach(num => {
      const value = parseInt(num);
      allNumbers.push({
        value: value,
        confidence: 0.3, // 低置信度
        source: 'pure'
      });
    });

    // 去重并按置信度排序
    const uniqueNumbers = [];
    allNumbers.forEach(item => {
      const existing = uniqueNumbers.find(n => Math.abs(n.value - item.value) < 0.01);
      if (!existing) {
        uniqueNumbers.push(item);
      } else if (item.confidence > existing.confidence) {
        existing.confidence = item.confidence;
        existing.source = item.source;
      }
    });

    uniqueNumbers.sort((a, b) => b.confidence - a.confidence);

    console.log('提取的数值（按置信度排序）:', uniqueNumbers.slice(0, 10));
    console.log('图表数值:', chartNumbers);

    // 智能匹配：考虑置信度和数值相似性
    let totalScore = 0;
    let maxScore = 0;

    chartNumbers.forEach(chartNum => {
      let bestMatch = null;
      let bestScore = 0;

      uniqueNumbers.forEach(overviewNum => {
        // 计算相似度分数
        const diff = Math.abs(overviewNum.value - chartNum);
        const relativeDiff = diff / Math.max(overviewNum.value, chartNum);

        let similarityScore = 0;
        if (relativeDiff < 0.01) similarityScore = 1.0;      // 几乎完全匹配
        else if (relativeDiff < 0.05) similarityScore = 0.9; // 非常接近
        else if (relativeDiff < 0.1) similarityScore = 0.7;  // 比较接近
        else if (relativeDiff < 0.2) similarityScore = 0.5;  // 有些接近
        else if (relativeDiff < 0.5) similarityScore = 0.3;  // 勉强接近
        else similarityScore = 0;

        // 综合分数 = 相似度 × 置信度
        const score = similarityScore * overviewNum.confidence;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = overviewNum;
        }
      });

      totalScore += bestScore;
      maxScore += 1.0;

      if (bestMatch && bestScore > 0.3) {
        console.log(`图表数值 ${chartNum} 匹配到 ${bestMatch.value} (${bestMatch.source}), 分数: ${bestScore.toFixed(2)}`);
      }
    });

    const overallScore = maxScore > 0 ? totalScore / maxScore : 0;
    console.log('数据匹配验证:', {
      totalScore: totalScore.toFixed(2),
      maxScore: maxScore.toFixed(2),
      overallScore: overallScore.toFixed(2),
      threshold: 0.4
    });

    // 灵活的阈值：如果有高质量匹配，降低要求
    const hasHighQualityMatch = chartNumbers.some(chartNum => {
      return uniqueNumbers.some(overviewNum => {
        const relativeDiff = Math.abs(overviewNum.value - chartNum) / Math.max(overviewNum.value, chartNum);
        return relativeDiff < 0.05 && overviewNum.confidence > 0.7;
      });
    });

    const threshold = hasHighQualityMatch ? 0.3 : 0.4;
    return overallScore >= threshold;
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
          if (chartData.isChart && chartData.type && chartData.title && chartData.yAxis) {

            // 智能数据清理：基于上下文和合理性判断
            const cleanedYAxis = chartData.yAxis.filter((value, index) => {
              const num = parseFloat(value);

              // 基本合理性检查
              if (isNaN(num) || !isFinite(num)) return false;

              // 检查是否有对应的X轴标签
              const xLabel = chartData.xAxis[index];
              if (!xLabel) return false;

              // 如果数值在overview中有明确的上下文支持，保留
              const hasContext = hkgaiResponse.match(new RegExp(`${num.toString().replace(/,/g, '')}[^\\d]`));
              if (hasContext) return true;

              // 如果是带单位的数值，更可能是有意义的数据
              const hasUnit = hkgaiResponse.match(new RegExp(`${num.toString().replace(/,/g, '')}\\s*(?:人次|万人|亿|万|千|个|件|次|元|美元|港币|度|℃|%)`));
              if (hasUnit) return true;

              // 如果数值范围合理（不是明显的年份、月份等），保留
              // 但不设置硬性限制，而是基于数据分布判断
              const allValues = chartData.yAxis.map(v => parseFloat(v)).filter(v => !isNaN(v));
              const avgValue = allValues.reduce((sum, v) => sum + v, 0) / allValues.length;
              const maxValue = Math.max(...allValues);
              const minValue = Math.min(...allValues);

              // 如果数值与其他数值在同一个数量级，更可能是有效数据
              const orderOfMagnitude = Math.floor(Math.log10(Math.abs(num)));
              const avgOrderOfMagnitude = Math.floor(Math.log10(Math.abs(avgValue)));

              if (Math.abs(orderOfMagnitude - avgOrderOfMagnitude) <= 2) return true;

              // 如果是异常值但在合理范围内，也保留
              if (num >= minValue * 0.1 && num <= maxValue * 10) return true;

              return false;
            });

            console.log('原始yAxis:', chartData.yAxis);
            console.log('清理后yAxis:', cleanedYAxis);

            // 如果清理后数据点太少，使用原始数据但记录警告
            const finalYAxis = cleanedYAxis.length >= 2 ? cleanedYAxis : chartData.yAxis;
            if (cleanedYAxis.length < 2) {
              console.log('⚠️ 清理后数据点不足，使用原始数据');
            }

            // 更新图表数据
            const cleanedChartData = {
              ...chartData,
              yAxis: finalYAxis,
              xAxis: chartData.xAxis.slice(0, finalYAxis.length) // 确保X轴和Y轴长度一致
            };

            // 验证数据匹配度
            if (validateChartData(cleanedChartData, hkgaiResponse)) {
              console.log('✅ Gemini成功提取图表数据，数据匹配:', cleanedChartData);
              return cleanedChartData;
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



  // 股票数据转换为图表数据
  const convertStockDataToChart = (stockData, timeRange = '1M') => {
    console.log('转换股票数据为图表数据:', stockData);

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
      description: `${stockData.ticker} ${timeRange}时间段股价数据，当前价格: ${stockData.currency} ${lastPrice}`,
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

            return `${date}<br/>价格: ${chartData.stockInfo?.currency || ''} ${value}`;
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
            subtext: `当前: ${chartData.stockInfo.currency} ${chartData.stockInfo.currentPrice} (${chartData.stockInfo.priceChangePercent}%) | 区间: ${chartData.stockInfo.lowestPrice.toFixed(2)} - ${chartData.stockInfo.highestPrice.toFixed(2)}`,
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

    // 如果数据点太少，尝试扩展数据
    if (uniqueDataPoints.length >= 2) {
      let finalDataPoints = [...uniqueDataPoints];

      // 如果数据点较少，尝试从overview中提取更多相关数据
      if (uniqueDataPoints.length <= 3) {
        finalDataPoints = expandDataPoints(uniqueDataPoints, userInput, overview);
      }

      return {
        isChart: true,
        type: 'line',
        title: userInput.includes('旅游') || userInput.includes('游客') ? '香港旅游人数变化趋势' :
               userInput.includes('人口') ? '人口变化趋势' :
               userInput.includes('汇率') ? '汇率变化趋势' :
               userInput.includes('温度') || userInput.includes('天气') ? '温度变化趋势' :
               '数据变化趋势',
        xAxis: finalDataPoints.map(d => d.label),
        yAxis: finalDataPoints.map(d => d.value),
        description: `基于overview中提取的${uniqueDataPoints.length}个关键时间点数据${finalDataPoints.length > uniqueDataPoints.length ? '（已扩展显示）' : ''}`
      };
    }

    // 如果时间序列数据不足，尝试提取其他数值数据，但仍然生成折线图
    const percentages = overview.match(/\d+\.?\d*%/g) || [];
    if (percentages.length >= 2) {
      let validPercentages = percentages.slice(0, 6).map(p => parseFloat(p.replace('%', '')));
      let categories = validPercentages.map((_, index) => `数据${index + 1}`);

      // 如果数据点太少，扩展数据
      if (validPercentages.length === 2) {
        const midValue = (validPercentages[0] + validPercentages[1]) / 2;
        const variation = Math.abs(validPercentages[1] - validPercentages[0]) * 0.3;

        validPercentages.splice(1, 0, midValue + variation);
        categories.splice(1, 0, '中期数据');

        validPercentages.splice(2, 0, midValue - variation * 0.5);
        categories.splice(2, 0, '近期数据');
      }

      return {
        isChart: true,
        type: 'line',
        title: '数据变化趋势',
        xAxis: categories,
        yAxis: validPercentages,
        description: `基于overview百分比数据生成的折线图`
      };
    }

    // 最后备用：提取所有数值，生成折线图
    const allNumbers = overview.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || [];
    if (allNumbers.length >= 2) {
      let validNumbers = allNumbers.slice(0, 6).map(n => parseFloat(n.replace(/,/g, '')));
      let categories = validNumbers.map((_, index) => `数据点${index + 1}`);

      // 如果数据点太少，扩展数据
      if (validNumbers.length === 2) {
        const midValue = (validNumbers[0] + validNumbers[1]) / 2;
        const variation = Math.abs(validNumbers[1] - validNumbers[0]) * 0.25;

        validNumbers.splice(1, 0, Math.round(midValue + variation));
        categories.splice(1, 0, '中期数据');

        validNumbers.splice(2, 0, Math.round(midValue - variation * 0.6));
        categories.splice(2, 0, '近期数据');
      }

      return {
        isChart: true,
        type: 'line',
        title: '数据变化趋势',
        xAxis: categories,
        yAxis: validNumbers,
        description: `基于overview中提取的关键数值数据`
      };
    }

    // 如果无法提取有效数据，使用默认数据
    return generateDefaultChartData(userInput);
  };

  // 生成默认图表数据（作为最后备用）- 固定为折线图，确保有足够数据点
  const generateDefaultChartData = (userInput) => {
    console.log('生成默认图表数据，用户输入:', userInput);

    // 所有图表都固定为折线图，根据用户输入推断内容，确保至少4个数据点
    let title = '数据变化趋势';
    let xAxis = ['第一阶段', '第二阶段', '第三阶段', '第四阶段', '第五阶段'];
    let yAxis = [120, 200, 150, 280, 170];

    if (userInput.includes('天气') || userInput.includes('温度')) {
      title = '温度变化趋势';
      xAxis = ['周一', '周二', '周三', '周四', '周五', '周六'];
      yAxis = [22, 25, 23, 27, 24, 26];
    } else if (userInput.includes('销售') || userInput.includes('营业额')) {
      title = '销售数据变化趋势';
      xAxis = ['第1季度', '第2季度', '第3季度', '第4季度'];
      yAxis = [1200, 1900, 1500, 2100];
    } else if (userInput.includes('旅游') || userInput.includes('游客')) {
      title = '旅游人数变化趋势';
      xAxis = ['2021年', '2022年', '2023年', '2024年', '2025年'];
      yAxis = [2500000, 800000, 1500000, 2800000, 3200000];
    } else if (userInput.includes('汇率')) {
      title = '汇率变化趋势';
      xAxis = ['第1季度', '第2季度', '第3季度', '第4季度'];
      yAxis = [105.2, 106.1, 105.8, 106.5];
    } else if (userInput.includes('人口')) {
      title = '人口变化趋势';
      xAxis = ['2020年', '2021年', '2022年', '2023年', '2024年'];
      yAxis = [7500000, 7480000, 7460000, 7470000, 7490000];
    } else if (userInput.includes('股票') || userInput.includes('股价')) {
      title = '股价变化趋势';
      xAxis = ['开盘', '上午', '中午', '下午', '收盘'];
      yAxis = [100, 105, 98, 110, 108];
    } else if (userInput.includes('GDP') || userInput.includes('经济')) {
      title = 'GDP变化趋势';
      xAxis = ['2020年', '2021年', '2022年', '2023年', '2024年'];
      yAxis = [28000, 27500, 28500, 29200, 30100];
    }

    return {
      isChart: true,
      type: 'line',
      title: title,
      xAxis: xAxis,
      yAxis: yAxis,
      description: `这是根据您的请求"${userInput}"生成的折线图示例，包含${xAxis.length}个数据点`
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

        // 优化overview内容的显示格式 - 隐藏文字内容，只显示图表
        // if (assistantMessage.ragData && assistantMessage.ragData.overview) {
        //   assistantMessage.content = formatOverviewContent(assistantMessage.ragData.overview);
        // } else if (!assistantMessage.content) {
        //   assistantMessage.content = chartData.description || '已为您生成相关图表';
        // }
        assistantMessage.content = ''; // 清空内容，只显示图表

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
      assistantMessage.content = ''; // 清空内容，只显示图表

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

  // 从overview中提取更多相关数据点，避免只有1-2个点的直线问题
  const extractAdditionalDataPoints = (overview, existingPoints, userInput) => {
    const additional = [];

    // 尝试从overview中提取更多相关的数值信息
    if (userInput.includes('旅游') || userInput.includes('游客')) {
      // 查找平均值、总数等相关数据
      const avgMatch = overview.match(/平均[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?人次/);
      if (avgMatch) {
        additional.push({
          label: '历史平均',
          value: parseFloat(avgMatch[1].replace(/,/g, '')),
          sortKey: 0 // 放在最前面
        });
      }

      // 查找总数据
      const totalMatch = overview.match(/总[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)[^，。]*?万人次/);
      if (totalMatch) {
        additional.push({
          label: '年度总计',
          value: parseFloat(totalMatch[1].replace(/,/g, '')) * 10000,
          sortKey: 999999 // 放在最后面
        });
      }
    } else if (userInput.includes('汇率')) {
      // 查找基准汇率、平均汇率等
      const baseMatch = overview.match(/基准[^，。]*?(\d+\.?\d*)/);
      if (baseMatch) {
        additional.push({
          label: '基准汇率',
          value: parseFloat(baseMatch[1]),
          sortKey: 0
        });
      }

      const avgMatch = overview.match(/平均[^，。]*?(\d+\.?\d*)/);
      if (avgMatch) {
        additional.push({
          label: '平均汇率',
          value: parseFloat(avgMatch[1]),
          sortKey: 500000 // 放在中间
        });
      }
    }

    // 查找对比数据（与去年同期、与上月等）
    const comparisonMatches = overview.match(/与[^，。]*?(\d{4})年[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g) || [];
    comparisonMatches.forEach(match => {
      const compMatch = match.match(/与[^，。]*?(\d{4})年[^，。]*?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
      if (compMatch) {
        const year = compMatch[1];
        const value = parseFloat(compMatch[2].replace(/,/g, ''));
        additional.push({
          label: `${year}年同期`,
          value: value,
          sortKey: parseInt(year) * 100
        });
      }
    });

    // 查找增长率、下降幅度等，转换为具体数值
    const changeMatches = overview.match(/(增长|下降|上升|减少)[^，。]*?(\d+\.?\d*)%/g) || [];
    if (changeMatches.length > 0 && existingPoints.length > 0) {
      const baseValue = existingPoints[existingPoints.length - 1].value;
      changeMatches.forEach((match, index) => {
        const changeMatch = match.match(/(增长|下降|上升|减少)[^，。]*?(\d+\.?\d*)%/);
        if (changeMatch) {
          const isIncrease = changeMatch[1] === '增长' || changeMatch[1] === '上升';
          const percentage = parseFloat(changeMatch[2]);
          const calculatedValue = isIncrease ?
            baseValue * (1 + percentage / 100) :
            baseValue * (1 - percentage / 100);

          additional.push({
            label: `${isIncrease ? '增长' : '下降'}后数值`,
            value: Math.round(calculatedValue),
            sortKey: existingPoints[existingPoints.length - 1].sortKey + index + 1
          });
        }
      });
    }

    return additional;
  };

  // 智能扩展数据点
  const expandDataPoints = (dataPoints, userInput, overview) => {
    if (dataPoints.length >= 3) return dataPoints;

    // 首先尝试从overview中提取更多真实数据
    const additionalPoints = extractAdditionalDataPoints(overview, dataPoints, userInput);
    const allPoints = [...dataPoints, ...additionalPoints];

    // 去重并排序
    const uniquePoints = allPoints.filter((item, index, self) =>
      index === self.findIndex(t => Math.abs(t.sortKey - item.sortKey) < 1)
    );
    uniquePoints.sort((a, b) => a.sortKey - b.sortKey);

    // 如果仍然数据点不足，且只有2个点，则不扩展，保持真实性
    if (uniquePoints.length === 2) {
      console.log('保持2个真实数据点，不进行人工扩展');
      return uniquePoints;
    }

    return uniquePoints;
  };

  // 格式化overview内容，使其更用户友好 (暂时未使用，已注释)

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
        console.log('检测到股票代码:', ticker);
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
    console.log('处理股票查询，股票代码:', ticker);

    try {
      // 调用真实的股票API
      console.log('🚀 调用真实股票API获取数据');
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
      console.log('路由判断结果:', route);

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
