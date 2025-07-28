// 直接使用您提供的OpenAI API代码
// 注意：这个在浏览器中可能会有CORS问题，但我们先试试

export const callOpenAI = async (model, message) => {
  // 您的原始代码，稍作修改以支持流式响应
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
      stream: true,  // 改为流式输出
      max_tokens: 10240
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
};
