export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { query, generate_overview, streaming, recalls } = req.body;

    console.log('Vercel API - Received RAG request:', { query, generate_overview, streaming, recalls });

    // 检查fetch是否可用
    if (typeof fetch === 'undefined') {
      console.error('fetch is not available');
      throw new Error('fetch is not available in this environment');
    }

    // 转发请求到实际的RAG API
    const response = await fetch('https://ragtest.hkgai.asia/api/rag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        generate_overview,
        streaming,
        recalls
      })
    });

    console.log('Vercel API - Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RAG API Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    console.log('Vercel API - RAG API Response received successfully');

    res.status(200).json(data);

  } catch (error) {
    console.error('Vercel API - RAG API Error:', error.message, error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
