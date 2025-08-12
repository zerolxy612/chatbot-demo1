// 价格格式化测试文件
// 用于验证所有价格显示都统一为小数点后两位

// 模拟股票数据
const mockStockData = {
  ticker: '0700.HK',
  currency: 'HKD',
  ranges: {
    '1M': [
      { date: '2025-07-10', open: 497.6000061035156, high: 499.6000061035156, low: 494.20001220703125, close: 496.6000061035156, volume: 14032556 },
      { date: '2025-08-08', open: 567.0, high: 568.5, low: 557.5, close: 561.0, volume: 13306819 }
    ]
  }
};

// 测试价格格式化
export const testPriceFormatting = () => {
  console.log('=== 价格格式化测试 ===');
  
  const rangeData = mockStockData.ranges['1M'];
  const firstPrice = rangeData[0]?.close || 0;
  const lastPrice = rangeData[rangeData.length - 1]?.close || 0;
  const highestPrice = Math.max(...rangeData.map(item => item.high));
  const lowestPrice = Math.min(...rangeData.map(item => item.low));
  
  console.log('原始价格数据:');
  console.log(`- 首价: ${firstPrice}`);
  console.log(`- 末价: ${lastPrice}`);
  console.log(`- 最高: ${highestPrice}`);
  console.log(`- 最低: ${lowestPrice}`);
  
  console.log('\n格式化后的价格显示:');
  
  // 1. 副标题中的价格格式
  const priceChangePercent = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
  const subtitleText = `当前: ${mockStockData.currency} ${lastPrice.toFixed(2)} (${priceChangePercent}%) | 区间: ${lowestPrice.toFixed(2)} - ${highestPrice.toFixed(2)}`;
  console.log(`- 副标题: ${subtitleText}`);
  
  // 2. 描述中的价格格式
  const descriptionText = `${mockStockData.ticker} 1M时间段股价数据，当前价格: ${mockStockData.currency} ${lastPrice.toFixed(2)}`;
  console.log(`- 描述: ${descriptionText}`);
  
  // 3. Y轴标签格式
  const yAxisFormatter = (value) => `${mockStockData.currency} ${value.toFixed(2)}`;
  console.log(`- Y轴标签示例: ${yAxisFormatter(lastPrice)}`);
  
  // 4. 工具提示格式
  const ohlc = [rangeData[1].open, rangeData[1].high, rangeData[1].low, rangeData[1].close];
  const tooltipText = `
    开盘: ${mockStockData.currency} ${ohlc[0].toFixed(2)}
    最高: ${mockStockData.currency} ${ohlc[1].toFixed(2)}
    最低: ${mockStockData.currency} ${ohlc[2].toFixed(2)}
    收盘: ${mockStockData.currency} ${ohlc[3].toFixed(2)}
  `;
  console.log(`- 工具提示:${tooltipText}`);
  
  // 5. 简单价格显示格式
  const simplePriceText = `价格: ${mockStockData.currency} ${lastPrice.toFixed(2)}`;
  console.log(`- 简单价格: ${simplePriceText}`);
  
  return {
    subtitle: subtitleText,
    description: descriptionText,
    yAxis: yAxisFormatter(lastPrice),
    tooltip: tooltipText.trim(),
    simplePrice: simplePriceText
  };
};

// 测试所有可能的价格显示场景
export const testAllPriceScenarios = () => {
  console.log('=== 所有价格显示场景测试 ===');
  
  const testPrices = [
    496.6000061035156,  // 带多位小数
    561.0,              // 整数
    568.5,              // 一位小数
    494.20001220703125, // 超长小数
    500,                // 纯整数
    517.99999           // 接近整数
  ];
  
  testPrices.forEach((price, index) => {
    console.log(`测试价格 ${index + 1}: ${price} → HKD ${price.toFixed(2)}`);
  });
  
  // 测试边界情况
  console.log('\n边界情况测试:');
  console.log(`0 → HKD ${(0).toFixed(2)}`);
  console.log(`0.1 → HKD ${(0.1).toFixed(2)}`);
  console.log(`0.01 → HKD ${(0.01).toFixed(2)}`);
  console.log(`0.001 → HKD ${(0.001).toFixed(2)}`);
  console.log(`999.999 → HKD ${(999.999).toFixed(2)}`);
  
  return testPrices.map(price => ({
    original: price,
    formatted: `HKD ${price.toFixed(2)}`
  }));
};

// 在浏览器控制台中可以调用的测试函数
if (typeof window !== 'undefined') {
  window.testPriceFormatting = testPriceFormatting;
  window.testAllPriceScenarios = testAllPriceScenarios;
  console.log('价格格式化测试函数已加载:');
  console.log('- window.testPriceFormatting() - 测试价格格式化');
  console.log('- window.testAllPriceScenarios() - 测试所有价格场景');
}
