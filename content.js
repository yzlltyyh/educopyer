(function() {
  // 用于跟踪正在处理的请求
  let processingRequests = new Set();
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
      chrome.storage.sync.get(['notificationsEnabled'], (result) => {
        const newState = !result.notificationsEnabled;
        chrome.storage.sync.set({ notificationsEnabled: newState }, () => {
          if (newState) {
            showNotification('通知已开启');
          }
        });
      });
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
      // 使用页面坐标而不是视口坐标
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      captureStartPos = {
        x: e.clientX + scrollX,
        y: e.clientY + scrollY
      };

      // 选区使用fixed定位，所以使用clientX/Y
      selection.style.left = e.clientX + 'px';
      selection.style.top = e.clientY + 'px';
      selection.style.width = '0';
      selection.style.height = '0';
      selection.style.display = 'block';
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isSelecting) return;

      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      const currentX = e.clientX + scrollX;
      const currentY = e.clientY + scrollY;

      const width = currentX - captureStartPos.x;
      const height = currentY - captureStartPos.y;

      // 选区显示使用视口坐标
      selection.style.width = Math.abs(width) + 'px';
      selection.style.height = Math.abs(height) + 'px';
      selection.style.left = (width < 0 ? e.clientX : e.clientX - Math.abs(width)) + 'px';
      selection.style.top = (height < 0 ? e.clientY : e.clientY - Math.abs(height)) + 'px';
    });

    overlay.addEventListener('mouseup', async (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      try {
        // 获取选区的最终位置和大小
        const rect = selection.getBoundingClientRect();
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        const scrollY = window.scrollY || document.documentElement.scrollTop;

        // 计算页面绝对坐标
        const absoluteLeft = rect.left + scrollX;
        const absoluteTop = rect.top + scrollY;
        const absoluteWidth = rect.width;
        const absoluteHeight = rect.height;

        // 清理UI
        overlay.remove();
        selection.remove();
        isCapturing = false;

        // 如果选区太小，则取消截图
        if (absoluteWidth < 10 || absoluteHeight < 10) {
          showError('选区太小，请重新选择');
          return;
        }

        // 显示处理提示
        showNotification('正在截图处理...');

        // 直接对整个页面截图，然后裁剪指定区域
        const canvas = await html2canvas(document.body, {
          backgroundColor: null,
          scale: 1, // 使用固定缩放避免坐标问题
          logging: false,
          useCORS: true,
          allowTaint: true,
          scrollX: 0,
          scrollY: 0,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          imageTimeout: 0,
          foreignObjectRendering: true,
          onclone: (clonedDoc) => {
            // 移除所有可能影响布局的扩展元素
            const extensionElements = clonedDoc.querySelectorAll('.capture-overlay, .capture-area');
            extensionElements.forEach(el => el.remove());

            // 确保样式正确加载
            const originalStyles = document.querySelectorAll('style, link[rel="stylesheet"]');
            const clonedHead = clonedDoc.head;

            originalStyles.forEach(style => {
              if (style.tagName === 'STYLE') {
                const newStyle = clonedDoc.createElement('style');
                newStyle.textContent = style.textContent;
                clonedHead.appendChild(newStyle);
              } else if (style.tagName === 'LINK' && style.rel === 'stylesheet') {
                const newLink = clonedDoc.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = style.href;
                clonedHead.appendChild(newLink);
              }
            });
          }
        });

        // 创建裁剪后的canvas
        const croppedCanvas = document.createElement('canvas');
        const ctx = croppedCanvas.getContext('2d');

        croppedCanvas.width = absoluteWidth;
        croppedCanvas.height = absoluteHeight;

        // 从原始canvas中裁剪指定区域
        ctx.drawImage(
          canvas,
          absoluteLeft, absoluteTop, absoluteWidth, absoluteHeight,
          0, 0, absoluteWidth, absoluteHeight
        );

        // 转换为base64
        const imageData = croppedCanvas.toDataURL('image/jpeg', 0.9);

        // 检查是否显示预览
        chrome.storage.sync.get(['showPreview'], (result) => {
          if (result.showPreview !== false) {
            showImagePreview(imageData);
          }
        });

        // 发送到background处理
        chrome.runtime.sendMessage({
          action: 'processImage',
          imageData: imageData
        });

      } catch (error) {
        console.error('截图失败:', error);
        showError('截图失败: ' + error.message);
        // 确保清理UI
        if (overlay.parentNode) overlay.remove();
        if (selection.parentNode) selection.remove();
        isCapturing = false;
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
              // 直接设置值或内容
              if (activeElement.isContentEditable) {
                activeElement.textContent = text;
              } else {
                const originalValue = activeElement.value;
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;
                activeElement.value = originalValue.substring(0, start) + text + originalValue.substring(end);
                // 更新光标位置
                activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
              }
              showNotification('文本已输入');
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
    chrome.storage.sync.get(['notificationsEnabled'], (result) => {
      if (result.notificationsEnabled === false) {
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
        chrome.storage.sync.get(['notificationsEnabled'], (result) => {
          if (result.notificationsEnabled === false) {
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
        });
      }

      document.body.appendChild(countdownDiv);
      updateCountdown();
    });
  }

  // 显示通知
  function showNotification(message) {
    chrome.storage.sync.get(['notificationsEnabled'], (result) => {
      if (result.notificationsEnabled === false) return;

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
    });
  }

  // 显示错误
  function showError(message) {
    chrome.storage.sync.get(['notificationsEnabled'], (result) => {
      if (result.notificationsEnabled === false) {
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
    });
  }

  // 显示图片预览
  function showImagePreview(imageData) {
    // 移除已存在的预览
    const existingPreview = document.getElementById('educopyer-preview');
    if (existingPreview) {
      existingPreview.remove();
    }

    const preview = document.createElement('div');
    preview.id = 'educopyer-preview';
    preview.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      width: 200px;
      max-height: 150px;
      background: white;
      border: 2px solid #2196F3;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10001;
      overflow: hidden;
      cursor: pointer;
    `;

    const img = document.createElement('img');
    img.src = imageData;
    img.style.cssText = `
      width: 100%;
      height: auto;
      display: block;
    `;

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 8px;
      color: #666;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      background: rgba(255,255,255,0.8);
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      preview.remove();
    });

    preview.appendChild(img);
    preview.appendChild(closeBtn);
    document.body.appendChild(preview);

    // 点击预览图片可以关闭
    preview.addEventListener('click', () => {
      preview.remove();
    });

    // 5秒后自动关闭
    setTimeout(() => {
      if (preview.parentNode) {
        preview.remove();
      }
    }, 5000);
  }
})();