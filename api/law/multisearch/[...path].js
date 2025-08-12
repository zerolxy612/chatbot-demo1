export default async function handler(req, res) {
  console.log('Law Multisearch API - Handler started, method:', req.method);
  console.log('Law Multisearch API - Path:', req.query.path);

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    console.log('Law Multisearch API - Handling OPTIONS request');
    res.status(200).end();
    return;
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    console.log('Law Multisearch API - Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('Law Multisearch API - Processing POST request');
    console.log('Law Multisearch API - Request body:', req.body);

    // 构建目标URL路径
    const pathSegments = req.query.path || [];
    const targetPath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;
    const targetUrl = `https://lexihk-search-test.hkgai.asia/${targetPath}`;
    
    console.log('Law Multisearch API - Target URL:', targetUrl);

    // 检查fetch是否可用
    if (typeof fetch === 'undefined') {
      console.error('fetch is not available');
      throw new Error('fetch is not available in this environment');
    }

    console.log('Law Multisearch API - About to call external API');

    // 转发请求到实际的Law Multisearch API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    console.log('Law Multisearch API - External API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External Law Multisearch API Error:', response.status, errorText);
      throw new Error(`External API error! status: ${response.status}, message: ${errorText}`);
    }

    // 获取响应数据
    const data = await response.json();
    console.log('Law Multisearch API - Successfully received data from external API');
    res.status(200).json(data);

  } catch (error) {
    console.error('Law Multisearch API - Error occurred:', error.message);
    console.error('Law Multisearch API - Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
