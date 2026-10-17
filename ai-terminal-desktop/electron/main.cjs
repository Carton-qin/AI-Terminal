const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { spawn } = require('child_process')
const treeKill = require('tree-kill')

const BACKEND_PORT = 8765
let mainWindow = null
let backendProcess = null
let isQuitting = false

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

// 检查后端是否已在运行
function checkBackendHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/hosts`, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 500) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    req.on('error', () => resolve(false))
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
    // 打包后优先检查 resources/backend
    const candidates = [
      path.join(process.resourcesPath, 'backend', exeName),
      path.join(process.resourcesPath, 'backend', 'aiterm-backend', exeName),
      path.join(process.resourcesPath, exeName),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return { type: 'binary', execPath: c }
      }
    }
  } else {
    // 开发模式，优先检查 build 编译产物，其次检查 python 虚拟环境
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

// 启动后端守护进程
async function startBackendService() {
  const isAlive = await checkBackendHealth(500)
  if (isAlive) {
    console.log('[Electron] 后端服务已在运行，直接复用连接')
    return true
  }

  const backendConfig = getBackendExecutable()
  if (!backendConfig) {
    console.warn('[Electron] 未找到编译好的后端二进制，尝试通过系统 Python 启动')
  }

  try {
    if (backendConfig && backendConfig.type === 'binary') {
      const bin = backendConfig.execPath
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(bin, '755')
        } catch (e) {}
      }
      console.log('[Electron] 正在启动打包后端二进制:', bin)
      backendProcess = spawn(bin, [], {
        cwd: path.dirname(bin),
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else if (backendConfig && backendConfig.type === 'python') {
      console.log('[Electron] 正在启动 Python 后端:', backendConfig.execPath, backendConfig.args)
      const aitermDir = path.join(__dirname, '..', '..', 'ai-terminal')
      const backendDir = path.join(__dirname, '..', 'backend')
      const pyPath = `${backendDir}:${aitermDir}:${process.env.PYTHONPATH || ''}`
      backendProcess = spawn(backendConfig.execPath, backendConfig.args, {
        cwd: backendConfig.cwd,
        env: { ...process.env, PYTHONPATH: pyPath, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      // 兜底尝试 python3 / python
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3'
      const appPy = path.join(__dirname, '..', 'backend', 'app.py')
      backendProcess = spawn(pyCmd, [appPy], {
        cwd: path.join(__dirname, '..', 'backend'),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    if (backendProcess) {
      backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend stdout]: ${data}`)
      })
      backendProcess.stderr.on('data', (data) => {
        console.error(`[Backend stderr]: ${data}`)
      })
      backendProcess.on('exit', (code, signal) => {
        console.log(`[Backend process exited]: code ${code}, signal ${signal}`)
        backendProcess = null
      })
    }
  } catch (err) {
    console.error('[Electron] 启动后端失败:', err)
  }

  // 轮询等待后端 HTTP 就绪（最多等待 15 秒）
  const startTime = Date.now()
  while (Date.now() - startTime < 15000) {
    await new Promise((r) => setTimeout(r, 350))
    const ready = await checkBackendHealth(400)
    if (ready) {
      console.log('[Electron] 后端服务已成功启动并就绪!')
      return true
    }
  }

  console.error('[Electron] 后端启动超时')
  return false
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

  // 优雅展示：等待页面准备好后再显示窗口，避免白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 加载后端托管的单页应用
  mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`).catch((err) => {
    console.warn('[Electron] loadURL 失败，尝试重新加载', err)
    setTimeout(() => {
      mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`)
    }, 1000)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
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

app.whenReady().then(async () => {
  await startBackendService()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 退出前彻底清理后端子进程
function cleanupBackend(callback) {
  if (backendProcess && backendProcess.pid) {
    console.log('[Electron] 正在终止后端进程 PID:', backendProcess.pid)
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
