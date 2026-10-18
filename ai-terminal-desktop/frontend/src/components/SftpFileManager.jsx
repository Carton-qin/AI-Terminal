import React, { useEffect, useState, useRef, useMemo } from 'react'
import {
  Folder,
  FolderPlus,
  File,
  FileText,
  FileCode,
  Download,
  Upload,
  Trash2,
  Edit3,
  RefreshCw,
  ArrowUp,
  Home,
  Search,
  X,
  Check,
  AlertCircle,
  FilePlus,
  Maximize2,
  Minimize2,
  HardDrive,
  Save,
  Compass,
  Link2,
  Archive,
  Layers,
  Lock,
  Terminal as TerminalIcon,
  Flame,
  ChevronRight,
  Bookmark,
} from 'lucide-react'

// 判断是否为压缩包
const isArchiveFile = (name = '') => {
  const n = name.toLowerCase()
  return (
    n.endsWith('.zip') ||
    n.endsWith('.tar.gz') ||
    n.endsWith('.tgz') ||
    n.endsWith('.tar.bz2') ||
    n.endsWith('.tar.xz') ||
    n.endsWith('.tar') ||
    n.endsWith('.gz')
  )
}

// 文件图标判定
const getFileIcon = (item) => {
  if (item.is_dir) {
    return <Folder size={15} className="text-amber-400 shrink-0" />
  }
  const name = item.name.toLowerCase()
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh')) {
    return <FileCode size={15} className="text-emerald-400 shrink-0" />
  }
  if (
    name.endsWith('.conf') ||
    name.endsWith('.json') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml') ||
    name.endsWith('.toml') ||
    name.endsWith('.ini') ||
    name.endsWith('.env')
  ) {
    return <FileCode size={15} className="text-cyan-400 shrink-0" />
  }
  if (isArchiveFile(name)) {
    return <Archive size={15} className="text-purple-400 shrink-0" />
  }
  if (name.endsWith('.txt') || name.endsWith('.log') || name.endsWith('.md')) {
    return <FileText size={15} className="text-blue-400 shrink-0" />
  }
  return <File size={15} className="text-gray-400 shrink-0" />
}

