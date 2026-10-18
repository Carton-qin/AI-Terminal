import React, { useEffect, useMemo, useState } from 'react'
import {
  Wrench,
  X,
  Play,
  Copy,
  Check,
  FileText,
  Search,
  Terminal,
  AlertTriangle,
  Flame,
  Globe,
  Gauge,
  Cpu,
  Server,
  Network,
  Layers,
  Sparkles,
  Package,
  Plus,
  Edit2,
  Trash2,
  Star,
  BookmarkCheck,
} from 'lucide-react'

const BASE_CATEGORY_CONFIGS = [
  { name: '全部', icon: Layers, color: 'text-gray-300' },
  { name: '我的自定义', icon: Star, color: 'text-amber-400' },
  { name: 'DD系统重装', icon: Flame, color: 'text-rose-400' },
  { name: '综合跑分测试', icon: Gauge, color: 'text-amber-400' },
  { name: 'CPU与性能测试', icon: Cpu, color: 'text-purple-400' },
  { name: '流媒体与IP质量', icon: Globe, color: 'text-cyan-400' },
  { name: '测速与网络路由', icon: Network, color: 'text-blue-400' },
  { name: '系统与网络调优', icon: Wrench, color: 'text-emerald-400' },
  { name: '常用环境与控制面板', icon: Package, color: 'text-indigo-400' },
  { name: '综合多功能工具箱', icon: Sparkles, color: 'text-orange-400' },
  { name: '杜甫独立服务器巡检', icon: Server, color: 'text-teal-400' },
]

