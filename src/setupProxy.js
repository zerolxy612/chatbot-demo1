const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
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
