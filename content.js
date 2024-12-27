(function() {
  // 用于跟踪正在处理的请求
  let processingRequests = new Set();
  // 通知开关状态
  let notificationsEnabled = true;
  // 截图状态
  let isCapturing = false;
  let captureStartPos = null;

  // 监听来自background.js的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理ping消息
    if (message.action === 'ping') {
      sendResponse({ status: 'ok' });
      return;
    }

    if (message.action === 'startCapture') {
      startCapture();
      return;
    }

    // 处理通知开关命令
    if (message.action === 'toggleNotifications') {
      notificationsEnabled = !notificationsEnabled;
      if (notificationsEnabled) {
        showNotification('通知已开启');
      }
      return;
    }

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

  // 开始截图
  function startCapture() {
    if (isCapturing) return;
    isCapturing = true;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'capture-overlay';
    
    // 创建选区
    const selection = document.createElement('div');
    selection.className = 'capture-area';
    selection.style.display = 'none';
    
    document.body.appendChild(overlay);
    document.body.appendChild(selection);

    let isSelecting = false;

    overlay.addEventListener('mousedown', (e) => {
      isSelecting = true;
      captureStartPos = {
        x: e.clientX,
        y: e.clientY
      };
      selection.style.left = e.clientX + 'px';
      selection.style.top = e.clientY + 'px';
      selection.style.width = '0';
      selection.style.height = '0';
      selection.style.display = 'block';
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isSelecting) return;

      const width = e.clientX - captureStartPos.x;
      const height = e.clientY - captureStartPos.y;

      selection.style.width = Math.abs(width) + 'px';
      selection.style.height = Math.abs(height) + 'px';
      selection.style.left = (width < 0 ? e.clientX : captureStartPos.x) + 'px';
      selection.style.top = (height < 0 ? e.clientY : captureStartPos.y) + 'px';
    });

    overlay.addEventListener('mouseup', async (e) => {
      if (!isSelecting) return;
      isSelecting = false;
      
      try {
        // 获取选区位置和大小
        const rect = selection.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        // 清理UI
        overlay.remove();
        selection.remove();
        isCapturing = false;

        // 如果选区太小，则取消截图
        if (rect.width < 10 || rect.height < 10) {
          showError('选区太小，请重新选择');
          return;
        }

        // 创建临时容器
        const container = document.createElement('div');
        container.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          width: ${rect.width}px;
          height: ${rect.height}px;
          overflow: hidden;
          pointer-events: none;
        `;

        // 克隆选区内的所有元素
        const absoluteLeft = rect.left + scrollX;
        const absoluteTop = rect.top + scrollY;
        
        // 创建一个新的包装元素
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          position: absolute;
          left: ${-absoluteLeft}px;
          top: ${-absoluteTop}px;
          width: ${document.documentElement.scrollWidth}px;
          height: ${document.documentElement.scrollHeight}px;
        `;

        // 克隆整个页面并添加到包装器中
        const clone = document.documentElement.cloneNode(true);
        wrapper.appendChild(clone);
        container.appendChild(wrapper);
        document.body.appendChild(container);

        // 使用html2canvas截图
        const canvas = await html2canvas(container, {
          backgroundColor: null,
          scale: window.devicePixelRatio || 1,
          logging: false,
          useCORS: true,
          allowTaint: true,
          width: rect.width,
          height: rect.height,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
          imageTimeout: 0,
          removeContainer: true,
          foreignObjectRendering: true,
          onclone: (clonedDoc) => {
            // 只复制必要的样式
            const styles = document.getElementsByTagName('style');
            const links = document.getElementsByTagName('link');
            const clonedHead = clonedDoc.getElementsByTagName('head')[0];
            
            // 复制样式标签
            Array.from(styles).forEach(style => {
              if (style.textContent.includes('@import') || style.textContent.includes('url(')) {
                clonedHead.appendChild(style.cloneNode(true));
              }
            });
            
            // 只复制必要的CSS链接
            Array.from(links).forEach(link => {
              if (link.rel === 'stylesheet' && !link.href.includes('font')) {
                clonedHead.appendChild(link.cloneNode(true));
              }
            });
          }
        });

        // 清理临时元素
        container.remove();
        
        // 转换为base64，使用较低质量以提高性能
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // 发送到background处理
        chrome.runtime.sendMessage({
          action: 'processImage',
          imageData: imageData
        });
      } catch (error) {
        console.error('截图失败:', error);
        showError('截图失败: ' + error.message);
      }
    });

    // ESC键取消截图
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        selection.remove();
        isCapturing = false;
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // 处理处理后的文本
  async function handleProcessedText(text, mode) {
    try {
      if (mode === 'clipboard') {
        // 复制到剪贴板
        await navigator.clipboard.writeText(text);
        showNotification('已复制');
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
    if (!notificationsEnabled) {
      setTimeout(callback, seconds * 1000);
      return;
    }

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
      if (!notificationsEnabled) {
        countdownDiv.remove();
        callback();
        return;
      }

      countdownDiv.textContent = ` ${remainingSeconds} 秒`;
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
    if (!notificationsEnabled) return;

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
    if (!notificationsEnabled) {
      console.error(message);
      return;
    }

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
})(); 