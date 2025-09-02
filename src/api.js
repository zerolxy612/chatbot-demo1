// 使用您提供的真实OpenAI API代码，支持版本选择
export const callOpenAI = async (model, message, signal = null, version = 'v2', retryCount = 0) => {
  const maxRetries = 2;

  try {
    // 根据版本选择不同的API密钥，但都使用传入的model参数
    let apiKey;
    if (version === 'v1') {
      apiKey = 'sk-GMry087g9uFQ0abV0380D8061a244573A0186bE21eD642A3';
    } else {
      // v2 (默认)
      apiKey = 'sk-4ULz2dv9hA9CsKDuB7Cd804a6fDf4d4fB707C539A4A1D41a';
    }

    const requestBody = {
      model: model, // 直接使用传入的model参数
      messages: [
        { role: "user", content: message }
      ],
      stream: true,
      max_tokens: 10240
    };

    // 可以添加备用端点
    const apiEndpoints = [
      'https://oneapi.hkgai.net/v1/chat/completions',
      // 'https://backup-api.hkgai.net/v1/chat/completions' // 备用端点
    ];

    const currentEndpoint = apiEndpoints[0]; // 目前使用主端点

    const response = await fetch(currentEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: signal // 添加中止信号支持
    });

    if (!response.ok) {
      // 尝试读取错误响应体
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        console.error('无法读取错误响应体:', e);
      }

      // 如果是500错误且还有重试次数，则重试
      if (response.status === 500 && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // 递增延迟
        return callOpenAI(model, message, retryCount + 1);
      }

      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }

    return response;
  } catch (error) {
    console.error('API调用失败:', error);

    // 网络错误也可以重试
    if (error.name === 'TypeError' && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return callOpenAI(model, message, retryCount + 1);
    }

    throw error;
  }
};

// Gemini API调用函数 - 用于数据提取和图表JSON生成
export const callGemini = async (prompt) => {
  try {
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

    // 提取生成的文本内容
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const generatedText = data.candidates[0].content.parts[0].text;
      return generatedText;
    } else {
      throw new Error('Gemini API返回格式异常');
    }
  } catch (error) {
    console.error('Gemini API调用失败:', error);
    throw error;
  }
};

// 股票API调用函数 - 获取股票时间序列数据
export const callStockAPI = async (ticker) => {
  try {
    // 使用真实的股票API接口
    const apiUrl = `https://finapi.hkgai.asia/hk-timeseries/${ticker}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stock API error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('股票API调用失败:', error);
    throw error;
  }
};
