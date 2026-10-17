import React, { useEffect, useRef, useState } from 'react'
import HostSidebar from './components/HostSidebar'
import TerminalTabs from './components/TerminalTabs'
import AICopilot from './components/AICopilot'
import HostModal from './components/HostModal'
import SnippetDrawer from './components/SnippetDrawer'
import SettingsModal from './components/SettingsModal'
import SshKeyManagerModal from './components/SshKeyManagerModal'

export default function App() {
  const [hosts, setHosts] = useState([])
  const [groups, setGroups] = useState([])
  const [editingHost, setEditingHost] = useState(null)

  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [copilotCollapsed, setCopilotCollapsed] = useState(false)

  // 每个 Tab 拥有完全独立的 AI 对话记录，切换 Tab 互不干扰
  const [tabChats, setTabChats] = useState({})
  // 终端报错嗅探状态 (tabId -> errorSnippet)
  const [terminalErrors, setTerminalErrors] = useState({})
  // 自动执行开关，支持本地持久化
  const [autoExecute, setAutoExecute] = useState(() => {
    return localStorage.getItem('aiterm_auto_execute') === 'true'
  })

  // 全局浅色 / 深色主题模式持久化 (与 Tailwind 'dark' class 联动)
  const [uiMode, setUiMode] = useState(() => {
    return localStorage.getItem('aiterm_ui_mode') || 'dark'
  })

  useEffect(() => {
    localStorage.setItem('aiterm_ui_mode', uiMode)
    if (uiMode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [uiMode])

  const toggleUiMode = () => {
    setUiMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  // 模态框显隐
  const [isHostModalOpen, setIsHostModalOpen] = useState(false)
  const [isSnippetOpen, setIsSnippetOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false)

  // 回调句柄引用
  const injectHandlerRef = useRef(null)
  const bufferReaderRef = useRef(null)

  // 加载主机列表
  const fetchHosts = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8765/api/hosts')
      if (res.ok) {
        const data = await res.json()
        setHosts(data)
      }
    } catch (e) {
      console.warn('后端暂未启动或无法连接')
    }
  }

  // 加载分组列表
  const fetchGroups = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8765/api/groups')
      if (res.ok) {
        const data = await res.json()
        setGroups(data)
      }
    } catch (e) {
      console.warn('获取分组列表失败')
    }
  }

  useEffect(() => {
    fetchHosts()
    fetchGroups()
    // 首次自动打开一个本地 macOS 终端会话
    openLocalTab()
  }, [])

  // 打开本地终端 Tab
  const openLocalTab = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8765/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'local', cols: 100, rows: 30 }),
      })
      const data = await res.json()
      const newTabId = 'tab-' + Date.now()
      const newTab = {
        id: newTabId,
        sessionId: data.session_id,
        title: '本地终端 (macOS)',
        type: 'local',
      }
      setTabs((prev) => [...prev, newTab])
      setTabChats((prev) => ({
        ...prev,
        [newTabId]: [
          {
            id: 'welcome-' + newTabId,
            userQuery: '本地 macOS 会话',
            isCommand: false,
            explanation:
              '已连接本地终端。AI Copilot 已感知 macOS 环境，输入自然语言即可生成兼容的 Shell 命令。',
          },
        ],
      }))
      setActiveTabId(newTabId)
    } catch (err) {
      console.error('创建本地终端失败', err)
    }
  }

  // 连接远程 VPS 主机
  const handleConnectHost = async (host) => {
    try {
      const res = await fetch('http://127.0.0.1:8765/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh', host_id: host.id, cols: 100, rows: 30 }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`连接失败: ${err.detail || '未知原因'}`)
        return
      }
      const data = await res.json()
      const newTabId = 'tab-' + Date.now()
      const newTab = {
        id: newTabId,
        sessionId: data.session_id,
        title: `${host.name} (${host.ip})`,
        type: 'ssh',
        host: host,
        ip: host.ip,
        hostName: host.name,
        port: host.port || 22,
      }
      setTabs((prev) => [...prev, newTab])
      setTabChats((prev) => ({
        ...prev,
        [newTabId]: [
          {
            id: 'welcome-' + newTabId,
            userQuery: `远端 VPS (${host.name})`,
            isCommand: false,
            explanation: `已连接远程 VPS [${host.name} - ${host.ip}]。AI 对话已独立绑定该主机环境，生成的所有指令将严格匹配该 VPS 的 Linux 发行版与当前用户权限。`,
          },
        ],
      }))
      setActiveTabId(newTabId)
    } catch (err) {
      alert(`发起 SSH 连接失败: ${err.message}`)
    }
  }

  // 关闭指定 Tab
  const handleCloseTab = (tabId) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        if (next.length > 0) {
          setActiveTabId(next[next.length - 1].id)
        } else {
          setActiveTabId(null)
        }
      }
      return next
    })
    setTabChats((prev) => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    setTerminalErrors((prev) => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }

  // 创建新分组
  const handleCreateGroup = async (name) => {
    const res = await fetch('http://127.0.0.1:8765/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || '创建分组失败')
    }
    await fetchGroups()
  }

  // 重命名分组
  const handleRenameGroup = async (groupId, newName) => {
    const res = await fetch(`http://127.0.0.1:8765/api/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || '重命名分组失败')
    }
    await fetchGroups()
    await fetchHosts()
  }

  // 删除分组
  const handleDeleteGroup = async (groupId) => {
    const res = await fetch(`http://127.0.0.1:8765/api/groups/${groupId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || '删除分组失败')
    }
    await fetchGroups()
    await fetchHosts()
  }

  // 移动主机至指定分组
  const handleMoveHost = async (hostId, targetGroupName) => {
    const res = await fetch(`http://127.0.0.1:8765/api/hosts/${hostId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: targetGroupName }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(`移动分组失败: ${err.detail || '未知错误'}`)
      return
    }
    await fetchHosts()
    await fetchGroups()
  }

  // 保存新增或编辑的主机
  const handleSaveHost = async (formData, hostId = null) => {
    if (hostId) {
      const res = await fetch(`http://127.0.0.1:8765/api/hosts/${hostId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        throw new Error('更新主机配置失败')
      }
    } else {
      const res = await fetch('http://127.0.0.1:8765/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        throw new Error('保存主机失败')
      }
    }
    await fetchHosts()
    await fetchGroups()
  }

  // 删除主机
  const handleDeleteHost = async (hostId) => {
    await fetch(`http://127.0.0.1:8765/api/hosts/${hostId}`, { method: 'DELETE' })
    await fetchHosts()
    await fetchGroups()
  }

  // 向当前激活终端注入命令并执行
  const handleInjectCommand = (cmd, autoExecute = true) => {
    if (injectHandlerRef.current) {
      injectHandlerRef.current(cmd, autoExecute)
    }
  }

  // 读取当前激活终端屏幕缓冲区
  const handleReadScreenBuffer = () => {
    if (bufferReaderRef.current) {
      return bufferReaderRef.current()
    }
    return ''
  }

  // 针对特定运维诊断发起 AI Copilot 分析
  const handleAskAi = async (prompt) => {
    if (!activeTabId) return
    const currentTab = tabs.find((t) => t.id === activeTabId)
    if (!currentTab) return
    setCopilotCollapsed(false)

    const cardId = Date.now().toString()
    const loadingCard = {
      id: cardId,
      userQuery: prompt,
      isCommand: false,
      explanation: '正在由 AI Copilot 深入诊断中，请稍候...',
      analyzing: true,
    }

    setTabChats((prev) => ({
      ...prev,
      [activeTabId]: [loadingCard, ...(prev[activeTabId] || [])],
    }))

    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: prompt,
          session_id: currentTab.sessionId,
          os_info: currentTab.type === 'ssh' ? `远程 VPS Linux (${currentTab.ip || currentTab.host?.ip})` : '本地 macOS',
        }),
      })
      const data = await res.json()
      setTabChats((prev) => {
        const list = prev[activeTabId] || []
        return list.map((c) =>
          c.id === cardId
            ? {
                ...c,
                isCommand: data.is_command,
                command: data.command,
                explanation: data.explanation,
                risk: data.risk,
                analyzing: false,
              }
            : c
        )
      })
    } catch (err) {
      setTabChats((prev) => {
        const list = prev[activeTabId] || []
        return list.map((c) =>
          c.id === cardId
            ? { ...c, explanation: `诊断请求失败: ${err.message}`, analyzing: false }
            : c
        )
      })
    }
  }

  const currentActiveTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-200 ${
        uiMode === 'dark' ? 'dark bg-[#0d1117] text-gray-200' : 'bg-slate-100 text-slate-800'
      }`}
    >
      {/* 1. 左侧主机与资产管理侧边栏 */}
      <HostSidebar
        hosts={hosts}
        groups={groups}
        onOpenLocal={openLocalTab}
        onConnectHost={handleConnectHost}
        onAddHost={() => {
          setEditingHost(null)
          setIsHostModalOpen(true)
        }}
        onEditHost={(host) => {
          setEditingHost(host)
          setIsHostModalOpen(true)
        }}
        onDeleteHost={handleDeleteHost}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
        onMoveHost={handleMoveHost}
        onOpenSnippets={() => setIsSnippetOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenKeyManager={() => setIsKeyManagerOpen(true)}
        uiMode={uiMode}
        onToggleUiMode={toggleUiMode}
      />

      {/* 2. 中间多 Tab 终端视口 */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <TerminalTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onNewLocalTab={openLocalTab}
          onRegisterInjectHandler={(fn) => (injectHandlerRef.current = fn)}
          onRegisterBufferReader={(fn) => (bufferReaderRef.current = fn)}
          onTerminalError={({ tabId, errorSnippet }) => {
            setTerminalErrors((prev) => ({ ...prev, [tabId]: errorSnippet }))
          }}
          onAskAi={handleAskAi}
          hosts={hosts}
          onRefreshHosts={fetchHosts}
          uiMode={uiMode}
          onToggleUiMode={toggleUiMode}
        />
      </main>

      {/* 3. 右侧 AI Copilot 侧边栏 */}
      <AICopilot
        collapsed={copilotCollapsed}
        onToggleCollapse={() => setCopilotCollapsed(!copilotCollapsed)}
        currentTab={currentActiveTab}
        activeTab={currentActiveTab}
        chatCards={activeTabId ? tabChats[activeTabId] || [] : []}
        chatMessages={activeTabId ? tabChats[activeTabId] || [] : []}
        onUpdateChat={(updaterOrCards) => {
          if (!activeTabId) return
          setTabChats((prev) => {
            const currentList = prev[activeTabId] || []
            const nextList =
              typeof updaterOrCards === 'function'
                ? updaterOrCards(currentList)
                : updaterOrCards
            return {
              ...prev,
              [activeTabId]: nextList,
            }
          })
        }}
        onClearChat={() => {
          if (activeTabId) {
            setTabChats((prev) => ({
              ...prev,
              [activeTabId]: [
                {
                  id: 'reset-' + Date.now(),
                  userQuery: '新会话',
                  isCommand: false,
                  explanation: '当前会话对话已重置。AI Copilot 已准备就绪。',
                },
              ],
            }))
          }
        }}
        onResetSession={() => {
          if (activeTabId) {
            setTabChats((prev) => ({
              ...prev,
              [activeTabId]: [
                {
                  id: 'reset-' + Date.now(),
                  userQuery: '新会话',
                  isCommand: false,
                  explanation: '当前会话对话已重置。AI Copilot 已准备就绪。',
                },
              ],
            }))
          }
        }}
        onInjectCommand={handleInjectCommand}
        onReadScreenBuffer={handleReadScreenBuffer}
        autoExecute={autoExecute}
        onToggleAutoExecute={() => {
          setAutoExecute((prev) => {
            const next = !prev
            localStorage.setItem('aiterm_auto_execute', next ? 'true' : 'false')
            return next
          })
        }}
        activeError={activeTabId ? terminalErrors[activeTabId] : null}
        onClearActiveError={() => {
          if (activeTabId) {
            setTerminalErrors((prev) => {
              const next = { ...prev }
              delete next[activeTabId]
              return next
            })
          }
        }}
      />

      {/* 弹窗层 */}
      <HostModal
        isOpen={isHostModalOpen}
        onClose={() => {
          setIsHostModalOpen(false)
          setEditingHost(null)
        }}
        onSave={handleSaveHost}
        editingHost={editingHost}
        groups={groups}
      />

      <SnippetDrawer
        isOpen={isSnippetOpen}
        onClose={() => setIsSnippetOpen(false)}
        onInjectCommand={handleInjectCommand}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <SshKeyManagerModal
        isOpen={isKeyManagerOpen}
        onClose={() => setIsKeyManagerOpen(false)}
        hosts={hosts}
        onRefreshHosts={fetchHosts}
      />
    </div>
  )
}
