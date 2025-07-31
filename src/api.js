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

// Gemini API调用函数 - 用于数据提取和图表JSON生成
export const callGemini = async (prompt) => {
  try {
    console.log('调用Gemini API进行数据提取...');

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': 'AIzaSyCdtgVnQShL2v9i2VuWenqDOH3f5IXR5cA'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API响应:', data);

    // 提取生成的文本内容
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const generatedText = data.candidates[0].content.parts[0].text;
      console.log('Gemini生成的内容:', generatedText);
      return generatedText;
    } else {
      throw new Error('Gemini API返回格式异常');
    }
  } catch (error) {
    console.error('Gemini API调用失败:', error);
    throw error;
  }
};
