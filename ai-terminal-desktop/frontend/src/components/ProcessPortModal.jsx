import React, { useState, useEffect } from 'react'
import {
  X,
  RefreshCw,
  Search,
  Activity,
  Radio,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

export default function ProcessPortModal({
  isOpen,
  onClose,
  activeTab,
  onInjectCommand,
  onAskAi,
}) {
  const [activeSubTab, setActiveSubTab] = useState('ports') // 'ports' | 'processes'
  const [ports, setPorts] = useState([])
  const [processes, setProcesses] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [actionNotice, setActionNotice] = useState(null) // { type: 'success' | 'error', text: '' }
  const [killConfirmTarget, setKillConfirmTarget] = useState(null) // { pid, signal, name }

  // 排序状态
  const [portSort, setPortSort] = useState({ field: 'port', asc: true })
  const [procSort, setProcSort] = useState({ field: 'cpu', asc: false })

  const sessionId = activeTab?.sessionId

  const showNotice = (type, text) => {
    setActionNotice({ type, text })
    setTimeout(() => setActionNotice(null), 3500)
  }

  const handleSortPort = (field) => {
    setPortSort((prev) => ({
      field,
      asc: prev.field === field ? !prev.asc : true,
    }))
  }

  const handleSortProc = (field) => {
    setProcSort((prev) => ({
      field,
      asc: prev.field === field ? !prev.asc : (field === 'cpu' || field === 'mem' ? false : true),
    }))
  }

  const fetchPorts = async () => {
    if (!sessionId) {
      setErrorMsg('当前终端会话未就绪或已断开，请确保终端处于已连接状态')
      return
    }
    try {
      setLoading(true)
      setErrorMsg('')
      const res = await fetch(`http://127.0.0.1:8765/api/system/ports/${sessionId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '获取端口信息失败')
      }
      const data = await res.json()
      setPorts(data.ports || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProcesses = async () => {
    if (!sessionId) {
      setErrorMsg('当前终端会话未就绪或已断开，请确保终端处于已连接状态')
      return
    }
    try {
      setLoading(true)
      setErrorMsg('')
      const res = await fetch(`http://127.0.0.1:8765/api/system/processes/${sessionId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '获取进程信息失败')
      }
      const data = await res.json()
      setProcesses(data.processes || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (activeSubTab === 'ports') {
      fetchPorts()
    } else {
      fetchProcesses()
    }
  }

  useEffect(() => {
    if (isOpen && sessionId) {
      handleRefresh()
    }
  }, [isOpen, activeSubTab, sessionId])

  // 自动刷新
  useEffect(() => {
    if (!isOpen || !autoRefresh || !sessionId) return
    const timer = setInterval(() => {
      handleRefresh()
    }, 5000)
    return () => clearInterval(timer)
  }, [isOpen, autoRefresh, activeSubTab, sessionId])

  // 打开内联杀死进程确认
  const promptKillProcess = (pid, signal = 'TERM', name = '') => {
    setKillConfirmTarget({ pid, signal, name })
  }

  // 执行杀死进程
  const executeKill = async (pid, signal = 'TERM') => {
    setKillConfirmTarget(null)
    try {
      const res = await fetch('http://127.0.0.1:8765/api/system/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          pid: Number(pid),
          signal: signal,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '终止进程失败')
      }
      showNotice('success', `已成功向 PID: ${pid} 发送 SIG${signal} 信号`)
      handleRefresh()
    } catch (err) {
      showNotice('error', `终止进程失败: ${err.message}`)
    }
  }

  // 问 AI 智能诊断
  const handleDiagnose = (item, type) => {
    let prompt = ''
    if (type === 'port') {
      prompt = `请帮我分析当前服务器上监听的端口 ${item.port} (协议: ${item.proto}, 进程: ${item.program || '未知'}, PID: ${item.pid || '未知'})。这个端口一般对应什么服务，是否有安全暴露风险，我应该如何维护或关闭它？`
    } else {
      prompt = `请帮我诊断服务器进程 PID: ${item.pid}，运行用户: ${item.user}，CPU占用: ${item.cpu}%，内存占用: ${item.mem}%，执行命令: "${item.command}"。这个进程属于系统服务还是第三方应用？是否有异常高耗能或挖矿木马风险？`
    }
    if (onAskAi) {
      onAskAi(prompt)
      onClose()
    }
  }

  if (!isOpen) return null

  const filteredPorts = ports.filter((p) => {
    const q = filterText.toLowerCase()
    return (
      (p.port && p.port.toString().includes(q)) ||
      (p.proto && p.proto.toLowerCase().includes(q)) ||
      (p.program && p.program.toLowerCase().includes(q)) ||
      (p.local_address && p.local_address.toLowerCase().includes(q)) ||
      (p.pid && p.pid.toString().includes(q))
    )
  })

  const sortedPorts = [...filteredPorts].sort((a, b) => {
    const { field, asc } = portSort
    let valA = a[field]
    let valB = b[field]
    if (field === 'port' || field === 'pid') {
      valA = Number(valA) || 0
      valB = Number(valB) || 0
      return asc ? valA - valB : valB - valA
    }
    valA = (valA || '').toString().toLowerCase()
    valB = (valB || '').toString().toLowerCase()
    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA)
  })

  const filteredProcesses = processes.filter((p) => {
    const q = filterText.toLowerCase()
    return (
      (p.pid && p.pid.toString().includes(q)) ||
      (p.user && p.user.toLowerCase().includes(q)) ||
      (p.command && p.command.toLowerCase().includes(q))
    )
  })

  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    const { field, asc } = procSort
    let valA = a[field]
    let valB = b[field]
    if (field === 'cpu' || field === 'mem') {
      valA = parseFloat(valA) || 0
      valB = parseFloat(valB) || 0
      return asc ? valA - valB : valB - valA
    }
    if (field === 'pid') {
      valA = parseInt(valA, 10) || 0
      valB = parseInt(valB, 10) || 0
      return asc ? valA - valB : valB - valA
    }
    valA = (valA || '').toString().toLowerCase()
    valB = (valB || '').toString().toLowerCase()
    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-5xl h-[85vh] bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50 dark:bg-[#0f1319] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-700/50 rounded-lg text-cyan-600 dark:text-cyan-400">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>端口与系统进程管理器</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 font-mono">
                  {activeTab?.title || '未连接'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                实时检测服务器监听端口、高负载进程，支持一键信号终止与 AI 智能安全诊断
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* 自动刷新开关 */}
            <label className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-slate-100 dark:bg-[#21262d] border-slate-300 dark:border-[#30363d] text-cyan-500 focus:ring-0"
              />
              <span>每 5s 自动刷新</span>
            </label>

            {/* 手动刷新 */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-600 dark:text-gray-300 rounded-lg transition disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-cyan-500' : ''} />
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

        {/* 导航 Tab 与搜索栏 */}
        <div className="h-12 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50/80 dark:bg-[#12161f] shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setActiveSubTab('ports')
                setFilterText('')
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'ports'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-[#21262d]'
              }`}
            >
              <Radio size={14} />
              <span>监听端口 ({ports.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveSubTab('processes')
                setFilterText('')
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'processes'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-[#21262d]'
              }`}
            >
              <Activity size={14} />
              <span>系统进程 Top ({processes.length})</span>
            </button>
          </div>

          {/* 快速检索框 */}
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={activeSubTab === 'ports' ? '过滤端口/协议/进程/PID...' : '过滤 PID/用户/进程命令...'}
              className="w-full bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-[#30363d] rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-cyan-500 shadow-2xs"
            />
          </div>
        </div>

        {/* 内容展示区 */}
        <div className="flex-1 overflow-auto p-4 bg-slate-100/60 dark:bg-[#0d1117]">
          {actionNotice && (
            <div
              className={`mb-3 p-3 rounded-lg border text-xs flex items-center space-x-2 animate-in fade-in ${
                actionNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              }`}
            >
              {actionNotice.type === 'success' ? (
                <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle size={15} className="shrink-0 text-rose-500" />
              )}
              <span>{actionNotice.text}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-3 p-3 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle size={15} className="shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeSubTab === 'ports' ? (
            /* 端口列表表格 (支持字段点击排序) */
            <div className="border border-slate-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#161b22] shadow-xs">
              <table className="w-full text-left text-xs text-slate-700 dark:text-gray-300">
                <thead className="bg-slate-100 dark:bg-[#21262d] text-slate-600 dark:text-gray-400 uppercase text-[11px] font-semibold border-b border-slate-200 dark:border-[#30363d] select-none">
                  <tr>
                    <th
                      onClick={() => handleSortPort('proto')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>协议</span>
                        {portSort.field === 'proto' ? (
                          portSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortPort('port')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>端口</span>
                        {portSort.field === 'port' ? (
                          portSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortPort('local_address')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>绑定地址</span>
                        {portSort.field === 'local_address' ? (
                          portSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortPort('state')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>状态</span>
                        {portSort.field === 'state' ? (
                          portSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortPort('program')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>对应程序 / PID</span>
                        {portSort.field === 'program' ? (
                          portSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#30363d]/60 font-mono">
                  {sortedPorts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-gray-500 font-sans">
                        {loading ? '正在扫描系统端口...' : '未检索到匹配的监听端口'}
                      </td>
                    </tr>
                  ) : (
                    sortedPorts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#21262d]/50 transition">
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                              item.proto?.toLowerCase().includes('tcp')
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                                : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                            }`}
                          >
                            {item.proto || 'TCP'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                          {item.port}
                        </td>
                        <td className="py-2 px-3 text-slate-500 dark:text-gray-400 text-[11px]">
                          {item.local_address || item.listen_addr || '*'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                            <span>{item.state || 'LISTEN'}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-gray-300 font-sans text-xs">
                          {item.program ? (
                            <span className="font-semibold text-slate-900 dark:text-white">{item.program}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-gray-500 italic">未知进程</span>
                          )}
                          {item.pid && (
                            <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-gray-400">
                              (PID: {item.pid})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right space-x-2 font-sans">
                          <button
                            onClick={() => handleDiagnose(item, 'port')}
                            className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/70 dark:hover:bg-cyan-900 dark:text-cyan-300 dark:border-cyan-700/50 rounded-lg text-[11px] inline-flex items-center space-x-1 transition shadow-2xs"
                            title="向 AI Copilot 咨询此端口服务的安全性与用途"
                          >
                            <Sparkles size={11} />
                            <span>问 AI</span>
                          </button>
                          {item.pid && (
                            <button
                              onClick={() => promptKillProcess(item.pid, 'TERM', item.program)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-red-950/60 dark:hover:bg-red-900 dark:text-red-300 dark:border-red-800 rounded-lg text-[11px] inline-flex items-center space-x-1 transition shadow-2xs"
                              title="终止该进程"
                            >
                              <Trash2 size={11} />
                              <span>终止</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* 系统进程列表表格 (支持字段点击排序) */
            <div className="border border-slate-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#161b22] shadow-xs">
              <table className="w-full text-left text-xs text-slate-700 dark:text-gray-300">
                <thead className="bg-slate-100 dark:bg-[#21262d] text-slate-600 dark:text-gray-400 uppercase text-[11px] font-semibold border-b border-slate-200 dark:border-[#30363d] select-none">
                  <tr>
                    <th
                      onClick={() => handleSortProc('pid')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>PID</span>
                        {procSort.field === 'pid' ? (
                          procSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortProc('user')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>运行用户</span>
                        {procSort.field === 'user' ? (
                          procSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortProc('cpu')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>% CPU</span>
                        {procSort.field === 'cpu' ? (
                          procSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortProc('mem')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>% 内存</span>
                        {procSort.field === 'mem' ? (
                          procSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortProc('command')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-[#30363d] transition group"
                    >
                      <div className="flex items-center space-x-1">
                        <span>命令行 (Command)</span>
                        {procSort.field === 'command' ? (
                          procSort.asc ? <ArrowUp size={11} className="text-cyan-500" /> : <ArrowDown size={11} className="text-cyan-500" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#30363d]/60 font-mono">
                  {sortedProcesses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-gray-500 font-sans">
                        {loading ? '正在获取进程列表...' : '未找到符合条件的进程'}
                      </td>
                    </tr>
                  ) : (
                    sortedProcesses.map((proc, idx) => {
                      const cpuVal = parseFloat(proc.cpu) || 0
                      const memVal = parseFloat(proc.mem) || 0
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#21262d]/50 transition">
                          <td className="py-2 px-3 font-bold text-slate-900 dark:text-gray-200">{proc.pid}</td>
                          <td className="py-2 px-3 text-slate-500 dark:text-gray-400">{proc.user}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`font-semibold ${
                                cpuVal > 50
                                  ? 'text-red-500 font-bold'
                                  : cpuVal > 20
                                  ? 'text-amber-500'
                                  : 'text-slate-700 dark:text-gray-300'
                              }`}
                            >
                              {proc.cpu}%
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`font-semibold ${
                                memVal > 30
                                  ? 'text-red-500 font-bold'
                                  : memVal > 15
                                  ? 'text-amber-500'
                                  : 'text-slate-700 dark:text-gray-300'
                              }`}
                            >
                              {proc.mem}%
                            </span>
                          </td>
                          <td className="py-2 px-3 max-w-md truncate text-slate-700 dark:text-gray-300 font-mono text-[11px]" title={proc.command}>
                            {proc.command}
                          </td>
                          <td className="py-2 px-3 text-right space-x-1.5 font-sans">
                            <button
                              onClick={() => handleDiagnose(proc, 'process')}
                              className="px-2 py-1 bg-cyan-50 dark:bg-cyan-950/70 hover:bg-cyan-100 dark:hover:bg-cyan-900 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700/50 rounded text-[11px] inline-flex items-center space-x-1 transition shadow-xs"
                              title="向 AI Copilot 咨询此进程诊断"
                            >
                              <Sparkles size={11} />
                              <span>问 AI</span>
                            </button>
                            <button
                              onClick={() => promptKillProcess(proc.pid, 'TERM', proc.command)}
                              className="px-2 py-1 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 dark:bg-[#21262d] dark:hover:bg-red-950/60 dark:hover:text-red-300 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-transparent rounded text-[11px] transition"
                              title="SIGTERM 优雅终止"
                            >
                              终止
                            </button>
                            <button
                              onClick={() => promptKillProcess(proc.pid, 'KILL', proc.command)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-red-950/70 dark:hover:bg-red-900 text-rose-700 dark:text-red-300 border border-rose-200 dark:border-red-800 rounded text-[11px] inline-flex items-center space-x-1 transition font-bold"
                              title="SIGKILL 强制杀死"
                            >
                              <Zap size={10} />
                              <span>强杀</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 底部状态提示 */}
        <div className="h-10 border-t border-slate-200 dark:border-[#30363d] px-5 bg-slate-50 dark:bg-[#0f1319] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 dark:text-gray-500">提示：</span>
            <span>支持点击表头字段快速排序。终止系统进程可能中断相关服务，请谨慎操作。</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-200 rounded-lg text-xs transition font-medium"
          >
            关闭
          </button>
        </div>

        {/* 内联杀死进程确认弹窗 (告别原生 confirm) */}
        {killConfirmTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
            <div className="w-full max-w-md bg-white dark:bg-[#1c2128] border border-slate-300 dark:border-[#30363d] rounded-xl shadow-2xl p-5 text-slate-800 dark:text-gray-100 space-y-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    确认发送 SIG{killConfirmTarget.signal} 终止进程？
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    即将向目标进程 PID: <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{killConfirmTarget.pid}</span> 发送信号。
                  </p>
                  {killConfirmTarget.name && (
                    <div className="mt-2 p-2 bg-slate-100 dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all max-h-24 overflow-y-auto">
                      {killConfirmTarget.name}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-[#30363d]">
                <button
                  onClick={() => setKillConfirmTarget(null)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 transition"
                >
                  取消
                </button>
                <button
                  onClick={() => executeKill(killConfirmTarget.pid, killConfirmTarget.signal)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold transition"
                >
                  确认终止 (SIG{killConfirmTarget.signal})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
