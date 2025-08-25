const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Law Demo RAG API代理
  app.use(
    '/api/law/rag',
    createProxyMiddleware({
      target: 'https://lexihkrag-test.hkgai.asia',
      changeOrigin: true,
      pathRewrite: {
        '^/api/law/rag': '/', // 重写到根路径
      },
      secure: true,
      logLevel: 'debug'
    })
  );

  // Law Demo 多源检索API代理
  app.use(
    '/api/law/multisearch',
    createProxyMiddleware({
      target: 'https://lexihk-search-test.hkgai.asia',
      changeOrigin: true,
      pathRewrite: {
        '^/api/law/multisearch': '/', // 重写到根路径
      },
      secure: true,
      logLevel: 'debug'
    })
  );

  // 新的RAG API代理 - 必须放在更通用的/api代理之前
  app.use(
    '/api/rag',
    createProxyMiddleware({
      target: 'https://ragtest.hkgai.asia',
      changeOrigin: true,
      pathRewrite: {
        '^/api/rag': '/', // 重写到根路径
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
        'Authorization': 'Bearer sk-4ULz2dv9hA9CsKDuB7Cd804a6fDf4d4fB707C539A4A1D41a'
      }
    })
  );
};
