# ⚡ AI Terminal Desktop (现代化智能终端运维工作台)

> 集 **VPS 资产管理、FinalShell 风格硬件实时监控、SFTP 文件管理器（在线编辑/拖拽上传/压缩解压/Chmod/大文件扫描）、多 Tab 终端、多布局分屏、群控广播、Docker 可视化管理、AI 全景健康体检、SSH 密钥管理 与 深度 AI Copilot 自愈** 于一体的独立跨平台桌面客户端。

---

## 💻 桌面端安装包与下载

### 1. macOS 平台 (Apple Silicon & Intel)
本地已直接构建完成的独立安装包位于 `ai-terminal-desktop/dist-electron/`：
- **DMG 安装镜像（开箱即用，双击拖入应用程序）**：
  👉 [`AI-Terminal-1.0.0-arm64.dmg`](file:///Users/gaojia/Documents/VPS-manage/ai-terminal-desktop/dist-electron/AI-Terminal-1.0.0-arm64.dmg)
- **便携式免安装压缩包**：
  👉 [`AI-Terminal-1.0.0-arm64-mac.zip`](file:///Users/gaojia/Documents/VPS-manage/ai-terminal-desktop/dist-electron/AI-Terminal-1.0.0-arm64-mac.zip)
- **编译后的原生应用目录**：
  👉 `ai-terminal-desktop/dist-electron/mac-arm64/AI-Terminal.app`

> **说明**：应用内部已完整内置打包好的独立 Python 运行时、FastAPI 后端与静态资源，**用户电脑无需安装 Python 或任何依赖**，双击即可直接运行！

---

### 2. Windows 平台 (.exe 安装包 / 免安装版)

由于 Windows 原生二进制需要 Windows 系统的 C 运行时环境编译，我们提供了两种极简打包方式：

#### 方案 A：GitHub Actions 自动化极速云端打包（推荐，无需本地配置环境）
项目中已内置自动化工作流 [`.github/workflows/build-desktop.yml`](file:///Users/gaojia/Documents/VPS-manage/.github/workflows/build-desktop.yml)。
1. 将代码仓库推送到 GitHub；
2. 进入仓库的 **Actions** 页面，选择 **Build Cross-Platform Desktop Apps** 并点击 **Run workflow**；
3. GitHub 官方 Windows & macOS 虚拟机会在 3 分钟内自动完成编译，并生成如下文件供下载：
   - `AI-Terminal-Setup-1.0.0.exe`（Windows 标准 NSIS 安装向导程序）
   - `AI-Terminal-1.0.0-win.zip`（Windows 便携绿色免安装版）
   - `AI-Terminal-1.0.0.dmg`（macOS 安装镜像）

#### 方案 B：在 Windows 本机一键打包
在任意 Windows 电脑上克隆或解压本项目后：
1. 双击运行 `ai-terminal-desktop/scripts/build-backend-win.bat`；
2. 脚本将自动安装依赖、调用 PyInstaller 编译 `aiterm-backend.exe`，并调用 Electron-builder 生成 Windows 安装包 `.exe`。

#### 方案 C：Windows 极速免编译启动
在 Windows 电脑上直接双击运行：
👉 `ai-terminal-desktop/run-windows.bat`

---

## 🛠️ 本地重新构建指南 (macOS)

若在 macOS 本地修改了代码，只需执行如下命令即可重新生成 DMG 安装包：

```bash
cd ai-terminal-desktop

# 1. 重新构建前端静态页面
npm run build:frontend

# 2. 重新编译独立后端二进制
npm run build:backend:mac

# 3. 重新打包生成 macOS .dmg 与 .zip 安装包
npm run dist:mac
```

---

## 🌟 核心功能一览

1. **多终端多布局分屏**：支持单屏、左右对半并排、上下对半分屏，关闭任一窗口终端绝不丢失或刷新；
2. **多终端群控广播**：一键开启“群控广播”，在任意窗口输入的按键实时并发发送给所有已连接终端；
3. **10 款高颜值终端主题**：内置 Tokyo Night、Catppuccin、Dracula、Cyberpunk、One Dark 等深色方案，以及 GitHub Light、Solarized Light 等高对比浅色方案，支持全局昼夜模式智能联动；
4. **FinalShell 风格硬件监控**：实时采集 CPU 占用、内存/Swap 使用、磁盘空间、上下行网速波形、系统负载与开机运行时间；
5. **SFTP 文件管理全套套件**：
   - 终端 `cd` 与文件目录全自动双向联动 (OSC 7 / PWD 嗅探)；
   - 拖拽上传、在线文件代码编辑（带语法高亮与快捷保存）；
   - 文件压缩与解压（支持 `.zip`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tar.xz`, `.tar`, `.gz`）；
   - 文件权限 Chmod 批量修改；
   - 4 层深度文件名递归搜索与全盘 >50MB 大文件/日志安全排查；
6. **DevOps 运维排查工具箱**：
   - 端口监听占用列表与系统进程前 35 强实时查看与一键终止；
   - Docker 容器生命周期可视化管理与实时运行日志 Drawer；
   - AI 全景健康体检（大模型 0~100 综合打分与一键修复脚本）；
   - SSH 密钥管理与自动化一键免密推送分发；
7. **AI Copilot 全流程助手**：
   - 自然语言 Shell 指令生成与系统架构自适应匹配；
   - 三级安全风险审计拦截（高危操作强制输入 `yes` 二次确认）；
   - 终端报错智能自愈与命令参数深入拆解；
   - 连续多轮自主排障 Agent 任务循环。
