import React, { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Play,
  Copy,
  HelpCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Send,
  Stethoscope,
  Check,
  RefreshCw,
  Zap,
  Trash2,
  X,
  Target,
  Square,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Bot,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'

// 判定终端当前末行是否为命令行提示符 (Prompt)
const isPromptLine = (line) => {
  if (!line) return false
  const trimmed = line.trim()
  // 排除百分比进度（如 34% 或 100%）
  if (/\d+%\s*$/.test(trimmed)) return false
  const promptRegex =
    /(?:[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+.*[#\$%]|\[[a-zA-Z0-9_\-\.\s@~:]+\][#\$%]?|^[a-zA-Z0-9_\-\.]+:[a-zA-Z0-9_\-\.\/~]+[#\$%]|^(?:bash|sh|zsh)-[0-9.]+.*[#\$]|^[#\$%>])\s*$/
  return promptRegex.test(trimmed)
}

export default function AICopilot({
  collapsed,
  onToggleCollapse,
  onInjectCommand,
  onReadScreenBuffer,
  currentTab,
  activeTab,
  chatCards,
  chatMessages,
  onUpdateChat,
  onClearChat,
  onResetSession,
  autoExecute = false,
  onToggleAutoExecute,
  activeError = null,
  onClearActiveError,
}) {
  const targetTab = currentTab || activeTab
  const targetCards = (chatCards && chatCards.length ? chatCards : chatMessages) || []
  const handleClearChat = onClearChat || onResetSession

  const [activeSubTab, setActiveSubTab] = useState('chat') // 'chat' | 'diagnose'
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  // 当前终端激活会话的探测系统信息 (由后端动态探测)
  const [sessionDetails, setSessionDetails] = useState(null)

  // 诊断状态
  const [diagResult, setDiagResult] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)

  // 参数详解弹窗
  const [explainingCmd, setExplainingCmd] = useState(null)
  const [explanationText, setExplanationText] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)

  // 高危拦截确认模态框
  const [pendingDangerousCmd, setPendingDangerousCmd] = useState(null)
  const [dangerousConfirmInput, setDangerousConfirmInput] = useState('')

  // --- 🎯 连续排障与任务 Agent 状态 ---
  const [agentTask, setAgentTask] = useState('')
  const [agentMaxSteps, setAgentMaxSteps] = useState(5)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [currentAgentStep, setCurrentAgentStep] = useState(1)
  const [agentSteps, setAgentSteps] = useState([])
  const [agentFinalReport, setAgentFinalReport] = useState(null)
  const [agentPausedForDanger, setAgentPausedForDanger] = useState(null)
  const [expandedOutputs, setExpandedOutputs] = useState({}) // { [stepNum]: boolean }

  const agentAbortRef = useRef(false)
  const agentDangerDecisionRef = useRef(null)

  const agentPresets = [
    { label: '🔍 80端口与Web排查', task: '排查 80 端口被谁占用，定位并修复 Web 服务无法访问问题' },
    { label: '🚀 安装配置Docker', task: '在当前系统安装最新版 Docker 和 Docker Compose，并运行 hello-world 测试验证' },
    { label: '💾 磁盘空间清理', task: '检查系统磁盘空间占用，找出大文件与日志并进行安全清理' },
    { label: '⚡ CPU/内存高负载体检', task: '全面排查当前系统 CPU 与内存高负载根因，找出异常进程并给出优化建议' },
    { label: '🌐 外网与DNS诊断', task: '排查当前 VPS 外网连通性、DNS 解析延迟以及路由连通质量' },
    { label: '🔒 SSH与防火墙体检', task: '检查当前 VPS 防火墙规则、开放端口以及 SSH 安全配置' },
  ]

  const stopAgentLoop = () => {
    agentAbortRef.current = true
    setIsAgentRunning(false)
    if (agentDangerDecisionRef.current) {
      agentDangerDecisionRef.current({ abort: true })
      agentDangerDecisionRef.current = null
    }
    setAgentPausedForDanger(null)
  }

  const resetAgentSession = () => {
    stopAgentLoop()
    setAgentTask('')
    setAgentSteps([])
    setAgentFinalReport(null)
    setAgentPausedForDanger(null)
    setCurrentAgentStep(1)
    setExpandedOutputs({})
  }

  const toggleOutputExpand = (stepNum) => {
    setExpandedOutputs((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }))
  }

  const waitForAgentStepExecution = async (stepNum) => {
    const startTime = Date.now()
    let prevBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
    let lastChangeTime = Date.now()
    let finalOutput = prevBuffer

    while (true) {
      if (agentAbortRef.current) break
      await new Promise((resolve) => setTimeout(resolve, 350))
      if (agentAbortRef.current) break

      const currentBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
      finalOutput = currentBuffer

      if (currentBuffer !== prevBuffer) {
        prevBuffer = currentBuffer
        lastChangeTime = Date.now()
      }

      const elapsed = (Date.now() - startTime) / 1000
      const quietTime = (Date.now() - lastChangeTime) / 1000

      const lines = currentBuffer.split('\n').map((l) => l.trim()).filter(Boolean)
      const lastLine = lines.length > 0 ? lines[lines.length - 1] : ''
      const hasPrompt = isPromptLine(lastLine)

      if (hasPrompt && quietTime >= 0.6 && elapsed >= 0.8) {
        break
      }
      if (quietTime >= 3.0 && elapsed >= 2.0) {
        break
      }
      if (elapsed >= 90) {
        break
      }

      const elapsedSec = Math.round(elapsed)
      setAgentSteps((prev) =>
        prev.map((s) =>
          s.step === stepNum
            ? { ...s, waitProgress: `正在执行中 (${elapsedSec}s)...` }
            : s
        )
      )
    }
    return finalOutput
  }

  const runAgentLoop = async (initialTask, maxSteps = agentMaxSteps) => {
    const taskText = (initialTask || agentTask).trim()
    if (!taskText) return

    setIsAgentRunning(true)
    agentAbortRef.current = false
    setAgentFinalReport(null)
    setAgentPausedForDanger(null)
    setAgentSteps([])

    let currentStep = 1
    let history = []
    let lastOutput = ''
    let stepsRecord = []

    try {
      while (currentStep <= maxSteps) {
        if (agentAbortRef.current) break

        setCurrentAgentStep(currentStep)

        // 添加当前步卡片（思考中）
        const placeholderStep = {
          step: currentStep,
          thought: 'AI 正在分析前置上下文并规划最优排查/修复命令...',
          command: null,
          output: '',
          status: 'THINKING',
          isExecuting: false,
          waitProgress: '推理规划中...',
        }
        stepsRecord = [...stepsRecord, placeholderStep]
        setAgentSteps([...stepsRecord])

        const res = await fetch('http://127.0.0.1:8765/api/ai/agent_step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: taskText,
            step: currentStep,
            max_steps: maxSteps,
            history: history,
            last_output: lastOutput,
            session_id: targetTab?.sessionId,
            os_info:
              sessionDetails?.os_info ||
              (targetTab?.type === 'ssh' ? `远程 VPS Linux (${targetTab?.ip || targetTab?.host?.ip})` : `本地 ${targetTab?.osLabel || '系统'}`),
          }),
        })

        if (!res.ok) {
          throw new Error(`Agent 步骤请求失败: HTTP ${res.status}`)
        }

        const stepData = await res.json()
        if (agentAbortRef.current) break

        const currentStepObj = {
          step: currentStep,
          thought: stepData.thought || '',
          command: stepData.command,
          output: '',
          status: stepData.status,
          risk: stepData.risk,
          finalReport: stepData.final_report,
          isExecuting: false,
          waitProgress: null,
        }

        stepsRecord[stepsRecord.length - 1] = currentStepObj
        setAgentSteps([...stepsRecord])

        // 目标达成或受阻
        if (stepData.status === 'DONE' || !stepData.command) {
          setAgentFinalReport(stepData.final_report || stepData.thought || '🎉 任务目标已达成！')
          break
        }

        if (stepData.status === 'BLOCKED') {
          setAgentFinalReport(stepData.final_report || stepData.thought || '⚠️ 排查遇到无法自动解决的阻碍，需人工协助。')
          break
        }

        // 高危拦截处理
        let commandToRun = stepData.command
        if (stepData.risk && stepData.risk.level === 'DANGEROUS') {
          setAgentPausedForDanger({
            command: stepData.command,
            reason: stepData.risk.reason,
            step: currentStep,
          })
          const decision = await new Promise((resolve) => {
            agentDangerDecisionRef.current = resolve
          })
          setAgentPausedForDanger(null)
          if (agentAbortRef.current || decision?.abort) {
            break
          }
          if (!decision?.approved) {
            // 用户跳过了该命令
            currentStepObj.output = '（用户主动跳过了该高危指令）'
            stepsRecord[stepsRecord.length - 1] = currentStepObj
            setAgentSteps([...stepsRecord])
            history.push({
              step: currentStep,
              thought: stepData.thought,
              command: stepData.command,
              output: '（用户主动跳过了该高危指令）',
            })
            currentStep += 1
            continue
          }
        }

        // 自动注入命令并等待终端执行完成
        currentStepObj.isExecuting = true
        currentStepObj.waitProgress = '已注入终端，正在执行...'
        setAgentSteps([...stepsRecord])

        onInjectCommand(commandToRun)

        const output = await waitForAgentStepExecution(currentStep)
        if (agentAbortRef.current) break

        currentStepObj.isExecuting = false
        currentStepObj.waitProgress = null
        currentStepObj.output = output
        stepsRecord[stepsRecord.length - 1] = currentStepObj
        setAgentSteps([...stepsRecord])

        // 记录历史
        history.push({
          step: currentStep,
          thought: stepData.thought,
          command: commandToRun,
          output: output.slice(-1500),
        })
        lastOutput = output.slice(-2500)

        currentStep += 1
      }

      if (currentStep > maxSteps && !agentAbortRef.current && !agentFinalReport) {
        setAgentFinalReport(
          `已达到最大执行步数限制（${maxSteps} 步），连续排查流程结束。请参阅各步骤日志与输出进行后续确认。`
        )
      }
    } catch (err) {
      alert(`Agent 执行异常: ${err.message}`)
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleDangerDecision = (approved) => {
    if (agentDangerDecisionRef.current) {
      agentDangerDecisionRef.current({ approved })
      agentDangerDecisionRef.current = null
    }
  }

  // 当切换终端 Tab 时，动态拉取该 Tab 真实探测到的远端 VPS 操作系统信息
  useEffect(() => {
    if (!targetTab?.sessionId) {
      setSessionDetails(null)
      return
    }
    let isMounted = true
    fetch(`http://127.0.0.1:8765/api/session/${targetTab.sessionId}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setSessionDetails(data)
        }
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [targetTab?.sessionId])

  // 记录用户是否主动要求跳过等待、立即分析的标记
  const forceAnalyzeMapRef = useRef({})

  const forceAnalyzeNow = (cardId) => {
    forceAnalyzeMapRef.current[cardId] = true
  }

  // 核心：动态侦测终端执行完毕，精准读取完整输出并让 AI 生成针对用户问题的解读结论
  const analyzeOutputForCard = async (targetCard, listOverride = null) => {
    if (!targetCard || !targetCard.command) return

    forceAnalyzeMapRef.current[targetCard.id] = false

    // 初始设置状态为“正在执行中”
    if (onUpdateChat) {
      onUpdateChat((prevCards) => {
        const list = listOverride || prevCards || []
        return list.map((c) =>
          c.id === targetCard.id
            ? { ...c, analyzing: true, waitProgress: '命令执行中 (已耗时 1s)...' }
            : c
        )
      })
    }

    const startTime = Date.now()
    let prevBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
    let lastChangeTime = Date.now()
    let finalOutput = prevBuffer

    // 动态侦测终端执行完成状态（每 350ms 轮询一次）
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 350))

      // 检查用户是否主动点击了“立即解读”
      if (forceAnalyzeMapRef.current[targetCard.id]) {
        finalOutput = onReadScreenBuffer ? onReadScreenBuffer() : ''
        break
      }

      const currentBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
      finalOutput = currentBuffer

      if (currentBuffer !== prevBuffer) {
        prevBuffer = currentBuffer
        lastChangeTime = Date.now()
      }

      const elapsed = (Date.now() - startTime) / 1000
      const quietTime = (Date.now() - lastChangeTime) / 1000

      // 取当前缓冲区末尾的非空行检查提示符
      const lines = currentBuffer.split('\n').map((l) => l.trim()).filter(Boolean)
      const lastLine = lines.length > 0 ? lines[lines.length - 1] : ''
      const hasPrompt = isPromptLine(lastLine)

      // 判定条件1: 命令提示符已重新出现，且输出已静止超过 0.6 秒，且总耗时至少 0.8 秒（确保已启动）
      if (hasPrompt && quietTime >= 0.6 && elapsed >= 0.8) {
        break
      }

      // 判定条件2: 输出已经完全静止超过 3.0 秒，且总耗时至少 2.0 秒（处理交互式等待或无典型提示符环境）
      if (quietTime >= 3.0 && elapsed >= 2.0) {
        break
      }

      // 判定条件3: 超时保护（最多等待 60 秒）
      if (elapsed >= 60) {
        break
      }

      // 更新等待进度文案
      if (onUpdateChat) {
        const elapsedSec = Math.round(elapsed)
        onUpdateChat((prevCards) => {
          const list = prevCards || []
          return list.map((c) =>
            c.id === targetCard.id
              ? { ...c, waitProgress: `命令执行中 (已耗时 ${elapsedSec}s)...` }
              : c
          )
        })
      }
    }

    // 此时命令已真正执行完成，转入大模型解读
    if (onUpdateChat) {
      onUpdateChat((prevCards) => {
        const list = prevCards || []
        return list.map((c) =>
          c.id === targetCard.id
            ? { ...c, waitProgress: '正在分析完整执行结果...' }
            : c
        )
      })
    }

    const outputSnippet = finalOutput.slice(-3000)

    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/analyze_output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: targetCard.userQuery,
          command: targetCard.command,
          output: outputSnippet,
          session_id: targetTab?.sessionId,
          os_info:
            sessionDetails?.os_info ||
            (targetTab?.type === 'ssh' ? `远程 VPS Linux (${targetTab?.ip || targetTab?.host?.ip})` : `本地 ${targetTab?.osLabel || '系统'}`),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (onUpdateChat) {
          onUpdateChat((prevCards) => {
            const list = prevCards || []
            return list.map((c) =>
              c.id === targetCard.id
                ? { ...c, analyzing: false, waitProgress: null, resultAnswer: data.answer }
                : c
            )
          })
        }
      } else {
        if (onUpdateChat) {
          onUpdateChat((prevCards) => {
            const list = prevCards || []
            return list.map((c) =>
              c.id === targetCard.id
                ? {
                    ...c,
                    analyzing: false,
                    waitProgress: null,
                    resultAnswer: '未能生成分析结论，可点击“重新解读”重试。',
                  }
                : c
            )
          })
        }
      }
    } catch (err) {
      if (onUpdateChat) {
        onUpdateChat((prevCards) => {
          const list = prevCards || []
          return list.map((c) =>
            c.id === targetCard.id
              ? { ...c, analyzing: false, waitProgress: null, resultAnswer: `解读失败: ${err.message}` }
              : c
          )
        })
      }
    }
  }

  // 提交自然语言查询
  const handleSend = async (e, customQuery = null) => {
    e?.preventDefault()
    const currentQuery = (typeof customQuery === 'string' ? customQuery : query).trim()
    if (!currentQuery || loading) return

    if (!customQuery) {
      setQuery('')
    }
    setLoading(true)

    // 提取当前 Tab 独有的近期上下文对话记录
    const historyList = (targetCards || [])
      .filter((c) => c.userQuery && c.command)
      .slice(-5)
      .flatMap((c) => [
        { role: 'user', content: c.userQuery },
        { role: 'assistant', content: c.command },
      ])

    // 实时读取当前终端屏幕输出与视口日志，注入给 AI 模型
    const screenBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''

    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuery,
          session_id: targetTab?.sessionId,
          os_info:
            sessionDetails?.os_info ||
            (targetTab?.type === 'ssh' ? `远程 VPS Linux (${targetTab?.ip || targetTab?.host?.ip})` : `本地 ${targetTab?.osLabel || '系统'}`),
          history: historyList,
          screen_buffer: screenBuffer,
        }),
      })
      const data = await res.json()

      let autoExecuted = false
      let executionNote = null
      let shouldAutoAnalyze = false

      // 自动执行逻辑：如开启且非高危，立即无缝注入终端执行
      if (data.is_command && data.command) {
        if (autoExecute) {
          if (data.risk && data.risk.level === 'DANGEROUS') {
            setPendingDangerousCmd(data.command)
            executionNote = '⚠️ 拦截高危指令，请手动确认'
          } else {
            onInjectCommand(data.command)
            autoExecuted = true
            executionNote = '⚡ 已自动执行'
            shouldAutoAnalyze = true
          }
        }
      }

      const cardId = Date.now().toString()
      const newCard = {
        id: cardId,
        userQuery: currentQuery,
        isCommand: data.is_command,
        command: data.command,
        explanation: data.explanation,
        risk: data.risk,
        riskNotes: data.risk_notes,
        autoExecuted,
        executionNote,
        analyzing: shouldAutoAnalyze,
        resultAnswer: null,
      }

      const nextCards = [newCard, ...(targetCards || [])]
      if (onUpdateChat) {
        onUpdateChat(nextCards)
      }

      // 如果自动执行了命令，自动开始读取终端输出并解读回答用户的问题
      if (shouldAutoAnalyze) {
        analyzeOutputForCard(newCard, nextCards)
      }
    } catch (err) {
      if (onUpdateChat) {
        onUpdateChat([
          {
            id: Date.now().toString(),
            userQuery: currentQuery,
            isCommand: false,
            explanation: `请求失败: ${err.message}。请确保后端服务已启动。`,
          },
          ...(targetCards || []),
        ])
      }
    } finally {
      setLoading(false)
    }
  }

  // 执行命令（带高危拦截）+ 执行后自动解读结果
  const triggerExecute = (card) => {
    const cmd = card.command
    const risk = card.risk
    if (risk && risk.level === 'DANGEROUS') {
      setPendingDangerousCmd(cmd)
      setDangerousConfirmInput('')
      return
    }
    onInjectCommand(cmd)
    // 执行后自动开始解读结果
    analyzeOutputForCard(card)
  }

  // 触发参数拆解
  const triggerExplain = async (cmd) => {
    setExplainingCmd(cmd)
    setExplainLoading(true)
    setExplanationText('')
    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })
      const data = await res.json()
      setExplanationText(data.explanation)
    } catch (err) {
      setExplanationText(`获取拆解失败: ${err.message}`)
    } finally {
      setExplainLoading(false)
    }
  }

  // 触发终端屏幕自动排障自愈
  const triggerDiagnose = async () => {
    const screenBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
    if (!screenBuffer || !screenBuffer.trim()) {
      alert('当前终端屏幕没有捕获到足够的输出内容，请先在终端中操作后再试。')
      return
    }

    setDiagLoading(true)
    setDiagResult(null)
    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: '自动捕获报错',
          screen_output: screenBuffer,
          session_id: targetTab?.sessionId,
          os_info:
            sessionDetails?.os_info ||
            (targetTab?.type === 'ssh' ? `远程 VPS Linux (${targetTab?.ip || targetTab?.host?.ip})` : `本地 ${targetTab?.osLabel || '系统'}`),
        }),
      })
      const data = await res.json()
      setDiagResult(data)
    } catch (err) {
      alert(`诊断失败: ${err.message}`)
    } finally {
      setDiagLoading(false)
    }
  }

  // 一键自愈快速触发
  const triggerQuickDiagnose = async (errorSnippet) => {
    setActiveSubTab('diagnose')
    if (onClearActiveError) onClearActiveError()
    setDiagLoading(true)
    setDiagResult(null)

    const screenBuffer = onReadScreenBuffer ? onReadScreenBuffer() : ''
    const payloadOutput = errorSnippet
      ? `${errorSnippet}\n\n[终端视口上下文日志]:\n${screenBuffer}`
      : screenBuffer

    try {
      const res = await fetch('http://127.0.0.1:8765/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: '终端执行异常自动嗅探',
          screen_output: payloadOutput,
          session_id: targetTab?.sessionId,
          os_info:
            sessionDetails?.os_info ||
            (targetTab?.type === 'ssh' ? `远程 VPS Linux (${targetTab?.ip || targetTab?.host?.ip})` : `本地 ${targetTab?.osLabel || '系统'}`),
        }),
      })
      const data = await res.json()
      setDiagResult(data)

      // 如果启用了自动执行且方案安全，可无缝自愈
      if (autoExecute && data.fix_command) {
        if (data.risk && data.risk.level === 'DANGEROUS') {
          setPendingDangerousCmd(data.fix_command)
        } else {
          onInjectCommand(data.fix_command)
          data.autoExecuted = true
        }
      }
    } catch (err) {
      alert(`自愈失败: ${err.message}`)
    } finally {
      setDiagLoading(false)
    }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  if (collapsed) {
    return (
      <aside className="w-10 bg-slate-50 dark:bg-[#161b22] border-l border-slate-200 dark:border-[#30363d] flex flex-col items-center py-3 select-none shrink-0 transition-colors">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-400 hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded transition mb-4"
          title="展开 AI Copilot 侧边栏"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="rotate-90 text-xs font-semibold tracking-wider text-cyan-600 dark:text-cyan-400 whitespace-nowrap mt-8">
          AI COPILOT
        </div>
      </aside>
    )
  }

  // 格式化当前 VPS/终端的环境标签
  const currentEnvLabel =
    targetTab?.type === 'ssh'
      ? sessionDetails?.os_info?.distro || targetTab.title || '远程 VPS'
      : (targetTab?.osLabel ? `${targetTab.osLabel} (本地)` : '本地系统')
  const currentUserLabel =
    sessionDetails?.os_info?.username || (targetTab?.type === 'ssh' ? 'root' : 'user')

  return (
    <aside className="w-80 bg-white dark:bg-[#161b22] border-l border-slate-200 dark:border-[#30363d] flex flex-col h-full shrink-0 select-none transition-colors text-slate-800 dark:text-gray-200">
      {/* 侧边栏顶部状态栏 */}
      <div className="h-12 border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between px-3 bg-slate-50 dark:bg-[#161b22]">
        <div className="flex items-center space-x-2 min-w-0">
          <Sparkles size={16} className="text-cyan-500 dark:text-cyan-400 animate-pulse shrink-0" />
          <span className="font-semibold text-xs text-slate-900 dark:text-white">AI Copilot</span>
          <span className="text-[10px] bg-cyan-50 dark:bg-[#21262d] text-cyan-700 dark:text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-800/40 shrink-0">
            已就绪
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-slate-400 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#21262d] rounded transition"
          title="折叠侧边栏"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 🎯 当前激活会话环境感知与控制面板 */}
      <div className="px-3 py-1.5 bg-slate-100/70 dark:bg-[#0d1117] border-b border-slate-200 dark:border-[#30363d] flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              targetTab?.type === 'ssh' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'
            }`}
          ></span>
          <span className="font-semibold text-slate-800 dark:text-gray-200 truncate">
            {targetTab?.type === 'ssh' ? `VPS: ${targetTab.host?.name || targetTab.hostName || targetTab.title}` : '本地终端'}
          </span>
          <span
            className="text-slate-500 dark:text-gray-400 text-[10px] truncate"
            title={`${currentEnvLabel} (${currentUserLabel})`}
          >
            [{currentEnvLabel}]
          </span>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {/* ⚡ 自动执行开关联动 */}
          <button
            onClick={onToggleAutoExecute}
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition ${
              autoExecute
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500 shadow-xs'
                : 'bg-white dark:bg-[#21262d] text-slate-600 dark:text-gray-400 border-slate-300 dark:border-gray-700 hover:text-slate-900 dark:hover:text-gray-200'
            }`}
            title={
              autoExecute
                ? '自动执行已开启：安全指令将自动注入终端并实时分析回答'
                : '自动执行已关闭：需手动点击执行按钮'
            }
          >
            <Zap size={11} className={autoExecute ? 'text-cyan-400 fill-cyan-400' : ''} />
            <span>自执行 {autoExecute ? 'ON' : 'OFF'}</span>
          </button>

          {/* 🗑️ 清空当前 Tab 记忆 */}
          <button
            onClick={handleClearChat}
            className="p-1 text-slate-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-[#21262d] rounded transition"
            title="清空当前会话的 AI 对话记录"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* 🚨 终端报错智能自愈快捷横幅 */}
      {activeError && (
        <div className="mx-2.5 my-2 p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-700/70 rounded-lg text-xs space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-red-700 dark:text-red-300 font-semibold text-[11px] truncate">
              <AlertTriangle size={13} className="text-red-500 dark:text-red-400 shrink-0 animate-pulse" />
              <span>检测到终端报错</span>
            </div>
            <button
              onClick={onClearActiveError}
              className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 p-0.5"
              title="忽略"
            >
              <X size={12} />
            </button>
          </div>
          <div className="font-mono text-[10px] text-red-800 dark:text-red-300/90 bg-red-100/70 dark:bg-[#161b22] px-2 py-1 rounded truncate border border-red-200 dark:border-red-900/40">
            {activeError}
          </div>
          <div className="flex space-x-1.5 pt-0.5">
            <button
              onClick={() => triggerQuickDiagnose(activeError)}
              className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-medium flex items-center justify-center space-x-1 transition shadow"
            >
              <Stethoscope size={11} />
              <span>单步自愈</span>
            </button>
            <button
              onClick={() => {
                const taskText = `排查并彻底解决终端报错: ${activeError}`
                setAgentTask(taskText)
                setActiveSubTab('agent')
                runAgentLoop(taskText)
              }}
              className="flex-1 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium flex items-center justify-center space-x-1 transition shadow"
              title="启动自主 Agent，进行连续多步追查与验证，直到彻底消除报错"
            >
              <Target size={11} />
              <span>连续追踪排障</span>
            </button>
          </div>
        </div>
      )}

      {/* 子功能 Tab 切换 */}
      <div className="flex border-b border-slate-200 dark:border-[#30363d] bg-slate-100/60 dark:bg-[#0d1117] text-xs">
        <button
          onClick={() => setActiveSubTab('chat')}
          className={`flex-1 py-2 font-medium transition text-center border-b-2 ${
            activeSubTab === 'chat'
              ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500 bg-white dark:bg-[#161b22]'
              : 'text-slate-500 dark:text-gray-400 border-transparent hover:text-slate-800 dark:hover:text-gray-200'
          }`}
        >
          命令生成
        </button>
        <button
          onClick={() => setActiveSubTab('diagnose')}
          className={`flex-1 py-2 font-medium transition text-center border-b-2 flex items-center justify-center space-x-1 ${
            activeSubTab === 'diagnose'
              ? 'text-rose-600 dark:text-red-400 border-rose-500 bg-white dark:bg-[#161b22]'
              : 'text-slate-500 dark:text-gray-400 border-transparent hover:text-slate-800 dark:hover:text-gray-200'
          }`}
        >
          <Stethoscope size={13} />
          <span>报错自愈</span>
        </button>
        <button
          onClick={() => setActiveSubTab('agent')}
          className={`flex-1 py-2 font-medium transition text-center border-b-2 flex items-center justify-center space-x-1 ${
            activeSubTab === 'agent'
              ? 'text-amber-600 dark:text-amber-400 border-amber-500 bg-white dark:bg-[#161b22]'
              : 'text-slate-500 dark:text-gray-400 border-transparent hover:text-slate-800 dark:hover:text-gray-200'
          }`}
        >
          <Target size={13} className={isAgentRunning ? 'animate-spin' : ''} />
          <span>连续排障</span>
          {isAgentRunning && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping ml-0.5"></span>
          )}
        </button>
      </div>

      {/* Tab 1: 智能命令生成与执行结果解读 */}
      {activeSubTab === 'chat' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* 卡片流 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {targetCards.map((card) => (
              <div
                key={card.id}
                className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg p-2.5 text-xs space-y-2.5 shadow-xs"
              >
                {/* 提问标题 */}
                <div className="font-medium text-slate-800 dark:text-gray-300 pb-1 border-b border-slate-200 dark:border-[#21262d] flex justify-between items-center">
                  <span className="truncate pr-2">💬 {card.userQuery}</span>
                  <div className="flex items-center space-x-1 shrink-0">
                    {card.autoExecuted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 font-mono">
                        ⚡ 已自执行
                      </span>
                    )}
                    {card.risk && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          card.risk.level === 'SAFE'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                            : card.risk.level === 'MODERATE'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                            : 'bg-rose-100 dark:bg-red-950/60 text-rose-800 dark:text-red-400 border border-rose-300 dark:border-red-800 font-bold'
                        }`}
                      >
                        {card.risk.level === 'SAFE'
                          ? '🟢 安全'
                          : card.risk.level === 'MODERATE'
                          ? '🟡 修改'
                          : '🔴 高危'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 生成的代码块 */}
                {card.isCommand && card.command && (
                  <div className="bg-slate-100 dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded p-2 font-mono text-[11px] text-cyan-800 dark:text-cyan-300 break-all relative group">
                    <div>{card.command}</div>
                  </div>
                )}

                {/* 命令参数简要说明 */}
                {card.explanation && (
                  <div className="text-slate-600 dark:text-gray-400 leading-relaxed text-[11px]">{card.explanation}</div>
                )}

                {/* ✨ 重点：终端实际执行结果与 AI 深度答复 */}
                {card.analyzing && (
                  <div className="bg-cyan-50 dark:bg-[#161b22] border border-cyan-300 dark:border-cyan-800/50 rounded-lg p-2.5 flex items-center justify-between text-cyan-800 dark:text-cyan-300 text-xs animate-pulse">
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      <RefreshCw size={13} className="animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span className="truncate">{card.waitProgress || '正在等待命令执行完毕...'}</span>
                    </div>
                    <button
                      onClick={() => forceAnalyzeNow(card.id)}
                      className="px-2 py-0.5 bg-white dark:bg-[#21262d] hover:bg-slate-100 dark:hover:bg-[#30363d] text-cyan-700 dark:text-cyan-300 rounded text-[10px] font-medium border border-cyan-300 dark:border-cyan-800/40 shrink-0 transition"
                      title="无需等待终端完全沉淀，立即基于当前屏幕日志进行分析"
                    >
                      立即解读
                    </button>
                  </div>
                )}

                {card.resultAnswer && (
                  <div className="bg-white dark:bg-[#161b22] border border-cyan-300 dark:border-cyan-500/50 rounded-lg p-2.5 space-y-1.5 text-xs shadow-xs animate-in fade-in">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#30363d] pb-1">
                      <div className="flex items-center space-x-1.5 font-semibold text-cyan-700 dark:text-cyan-300 text-[11px]">
                        <Sparkles size={13} className="text-cyan-500 dark:text-cyan-400 shrink-0" />
                        <span>AI 结论答复</span>
                      </div>
                      <button
                        onClick={() => analyzeOutputForCard(card)}
                        disabled={card.analyzing}
                        className="text-[10px] text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-300 flex items-center space-x-1 transition"
                        title="重新抓取当前终端屏幕并分析"
                      >
                        <RefreshCw size={10} className={card.analyzing ? 'animate-spin' : ''} />
                        <span>重新解读</span>
                      </button>
                    </div>
                    <div className="text-slate-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-[11px]">
                      {card.resultAnswer}
                    </div>
                  </div>
                )}

                {/* 高危警告 */}
                {card.risk && card.risk.level === 'DANGEROUS' && (
                  <div className="bg-rose-50 dark:bg-red-950/40 border border-rose-300 dark:border-red-800/80 rounded p-1.5 flex items-start space-x-1.5 text-rose-700 dark:text-red-300 text-[10px]">
                    <AlertTriangle size={14} className="text-rose-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{card.risk.reason}</span>
                  </div>
                )}

                {/* 操作工具栏 */}
                {card.isCommand && card.command && (
                  <div className="flex items-center justify-end space-x-1 pt-1 border-t border-slate-200 dark:border-[#21262d]">
                    <button
                      onClick={() => copyToClipboard(card.command, card.id)}
                      className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-transparent rounded flex items-center space-x-1 text-[10px] transition shadow-xs"
                    >
                      {copiedId === card.id ? (
                        <Check size={11} className="text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                      <span>{copiedId === card.id ? '已复制' : '复制'}</span>
                    </button>
                    <button
                      onClick={() => triggerExplain(card.command)}
                      className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-transparent rounded flex items-center space-x-1 text-[10px] transition shadow-xs"
                    >
                      <HelpCircle size={11} />
                      <span>参数详解</span>
                    </button>
                    <button
                      onClick={() => analyzeOutputForCard(card)}
                      disabled={card.analyzing}
                      className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-cyan-700 dark:text-cyan-300 rounded flex items-center space-x-1 text-[10px] transition border border-cyan-200 dark:border-cyan-800/40 shadow-xs"
                      title="读取当前终端屏幕输出，针对问题进行解读答复"
                    >
                      {card.analyzing ? (
                        <RefreshCw size={11} className="animate-spin" />
                      ) : (
                        <Sparkles size={11} />
                      )}
                      <span>{card.resultAnswer ? '重新解读' : '解读结果'}</span>
                    </button>
                    <button
                      onClick={() => triggerExecute(card)}
                      className={`px-2.5 py-1 font-medium rounded flex items-center space-x-1 text-[10px] transition shadow-xs ${
                        card.autoExecuted
                          ? 'bg-slate-200 hover:bg-slate-300 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-800 dark:text-cyan-300 border border-slate-300 dark:border-cyan-800/40'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      <Play size={11} />
                      <span>{card.autoExecuted ? '再次执行' : '注入终端'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 终端实时视口感知状态与快速诊断胶囊 */}
          <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#161b22] border-t border-slate-200 dark:border-[#30363d] flex items-center justify-between text-[11px] select-none">
            <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px]">终端屏幕实时感知中</span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => handleSend(null, '请直接读取当前终端屏幕输出中的报错内容，分析具体失败根因并生成针对性修复命令')}
                disabled={loading}
                className="px-2 py-0.5 rounded text-[10px] bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-900/60 transition flex items-center space-x-1 disabled:opacity-50"
                title="一键直接感知终端中的报错并生成修复命令"
              >
                <span>⚡ 诊断终端报错</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend(null, '请直接读取当前终端屏幕输出内容，为我解读运行状态与指标')}
                disabled={loading}
                className="px-2 py-0.5 rounded text-[10px] bg-cyan-50 hover:bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900/60 transition flex items-center space-x-1 disabled:opacity-50"
                title="一键解读当前终端屏幕内容"
              >
                <span>🔍 解读终端输出</span>
              </button>
            </div>
          </div>

          {/* 底部输入框 */}
          <form
            onSubmit={handleSend}
            className="p-2 border-t border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] flex items-center space-x-1.5"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`在 ${currentEnvLabel} 中提问或诊断，支持自动读取终端内容...`}
              className="flex-1 bg-slate-50 dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="p-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-md transition shadow-xs"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: 报错自动排查自愈 */}
      {activeSubTab === 'diagnose' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg p-3 space-y-2 shadow-2xs">
            <div className="font-semibold text-slate-800 dark:text-gray-200 flex items-center space-x-1.5">
              <Stethoscope size={15} className="text-red-500 dark:text-red-400" />
              <span>智能终端报错自愈</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-gray-400 leading-relaxed">
              当命令在当前终端中执行失败或报错时，点击下方按钮，AI 将抓取当前终端视口日志，针对{' '}
              <b className="text-cyan-600 dark:text-cyan-400">{currentEnvLabel}</b> 分析根本原因并给出精准修复方案。
            </p>
            <button
              onClick={triggerDiagnose}
              disabled={diagLoading}
              className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium rounded flex items-center justify-center space-x-1.5 transition mt-2 shadow"
            >
              {diagLoading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Stethoscope size={13} />
              )}
              <span>{diagLoading ? '正在深入排障诊断中...' : '抓取当前视口日志并诊断'}</span>
            </button>
          </div>

          {diagResult && (
            <div className="bg-white dark:bg-[#0d1117] border border-red-200 dark:border-red-900/60 rounded-lg p-3 space-y-3 animate-fade-in shadow-2xs">
              <div>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">
                  根本原因分析:
                </span>
                <p className="mt-1 text-slate-800 dark:text-gray-200 leading-relaxed text-[11px]">
                  {diagResult.root_cause}
                </p>
              </div>

              {diagResult.fix_command && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
                      🛠️ 推荐修复命令:
                    </span>
                    {diagResult.autoExecuted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-mono">
                        ⚡ 已自动执行修复
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded p-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 break-all">
                    {diagResult.fix_command}
                  </div>
                  <div className="text-slate-600 dark:text-gray-400 text-[11px] leading-relaxed">
                    {diagResult.explanation}
                  </div>
                  <button
                    onClick={() =>
                      triggerExecute({ command: diagResult.fix_command, risk: diagResult.risk })
                    }
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded flex items-center justify-center space-x-1 transition mt-2 shadow"
                  >
                    <Play size={12} />
                    <span>立即在终端中执行修复</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: 目标导向自主连续排障 Agent */}
      {activeSubTab === 'agent' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* 顶部控制与目标设定区 */}
          <div className="p-3 border-b border-slate-200 dark:border-[#30363d] bg-slate-50/80 dark:bg-[#0d1117] space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-semibold text-xs text-amber-600 dark:text-amber-300">
                <Target size={14} className={isAgentRunning ? 'animate-spin' : ''} />
                <span>目标导向自主 Agent</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-gray-400 bg-white dark:bg-[#161b22] px-1.5 py-0.5 rounded border border-slate-200 dark:border-gray-700">
                环境: {currentEnvLabel}
              </span>
            </div>

            <textarea
              rows={2}
              value={agentTask}
              onChange={(e) => setAgentTask(e.target.value)}
              disabled={isAgentRunning}
              placeholder="输入运维或排障目标，如：'排查为什么 80 端口被占并修复 Nginx' 或 '安装 Docker 并验证'..."
              className="w-full bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded p-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500 resize-none transition"
            />

            {/* 常用目标预设快捷标签 */}
            {!isAgentRunning && agentSteps.length === 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 dark:text-gray-500">点击快捷填入预设目标:</div>
                <div className="flex flex-wrap gap-1">
                  {agentPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setAgentTask(preset.task)}
                      className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-[#161b22] hover:bg-slate-100 dark:hover:bg-[#21262d] text-slate-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-300 rounded border border-slate-200 dark:border-gray-700/60 transition truncate max-w-full"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 参数与启动/终止按钮 */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-1 text-[10px] text-slate-500 dark:text-gray-400">
                <span>最大限制:</span>
                {[3, 5, 8].map((n) => (
                  <button
                    key={n}
                    disabled={isAgentRunning}
                    onClick={() => setAgentMaxSteps(n)}
                    className={`px-1.5 py-0.5 rounded transition ${
                      agentMaxSteps === n
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold'
                        : 'bg-slate-200/70 dark:bg-[#161b22] text-slate-600 dark:text-gray-400 border border-transparent hover:text-slate-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {n}步
                  </button>
                ))}
              </div>

              {agentSteps.length > 0 && !isAgentRunning && (
                <button
                  onClick={resetAgentSession}
                  className="text-[10px] text-slate-400 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 flex items-center space-x-1 transition"
                  title="清空当前排查记录"
                >
                  <Trash2 size={11} />
                  <span>重置</span>
                </button>
              )}
            </div>

            {isAgentRunning ? (
              <div className="flex items-center space-x-2 pt-0.5">
                <button
                  onClick={stopAgentLoop}
                  className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow"
                >
                  <Square size={12} fill="currentColor" />
                  <span>终止 Agent 任务</span>
                </button>
                <div className="text-[11px] font-mono text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-50 dark:bg-[#161b22] rounded border border-amber-200 dark:border-amber-800/60 flex items-center space-x-1 shrink-0">
                  <RefreshCw size={11} className="animate-spin" />
                  <span>{currentAgentStep} / {agentMaxSteps} 步</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => runAgentLoop()}
                disabled={!agentTask.trim()}
                className="w-full py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow"
              >
                <Target size={13} />
                <span>启动连续排障 Agent</span>
              </button>
            )}
          </div>

          {/* 高危拦截挂起弹窗/警告条 */}
          {agentPausedForDanger && (
            <div className="m-2.5 p-2.5 bg-red-50 dark:bg-red-950/70 border-2 border-red-500 dark:border-red-600 rounded-lg text-xs space-y-2 animate-in fade-in shrink-0">
              <div className="flex items-center space-x-1.5 text-red-600 dark:text-red-300 font-bold text-xs">
                <AlertTriangle size={15} className="text-red-500 dark:text-red-400 animate-pulse shrink-0" />
                <span>高危命令拦截（第 {agentPausedForDanger.step} 步）</span>
              </div>
              <div className="bg-red-100/60 dark:bg-[#0d1117] p-2 rounded font-mono text-[11px] text-red-700 dark:text-red-300 break-all border border-red-200 dark:border-red-800">
                {agentPausedForDanger.command}
              </div>
              <p className="text-[11px] text-slate-700 dark:text-gray-300 leading-relaxed">
                {agentPausedForDanger.reason}。系统已自动挂起排障循环，请确认是否执行。
              </p>
              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => handleDangerDecision(true)}
                  className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs transition"
                >
                  批准强制执行
                </button>
                <button
                  onClick={() => handleDangerDecision(false)}
                  className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded text-xs transition"
                >
                  跳过该指令
                </button>
                <button
                  onClick={stopAgentLoop}
                  className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 rounded text-xs transition"
                >
                  终止任务
                </button>
              </div>
            </div>
          )}

          {/* 步骤时间线卡片流 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {agentSteps.length === 0 && !isAgentRunning && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-gray-500 space-y-2.5 select-none">
                <Bot size={36} className="text-amber-500 dark:text-amber-400 opacity-40 animate-pulse" />
                <div className="text-xs text-slate-600 dark:text-gray-400 font-medium">连续自主排障 Agent 就绪</div>
                <p className="text-[11px] text-slate-400 dark:text-gray-600 max-w-xs leading-relaxed">
                  输入你的运维或排障任务，点击启动后，AI 将自动分析、执行第一条指令、捕获真实输出并继续推理，直到彻底达成目标！
                </p>
              </div>
            )}

            {agentSteps.map((stepItem) => (
              <div
                key={stepItem.step}
                className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-lg p-2.5 text-xs space-y-2 animate-in fade-in"
              >
                {/* 步骤标题与状态标识 */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#21262d] pb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-amber-700 dark:text-amber-400 font-mono text-[11px] bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/40">
                      第 {stepItem.step} 步
                    </span>
                  </div>
                  <div>
                    {stepItem.status === 'THINKING' && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center space-x-1">
                        <RefreshCw size={10} className="animate-spin" />
                        <span>AI 规划推理中...</span>
                      </span>
                    )}
                    {stepItem.isExecuting && (
                      <span className="text-[10px] text-cyan-600 dark:text-cyan-300 flex items-center space-x-1 font-mono">
                        <RefreshCw size={10} className="animate-spin" />
                        <span>{stepItem.waitProgress || '终端执行中...'}</span>
                      </span>
                    )}
                    {!stepItem.isExecuting && stepItem.status === 'CONTINUE' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-mono">
                        <CheckCircle2 size={11} />
                        <span>已执行并推进</span>
                      </span>
                    )}
                    {stepItem.status === 'DONE' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1 font-mono">
                        <CheckCircle2 size={11} />
                        <span>🎉 目标达成</span>
                      </span>
                    )}
                    {stepItem.status === 'BLOCKED' && (
                      <span className="text-[10px] text-red-600 dark:text-red-400 font-bold flex items-center space-x-1 font-mono">
                        <AlertTriangle size={11} />
                        <span>排查阻塞</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 🧠 AI 规划思考 */}
                {stepItem.thought && (
                  <div className="text-slate-700 dark:text-gray-300 leading-relaxed text-[11px] bg-slate-50 dark:bg-[#161b22] p-2 rounded border border-slate-200 dark:border-[#21262d]">
                    <span className="text-amber-600 dark:text-amber-400 font-semibold mr-1">🧠 思考:</span>
                    {stepItem.thought}
                  </div>
                )}

                {/* 💻 执行命令 */}
                {stepItem.command && (
                  <div className="space-y-1">
                    <div className="bg-slate-50 dark:bg-[#161b22] border border-cyan-200 dark:border-cyan-900/60 rounded p-2 font-mono text-[11px] text-cyan-700 dark:text-cyan-300 break-all flex justify-between items-start group">
                      <div className="pr-2">{stepItem.command}</div>
                      <div className="flex items-center space-x-1 shrink-0 pt-0.5">
                        {stepItem.risk && (
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                              stepItem.risk.level === 'SAFE'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                                : stepItem.risk.level === 'MODERATE'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                                : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 font-bold'
                            }`}
                          >
                            {stepItem.risk.level === 'SAFE' ? '🟢安全' : '🔴高危'}
                          </span>
                        )}
                        <button
                          onClick={() => copyToClipboard(stepItem.command, 'agent-cmd-' + stepItem.step)}
                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white transition"
                          title="复制代码"
                        >
                          {copiedId === 'agent-cmd-' + stepItem.step ? (
                            <Check size={11} className="text-emerald-500" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 📋 终端输出日志折叠展示 */}
                {stepItem.output && (
                  <div className="pt-0.5">
                    <button
                      onClick={() => toggleOutputExpand(stepItem.step)}
                      className="text-[10px] text-slate-500 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-300 flex items-center space-x-1 transition"
                    >
                      <span>
                        终端实际输出 ({stepItem.output.split('\n').filter(Boolean).length} 行)
                      </span>
                      {expandedOutputs[stepItem.step] ? (
                        <ChevronUp size={11} />
                      ) : (
                        <ChevronDown size={11} />
                      )}
                    </button>
                    {expandedOutputs[stepItem.step] && (
                      <pre className="mt-1 bg-slate-900 dark:bg-[#05070a] border border-slate-700 dark:border-[#21262d] rounded p-2 text-[10px] font-mono text-slate-200 dark:text-gray-300 max-h-40 overflow-y-auto whitespace-pre-wrap break-all leading-tight">
                        {stepItem.output}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 🏆 最终总结报告卡片 */}
            {agentFinalReport && (
              <div className="bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/40 dark:to-[#0d1117] border border-emerald-300 dark:border-emerald-600/70 rounded-lg p-3 space-y-2.5 animate-in fade-in shadow-lg">
                <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/50 pb-1.5">
                  <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                    <CheckCircle2 size={15} />
                    <span>排查总结与最终报告</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300/80 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    共耗费 {agentSteps.length} 步
                  </span>
                </div>
                <div className="text-slate-800 dark:text-gray-200 text-[11px] leading-relaxed whitespace-pre-wrap bg-white dark:bg-[#161b22] p-2.5 rounded border border-slate-200 dark:border-emerald-900/40">
                  {agentFinalReport}
                </div>
                <button
                  onClick={resetAgentSession}
                  className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-cyan-700 dark:text-cyan-300 rounded text-xs font-medium transition border border-slate-200 dark:border-cyan-800/40 flex items-center justify-center space-x-1"
                >
                  <RefreshCw size={12} />
                  <span>开启下一项排查任务</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 参数详解弹窗 */}
      {explainingCmd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-lg w-full max-w-md p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-[#30363d] pb-2">
              <span className="font-semibold text-xs text-slate-800 dark:text-white">📖 命令参数详解</span>
              <button
                onClick={() => setExplainingCmd(null)}
                className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="bg-slate-900 dark:bg-[#0d1117] p-2 rounded font-mono text-xs text-cyan-300 break-all">
              {explainingCmd}
            </div>
            <div className="max-h-60 overflow-y-auto text-xs text-slate-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {explainLoading ? '正在分析参数细节...' : explanationText}
            </div>
            <button
              onClick={() => setExplainingCmd(null)}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-white text-xs rounded transition font-medium"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 🔴 高危操作二次确认模态框 */}
      {pendingDangerousCmd && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-white dark:bg-[#161b22] border-2 border-red-500 rounded-lg w-full max-w-md p-4 space-y-3 shadow-2xl">
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-500 font-bold text-sm">
              <AlertTriangle size={18} />
              <span>检测到极度高危命令拦截！</span>
            </div>
            <div className="bg-red-50 dark:bg-[#0d1117] border border-red-200 dark:border-red-900/80 p-2.5 rounded font-mono text-xs text-red-700 dark:text-red-400 break-all">
              {pendingDangerousCmd}
            </div>
            <p className="text-xs text-slate-700 dark:text-gray-300 leading-relaxed">
              该命令包含递归销毁、磁盘覆写或严重安全破坏风险！为保护你的服务器数据，请输入{' '}
              <b className="text-slate-900 dark:text-white">yes</b> 以确认强行执行。
            </p>
            <input
              type="text"
              value={dangerousConfirmInput}
              onChange={(e) => setDangerousConfirmInput(e.target.value)}
              placeholder="输入 yes 以确认"
              className="w-full bg-slate-50 dark:bg-[#0d1117] border border-red-300 dark:border-red-800 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setPendingDangerousCmd(null)}
                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#21262d] dark:hover:bg-[#30363d] text-slate-700 dark:text-gray-300 rounded text-xs transition"
              >
                取消
              </button>
              <button
                disabled={dangerousConfirmInput.toLowerCase() !== 'yes'}
                onClick={() => {
                  onInjectCommand(pendingDangerousCmd)
                  setPendingDangerousCmd(null)
                }}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white font-bold rounded text-xs transition"
              >
                确认强制执行
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
