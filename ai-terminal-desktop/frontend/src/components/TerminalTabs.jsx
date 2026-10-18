import React, { useEffect, useRef, useState } from 'react'
import {
  Terminal as TerminalIcon,
  Server,
  X,
  Plus,
  Sparkles,
  Palette,
  RotateCcw,
  Activity,
  FolderTree,
  Radio,
  Columns,
  Rows,
  Maximize2,
  Box,
  HeartPulse,
  Key,
  Wifi,
  WifiOff,
  Sun,
  Moon,
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import VpsStatusBar from './VpsStatusBar'
import SftpFileManager from './SftpFileManager'
import ProcessPortModal from './ProcessPortModal'
import DockerModal from './DockerModal'
import HealthCheckModal from './HealthCheckModal'
import SshKeyManagerModal from './SshKeyManagerModal'

// 11 大现代高颜值终端主题配色方案 (5 款顶级深色 + 5 款经典浅色)
export const TERMINAL_THEMES = {
  // --- 深色极客系列 (Dark) ---
  tokyoNight: {
    name: 'Tokyo Night (东京之夜 🌙)',
    type: 'dark',
    background: '#1a1b26',
    foreground: '#a9b1d6',
    cursor: '#7aa2f7',
    cursorAccent: '#1a1b26',
    selectionBackground: '#33467c66',
    black: '#32344a',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#c0caf5',
    brightBlack: '#444b6a',
    brightRed: '#ff7a93',
    brightGreen: '#b9f27c',
    brightYellow: '#ff9e64',
    brightBlue: '#7da6ff',
    brightMagenta: '#bb9af7',
    brightCyan: '#0db9d7',
    brightWhite: '#ffffff',
  },
  catppuccin: {
    name: 'Catppuccin Mocha (猫咪柔和 🌙)',
    type: 'dark',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    cursorAccent: '#1e1e2e',
    selectionBackground: '#585b7066',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },
  oneDark: {
    name: 'One Dark (暗黑极客 🌙)',
    type: 'dark',
    background: '#21252b',
    foreground: '#abb2bf',
    cursor: '#528bff',
    cursorAccent: '#21252b',
    selectionBackground: '#3e445166',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#be5046',
    brightGreen: '#98c379',
    brightYellow: '#d19a66',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
  dracula: {
    name: 'Dracula (吸血鬼 🌙)',
    type: 'dark',
    background: '#1e1f29',
    foreground: '#f8f8f2',
    cursor: '#ff79c6',
    cursorAccent: '#1e1f29',
    selectionBackground: '#44475a66',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  cyberpunk: {
    name: 'Cyberpunk (赛博霓虹 🌙)',
    type: 'dark',
    background: '#0d0f18',
    foreground: '#00f0ff',
    cursor: '#ff007f',
    cursorAccent: '#0d0f18',
    selectionBackground: '#ff007f44',
    black: '#101116',
    red: '#ff2a6d',
    green: '#05d9e8',
    yellow: '#ffe600',
    blue: '#005678',
    magenta: '#d300c5',
    cyan: '#01f9c6',
    white: '#f5f5f5',
    brightBlack: '#212330',
    brightRed: '#ff2a6d',
    brightGreen: '#05d9e8',
    brightYellow: '#ffe600',
    brightBlue: '#005678',
    brightMagenta: '#d300c5',
    brightCyan: '#01f9c6',
    brightWhite: '#ffffff',
  },

  // --- 雅致浅色系列 (Light) ---
  githubLight: {
    name: 'GitHub Light (经典明亮 ☀️)',
    type: 'light',
    background: '#ffffff',
    foreground: '#24292f',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: '#0969da25',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#7a5200',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  },
  catppuccinLatte: {
    name: 'Catppuccin Latte (拿铁暖白 ☀️)',
    type: 'light',
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    cursorAccent: '#eff1f5',
    selectionBackground: '#acb0be40',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#8839ef',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#e64553',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#04a5e5',
    brightWhite: '#bcc0cc',
  },
  solarizedLight: {
    name: 'Solarized Light (暖调护眼 ☀️)',
    type: 'light',
    background: '#fdf6e3',
    foreground: '#586e75',
    cursor: '#657b83',
    cursorAccent: '#fdf6e3',
    selectionBackground: '#eee8d5cc',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#586e75',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
  oneLight: {
    name: 'One Light (纯净白 ☀️)',
    type: 'light',
    background: '#fafafa',
    foreground: '#383a42',
    cursor: '#526fff',
    cursorAccent: '#fafafa',
    selectionBackground: '#e5e5e6',
    black: '#383a42',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#a0a1a7',
    brightBlack: '#4f525e',
    brightRed: '#e45649',
    brightGreen: '#50a14f',
    brightYellow: '#c18401',
    brightBlue: '#4078f2',
    brightMagenta: '#a626a4',
    brightCyan: '#0184bc',
    brightWhite: '#202227',
  },
  paperColorLight: {
    name: 'PaperColor Light (典雅书卷 ☀️)',
    type: 'light',
    background: '#f5f5f5',
    foreground: '#444444',
    cursor: '#005f87',
    cursorAccent: '#f5f5f5',
    selectionBackground: '#d0d0d0',
    black: '#444444',
    red: '#df0000',
    green: '#008700',
    yellow: '#af5f00',
    blue: '#005faf',
    magenta: '#af005f',
    cyan: '#00afaf',
    white: '#e4e4e4',
    brightBlack: '#8a8a8a',
    brightRed: '#d70000',
    brightGreen: '#008700',
    brightYellow: '#d75f00',
    brightBlue: '#0087af',
    brightMagenta: '#af00af',
    brightCyan: '#00afaf',
    brightWhite: '#ffffff',
  },
}

export default function TerminalTabs({
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewLocalTab,
  onRegisterInjectHandler,
  onRegisterBufferReader,
  onTerminalError,
  onAskAi,
  hosts = [],
  onRefreshHosts,
  uiMode = 'dark',
  onToggleUiMode,
}) {
  const terminalRefs = useRef({})
  const containerRefs = useRef({})

  // 用户持久化终端外观设置
  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = localStorage.getItem('aiterm_terminal_theme')
    if (saved && TERMINAL_THEMES[saved]) return saved
    return uiMode === 'light' ? 'githubLight' : 'tokyoNight'
  })

  const [fontSize, setFontSize] = useState(
    () => Number(localStorage.getItem('aiterm_font_size')) || 14
  )

  // 监控面板显隐
  const [showVpsMetrics, setShowVpsMetrics] = useState(() => {
    const saved = localStorage.getItem('aiterm_show_vps_metrics')
    return saved !== null ? saved === 'true' : true
  })

  // SFTP 管理面板显隐
  const [showFileManager, setShowFileManager] = useState(() => {
    const saved = localStorage.getItem('aiterm_show_file_manager')
    return saved !== null ? saved === 'true' : true
  })

  // 终端当前工作目录
  const [tabCwds, setTabCwds] = useState({})

  // 分屏模式: 'none' | 'vertical' | 'horizontal'
  const [splitMode, setSplitMode] = useState('none')
  const [splitTabId, setSplitTabId] = useState(null)

  // 多终端广播模式
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const isBroadcastingRef = useRef(false)
  useEffect(() => {
    isBroadcastingRef.current = isBroadcasting
  }, [isBroadcasting])

  // 断线自动重连管理
  const [reconnectStates, setReconnectStates] = useState({})
  const manualCloseTabIds = useRef(new Set())

  // 四大模态框
  const [isPortProcOpen, setIsPortProcOpen] = useState(false)
  const [isDockerOpen, setIsDockerOpen] = useState(false)
  const [isHealthCheckOpen, setIsHealthCheckOpen] = useState(false)
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false)

  // 当 UI 主题改变时，智能推荐终端配色
  const handleToggleUiModeSmart = () => {
    if (onToggleUiMode) {
      onToggleUiMode()
      const nextMode = uiMode === 'dark' ? 'light' : 'dark'
      const curThemeObj = TERMINAL_THEMES[currentTheme]
      if (nextMode === 'light' && curThemeObj?.type === 'dark') {
        handleThemeChange('githubLight')
      } else if (nextMode === 'dark' && curThemeObj?.type === 'light') {
        handleThemeChange('tokyoNight')
      }
    }
  }

  // 纠正 splitTabId 与分屏状态
  useEffect(() => {
    if (tabs.length < 2) {
      if (splitMode !== 'none') setSplitMode('none')
      setSplitTabId(null)
    } else if (splitMode !== 'none') {
      if (!splitTabId || splitTabId === activeTabId || !tabs.find((t) => t.id === splitTabId)) {
        const otherTab = tabs.find((t) => t.id !== activeTabId)
        if (otherTab) setSplitTabId(otherTab.id)
        else {
          setSplitMode('none')
          setSplitTabId(null)
        }
      }
    }
  }, [tabs, activeTabId, splitMode, splitTabId])

  // 触发当前可见终端实例自适应 resize
  // 核心原则：
  // 1. 绝不盲目对后台隐藏的终端执行 fit()（容器尺寸为 0 会导致 xterm 计算微小列宽，触发远端 shell 折行重绘提示符）
  // 2. 只有当前视口中可见、且容器真实 DOM 尺寸具备足够长宽时才执行自适应
  const fitVisibleTerminals = () => {
    const visibleIds =
      splitMode !== 'none'
        ? [activeTabId, splitTabId].filter(Boolean)
        : [activeTabId].filter(Boolean)

    requestAnimationFrame(() => {
      visibleIds.forEach((id) => {
        const item = terminalRefs.current[id]
        const container = containerRefs.current[id]
        if (item?.fitAddon && container) {
          const w = container.clientWidth
          const h = container.clientHeight
          if (w >= 150 && h >= 80) {
            try {
              item.fitAddon.fit()
            } catch (e) {}
          }
        }
      })
    })
  }

  // 确保终端元素附着在活动 DOM 容器中并自适应（解决分屏关闭窗口时终端丢失问题）
  const ensureTerminalsAttachedAndFit = () => {
    const visibleIds =
      splitMode !== 'none'
        ? [activeTabId, splitTabId].filter(Boolean)
        : [activeTabId].filter(Boolean)

    visibleIds.forEach((tabId) => {
      const container = containerRefs.current[tabId]
      const termItem = terminalRefs.current[tabId]
      if (container && termItem?.term?.element) {
        if (termItem.term.element.parentElement !== container) {
          container.innerHTML = ''
          container.appendChild(termItem.term.element)
        }
      }
    })

    fitVisibleTerminals()
  }

  useEffect(() => {
    ensureTerminalsAttachedAndFit()
  }, [activeTabId, splitTabId, splitMode, tabs.length])

  useEffect(() => {
    localStorage.setItem('aiterm_show_vps_metrics', showVpsMetrics)
    fitVisibleTerminals()
  }, [showVpsMetrics])

  useEffect(() => {
    localStorage.setItem('aiterm_show_file_manager', showFileManager)
    fitVisibleTerminals()
  }, [showFileManager])

  useEffect(() => {
    fitVisibleTerminals()
  }, [splitMode, splitTabId])

  // 错误关键字匹配正则
  const ERROR_PATTERNS = [
    /command not found/i,
    /未找到命令/i,
    /No such file or directory/i,
    /没有那个文件或目录/i,
    /Permission denied/i,
    /权限不够/i,
    /Connection refused/i,
    /拒绝连接/i,
    /Traceback \(most recent call last\):/i,
    /E: Unable to locate package/i,
    /E: Could not get lock/i,
    /Failed to start/i,
    /SyntaxError:/i,
    /ModuleNotFoundError:/i,
  ]

  // 连接 / 重连 WebSocket
  const setupWebSocket = (tab, term, isReconnection = false) => {
    const { id, sessionId } = tab
    const wsUrl = `ws://127.0.0.1:8765/ws/terminal/${sessionId}`
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      const initialCols = term.cols >= 30 ? term.cols : 80
      const initialRows = term.rows >= 5 ? term.rows : 24
      ws.send(JSON.stringify({ type: 'resize', cols: initialCols, rows: initialRows }))
      // 本地终端无需远端网络握手，直接确认重连成功
      if (isReconnection && tab.type === 'local') {
        term.write('\r\n\x1b[32m[✓ 自动重连成功！已恢复会话连接]\x1b[0m\r\n')
        setReconnectStates((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }

    const textDecoder = new TextDecoder()
    let inspectTimer = null
    let pendingInspectChunks = []

    const flushInspection = () => {
      inspectTimer = null
      if (pendingInspectChunks.length === 0) return
      
      let text = ''
      for (let i = 0; i < pendingInspectChunks.length; i++) {
        const item = pendingInspectChunks[i]
        text += typeof item === 'string' ? item : textDecoder.decode(item)
      }
      pendingInspectChunks = []
      if (text.length > 2048) {
        text = text.slice(-2048)
      }

      if (onTerminalError) {
        const cleanSnippet = text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        if (ERROR_PATTERNS.some((pat) => pat.test(cleanSnippet))) {
          onTerminalError({ tabId: id, errorSnippet: cleanSnippet.trim() })
        }
      }

      // CWD 自动识别
      const osc7Match = text.match(/\x1b\]7;file:\/\/[^\/\r\n]*([^\x07\x1b\r\n]+)(?:\x07|\x1b\\)/)
      if (osc7Match && osc7Match[1]) {
        const detectedPath = decodeURIComponent(osc7Match[1].trim())
        if (detectedPath) {
          setTabCwds((prev) => (prev[id] === detectedPath ? prev : { ...prev, [id]: detectedPath }))
        }
      } else {
        const cleanSnippet = text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        const promptMatch = cleanSnippet.match(
          /[@][a-zA-Z0-9_\-\.]+[:\s]+([~/\w\-\.]+)\s*[\]\)]*\s*[\$#%>]\s*$/
        )
        if (promptMatch && promptMatch[1]) {
          let rawDir = promptMatch[1].trim()
          if (rawDir === '~' && tab.type === 'ssh') {
            rawDir = tab.host?.username === 'root' || tab.username === 'root' ? '/root' : '~'
          }
          if (rawDir) {
            setTabCwds((prev) => (prev[id] === rawDir ? prev : { ...prev, [id]: rawDir }))
          }
        }
      }
    }

    ws.onmessage = (event) => {
      // 0. 控制信令拦截 (SSH 连通 / 握手失败)
      if (typeof event.data === 'string') {
        const trimmed = event.data.trim()
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const ctrl = JSON.parse(trimmed)
            if (ctrl.type === 'ssh_connected') {
              tab._sshConnected = true
              tab._sshFailed = false
              if (isReconnection) {
                term.write('\r\n\x1b[32m[✓ 自动重连成功！已恢复会话连接]\x1b[0m\r\n')
              }
              setReconnectStates((prev) => {
                const next = { ...prev }
                delete next[id]
                return next
              })
              return
            } else if (ctrl.type === 'ssh_connect_failed') {
              tab._sshConnected = false
              tab._sshFailed = true
              // 目标不可达或认证失败，终止死循环自动重试，等待用户排障后手动重试
              setReconnectStates((prev) => ({
                ...prev,
                [id]: { attempt: 5, maxAttempts: 5, countdown: 0, failed: true, reason: ctrl.error },
              }))
              return
            }
          } catch (e) {}
        }
      }

      // 1. 零延迟即时送入终端渲染，由 xterm 内部高性能引擎处理，不占用任何 JS 堆栈
      if (typeof event.data === 'string') {
        term.write(event.data)
      } else {
        term.write(new Uint8Array(event.data))
      }

      // 2. 收集最近数据块供节流分析 (最多保留最后 5 个分块，避免大文件内存积压)
      pendingInspectChunks.push(event.data)
      if (pendingInspectChunks.length > 5) {
        pendingInspectChunks.shift()
      }
      if (!inspectTimer) {
        inspectTimer = setTimeout(flushInspection, 120)
      }
    }

    ws.onclose = () => {
      if (manualCloseTabIds.current.has(id)) return

      term.write('\r\n\x1b[33m[与服务器连接已断开]\x1b[0m\r\n')

      // 若为初始握手失败或主机不可达，不进入自动死循环重试
      if (tab._sshFailed) {
        return
      }

      setReconnectStates((prev) => {
        const currentAttempt = prev[id]?.attempt || 0
        if (currentAttempt >= 5) {
          return {
            ...prev,
            [id]: { attempt: 5, maxAttempts: 5, countdown: 0, failed: true },
          }
        }
        const nextAttempt = currentAttempt + 1
        const backoffSeconds = Math.min(30, Math.pow(2, nextAttempt))

        return {
          ...prev,
          [id]: {
            attempt: nextAttempt,
            maxAttempts: 5,
            countdown: backoffSeconds,
            isReconnecting: false,
          },
        }
      })
    }

    return ws
  }

  // 执行自动重连
  const triggerReconnectTab = async (tabId) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    tab._sshFailed = false

    setReconnectStates((prev) => ({
      ...prev,
      [tabId]: { ...(prev[tabId] || {}), isReconnecting: true, countdown: 0 },
    }))

    const item = terminalRefs.current[tabId]
    if (item && item.term) {
      item.term.write('\r\n\x1b[36m[正在建立新的会话连接并恢复终端...]\x1b[0m\r\n')
      try {
        const res = await fetch('http://127.0.0.1:8765/api/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: tab.type,
            host_id: tab.host?.id,
            cols: item.term.cols || 100,
            rows: item.term.rows || 30,
          }),
        })
        if (!res.ok) throw new Error('创建新会话失败')
        const data = await res.json()
        tab.sessionId = data.session_id
        item.sessionId = data.session_id

        const newWs = setupWebSocket(tab, item.term, true)
        item.ws = newWs
      } catch (err) {
        item.term.write(`\r\n\x1b[31m[重连失败: ${err.message}]\x1b[0m\r\n`)
        setReconnectStates((prev) => ({
          ...prev,
          [tabId]: {
            ...(prev[tabId] || {}),
            isReconnecting: false,
            countdown: 5,
          },
        }))
      }
    }
  }

  const cancelReconnect = (tabId) => {
    setReconnectStates((prev) => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }

  // 倒计时定时器
  useEffect(() => {
    const timer = setInterval(() => {
      setReconnectStates((prev) => {
        let changed = false
        const next = { ...prev }

        Object.keys(next).forEach((tabId) => {
          const state = next[tabId]
          if (state && !state.isReconnecting && !state.failed && state.countdown > 0) {
            const nextCount = state.countdown - 1
            if (nextCount <= 0) {
              triggerReconnectTab(tabId)
              next[tabId] = { ...state, countdown: 0, isReconnecting: true }
            } else {
              next[tabId] = { ...state, countdown: nextCount }
            }
            changed = true
          }
        })

        return changed ? next : prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [tabs])

  // 初始化终端实例
  useEffect(() => {
    tabs.forEach((tab) => {
      const { id } = tab
      if (terminalRefs.current[id]) return

      const container = containerRefs.current[id]
      if (!container) return

      const activeThemeObj = TERMINAL_THEMES[currentTheme] || TERMINAL_THEMES.tokyoNight

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorWidth: 2,
        fontSize: fontSize,
        lineHeight: 1.45,
        letterSpacing: 0.5,
        fontFamily:
          '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Monaco, Consolas, monospace',
        theme: activeThemeObj,
        scrollback: 10000,
        smoothScrollDuration: 0, // 0 = 禁用平滑滚动动画，杜绝高频输出时的逐行滚动卡顿
        fastScrollSensitivity: 5,
        scrollOnUserInput: true,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(container)
      if (container.clientWidth >= 150 && container.clientHeight >= 80) {
        try {
          fitAddon.fit()
        } catch (e) {}
      }

      const ws = setupWebSocket(tab, term, false)

      term.onData((data) => {
        if (isBroadcastingRef.current) {
          Object.values(terminalRefs.current).forEach((target) => {
            if (target?.ws && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(data)
            }
          })
        } else {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data)
          }
        }
      })

      let lastCols = term.cols
      let lastRows = term.rows
      let resizeTimer = null

      term.onResize(({ cols, rows }) => {
        // 关键防御：如果计算出的列数或行数过小（例如隐藏容器或未就绪导致 cols < 30），坚决不要向后端发送 resize！
        // 否则远端 Bash/Zsh readline 接收到微小列宽后会强制对当前行进行折行重新排版，造成终端反复输出多行提示符！
        if (cols < 30 || rows < 5) {
          return
        }
        if (cols === lastCols && rows === lastRows) return
        lastCols = cols
        lastRows = rows

        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          const curWs = terminalRefs.current[id]?.ws
          if (curWs && curWs.readyState === WebSocket.OPEN) {
            curWs.send(JSON.stringify({ type: 'resize', cols, rows }))
          }
        }, 60)
      })

      terminalRefs.current[id] = { term, fitAddon, ws, sessionId: tab.sessionId }
    })

    Object.keys(terminalRefs.current).forEach((tabId) => {
      if (!tabs.find((t) => t.id === tabId)) {
        manualCloseTabIds.current.add(tabId)
        const item = terminalRefs.current[tabId]
        if (item.ws) item.ws.close()
        if (item.term) item.term.dispose()
        delete terminalRefs.current[tabId]
        setTabCwds((prev) => {
          if (!prev[tabId]) return prev
          const next = { ...prev }
          delete next[tabId]
          return next
        })
        setReconnectStates((prev) => {
          if (!prev[tabId]) return prev
          const next = { ...prev }
          delete next[tabId]
          return next
        })
      }
    })
  }, [tabs])

  // 激活变更
  useEffect(() => {
    if (activeTabId && terminalRefs.current[activeTabId]) {
      requestAnimationFrame(() => {
        const item = terminalRefs.current[activeTabId]
        const container = containerRefs.current[activeTabId]
        if (item?.fitAddon && container && container.clientWidth >= 150 && container.clientHeight >= 80) {
          try {
            item.fitAddon.fit()
          } catch (e) {}
        }
        item?.term?.focus()
      })
    }
  }, [activeTabId])

  useEffect(() => {
    const handleResize = () => {
      fitVisibleTerminals()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTabId, splitTabId, splitMode])

  // 注册命令注入
  useEffect(() => {
    onRegisterInjectHandler((cmd, autoExecute = true) => {
      const payload = autoExecute ? cmd + '\r' : cmd
      if (isBroadcastingRef.current) {
        Object.values(terminalRefs.current).forEach((item) => {
          if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
            item.ws.send(payload)
          }
        })
      } else {
        if (activeTabId && terminalRefs.current[activeTabId]) {
          const item = terminalRefs.current[activeTabId]
          if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
            item.ws.send(payload)
            item.term.focus()
          }
        }
      }
    })
  }, [activeTabId, onRegisterInjectHandler])

  // 注册缓冲区读取 (直接读取 xterm 原生活动屏缓冲区，零开销、零正则损耗)
  useEffect(() => {
    onRegisterBufferReader(() => {
      if (!activeTabId) return ''
      const item = terminalRefs.current[activeTabId]
      if (item && item.term) {
        const buf = item.term.buffer.active
        const lines = []
        const start = Math.max(0, buf.length - 80)
        for (let i = start; i < buf.length; i++) {
          const line = buf.getLine(i)
          if (line) lines.push(line.translateToString(true))
        }
        return lines.join('\n').trim()
      }
      return ''
    })
  }, [activeTabId, onRegisterBufferReader])

  // 切换主题
  const handleThemeChange = (themeKey) => {
    setCurrentTheme(themeKey)
    localStorage.setItem('aiterm_terminal_theme', themeKey)
    const newTheme = TERMINAL_THEMES[themeKey]
    if (newTheme) {
      Object.values(terminalRefs.current).forEach((item) => {
        if (item.term) {
          item.term.options.theme = newTheme
        }
      })
    }
  }

  // 调整字号
  const handleFontSizeChange = (delta) => {
    setFontSize((prev) => {
      const next = Math.max(12, Math.min(22, prev + delta))
      localStorage.setItem('aiterm_font_size', next.toString())
      Object.values(terminalRefs.current).forEach((item) => {
        if (item.term) {
          item.term.options.fontSize = next
        }
      })
      fitVisibleTerminals()
      return next
    })
  }

  const handleClearTerminal = (tabId) => {
    const item = terminalRefs.current[tabId]
    if (item && item.term) {
      item.term.clear()
      item.term.focus()
    }
  }

  const applyColorPrompt = (tabId) => {
    const item = terminalRefs.current[tabId]
    if (item && item.ws && item.ws.readyState === WebSocket.OPEN) {
      const colorCmd =
        "export TERM=xterm-256color COLORTERM=truecolor; [ -n \"$BASH_VERSION\" ] && export PS1='\\[\\e[38;5;45m\\]\\u\\[\\e[38;5;244m\\]@\\[\\e[38;5;81m\\]\\h\\[\\e[38;5;244m\\]:\\[\\e[38;5;141m\\]\\w\\[\\e[38;5;45m\\]\\\\$ \\[\\e[0m\\]'; alias ls='ls --color=auto' 2>/dev/null; alias ll='ls -la --color=auto' 2>/dev/null; alias grep='grep --color=auto' 2>/dev/null; clear\r"
      item.ws.send(colorCmd)
      item.term.focus()
    }
  }

  const currentActiveTab = tabs.find((t) => t.id === activeTabId)
  const currentSplitTab = tabs.find((t) => t.id === splitTabId)
  const activeSessionId = terminalRefs.current[activeTabId]?.sessionId || currentActiveTab?.sessionId
  const effectiveActiveTab = currentActiveTab ? { ...currentActiveTab, sessionId: activeSessionId } : null
  const activeTheme = TERMINAL_THEMES[currentTheme] || TERMINAL_THEMES.tokyoNight

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-[#0d1117] overflow-hidden select-none transition-colors duration-200">
      {/* 1. 现代化 Tab 顶部标签栏 */}
      <div className="h-10 bg-slate-200/80 dark:bg-[#161b22] border-b border-slate-300/80 dark:border-[#30363d] flex items-center justify-between px-3 shrink-0 transition-colors">
        <div className="flex items-center space-x-1.5 overflow-x-auto h-full py-1 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isSplitActive = splitMode !== 'none' && tab.id === splitTabId

            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex items-center space-x-2 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-all max-w-[200px] border whitespace-nowrap shrink-0 select-none ${
                  isActive
                    ? 'bg-white dark:bg-[#1a1b26] text-slate-900 dark:text-white border-slate-300 dark:border-cyan-500/80 font-medium shadow-xs'
                    : isSplitActive
                    ? 'bg-purple-100/70 dark:bg-[#1a1b26]/70 text-purple-700 dark:text-cyan-200 border-purple-300 dark:border-purple-400 font-medium'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 border-transparent hover:bg-slate-300/50 dark:hover:bg-[#21262d]'
                }`}
              >
                {tab.type === 'ssh' ? (
                  <Server size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                ) : (
                  <TerminalIcon size={13} className="text-cyan-500 dark:text-cyan-400 shrink-0" />
                )}
                <span className="truncate">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  className="opacity-60 group-hover:opacity-100 hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10 p-0.5 rounded transition shrink-0"
                  title="关闭标签页"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}

          {/* 新建标签按钮 */}
          <button
            onClick={onNewLocalTab}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white hover:bg-slate-300/60 dark:hover:bg-[#21262d] rounded-lg transition shrink-0"
            title="新建本地终端"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* 顶部右侧：一键日/夜浅深主题切换 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleToggleUiModeSmart}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-[#21262d] text-slate-700 dark:text-gray-200 border border-slate-300/80 dark:border-[#30363d] hover:bg-slate-100 dark:hover:bg-[#2b313a] shadow-xs transition shrink-0"
            title={uiMode === 'dark' ? '切换为浅色主题 (Light)' : '切换为深色主题 (Dark)'}
          >
            {uiMode === 'dark' ? (
              <>
                <Sun size={13} className="text-amber-400 animate-spin-slow shrink-0" />
                <span className="text-[11px] whitespace-nowrap font-medium">浅色模式</span>
              </>
            ) : (
              <>
                <Moon size={13} className="text-indigo-600 shrink-0" />
                <span className="text-[11px] whitespace-nowrap font-medium">深色模式</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. 终端主体视口 */}
      <div
        className="flex-1 flex flex-col relative overflow-hidden transition-colors duration-200"
        style={{ backgroundColor: activeTheme.background }}
      >
        {tabs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-gray-500">
            <TerminalIcon size={48} className="mb-3 opacity-20 text-cyan-500" />
            <p className="text-sm font-medium">暂无活跃的终端窗口</p>
            <p className="text-xs text-slate-400 dark:text-gray-600 mt-1">
              从左侧点击 VPS 快速连接，或点击上方 + 打开本地终端
            </p>
          </div>
        ) : (
          <>
            {/* 终端专属操作与状态栏 (Terminal Action Bar - 响应式优雅折行，无横向滚动条) */}
            <div className="min-h-[40px] border-b border-slate-200/80 dark:border-white/5 flex flex-wrap items-center justify-between px-3 py-1.5 text-xs bg-white/80 dark:bg-[#161b22]/90 shrink-0 backdrop-blur-md transition-colors gap-y-1.5 gap-x-2 shadow-2xs">
              {/* 左侧：主机信息与在线状态 */}
              <div className="flex items-center space-x-2 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="font-semibold text-slate-800 dark:text-gray-200 text-xs whitespace-nowrap">
                  {currentActiveTab?.type === 'ssh'
                    ? (currentActiveTab.host?.name || currentActiveTab.hostName || currentActiveTab.title).replace(/\s*\([^)]*\)$/, '')
                    : (currentActiveTab?.osLabel ? `本地 ${currentActiveTab.osLabel}` : '本地终端')}
                </span>
                {currentActiveTab?.type === 'ssh' && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-gray-400 font-mono text-[10px] whitespace-nowrap">
                    {currentActiveTab.ip || currentActiveTab.host?.ip}:{currentActiveTab.port || 22}
                  </span>
                )}
                {currentActiveTab?.type === 'ssh' && (
                  <button
                    onClick={() => applyColorPrompt(activeTabId)}
                    className="p-1 text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-300 rounded transition shrink-0"
                    title="重新注入彩色 Prompt 与彩色 ls 输出"
                  >
                    <Sparkles size={12} />
                  </button>
                )}
              </div>

              {/* 中间偏左：一体化高级运维套件 (精致水平分段控制组，杜绝竖排折行) */}
              <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 shrink-0">
                <button
                  onClick={() => setIsPortProcOpen(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-white/10 transition whitespace-nowrap shrink-0"
                  title="可视化监听端口与系统进程管理器"
                >
                  <Activity size={13} className="text-cyan-500 shrink-0" />
                  <span>端口/进程</span>
                </button>

                <button
                  onClick={() => setIsDockerOpen(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-white dark:hover:bg-white/10 transition whitespace-nowrap shrink-0"
                  title="Docker 容器可视化管理 (启停/日志/Exec)"
                >
                  <Box size={13} className="text-blue-500 shrink-0" />
                  <span>Docker</span>
                </button>

                <button
                  onClick={() => setIsHealthCheckOpen(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-white dark:hover:bg-white/10 transition whitespace-nowrap shrink-0"
                  title="服务器一键 AI 智能体检报告"
                >
                  <HeartPulse size={13} className="text-emerald-500 shrink-0" />
                  <span>AI 体检</span>
                </button>

                <button
                  onClick={() => setIsKeyManagerOpen(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-white dark:hover:bg-white/10 transition whitespace-nowrap shrink-0"
                  title="SSH 密钥管理器 & 免密直连助手"
                >
                  <Key size={13} className="text-amber-500 shrink-0" />
                  <span>密钥</span>
                </button>
              </div>

              {/* 中间偏右：分屏布局与功能视口开关 */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {/* 分屏模式切换 */}
                <div className="flex items-center space-x-0.5 p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs shrink-0">
                  <button
                    onClick={() => {
                      setSplitMode('none')
                      fitVisibleTerminals()
                    }}
                    className={`px-2 py-1 rounded-md transition whitespace-nowrap text-xs font-medium ${
                      splitMode === 'none'
                        ? 'bg-white dark:bg-[#21262d] text-slate-900 dark:text-white font-bold shadow-2xs border border-slate-300/70 dark:border-transparent'
                        : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="单屏全屏模式"
                  >
                    全屏
                  </button>
                  <button
                    onClick={() => {
                      if (tabs.length < 2) {
                        alert('分屏需要至少打开 2 个终端 Tab。请先连接其他 VPS 或点击 + 新建本地终端。')
                        return
                      }
                      setSplitMode('vertical')
                      if (!splitTabId || splitTabId === activeTabId) {
                        const other = tabs.find((t) => t.id !== activeTabId)
                        if (other) setSplitTabId(other.id)
                      }
                      fitVisibleTerminals()
                    }}
                    className={`px-2 py-1 rounded-md transition whitespace-nowrap flex items-center space-x-1 text-xs font-medium ${
                      splitMode === 'vertical'
                        ? 'bg-white dark:bg-[#21262d] text-slate-900 dark:text-white font-bold shadow-2xs border border-slate-300/70 dark:border-transparent'
                        : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="左右双分屏"
                  >
                    <Columns size={12} className="shrink-0" />
                    <span>左右</span>
                  </button>
                  <button
                    onClick={() => {
                      if (tabs.length < 2) {
                        alert('分屏需要至少打开 2 个终端 Tab。请先连接其他 VPS 或点击 + 新建本地终端。')
                        return
                      }
                      setSplitMode('horizontal')
                      if (!splitTabId || splitTabId === activeTabId) {
                        const other = tabs.find((t) => t.id !== activeTabId)
                        if (other) setSplitTabId(other.id)
                      }
                      fitVisibleTerminals()
                    }}
                    className={`px-2 py-1 rounded-md transition whitespace-nowrap flex items-center space-x-1 text-xs font-medium ${
                      splitMode === 'horizontal'
                        ? 'bg-white dark:bg-[#21262d] text-slate-900 dark:text-white font-bold shadow-2xs border border-slate-300/70 dark:border-transparent'
                        : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="上下双分屏"
                  >
                    <Rows size={12} className="shrink-0" />
                    <span>上下</span>
                  </button>
                </div>

                {/* 广播模式开关 */}
                <button
                  onClick={() => setIsBroadcasting(!isBroadcasting)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 transition shadow-2xs whitespace-nowrap shrink-0 border ${
                    isBroadcasting
                      ? 'bg-rose-500 text-white animate-pulse font-bold border-rose-600'
                      : 'bg-slate-200/60 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="多终端并发广播"
                >
                  <Radio size={12} className={isBroadcasting ? 'text-white' : ''} />
                  <span>广播 {isBroadcasting ? 'ON' : 'OFF'}</span>
                </button>

                {/* 监控与 SFTP 开关组 */}
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => setShowVpsMetrics(!showVpsMetrics)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 transition border whitespace-nowrap shrink-0 ${
                      showVpsMetrics
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 font-semibold'
                        : 'bg-slate-200/50 dark:bg-white/5 border-slate-300/50 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="切换 VPS 实时监控面板"
                  >
                    <Activity size={12} className={showVpsMetrics ? 'text-emerald-600 dark:text-emerald-400' : ''} />
                    <span>监控</span>
                  </button>

                  <button
                    onClick={() => setShowFileManager(!showFileManager)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 transition border whitespace-nowrap shrink-0 ${
                      showFileManager
                        ? 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 font-semibold'
                        : 'bg-slate-200/50 dark:bg-white/5 border-slate-300/50 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="切换 SFTP 文件管理面板"
                  >
                    <FolderTree size={12} className={showFileManager ? 'text-blue-600 dark:text-blue-400' : ''} />
                    <span>SFTP</span>
                  </button>
                </div>
              </div>

              {/* 右侧：外观与终端微调 */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {/* 现代化主题选择器 */}
                <div className="flex items-center space-x-1 bg-slate-200/60 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 rounded-lg px-2 py-1 text-xs shrink-0 whitespace-nowrap">
                  <Palette size={12} className="text-indigo-500 dark:text-cyan-400 shrink-0 mr-0.5" />
                  <select
                    value={currentTheme}
                    onChange={(e) => handleThemeChange(e.target.value)}
                    className="bg-transparent text-xs text-slate-800 dark:text-gray-200 focus:outline-none cursor-pointer pr-1 font-medium"
                  >
                    <optgroup label="☀️ 浅色主题" className="bg-white dark:bg-[#1a1b26] text-slate-900 dark:text-white font-semibold">
                      <option value="githubLight">☀️ GitHub Light</option>
                      <option value="catppuccinLatte">☀️ Catppuccin</option>
                      <option value="solarizedLight">☀️ Solarized</option>
                      <option value="oneLight">☀️ One Light</option>
                      <option value="paperColorLight">☀️ PaperColor</option>
                    </optgroup>
                    <optgroup label="🌙 深色主题" className="bg-white dark:bg-[#1a1b26] text-slate-900 dark:text-white font-semibold">
                      <option value="tokyoNight">🌙 Tokyo Night</option>
                      <option value="catppuccin">🌙 Catppuccin</option>
                      <option value="oneDark">🌙 One Dark</option>
                      <option value="dracula">🌙 Dracula</option>
                      <option value="cyberpunk">🌙 Cyberpunk</option>
                      <option value="nord">🌙 Nord</option>
                    </optgroup>
                  </select>
                </div>

                {/* 字号缩放 */}
                <div className="flex items-center space-x-0.5 bg-slate-200/60 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 rounded-lg px-1.5 py-1 text-xs text-slate-600 dark:text-gray-400 shrink-0 whitespace-nowrap">
                  <button
                    onClick={() => handleFontSizeChange(-1)}
                    className="px-1.5 hover:text-slate-900 dark:hover:text-white transition font-bold"
                    title="缩小字体"
                  >
                    -
                  </button>
                  <span className="px-0.5 text-slate-800 dark:text-gray-200 font-mono text-[11px] font-semibold">{fontSize}px</span>
                  <button
                    onClick={() => handleFontSizeChange(1)}
                    className="px-1.5 hover:text-slate-900 dark:hover:text-white transition font-bold"
                    title="放大字体"
                  >
                    +
                  </button>
                </div>

                {/* 清屏 */}
                <button
                  onClick={() => handleClearTerminal(activeTabId)}
                  className="p-1.5 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition text-slate-500 dark:text-gray-400 shrink-0"
                  title="清屏 (Clear)"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            {/* 广播模式全域发光警示横幅 */}
            {isBroadcasting && (
              <div className="h-6 bg-rose-500 text-white px-3 flex items-center justify-between text-xs font-semibold animate-pulse select-none shrink-0 shadow-sm">
                <div className="flex items-center space-x-2">
                  <Radio size={12} />
                  <span>
                    📡 多终端并发广播已开启！当前输入的每一条命令将同步在全部 {tabs.length} 个终端并发执行！
                  </span>
                </div>
                <button
                  onClick={() => setIsBroadcasting(false)}
                  className="underline hover:text-yellow-200 text-[11px]"
                >
                  关闭广播
                </button>
              </div>
            )}

            {/* FinalShell 风格 VPS 实时状态监控面板 */}
            <VpsStatusBar
              activeTab={effectiveActiveTab}
              visible={showVpsMetrics}
              onClose={() => setShowVpsMetrics(false)}
            />

            {/* 终端画布主体区域 (支持单屏与分屏模式，单套持久容器彻底杜绝终端丢失) */}
            <div className="flex-1 p-2 overflow-hidden relative flex flex-col">
              <div
                className={`w-full h-full ${
                  splitMode === 'vertical'
                    ? 'flex flex-row space-x-2'
                    : splitMode === 'horizontal'
                    ? 'flex flex-col space-y-2'
                    : 'relative'
                }`}
              >
                {tabs.map((tab) => {
                  const isMain = tab.id === activeTabId
                  const isSplit = splitMode !== 'none' && tab.id === splitTabId
                  const isVisible = splitMode === 'none' ? isMain : (isMain || isSplit)
                  const recState = reconnectStates[tab.id]

                  let paneLayoutClasses = ''
                  if (splitMode === 'vertical') {
                    paneLayoutClasses = isVisible ? 'w-1/2 h-full flex flex-col relative' : 'hidden'
                  } else if (splitMode === 'horizontal') {
                    paneLayoutClasses = isVisible ? 'w-full h-1/2 flex flex-col relative' : 'hidden'
                  } else {
                    paneLayoutClasses = isMain
                      ? 'w-full h-full absolute inset-0 flex flex-col z-10 visible opacity-100'
                      : 'w-full h-full absolute inset-0 flex flex-col z-0 invisible opacity-0 pointer-events-none'
                  }

                  return (
                    <div
                      key={tab.id}
                      className={`${paneLayoutClasses} rounded-xl overflow-hidden ${
                        splitMode !== 'none' && isVisible
                          ? isMain
                            ? 'border-2 border-cyan-500/80 shadow-md'
                            : 'border-2 border-purple-500/70 shadow-md'
                          : ''
                      }`}
                      onClick={() => {
                        if (splitMode !== 'none' && activeTabId !== tab.id) {
                          onSelectTab(tab.id)
                        }
                      }}
                    >
                      {/* 分屏模式专属：顶部视口标识栏 */}
                      {splitMode !== 'none' && isVisible && (
                        <div className="h-6 bg-slate-100 dark:bg-[#161b22] px-2.5 flex items-center justify-between text-[11px] text-slate-700 dark:text-gray-300 border-b border-slate-200 dark:border-[#30363d] shrink-0 select-none">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isMain ? 'bg-cyan-500' : 'bg-purple-500'
                              }`}
                            />
                            <span className="font-semibold text-slate-800 dark:text-white truncate">
                              {isMain ? '主视口' : '副视口'}: {tab.title}
                            </span>
                            {isMain && (
                              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono ml-1 shrink-0">
                                [焦点]
                              </span>
                            )}
                          </div>

                          {!isMain && (
                            <div className="flex items-center space-x-2 shrink-0">
                              <select
                                value={splitTabId || ''}
                                onChange={(e) => setSplitTabId(e.target.value)}
                                className="bg-transparent border-none text-[10px] text-slate-700 dark:text-gray-300 focus:outline-none cursor-pointer"
                              >
                                {tabs
                                  .filter((t) => t.id !== activeTabId)
                                  .map((t) => (
                                    <option
                                      key={t.id}
                                      value={t.id}
                                      className="bg-white dark:bg-[#161b22] text-slate-800 dark:text-white"
                                    >
                                      切换为: {t.title}
                                    </option>
                                  ))}
                              </select>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSplitMode('none')
                                }}
                                className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-[10px] px-1"
                                title="退出分屏"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 终端实例真实挂载 DOM 容器 */}
                      <div className="flex-1 w-full h-full relative overflow-hidden">
                        <div
                          ref={(el) => {
                            containerRefs.current[tab.id] = el
                            if (el && terminalRefs.current[tab.id]?.term?.element) {
                              if (terminalRefs.current[tab.id].term.element.parentElement !== el) {
                                el.innerHTML = ''
                                el.appendChild(terminalRefs.current[tab.id].term.element)
                                if (el.clientWidth >= 150 && el.clientHeight >= 80) {
                                  requestAnimationFrame(() => {
                                    try {
                                      terminalRefs.current[tab.id]?.fitAddon?.fit()
                                    } catch (e) {}
                                  })
                                }
                              }
                            }
                          }}
                          className="w-full h-full"
                        />

                        {/* 断线自动重连覆盖通知条 (Feature 10) */}
                        {recState && (
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-amber-500/90 text-white border border-amber-400 rounded-xl shadow-2xl flex items-center space-x-3 text-xs backdrop-blur-md animate-in fade-in">
                            <WifiOff size={16} className="text-white animate-pulse" />
                            <div>
                              <span className="font-semibold">会话连接已断开</span>
                              {recState.failed ? (
                                <span className="ml-2 text-red-100">
                                  已达最大重连尝试次数 (5/5)
                                </span>
                              ) : recState.isReconnecting ? (
                                <span className="ml-2 text-white">
                                  正在尝试重新连接 (第 {recState.attempt}/5 次)...
                                </span>
                              ) : (
                                <span className="ml-2">
                                  将在 {recState.countdown} 秒后自动重试 (第 {recState.attempt}/5 次)...
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-1.5 pl-2">
                              <button
                                onClick={() => triggerReconnectTab(tab.id)}
                                className="px-2 py-0.5 bg-white text-slate-900 font-bold rounded text-[11px] transition shadow-xs"
                              >
                                立即重连
                              </button>
                              <button
                                onClick={() => cancelReconnect(tab.id)}
                                className="px-2 py-0.5 bg-black/20 hover:bg-black/30 text-white rounded text-[11px] transition"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* FinalShell 风格 SFTP / 远程与本地文件管理面板 */}
            <SftpFileManager
              key={effectiveActiveTab?.id + '-' + (effectiveActiveTab?.sessionId || '')}
              activeTab={effectiveActiveTab}
              visible={showFileManager}
              terminalCwd={tabCwds[activeTabId]}
              onNavigateTerminal={(targetPath) => {
                if (targetPath && activeTabId && terminalRefs.current[activeTabId]) {
                  const item = terminalRefs.current[activeTabId]
                  if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
                    item.ws.send(`cd "${targetPath}"\r`)
                    item.term.focus()
                  }
                }
              }}
              onClose={() => setShowFileManager(false)}
            />
          </>
        )}
      </div>

      {/* 4 大运维排障与管理模态框 */}
      <ProcessPortModal
        isOpen={isPortProcOpen}
        onClose={() => setIsPortProcOpen(false)}
        activeTab={effectiveActiveTab}
        onInjectCommand={(cmd) => {
          if (activeTabId && terminalRefs.current[activeTabId]) {
            const item = terminalRefs.current[activeTabId]
            if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
              item.ws.send(cmd + '\r')
              item.term.focus()
            }
          }
        }}
        onAskAi={onAskAi}
      />

      <DockerModal
        isOpen={isDockerOpen}
        onClose={() => setIsDockerOpen(false)}
        activeTab={effectiveActiveTab}
        onInjectCommand={(cmd) => {
          if (activeTabId && terminalRefs.current[activeTabId]) {
            const item = terminalRefs.current[activeTabId]
            if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
              item.ws.send(cmd + '\r')
              item.term.focus()
            }
          }
        }}
      />

      <HealthCheckModal
        isOpen={isHealthCheckOpen}
        onClose={() => setIsHealthCheckOpen(false)}
        activeTab={effectiveActiveTab}
        onInjectCommand={(cmd) => {
          if (activeTabId && terminalRefs.current[activeTabId]) {
            const item = terminalRefs.current[activeTabId]
            if (item?.ws && item.ws.readyState === WebSocket.OPEN) {
              item.ws.send(cmd + '\r')
              item.term.focus()
            }
          }
        }}
      />

      <SshKeyManagerModal
        isOpen={isKeyManagerOpen}
        onClose={() => setIsKeyManagerOpen(false)}
        hosts={hosts}
        onRefreshHosts={onRefreshHosts}
      />
    </div>
  )
}
