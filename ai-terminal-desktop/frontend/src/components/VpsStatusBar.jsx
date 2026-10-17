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

// 颜色工具函数：根据百分比返回主题色
const getPercentColor = (percent) => {
  if (percent >= 85) return 'text-red-400 bg-red-500'
  if (percent >= 60) return 'text-amber-400 bg-amber-500'
  return 'text-emerald-400 bg-emerald-500'
}

export default function VpsStatusBar({ activeTab, visible = true, onClose }) {
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
    <div className="bg-white/95 dark:bg-[#0b0e14]/95 border-b border-slate-200 dark:border-[#30363d]/80 text-xs select-none backdrop-blur-md transition-colors shrink-0 text-slate-700 dark:text-gray-300">
      {/* 1. 紧凑单行状态栏 (默认) */}
      <div className="h-9 px-3 flex items-center justify-between space-x-3 overflow-x-auto text-[11px]">
        {/* 左侧：主机标识与心跳 */}
        <div className="flex items-center space-x-1.5 shrink-0 pr-1 border-r border-slate-200 dark:border-white/10">
          <Radio size={12} className="text-emerald-500 dark:text-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-800 dark:text-gray-200">
            {activeTab.type === 'ssh' ? 'VPS 监控' : '本地监控'}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">2.5s</span>
        </div>

        {/* 中间指标条目 */}
        <div className="flex items-center space-x-4 min-w-0 flex-1 overflow-x-auto py-0.5">
          {/* CPU */}
          <div
            className="flex items-center space-x-1.5 shrink-0 cursor-default"
            title={`CPU 实时使用率: ${cpuPercent}% (${cpuCores} 核心)`}
          >
            <div className="flex items-center space-x-1 text-slate-500 dark:text-gray-400">
              <Cpu size={12} className={cpuColorClass.split(' ')[0]} />
              <span>CPU</span>
            </div>
            <div className="w-14 h-1.5 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${cpuColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              ></div>
            </div>
            <span className={`font-mono font-medium ${cpuColorClass.split(' ')[0]}`}>
              {cpuPercent}%
            </span>
          </div>

          {/* 内存 */}
          <div
            className="flex items-center space-x-1.5 shrink-0 cursor-default"
            title={`物理内存: ${memUsed} / ${memTotal} (${memPercent}%)`}
          >
            <div className="flex items-center space-x-1 text-slate-500 dark:text-gray-400">
              <Layers size={12} className={memColorClass.split(' ')[0]} />
              <span>内存</span>
            </div>
            <div className="w-14 h-1.5 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${memColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
              ></div>
            </div>
            <span className="font-mono text-slate-700 dark:text-gray-300">
              {memUsed}/{memTotal}
            </span>
            <span className={`font-mono text-[10px] ${memColorClass.split(' ')[0]}`}>
              ({memPercent}%)
            </span>
          </div>

          {/* 系统盘 */}
          <div
            className="flex items-center space-x-1.5 shrink-0 cursor-default"
            title={`系统盘 (根目录 /): ${diskUsed} / ${diskTotal} (${diskPercent}%)`}
          >
            <div className="flex items-center space-x-1 text-slate-500 dark:text-gray-400">
              <HardDrive size={12} className={diskColorClass.split(' ')[0]} />
              <span>系统盘</span>
            </div>
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${diskColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              ></div>
            </div>
            <span className="font-mono text-slate-700 dark:text-gray-300">
              {diskUsed}/{diskTotal}
            </span>
          </div>

          {/* 网络速率 (上下行) */}
          <div
            className="flex items-center space-x-2 shrink-0 cursor-default font-mono text-[11px]"
            title={`实时网速 (非本地回环累计)`}
          >
            <div className="flex items-center space-x-0.5 text-cyan-600 dark:text-cyan-400">
              <ArrowUp size={11} className="stroke-[2.5]" />
              <span>{txStr}</span>
            </div>
            <div className="flex items-center space-x-0.5 text-emerald-600 dark:text-emerald-400">
              <ArrowDown size={11} className="stroke-[2.5]" />
              <span>{rxStr}</span>
            </div>
          </div>

          {/* 系统负载 */}
          <div
            className="flex items-center space-x-1 shrink-0 cursor-default text-slate-500 dark:text-gray-400 font-mono text-[10px]"
            title={`系统平均负载 (1, 5, 15 分钟)`}
          >
            <Gauge size={11} className="text-slate-400 dark:text-gray-500" />
            <span>负载:</span>
            <span className="text-slate-700 dark:text-gray-300">
              {load1}, {load5}, {load15}
            </span>
          </div>

          {/* 开机时长 */}
          <div
            className="flex items-center space-x-1 shrink-0 cursor-default text-slate-500 dark:text-gray-400 text-[10px]"
            title={`系统开机运行时长`}
          >
            <Clock size={11} className="text-slate-400 dark:text-gray-500" />
            <span className="text-slate-700 dark:text-gray-300">{uptimeStr}</span>
          </div>
        </div>

        {/* 右侧控制 */}
        <div className="flex items-center space-x-1 shrink-0 pl-1 border-l border-slate-200 dark:border-white/10">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded transition"
            title={isExpanded ? '收起详情仪表盘' : '展开 FinalShell 风格仪表盘'}
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded transition"
              title="隐藏实时状态栏"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. 展开的 FinalShell 风格大卡片仪表盘 */}
      {isExpanded && (
        <div className="p-3 border-t border-slate-200 dark:border-[#30363d]/60 bg-slate-50 dark:bg-[#07090e] grid grid-cols-2 md:grid-cols-4 gap-2.5 animate-in fade-in duration-200">
          {/* 卡片 1: CPU */}
          <div className="bg-white dark:bg-[#12161f] border border-slate-200 dark:border-[#21262d] rounded-lg p-2.5 space-y-1.5 shadow-xs">
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
            <div className="w-full h-2 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${cpuColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 2: 内存与 Swap */}
          <div className="bg-white dark:bg-[#12161f] border border-slate-200 dark:border-[#21262d] rounded-lg p-2.5 space-y-1.5 shadow-xs">
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
            <div className="w-full h-2 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${memColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 3: 系统磁盘 */}
          <div className="bg-white dark:bg-[#12161f] border border-slate-200 dark:border-[#21262d] rounded-lg p-2.5 space-y-1.5 shadow-xs">
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
            <div className="w-full h-2 bg-slate-200 dark:bg-[#1f242c] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${diskColorClass.split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* 卡片 4: 实时网络流量与运行时间 */}
          <div className="bg-white dark:bg-[#12161f] border border-slate-200 dark:border-[#21262d] rounded-lg p-2.5 space-y-1.5 shadow-xs">
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
