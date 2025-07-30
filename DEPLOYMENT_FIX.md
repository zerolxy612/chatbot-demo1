# Vercel 部署 RAG API 500 错误修复

## 问题描述
在 Vercel 部署后，调用 RAG API 时出现 500 内部服务器错误。

## 问题原因
1. 外部 RAG API (`https://ragtest.hkgai.asia/api/rag`) 返回 404 错误
2. 缺少适当的错误处理和后备方案
3. Vercel 配置可能不完整

## 解决方案

### 1. 添加 Vercel 配置文件
创建 `vercel.json` 文件：
```json
{
  "functions": {
    "api/rag.js": {
      "runtime": "nodejs18.x"
    }
  }
}
```

### 2. 改进 API 错误处理
修改 `api/rag.js`：
- 添加了 try-catch 错误处理
- 实现了模拟数据后备方案
- 当外部 API 不可用时返回有意义的响应

### 3. 更新前端处理
修改 `src/App.js`：
- 添加了对模拟数据的识别和显示
- 改进了用户体验，显示警告信息

## 修复后的功能
1. ✅ 当外部 RAG API 可用时，正常转发请求
2. ✅ 当外部 RAG API 不可用时，返回模拟数据
3. ✅ 前端正确显示模拟数据状态
4. ✅ 保持了原有的 API 接口格式

## 部署步骤
1. 确保所有文件已更新
2. 提交代码到 Git 仓库
3. 在 Vercel 中重新部署
4. 测试 RAG API 功能

## 测试方法
```bash
curl -X POST https://your-vercel-app.vercel.app/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query":"test","generate_overview":false,"streaming":false,"recalls":{"serpapi":{},"elasticsearch":{},"faq":{}}}'
```

## 注意事项
- 模拟数据包含 `_mock: true` 标识
- 前端会显示警告信息提示用户当前使用模拟数据
- 当外部 API 恢复时，系统会自动切换回真实数据
