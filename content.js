// 用于跟踪正在处理的请求
let processingRequests = new Set();

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 生成请求的唯一标识
  const requestId = JSON.stringify(message);
  
  // 如果这个请求正在处理中，则忽略
  if (processingRequests.has(requestId)) {
    console.log('忽略重复请求:', message);
    return;
  }

  // 标记请求为正在处理
  processingRequests.add(requestId);

  if (message.action === 'processResult') {
    handleProcessedText(message.result, message.mode).finally(() => {
      // 处理完成后移除请求标记
      processingRequests.delete(requestId);
    });
  } else if (message.action === 'showError') {
    showError(message.error);
    processingRequests.delete(requestId);
  }
});

// 处理处理后的文本
async function handleProcessedText(text, mode) {
  try {
    if (mode === 'clipboard') {
      // 复制到剪贴板
      await navigator.clipboard.writeText(text);
      showNotification('文本已复制到剪贴板');
    } else if (mode === 'input') {
      // 显示倒计时通知
      await new Promise(resolve => {
        showCountdown(5, () => {
          // 模拟键盘输入
          const activeElement = document.activeElement;
          if (activeElement && 
              (activeElement.tagName === 'INPUT' || 
               activeElement.tagName === 'TEXTAREA' || 
               activeElement.isContentEditable)) {
            // 使用一次性的事件监听器来确保只输入一次
            const inputHandler = () => {
              document.execCommand('insertText', false, text);
              showNotification('文本已输入');
              // 移除事件监听器
              requestAnimationFrame(() => {
                activeElement.removeEventListener('input', inputHandler);
              });
            };
            activeElement.addEventListener('input', inputHandler, { once: true });
            // 触发输入
            document.execCommand('insertText', false, text);
          } else {
            showError('请将光标放在输入框中');
          }
          resolve();
        });
      });
    }
  } catch (error) {
    console.error('处理文本失败:', error);
    showError(error.message);
  }
}

// 显示倒计时通知
function showCountdown(seconds, callback) {
  let remainingSeconds = seconds;
  const countdownDiv = document.createElement('div');
  countdownDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: #2196F3;
    color: white;
    border-radius: 4px;
    z-index: 10000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;

  function updateCountdown() {
    countdownDiv.textContent = `将在 ${remainingSeconds} 秒后输入文本...`;
    if (remainingSeconds <= 0) {
      countdownDiv.remove();
      callback();
    } else {
      remainingSeconds--;
      setTimeout(updateCountdown, 1000);
    }
  }

  document.body.appendChild(countdownDiv);
  updateCountdown();
}

// 显示通知
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: #4CAF50;
    color: white;
    border-radius: 4px;
    z-index: 10000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 3秒后移除通知
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 显示错误
function showError(message) {
  const error = document.createElement('div');
  error.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: #f44336;
    color: white;
    border-radius: 4px;
    z-index: 10000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  error.textContent = message;
  document.body.appendChild(error);

  // 3秒后移除错误提示
  setTimeout(() => {
    error.remove();
  }, 3000);
} 