export default function SftpFileManager({
  activeTab,
  visible = true,
  terminalCwd,
  onNavigateTerminal,
  onClose,
}) {
  const [currentPath, setCurrentPath] = useState('.')
  const [parentPath, setParentPath] = useState('/')
  const [pathInput, setPathInput] = useState('.')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // 路径面包屑与直接输入模式切换
  const [isEditingPath, setIsEditingPath] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)

  // 常用 Linux 运维快捷书签
  const COMMON_BOOKMARKS = [
    { name: '用户主目录 (~)', path: '~' },
    { name: '系统根目录 (/)', path: '/' },
    { name: 'root 用户家目录 (/root)', path: '/root' },
    { name: '系统核心配置 (/etc)', path: '/etc' },
    { name: '系统与服务日志 (/var/log)', path: '/var/log' },
    { name: 'Web网站主目录 (/var/www)', path: '/var/www' },
    { name: '应用程序目录 (/opt)', path: '/opt' },
    { name: '临时文件目录 (/tmp)', path: '/tmp' },
  ]

  // 面包屑路径分段解析
  const pathBreadcrumbs = useMemo(() => {
    if (!currentPath || currentPath === '.') return [{ label: '.', path: '.' }]
    if (currentPath === '~') return [{ label: '~', path: '~' }]

    const parts = currentPath.split('/').filter(Boolean)
    const result = [{ label: '/', path: '/' }]
    let accumulated = ''
    parts.forEach((part) => {
      accumulated += '/' + part
      result.push({ label: part, path: accumulated })
    })
    return result
  }, [currentPath])

  // 搜索与大文件扫描模式: 'local' (本地过滤) | 'recursive' (递归检索) | 'big_files' (大文件)
  const [searchMode, setSearchMode] = useState('local')
  const [searchQuery, setSearchQuery] = useState('')
  const [customResults, setCustomResults] = useState(null) // 搜索或大文件扫描的额外结果

  // 跟随终端当前工作目录联动开关 (默认开启)
  const [followTerminal, setFollowTerminal] = useState(() => {
    const saved = localStorage.getItem('aiterm_sftp_follow_terminal')
    return saved !== null ? saved === 'true' : true
  })

  // 拖拽上传与进度状态
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingStatus, setUploadingStatus] = useState(null)
  const fileInputRef = useRef(null)

  // 面板高度拖拽调节
  const [panelHeight, setPanelHeight] = useState(() => {
    return Number(localStorage.getItem('aiterm_sftp_panel_height')) || 280
  })
  const isResizingRef = useRef(false)
  const startYRef = useRef(0)
  const startHRef = useRef(280)

  // 在线编辑文件弹窗
  const [editorFile, setEditorFile] = useState(null)

  // 基础模态框 (新建文件夹 / 重命名 / 删除)
  const [mkdirModalOpen, setMkdirModalOpen] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameItem, setRenameItem] = useState(null)
  const [renameNewName, setRenameNewName] = useState('')
  const [deleteItemModal, setDeleteItemModal] = useState(null)

  // 进阶功能模态框: 解压缩 / 压缩 / 权限修改 (Chmod)
  const [extractModal, setExtractModal] = useState(null) // item
  const [compressModal, setCompressModal] = useState(null) // { item, name, type }
  const [chmodModal, setChmodModal] = useState(null) // { item, mode, recursive }

  // 切换会话或初次挂载时读取文件列表
  useEffect(() => {
    if (!activeTab?.sessionId || !visible) return
    const initialTarget = terminalCwd || (activeTab.type === 'ssh' ? '~' : '.')
    loadDirectory(initialTarget)
  }, [activeTab?.sessionId, visible])

  // 终端 cd 导致 terminalCwd 变化时，如果开启了跟随模式，全自动同步刷新
  useEffect(() => {
    if (!followTerminal || !terminalCwd || !activeTab?.sessionId || !visible) return
    if (terminalCwd !== currentPath) {
      loadDirectory(terminalCwd)
    }
  }, [terminalCwd, followTerminal])

  const loadDirectory = async (targetPath = '.') => {
    if (!activeTab?.sessionId) return
    setLoading(true)
    setErrorMsg(null)
    setCustomResults(null)
    try {
      const cleanTarget = targetPath || '.'
      const res = await fetch(
        `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files?path=${encodeURIComponent(cleanTarget)}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '读取目录失败')
      }
      const data = await res.json()
      setCurrentPath(data.current_path)
      setParentPath(data.parent_path)
      setPathInput(data.current_path)
      setItems(data.items || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 导航到指定路径
  const handleNavigate = (e) => {
    e.preventDefault()
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim())
    }
  }

  // 执行全盘递归搜索
  const handleRecursiveSearch = async () => {
    if (!searchQuery.trim() || !activeTab?.sessionId) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/search?path=${encodeURIComponent(currentPath)}&query=${encodeURIComponent(searchQuery.trim())}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '递归检索失败')
      }
      const data = await res.json()
      setCustomResults(data.results || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 执行大文件扫描 (>50MB)
  const handleScanBigFiles = async () => {
    if (!activeTab?.sessionId) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/big_files?path=${encodeURIComponent(currentPath)}&min_size_mb=50`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '大文件扫描失败')
      }
      const data = await res.json()
      setCustomResults(data.results || [])
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 双击列表项
  const handleItemDoubleClick = (item) => {
    if (item.is_dir) {
      const sep = currentPath.endsWith('/') ? '' : '/'
      const nextPath = item.path || `${currentPath}${sep}${item.name}`
      loadDirectory(nextPath)
    } else {
      openFileEditor(item)
    }
  }

  // 打开在线文本查看/编辑器
  const openFileEditor = async (item) => {
    if (!activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const fullPath = item.path || `${currentPath}${sep}${item.name}`
    setLoading(true)
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/text?path=${encodeURIComponent(fullPath)}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '打开文件失败')
      }
      const data = await res.json()
      setEditorFile({
        path: fullPath,
        name: item.name,
        content: data.content,
        originalContent: data.content,
        saving: false,
      })
    } catch (err) {
      alert(`无法在线预览该文件: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 保存文本文件
  const handleSaveEditorFile = async () => {
    if (!editorFile || !activeTab?.sessionId) return
    setEditorFile((prev) => ({ ...prev, saving: true }))
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editorFile.path,
          content: editorFile.content,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '保存文件失败')
      }
      setEditorFile((prev) => ({
        ...prev,
        saving: false,
        originalContent: prev.content,
      }))
    } catch (err) {
      alert(`保存失败: ${err.message}`)
      setEditorFile((prev) => ({ ...prev, saving: false }))
    }
  }

  // 下载文件
  const handleDownload = (item) => {
    if (!activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const fullPath = item.path || `${currentPath}${sep}${item.name}`
    const downloadUrl = `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/download?path=${encodeURIComponent(fullPath)}`

    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // 上传文件处理
  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0 || !activeTab?.sessionId) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const sep = currentPath.endsWith('/') ? '' : '/'
      const remoteTargetPath = `${currentPath}${sep}${file.name}`
      setUploadingStatus(`正在上传: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`)

      try {
        const res = await fetch(
          `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/upload?path=${encodeURIComponent(remoteTargetPath)}`,
          {
            method: 'POST',
            body: file,
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || '上传写入失败')
        }
      } catch (err) {
        alert(`上传 ${file.name} 失败: ${err.message}`)
      }
    }
    setUploadingStatus(null)
    loadDirectory(currentPath)
  }

  // 一键解压文件
  const handleConfirmExtract = async () => {
    if (!extractModal || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const fullPath = extractModal.path || `${currentPath}${sep}${extractModal.name}`
    setLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, target_dir: currentPath }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '解压失败')
      }
      setExtractModal(null)
      loadDirectory(currentPath)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 一键压缩文件/目录
  const handleConfirmCompress = async () => {
    if (!compressModal || !compressModal.name.trim() || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const itemPath = compressModal.item.path || `${currentPath}${sep}${compressModal.item.name}`
    const archivePath = `${currentPath}${sep}${compressModal.name.trim()}`
    setLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: [itemPath],
          archive_name: archivePath,
          archive_type: compressModal.type || 'tar.gz',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '压缩失败')
      }
      setCompressModal(null)
      loadDirectory(currentPath)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 修改文件权限 (Chmod)
  const handleConfirmChmod = async () => {
    if (!chmodModal || !chmodModal.mode || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const targetPath = chmodModal.item.path || `${currentPath}${sep}${chmodModal.item.name}`
    setLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/chmod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          mode: chmodModal.mode,
          recursive: chmodModal.recursive,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '修改权限失败')
      }
      setChmodModal(null)
      loadDirectory(currentPath)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 新建文件夹
  const handleCreateDir = async () => {
    if (!newDirName.trim() || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const targetPath = `${currentPath}${sep}${newDirName.trim()}`
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '创建目录失败')
      }
      setMkdirModalOpen(false)
      setNewDirName('')
      loadDirectory(currentPath)
    } catch (err) {
      alert(`创建目录失败: ${err.message}`)
    }
  }

  // 重命名
  const handleRename = async () => {
    if (!renameItem || !renameNewName.trim() || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const oldPath = `${currentPath}${sep}${renameItem.name}`
    const newPath = `${currentPath}${sep}${renameNewName.trim()}`
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '重命名失败')
      }
      setRenameModalOpen(false)
      setRenameItem(null)
      setRenameNewName('')
      loadDirectory(currentPath)
    } catch (err) {
      alert(`重命名失败: ${err.message}`)
    }
  }

  // 删除文件/文件夹
  const handleDelete = async () => {
    if (!deleteItemModal || !activeTab?.sessionId) return
    const sep = currentPath.endsWith('/') ? '' : '/'
    const targetPath = deleteItemModal.path || `${currentPath}${sep}${deleteItemModal.name}`
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/session/${activeTab.sessionId}/files?path=${encodeURIComponent(targetPath)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '删除失败')
      }
      setDeleteItemModal(null)
      loadDirectory(currentPath)
    } catch (err) {
      alert(`删除失败: ${err.message}`)
    }
  }

  // 拖拽调节面板高度
  const handleMouseDownResize = (e) => {
    isResizingRef.current = true
    startYRef.current = e.clientY
    startHRef.current = panelHeight
    document.addEventListener('mousemove', handleMouseMoveResize)
    document.addEventListener('mouseup', handleMouseUpResize)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  const handleMouseMoveResize = (e) => {
    if (!isResizingRef.current) return
    const deltaY = startYRef.current - e.clientY
    const newHeight = Math.max(140, Math.min(650, startHRef.current + deltaY))
    setPanelHeight(newHeight)
  }

  const handleMouseUpResize = () => {
    isResizingRef.current = false
    document.removeEventListener('mousemove', handleMouseMoveResize)
    document.removeEventListener('mouseup', handleMouseUpResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem('aiterm_sftp_panel_height', panelHeight)
  }

  if (!visible || !activeTab) return null

  // 显示的列表项：如果是递归/大文件搜索结果则显示结果，否则过滤当前目录
  const displayItems = customResults
    ? customResults
    : items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div
      style={{ height: `${panelHeight}px` }}
      className="bg-white dark:bg-[#12161f] border-t border-slate-200 dark:border-[#30363d] flex flex-col select-none relative shrink-0 transition-[height] duration-75 text-slate-800 dark:text-gray-200"
    >
      {/* 拖拽调节高度把手 */}
      <div
        onMouseDown={handleMouseDownResize}
        className="h-1.5 w-full bg-slate-200 dark:bg-[#1b2230] hover:bg-cyan-500/60 cursor-ns-resize flex items-center justify-center transition-colors group"
        title="拖动调整文件管理面板高度"
      >
        <div className="w-12 h-1 bg-slate-400 dark:bg-gray-600 rounded-full group-hover:bg-cyan-300"></div>
      </div>

      {/* 1. 工具栏与路径导航 */}
      <div className="h-9 px-3 border-b border-slate-200 dark:border-[#30363d]/60 bg-slate-50 dark:bg-[#161c28] flex items-center justify-between space-x-2 text-xs">
        {/* 左侧路径操作按钮组 */}
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => loadDirectory(parentPath)}
            disabled={currentPath === '/' || loading}
            className="p-1 rounded text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
            title="返回上一级目录"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => loadDirectory('~')}
            className="p-1 rounded text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition"
            title="用户主目录 (~)"
          >
            <Home size={14} />
          </button>
          <button
            onClick={() => loadDirectory('/')}
            className="p-1 rounded text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition font-mono font-bold"
            title="根目录 (/)"
          >
            /
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            className="p-1 rounded text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition"
            title="刷新目录"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-cyan-500' : ''} />
          </button>
          <button
            onClick={() => loadDirectory(terminalCwd || (activeTab.type === 'ssh' ? '~' : '.'))}
            className="p-1 rounded text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 transition ml-1"
            title={`同步至终端当前目录 (${terminalCwd || '未探测'})`}
          >
            <Compass size={14} />
          </button>
          <button
            onClick={() => {
              const next = !followTerminal
              setFollowTerminal(next)
              localStorage.setItem('aiterm_sftp_follow_terminal', next)
              if (next && terminalCwd && terminalCwd !== currentPath) {
                loadDirectory(terminalCwd)
              }
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center space-x-1 border transition ml-1 ${
              followTerminal
                ? 'bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700/60 shadow-xs'
                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-gray-400 border-slate-300 dark:border-white/10 hover:text-slate-800 dark:hover:text-gray-200'
            }`}
            title="开启后，在终端中输入 cd 切换目录时，文件管理器全自动同步跟随跳转"
          >
            <Link2 size={11} className={followTerminal ? 'text-cyan-600 dark:text-cyan-400' : ''} />
            <span>跟随终端 {followTerminal ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* 中间：路径面包屑与直接输入模式切换 */}
        <div className="flex-1 max-w-xl mx-2 flex items-center space-x-1 min-w-0">
          {isEditingPath ? (
            <form
              onSubmit={(e) => {
                handleNavigate(e)
                setIsEditingPath(false)
              }}
              className="flex-1"
            >
              <input
                type="text"
                autoFocus
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onBlur={() => setIsEditingPath(false)}
                className="w-full bg-white dark:bg-[#0d1117] border border-cyan-500 rounded px-2.5 py-1 text-xs text-slate-800 dark:text-gray-200 font-mono focus:outline-none shadow-2xs"
                placeholder="输入路径按回车..."
              />
            </form>
          ) : (
            <div
              onClick={() => setIsEditingPath(true)}
              className="flex-1 flex items-center space-x-1 bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-2 py-0.5 text-xs text-slate-800 dark:text-gray-200 font-mono overflow-x-auto no-scrollbar shadow-2xs cursor-text group"
              title="点击输入任意路径"
            >
              <div className="flex items-center space-x-0.5 truncate">
                {pathBreadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.path}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        loadDirectory(crumb.path)
                      }}
                      className="px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 hover:text-cyan-600 dark:hover:text-cyan-400 font-medium transition text-slate-700 dark:text-gray-300"
                    >
                      {crumb.label}
                    </button>
                    {idx < pathBreadcrumbs.length - 1 && (
                      <ChevronRight size={11} className="text-slate-400 dark:text-gray-600 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <span className="opacity-0 group-hover:opacity-100 text-[10px] text-cyan-600 dark:text-cyan-400 font-sans ml-auto shrink-0 pl-1">
                编辑
              </span>
            </div>
          )}

          {/* 常用书签快捷直达 */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowBookmarks(!showBookmarks)}
              className={`p-1 rounded border transition ${
                showBookmarks
                  ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                  : 'bg-white dark:bg-white/5 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:text-slate-800 dark:hover:text-gray-200'
              }`}
              title="常用目录快速直达"
            >
              <Bookmark size={13} />
            </button>
            {showBookmarks && (
              <div className="absolute left-0 top-7 z-30 w-52 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 dark:text-gray-500 border-b border-slate-200 dark:border-[#30363d] uppercase tracking-wider">
                  常用目录直达
                </div>
                {COMMON_BOOKMARKS.map((bm) => (
                  <button
                    key={bm.path}
                    onClick={() => {
                      loadDirectory(bm.path)
                      setShowBookmarks(false)
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-cyan-50 dark:hover:bg-cyan-950/60 text-slate-700 dark:text-gray-300 hover:text-cyan-700 dark:hover:text-cyan-300 flex items-center justify-between transition"
                  >
                    <span className="truncate">{bm.name}</span>
                    <span className="font-mono text-[10px] text-slate-400 dark:text-gray-500">{bm.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：搜索检索模式与操作按钮 */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* 搜索模式下拉与输入 */}
          <div className="flex items-center space-x-1 bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-1.5 py-0.5 shadow-2xs">
            <select
              value={searchMode}
              onChange={(e) => {
                setSearchMode(e.target.value)
                if (e.target.value === 'big_files') {
                  handleScanBigFiles()
                } else if (e.target.value === 'local') {
                  setCustomResults(null)
                }
              }}
              className="bg-transparent text-[10px] text-slate-700 dark:text-gray-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="local" className="bg-white dark:bg-[#161c28]">过滤本级</option>
              <option value="recursive" className="bg-white dark:bg-[#161c28]">递归检索 (find)</option>
              <option value="big_files" className="bg-white dark:bg-[#161c28]">扫描大文件 (&gt;50M)</option>
            </select>
            {searchMode !== 'big_files' && (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchMode === 'recursive') {
                    handleRecursiveSearch()
                  }
                }}
                placeholder={searchMode === 'recursive' ? '回车全局搜索...' : '过滤...'}
                className="w-20 focus:w-32 bg-transparent text-[11px] text-slate-800 dark:text-gray-200 focus:outline-none"
              />
            )}
            {customResults && (
              <button
                onClick={() => {
                  setCustomResults(null)
                  setSearchQuery('')
                }}
                className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white ml-1"
                title="清除搜索结果返回正常目录"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* 新建目录 */}
          <button
            onClick={() => setMkdirModalOpen(true)}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-200 flex items-center space-x-1 text-[11px] border border-slate-200 dark:border-white/10 transition shadow-2xs"
            title="在当前目录新建文件夹"
          >
            <FolderPlus size={13} className="text-amber-500 dark:text-amber-400" />
            <span>新建</span>
          </button>

          {/* 上传文件 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1 text-[11px] transition shadow-xs font-medium"
            title="上传本地文件到当前目录 (也支持直接拖拽文件进列表)"
          >
            <Upload size={13} />
            <span>上传</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUploadFiles(e.target.files)}
          />

          {/* 关闭面板 */}
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 rounded transition ml-1"
            title="隐藏文件管理面板"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 上传中横幅状态 */}
      {uploadingStatus && (
        <div className="bg-blue-50 dark:bg-blue-950/80 border-b border-blue-200 dark:border-blue-500/30 px-3 py-1 flex items-center justify-between text-xs text-blue-800 dark:text-blue-200">
          <div className="flex items-center space-x-2">
            <Upload size={13} className="animate-bounce text-blue-600 dark:text-blue-400" />
            <span>{uploadingStatus}</span>
          </div>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">传输中...</span>
        </div>
      )}

      {/* 特殊检索结果提示 */}
      {customResults && (
        <div className="bg-cyan-50 dark:bg-cyan-950/40 border-b border-cyan-200 dark:border-cyan-500/20 px-3 py-1 flex items-center justify-between text-[11px] text-cyan-800 dark:text-cyan-300">
          <span>
            {searchMode === 'big_files'
              ? `🔥 大文件扫描结果 (已列出大于 50MB 的 ${customResults.length} 个文件)`
              : `🔍 递归检索结果 (共找到 ${customResults.length} 条匹配文件)`}
          </span>
          <button
            onClick={() => setCustomResults(null)}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white underline font-medium"
          >
            退出检索
          </button>
        </div>
      )}

      {/* 2. 文件列表视口 (支持拖拽上传) */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUploadFiles(e.dataTransfer.files)
          }
        }}
        className={`flex-1 overflow-auto relative ${
          isDragging ? 'bg-blue-950/30 border-2 border-dashed border-blue-500' : ''
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-blue-950/60 pointer-events-none">
            <Upload size={36} className="text-blue-400 mb-2 animate-bounce" />
            <p className="text-sm font-semibold text-blue-200">松开鼠标即可上传至当前目录</p>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 text-center text-xs text-red-400 flex items-center justify-center space-x-1.5">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {!errorMsg && (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-[#161c28] text-slate-600 dark:text-gray-400 text-[11px] border-b border-slate-200 dark:border-[#30363d]/80 select-none z-10 shadow-xs">
              <tr>
                <th className="py-1.5 px-3 font-normal">名称</th>
                <th className="py-1.5 px-2 font-normal w-28">大小</th>
                <th className="py-1.5 px-2 font-normal w-16">权限</th>
                <th className="py-1.5 px-2 font-normal w-36">修改时间</th>
                <th className="py-1.5 px-3 font-normal w-36 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-[11px]">
              {/* 返回上一级快捷行 (非搜索模式下显示) */}
              {!customResults && currentPath !== '/' && (
                <tr
                  onDoubleClick={() => loadDirectory(parentPath)}
                  className="hover:bg-slate-100/80 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-gray-400 transition"
                >
                  <td colSpan={5} className="py-1.5 px-3 flex items-center space-x-2">
                    <Folder size={15} className="text-amber-500 dark:text-amber-400/80" />
                    <span className="font-sans">.. (返回上一级)</span>
                  </td>
                </tr>
              )}

              {displayItems.map((item) => {
                const isBig =
                  item.size && item.size > 50 * 1024 * 1024
                const isHuge =
                  item.size && item.size > 500 * 1024 * 1024

                return (
                  <tr
                    key={item.path || item.name}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    className="hover:bg-slate-100/80 dark:hover:bg-[#1a2233] cursor-pointer group text-slate-700 dark:text-gray-300 transition"
                  >
                    <td className="py-1 px-3 flex items-center space-x-2 truncate">
                      {getFileIcon(item)}
                      <span
                        className={`truncate ${
                          item.is_dir ? 'text-slate-900 dark:text-gray-100 font-medium' : 'text-slate-700 dark:text-gray-300'
                        }`}
                        title={item.path || item.name}
                      >
                        {item.name}
                      </span>
                      {/* 大文件高亮标签 */}
                      {isHuge ? (
                        <span className="px-1.5 py-0.2 text-[9px] rounded bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-600/40 shrink-0 font-sans">
                          超大文件
                        </span>
                      ) : isBig ? (
                        <span className="px-1.5 py-0.2 text-[9px] rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600/40 shrink-0 font-sans">
                          大文件
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1 px-2 text-slate-500 dark:text-gray-400">{item.size_str}</td>
                    {/* 权限标签（点击即可唤起九宫格可视化权限修改） */}
                    <td className="py-1 px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setChmodModal({
                            item,
                            mode: item.permissions || '755',
                            recursive: false,
                          })
                        }}
                        className="text-[10px] text-slate-500 dark:text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-300 hover:underline px-1 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/5 transition"
                        title="点击快速修改权限"
                      >
                        {item.permissions || '--'}
                      </button>
                    </td>
                    <td className="py-1 px-2 text-slate-500 dark:text-gray-400">{item.mtime_str || '--'}</td>
                    <td className="py-1 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* 在终端中 cd 进入此文件夹 */}
                        {item.is_dir && onNavigateTerminal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const sep = currentPath.endsWith('/') ? '' : '/'
                              onNavigateTerminal(item.path || `${currentPath}${sep}${item.name}`)
                            }}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400"
                            title="在终端中输入 cd 进入此文件夹"
                          >
                            <TerminalIcon size={13} />
                          </button>
                        )}

                        {/* 一键解压缩 (针对压缩包) */}
                        {isArchiveFile(item.name) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExtractModal(item)
                            }}
                            className="p-1 rounded hover:bg-purple-100 dark:hover:bg-white/10 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                            title="解压到当前目录"
                          >
                            <Archive size={13} />
                          </button>
                        )}

                        {/* 压缩文件或目录 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCompressModal({
                              item,
                              name: `${item.name}.tar.gz`,
                              type: 'tar.gz',
                            })
                          }}
                          className="p-1 rounded hover:bg-amber-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"
                          title="压缩为..."
                        >
                          <Layers size={13} />
                        </button>

                        {/* 下载文件 */}
                        {!item.is_dir && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownload(item)
                            }}
                            className="p-1 rounded hover:bg-cyan-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400"
                            title="下载到本地"
                          >
                            <Download size={13} />
                          </button>
                        )}

                        {/* 在线编辑查看 */}
                        {!item.is_dir && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openFileEditor(item)
                            }}
                            className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                            title="在线查看 / 编辑"
                          >
                            <Edit3 size={13} />
                          </button>
                        )}

                        {/* 重命名 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenameItem(item)
                            setRenameNewName(item.name)
                            setRenameModalOpen(true)
                          }}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400"
                          title="重命名"
                        >
                          <Edit3 size={13} />
                        </button>

                        {/* 删除 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteItemModal(item)
                          }}
                          className="p-1 rounded hover:bg-rose-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-300 hover:text-rose-600 dark:hover:text-red-400"
                          title="删除"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {displayItems.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-400 dark:text-gray-500 font-sans">
                    {customResults ? '没有找到符合条件的文件' : '当前目录下为空'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. 在线文本编辑器全屏 / 弹窗 */}
      {editorFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-10 bg-slate-100 dark:bg-[#0d1117] border-b border-slate-200 dark:border-[#30363d] px-4 flex items-center justify-between text-xs select-none">
              <div className="flex items-center space-x-2">
                <FileCode size={16} className="text-cyan-500 dark:text-cyan-400" />
                <span className="font-semibold text-slate-800 dark:text-gray-200 font-mono">{editorFile.name}</span>
                <span className="text-[11px] text-slate-500 dark:text-gray-500 font-mono truncate max-w-md">
                  ({editorFile.path})
                </span>
                {editorFile.content !== editorFile.originalContent && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="有未保存的修改"></span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-slate-500 dark:text-gray-400">Ctrl+S / ⌘S 快速保存</span>
                <button
                  onClick={handleSaveEditorFile}
                  disabled={editorFile.saving || editorFile.content === editorFile.originalContent}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{editorFile.saving ? '保存中...' : '保存'}</span>
                </button>
                <button
                  onClick={() => {
                    if (
                      editorFile.content !== editorFile.originalContent &&
                      !confirm('有未保存的修改，确定关闭吗？')
                    ) {
                      return
                    }
                    setEditorFile(null)
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 rounded transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 relative bg-slate-900 dark:bg-[#090d13] p-2 overflow-hidden flex flex-col">
              <textarea
                value={editorFile.content}
                onChange={(e) =>
                  setEditorFile((prev) => ({ ...prev, content: e.target.value }))
                }
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault()
                    handleSaveEditorFile()
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const { selectionStart, selectionEnd, value } = e.target
                    const newValue =
                      value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd)
                    setEditorFile((prev) => ({ ...prev, content: newValue }))
                    setTimeout(() => {
                      e.target.selectionStart = e.target.selectionEnd = selectionStart + 2
                    }, 0)
                  }
                }}
                className="flex-1 w-full h-full bg-transparent text-gray-100 font-mono text-xs leading-relaxed p-2 resize-none focus:outline-none"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. 新建文件夹模态框 */}
      {mkdirModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg p-4 w-80 shadow-xl">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-gray-200 mb-2 flex items-center space-x-1.5">
              <FolderPlus size={14} className="text-amber-500 dark:text-amber-400" />
              <span>新建文件夹</span>
            </h3>
            <input
              type="text"
              autoFocus
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDir()}
              placeholder="文件夹名称..."
              className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-cyan-500 mb-3"
            />
            <div className="flex justify-end space-x-2 text-xs">
              <button
                onClick={() => setMkdirModalOpen(false)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleCreateDir}
                className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 权限修改 (Chmod) 可视化模态框 */}
      {chmodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg p-4 w-96 shadow-xl text-xs">
            <h3 className="font-semibold text-slate-800 dark:text-gray-200 mb-2 flex items-center space-x-1.5">
              <Lock size={14} className="text-cyan-500 dark:text-cyan-400" />
              <span>修改文件权限 (Chmod)</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-3 font-mono truncate">
              {chmodModal.item.name}
            </p>

            {/* 常用预设快捷按钮 */}
            <div className="mb-3">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 block mb-1">常用权限预设：</span>
              <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                {['755', '644', '600', '777'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setChmodModal((prev) => ({ ...prev, mode: p }))}
                    className={`py-1 rounded border transition font-mono ${
                      chmodModal.mode === p
                        ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border-cyan-500 font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 border-slate-200 dark:border-white/5 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="text-[10px] text-slate-500 dark:text-gray-400 block mb-1">权限数值 (八进制)：</label>
              <input
                type="text"
                value={chmodModal.mode}
                onChange={(e) =>
                  setChmodModal((prev) => ({ ...prev, mode: e.target.value }))
                }
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-gray-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {chmodModal.item.is_dir && (
              <label className="flex items-center space-x-2 text-[11px] text-slate-700 dark:text-gray-300 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chmodModal.recursive}
                  onChange={(e) =>
                    setChmodModal((prev) => ({ ...prev, recursive: e.target.checked }))
                  }
                  className="rounded border-slate-300 dark:border-[#30363d]"
                />
                <span>递归应用到所有子文件与子目录 (-R)</span>
              </label>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setChmodModal(null)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmChmod}
                className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 解压缩确认模态框 */}
      {extractModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-purple-300 dark:border-purple-500/40 rounded-lg p-4 w-88 shadow-xl text-xs">
            <h3 className="font-semibold text-purple-600 dark:text-purple-400 mb-2 flex items-center space-x-1.5">
              <Archive size={14} />
              <span>一键解压缩</span>
            </h3>
            <p className="text-slate-700 dark:text-gray-300 mb-2">
              确定将压缩包 <span className="font-mono text-slate-900 dark:text-white font-bold">{extractModal.name}</span> 解压到当前目录吗？
            </p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-4 font-mono truncate">
              目标路径: {currentPath}
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setExtractModal(null)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmExtract}
                className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
              >
                立即解压
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 压缩为模态框 */}
      {compressModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg p-4 w-96 shadow-xl text-xs">
            <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center space-x-1.5">
              <Layers size={14} />
              <span>打包压缩</span>
            </h3>
            <p className="text-slate-700 dark:text-gray-300 mb-2">
              将选中的目标 <span className="font-mono text-slate-900 dark:text-white font-bold">{compressModal.item.name}</span> 压缩为归档文件：
            </p>
            <div className="mb-3">
              <label className="text-[10px] text-slate-500 dark:text-gray-400 block mb-1">压缩文件名：</label>
              <input
                type="text"
                autoFocus
                value={compressModal.name}
                onChange={(e) =>
                  setCompressModal((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-gray-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setCompressModal(null)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCompress}
                className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
              >
                开始压缩
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. 重命名模态框 */}
      {renameModalOpen && renameItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg p-4 w-80 shadow-xl">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-gray-200 mb-2 flex items-center space-x-1.5">
              <Edit3 size={14} className="text-amber-500 dark:text-amber-400" />
              <span>重命名</span>
            </h3>
            <input
              type="text"
              autoFocus
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-cyan-500 mb-3"
            />
            <div className="flex justify-end space-x-2 text-xs">
              <button
                onClick={() => setRenameModalOpen(false)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleRename}
                className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
              >
                确认重命名
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. 删除确认模态框 */}
      {deleteItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-red-300 dark:border-red-500/40 rounded-lg p-4 w-80 shadow-xl">
            <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center space-x-1.5">
              <Trash2 size={14} />
              <span>确认删除</span>
            </h3>
            <p className="text-xs text-slate-700 dark:text-gray-300 mb-4 break-all">
              确定要永久删除{' '}
              <span className="font-mono text-slate-900 dark:text-white font-bold">{deleteItemModal.name}</span> 吗？
              {deleteItemModal.is_dir && '（包含目录下所有文件）'}
            </p>
            <div className="flex justify-end space-x-2 text-xs">
              <button
                onClick={() => setDeleteItemModal(null)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] text-slate-700 dark:text-gray-300 dark:hover:bg-[#30363d]"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
