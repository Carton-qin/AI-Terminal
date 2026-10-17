<div align="center">

# ⚡ AI Terminal (智能桌面工作台)

**专为开发者、DevOps 与全栈运维打造的下一代智能终端客户端**

融合 FinalShell 级实时硬件监控 · SFTP 双向联动文件管理 · 多布局分屏 · 多终端群控广播 · Docker 可视化运维 · AI 全景服务器体检 · 深度 AI Copilot 故障自愈

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square&logo=apple&logoColor=white)](https://github.com/Carton-qin/AI-Terminal)
[![Electron](https://img.shields.io/badge/Electron-33%2B-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![xterm.js](https://img.shields.io/badge/xterm.js-5.5-red?style=flat-square&logo=gnometerminal&logoColor=white)](https://xtermjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[功能特性](#-核心功能亮点) • [快速下载](#-客户端下载与安装) • [极速上手](#-本地启动与开发) • [云端打包](#-github-actions-全自动打包) • [安全与隐私](#-安全与隐私说明)

</div>

---

## 📖 项目简介

**AI Terminal** 是一款现代化、高性能、高颜值的全功能终端与服务器运维桌面工作台。

传统终端工具往往存在界面陈旧、缺少文件协同、突发故障排查繁琐等痛点。AI Terminal 将**工业级 xterm.js 虚拟终端**与**大语言模型智能分析**深度结合，兼具 FinalShell 级的 VPS 硬件实时采样、SFTP 路径无感联动，以及多窗口持久化分屏、跨会话群控广播、Docker 可视化管理与全自动故障自愈能力，让服务器运维高效、优雅、安心。

---

## 🌟 核心功能亮点

### 1. 🖥️ 多 Tab 虚拟终端 & 多布局持久化分屏
- **双模终端支持**：本地 Shell（macOS zsh/bash、Windows PowerShell/CMD）与远端 VPS SSH 终端同屏无缝混合管理；
- **三种视口分屏**：支持单屏全屏、左右对半并排（Vertical Split）、上下对半分屏（Horizontal Split）；
- **会话持久化保护**：关闭或切换分屏布局时，采用共享持久 DOM 挂载树，**绝不重载或丢失终端会话与输入状态**。

### 2. 📡 多终端多主机「群控广播」(Broadcast)
- **毫秒级同步并发**：开启广播后，在任意一个活动终端输入的键盘按键与 Shell 命令，将毫秒级并发分发到所有已打开的终端中；
- **批量运维神器**：一行指令同步更新十台集群、批量部署基础环境、同时监控多节点日志；
- **状态感知提示**：界面配备醒目的广播红点脉冲动画与防误触开关。

### 3. 🎨 10 大现代终端主题 & 全局昼夜模式
- **5 款极客暗黑主题**：Tokyo Night（东京之夜）、Catppuccin Mocha（猫咪柔和）、One Dark（暗黑经典）、Dracula（吸血鬼）、Cyberpunk（赛博霓虹）；
- **5 款高对比浅色主题**：GitHub Light（经典白）、Solarized Light（护眼日光）、One Light（优雅明亮）、PaperColor Light（纸面浅色）、Nord Light（极地冰雪）；
- **智能昼夜联动**：全局 UI 昼夜风格一键切换（保存至本地持久化），并自适应推荐最佳终端配色。

### 4. 📊 FinalShell 风格实时性能状态栏
- **高频自适应采样**：2.5 秒周期平滑采集远端 Linux VPS 性能指标；
- **核心全景监控**：实时展示 CPU 核心数与占用百分比、物理内存与 Swap 占用、根分区磁盘使用量、网络即时上传/下载速度波形、1/5/15 分钟系统负载与开机运行时间；
- **折叠与展开**：支持顶部紧凑状态条展示，亦可一键展开全量可视化仪表盘。

### 5. 📁 深度协同的 SFTP 可视化文件管理器
- **终端目录自动联动 (OSC 7 / PWD 嗅探)**：在终端内输入 `cd` 切换目录，下方 SFTP 文件列表**全自动秒级同步刷新**；在 SFTP 中点击路径也可一键导航终端；
- **文件全生命周期操作**：支持目录递归浏览、新建文件夹、文件重命名、文件流式分块下载、大文件上传与**文件直接拖拽上传**；
- **在线代码轻量编辑器**：支持在线预览并修改脚本与配置文件（带语法着色与快捷键保存）；
- **压缩与解压缩**：原生支持 `.zip`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tar.xz`, `.tar`, `.gz` 一键解压与文件打包压缩；
- **权限管理与安全扫描**：支持 Chmod 八进制权限快速修改（支持递归）；提供 4 层深度文件名模糊搜索及全盘 `>50MB` 超大日志/文件排查。

### 6. 🐳 Docker 容器与镜像可视化控制台
- **容器状态雷达**：自动检测环境，直观查看所有容器 ID、名称、镜像、健康状态与映射端口；
- **一键生命周期管理**：支持容器启动、停止、重启与强制删除（带二次防误删确认）；
- **实时日志抽屉 (Drawer)**：支持日志行数调整、一键复制与一键进入容器终端内部。

### 7. 🩺 AI 全景服务器智能体检
- **多维度风险探测**：自动巡检根分区存储与超大文件、内存压力、SSH 密码暴力破解失败次数、Fail2ban 防御状态、系统运行负载与敏感端口；
- **大模型深度分析**：给出 0~100 综合健康评分，分级标注风险项（正常 / 警告 / 危险）；
- **一键自愈修复**：针对体检发现的安全或性能漏洞，AI 自动生成对应的系统修复脚本，支持一键注入终端立即执行。

### 8. 🔑 SSH 密钥对管理与自动化免密推送
- **本地安全密钥生成**：支持快速生成现代高效的 Ed25519 或 RSA-4096 密钥对；
- **一键免密分发部署**：选择目标主机，一键自动将公钥推送到远端服务器 `~/.ssh/authorized_keys`，并自动将该主机配置切换为免密密钥连接模式。

### 9. 🛠️ 常用快捷运维脚本库
- 内置 11 大类常见跑分、三网路由测速、系统清理、网络 BBR 优化、常用环境（Docker、Nginx、宝塔、1Panel）等开源成熟脚本；
- 支持用户自主添加、编辑、收藏与分类自定义常用 Shell 指令。

### 10. 🤖 AI Copilot 深度运维副驾驶
- **自然语言命令生成**：根据当前所选主机的操作系统发行版（Debian / Ubuntu / CentOS / macOS / Windows）生成完全兼容的准确命令；
- **三级安全审计拦截**：绿色只读放心用、黄色变更需留心、**红色高危拦截**（检测到破坏性指令时强制拦截并要求手动输入 `yes` 二次确认）；
- **屏幕报错智能嗅探**：自动感知终端最后一条报错，AI 深入诊断问题成因并给出修复建议；
- **自主排障 Agent**：设定任务目标后，AI 自主执行多步排障循环，分析每步终端回显并决策下一步行动，最终生成结构化排障总结。

---

## 💻 客户端下载与安装

### 🍎 macOS
- **DMG 安装镜像（推荐，双击拖拽安装）**：
  👉 前往 [Releases 页面](https://github.com/Carton-qin/AI-Terminal/releases) 下载 `AI-Terminal-1.0.2-arm64.dmg`
- **免安装绿色压缩包**：下载 `AI-Terminal-1.0.2-arm64-mac.zip`，解压即用。

> [!TIP]
> **macOS 首次打开提示「“AI-Terminal”已损坏，无法打开」？**  
> 这是 macOS 对未购买苹果 99 美元/年开发者公证证书的开源软件的默认安全拦截（非真实损坏）。只需打开系统自带的「终端」（Terminal）执行以下命令解除拦截即可正常秒开：
> ```bash
> xattr -cr /Applications/AI-Terminal.app
> ```
> *(若文件仍在“下载”文件夹中，执行 `xattr -cr ~/Downloads/AI-Terminal.app`)*

### 🪟 Windows
- **NSIS 安装向导程序**：
  👉 前往 [Releases 页面](https://github.com/Carton-qin/AI-Terminal/releases) 下载 `AI-Terminal.Setup.1.0.2.exe`
- **便携免安装单文件**：下载 `AI-Terminal.1.0.2.exe`，直接双击运行。
- **绿色便携压缩包**：下载 `AI-Terminal-1.0.2-win.zip`，解压后双击 `AI-Terminal.exe` 即可运行。


---

## 🚀 本地启动与开发

### 环境要求
- Node.js >= 18.0
- Python >= 3.10

### 1. 快速克隆与依赖安装
```bash
git clone https://github.com/Carton-qin/AI-Terminal.git
cd AI-Terminal

# 安装桌面端与前端依赖
cd ai-terminal-desktop
npm install
cd frontend && npm install && cd ..
```

### 2. 本地开发与启动
```bash
# macOS / Linux:
./run-desktop.sh

# Windows:
run-windows.bat
```
启动后，桌面客户端将自动唤起，同时后台托管服务就绪于 `http://127.0.0.1:8765`。

---

## ⚙️ GitHub Actions 全自动打包

本项目已配置完善的 CI/CD 云端构建流 [`.github/workflows/build-desktop.yml`](.github/workflows/build-desktop.yml)：
1. 每次向 `main` 分支推送代码，GitHub Actions 会自动在纯净的 macOS 和 Windows Server 虚拟环境上并行构建；
2. 约 3 分钟后，可在该次运行的 **Artifacts** 区域直接下载最新构建的 `.exe` 和 `.dmg` 安装包；
3. 若推送版本标签（例如 `git tag v1.0.0 && git push origin v1.0.0`），云端流水线将自动创建正式的 **GitHub Release** 并挂载全部安装文件。

---

## 🛡️ 安全与隐私说明

- **零云端依赖，纯本地私有运行**：所有会话连接直接由您本地的客户端发起到目标 VPS，绝不经过任何第三方服务器中转；
- **AES-256-GCM 高强度加密**：所有保存的主机资产、密码与 SSH 私钥均通过 AES-256-GCM 算法本地加密落盘；
- **开源透明**：代码 100% 开源，打包脚本与 CI 流水线公开可见，安全放心。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。欢迎 Star 🌟、提交 Issue 或发起 PR 贡献代码！
