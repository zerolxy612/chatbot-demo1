export default async function handler(req, res) {
  console.log('Law RAG API - Handler started, method:', req.method);
  console.log('Law RAG API - Path:', req.query.path);

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    console.log('Law RAG API - Handling OPTIONS request');
    res.status(200).end();
    return;
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    console.log('Law RAG API - Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('Law RAG API - Processing POST request');
    console.log('Law RAG API - Request body:', req.body);

    const { model, messages, stream } = req.body || {};

    console.log('Law RAG API - Extracted params:', { model, messages, stream });

    // 检查必要参数
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Missing required parameter: messages');
    }

    // 检查fetch是否可用
    if (typeof fetch === 'undefined') {
      console.error('fetch is not available');
      throw new Error('fetch is not available in this environment');
    }

    console.log('Law RAG API - About to call external API');

    // 构建目标URL - 保持原始路径
    const pathArray = req.query.path || [];
    const targetPath = Array.isArray(pathArray) ? pathArray.join('/') : pathArray;
    const targetUrl = `https://lexihkrag-test.hkgai.asia/${targetPath}`;
    
    console.log('Law RAG API - Target URL:', targetUrl);

    // 转发请求到实际的Law RAG API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages,
        stream: stream || false
      })
    });

    console.log('Law RAG API - External API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External Law RAG API Error:', response.status, errorText);
      throw new Error(`External API error! status: ${response.status}, message: ${errorText}`);
    }

    // 返回响应数据
    const data = await response.json();
    console.log('Law RAG API - Successfully received data from external API');
    res.status(200).json(data);

  } catch (error) {
    console.error('Law RAG API - Error occurred:', error.message);
    console.error('Law RAG API - Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
