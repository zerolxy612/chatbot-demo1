export default function handler(req, res) {
  console.log('Test API - Method:', req.method);
  console.log('Test API - Body:', req.body);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    message: 'Test API is working!',
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    fetchAvailable: typeof fetch !== 'undefined'
  });
}
