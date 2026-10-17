"""终端用户界面渲染模块：包含 Rich 美化、控制面板、风险标识与帮助手册."""

from __future__ import annotations

from typing import Optional

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text

from aiterm.config import Config
from aiterm.context import SystemContext
from aiterm.safety import RiskAssessment, RiskLevel


class TerminalUI:
    def __init__(self, console: Optional[Console] = None):
        self.console = console or Console()

    def show_banner(self, config: Config, context: SystemContext):
        """显示启动欢迎 Banner 与环境信息"""
        content = Text()
        content.append("⚡ AI Terminal (aiterm) ", style="bold cyan")
        content.append(f"v0.1.0\n", style="dim cyan")
        content.append("💻 环境: ", style="bold white")
        content.append(f"{context.distro} ({context.architecture})  ", style="green")
        content.append("🐚 Shell: ", style="bold white")
        content.append(f"{context.shell.split('/')[-1]}  ", style="yellow")
        content.append("🤖 模型: ", style="bold white")
        content.append(f"{config.model}\n", style="magenta")
        content.append("💡 提示: ", style="bold yellow")
        content.append("直接输入需求自然语言（如 '查找占用大文件'）或普通 Shell 命令，输入 ", style="white")
        content.append("/help", style="bold green")
        content.append(" 查看指令，输入 ", style="white")
        content.append("exit", style="bold red")
        content.append(" 退出。", style="white")

        self.console.print(
            Panel(
                content,
                border_style="cyan",
                title="[bold green]智能终端助手[/bold green]",
                title_align="left",
            )
        )

    def show_command_proposal(
        self,
        command: str,
        explanation: str,
        risk: RiskAssessment,
        risk_notes: Optional[str] = None,
    ):
        """展示 AI 生成的命令卡片"""
        # 语法高亮
        syntax = Syntax(command, "bash", theme="monokai", line_numbers=False)

        body = Table.grid(padding=(0, 1))
        body.add_column()
        body.add_row(syntax)
        body.add_row(Text(""))

        exp_text = Text()
        exp_text.append("📖 说明: ", style="bold cyan")
        exp_text.append(explanation.strip(), style="white")
        body.add_row(exp_text)

        if risk.level == RiskLevel.DANGEROUS:
            warn_text = Text()
            warn_text.append("⚠️ 高危警示: ", style="bold red")
            warn_text.append(risk.reason, style="red")
            if risk_notes:
                warn_text.append(f" ({risk_notes})", style="dim red")
            body.add_row(warn_text)
        elif risk_notes:
            notes_text = Text()
            notes_text.append("ℹ️ 提示: ", style="bold yellow")
            notes_text.append(risk_notes, style="dim yellow")
            body.add_row(notes_text)

        border_color = "green"
        if risk.level == RiskLevel.MODERATE:
            border_color = "yellow"
        elif risk.level == RiskLevel.DANGEROUS:
            border_color = "red"

        self.console.print(
            Panel(
                body,
                title=f"💡 AI 建议命令 [{risk.badge}]",
                title_align="left",
                border_style=border_color,
            )
        )

    def show_diagnosis(
        self,
        failed_command: str,
        exit_code: int,
        root_cause: str,
        fix_command: Optional[str],
        explanation: str,
        risk: Optional[RiskAssessment] = None,
    ):
        """展示命令失败的智能诊断与修复方案"""
        grid = Table.grid(padding=(0, 1))
        grid.add_column()

        fail_info = Text()
        fail_info.append(f"❌ 命令执行失败 (退出码: {exit_code}): ", style="bold red")
        fail_info.append(failed_command, style="bold bright_black")
        grid.add_row(fail_info)
        grid.add_row(Text(""))

        cause_text = Text()
        cause_text.append("🔍 根本原因: ", style="bold yellow")
        cause_text.append(root_cause, style="white")
        grid.add_row(cause_text)

        if fix_command:
            grid.add_row(Text(""))
            fix_title = Text()
            fix_title.append("🛠️ 推荐修复命令: ", style="bold green")
            if risk:
                fix_title.append(f"[{risk.badge}]", style="white")
            grid.add_row(fix_title)
            grid.add_row(Syntax(fix_command, "bash", theme="monokai", line_numbers=False))

            if explanation:
                exp_text = Text()
                exp_text.append("📖 修复说明: ", style="dim white")
                exp_text.append(explanation, style="dim white")
                grid.add_row(exp_text)

        self.console.print(
            Panel(
                grid,
                title="[bold red]🩺 异常智能诊断[/bold red]",
                border_style="red",
                title_align="left",
            )
        )

    def show_markdown(self, markdown_text: str):
        """渲染 Markdown 纯文本回答"""
        self.console.print(Markdown(markdown_text))

    def show_help(self):
        """显示帮助手册表格"""
        table = Table(title="AI Terminal 指令与快捷键速查", border_style="cyan")
        table.add_column("指令 / 操作", style="bold green", width=22)
        table.add_column("类型", style="yellow", width=12)
        table.add_column("详细说明", style="white")

        table.add_row("<自然语言>", "AI 交互", "输入如 '找出占用80端口的进程'，AI 自动生成命令")
        table.add_row("<Shell 命令>", "原生执行", "直接输入 ls, top, cd 等常规 Linux 命令直通执行")
        table.add_row("!<Shell 命令>", "强制直通", "前缀加 ! 绕过 AI，强制直接在系统原生 Shell 中运行")
        table.add_row("/help", "系统指令", "显示本帮助指南")
        table.add_row("/config", "系统指令", "重新运行配置向导或修改 API Key / 模型")
        table.add_row("/model", "系统指令", "快速切换当前所用大模型")
        table.add_row("/clear", "系统指令", "清空终端屏幕")
        table.add_row("/context", "系统指令", "打印当前检测到的系统硬件与操作系统上下文")
        table.add_row("/reset", "系统指令", "清空本次会话的多轮对话记忆上下文")
        table.add_row("exit / quit", "系统指令", "退出 AI Terminal")
        table.add_row("Ctrl + C", "快捷键", "取消当前正在输入的文本，或中断正在前台运行的命令")
        table.add_row("Ctrl + D", "快捷键", "快速退出终端")

        self.console.print(table)
