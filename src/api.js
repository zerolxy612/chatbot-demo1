// 使用您提供的真实OpenAI API代码
export const callOpenAI = async (model, message, retryCount = 0) => {
  const maxRetries = 2;

  try {
    console.log('API调用参数:', {
      model: model,
      message: message.substring(0, 100) + '...',
      messageLength: message.length
    });

    const requestBody = {
      model: model,
      messages: [
        { role: "user", content: message }
      ],
      stream: true,
      max_tokens: 10240
    };

    console.log('请求体:', JSON.stringify(requestBody, null, 2));

    // 可以添加备用端点
    const apiEndpoints = [
      'https://oneapi.hkgai.net/v1/chat/completions',
      // 'https://backup-api.hkgai.net/v1/chat/completions' // 备用端点
    ];

    const currentEndpoint = apiEndpoints[0]; // 目前使用主端点
    console.log('使用API端点:', currentEndpoint);

    const response = await fetch(currentEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-OsexRhsOdqg5yb9i8c637435AeF1445f9c6cD2717a95167a'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      // 尝试读取错误响应体
      let errorBody = '';
      try {
        errorBody = await response.text();
        console.error('API错误响应体:', errorBody);
      } catch (e) {
        console.error('无法读取错误响应体:', e);
      }

      // 如果是500错误且还有重试次数，则重试
      if (response.status === 500 && retryCount < maxRetries) {
        console.log(`第${retryCount + 1}次重试...`);
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
      console.log(`网络错误，第${retryCount + 1}次重试...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return callOpenAI(model, message, retryCount + 1);
    }

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

// 股票API调用函数 - 获取股票时间序列数据
export const callStockAPI = async (ticker) => {
  try {
    console.log('调用股票API获取数据，股票代码:', ticker);

    // 使用真实的股票API接口
    const apiUrl = `https://finapi.hkgai.asia/hk-timeseries/${ticker}`;
    console.log('API请求URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('股票API错误响应:', response.status, errorText);
      throw new Error(`Stock API error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    console.log('股票API响应:', data);

    return data;
  } catch (error) {
    console.error('股票API调用失败:', error);
    throw error;
  }
};
