const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { spawn } = require('child_process')
const treeKill = require('tree-kill')

const BACKEND_PORT = 8765
let mainWindow = null
let backendProcess = null
let isQuitting = false
let backendExited = false
let backendExitCode = null
const recentLogs = []

// 日志持久化
function getLogFilePath() {
  try {
    const userDataPath = app.getPath('userData')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    return path.join(userDataPath, 'backend.log')
  } catch (e) {
    return path.join(__dirname, 'backend.log')
  }
}

const logFile = getLogFilePath()

function appendLog(line) {
  const timestamp = new Date().toISOString()
  const entry = `[${timestamp}] ${line}`
  recentLogs.push(entry)
  if (recentLogs.length > 80) recentLogs.shift()
  try {
    fs.appendFileSync(logFile, `${entry}\n`, 'utf8')
  } catch (e) {}
}

appendLog(`AI-Terminal 桌面主进程启动, 平台: ${process.platform}, 架构: ${process.arch}, 打包状态: ${app.isPackaged}`)

// 单例锁，防止重复启动多个桌面客户端
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// 轻量级探活探针 (毫秒级响应)
function checkBackendHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 500) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    req.on('error', () => {
      // 降级尝试备用路径 /health 或 /api/hosts
      const fallbackReq = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/hosts`, (res2) => {
        if (res2.statusCode >= 200 && res2.statusCode < 500) {
          resolve(true)
        } else {
          resolve(false)
        }
      })
      fallbackReq.on('error', () => resolve(false))
      fallbackReq.setTimeout(timeoutMs, () => {
        fallbackReq.destroy()
        resolve(false)
      })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

// 查找后端二进制或脚本路径
function getBackendExecutable() {
  const isWin = process.platform === 'win32'
  const exeName = isWin ? 'aiterm-backend.exe' : 'aiterm-backend'

  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, 'backend', exeName),
      path.join(process.resourcesPath, 'backend', 'aiterm-backend', exeName),
      path.join(process.resourcesPath, exeName),
      path.join(path.dirname(process.execPath), 'resources', 'backend', exeName),
      path.join(path.dirname(process.execPath), 'resources', 'backend', 'aiterm-backend', exeName),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        appendLog(`找到打包后端可执行文件: ${c}`)
        return { type: 'binary', execPath: c }
      }
    }
    appendLog(`未在已知路径找到打包后端: ${JSON.stringify(candidates)}`)
  } else {
    // 开发模式，优先检查 build 产物，其次检查 virtualenv
    const compiledPath = path.join(
      __dirname,
      '..',
      '..',
      'build',
      'pyinstaller',
      'dist',
      'aiterm-backend',
      exeName
    )
    if (fs.existsSync(compiledPath)) {
      return { type: 'binary', execPath: compiledPath }
    }

    const venvPython = isWin
      ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', '..', '.venv', 'bin', 'python')
    const appPy = path.join(__dirname, '..', 'backend', 'app.py')

    if (fs.existsSync(venvPython) && fs.existsSync(appPy)) {
      return {
        type: 'python',
        execPath: venvPython,
        args: [appPy],
        cwd: path.join(__dirname, '..', 'backend'),
      }
    }
  }

  return null
}

// 启动后端核心守护进程
async function startBackendService(onStatusUpdate = null) {
  backendExited = false
  backendExitCode = null

  if (onStatusUpdate) onStatusUpdate('正在检测端口状态...')
  const alreadyRunning = await checkBackendHealth(600)
  if (alreadyRunning) {
    appendLog('后端核心已在运行，直接复用既有实例')
    if (onStatusUpdate) onStatusUpdate('后端服务已就绪')
    return true
  }

  const backendConfig = getBackendExecutable()
  if (!backendConfig) {
    const msg = '未找到可执行的后端核心服务二进制文件'
    appendLog(msg)
    throw new Error(msg)
  }

  if (onStatusUpdate) onStatusUpdate('正在启动后台核心服务引擎...')

  try {
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }

    if (backendConfig.type === 'binary') {
      const bin = backendConfig.execPath
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(bin, '755')
        } catch (e) {}
      }
      appendLog(`启动后端二进制: ${bin}`)
      backendProcess = spawn(bin, [], {
        cwd: path.dirname(bin),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } else if (backendConfig.type === 'python') {
      appendLog(`启动开发 Python: ${backendConfig.execPath} ${backendConfig.args}`)
      const aitermDir = path.join(__dirname, '..', '..', 'ai-terminal')
      const backendDir = path.join(__dirname, '..', 'backend')
      const pyPath = `${backendDir}:${aitermDir}:${process.env.PYTHONPATH || ''}`
      backendProcess = spawn(backendConfig.execPath, backendConfig.args, {
        cwd: backendConfig.cwd,
        env: { ...env, PYTHONPATH: pyPath },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    }

    if (backendProcess) {
      backendProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) appendLog(`[Stdout] ${text}`)
      })
      backendProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) appendLog(`[Stderr] ${text}`)
      })
      backendProcess.on('exit', (code, signal) => {
        appendLog(`[Exit] 后端进程退出: code ${code}, signal ${signal}`)
        backendProcess = null
        backendExited = true
        backendExitCode = code
      })
      backendProcess.on('error', (err) => {
        appendLog(`[Error] 后端进程启动出错: ${err.message}`)
        backendProcess = null
        backendExited = true
      })
    }
  } catch (err) {
    appendLog(`启动失败: ${err.message}`)
    throw err
  }

  // 轮询等待后端 HTTP 探活响应 (最多等待 18 秒，每次 300ms)
  const startTime = Date.now()
  while (Date.now() - startTime < 18000) {
    if (backendExited) {
      const errMsg = `后端进程异常退出 (退出码: ${backendExitCode})`
      appendLog(errMsg)
      throw new Error(errMsg)
    }

    await new Promise((r) => setTimeout(r, 300))
    const ready = await checkBackendHealth(800)
    if (ready) {
      appendLog('后端核心服务启动成功且健康检查通过!')
      if (onStatusUpdate) onStatusUpdate('核心服务就绪，正在加载主界面...')
      return true
    }
  }

  const timeoutMsg = '后端服务启动超时 (18秒内未响应)'
  appendLog(timeoutMsg)
  throw new Error(timeoutMsg)
}

// 内置优雅加载与自愈容灾界面
function getSplashHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>AI Terminal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      user-select: none;
      -webkit-app-region: drag;
    }
    .wrapper {
      text-align: center;
      max-width: 580px;
      width: 90%;
      padding: 36px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.5);
    }
    .logo {
      font-size: 40px;
      margin-bottom: 12px;
      display: inline-block;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.96); opacity: 0.85; }
      50% { transform: scale(1.06); opacity: 1; filter: drop-shadow(0 0 18px rgba(56, 189, 248, 0.6)); }
      100% { transform: scale(0.96); opacity: 0.85; }
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #58a6ff;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: #8b949e;
      margin-bottom: 22px;
    }
    .spinner {
      margin: 16px auto;
      width: 34px;
      height: 34px;
      border: 3px solid rgba(88, 166, 255, 0.15);
      border-radius: 50%;
      border-top-color: #58a6ff;
      animation: spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 13px;
      color: #8b949e;
      min-height: 20px;
      margin-top: 8px;
    }
    .error-panel {
      display: none;
      margin-top: 18px;
      text-align: left;
      -webkit-app-region: no-drag;
    }
    .error-header {
      color: #f85149;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .log-container {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #e6edf3;
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      background: #0d1117;
      border: 1px solid #30363d;
      padding: 12px;
      border-radius: 6px;
    }
    .actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 18px;
    }
    .btn {
      padding: 8px 16px;
      background: #238636;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(240, 246, 252, 0.1);
      transition: background 0.15s;
    }
    .btn:hover { background: #2ea043; }
    .btn-secondary {
      background: #21262d;
      color: #c9d1d9;
      border-color: #30363d;
    }
    .btn-secondary:hover { background: #30363d; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">⚡</div>
    <div class="title">AI Terminal</div>
    <div class="subtitle">专为全栈运维与开发者打造的下一代智能终端</div>
    <div id="spinner" class="spinner"></div>
    <div id="statusText" class="status">正在初始化智能服务引擎...</div>

    <div id="errorPanel" class="error-panel">
      <div class="error-header">⚠️ <span id="errorTitle">核心服务启动异常</span></div>
      <div id="logText" class="log-container"></div>
      <div class="actions">
        <button class="btn" onclick="retry()">重新启动</button>
        <button class="btn btn-secondary" onclick="openLog()">查看日志文件</button>
      </div>
    </div>
  </div>

  <script>
    function updateStatus(text) {
      const el = document.getElementById('statusText')
      if (el) el.innerText = text
    }
    function showError(title, log) {
      document.getElementById('spinner').style.display = 'none'
      document.getElementById('statusText').style.display = 'none'
      document.getElementById('errorPanel').style.display = 'block'
      document.getElementById('errorTitle').innerText = title
      document.getElementById('logText').innerText = log || '无详细日志'
    }
    function retry() {
      document.getElementById('errorPanel').style.display = 'none'
      document.getElementById('spinner').style.display = 'block'
      document.getElementById('statusText').style.display = 'block'
      updateStatus('正在重新尝试启动...')
      if (window.desktopAPI && window.desktopAPI.retryBackend) {
        window.desktopAPI.retryBackend()
      } else {
        location.reload()
      }
    }
    function openLog() {
      if (window.desktopAPI && window.desktopAPI.openLogDir) {
        window.desktopAPI.openLogDir()
      }
    }
  </script>
</body>
</html>`
}

function updateSplashStatus(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(
      `if (typeof updateStatus === 'function') updateStatus(${JSON.stringify(text)});`
    ).catch(() => {})
  }
}

