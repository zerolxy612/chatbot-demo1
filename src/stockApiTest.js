// 股票API测试文件
// 用于测试真实API连接和数据格式

import { callStockAPI } from './api';

// 测试不同格式的股票代码
const testStockCodes = [
  '700',      // 腾讯控股
  '0700',     // 腾讯控股（带前导0）
  '700.HK',   // 腾讯控股（带后缀）
  '0700.HK',  // 腾讯控股（完整格式）
  '1810',     // 小米集团
  '1810.HK'   // 小米集团（带后缀）
];

// 测试API连接
export const testStockAPI = async () => {
  console.log('=== 股票API连接测试开始 ===');
  
  for (const ticker of testStockCodes) {
    try {
      console.log(`\n测试股票代码: ${ticker}`);
      const startTime = performance.now();
      
      const data = await callStockAPI(ticker);
      
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      console.log(`✅ ${ticker} 查询成功 (${responseTime}ms)`);
      console.log('数据结构:', {
        ticker: data.ticker,
        market: data.market,
        currency: data.currency,
        ranges: Object.keys(data.ranges || {}),
        source: data.source
      });
      
      // 检查数据完整性
      if (data.ranges && data.ranges['1M']) {
        const monthData = data.ranges['1M'];
        console.log(`📊 1M数据点数量: ${monthData.length}`);
        if (monthData.length > 0) {
          const latest = monthData[monthData.length - 1];
          console.log(`📈 最新价格: ${data.currency} ${latest.close}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ ${ticker} 查询失败:`, error.message);
    }
  }
  
  console.log('\n=== 股票API连接测试完成 ===');
};

// 测试单个股票代码
export const testSingleStock = async (ticker) => {
  try {
    console.log(`测试单个股票: ${ticker}`);
    const data = await callStockAPI(ticker);
    console.log('API响应数据:', data);
    return data;
  } catch (error) {
    console.error(`股票 ${ticker} 测试失败:`, error);
    throw error;
  }
};

// 在浏览器控制台中可以调用的测试函数
if (typeof window !== 'undefined') {
  window.testStockAPI = testStockAPI;
  window.testSingleStock = testSingleStock;
  console.log('股票API测试函数已加载到window对象:');
  console.log('- window.testStockAPI() - 测试所有股票代码');
  console.log('- window.testSingleStock("700") - 测试单个股票代码');
}
