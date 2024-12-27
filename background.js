// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 设置默认配置
  chrome.storage.sync.get([
    'apiKey',
    'apiEndpoint',
    'model',
    'promptTemplate'
  ], (result) => {
    // 只在没有现有配置时设置默认值
    const defaults = {
      apiKey: result.apiKey || '',  // 出于安全考虑，API密钥需要用户手动设置
      apiEndpoint: result.apiEndpoint || 'https://api.yzlltyyh.com/v1/chat/completions',
      model: result.model || 'gemini-2.0-flash-exp',
      promptTemplate: result.promptTemplate || '你是一位专业答题助手。你将严格遵循以下标准化格式回答各类题目：\n\n选择题回答格式：\n答案字母（A/B/C/D）\n紧跟一句不超过20字的核心解释\n示例：A 质能方程体现了质量与能量的转换关系\n\n填空题回答格式：\n多个答案用中文逗号"，"分隔\n每空仅填写标准答案，不加任何修饰\n示例：光合作用，呼吸作用，蒸腾作用\n\n判断题回答格式：\n以"对"或"错"开头\n紧跟一句不超过20字的核心解释\n示例：错 自由落体运动与物体质量无关\n\n简答题回答格式：\n严格控制在150-200字\n采用连续段落，无需分点\n直接切入核心答案，避免废话\n确保答案完整、准确、简洁\n\n论述题回答格式：\n严格控制在500字\n采用连续段落，无需分点\n论述需层次分明，有论证过程\n确保答案系统、深入、全面\n\n注意事项：\n所有回答均使用简体中文\n仅提供答案和必要解释，不作补充说明\n严格遵守字数限制\n保持格式统一规范\n确保专业性和准确性\n\n{}'
    };
    chrome.storage.sync.set(defaults);
  });

  // 复制到剪贴板菜单
  chrome.contextMenus.create({
    id: "copyToClipboard",
    title: "处理并复制到剪贴板",
    contexts: ["selection"]
  });

  // 模拟输入菜单
  chrome.contextMenus.create({
    id: "simulateInput",
    title: "处理并模拟输入(5秒后)",
    contexts: ["selection"]
  });

  // 截图分析菜单
  chrome.contextMenus.create({
    id: "captureArea",
    title: "截图分析",
    contexts: ["page"]
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "copyToClipboard") {
    processText(info.selectionText, tab, 'clipboard');
  } else if (info.menuItemId === "simulateInput") {
    processText(info.selectionText, tab, 'input');
  } else if (info.menuItemId === "captureArea") {
    startCapture(tab);
  }
});

// 处理快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;

    if (command === 'toggle-notifications') {
      // 发送切换通知的消息
      await sendMessageToContentScript(tab.id, {
        action: 'toggleNotifications'
      });
      return;
    }

    if (command === 'capture-area') {
      startCapture(tab);
      return;
    }

    // 获取选中的文本
    const [{result}] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      function: () => window.getSelection().toString()
    });

    if (!result) {
      throw new Error('请先选择要处理的文本');
    }

    // 根据命令处理文本
    if (command === 'copy-to-clipboard') {
      processText(result, tab, 'clipboard');
    } else if (command === 'simulate-input') {
      processText(result, tab, 'input');
    }
  } catch (error) {
    console.error('快捷键处理失败:', error);
    // 如果有标签页，显示错误
    if (tab) {
      await sendMessageToContentScript(tab.id, {
        action: 'showError',
        error: error.message
      });
    }
  }
});

// 开始截图
async function startCapture(tab) {
  try {
    await sendMessageToContentScript(tab.id, {
      action: 'startCapture'
    });
  } catch (error) {
    console.error('启动截图失败:', error);
  }
}

