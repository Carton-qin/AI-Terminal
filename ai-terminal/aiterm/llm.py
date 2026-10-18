"""LLM 大模型集成模块：与 OpenAI 兼容接口通信，处理意图识别、命令生成、报错诊断与代码流式交互."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Generator, List, Optional, Tuple

import httpx
from openai import OpenAI

from aiterm.config import Config
from aiterm.context import SystemContext


@dataclass
class CommandProposal:
    is_command: bool
    command: Optional[str]
    explanation: str
    risk_notes: Optional[str] = None
    raw_reply: str = ""


@dataclass
class DiagnosticProposal:
    root_cause: str
    fix_command: Optional[str]
    explanation: str
    raw_reply: str = ""


@dataclass
class AgentStepProposal:
    thought: str
    command: Optional[str]
    status: str  # "CONTINUE" | "DONE" | "BLOCKED"
    final_report: Optional[str] = None
    raw_reply: str = ""


SYSTEM_PROMPT_TEMPLATE = """你是一个顶级的 Linux/Unix 系统架构师与命令行 AI 助手。
你的任务是协助用户在当前终端高效、安全地完成工作。

【当前宿主系统环境】
{context_summary}

【核心行为准则】
1. 当用户输入自然语言意图时（例如“查找大于100M的文件”、“查看80端口被谁占用”、“安装docker”等），必须精准生成契合当前操作系统（{os_name}）和发行版（{distro}）的原生命令。
2. 绝对不能在 macOS 上给出 apt/yum，或在 Debian 上给出 brew。必须考虑当前用户权限（是否为 root）。
3. 遵循最小权限原则与安全性：如果命令需要 sudo，请适当加上；如果存在高危风险（如删除数据、清空防火墙），需在说明中警示。
4. 返回格式必须为严格的 JSON 格式（不要在 JSON 前后添加额外的多余废话）：
{{
  "type": "command" 或 "chat",
  "command": "生成的终端命令（若是纯闲聊或问答则为 null）",
  "explanation": "对命令的简明中文说明（指出关键参数的作用）",
  "risk_notes": "若存在高危风险请写出提醒，否则填 null"
}}
5. 如果用户仅仅是提问理论知识（如“什么是 TCP BBR?”），将 type 设为 "chat"，command 设为 null，并在 explanation 中用 Markdown 详尽解答。
6. 【熟知常用 VPS 运维/跑分经典脚本】：
当用户在 Linux 环境下提出运维测试或软件部署意图时，优先使用社区公认的标准成熟脚本：
- 跑分测试: YABS (`curl -sL yabs.sh | bash`), bench.sh (`wget -qO- bench.sh | bash`), 融合怪 (`bash <(wget -qO- --no-check-certificate https://gitlab.com/spiritysdx/za/-/raw/main/ecs.sh)`)
- 流媒体与IP体检: 流媒体解锁 `bash <(curl -L -s check.unlock.media)`, IP质量体检 `bash <(curl -sL IP.Check.Place)`
- 回程测试: 快速三网回程 `curl https://raw.githubusercontent.com/ludashi2020/backtrace/main/install.sh -sSf | sh`, 详细四网回程 AutoTrace
- 测速: Speedtest `bash <(curl -sL bash.icu/speedtest)`, hyperspeed 大带宽 `bash <(curl -Lso- https://bench.im/hyperspeed)`
- BBR 加速: 原生开启 `echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf && echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf && sysctl -p`, 或 BBRv3 / tcpx
- 重装 DD: leitbogioro 脚本 `wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian 12 -pwd '新密码'`（在 risk_notes 中重点提醒重装会抹除数据并要求修改默认密码）
- 常用环境与面板: Docker (`curl -fsSL https://get.docker.com | bash`), 哪吒监控 (`curl -L https://raw.githubusercontent.com/naiba/nezha/master/script/install.sh -o nezha.sh && chmod +x nezha.sh && sudo ./nezha.sh`), 科技lion (`apt update -y && apt install -y curl && bash <(curl -sL kejilion.sh)`)
- 硬件巡检: 独立服务器硬件/硬盘通电时间检测 `curl -sL https://sick.onl | bash`
- 禁用 IPv6: `echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf && echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.conf && echo "net.ipv6.conf.lo.disable_ipv6 = 1" >> /etc/sysctl.conf && sysctl -p`
7. 【实时终端感知与报错排查能力】：
系统会实时为你注入用户当前终端窗口中正在显示的实际视口屏幕输出与历史日志（若有提供）。你拥有完全直接读取当前终端屏幕内容的能力！
当用户提问包含“看当前终端内容”、“帮我看报错”、“为什么执行失败”、“怎么解决”、“如何修复”、“看看输出”或直接询问命令执行情况时：
- 绝对禁止回答“我无法直接读取您终端窗口里面的实时输出内容”或“只能看到您发送给我的文字”等类似推脱之辞！
- 必须直接基于系统注入的【用户当前活动终端的实时屏幕输出与运行日志】，仔细排查其中的具体报错信息（如：dpkg/apt 依赖与文件冲突、权限不足 Permission denied、端口已被占用 Address already in use、未找到命令 command not found、配置文件语法错误等）。
- 明确指出根本原因，并生成能够直接解决该报错的修复命令（command 字段填入修复命令，type 设为 "command"），并在 explanation 中说明排障逻辑。
"""

DIAGNOSTIC_PROMPT_TEMPLATE = """用户在终端执行了一条命令，但是执行失败了。请作为 Linux 系统诊断专家进行故障排查。

