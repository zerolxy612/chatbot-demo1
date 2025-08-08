// 股票数据转换测试文件
// 用于验证股票API数据转换逻辑

// 模拟股票API返回的数据结构
const mockStockData = {
  "ticker": "0700.HK",
  "market": "HK",
  "timezone": "Asia/Hong_Kong",
  "currency": "HKD",
  "ranges": {
    "1D": [
      {
        "date": "2025-08-08",
        "open": 567.0,
        "high": 568.5,
        "low": 557.5,
        "close": 561.0,
        "adj_close": 561.0,
        "volume": 13306819
      }
    ],
    "5D": [
      {
        "date": "2025-08-04",
        "open": 536.0,
        "high": 551.5,
        "low": 533.0,
        "close": 550.0,
        "adj_close": 550.0,
        "volume": 17340007
      },
      {
        "date": "2025-08-05",
        "open": 554.5,
        "high": 559.0,
        "low": 549.0,
        "close": 559.0,
        "adj_close": 559.0,
        "volume": 17347823
      },
      {
        "date": "2025-08-06",
        "open": 560.0,
        "high": 570.0,
        "low": 558.0,
        "close": 568.5,
        "adj_close": 568.5,
        "volume": 20737133
      },
      {
        "date": "2025-08-07",
        "open": 571.0,
        "high": 572.0,
        "low": 560.5,
        "close": 567.0,
        "adj_close": 567.0,
        "volume": 16940382
      },
      {
        "date": "2025-08-08",
        "open": 567.0,
        "high": 568.5,
        "low": 557.5,
        "close": 561.0,
        "adj_close": 561.0,
        "volume": 13306819
      }
    ]
  },
  "source": "Yahoo Finance"
};

// 测试数据转换函数
const testStockDataConversion = () => {
  console.log('=== 股票数据转换测试 ===');
  console.log('原始数据:', mockStockData);
  
  // 这里可以测试转换逻辑
  const timeRange = '5D';
  const rangeData = mockStockData.ranges[timeRange];
  
  console.log('选择的时间范围:', timeRange);
  console.log('数据点数量:', rangeData.length);
  
  // 计算涨跌
  const firstPrice = rangeData[0]?.close || 0;
  const lastPrice = rangeData[rangeData.length - 1]?.close || 0;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = firstPrice > 0 ? ((priceChange / firstPrice) * 100).toFixed(2) : 0;
  const isUp = priceChange >= 0;
  
  console.log('价格变化分析:', {
    firstPrice,
    lastPrice,
    priceChange,
    priceChangePercent,
    isUp
  });
  
  // 生成图表数据
  const chartData = {
    isChart: true,
    type: 'line',
    title: `${mockStockData.ticker} 股价走势 (${isUp ? '↗' : '↘'} ${priceChangePercent}%)`,
    xAxis: rangeData.map(item => {
      const date = new Date(item.date);
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }),
    yAxis: rangeData.map(item => item.close),
    description: `${mockStockData.ticker} ${timeRange}时间段股价数据，当前价格: ${mockStockData.currency} ${lastPrice}`,
    stockInfo: {
      ticker: mockStockData.ticker,
      market: mockStockData.market,
      currency: mockStockData.currency,
      currentPrice: lastPrice,
      priceChange: priceChange,
      priceChangePercent: priceChangePercent,
      isUp: isUp
    }
  };
  
  console.log('转换后的图表数据:', chartData);
  
  return chartData;
};

// 导出测试函数
export { mockStockData, testStockDataConversion };
