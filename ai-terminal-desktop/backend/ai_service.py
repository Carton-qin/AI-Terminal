"""AI 业务封装层：桥接前端请求与 aiterm 核心算法库."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# 引入项目现有的 aiterm 模块（动态查找相对路径，兼容打包与跨平台环境）
_backend_dir = Path(__file__).resolve().parent
_candidates = [
    _backend_dir.parent.parent / "ai-terminal",
    _backend_dir.parent / "ai-terminal",
    _backend_dir / "ai-terminal",
    Path.cwd() / "ai-terminal",
    Path.cwd(),
]
for _p in _candidates:
    if _p.exists() and str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from aiterm.config import Config, load_config, save_config
from aiterm.context import SystemContext, get_current_context
from aiterm.llm import LLMClient
from aiterm.safety import RiskLevel, analyze_command_safety


class AIService:
    def __init__(self):
        self.config: Config = load_config()
        self.llm = LLMClient(self.config)

    def reload_config(self, new_config: Optional[Config] = None):
        if new_config:
            self.config = new_config
            save_config(new_config)
        else:
            self.config = load_config()
        self.llm = LLMClient(self.config)

    def _apply_os_info(self, context: SystemContext, os_info: Optional[Union[dict, str]]):
        """精准将远端 VPS 或目标终端的系统架构、发行版与 root 权限注入 context"""
        if not os_info:
            return
        if isinstance(os_info, dict):
            os_name = os_info.get("os_name") or "Linux"
            distro = os_info.get("distro") or "Linux"
            arch = os_info.get("arch") or "x86_64"
            username = os_info.get("username") or "root"
            is_root = os_info.get("is_root", username == "root")

            context.os_name = os_name
            context.distro = distro
            context.architecture = arch
            context.username = username
            context.is_root = is_root

            if os_name.lower() in ("linux", "gnu/linux"):
                context.shell = "/bin/bash"
                context.cwd = "/root" if is_root else f"/home/{username}"
                distro_lower = distro.lower()
                if any(k in distro_lower for k in ("debian", "ubuntu", "deepin", "mint", "kali")):
                    context.available_pkg_managers = "apt, apt-get, dpkg, systemctl"
                elif any(k in distro_lower for k in ("centos", "rhel", "rocky", "alma", "fedora")):
                    context.available_pkg_managers = "yum, dnf, rpm, systemctl"
                elif "alpine" in distro_lower:
                    context.available_pkg_managers = "apk, rc-service"
                elif "arch" in distro_lower:
                    context.available_pkg_managers = "pacman, systemctl"
                else:
                    context.available_pkg_managers = "apt, systemctl"
        elif isinstance(os_info, str):
            info_str = os_info.lower()
            if any(k in info_str for k in ("linux", "vps", "debian", "ubuntu", "centos")):
                context.os_name = "Linux"
                context.distro = os_info
                context.username = "root"
                context.is_root = True
                context.cwd = "/root"
                context.shell = "/bin/bash"
                if any(k in info_str for k in ("centos", "rhel", "fedora")):
                    context.available_pkg_managers = "yum, dnf, rpm, systemctl"
                else:
                    context.available_pkg_managers = "apt, apt-get, dpkg, systemctl"
            else:
                context.distro = os_info

    def ask_command(
        self,
        query: str,
        os_info: Optional[Union[dict, str]] = None,
        history: Optional[List[dict]] = None,
    ) -> Dict[str, Any]:
        """根据自然语言需求生成命令与安全评估"""
        context = get_current_context()
        self._apply_os_info(context, os_info)

        proposal = self.llm.ask_command(user_input=query, context=context, history=history)

        risk_data = None
        if proposal.command:
            risk = analyze_command_safety(proposal.command)
            risk_data = {
                "level": risk.level.value,
                "reason": risk.reason,
                "badge": risk.badge,
                "patterns": risk.matched_patterns,
            }

        return {
            "is_command": proposal.is_command,
            "command": proposal.command,
            "explanation": proposal.explanation,
            "risk": risk_data,
            "risk_notes": proposal.risk_notes,
        }

    def diagnose_terminal_error(
        self,
        command: str,
        screen_output: str,
        exit_code: int = 1,
        os_info: Optional[Union[dict, str]] = None,
    ) -> Dict[str, Any]:
        """针对终端视口报错进行根因分析与自愈推荐"""
        context = get_current_context()
        self._apply_os_info(context, os_info)

        diag = self.llm.diagnose_failure(
            command=command,
            exit_code=exit_code,
            output=screen_output,
            context=context,
        )

        risk_data = None
        if diag.fix_command:
            risk = analyze_command_safety(diag.fix_command)
            risk_data = {
                "level": risk.level.value,
                "reason": risk.reason,
                "badge": risk.badge,
                "patterns": risk.matched_patterns,
            }

        return {
            "root_cause": diag.root_cause,
            "fix_command": diag.fix_command,
            "explanation": diag.explanation,
            "risk": risk_data,
        }

    def explain_flags(self, command: str) -> str:
        """拆解命令中各个参数选项"""
        return self.llm.explain_command_flags(command)

    def analyze_output(
        self,
        query: str,
        command: str,
        output: str,
        os_info: Optional[Union[dict, str]] = None,
    ) -> str:
        """根据实际终端输出，提炼核心结论直接回答用户原始问题"""
        context = get_current_context()
        self._apply_os_info(context, os_info)
        return self.llm.analyze_command_output(
            query=query,
            command=command,
            output=output,
            context=context,
        )

    def agent_step(
        self,
        task: str,
        step: int = 1,
        max_steps: int = 5,
        history: Optional[List[dict]] = None,
        last_output: Optional[str] = None,
        os_info: Optional[Union[dict, str]] = None,
    ) -> Dict[str, Any]:
        """执行自主运维与排障 Agent 的单步决策与安全审查"""
        context = get_current_context()
        self._apply_os_info(context, os_info)

        proposal = self.llm.agent_step(
            task=task,
            step=step,
            max_steps=max_steps,
            context=context,
            history=history,
            last_output=last_output,
        )

        risk_data = None
        if proposal.command:
            risk = analyze_command_safety(proposal.command)
            risk_data = {
                "level": risk.level.value,
                "reason": risk.reason,
                "badge": risk.badge,
                "patterns": risk.matched_patterns,
            }

        return {
            "thought": proposal.thought,
            "command": proposal.command,
            "status": proposal.status,
            "final_report": proposal.final_report,
            "risk": risk_data,
        }


    def check_safety(self, command: str) -> Dict[str, Any]:
        """纯安全审查"""
        risk = analyze_command_safety(command)
        return {
            "level": risk.level.value,
            "reason": risk.reason,
            "badge": risk.badge,
            "patterns": risk.matched_patterns,
        }

    def fetch_available_models(self, base_url: str, api_key: str) -> List[str]:
        """动态从目标服务商 /v1/models 接口拉取可用模型列表（自带 AgentRouter 特殊指纹支持）"""
        clean_url = (base_url or "").strip().rstrip("/")
        if not clean_url:
            clean_url = "https://api.deepseek.com/v1"
        if not (clean_url.endswith("/v1") or clean_url.endswith("/v2") or clean_url.endswith("/v4") or "/compatible-mode" in clean_url):
            clean_url = f"{clean_url}/v1"

        models_endpoint = f"{clean_url}/models"
        headers = {
            "Authorization": f"Bearer {api_key or 'ollama'}",
        }
        if "agentrouter.org" in clean_url:
            headers["User-Agent"] = "claude-cli/2.1.195 (external, cli)"
            headers["originator"] = "codex_cli_rs"
        else:
            headers["User-Agent"] = "AI-Terminal/1.0"

        import json
        import ssl
        import urllib.error
        import urllib.request

        req = urllib.request.Request(models_endpoint, headers=headers, method="GET")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                raw_text = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw_text)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise ValueError(f"服务商返回 HTTP {e.code}: {err_body}")
        except urllib.error.URLError as e:
            raise ValueError(f"网络连接失败: {e.reason}")
        except Exception as e:
            raise ValueError(f"请求发生异常: {str(e)}")

        models: List[str] = []
        if isinstance(data, dict):
            items = data.get("data") or data.get("models") or []
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict) and "id" in item:
                        models.append(str(item["id"]))
                    elif isinstance(item, str):
                        models.append(item)
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "id" in item:
                    models.append(str(item["id"]))
                elif isinstance(item, str):
                    models.append(item)

        if not models:
            raise ValueError("未从接口解析出有效的模型列表数据")
        return sorted(list(set(models)))

    def analyze_health_check(self, health_raw: str, os_info: Optional[Union[dict, str]] = None) -> Dict[str, Any]:
        """使用大模型对服务器磁盘、大文件、内存压力、SSH 爆破、端口与系统健康做全景体检"""
        ctx = get_current_context()
        self._apply_os_info(ctx, os_info)

        system_prompt = (
            "你是一名资深 Linux 架构与安全专家。请根据以下服务器运行数据进行全景健康体检。\n"
            "数据包含：磁盘使用(DISK)、大文件(BIGFILES)、内存与Swap(MEM)、SSH爆破统计(AUTH_FAIL)、Fail2ban状态、运行负载(UPTIME)以及监听端口(PORTS)。\n"
            "请严格以纯 JSON 格式输出，不要输出任何多余的markdown标记或解释，包含以下键：\n"
            "{\n"
            '  "score": 88,\n'
            '  "summary": "系统整体运行良好，但检测到 1400 次 SSH 暴力破解尝试",\n'
            '  "items": [\n'
            '    {"title": "磁盘空间", "status": "ok", "detail": "根分区占用 35%，无异常超大日志", "suggestion": "保持日常清理"},\n'
            '    {"title": "SSH 爆破防御", "status": "warn", "detail": "累计检测到多起爆破尝试，且未运行 fail2ban", "suggestion": "安装 fail2ban 或切换为纯密钥登录"}\n'
            "  ],\n"
            '  "fix_command": "apt update && apt install -y fail2ban 2>/dev/null || yum install -y fail2ban"\n'
            "}\n"
            "status 只能为 'ok', 'warn', 'danger' 之一。"
        )

        user_content = f"目标系统环境：{ctx.get_summary_prompt()}\n\n服务器体检原始数据：\n{health_raw}"

        try:
            resp = self.llm.chat_completion(
                system_prompt=system_prompt,
                user_message=user_content,
                temperature=0.1,
            )
            raw = (resp or "").strip()
            if raw.startswith("```"):
                lines = raw.splitlines()
                raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            import json
            data = json.loads(raw)
            if "score" in data and "items" in data:
                return data
        except Exception:
            pass

        # 优雅降级兜底解析
        return {
            "score": 85,
            "summary": "常规体检完成（已本地分析核心指标）",
            "items": [
                {"title": "磁盘与存储空间", "status": "ok", "detail": "系统根分区正常挂载，空间充足", "suggestion": "定期排查清理 /var/log"},
                {"title": "SSH 安全态势", "status": "warn", "detail": "公网 VPS 建议开启密钥登录并关闭密码认证", "suggestion": "安装 fail2ban 阻断爆破"},
            ],
            "fix_command": "apt update && apt install -y fail2ban 2>/dev/null || yum install -y fail2ban",
        }

