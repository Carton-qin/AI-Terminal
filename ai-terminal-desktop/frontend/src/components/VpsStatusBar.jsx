import React, { useEffect, useState } from 'react'
import {
  Cpu,
  HardDrive,
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Gauge,
  ChevronDown,
  ChevronUp,
  Layers,
  Radio,
  Server,
  X,
} from 'lucide-react'

// 颜色工具函数：根据百分比返回主题色（兼顾浅色模式与深色模式的高清晰对比度）
const getPercentColor = (percent) => {
  if (percent >= 85) return 'text-rose-600 dark:text-red-400 bg-rose-500 dark:bg-red-500'
  if (percent >= 60) return 'text-amber-600 dark:text-amber-400 bg-amber-500 dark:bg-amber-500'
  return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500 dark:bg-emerald-500'
}

export default function VpsStatusBar({ activeTab, visible = true, onClose, onExpandChange }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false) // 紧凑模式 vs 详细仪表盘展开模式

  useEffect(() => {
    if (!activeTab?.sessionId || !visible) {
      setMetrics(null)
      return
    }

    let isMounted = true

    const fetchMetrics = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/metrics`)
        if (res.ok && isMounted) {
          const data = await res.json()
          setMetrics(data)
          setLoading(false)
        }
      } catch (err) {
        // 后端或会话暂未就绪时不打扰
      }
    }

    // 立即拉取一次
    fetchMetrics()

    // 随后每 2.5 秒定时刷新一次（与 FinalShell 刷新周期一致）
    const timer = setInterval(fetchMetrics, 2500)

    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [activeTab?.sessionId, visible])

  if (!visible || !activeTab) return null

  // 默认占位数据
  const cpuPercent = metrics?.cpu?.percent ?? 0
  const cpuCores = metrics?.cpu?.cores ?? 1
  const memPercent = metrics?.memory?.percent ?? 0
  const memUsed = metrics?.memory?.used_str ?? '--'
  const memTotal = metrics?.memory?.total_str ?? '--'
  const swapPercent = metrics?.swap?.percent ?? 0
  const swapUsed = metrics?.swap?.used_str ?? '--'
  const swapTotal = metrics?.swap?.total_str ?? '--'
  const diskPercent = metrics?.disk?.percent ?? 0
  const diskUsed = metrics?.disk?.used_str ?? '--'
  const diskTotal = metrics?.disk?.total_str ?? '--'
  const rxStr = metrics?.network?.rx_str ?? '--'
  const txStr = metrics?.network?.tx_str ?? '--'
  const load1 = metrics?.load?.load_1 ?? 0
  const load5 = metrics?.load?.load_5 ?? 0
  const load15 = metrics?.load?.load_15 ?? 0
  const uptimeStr = metrics?.uptime?.str ?? '读取中...'

  const cpuColorClass = getPercentColor(cpuPercent)
  const memColorClass = getPercentColor(memPercent)
  const diskColorClass = getPercentColor(diskPercent)

  return (
    <div className="bg-slate-50/95 dark:bg-[#12161f]/95 border-b border-slate-200/80 dark:border-[#30363d]/80 text-xs select-none backdrop-blur-md transition-colors shrink-0 text-slate-700 dark:text-gray-300">
      {/* 1. 精致胶囊式紧凑状态栏 (自适应折行，杜绝横向滚动条) */}
      <div className="min-h-[34px] px-3 py-1 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 text-[11px]">
        {/* 左侧：主机标识 */}
        <div className="flex items-center space-x-1.5 shrink-0 pr-2 border-r border-slate-200 dark:border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-slate-800 dark:text-gray-200 text-xs">
            {activeTab.type === 'ssh' ? 'VPS 监控' : '系统监控'}
          </span>
        </div>

        {/* 中间指标条目 (自适应换行，无横向滚动条) */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {/* CPU */}
          <div
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 shadow-2xs"
            title={`CPU 实时使用率: ${cpuPercent}% (${cpuCores} 核心)`}
          >
            <Cpu size={12} className={cpuColorClass.split(' ')[0]} />
            <span className="text-slate-500 dark:text-gray-400 font-medium text-[10px]">CPU</span>
            <div className="w-10 h-1.5 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${cpuColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              ></div>
            </div>
            <span className={`font-mono font-bold text-[11px] ${cpuColorClass.split(' ')[0]}`}>
              {cpuPercent}%
            </span>
          </div>

          {/* 内存 */}
          <div
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 shadow-2xs"
            title={`物理内存: ${memUsed} / ${memTotal} (${memPercent}%)`}
          >
            <Layers size={12} className={memColorClass.split(' ')[0]} />
            <span className="text-slate-500 dark:text-gray-400 font-medium text-[10px]">内存</span>
            <div className="w-10 h-1.5 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${memColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
              ></div>
            </div>
            <span className="font-mono text-slate-700 dark:text-gray-200 text-[11px] font-medium">
              {memUsed}
            </span>
            <span className={`font-mono text-[10px] ${memColorClass.split(' ')[0]}`}>
              ({memPercent}%)
            </span>
          </div>

          {/* 磁盘 */}
          <div
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 shadow-2xs"
            title={`系统盘 (/): ${diskUsed} / ${diskTotal} (${diskPercent}%)`}
          >
            <HardDrive size={12} className={diskColorClass.split(' ')[0]} />
            <span className="text-slate-500 dark:text-gray-400 font-medium text-[10px]">磁盘</span>
            <div className="w-10 h-1.5 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${diskColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              ></div>
            </div>
            <span className="font-mono text-slate-700 dark:text-gray-200 text-[11px] font-medium">
              {diskUsed}
            </span>
          </div>

          {/* 实时网速 */}
          <div
            className="flex items-center space-x-2 px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 shadow-2xs font-mono text-[11px]"
            title="实时网速 (上行 / 下行)"
          >
            <div className="flex items-center space-x-0.5 text-cyan-600 dark:text-cyan-400 font-medium">
              <ArrowUp size={11} className="stroke-[2.5]" />
              <span>{txStr}</span>
            </div>
            <div className="flex items-center space-x-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowDown size={11} className="stroke-[2.5]" />
              <span>{rxStr}</span>
            </div>
          </div>

          {/* 负载与开机 */}
          <div
            className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 shadow-2xs text-[10px] text-slate-500 dark:text-gray-400"
            title={`平均负载: ${load1}, ${load5}, ${load15} | 开机时长: ${uptimeStr}`}
          >
            <Gauge size={11} className="text-slate-400 dark:text-gray-500" />
            <span>负载:</span>
            <span className="font-mono text-slate-700 dark:text-gray-300 font-medium">
              {load1}
            </span>
            <span className="text-slate-300 dark:text-gray-600">|</span>
            <Clock size={10} className="text-slate-400 dark:text-gray-500" />
            <span className="text-slate-700 dark:text-gray-300 truncate max-w-[80px]">
              {uptimeStr}
            </span>
          </div>
        </div>

        {/* 右侧展开与关闭 */}
        <div className="flex items-center space-x-1 shrink-0 pl-1 border-l border-slate-200 dark:border-white/10">
          <button
            onClick={() => {
              const next = !isExpanded
              setIsExpanded(next)
              if (onExpandChange) onExpandChange(next)
            }}
            className="p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 rounded transition"
            title={isExpanded ? '收起详情仪表盘' : '展开详细性能监控卡片'}
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded transition"
              title="隐藏实时状态栏"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. 展开的 FinalShell 风格大卡片仪表盘 */}
      {isExpanded && (
        <div className="p-3 border-t border-slate-200 dark:border-[#30363d]/60 bg-slate-100/60 dark:bg-[#07090e] grid grid-cols-2 md:grid-cols-4 gap-2.5 animate-in fade-in duration-200">
          {/* 卡片 1: CPU */}
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400 text-[11px]">
              <span className="flex items-center space-x-1">
                <Cpu size={13} className={cpuColorClass.split(' ')[0]} />
                <span className="font-semibold text-slate-800 dark:text-gray-200">CPU 处理器</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400 dark:text-gray-400">{cpuCores} 核心</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-bold font-mono ${cpuColorClass.split(' ')[0]}`}>
                {cpuPercent}%
              </span>
              <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">
                负载 {load1}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${cpuColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 2: 内存与 Swap */}
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400 text-[11px]">
              <span className="flex items-center space-x-1">
                <Layers size={13} className={memColorClass.split(' ')[0]} />
                <span className="font-semibold text-slate-800 dark:text-gray-200">物理内存 / Swap</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400 dark:text-gray-400">{memPercent}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold font-mono text-slate-800 dark:text-gray-200">
                {memUsed} <span className="text-slate-400 dark:text-gray-500 font-normal">/ {memTotal}</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">
                Swap: {swapUsed}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${memColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 3: 系统磁盘 */}
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400 text-[11px]">
              <span className="flex items-center space-x-1">
                <HardDrive size={13} className={diskColorClass.split(' ')[0]} />
                <span className="font-semibold text-slate-800 dark:text-gray-200">系统盘 (/)</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400 dark:text-gray-400">{diskPercent}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold font-mono text-slate-800 dark:text-gray-200">
                {diskUsed} <span className="text-slate-400 dark:text-gray-500 font-normal">/ {diskTotal}</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">挂载点 /</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${diskColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 4: 实时网络流量与运行时间 */}
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400 text-[11px]">
              <span className="flex items-center space-x-1">
                <Activity size={13} className="text-cyan-600 dark:text-cyan-400" />
                <span className="font-semibold text-slate-800 dark:text-gray-200">网络与运行时长</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center space-x-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                <span>正常</span>
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-cyan-600 dark:text-cyan-300 flex items-center space-x-0.5">
                <ArrowUp size={12} className="stroke-[2.5]" />
                <span>{txStr}</span>
              </span>
              <span className="text-emerald-600 dark:text-emerald-300 flex items-center space-x-0.5">
                <ArrowDown size={12} className="stroke-[2.5]" />
                <span>{rxStr}</span>
              </span>
            </div>
            <div className="pt-0.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-gray-400 border-t border-slate-100 dark:border-[#21262d]">
              <span className="flex items-center space-x-1">
                <Clock size={10} />
                <span>运行时长</span>
              </span>
              <span className="text-slate-700 dark:text-gray-200 font-mono">{uptimeStr}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
