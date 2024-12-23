// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
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
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "copyToClipboard") {
    processText(info.selectionText, tab, 'clipboard');
  } else if (info.menuItemId === "simulateInput") {
    processText(info.selectionText, tab, 'input');
  }
});

// 处理快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;

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

// 构建API请求体
function buildRequestBody(text, model, promptTemplate) {
  // 处理prompt模板，替换占位符
  let content;
  if (promptTemplate) {
    // 如果模板是空的大括号，直接使用选中的文本
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

      // 尝试注入content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });

      // 等待一小段时间确保content script加载
      await new Promise(resolve => setTimeout(resolve, 100));

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