function showSplashError(title, logs) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(
      `if (typeof showError === 'function') showError(${JSON.stringify(title)}, ${JSON.stringify(logs)});`
    ).catch(() => {})
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'AI Terminal',
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      spellcheck: false,
    },
  })

  // 极速展示：打开窗口即刻呈现优雅启动界面
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 首先加载内置启动过渡界面
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getSplashHtml()))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function launchSequence() {
  createMainWindow()

  try {
    await startBackendService((status) => {
      updateSplashStatus(status)
    })

    // 后端就绪，平滑加载实际 SPA 应用
    if (mainWindow && !mainWindow.isDestroyed()) {
      appendLog(`加载主界面 URL: http://127.0.0.1:${BACKEND_PORT}`)
      mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`).catch((err) => {
        appendLog(`loadURL 遇到异常，1 秒后重试: ${err.message}`)
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`)
          }
        }, 1000)
      })
    }
  } catch (err) {
    const logSummary = recentLogs.slice(-25).join('\n') || err.message
    showSplashError(`核心服务启动失败: ${err.message}`, logSummary)
  }
}

// 窗口控制 IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  }
})
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

// 自愈与排障 IPC
ipcMain.on('backend-retry', async () => {
  appendLog('用户触发重新启动后端服务')
  try {
    await startBackendService((status) => updateSplashStatus(status))
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`)
    }
  } catch (err) {
    const logSummary = recentLogs.slice(-25).join('\n') || err.message
    showSplashError(`重试失败: ${err.message}`, logSummary)
  }
})

ipcMain.on('backend-open-log', () => {
  try {
    shell.showItemInFolder(logFile)
  } catch (e) {
    appendLog(`打开日志目录失败: ${e.message}`)
  }
})

app.whenReady().then(() => {
  launchSequence()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      launchSequence()
    }
  })
})

// 退出前彻底清理后端子进程
function cleanupBackend(callback) {
  if (backendProcess && backendProcess.pid) {
    appendLog(`正在终止后端进程 PID: ${backendProcess.pid}`)
    try {
      treeKill(backendProcess.pid, 'SIGTERM', () => {
        backendProcess = null
        if (callback) callback()
      })
      return
    } catch (e) {
      try {
        backendProcess.kill('SIGKILL')
      } catch (err) {}
    }
  }
  if (callback) callback()
}

app.on('before-quit', (e) => {
  if (!isQuitting && backendProcess) {
    isQuitting = true
    e.preventDefault()
    cleanupBackend(() => {
      app.quit()
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
