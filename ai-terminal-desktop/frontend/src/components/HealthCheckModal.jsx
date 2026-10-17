import React, { useState, useEffect } from 'react'
import {
  X,
  RefreshCw,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Zap,
  HardDrive,
  Cpu,
  Lock,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react'

export default function HealthCheckModal({
  isOpen,
  onClose,
  activeTab,
  onInjectCommand,
}) {
  const [loading, setLoading] = useState(false)
  const [healthData, setHealthData] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [copiedCmd, setCopiedCmd] = useState(null)

  const sessionId = activeTab?.sessionId

  const runHealthCheck = async () => {
    if (!sessionId) {
      setErrorMsg('当前终端会话未就绪或已断开，请确保终端处于已连接状态')
      return
    }
    try {
      setLoading(true)
      setErrorMsg('')
      const res = await fetch(`http://127.0.0.1:8765/api/system/health-check/${sessionId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '执行服务器智能体检失败')
      }
      const data = await res.json()
      setHealthData(data)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && sessionId) {
      if (!healthData) {
        runHealthCheck()
      }
    }
  }, [isOpen, sessionId])

  const handleExecuteFix = (cmd) => {
    if (!cmd || !onInjectCommand) return
    onInjectCommand(cmd)
    onClose()
  }

  const handleCopyCmd = (cmd, id) => {
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(id)
    setTimeout(() => setCopiedCmd(null), 2000)
  }

  if (!isOpen) return null

  const score = healthData?.score ?? 100
  const getScoreColor = (s) => {
    if (s >= 85) return 'text-emerald-600 dark:text-emerald-400 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
    if (s >= 65) return 'text-amber-600 dark:text-yellow-400 border-amber-500 bg-amber-50 dark:bg-yellow-950/40'
    return 'text-rose-600 dark:text-red-400 border-rose-500 bg-rose-50 dark:bg-red-950/40'
  }

  const getScoreLabel = (s) => {
    if (s >= 85) return '系统状态优秀'
    if (s >= 65) return '存在优化项'
    return '存在风险需处理'
  }

  const items = healthData?.items || []
  const dangerItems = items.filter((i) => i.status === 'danger')
  const warnItems = items.filter((i) => i.status === 'warn')
  const okItems = items.filter((i) => i.status === 'ok')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50 dark:bg-[#0f1319] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/50 rounded-lg text-emerald-600 dark:text-emerald-400">
              <HeartPulse size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>服务器 AI 智能体检报告</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-mono">
                  {activeTab?.title || '未连接'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                综合评估磁盘空间、SSH 防暴破安全、僵尸进程与垃圾大文件，生成 AI 深度体检与一键修复脚本
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={runHealthCheck}
              disabled={loading}
              className="px-3 py-1.5 bg-white dark:bg-[#21262d] hover:bg-slate-100 dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-200 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border border-slate-200 dark:border-transparent shadow-2xs disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''} />
              <span>{loading ? '正在诊断...' : '重新体检'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 报告内容滚动区 */}
        <div className="flex-1 overflow-auto p-5 space-y-5 bg-slate-50/60 dark:bg-[#0d1117]">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-red-950/40 border border-rose-200 dark:border-red-800 text-rose-700 dark:text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle size={15} className="shrink-0 text-rose-500 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading && !healthData ? (
            <div className="h-72 flex flex-col items-center justify-center space-y-3">
              <HeartPulse size={48} className="text-emerald-500 dark:text-emerald-400 animate-pulse" />
              <p className="text-sm text-slate-700 dark:text-gray-300 font-medium">AI 正在全面扫描服务器各项核心指标...</p>
              <p className="text-xs text-slate-400 dark:text-gray-500">正在分析 df -h 存储、auth.log 暴力破解、top 进程与日志膨胀</p>
            </div>
          ) : (
            healthData && (
              <>
                {/* 评分与核心总结横幅 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] shadow-2xs items-center">
                  {/* 分数大仪表盘 */}
                  <div className="flex flex-col items-center justify-center p-3 text-center border-b md:border-b-0 md:border-r border-slate-200 dark:border-[#30363d]">
                    <div
                      className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center font-bold font-mono transition-all duration-500 ${getScoreColor(
                        score
                      )}`}
                    >
                      <span className="text-2xl leading-none">{score}</span>
                      <span className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">分 / 100</span>
                    </div>
                    <span className="mt-2 text-xs font-semibold text-slate-800 dark:text-gray-200">
                      {getScoreLabel(score)}
                    </span>
                  </div>

                  {/* 总结描述与一键全量修复 */}
                  <div className="md:col-span-3 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                      <ShieldCheck size={14} />
                      <span>AI 综合诊断结论</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed font-sans">
                      {healthData.summary || '各项指标检查完毕，请参考下方细则。'}
                    </p>

                    {healthData.fix_command && (
                      <div className="pt-2 flex items-center space-x-2">
                        <button
                          onClick={() => handleExecuteFix(healthData.fix_command)}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-medium shadow-2xs flex items-center space-x-1.5 transition"
                          title="在终端中一键自动执行综合优化指令"
                        >
                          <Zap size={13} />
                          <span>一键执行综合优化</span>
                        </button>
                        <button
                          onClick={() => handleCopyCmd(healthData.fix_command, 'all')}
                          className="p-1.5 bg-slate-100 dark:bg-[#21262d] hover:bg-slate-200 dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded-lg text-xs transition border border-slate-200 dark:border-transparent"
                          title="复制优化命令"
                        >
                          {copiedCmd === 'all' ? (
                            <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 细分项目列表 */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>检查项目与加固建议 ({items.length})</span>
                    <span className="text-[11px] font-normal lowercase space-x-3">
                      <span className="text-rose-600 dark:text-red-400 font-medium">危险: {dangerItems.length}</span>
                      <span className="text-amber-600 dark:text-yellow-400 font-medium">警告: {warnItems.length}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">正常: {okItems.length}</span>
                    </span>
                  </h4>

                  <div className="space-y-2.5">
                    {items.map((item, idx) => {
                      const isDanger = item.status === 'danger'
                      const isWarn = item.status === 'warn'

                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-lg border transition shadow-2xs ${
                            isDanger
                              ? 'border-rose-200 dark:border-red-800/80 bg-rose-50/80 dark:bg-red-950/20'
                              : isWarn
                              ? 'border-amber-200 dark:border-yellow-800/80 bg-amber-50/80 dark:bg-yellow-950/20'
                              : 'border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#161b22]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2.5">
                              {isDanger ? (
                                <ShieldAlert size={16} className="text-rose-500 dark:text-red-400 shrink-0 mt-0.5" />
                              ) : isWarn ? (
                                <AlertTriangle size={16} className="text-amber-500 dark:text-yellow-400 shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                              )}

                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono bg-slate-100 dark:bg-[#21262d] px-1.5 py-0.2 rounded border border-slate-200 dark:border-transparent">
                                    {item.category}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed font-sans">
                                  {item.detail}
                                </p>

                                {item.fix_command && (
                                  <div className="mt-2 p-2 bg-slate-900 text-cyan-300 rounded border border-slate-700/50 font-mono text-[11px] flex items-center justify-between">
                                    <span className="truncate mr-2">$ {item.fix_command}</span>
                                    <div className="flex items-center space-x-1 shrink-0">
                                      <button
                                        onClick={() => handleCopyCmd(item.fix_command, idx)}
                                        className="p-1 hover:text-white transition"
                                        title="复制修复命令"
                                      >
                                        {copiedCmd === idx ? (
                                          <Check size={12} className="text-emerald-400" />
                                        ) : (
                                          <Copy size={12} />
                                        )}
                                      </button>
                                      <button
                                        onClick={() => handleExecuteFix(item.fix_command)}
                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-sans flex items-center space-x-1 transition shadow-2xs"
                                        title="立即在终端执行修复"
                                      >
                                        <Terminal size={10} />
                                        <span>终端执行</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          )}
        </div>

        {/* 底部按钮 */}
        <div className="h-10 border-t border-slate-200 dark:border-[#30363d] px-5 bg-slate-50 dark:bg-[#0f1319] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 shrink-0">
          <span>AI 体检建议仅供系统管理参考，重要配置变更前请确保备份数据。</span>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-slate-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-200 rounded-lg text-xs font-medium transition border border-slate-200 dark:border-transparent shadow-2xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