export default function SnippetDrawer({ isOpen, onClose, onInjectCommand }) {
  const [snippets, setSnippets] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [confirmDeleteSnipId, setConfirmDeleteSnipId] = useState(null)

  // 自定义命令添加/编辑弹窗
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingSnippet, setEditingSnippet] = useState(null)
  const [snippetForm, setSnippetForm] = useState({
    name: '',
    category: '自定义命令',
    description: '',
    script: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchSnippets = () => {
    fetch('http://127.0.0.1:8765/api/snippets')
      .then((res) => res.json())
      .then((data) => setSnippets(data))
      .catch(() => {})
  }

  useEffect(() => {
    if (isOpen) {
      fetchSnippets()
    }
  }, [isOpen])

  // 计算各分类计数
  const categoryCounts = useMemo(() => {
    const counts = { 全部: snippets.length, 我的自定义: 0 }
    snippets.forEach((s) => {
      if (s.is_custom || s.category === '自定义命令') {
        counts['我的自定义'] = (counts['我的自定义'] || 0) + 1
      }
      counts[s.category] = (counts[s.category] || 0) + 1
    })
    return counts
  }, [snippets])

  // 过滤后的脚本列表
  const filteredSnippets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return snippets.filter((s) => {
      let matchCat = false
      if (selectedCategory === '全部') {
        matchCat = true
      } else if (selectedCategory === '我的自定义') {
        matchCat = s.is_custom === 1 || s.category === '自定义命令'
      } else {
        matchCat = s.category === selectedCategory
      }

      if (!matchCat) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.script.toLowerCase().includes(q)
      )
    })
  }, [snippets, selectedCategory, searchQuery])

  if (!isOpen) return null

  const copyScript = (script, id) => {
    navigator.clipboard.writeText(script)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // 打开新建弹窗
  const handleOpenAdd = () => {
    setEditingSnippet(null)
    setSnippetForm({
      name: '',
      category: selectedCategory === '全部' ? '自定义命令' : selectedCategory,
      description: '',
      script: '',
    })
    setIsEditModalOpen(true)
  }

  // 打开编辑弹窗
  const handleOpenEdit = (snip) => {
    setEditingSnippet(snip)
    setSnippetForm({
      name: snip.name || '',
      category: snip.category || '自定义命令',
      description: snip.description || '',
      script: snip.script || '',
    })
    setIsEditModalOpen(true)
  }

  // 保存自定义命令
  const handleSaveSnippet = async (e) => {
    e.preventDefault()
    if (!snippetForm.name.trim() || !snippetForm.script.trim()) {
      alert('请填写命令备注名称与脚本内容')
      return
    }

    setSubmitting(true)
    try {
      if (editingSnippet) {
        const res = await fetch(`http://127.0.0.1:8765/api/snippets/${editingSnippet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snippetForm),
        })
        if (!res.ok) throw new Error('更新失败')
      } else {
        const res = await fetch('http://127.0.0.1:8765/api/snippets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snippetForm),
        })
        if (!res.ok) throw new Error('保存失败')
      }
      setIsEditModalOpen(false)
      fetchSnippets()
    } catch (err) {
      alert(`保存失败: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // 删除自定义命令
  const handleDeleteSnippet = async (snipId) => {
    setConfirmDeleteSnipId(null)
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/snippets/${snipId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('删除失败')
      fetchSnippets()
    } catch (err) {
      alert(`删除失败: ${err.message}`)
    }
  }

  const getCategoryColor = (cat) => {
    switch (cat) {
      case '我的自定义':
      case '自定义命令':
        return 'border-amber-500/40 text-amber-300 bg-amber-500/10'
      case 'DD系统重装':
        return 'border-rose-500/40 text-rose-400 bg-rose-500/10'
      case '综合跑分测试':
        return 'border-amber-500/40 text-amber-400 bg-amber-500/10'
      case 'CPU与性能测试':
        return 'border-purple-500/40 text-purple-400 bg-purple-500/10'
      case '流媒体与IP质量':
        return 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
      case '测速与网络路由':
        return 'border-blue-500/40 text-blue-400 bg-blue-500/10'
      case '系统与网络调优':
        return 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
      case '常用环境与控制面板':
        return 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10'
      case '综合多功能工具箱':
        return 'border-orange-500/40 text-orange-400 bg-orange-500/10'
      case '杜甫独立服务器巡检':
        return 'border-teal-500/40 text-teal-400 bg-teal-500/10'
      default:
        return 'border-gray-500/40 text-gray-400 bg-gray-500/10'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl w-full max-w-6xl h-[88vh] max-h-[860px] flex flex-col shadow-2xl overflow-hidden">
        {/* 顶部标题与搜索栏 */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#0f1319]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <Wrench size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-slate-900 dark:text-white font-bold text-sm tracking-wide">
                  社区经典运维与常用脚本库
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-300 dark:border-emerald-500/40">
                  NodeSeek 精选 + 用户自定义
                </span>
              </div>
              <p className="text-slate-500 dark:text-gray-400 text-[11px] hidden sm:block">
                支持开箱即用社区经典脚本，并可随心添加、管理你的专属常用 Shell 命令
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* 新建常用命令按钮 */}
            <button
              onClick={handleOpenAdd}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
              title="添加自定义常用命令"
            >
              <Plus size={14} />
              <span>添加常用命令</span>
            </button>

            {/* 搜索框 */}
            <div className="relative w-52 sm:w-64">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称、分类或命令..."
                className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#21262d] transition"
              title="关闭 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 主体核心：左右布局 (Left-Right Split) */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧分类导航侧边栏 (250px) */}
          <aside className="w-60 bg-slate-50 dark:bg-[#11141b] border-r border-slate-200 dark:border-[#21262d] flex flex-col shrink-0">
            <div className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-gray-400 tracking-wider uppercase border-b border-slate-200 dark:border-[#21262d] flex items-center justify-between">
              <span>分类导航</span>
              <button
                onClick={handleOpenAdd}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 text-[11px] flex items-center space-x-1 font-medium"
                title="新建命令"
              >
                <Plus size={12} />
                <span>新建</span>
              </button>
            </div>

            {/* 分类菜单项列表 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {BASE_CATEGORY_CONFIGS.map((cfg) => {
                const count = categoryCounts[cfg.name] || 0
                const active = selectedCategory === cfg.name
                const IconComponent = cfg.icon

                return (
                  <button
                    key={cfg.name}
                    onClick={() => setSelectedCategory(cfg.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition text-left ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-600/15 dark:text-emerald-300 dark:border-emerald-500/40 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-[#181d26] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <IconComponent
                        size={15}
                        className={`shrink-0 ${active ? 'text-emerald-600 dark:text-emerald-400' : cfg.color}`}
                      />
                      <span className="truncate">{cfg.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full shrink-0 ${
                        active
                          ? 'bg-emerald-200/60 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200'
                          : 'bg-slate-200 text-slate-600 dark:bg-[#21262d] dark:text-gray-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 左下角提示 */}
            <div className="p-3 border-t border-slate-200 dark:border-[#21262d] bg-slate-100/60 dark:bg-[#0c0f14] text-[11px] text-slate-500 dark:text-gray-500 flex items-center space-x-2">
              <BookmarkCheck size={14} className="text-amber-500 dark:text-yellow-400 shrink-0" />
              <span>支持将高频 Shell 命令随心添加并一键注入终端</span>
            </div>
          </aside>

          {/* 右侧主视口：脚本卡片流 */}
          <main className="flex-1 flex flex-col bg-slate-100/60 dark:bg-[#0d1117] overflow-hidden">
            {/* 右侧副标题栏 */}
            <div className="px-6 py-2.5 border-b border-slate-200 dark:border-[#21262d] bg-white/80 dark:bg-[#12161f]/60 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">{selectedCategory}</span>
                <span className="text-slate-400 dark:text-gray-500">·</span>
                <span className="text-slate-500 dark:text-gray-400 font-mono text-[11px]">
                  共 {filteredSnippets.length} 个脚本
                </span>
                {searchQuery && (
                  <span className="text-emerald-700 dark:text-emerald-400 text-[11px] bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30">
                    筛选：&quot;{searchQuery}&quot;
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:underline"
                  >
                    清除搜索条件
                  </button>
                )}
                <button
                  onClick={handleOpenAdd}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 font-medium"
                >
                  <Plus size={13} />
                  <span>添加命令</span>
                </button>
              </div>
            </div>

            {/* 脚本卡片滚动列表 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {filteredSnippets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-gray-500 space-y-3">
                  <Search size={40} className="opacity-30 text-slate-400 dark:text-gray-400" />
                  <p className="text-sm">未找到与 &quot;{searchQuery || selectedCategory}&quot; 匹配的脚本</p>
                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      onClick={handleOpenAdd}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-medium transition shadow-2xs"
                    >
                      + 新建常用命令
                    </button>
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('')
                          setSelectedCategory('全部')
                        }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline px-2 py-1"
                      >
                        重置搜索并查看全部
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                filteredSnippets.map((snip) => {
                  const isCustom = snip.is_custom === 1 || snip.id.startsWith('custom-')
                  const hasPasswordParam =
                    snip.script.includes('-pwd') || snip.script.includes('Password123')
                  const isWindows = snip.name.toLowerCase().includes('windows')
                  const colorClass = getCategoryColor(snip.category)

                  return (
                    <div
                      key={snip.id}
                      className={`bg-white dark:bg-[#161b22] border rounded-xl p-4 space-y-3 transition shadow-2xs ${
                        isCustom
                          ? 'border-amber-300 dark:border-amber-500/30 hover:border-amber-400 dark:hover:border-amber-500/60'
                          : 'border-slate-200 dark:border-[#30363d] hover:border-slate-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {/* 标题栏与分类标签 */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-sm">
                          {isCustom ? (
                            <Star size={16} className="text-amber-500 dark:text-amber-400 shrink-0 fill-amber-400/20" />
                          ) : (
                            <FileText size={16} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
                          )}
                          <span>{snip.name}</span>
                          {isCustom && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 px-2 py-0.2 rounded-full font-normal">
                              自定义
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono font-medium ${colorClass}`}
                          >
                            {snip.category}
                          </span>

                          {/* 自定义脚本专享：编辑与删除按钮 */}
                          {isCustom && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(snip)}
                                className="p-1 text-slate-400 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-300 hover:bg-slate-100 dark:hover:bg-[#21262d] rounded transition"
                                title="编辑自定义命令"
                              >
                                <Edit2 size={13} />
                              </button>
                              {confirmDeleteSnipId === snip.id ? (
                                <div className="flex items-center space-x-1 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[10px] text-rose-500 font-medium">删除?</span>
                                  <button
                                    onClick={() => handleDeleteSnippet(snip.id)}
                                    className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-500"
                                    title="确认删除"
                                  >
                                    是
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteSnipId(null)}
                                    className="px-1 py-0.5 bg-slate-200 dark:bg-[#30363d] text-slate-600 dark:text-gray-300 rounded text-[10px]"
                                    title="取消"
                                  >
                                    否
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteSnipId(snip.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-[#21262d] rounded transition"
                                  title="删除自定义命令"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* 描述与参数提示 */}
                      {snip.description && (
                        <p className="text-slate-600 dark:text-gray-400 text-xs leading-relaxed">{snip.description}</p>
                      )}

                      {/* 针对重装密码/Windows的温馨提示 */}
                      {hasPasswordParam && (
                        <div className="flex items-center space-x-2 text-xs text-amber-800 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-3 py-1.5 rounded-lg">
                          <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                          <span>
                            含默认密码 <code>Password123</code>，建议点击下方【填入命令行】编辑密码后再按回车执行
                          </span>
                        </div>
                      )}

                      {isWindows && (
                        <div className="flex items-center space-x-2 text-xs text-sky-800 dark:text-sky-400/90 bg-sky-50 dark:bg-sky-500/10 border border-sky-300 dark:border-sky-500/20 px-3 py-1.5 rounded-lg">
                          <Server size={14} className="shrink-0 text-sky-600" />
                          <span>
                            Windows 预设凭据: 账号 <code>Administrator</code> 密码 <code>Teddysun.com</code>
                          </span>
                        </div>
                      )}

                      {/* 脚本命令代码预览区 */}
                      <div className="bg-slate-900 dark:bg-[#0b0e14] border border-slate-800 dark:border-slate-700/60 rounded-lg p-3 font-mono text-xs text-emerald-400 dark:text-emerald-300 max-h-36 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                        {snip.script}
                      </div>

                      {/* 底部操作按钮组 */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">
                          ID: {snip.id}
                        </span>

                        <div className="flex items-center space-x-2.5">
                          {/* 复制脚本 */}
                          <button
                            onClick={() => copyScript(snip.script, snip.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white rounded-lg flex items-center space-x-1.5 text-xs transition border border-slate-200 dark:border-transparent"
                            title="复制到剪贴板"
                          >
                            {copiedId === snip.id ? (
                              <Check size={14} className="text-emerald-500 dark:text-emerald-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                            <span>{copiedId === snip.id ? '已复制' : '复制命令'}</span>
                          </button>

                          {/* 仅填入命令行（不回车，适合修改密码或参数） */}
                          <button
                            onClick={() => {
                              onInjectCommand(snip.script, false)
                              onClose()
                            }}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#238636]/20 dark:hover:bg-[#238636]/30 dark:text-emerald-300 dark:border-emerald-500/40 rounded-lg flex items-center space-x-1.5 text-xs transition shadow-2xs font-medium"
                            title="填入命令行供编辑，不立即回车"
                          >
                            <Terminal size={14} />
                            <span>填入命令行 (可编辑)</span>
                          </button>

                          {/* 发送并立即执行 */}
                          <button
                            onClick={() => {
                              onInjectCommand(snip.script, true)
                              onClose()
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg flex items-center space-x-1.5 text-xs transition shadow-2xs"
                            title="发送到当前激活终端并立即回车执行"
                          >
                            <Play size={14} />
                            <span>一键执行</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </main>
        </div>
      </div>

      {/* 自定义常用命令创建/编辑弹窗 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between bg-slate-50 dark:bg-[#0f1319]">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold text-sm">
                <Star size={16} className="text-amber-500 dark:text-amber-400" />
                <span>{editingSnippet ? '编辑常用命令' : '添加自定义常用命令'}</span>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSnippet} className="p-5 space-y-3.5 text-xs bg-white dark:bg-[#161b22]">
              <div>
                <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">命令名称 / 备注 *</label>
                <input
                  type="text"
                  placeholder="例如: 查看 Nginx 实时访问日志 / 重启服务"
                  value={snippetForm.name}
                  onChange={(e) => setSnippetForm({ ...snippetForm, name: e.target.value })}
                  className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">所属分类</label>
                <input
                  type="text"
                  placeholder="例如: 自定义命令 / 日常运维 / 备份迁移"
                  value={snippetForm.category}
                  onChange={(e) => setSnippetForm({ ...snippetForm, category: e.target.value })}
                  className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">命令作用说明 (选填)</label>
                <input
                  type="text"
                  placeholder="例如: tail -f 实时跟踪最后 100 行错误日志"
                  value={snippetForm.description}
                  onChange={(e) => setSnippetForm({ ...snippetForm, description: e.target.value })}
                  className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">Shell 命令 / 脚本内容 *</label>
                <textarea
                  rows={5}
                  placeholder="例如: tail -n 100 -f /var/log/nginx/access.log"
                  value={snippetForm.script}
                  onChange={(e) => setSnippetForm({ ...snippetForm, script: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/60 rounded-lg p-3 text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded-lg font-medium transition border border-slate-200 dark:border-transparent"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition shadow-2xs"
                >
                  {submitting ? '正在保存...' : editingSnippet ? '保存修改' : '立即保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