// 处理截图
async function processImage(imageData, tab) {
  try {
    // 从存储中获取API配置
    const config = await chrome.storage.sync.get([
      'apiKey',
      'apiEndpoint',
      'model',
      'customModel'
    ]);
    
    if (!config.apiKey || !config.apiEndpoint) {
      throw new Error('请先配置API密钥和端点');
    }

    const model = config.model === 'custom' ? config.customModel : config.model;
    console.log('使用模型:', model);

    // 构建多模态请求体
    const requestBody = {
      model: model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请分析这张图片中的文字，忽略图标和无关内容，将其转换为纯文本格式。只用输出分析转写后的内容，不要任何多余的解释"
            },
            {
              type: "image_url",
              image_url: {
                url: imageData
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    };

    // 调用API
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API响应错误:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('API响应:', result);

    // 解析响应
    const processedText = parseApiResponse(result);
    
    // 同时发送复制和输入命令
    await Promise.all([
      // 复制到剪贴板
      sendMessageToContentScript(tab.id, {
        action: 'processResult',
        result: processedText,
        mode: 'clipboard'
      }),
      // 模拟输入
      sendMessageToContentScript(tab.id, {
        action: 'processResult',
        result: processedText,
        mode: 'input'
      })
    ]);

  } catch (error) {
    console.error('处理图片失败:', error);
    await sendMessageToContentScript(tab.id, {
      action: 'showError',
      error: error.message
    });
  }
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processImage') {
    processImage(message.imageData, sender.tab);
  }
});

// 构建API请求体
function buildRequestBody(text, model, promptTemplate) {
  // 处理prompt模板，替换占位符
  let content;
  if (promptTemplate) {
    // 如果模板是空大括号，直接使用选中的文本
    if (promptTemplate.trim() === '{}') {
      content = text;
    } else {
      // 否则替换模板中的占位符
      content = promptTemplate.replace(/\{([^}]*)\}/g, text);
    }
  } else {
    content = text;
  }

  console.log('处理后的内容:', content);

  // 统一使用OpenAI格式的请求体
  return {
    model: model,
    messages: [
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.7,
    max_tokens: 1000
  };
}

// 解析API响应
function parseApiResponse(response) {
  // 统一按OpenAI格式解析响应
  if (response.choices && response.choices[0]) {
    return response.choices[0].message?.content || response.choices[0].text;
  }
  throw new Error('无法解析API响应');
}

// 发送消息到content script
async function sendMessageToContentScript(tabId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // 先检查标签页是否存在
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('标签页不存在');
      }

      // 检查content script是否已注入
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (error) {
        // content script未注入，进行注入
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        // 等待一小段时间确保content script加载
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 发送消息
      await chrome.tabs.sendMessage(tabId, message);
      return; // 成功发送则返回
    } catch (error) {
      console.log(`发送消息重试 ${i + 1}/${retries}:`, error);
      if (i === retries - 1) {
        // 最后一次重试失败，使用通知API显示结果
        if (message.action === 'processResult') {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LLM处理结果',
            message: message.result
          });
        } else if (message.action === 'showError') {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '处理错误',
            message: message.error
          });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200)); // 重试前等待
    }
  }
}

// 处理文本的主要函数
async function processText(text, tab, mode = 'clipboard') {
  console.log('开始处理文本:', text, '模式:', mode);
  
  try {
    // 从存储中获取API配置
    const config = await chrome.storage.sync.get([
      'apiKey',
      'apiEndpoint',
      'promptTemplate',
      'model',
      'customModel'
    ]);
    
    if (!config.apiKey || !config.apiEndpoint) {
      throw new Error('请先配置API密钥和端点');
    }

    const model = config.model === 'custom' ? config.customModel : config.model;
    console.log('使用模型:', model);

    // 构建请求体
    const requestBody = buildRequestBody(text, model, config.promptTemplate);
    console.log('请求体:', requestBody);

    // 调用API
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API响应错误:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('API响应:', result);

    // 解析响应
    const processedText = parseApiResponse(result);
    
    // 发送结果到content script进行处理
    await sendMessageToContentScript(tab.id, {
      action: 'processResult',
      result: processedText,
      mode: mode
    });

  } catch (error) {
    console.error('处理失败:', error);
    // 通知用户出错
    await sendMessageToContentScript(tab.id, {
      action: 'showError',
      error: error.message
    });
  }
} 