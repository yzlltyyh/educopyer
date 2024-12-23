# EduCopyer LLM Assistant

一个强大的Chrome扩展，用于集成LLM服务的文本处理助手。

## 功能特点

- 右键菜单集成：快速处理选中文本
- 快捷键支持：使用`Ctrl+Shift+L`快速调用
- 灵活的API配置：支持自定义API端点
- 自定义Prompt模板：根据需求定制输出
- 多种输出方式：
  - 自动复制到剪贴板
  - 智能模拟键盘输入

## 安装说明

1. 下载本扩展程序
2. 打开Chrome浏览器，进入扩展管理页面（chrome://extensions/）
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本扩展程序所在文件夹

## 使用方法

1. 首次使用时，点击扩展图标进行配置：
   - 设置API Key
   - 配置API端点
   - 自定义Prompt模板（可选）

2. 使用方式：
   - 选中文本，右键选择"使用LLM处理文本"
   - 或使用快捷键`Ctrl+Shift+L`

3. 处理结果会：
   - 自动复制到剪贴板
   - 如果光标在输入框中，会自动输入处理后的文本

## 注意事项

- 请确保正确配置API密钥和端点
- API密钥会安全存储在浏览器中
- 建议根据实际需求调整Prompt模板

## 开发说明

本扩展使用以下技术：

- Chrome Extension Manifest V3
- JavaScript
- Chrome Storage API
- Context Menus API
- Clipboard API

## 许可证

MIT License 