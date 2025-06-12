document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  chrome.storage.sync.get([
    'apiKey',
    'apiEndpoint',
    'promptTemplate',
    'model',
    'customModel',
    'ocrModel',
    'customOcrModel',
    'showPreview'
  ], (result) => {
    document.getElementById('apiKey').value = result.apiKey || '';
    document.getElementById('apiEndpoint').value = result.apiEndpoint || '';
    document.getElementById('promptTemplate').value = result.promptTemplate || '';
    document.getElementById('showPreview').checked = result.showPreview !== false; // 默认为true

    // 处理推理模型
    const modelSelect = document.getElementById('model');
    const customModelGroup = document.getElementById('customModelGroup');
    const customModelInput = document.getElementById('customModel');
    
    if (result.model) {
      if (modelSelect.querySelector(`option[value="${result.model}"]`)) {
        modelSelect.value = result.model;
      } else {
        modelSelect.value = 'custom';
        customModelGroup.style.display = 'block';
        customModelInput.value = result.model;
      }
    }

    modelSelect.addEventListener('change', () => {
      customModelGroup.style.display = modelSelect.value === 'custom' ? 'block' : 'none';
    });

    // 处理OCR模型
    const ocrModelSelect = document.getElementById('ocrModel');
    const customOcrModelGroup = document.getElementById('customOcrModelGroup');
    const customOcrModelInput = document.getElementById('customOcrModel');
    
    if (result.ocrModel) {
      if (ocrModelSelect.querySelector(`option[value="${result.ocrModel}"]`)) {
        ocrModelSelect.value = result.ocrModel;
      } else {
        ocrModelSelect.value = 'custom';
        customOcrModelGroup.style.display = 'block';
        customOcrModelInput.value = result.ocrModel;
      }
    }

    ocrModelSelect.addEventListener('change', () => {
      customOcrModelGroup.style.display = ocrModelSelect.value === 'custom' ? 'block' : 'none';
    });
  });

  // 保存按钮点击事件
  document.getElementById('saveButton').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const promptTemplate = document.getElementById('promptTemplate').value.trim();
    const showPreview = document.getElementById('showPreview').checked;

    // 获取推理模型
    const modelSelect = document.getElementById('model');
    const customModelInput = document.getElementById('customModel');
    const model = modelSelect.value === 'custom' ? customModelInput.value.trim() : modelSelect.value;

    // 获取OCR模型
    const ocrModelSelect = document.getElementById('ocrModel');
    const customOcrModelInput = document.getElementById('customOcrModel');
    const ocrModel = ocrModelSelect.value === 'custom' ? customOcrModelInput.value.trim() : ocrModelSelect.value;

    // 验证输入
    if (!apiKey || !apiEndpoint) {
      showStatus('请填写必要的API配置信息', false);
      return;
    }

    if (modelSelect.value === 'custom' && !model) {
      showStatus('请填写自定义推理模型名称', false);
      return;
    }

    if (ocrModelSelect.value === 'custom' && !ocrModel) {
      showStatus('请填写自定义OCR模型名称', false);
      return;
    }

    // 保存设置
    chrome.storage.sync.set({
      apiKey,
      apiEndpoint,
      promptTemplate: promptTemplate || '', // 空字符串将使用默认模板
      model,
      ocrModel,
      showPreview
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