// 使用您提供的真实OpenAI API代码
export const callOpenAI = async (model, message) => {
  try {
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
        max_tokens: 10240
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('API调用失败:', error);
    throw error;
  }
};
