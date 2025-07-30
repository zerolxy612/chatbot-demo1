const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // 新的RAG API代理 - 必须放在更通用的/api代理之前
  app.use(
    '/api/rag',
    createProxyMiddleware({
      target: 'https://ragtest.hkgai.asia',
      changeOrigin: true,
      pathRewrite: {
        '^/api/rag': '', // 移除 /api/rag 前缀
      },
      secure: true,
      logLevel: 'debug'
    })
  );

  // 原有的OpenAI API代理
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://oneapi.hkgai.net/v1',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // remove base path
      },
      headers: {
        'Authorization': 'Bearer sk-OsexRhsOdqg5yb9i8c637435AeF1445f9c6cD2717a95167a'
      }
    })
  );
};
