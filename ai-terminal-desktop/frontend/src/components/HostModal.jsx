import React, { useEffect, useState } from 'react'
import { Server, X, Shield, Key, FolderPlus } from 'lucide-react'

export default function HostModal({ isOpen, onClose, onSave, editingHost = null, groups = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    ip: '',
    port: 22,
    username: 'root',
    auth_type: 'password', // 'password' | 'key'
    secret: '',
    group_name: '默认分组',
    description: '',
  })
  const [isCustomGroup, setIsCustomGroup] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editingHost) {
      setFormData({
        name: editingHost.name || '',
        ip: editingHost.ip || '',
        port: editingHost.port || 22,
        username: editingHost.username || 'root',
        auth_type: editingHost.auth_type || 'password',
        secret: '',
        group_name: editingHost.group_name || '默认分组',
        description: editingHost.description || '',
      })
      setIsCustomGroup(false)
    } else {
      setFormData({
        name: '',
        ip: '',
        port: 22,
        username: 'root',
        auth_type: 'password',
        secret: '',
        group_name: groups.length > 0 ? groups[0].name : '默认分组',
        description: '',
      })
      setIsCustomGroup(false)
    }
  }, [editingHost, isOpen, groups])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.ip.trim()) {
      alert('请填写主机名称与 IP 地址')
      return
    }

    setLoading(true)
    try {
      await onSave(formData, editingHost ? editingHost.id : null)
      onClose()
    } catch (err) {
      alert(`保存主机失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const groupOptions = Array.from(
    new Set([...groups.map((g) => g.name), '默认分组', formData.group_name].filter(Boolean))
  )

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-800 dark:text-gray-200">
        {/* 标题 */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between bg-slate-50 dark:bg-[#0f1319]">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold text-sm">
            <Server size={17} className="text-cyan-600 dark:text-cyan-400" />
            <span>{editingHost ? '编辑 VPS 服务器' : '添加 VPS 服务器'}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">主机备注名称 *</label>
              <input
                type="text"
                placeholder="例如: Web-Server-01"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">所属分组</label>
              {!isCustomGroup ? (
                <div className="flex space-x-1">
                  <select
                    value={formData.group_name}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomGroup(true)
                        setFormData({ ...formData, group_name: '' })
                      } else {
                        setFormData({ ...formData, group_name: e.target.value })
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  >
                    {groupOptions.map((gn) => (
                      <option key={gn} value={gn}>
                        {gn}
                      </option>
                    ))}
                    <option value="__NEW__">+ 新建分组...</option>
                  </select>
                </div>
              ) : (
                <div className="flex space-x-1">
                  <input
                    type="text"
                    placeholder="输入新分组名称"
                    value={formData.group_name}
                    onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#0d1117] border border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomGroup(false)
                      setFormData({ ...formData, group_name: '默认分组' })
                    }}
                    className="px-2 bg-slate-100 dark:bg-[#21262d] text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white rounded-lg text-[10px]"
                    title="选择已有分组"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">IP 地址 / 域名 *</label>
              <input
                type="text"
                placeholder="例如: 192.168.1.100 或 vps.example.com"
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">SSH 端口</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">登录用户名</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">认证方式</label>
              <select
                value={formData.auth_type}
                onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="password">SSH 密码</option>
                <option value="key">SSH 私钥内容</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">
              {formData.auth_type === 'password'
                ? 'SSH 密码'
                : '私钥内容 (PEM / OpenSSH)'}
              {editingHost && (
                <span className="text-[10px] text-slate-400 dark:text-gray-400 font-normal ml-2">
                  (留空表示保持原有密钥不变)
                </span>
              )}
            </label>
            {formData.auth_type === 'password' ? (
              <input
                type="password"
                placeholder={editingHost ? '•••••••• (留空保持不变)' : '输入服务器 root 密码'}
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
            ) : (
              <textarea
                rows={4}
                placeholder={
                  editingHost
                    ? '留空表示保持原有私钥不变'
                    : '-----BEGIN OPENSSH PRIVATE KEY-----...'
                }
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500"
              />
            )}
            <p className="text-[10px] text-slate-500 dark:text-gray-500 mt-1 flex items-center space-x-1">
              <Shield size={11} className="text-emerald-500 dark:text-emerald-400" />
              <span>所有私密凭据均采用本地 AES-256-GCM 高强度加密落盘</span>
            </p>
          </div>

          <div className="flex space-x-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 font-medium rounded-lg transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition shadow-xs"
            >
              {loading ? '正在保存...' : editingHost ? '保存修改' : '添加并保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
