// 图表标注点测试文件
// 用于验证最高点和最低点标注的显示效果

// 模拟股票数据用于测试标注点
const mockChartData = {
  isChart: true,
  type: 'line',
  title: '0700.HK 股价走势 (↗ 12.97%)',
  xAxis: ['7-10', '7-11', '7-14', '7-15', '7-16', '7-17', '7-18', '7-21', '7-22', '7-23', '7-24', '7-25', '7-28', '7-29', '7-30', '7-31', '8-1', '8-4', '8-5', '8-6', '8-7', '8-8'],
  yAxis: [496.6, 496.6, 500.0, 517.5, 516.5, 517.0, 519.0, 521.5, 526.0, 552.0, 557.0, 550.5, 555.5, 555.0, 549.0, 550.0, 535.0, 550.0, 559.0, 568.5, 567.0, 561.0],
  stockInfo: {
    ticker: '0700.HK',
    currency: 'HKD',
    currentPrice: 561.0,
    priceChangePercent: '12.97',
    isUp: true,
    highestPrice: 568.5,
    lowestPrice: 496.6,
    priceRange: 71.9
  }
};

// 测试标注点配置
export const testMarkPointConfig = () => {
  console.log('=== 图表标注点配置测试 ===');
  
  const chartData = mockChartData;
  const isStockChart = true;
  const lineColor = chartData.stockInfo.isUp ? '#00da3c' : '#ec0000';
  
  const markPointConfig = {
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
        return params.data.type === 'max' ? '#00da3c' : '#ec0000';
      },
      borderColor: '#fff',
      borderWidth: 2
    },
    symbolSize: 10,
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)'
      }
    }
  };
  
  console.log('标注点配置:', markPointConfig);
  
  // 验证数据
  const maxValue = Math.max(...chartData.yAxis);
  const minValue = Math.min(...chartData.yAxis);
  
  console.log('数据验证:');
  console.log(`- 最高价: ${chartData.stockInfo.currency} ${maxValue.toFixed(2)}`);
  console.log(`- 最低价: ${chartData.stockInfo.currency} ${minValue.toFixed(2)}`);
  console.log(`- 价格区间: ${(maxValue - minValue).toFixed(2)}`);
  console.log(`- 波动率: ${((maxValue - minValue) / minValue * 100).toFixed(2)}%`);
  
  return markPointConfig;
};

// 测试标注点样式
export const testMarkPointStyles = () => {
  console.log('=== 标注点样式测试 ===');
  
  const styles = {
    最高点: {
      backgroundColor: '#00da3c',
      color: '#fff',
      symbol: '●',
      size: '10px'
    },
    最低点: {
      backgroundColor: '#ec0000', 
      color: '#fff',
      symbol: '●',
      size: '10px'
    }
  };
  
  console.log('样式配置:', styles);
  
  // 模拟标注文本格式
  const mockParams = [
    { value: 568.5, type: 'max' },
    { value: 496.6, type: 'min' }
  ];
  
  mockParams.forEach(param => {
    const currency = 'HKD';
    const formattedText = `${currency} ${param.value.toFixed(2)}`;
    console.log(`${param.type === 'max' ? '最高点' : '最低点'}标注: ${formattedText}`);
  });
  
  return styles;
};

// 在浏览器控制台中可以调用的测试函数
if (typeof window !== 'undefined') {
  window.testMarkPointConfig = testMarkPointConfig;
  window.testMarkPointStyles = testMarkPointStyles;
  console.log('图表标注点测试函数已加载:');
  console.log('- window.testMarkPointConfig() - 测试标注点配置');
  console.log('- window.testMarkPointStyles() - 测试标注点样式');
}