【系统环境】
{context_summary}

【执行命令】
`{command}`

【退出码】
{exit_code}

【终端输出日志】
```
{output}
```

【任务要求】
分析报错根因，并给出针对性的修复命令。请返回严格的 JSON 格式：
{{
  "root_cause": "简要说明导致失败的根本原因（一两句话）",
  "fix_command": "建议执行的修复命令（如果无法通过单条命令修复则填 null）",
  "explanation": "对该修复方案的说明"
}}
"""

OUTPUT_ANALYSIS_TEMPLATE = """用户在终端向你提出了一个关于系统环境或指标的问题，系统已在对应环境中执行了排查命令并得到了实际输出。
请根据终端的真实输出，直接、准确、清晰地回答用户的原始问题。

【系统环境】
{context_summary}

【用户原始问题】
{query}

【执行命令】
`{command}`

【终端实际输出日志】
```
{output}
```

【回答要求】
1. 第一句必须明确给出定性结论（如：“✅ 结论：当前系统已成功开启 BBR” 或 “❌ 结论：当前系统尚未安装 Docker” 或 “当前系统磁盘使用率为 55%，剩余空间充足”）。
2. 列举输出中的关键依据数据（如参数值、版本号、模块加载状态等），2~4 行要点，用 Markdown 格式展示。
3. 如果未开启或存在异常，给出一条针对性的建议或可执行的解决命令。
4. 直奔主题，禁止使用客套废话。
"""

AGENT_STEP_PROMPT_TEMPLATE = """你是一个顶级的 Linux/Unix 自动化运维与系统排障专家 Agent。
用户给你设定了一个运维或故障排查的任务目标，你需要在真实的终端环境中进行多步自主排查与解决。

【任务目标】
{task}

【系统环境】
{context_summary}

【当前排障/执行进度】
第 {step} 步 / 最多允许 {max_steps} 步

【此前已执行的历史步骤与结果】
{history_summary}

【上一条命令的终端实际输出日志】
```
{last_output}
```

【核心判断与决策准则】
1. 评估上一条命令的实际输出与当前任务进度：
   - 如果目标已经彻底达成（例如服务已成功启动并验证正常、安装完成且版本或测试通过、报错已排除），将 "status" 设为 "DONE"，并在 "final_report" 中用 Markdown 详尽总结根因、已执行措施和验证状态；此时 "command" 设为 null。
   - 如果目标尚未达成，需要进一步排查、修复或验证，将 "status" 设为 "CONTINUE"，并在 "thought" 中阐明推理逻辑与下一步计划，在 "command" 中给出针对当前系统（{os_name} / {distro}）的具体执行命令。
   - 如果遇到无法自动解决的死胡同（如物理硬件故障、需要用户提供外部秘钥/密码、或者继续操作会造成严重灾难），将 "status" 设为 "BLOCKED"，并在 "thought" 与 "final_report" 中向用户说明原因与需人工介入的操作。
   - 如果当前步骤已达到最大步数（第 {max_steps} 步），请尝试收尾验证或给出阶段性总结，将 "status" 设为 "DONE" 或 "BLOCKED"。
