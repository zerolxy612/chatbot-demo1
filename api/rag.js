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

    // 转发请求到实际的RAG API
    const response = await fetch('https://ragtest.hkgai.asia/api/rag', {
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

    console.log('Vercel API - External API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External RAG API Error:', response.status, errorText);
      throw new Error(`External API error! status: ${response.status}, message: ${errorText}`);
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
