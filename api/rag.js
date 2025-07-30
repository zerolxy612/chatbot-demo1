export default async function handler(req, res) {
  console.log('Vercel API - Handler started, method:', req.method);

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    console.log('Vercel API - Handling OPTIONS request');
    res.status(200).end();
    return;
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    console.log('Vercel API - Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('Vercel API - Processing POST request');
    console.log('Vercel API - Request body:', req.body);

    const { query, generate_overview, streaming, recalls } = req.body || {};

    console.log('Vercel API - Extracted params:', { query, generate_overview, streaming, recalls });

    // 检查必要参数
    if (!query) {
      throw new Error('Missing required parameter: query');
    }

    // 检查fetch是否可用
    if (typeof fetch === 'undefined') {
      console.error('fetch is not available');
      throw new Error('fetch is not available in this environment');
    }

    console.log('Vercel API - About to call external API');

    // 尝试多个可能的 API 端点
    const apiEndpoints = [
      'https://ragtest.hkgai.asia/api/rag',
      'https://ragtest.hkgai.asia/rag',
      'https://ragtest.hkgai.asia/api/v1/rag'
    ];

    let lastError = null;
    let response = null;

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`Vercel API - Trying endpoint: ${endpoint}`);

        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            generate_overview: generate_overview || false,
            streaming: streaming || false,
            recalls: recalls || { serpapi: {}, elasticsearch: {}, faq: {} }
          })
        });

        console.log(`Vercel API - Response from ${endpoint}:`, response.status);

        if (response.ok) {
          break; // 成功，跳出循环
        } else if (response.status === 404) {
          console.log(`Vercel API - 404 from ${endpoint}, trying next endpoint`);
          continue; // 404 错误，尝试下一个端点
        } else {
          // 其他错误，记录并继续尝试
          const errorText = await response.text();
          lastError = new Error(`${endpoint} returned ${response.status}: ${errorText}`);
          console.error('Vercel API - Error from', endpoint, ':', lastError.message);
          continue;
        }
      } catch (error) {
        console.error(`Vercel API - Network error with ${endpoint}:`, error.message);
        lastError = error;
        continue;
      }
    }

    // 如果所有端点都失败了
    if (!response || !response.ok) {
      // 返回模拟数据作为后备方案
      console.log('Vercel API - All endpoints failed, returning mock data');
      const mockData = {
        reference: [
          {
            title: "模拟参考资料 1",
            content: "这是一个模拟的参考资料内容，用于测试当外部 RAG API 不可用时的情况。",
            source: "mock_source_1"
          },
          {
            title: "模拟参考资料 2",
            content: "这是另一个模拟的参考资料内容，包含了与查询相关的信息。",
            source: "mock_source_2"
          }
        ],
        answer: `基于您的查询 "${query}"，我找到了一些相关信息。请注意，当前使用的是模拟数据，因为外部 RAG API 暂时不可用。`,
        query: query,
        status: "mock_response",
        message: "外部 RAG API 不可用，返回模拟数据"
      };

      res.status(200).json(mockData);
      return;
    }

    const data = await response.json();
    console.log('Vercel API - Successfully received data from external API');

    res.status(200).json(data);

  } catch (error) {
    console.error('Vercel API - Error occurred:', error.message);
    console.error('Vercel API - Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
