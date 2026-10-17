import React, { useState, useEffect } from 'react'
import {
  X,
  RefreshCw,
  Search,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Terminal,
  AlertCircle,
  Box,
  Copy,
  Check,
} from 'lucide-react'

export default function DockerModal({
  isOpen,
  onClose,
  activeTab,
  onInjectCommand,
}) {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [dockerInstalled, setDockerInstalled] = useState(true)

  // 日志查看器状态
  const [activeLogContainer, setActiveLogContainer] = useState(null)
  const [logsContent, setLogsContent] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logTail, setLogTail] = useState(100)
  const [copiedLog, setCopiedLog] = useState(false)

  const sessionId = activeTab?.sessionId

  const fetchContainers = async () => {
    if (!sessionId) {
      setErrorMsg('当前终端会话未就绪或已断开，请确保终端处于已连接状态')
      return
    }
    try {
      setLoading(true)
      setErrorMsg('')
      const res = await fetch(`http://127.0.0.1:8765/api/docker/containers/${sessionId}`)
      if (!res.ok) {
        const err = await res.json()
        if (err.detail && (err.detail.includes('command not found') || err.detail.includes('not found') || err.detail.includes('Is the docker daemon running'))) {
          setDockerInstalled(false)
        }
        throw new Error(err.detail || '获取 Docker 容器列表失败')
      }
      const data = await res.json()
      setDockerInstalled(true)
      setContainers(data.containers || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchContainers()
      setActiveLogContainer(null)
      setLogsContent('')
    }
  }, [isOpen, sessionId])

  // 执行容器动作 (start, stop, restart, remove)
  const handleContainerAction = async (containerId, action, containerName = '') => {
    const actionNames = {
      start: '启动',
      stop: '停止',
      restart: '重启',
      remove: '删除',
    }
    const label = actionNames[action] || action
    if (action === 'remove') {
      if (!confirm(`确定要彻底删除容器 "${containerName || containerId}" 吗？此操作不可逆！`)) {
        return
      }
    }
    try {
      setLoading(true)
      const res = await fetch('http://127.0.0.1:8765/api/docker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          container_id: containerId,
          action: action,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || `${label}容器失败`)
      }
      await fetchContainers()
    } catch (err) {
      alert(`操作失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 加载容器日志
  const handleViewLogs = async (container, tail = logTail) => {
    setActiveLogContainer(container)
    setLogsLoading(true)
    setLogsContent('')
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/docker/logs/${sessionId}/${container.id}?tail=${tail}`
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '获取容器日志失败')
      }
      const data = await res.json()
      setLogsContent(data.logs || '(无标准输出日志)')
    } catch (err) {
      setLogsContent(`获取日志错误: ${err.message}`)
    } finally {
      setLogsLoading(false)
    }
  }

  // 复制日志
  const handleCopyLogs = () => {
    if (!logsContent) return
    navigator.clipboard.writeText(logsContent)
    setCopiedLog(true)
    setTimeout(() => setCopiedLog(false), 2000)
  }

  // 进入容器 Shell 终端
  const handleExecTerminal = (container) => {
    if (onInjectCommand) {
      onInjectCommand(`docker exec -it ${container.id} /bin/sh -c "[ -e /bin/bash ] && exec /bin/bash || exec /bin/sh"`)
      onClose()
    }
  }

  // 一键在终端安装 Docker
  const handleInstallDocker = () => {
    if (onInjectCommand) {
      onInjectCommand('curl -fsSL https://get.docker.com | bash')
      onClose()
    }
  }

  if (!isOpen) return null

  const filteredContainers = containers.filter((c) => {
    const q = filterText.toLowerCase()
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.image && c.image.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q)) ||
      (c.ports && c.ports.toLowerCase().includes(q)) ||
      (c.status && c.status.toLowerCase().includes(q))
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-5xl h-[85vh] bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50 dark:bg-[#0f1319] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-700/50 rounded-lg text-blue-600 dark:text-blue-400">
              <Box size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>轻量 Docker 容器可视化管理器</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 font-mono">
                  {activeTab?.title || '未连接'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                支持容器运行状态监控、启动/停止/重启/删除、实时日志追踪与一键终端 Exec
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* 刷新 */}
            <button
              onClick={fetchContainers}
              disabled={loading}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-600 dark:text-gray-300 rounded-lg transition disabled:opacity-50"
              title="刷新容器列表"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-blue-500' : ''} />
            </button>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 检索过滤与快捷统计 */}
        <div className="h-12 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50/80 dark:bg-[#12161f] shrink-0">
          <div className="flex items-center space-x-3 text-xs text-slate-600 dark:text-gray-300">
            <span>
              总容器数: <strong className="text-slate-900 dark:text-white font-mono">{containers.length}</strong>
            </span>
            <span>•</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              运行中:{' '}
              <strong className="font-mono">
                {containers.filter((c) => c.status?.toLowerCase().includes('up')).length}
              </strong>
            </span>
            <span>•</span>
            <span className="text-slate-500 dark:text-gray-400">
              已停止:{' '}
              <strong className="font-mono">
                {containers.filter((c) => !c.status?.toLowerCase().includes('up')).length}
              </strong>
            </span>
          </div>

          {/* 快速过滤 */}
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="过滤容器名称/镜像/端口..."
              className="w-full bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-[#30363d] rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>
        </div>

        {/* 主视口 (分左右或上下：左边列表，右边/下边日志) */}
        <div className="flex-1 flex overflow-hidden">
          {/* 容器列表区 */}
          <div
            className={`flex-1 overflow-auto p-4 bg-slate-100/60 dark:bg-[#0d1117] ${
              activeLogContainer ? 'w-1/2 border-r border-slate-200 dark:border-[#30363d]' : 'w-full'
            }`}
          >
            {errorMsg && (
              <div className="mb-4 p-3.5 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs space-y-2">
                <div className="flex items-center space-x-2">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
                {!dockerInstalled && (
                  <div className="pt-2 border-t border-red-800/60 flex items-center justify-between">
                    <span className="text-gray-300">检测到当前服务器尚未安装 Docker 环境或 Docker 守护进程未启动。</span>
                    <button
                      onClick={handleInstallDocker}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-xs transition"
                    >
                      一键在终端安装 Docker
                    </button>
                  </div>
                )}
              </div>
            )}

            {filteredContainers.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                <Box size={40} className="mb-3 opacity-20 text-blue-400" />
                <p className="text-sm">
                  {loading ? '正在检测 Docker 容器...' : '暂无运行或停止的 Docker 容器'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  您可以在终端通过 docker run 启动新容器，或使用 docker ps 检查
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContainers.map((container) => {
                  const isRunning = container.status?.toLowerCase().includes('up')
                  const isSelectedForLog = activeLogContainer?.id === container.id

                  return (
                    <div
                      key={container.id}
                      className={`p-3.5 rounded-xl border transition shadow-2xs ${
                        isSelectedForLog
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:border-slate-300 dark:hover:border-[#484f58]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-gray-500'
                            }`}
                          />
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                                {container.name || container.names || 'unnamed'}
                              </h3>
                              <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-[#21262d] px-1.5 py-0.5 rounded border border-slate-200 dark:border-transparent">
                                {container.id?.slice(0, 12)}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  isRunning
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {container.status || container.state}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-1">
                              镜像: <span className="text-blue-600 dark:text-cyan-300 font-medium">{container.image}</span>
                            </p>
                          </div>
                        </div>

                        {/* 容器快捷控制按钮 */}
                        <div className="flex items-center space-x-1.5">
                          {isRunning ? (
                            <button
                              onClick={() => handleContainerAction(container.id, 'stop', container.name)}
                              className="p-1.5 bg-slate-100 hover:bg-amber-100 hover:text-amber-800 dark:bg-[#21262d] dark:hover:bg-yellow-950/80 dark:hover:text-yellow-300 text-slate-600 dark:text-gray-300 rounded-lg text-xs transition border border-slate-200 dark:border-transparent hover:border-amber-300 dark:hover:border-yellow-700"
                              title="停止容器 (Stop)"
                            >
                              <Square size={13} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleContainerAction(container.id, 'start', container.name)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 dark:text-emerald-300 rounded-lg text-xs transition border border-emerald-300 dark:border-emerald-700/60"
                              title="启动容器 (Start)"
                            >
                              <Play size={13} />
                            </button>
                          )}

                          <button
                            onClick={() => handleContainerAction(container.id, 'restart', container.name)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-600 dark:text-gray-300 rounded-lg text-xs transition border border-slate-200 dark:border-transparent"
                            title="重启容器 (Restart)"
                          >
                            <RotateCcw size={13} />
                          </button>

                          <button
                            onClick={() => handleViewLogs(container)}
                            className={`p-1.5 rounded-lg text-xs transition border ${
                              isSelectedForLog
                                ? 'bg-blue-600 text-white border-blue-500 shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-600 dark:text-gray-300 border-slate-200 dark:border-transparent'
                            }`}
                            title="查看容器日志"
                          >
                            <FileText size={13} />
                          </button>

                          {isRunning && (
                            <button
                              onClick={() => handleExecTerminal(container)}
                              className="p-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 dark:text-cyan-300 rounded-lg text-xs transition border border-cyan-300 dark:border-cyan-700/50"
                              title="在终端中 Exec 交互式 Shell"
                            >
                              <Terminal size={13} />
                            </button>
                          )}

                          <button
                            onClick={() => handleContainerAction(container.id, 'remove', container.name)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-red-950/50 dark:hover:bg-red-900 dark:text-red-300 rounded-lg text-xs transition border border-rose-200 dark:border-red-800/60"
                            title="删除容器"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* 端口映射与创建信息 */}
                      {container.ports && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#30363d]/60 text-[11px] text-slate-500 dark:text-gray-400 flex items-center space-x-2 font-mono">
                          <span className="font-sans text-slate-400 dark:text-gray-500">端口:</span>
                          <span className="text-blue-600 dark:text-yellow-300/90 truncate font-semibold">{container.ports}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 容器日志实时查看抽屉 (当选中容器时展示) */}
          {activeLogContainer && (
            <div className="w-1/2 flex flex-col bg-[#0b0e14] border-l border-slate-200 dark:border-[#30363d] overflow-hidden">
              <div className="h-10 border-b border-slate-200 dark:border-[#30363d] px-4 flex items-center justify-between bg-slate-50 dark:bg-[#161b22] text-xs shrink-0">
                <div className="flex items-center space-x-2 truncate">
                  <FileText size={14} className="text-blue-500 dark:text-blue-400 shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-white truncate">
                    日志: {activeLogContainer.name}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">
                    ({activeLogContainer.id?.slice(0, 8)})
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={logTail}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setLogTail(val)
                      handleViewLogs(activeLogContainer, val)
                    }}
                    className="bg-white dark:bg-[#21262d] border border-slate-300 dark:border-[#30363d] text-slate-700 dark:text-gray-300 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
                  >
                    <option value={50}>后 50 行</option>
                    <option value={100}>后 100 行</option>
                    <option value={300}>后 300 行</option>
                    <option value={1000}>后 1000 行</option>
                  </select>

                  <button
                    onClick={() => handleViewLogs(activeLogContainer, logTail)}
                    disabled={logsLoading}
                    className="p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition"
                    title="重新拉取最新日志"
                  >
                    <RefreshCw size={13} className={logsLoading ? 'animate-spin text-blue-500 dark:text-blue-400' : ''} />
                  </button>

                  <button
                    onClick={handleCopyLogs}
                    className="p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition"
                    title="复制全部日志文本"
                  >
                    {copiedLog ? <Check size={13} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={13} />}
                  </button>

                  <button
                    onClick={() => setActiveLogContainer(null)}
                    className="p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition"
                    title="关闭日志栏"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 日志内容滚动区 */}
              <div className="flex-1 p-3 overflow-auto font-mono text-[11px] leading-relaxed text-gray-200 select-text bg-[#0b0e14]">
                {logsLoading ? (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    <RefreshCw size={18} className="animate-spin text-blue-400 mr-2" />
                    <span>正在读取标准输出与错误日志...</span>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all">{logsContent}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部关闭栏 */}
        <div className="h-10 border-t border-slate-200 dark:border-[#30363d] px-5 bg-slate-50 dark:bg-[#0f1319] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 dark:text-gray-500">说明：</span>
            <span>点击终端 Exec 图标可立即在当前终端中打开容器内部交互 Shell。</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-slate-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-200 rounded-lg text-xs font-medium transition border border-slate-200 dark:border-transparent shadow-2xs"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
