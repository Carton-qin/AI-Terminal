import React, { useEffect, useState } from 'react'
import {
  Settings,
  X,
  Sparkles,
  Check,
  RefreshCw,
  Bookmark,
  Trash2,
  Plus,
  ShieldCheck,
  ChevronDown,
  Edit2,
} from 'lucide-react'

export default function SettingsModal({ isOpen, onClose }) {
  const [profiles, setProfiles] = useState([])
  const [selectedProfileId, setSelectedProfileId] = useState('')

  const [config, setConfig] = useState({
    api_key: '',
    base_url: 'https://agentrouter.org/v1',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    auto_execute_safe: false,
  })

  // 动态模型列表状态
  const [availableModels, setAvailableModels] = useState([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchError, setModelFetchError] = useState('')
  const [isManualModelInput, setIsManualModelInput] = useState(false)

  // 保存为新预设状态
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')

  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false)

  // 加载已保存档案与当前活跃配置
  const fetchProfilesAndConfig = async () => {
    try {
      const [confRes, profRes] = await Promise.all([
        fetch('http://127.0.0.1:8765/api/ai/config'),
        fetch('http://127.0.0.1:8765/api/ai/profiles'),
      ])
      if (confRes.ok) {
        const confData = await confRes.json()
        setConfig((prev) => ({ ...prev, ...confData }))
      }
      if (profRes.ok) {
        const profData = await profRes.json()
        setProfiles(profData)
        if (profData.length > 0 && !selectedProfileId) {
          setSelectedProfileId(profData[0].id)
        }
      }
    } catch (e) {
      console.warn('获取配置失败', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchProfilesAndConfig()
      setModelFetchError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  // 切换预设档案
  const handleSelectProfile = (profileId) => {
    setSelectedProfileId(profileId)
    const found = profiles.find((p) => p.id === profileId)
    if (found) {
      setConfig((prev) => ({
        ...prev,
        base_url: found.base_url,
        api_key: found.api_key || '',
        model: found.model,
      }))
      setAvailableModels([])
      setModelFetchError('')
    }
  }

  // 动态获取服务商支持的模型列表
  const handleFetchModels = async () => {
    if (!config.base_url) {
      alert('请先输入 Base URL')
      return
    }

    setFetchingModels(true)
    setModelFetchError('')
    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: config.base_url,
          api_key: config.api_key || 'ollama',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || '获取失败')
      }

      const list = data.models || []
      setAvailableModels(list)
      setIsManualModelInput(false)

      // 智能识别可用模型：优先推荐常见的标准聊天模型，避免自动选中 non-chat / responses-only 专项模型（如 gpt-5.6-sol）
      if (list.length > 0 && !list.includes(config.model)) {
        const preferredKeywords = [
          'claude-3-7-sonnet',
          'claude-3-5-sonnet',
          'claude-3-5-haiku',
          'deepseek-chat',
          'deepseek-v3',
          'deepseek-r1',
          'gpt-4o',
          'gpt-4o-mini',
          'qwen',
        ]
        const matched = list.find((m) =>
          preferredKeywords.some((pref) => m.toLowerCase().includes(pref))
        )
        if (matched) {
          setConfig((prev) => ({ ...prev, model: matched }))
        } else {
          // 避开明确带有非标准聊天标记（如 sol, embedding, realtime, moderation, tts, whisper）的模型
          const validChat = list.filter((m) => !/(?:sol|embedding|realtime|moderation|tts|whisper|dall-e)/i.test(m))
          setConfig((prev) => ({ ...prev, model: validChat.length > 0 ? validChat[0] : list[0] }))
        }
      }
    } catch (err) {
      setModelFetchError(err.message)
    } finally {
      setFetchingModels(false)
    }
  }

  // 另存为新预设
  const handleSaveAsProfile = async () => {
    if (!newProfileName.trim()) {
      alert('请输入预设配置名称')
      return
    }

    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProfileName.trim(),
          base_url: config.base_url,
          api_key: config.api_key,
          model: config.model,
        }),
      })
      const data = await res.json()
      setIsCreatingProfile(false)
      setNewProfileName('')
      await fetchProfilesAndConfig()
      setSelectedProfileId(data.id)
    } catch (err) {
      alert(`保存预设失败: ${err.message}`)
    }
  }

  // 删除当前选中的预设
  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return
    setConfirmDeleteProfile(false)
    await fetch(`http://127.0.0.1:8765/api/ai/profiles/${selectedProfileId}`, { method: 'DELETE' })
    await fetchProfilesAndConfig()
  }

  // 保存当前配置并立即生效
  const handleSaveAndApply = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      // 1. 保存活跃配置
      await fetch('http://127.0.0.1:8765/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      // 2. 同时将修改同步保存到当前选中的 profile
      if (selectedProfileId) {
        const cur = profiles.find((p) => p.id === selectedProfileId)
        if (cur) {
          await fetch('http://127.0.0.1:8765/api/ai/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: selectedProfileId,
              name: cur.name,
              base_url: config.base_url,
              api_key: config.api_key,
              model: config.model,
            }),
          })
        }
      }

      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 800)
    } catch (err) {
      alert(`保存失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const isAgentRouter = (config.base_url || '').includes('agentrouter.org')

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none animate-in fade-in">
      <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 顶部标题 */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between shrink-0 bg-slate-50 dark:bg-transparent">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-semibold text-sm">
            <Settings size={16} className="text-amber-500 dark:text-yellow-400" />
            <span>AI 大模型与服务商配置</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-slate-50/50 dark:bg-[#161b22]">
          {/* 1. 预设档案切换栏 */}
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg p-3 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-gray-300 flex items-center space-x-1.5">
                <Bookmark size={14} className="text-cyan-600 dark:text-cyan-400" />
                <span>已保存的服务商配置 (切换即可调出 Key 与模型)</span>
              </span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingProfile(!isCreatingProfile)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-cyan-600 dark:text-cyan-400 rounded text-[11px] flex items-center space-x-1 transition border border-slate-200 dark:border-transparent"
                >
                  <Plus size={12} />
                  <span>另存为新配置</span>
                </button>
                {selectedProfileId && (
                  confirmDeleteProfile ? (
                    <div className="flex items-center space-x-1 animate-in fade-in">
                      <span className="text-[10px] text-rose-500 font-medium">确认删除?</span>
                      <button
                        type="button"
                        onClick={handleDeleteProfile}
                        className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-500"
                        title="确认删除该预设"
                      >
                        是
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProfile(false)}
                        className="px-1 py-0.5 bg-slate-200 dark:bg-[#30363d] text-slate-600 dark:text-gray-300 rounded text-[10px]"
                        title="取消"
                      >
                        否
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProfile(true)}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-500 dark:hover:text-red-400 transition"
                      title="删除当前选中的预设"
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 另存为新配置输入栏 */}
            {isCreatingProfile && (
              <div className="flex items-center space-x-1.5 pt-1">
                <input
                  type="text"
                  placeholder="输入新配置名称 (如: 我的 AgentRouter 专用)"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="flex-1 bg-white dark:bg-[#161b22] border border-slate-300 dark:border-[#30363d] rounded px-2.5 py-1 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleSaveAsProfile}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition shadow-2xs"
                >
                  确认保存
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingProfile(false)}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white text-xs"
                >
                  取消
                </button>
              </div>
            )}

            {/* 预设切换下拉菜单 */}
            <div className="relative">
              <select
                value={selectedProfileId}
                onChange={(e) => handleSelectProfile(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161b22] border border-slate-300 dark:border-[#30363d] rounded px-2.5 py-1.5 text-slate-800 dark:text-white font-medium focus:outline-none focus:border-cyan-500 appearance-none pr-8 cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* AgentRouter 特化安全签名提示 */}
          {isAgentRouter && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/80 rounded-lg p-2.5 flex items-start space-x-2 text-emerald-800 dark:text-emerald-300 text-[11px]">
              <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">已检测到 AgentRouter 中继服务</div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400/90 mt-0.5 leading-relaxed">
                  系统已自动注入 Claude 客户端防 401 专属验证指纹，彻底解决{' '}
                  <code className="bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.2 rounded font-mono">unauthorized_client_error</code> 报错。
                </div>
              </div>
            </div>
          )}

          {/* 2. 表单配置 */}
          <form onSubmit={handleSaveAndApply} className="space-y-3.5">
            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">
                Base URL (API 接入端点) *
              </label>
              <input
                type="text"
                placeholder="例如: https://agentrouter.org/v1 或 https://api.deepseek.com/v1"
                value={config.base_url}
                onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded px-2.5 py-1.5 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
                required
              />
              <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">若省略末尾 /v1，系统将自动智能补齐</p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-gray-300 font-medium mb-1">
                API Key (密钥凭据) *
              </label>
              <input
                type="password"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={config.api_key}
                onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded px-2.5 py-1.5 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
              />
              <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">本地离线 Ollama 可留空或填 ollama</p>
            </div>

            {/* 3. 模型选择与动态获取 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-700 dark:text-gray-300 font-medium">使用的大模型 (Model ID) *</label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsManualModelInput(!isManualModelInput)}
                    className="text-[10px] text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-400 transition"
                  >
                    {isManualModelInput ? '切换为下拉选择' : '切换手动输入'}
                  </button>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !config.base_url}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-cyan-600 dark:text-cyan-400 font-medium rounded text-[11px] flex items-center space-x-1 transition disabled:opacity-40 border border-slate-200 dark:border-transparent"
                  >
                    <RefreshCw size={11} className={fetchingModels ? 'animate-spin' : ''} />
                    <span>{fetchingModels ? '拉取中...' : '🔄 获取模型列表'}</span>
                  </button>
                </div>
              </div>

              {/* 动态模型列表下拉 或 手动输入框 */}
              {!isManualModelInput && availableModels.length > 0 ? (
                <div className="relative">
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full bg-white dark:bg-[#0d1117] border border-cyan-500 dark:border-cyan-800 rounded px-2.5 py-1.5 text-cyan-700 dark:text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400 appearance-none pr-8 cursor-pointer shadow-2xs"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan-500 dark:text-cyan-400 pointer-events-none"
                  />
                  <div className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-1 flex items-center justify-between">
                    <span>✓ 已成功从接口拉取到 {availableModels.length} 个可用模型</span>
                  </div>
                  {/(?:sol|astra)/i.test(config.model) ? (
                    <div className="mt-1.5 p-1.5 rounded bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-300 dark:border-cyan-800 text-[10px] text-cyan-700 dark:text-cyan-300 leading-normal">
                      ✨ 提示：模型「{config.model}」已开启 OpenAI Responses 协议原生无感适配。
                    </div>
                  ) : /(?:embedding|realtime|moderation|tts|whisper)/i.test(config.model) ? (
                    <div className="mt-1.5 p-1.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[10px] text-amber-700 dark:text-amber-300 leading-normal">
                      ⚠️ 提示：模型「{config.model}」疑似非文本对话模型，请优先选用通用模型。
                    </div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="例如: claude-3-5-sonnet-20241022 或 deepseek-chat"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-[#30363d] rounded px-2.5 py-1.5 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
                    required
                  />
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                    点击右上角「获取模型列表」可自动读取此账号支持的全部模型
                  </p>
                </div>
              )}

              {/* 错误提示 */}
              {modelFetchError && (
                <div className="bg-rose-50 dark:bg-red-950/40 border border-rose-200 dark:border-red-900 rounded p-2 text-rose-700 dark:text-red-300 text-[10px] leading-relaxed">
                  获取模型失败: {modelFetchError}
                </div>
              )}
            </div>

            {/* 底部保存按钮 */}
            <div className="flex space-x-2 pt-3 border-t border-slate-200 dark:border-[#30363d]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 font-medium rounded transition border border-slate-200 dark:border-transparent"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded transition shadow-2xs flex items-center justify-center space-x-1.5"
              >
                {saved ? <Check size={14} className="text-white" /> : null}
                <span>{saved ? '已保存并应用！' : loading ? '正在保存...' : '保存并立即应用'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
