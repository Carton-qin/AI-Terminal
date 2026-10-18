import React, { useState, useRef, useEffect } from 'react'
import {
  Server,
  Plus,
  Terminal,
  Wrench,
  Settings,
  Trash2,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Edit2,
  MoveRight,
  Lock,
  Check,
  X,
  MoreVertical,
  Key,
  Sun,
  Moon,
} from 'lucide-react'

export default function HostSidebar({
  hosts = [],
  groups = [],
  onOpenLocal,
  onConnectHost,
  onAddHost,
  onEditHost,
  onDeleteHost,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveHost,
  onOpenSnippets,
  onOpenSettings,
  onOpenKeyManager,
  uiMode = 'dark',
  onToggleUiMode,
}) {
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // 移动分组菜单状态 hostId -> boolean
  const [activeMoveMenuHostId, setActiveMoveMenuHostId] = useState(null)
  const moveMenuRef = useRef(null)

  // 点击外部关闭移动分组菜单
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) {
        setActiveMoveMenuHostId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const toggleGroup = (groupName) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
  }

  // 整合并归类主机
  const allGroupNames = Array.from(
    new Set([
      '默认分组',
      ...groups.map((g) => g.name),
      ...hosts.map((h) => h.group_name || '默认分组'),
    ])
  )

  const hostsByGroup = allGroupNames.reduce((acc, gName) => {
    acc[gName] = hosts.filter((h) => (h.group_name || '默认分组') === gName)
    return acc
  }, {})

  // 提交新建分组
  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault()
    const trimmed = newGroupName.trim()
    if (!trimmed) {
      setIsCreatingGroup(false)
      return
    }
    try {
      await onCreateGroup(trimmed)
      setNewGroupName('')
      setIsCreatingGroup(false)
    } catch (err) {
      alert(`创建分组失败: ${err.message}`)
    }
  }

  // 提交重命名分组
  const handleRenameGroupSubmit = async (groupId, oldName) => {
    const trimmed = editingGroupName.trim()
    if (!trimmed || trimmed === oldName) {
      setEditingGroupId(null)
      return
    }
    try {
      await onRenameGroup(groupId, trimmed)
      setEditingGroupId(null)
    } catch (err) {
      alert(`重命名分组失败: ${err.message}`)
    }
  }

  return (
    <aside className="w-64 bg-slate-50 dark:bg-[#161b22] border-r border-slate-200 dark:border-[#30363d] flex flex-col h-full shrink-0 select-none transition-colors duration-200">
      {/* 顶部标题栏 */}
      <div className="h-12 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-3 bg-white dark:bg-[#0f1319]">
        <div className="flex items-center space-x-2">
          <span className="text-xl">⚡</span>
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-cyan-500 to-blue-600 dark:from-cyan-400 dark:to-blue-500 bg-clip-text text-transparent">
            AI Terminal
          </span>
        </div>
        <div className="flex items-center space-x-1">
          {/* 日/夜主题切换 */}
          <button
            onClick={onToggleUiMode}
            className="p-1.5 text-slate-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded-lg transition"
            title={uiMode === 'dark' ? '切换为浅色主题 (Light)' : '切换为深色主题 (Dark)'}
          >
            {uiMode === 'dark' ? (
              <Sun size={15} className="text-amber-400" />
            ) : (
              <Moon size={15} className="text-indigo-600" />
            )}
          </button>
          <button
            onClick={onAddHost}
            className="p-1.5 text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded-lg transition"
            title="添加 VPS 主机"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onOpenSnippets}
            className="p-1.5 text-slate-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded-lg transition"
            title="自动化运维脚本库"
          >
            <Wrench size={16} />
          </button>
          <button
            onClick={onOpenKeyManager}
            className="p-1.5 text-slate-500 hover:text-yellow-600 dark:text-gray-400 dark:hover:text-yellow-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded-lg transition"
            title="SSH 密钥管理器 & 免密直连助手"
          >
            <Key size={16} />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-slate-500 hover:text-yellow-600 dark:text-gray-400 dark:hover:text-yellow-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded-lg transition"
            title="AI 大模型与通用设置"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* 本地终端快捷入口 */}
      <div className="p-2 border-b border-slate-200 dark:border-[#30363d]">
        <button
          onClick={onOpenLocal}
          className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-gray-200 bg-white dark:bg-[#21262d] hover:bg-slate-100 dark:hover:bg-[#30363d] border border-slate-200/80 dark:border-transparent rounded-lg transition shadow-xs"
        >
          <Terminal size={14} className="text-cyan-600 dark:text-cyan-400" />
          <span>打开本地终端</span>
        </button>
      </div>

      {/* VPS 资产管理列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* 分组操作顶部栏 */}
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            VPS 服务器 ({hosts.length})
          </span>
          <button
            onClick={() => {
              setIsCreatingGroup(true)
              setNewGroupName('')
            }}
            className="flex items-center space-x-1 text-[11px] text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 hover:bg-slate-200/70 dark:hover:bg-[#21262d] px-1.5 py-0.5 rounded transition"
            title="新建主机分组"
          >
            <FolderPlus size={13} />
            <span>新建分组</span>
          </button>
        </div>

        {/* 内联新建分组输入框 */}
        {isCreatingGroup && (
          <form
            onSubmit={handleCreateGroupSubmit}
            className="p-2 bg-white dark:bg-[#0d1117] border border-cyan-500/50 rounded-lg space-y-1.5 animate-in fade-in shadow-2xs"
          >
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="输入分组名称 (如: 美西CN2)"
                className="flex-1 bg-slate-50 dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded px-2 py-1 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-cyan-400"
                autoFocus
              />
              <button
                type="submit"
                className="p-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs"
                title="保存分组"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="p-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-600 dark:text-gray-400 rounded text-xs"
                title="取消"
              >
                <X size={13} />
              </button>
            </div>
          </form>
        )}

        {/* 分组列表循环 */}
        {allGroupNames.map((gName) => {
          const groupHosts = hostsByGroup[gName] || []
          const isCollapsed = collapsedGroups[gName]
          const groupObj = groups.find((g) => g.name === gName)
          const isDefault = gName === '默认分组'
          const isEditing = groupObj && editingGroupId === groupObj.id

          return (
            <div key={gName} className="space-y-0.5">
              {/* 分组标题与管理菜单 */}
              <div className="group/grp flex items-center justify-between px-1.5 py-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-[#21262d]/60 text-xs text-slate-700 dark:text-gray-300 transition">
                {isEditing ? (
                  <div className="flex items-center space-x-1 flex-1">
                    <input
                      type="text"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      className="flex-1 bg-white dark:bg-[#0d1117] border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-slate-800 dark:text-white focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameGroupSubmit(groupObj.id, gName)
                        if (e.key === 'Escape') setEditingGroupId(null)
                      }}
                    />
                    <button
                      onClick={() => handleRenameGroupSubmit(groupObj.id, gName)}
                      className="text-cyan-600 dark:text-cyan-400 p-1 hover:text-cyan-500"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="text-slate-400 dark:text-gray-400 p-1 hover:text-slate-700 dark:hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleGroup(gName)}
                    className="flex items-center space-x-1.5 truncate flex-1 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-slate-400 dark:text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-slate-400 dark:text-gray-500 shrink-0" />
                    )}
                    <Folder size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-gray-200 truncate">{gName}</span>
                    <span className="text-[10px] font-mono bg-slate-200 dark:bg-[#21262d] px-1.5 py-0.2 rounded-full text-slate-600 dark:text-gray-400 shrink-0">
                      {groupHosts.length}
                    </span>
                  </button>
                )}

                {/* 分组右侧悬浮管理按钮 */}
                {!isEditing && (
                  <div className="opacity-0 group-hover/grp:opacity-100 flex items-center space-x-1 transition shrink-0">
                    {!isDefault ? (
                      <>
                        <button
                          onClick={() => {
                            if (groupObj) {
                              setEditingGroupId(groupObj.id)
                              setEditingGroupName(gName)
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-300 transition"
                          title="重命名分组"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `确定删除分组「${gName}」吗？\n该分组下的所有服务器将自动移至「默认分组」。`
                              )
                            ) {
                              if (groupObj) onDeleteGroup(groupObj.id)
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 transition"
                          title="删除分组"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : (
                      <span title="默认基础分组 (不可删除或重命名)">
                        <Lock size={11} className="text-slate-400 dark:text-gray-600 mr-1" />
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 分组内主机项 */}
              {!isCollapsed && (
                <div className="space-y-0.5 pl-2.5">
                  {groupHosts.length === 0 ? (
                    <div className="text-[11px] text-slate-400 dark:text-gray-500 py-1.5 px-3 border border-dashed border-slate-300 dark:border-[#2d333b] rounded-lg text-center">
                      暂无主机 (可将主机移动至此)
                    </div>
                  ) : (
                    groupHosts.map((host) => {
                      const isMoveMenuOpen = activeMoveMenuHostId === host.id

                      return (
                        <div
                          key={host.id}
                          className="relative group/host flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-white dark:hover:bg-[#21262d] text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-transparent hover:shadow-xs transition"
                        >
                          {/* 主机信息点击连接 */}
                          <div
                            onClick={() => onConnectHost(host)}
                            className="flex items-center space-x-2 truncate flex-1"
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0 shadow-xs" />
                            <div className="truncate">
                              <div className="font-medium truncate text-slate-800 dark:text-gray-100">{host.name}</div>
                              <div className="text-[10px] text-slate-500 dark:text-gray-500 font-mono truncate">
                                {host.ip}:{host.port || 22}
                              </div>
                            </div>
                          </div>

                          {/* 主机操作按钮组 */}
                          <div className="opacity-0 group-hover/host:opacity-100 flex items-center space-x-0.5 transition shrink-0 ml-1">
                            {/* 移动分组按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMoveMenuHostId(isMoveMenuOpen ? null : host.id)
                              }}
                              className="p-1 text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-400 hover:bg-slate-200 dark:hover:bg-[#30363d] rounded transition"
                              title="移动到其它分组"
                            >
                              <MoveRight size={13} />
                            </button>

                            {/* 编辑主机信息按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onEditHost(host)
                              }}
                              className="p-1 text-slate-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-yellow-400 hover:bg-slate-200 dark:hover:bg-[#30363d] rounded transition"
                              title="编辑主机配置"
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* 删除主机按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`确定删除 VPS 主机「${host.name}」吗？`)) {
                                  onDeleteHost(host.id)
                                }
                              }}
                              className="p-1 text-slate-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-[#30363d] rounded transition"
                              title="删除主机"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {/* 移动分组弹出菜单 */}
                          {isMoveMenuOpen && (
                            <div
                              ref={moveMenuRef}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-8 z-50 w-44 bg-white dark:bg-[#1f242c] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl p-1.5 space-y-1 text-xs animate-in fade-in zoom-in-95 text-slate-700 dark:text-gray-300"
                            >
                              <div className="px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-[#30363d] uppercase tracking-wider flex items-center justify-between">
                                <span>移动至分组</span>
                                <Folder size={11} className="text-cyan-600 dark:text-cyan-400" />
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {allGroupNames.map((targetG) => {
                                  const isCurrent = (host.group_name || '默认分组') === targetG
                                  return (
                                    <button
                                      key={targetG}
                                      disabled={isCurrent}
                                      onClick={() => {
                                        onMoveHost(host.id, targetG)
                                        setActiveMoveMenuHostId(null)
                                      }}
                                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-left transition ${
                                        isCurrent
                                          ? 'text-slate-400 dark:text-gray-500 bg-slate-100 dark:bg-black/20 cursor-not-allowed'
                                          : 'text-slate-700 dark:text-gray-300 hover:bg-cyan-50 dark:hover:bg-cyan-600/20 hover:text-cyan-700 dark:hover:text-cyan-300'
                                      }`}
                                    >
                                      <span className="truncate">{targetG}</span>
                                      {isCurrent && (
                                        <span className="text-[10px] text-slate-400 dark:text-gray-500">当前</span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                              <button
                                onClick={() => {
                                  const customName = prompt('输入新分组名称并移动该主机：')
                                  if (customName && customName.trim()) {
                                    onMoveHost(host.id, customName.trim())
                                    setActiveMoveMenuHostId(null)
                                  }
                                }}
                                className="w-full text-left px-2 py-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:bg-slate-100 dark:hover:bg-[#262c36] rounded font-medium border-t border-slate-200 dark:border-[#30363d] mt-1"
                              >
                                + 移入新建分组...
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部安全状态条 */}
      <div className="p-2.5 border-t border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[11px] text-slate-500 dark:text-gray-400 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <ShieldCheck size={14} className="text-emerald-500 dark:text-emerald-400" />
          <span>三级安全审计已开启</span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">v1.0.7</span>
      </div>
    </aside>
  )
}
