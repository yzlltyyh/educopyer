document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  chrome.storage.sync.get([
    'apiKey',
    'apiEndpoint',
    'promptTemplate',
    'model',
    'customModel'
  ], (result) => {
    document.getElementById('apiKey').value = result.apiKey || '';
    document.getElementById('apiEndpoint').value = result.apiEndpoint || '';
    document.getElementById('promptTemplate').value = result.promptTemplate || '{text}';
    
    const modelSelect = document.getElementById('model');
    const customModelGroup = document.getElementById('customModelGroup');
    const customModelInput = document.getElementById('customModel');
    
    // 设置选中的模型
    if (result.model) {
      modelSelect.value = result.model;
      if (result.model === 'custom') {
        customModelGroup.style.display = 'block';
        customModelInput.value = result.customModel || '';
      }
    }

    // 监听模型选择变化
    modelSelect.addEventListener('change', () => {
      if (modelSelect.value === 'custom') {
        customModelGroup.style.display = 'block';
      } else {
        customModelGroup.style.display = 'none';
      }
    });
  });

  // 保存按钮点击事件
  document.getElementById('saveButton').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const promptTemplate = document.getElementById('promptTemplate').value.trim();
    const model = document.getElementById('model').value;
    const customModel = document.getElementById('customModel').value.trim();

    // 验证输入
    if (!apiKey || !apiEndpoint) {
      showStatus('请填写必要的API配置信息', false);
      return;
    }

    if (model === 'custom' && !customModel) {
      showStatus('请填写自定义模型名称', false);
      return;
    }

    // 保存设置
    chrome.storage.sync.set({
      apiKey,
      apiEndpoint,
      promptTemplate: promptTemplate || '{text}',
      model,
      customModel
    }, () => {
      showStatus('设置已保存', true);
    });
  });
});

// 显示状态信息
function showStatus(message, isSuccess) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + (isSuccess ? 'success' : 'error');
  status.style.display = 'block';

  // 3秒后隐藏状态信息
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
} 