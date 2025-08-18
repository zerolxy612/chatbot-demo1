export default async function handler(req, res) {
  console.log('Law RAG API - Handler started, method:', req.method);
  console.log('Law RAG API - Request path:', req.url);

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

    // 检查fetch是否可用
    if (typeof fetch === 'undefined') {
      console.error('fetch is not available');
      throw new Error('fetch is not available in this environment');
    }

    console.log('Law RAG API - About to call external API');

    // 转发请求到实际的Law RAG API
    const targetUrl = 'https://lexihkrag-test.hkgai.asia/v1/chat/completions';
    console.log('Law RAG API - Target URL:', targetUrl);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    console.log('Law RAG API - External API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External Law RAG API Error:', response.status, errorText);
      throw new Error(`External API error! status: ${response.status}, message: ${errorText}`);
    }

    // 检查是否为流式请求
    if (req.body.stream) {
      console.log('Law RAG API - Handling streaming response');

      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

      // 流式转发响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error('Law RAG API - Streaming error:', streamError);
        res.end();
      }
    } else {
      // 非流式响应
      const data = await response.json();
      console.log('Law RAG API - Successfully received data from external API');
      res.status(200).json(data);
    }

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
