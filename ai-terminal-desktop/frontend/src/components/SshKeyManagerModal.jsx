import React, { useState, useEffect } from 'react'
import {
  X,
  Key,
  Plus,
  Trash2,
  Download,
  Copy,
  Check,
  Server,
  Send,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

export default function SshKeyManagerModal({
  isOpen,
  onClose,
  hosts = [],
  onRefreshHosts,
}) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copiedKeyId, setCopiedKeyId] = useState(null)

  // 生成新密钥表单状态
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyType, setNewKeyType] = useState('ed25519')
  const [generating, setGenerating] = useState(false)

  // 部署到 VPS 状态
  const [deployingKeyId, setDeployingKeyId] = useState(null)
  const [selectedHostId, setSelectedHostId] = useState('')
  const [deployLoading, setDeployLoading] = useState(false)
  const [deploySuccess, setDeploySuccess] = useState('')

  const fetchKeys = async () => {
    try {
      setLoading(true)
      setErrorMsg('')
      const res = await fetch('http://127.0.0.1:8765/api/keys')
      if (!res.ok) {
        throw new Error('获取 SSH 密钥列表失败')
      }
      const data = await res.json()
      setKeys(data)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchKeys()
      setShowGenerateForm(false)
      setDeployingKeyId(null)
      setDeploySuccess('')
    }
  }, [isOpen])

  // 生成新密钥
  const handleGenerateKey = async (e) => {
    e.preventDefault()
    if (!newKeyName.trim()) {
      alert('请输入密钥名称')
      return
    }
    try {
      setGenerating(true)
      const res = await fetch('http://127.0.0.1:8765/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          key_type: newKeyType,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '生成密钥失败')
      }
      setNewKeyName('')
      setShowGenerateForm(false)
      await fetchKeys()
    } catch (err) {
      alert(`生成失败: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // 复制公钥
  const handleCopyPublicKey = (key) => {
    navigator.clipboard.writeText(key.public_key)
    setCopiedKeyId(key.id)
    setTimeout(() => setCopiedKeyId(null), 2000)
  }

  // 下载私钥
  const handleDownloadPrivateKey = async (key) => {
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/keys/${key.id}/private`)
      if (!res.ok) {
        throw new Error('下载私钥失败')
      }
      const data = await res.json()
      const blob = new Blob([data.private_key], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `id_${key.key_type}_${key.name.replace(/\s+/g, '_')}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`下载失败: ${err.message}`)
    }
  }

  // 删除密钥
  const handleDeleteKey = async (key) => {
    if (!confirm(`确定要删除密钥 "${key.name}" 吗？注意：这不会从已部署的 VPS 中移除公钥。`)) {
      return
    }
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/keys/${key.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('删除密钥失败')
      }
      await fetchKeys()
    } catch (err) {
      alert(`删除失败: ${err.message}`)
    }
  }

  // 一键部署到 VPS
  const handleDeployToHost = async (keyId) => {
    if (!selectedHostId) {
      alert('请先选择要部署的目标 VPS 服务器')
      return
    }
    try {
      setDeployLoading(true)
      setDeploySuccess('')
      const res = await fetch('http://127.0.0.1:8765/api/keys/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_id: keyId,
          host_id: selectedHostId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '部署密钥失败')
      }
      const data = await res.json()
      setDeploySuccess(`部署成功！公钥已写入 ~/.ssh/authorized_keys，该主机已自动切换为免密密钥连接模式。`)
      if (onRefreshHosts) onRefreshHosts()
      setTimeout(() => {
        setDeployingKeyId(null)
        setDeploySuccess('')
      }, 4000)
    } catch (err) {
      alert(`部署失败: ${err.message}`)
    } finally {
      setDeployLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-5 bg-slate-50 dark:bg-[#0f1319] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-100 dark:bg-yellow-950/60 border border-amber-300 dark:border-yellow-700/50 rounded-lg text-amber-700 dark:text-yellow-400">
              <Key size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>SSH 密钥管理器 & 免密直连助手</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                生成高强度 Ed25519/RSA 密钥对，一键自动化部署至远端 VPS 实现免密登录与权限加固
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowGenerateForm(!showGenerateForm)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs"
            >
              <Plus size={14} />
              <span>生成新密钥对</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 生成密钥折叠表单 */}
        {showGenerateForm && (
          <form
            onSubmit={handleGenerateKey}
            className="p-4 bg-amber-50/50 dark:bg-[#12161f] border-b border-amber-200 dark:border-[#30363d] space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-700 dark:text-yellow-400 flex items-center space-x-1.5">
                <Key size={14} />
                <span>生成现代高强度 SSH 密钥对</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowGenerateForm(false)}
                className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-gray-400 mb-1">密钥名称 (标识用途)</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="例如: macbook-main-key 或 dev-deploy"
                  className="w-full bg-white dark:bg-[#1c2128] border border-slate-300 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 shadow-2xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 dark:text-gray-400 mb-1">算法类型</label>
                <select
                  value={newKeyType}
                  onChange={(e) => setNewKeyType(e.target.value)}
                  className="w-full bg-white dark:bg-[#1c2128] border border-slate-300 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 shadow-2xs"
                >
                  <option value="ed25519">Ed25519 (推荐 - 速度极快，现代最高安全性)</option>
                  <option value="rsa">RSA 4096 (经典标准，兼容极老版本 Linux)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGenerateForm(false)}
                className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded text-xs border border-slate-200 dark:border-transparent"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={generating}
                className="px-4 py-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded text-xs transition flex items-center space-x-1.5 shadow-2xs disabled:opacity-50"
              >
                {generating ? <RefreshCw size={12} className="animate-spin" /> : null}
                <span>{generating ? '正在生成密钥...' : '确认生成'}</span>
              </button>
            </div>
          </form>
        )}

        {/* 密钥列表展示区 */}
        <div className="flex-1 overflow-auto p-5 space-y-4 bg-slate-50/60 dark:bg-[#0d1117]">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-red-950/40 border border-rose-200 dark:border-red-800 text-rose-700 dark:text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle size={15} className="shrink-0 text-rose-500 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {keys.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-gray-500 space-y-2">
              <Key size={44} className="opacity-20 text-amber-500 dark:text-yellow-400" />
              <p className="text-sm font-medium text-slate-600 dark:text-gray-400">暂无生成的 SSH 密钥对</p>
              <p className="text-xs text-slate-400 dark:text-gray-600">
                点击右上角「生成新密钥对」，一键生成并在几秒内自动化部署到您的 VPS
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => {
                const isDeploying = deployingKeyId === key.id

                return (
                  <div
                    key={key.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:border-slate-300 dark:hover:border-[#484f58] transition space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-amber-100 dark:bg-yellow-950/50 border border-amber-300 dark:border-yellow-800/60 rounded-lg text-amber-700 dark:text-yellow-400">
                          <Key size={16} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{key.name}</h3>
                            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 font-mono">
                              {key.key_type}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                              {key.created_at?.slice(0, 16)}
                            </span>
                          </div>
                          {key.fingerprint && (
                            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-mono mt-0.5">
                              指纹: {key.fingerprint}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setDeployingKeyId(isDeploying ? null : key.id)
                            setDeploySuccess('')
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border shadow-2xs ${
                            isDeploying
                              ? 'bg-amber-500 text-slate-900 border-amber-400 font-bold'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-950/60 dark:hover:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700/50'
                          }`}
                          title="自动连接目标 VPS 并写入 authorized_keys"
                        >
                          <Send size={12} />
                          <span>一键部署到 VPS</span>
                        </button>

                        <button
                          onClick={() => handleDownloadPrivateKey(key)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded-lg text-xs transition border border-slate-200 dark:border-transparent"
                          title="下载私钥文件 (.pem / OpenSSH)"
                        >
                          <Download size={13} />
                        </button>

                        <button
                          onClick={() => handleDeleteKey(key)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-red-950/40 dark:hover:bg-red-900 text-rose-700 dark:text-red-300 rounded-lg text-xs transition border border-rose-200 dark:border-red-800/50"
                          title="删除此密钥"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* 公钥预览与一键复制 */}
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-700/50 font-mono text-[11px] text-slate-300 flex items-center justify-between">
                      <span className="truncate mr-3 select-all text-slate-400">
                        {key.public_key}
                      </span>
                      <button
                        onClick={() => handleCopyPublicKey(key)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded text-[10px] font-sans shrink-0 flex items-center space-x-1 transition shadow-2xs"
                      >
                        {copiedKeyId === key.id ? (
                          <>
                            <Check size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>复制公钥</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* 一键部署抽屉 */}
                    {isDeploying && (
                      <div className="p-3 bg-amber-50/60 dark:bg-[#0d1117] rounded-lg border border-amber-300 dark:border-yellow-700/50 space-y-2.5 animate-in fade-in">
                        <div className="flex items-center space-x-1.5 text-xs text-amber-800 dark:text-yellow-400 font-semibold">
                          <Server size={14} />
                          <span>选择需要免密直连的目标 VPS:</span>
                        </div>

                        {deploySuccess && (
                          <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
                            <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{deploySuccess}</span>
                          </div>
                        )}

                        <div className="flex items-center space-x-2">
                          <select
                            value={selectedHostId}
                            onChange={(e) => setSelectedHostId(e.target.value)}
                            className="flex-1 bg-white dark:bg-[#161b22] border border-slate-300 dark:border-[#30363d] text-slate-800 dark:text-gray-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500 shadow-2xs"
                          >
                            <option value="">-- 请选择要分发的服务器 --</option>
                            {hosts.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({h.ip}:{h.port || 22}) - [{h.auth_type === 'key' ? '已为密钥直连' : '密码模式'}]
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleDeployToHost(key.id)}
                            disabled={deployLoading || !selectedHostId}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg text-xs transition flex items-center space-x-1.5 disabled:opacity-50 shadow-2xs"
                          >
                            {deployLoading ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            <span>{deployLoading ? '正在部署并验证...' : '立即下发公钥'}</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-gray-500">
                          系统将使用该主机当前保存的密码登录 VPS，自动安全追加公钥至 ~/.ssh/authorized_keys，并配置 600 安全权限。
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部信息条 */}
        <div className="h-10 border-t border-slate-200 dark:border-[#30363d] px-5 bg-slate-50 dark:bg-[#0f1319] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 shrink-0">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>私钥由 SQLite 本地安全数据库隔离存储，绝不上传至任何外网云端。</span>
          </div>
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