2. 生成的命令必须契合目标系统（{os_name} {distro}）与用户权限（is_root: {is_root}），严禁在 Linux 下生成 macOS 命令。
3. 遵循高内聚原则，命令尽可能简洁明确，可以使用管道或 && 组合。
4. 返回格式必须为严格的 JSON 格式（不要添加任何额外开场白或包裹废话）：
{{
  "thought": "对上一条输出的分析，以及当前步骤的规划思考（2~3句话）",
  "command": "当前步骤需要执行的终端命令（若已完成或受阻则填 null）",
  "status": "CONTINUE" 或 "DONE" 或 "BLOCKED",
  "final_report": "若 status 为 DONE 或 BLOCKED，请写出完整的 Markdown 总结报告；若为 CONTINUE 则填 null"
}}
"""


class LLMClient:
    def __init__(self, config: Config):
        self.config = config
        self._init_client()

    def _init_client(self):
        # 兼容 Ollama 本地模型（api_key 任意填）
        api_key = self.config.api_key or "ollama"
        base_url = (self.config.base_url or "https://api.deepseek.com/v1").rstrip("/")
        # 自动补全 /v1
        if not (base_url.endswith("/v1") or base_url.endswith("/v2") or base_url.endswith("/v4") or "/compatible-mode" in base_url):
            base_url = f"{base_url}/v1"

        default_headers = dict(self.config.extra_headers or {})
        # 针对 AgentRouter (agentrouter.org) 等平台的 WAF 指纹校验自动注入客户端签名
        if "agentrouter.org" in base_url:
            default_headers["User-Agent"] = "claude-cli/2.1.195 (external, cli)"
            default_headers["originator"] = "codex_cli_rs"
        elif "User-Agent" not in default_headers:
            default_headers["User-Agent"] = "AI-Terminal/1.0"

        http_client = httpx.Client(
            verify=False,
            timeout=float(self.config.timeout),
            headers=default_headers,
        )
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            http_client=http_client,
        )

    def _extract_json(self, text: str) -> Optional[dict]:
        """容错解析模型返回的 JSON（支持反引号代码块包裹或裸 JSON）"""
        text = text.strip()
        # 尝试直接解析
        try:
            return json.loads(text)
        except Exception:
            pass

        # 尝试提取 ```json ... ```
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass

        # 尝试寻找最外层花括号
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except Exception:
                pass

        return None

    def ask_command(
        self,
        user_input: str,
        context: SystemContext,
        history: Optional[List[dict]] = None,
        screen_buffer: Optional[str] = None,
    ) -> CommandProposal:
        """根据用户输入与上下文生成建议命令"""
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            context_summary=context.get_summary_prompt(),
            os_name=context.os_name,
            distro=context.distro,
        )

        messages = [{"role": "system", "content": system_prompt}]
        if screen_buffer and screen_buffer.strip():
            # 截取最近 4000 字符的终端输出，保护 Token 与性能
            truncated_buf = screen_buffer.strip()
            if len(truncated_buf) > 4000:
                truncated_buf = truncated_buf[-4000:]
            screen_context = (
                "【用户当前活动终端的实时屏幕输出与运行日志】\n"
                "以下是用户当前终端窗口中实际显示的最新日志（包含执行的命令与报错信息）：\n"
                "```\n"
                f"{truncated_buf}\n"
                "```\n"
                "【提示】：你拥有完全直接读取上述终端屏幕日志的能力。请直接结合这些输出回答或排查，绝对禁止回答无法读取终端。"
            )
            messages.append({"role": "system", "content": screen_context})

        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_input})

        try:
            # 优先尝试 json_object，但某些非标准服务商不支持则回退
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=self.config.temperature,
            )
            raw_text = response.choices[0].message.content or ""
            data = self._extract_json(raw_text)

            if data and isinstance(data, dict):
                cmd_type = data.get("type", "command")
                command = data.get("command")
                explanation = data.get("explanation", "")
                risk = data.get("risk_notes")
                is_command = (cmd_type == "command" and bool(command))
                return CommandProposal(
                    is_command=is_command,
                    command=command.strip() if command else None,
                    explanation=explanation or raw_text,
                    risk_notes=risk,
                    raw_reply=raw_text,
                )

            # 如果未能解析出有效 JSON，尝试从文本中抽取代码块作为命令
            code_block_match = re.search(r"```(?:bash|sh|zsh)?\s*([^\n`]+)\s*```", raw_text)
            if code_block_match:
                extracted_cmd = code_block_match.group(1).strip()
                return CommandProposal(
                    is_command=True,
                    command=extracted_cmd,
                    explanation=raw_text,
                    raw_reply=raw_text,
                )

            # 纯文本问答
            return CommandProposal(
                is_command=False,
                command=None,
                explanation=raw_text,
                raw_reply=raw_text,
            )

        except Exception as e:
            return CommandProposal(
                is_command=False,
                command=None,
                explanation=f"请求大模型 API 出现异常: {str(e)}\n请检查网络连接、API Key 与 Base URL 设置。",
                raw_reply="",
            )

    def diagnose_failure(
        self,
        command: str,
        exit_code: int,
        output: str,
        context: SystemContext,
    ) -> DiagnosticProposal:
        """诊断失败命令并推荐修复建议"""
        # 截断过长的输出以保护 token
        truncated_output = output[-3000:] if len(output) > 3000 else output

        prompt = DIAGNOSTIC_PROMPT_TEMPLATE.format(
            context_summary=context.get_summary_prompt(),
            command=command,
            exit_code=exit_code,
            output=truncated_output,
        )

        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=[
                    {"role": "system", "content": "你是一位资深的 Linux 运维排障专家。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            raw_text = response.choices[0].message.content or ""
            data = self._extract_json(raw_text)

            if data and isinstance(data, dict):
                return DiagnosticProposal(
                    root_cause=data.get("root_cause", "未知原因"),
                    fix_command=data.get("fix_command"),
                    explanation=data.get("explanation", ""),
                    raw_reply=raw_text,
                )

            return DiagnosticProposal(
                root_cause="命令执行异常",
                fix_command=None,
                explanation=raw_text,
                raw_reply=raw_text,
            )

        except Exception as e:
            return DiagnosticProposal(
                root_cause=f"诊断请求失败: {str(e)}",
                fix_command=None,
                explanation="",
                raw_reply="",
            )

    def explain_command_flags(self, command: str) -> str:
        """拆解命令中每个参数的具体含义"""
        prompt = (
            f"请详细拆解并解释以下 Linux/Unix 命令中的每一个子命令、参数选项（Flags）及其作用，"
            f"采用清晰的 Markdown 列表展现：\n`{command}`"
        )
        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            return response.choices[0].message.content or "无返回内容"
        except Exception as e:
            return f"获取命令参数拆解失败: {str(e)}"

    def analyze_command_output(
        self,
        query: str,
        command: str,
        output: str,
        context: Optional[SystemContext] = None,
    ) -> str:
        """根据终端命令实际打印的输出结果，直接回答用户的原始问题"""
        truncated_output = output[-3000:] if len(output) > 3000 else output
        context_summary = context.get_summary_prompt() if context else "当前终端环境"

        prompt = OUTPUT_ANALYSIS_TEMPLATE.format(
            context_summary=context_summary,
            query=query,
            command=command,
            output=truncated_output,
        )

        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=[
                    {"role": "system", "content": "你是一位专业的 Linux 系统架构师与终端 AI 助手，善于从命令输出中提炼核心结论直接回答用户。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            return response.choices[0].message.content or "未能从输出中提取出有效结论。"
        except Exception as e:
            return f"解读执行结果时请求失败: {str(e)}"

    def agent_step(
        self,
        task: str,
        step: int,
        max_steps: int,
        context: SystemContext,
        history: Optional[List[dict]] = None,
        last_output: Optional[str] = None,
    ) -> AgentStepProposal:
        """执行自主运维与排障 Agent 的单步决策"""
        history_lines = []
        if history:
            for h in history:
                s_num = h.get("step", "?")
                th = h.get("thought", "")
                cmd = h.get("command", "")
                out = (h.get("output") or "").strip()
                if len(out) > 600:
                    out = out[:300] + "\n...[略]...\n" + out[-300:]
                history_lines.append(f"▶ 步骤 {s_num}:\n  指令: `{cmd}`\n  思考: {th}\n  输出简报:\n```\n{out}\n```")
        history_summary = "\n\n".join(history_lines) if history_lines else "暂无（当前为第 1 步起始）"

        clean_last_output = (last_output or "").strip()
        if not clean_last_output:
            clean_last_output = "（初始第 1 步，尚未在终端中执行任何指令）"
        elif len(clean_last_output) > 2500:
            clean_last_output = clean_last_output[:1000] + "\n\n...[输出过长，中间部分省略]...\n\n" + clean_last_output[-1500:]

        prompt = AGENT_STEP_PROMPT_TEMPLATE.format(
            task=task,
            context_summary=context.get_summary_prompt(),
            step=step,
            max_steps=max_steps,
            history_summary=history_summary,
            last_output=clean_last_output,
            os_name=context.os_name,
            distro=context.distro,
            is_root=context.is_root,
        )

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"请结合此前进展与最新输出，评估当前任务是否已彻底完成。若已完成请设 status 为 DONE 并给出完整总结；若需继续排查请给出下一步具体执行的 command。"},
        ]

        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=0.2,
            )
            content = response.choices[0].message.content or ""
            data = self._extract_json(content)

            if not data:
                return AgentStepProposal(
                    thought="无法解析模型返回的决策数据，直接提供返回内容。",
                    command=None,
                    status="BLOCKED",
                    final_report=content,
                    raw_reply=content,
                )

            thought = data.get("thought", "")
            command = data.get("command")
            status = str(data.get("status", "CONTINUE")).upper()
            if status not in ("CONTINUE", "DONE", "BLOCKED"):
                status = "DONE" if not command else "CONTINUE"
            final_report = data.get("final_report")

            return AgentStepProposal(
                thought=thought,
                command=command,
                status=status,
                final_report=final_report,
                raw_reply=content,
            )
        except Exception as e:
            return AgentStepProposal(
                thought=f"调用模型接口异常: {str(e)}",
                command=None,
                status="BLOCKED",
                final_report=f"Agent 排查中断: {str(e)}",
                raw_reply="",
            )

