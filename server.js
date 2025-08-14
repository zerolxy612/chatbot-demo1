const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// API路由
app.post('/api/chat', async (req, res) => {
  try {
    const { model, message } = req.body;
    console.log('Received request:', { model, message });

    const response = await fetch('https://oneapi.hkgai.net/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-OsexRhsOdqg5yb9i8c637435AeF1445f9c6cD2717a95167a'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "user", content: message }
        ],
        stream: true,
        max_tokens: 10240,
        // 尝试不同的搜索启用方式
        web_search: true,
        search: true,
        enable_search: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 设置SSE头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 转发流式响应
    response.body.on('data', (chunk) => {
      res.write(chunk);
    });

    response.body.on('end', () => {
      res.end();
    });

    response.body.on('error', (error) => {
      console.error('Stream error:', error);
      res.end();
    });

  } catch (error) {
    console.error('API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
});

// RAG API路由
app.post('/api/rag', async (req, res) => {
  try {
    const { query, generate_overview, streaming, recalls } = req.body;
    console.log('Received RAG request:', { query, generate_overview, streaming, recalls });

    const response = await fetch('http://localhost:3004/api/rag', {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RAG API Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('=== RAG API 完整响应 ===');
    console.log('RAG API Response:', JSON.stringify(data, null, 2));

    // 特别打印search_results
    if (data.search_results) {
      console.log('=== SEARCH_RESULTS 原始数据 ===');
      console.log('搜索结果数量:', data.search_results.length);
      data.search_results.forEach((result, index) => {
        console.log(`结果 ${index + 1}:`, {
          id: result.id,
          title: result.title,
          snippet: result.snippet ? result.snippet.substring(0, 100) + '...' : 'N/A',
          source: result.source,
          url: result.url,
          score: result.score
        });
      });
    }

    res.json(data);

  } catch (error) {
    console.error('RAG API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
