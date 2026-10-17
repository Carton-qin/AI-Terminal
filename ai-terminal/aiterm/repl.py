"""交互式 REPL 核心循环：结合 prompt_toolkit，支持多轮对话、命令直通、自动补全、安全提示与报错自愈."""

from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path
from typing import List, Optional

from prompt_toolkit import PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import PathCompleter
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory
from prompt_toolkit.shortcuts import prompt
from rich.console import Console

from aiterm.config import Config, interactive_setup, save_config
from aiterm.context import SystemContext, get_current_context
from aiterm.executor import CommandExecutor, ExecutionResult
from aiterm.llm import CommandProposal, DiagnosticProposal, LLMClient
from aiterm.safety import RiskAssessment, RiskLevel, analyze_command_safety
from aiterm.ui import TerminalUI


HISTORY_FILE = Path.home() / ".aiterm" / "history.txt"


def is_pure_shell_command(text: str) -> bool:
    """判断输入是否为一条纯 Shell 原生命令（而非自然语言提问）"""
    text = text.strip()
    if not text:
        return False

    # 1. 包含中文，必定是自然语言
    if re.search(r"[\u4e00-\u9fff]", text):
        return False

    # 2. 常见英文自然语言疑问词/请求词开头
    natural_starts = (
        "how", "what", "why", "where", "who", "when", "can", "could", "would",
        "please", "help", "explain", "find", "check", "install", "show", "list all",
        "delete all", "search", "tell me"
    )
    lower = text.lower()
    for prefix in natural_starts:
        if lower == prefix or lower.startswith(prefix + " "):
            return False

    # 3. 提取第一个 token 检查是否是系统已存在的二进制可执行程序或内置命令
    tokens = text.split()
    if not tokens:
        return False

    first_word = tokens[0]
    builtins = {"cd", "exit", "quit", "export", "alias", "source", "echo", "pwd", "clear"}
    if first_word in builtins:
        return True

    # 检查 PATH 中是否存在
    if shutil.which(first_word):
        return True

    return False


class REPL:
    def __init__(self, config: Config):
        self.config = config
        self.console = Console()
        self.ui = TerminalUI(self.console)
        self.executor = CommandExecutor()
        self.llm = LLMClient(config)
        self.history_memory: List[dict] = []

        # 确保 history 目录存在
        HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        self.session = PromptSession(
            history=FileHistory(str(HISTORY_FILE)),
            auto_suggest=AutoSuggestFromHistory(),
            completer=PathCompleter(expanduser=True),
        )

    def _get_prompt_html(self, context: SystemContext) -> HTML:
        """生成支持高亮美化的两行式终端 Prompt"""
        cwd = context.cwd
        home = context.home_dir
        if cwd.startswith(home):
            display_path = "~" + cwd[len(home):]
        else:
            display_path = cwd

        git_part = ""
        if context.git_branch:
            dirty_symbol = "*" if context.git_dirty else ""
            git_part = f" <ansicyan>({context.git_branch}{dirty_symbol})</ansicyan>"

        user_color = "ansired" if context.is_root else "ansigreen"
        prompt_str = (
            f"<ansibrightblack>╭─</ansibrightblack>"
            f"[<{user_color}><b>{context.username}</b></{user_color}>"
            f"<ansibrightblack>@</ansibrightblack>"
            f"<ansiyellow>{context.os_name.lower()}</ansiyellow>: "
            f"<ansiblue><b>{display_path}</b></ansiblue>]"
            f"{git_part}\n"
            f"<ansibrightblack>╰─➤</ansibrightblack> "
        )
        return HTML(prompt_str)

    def handle_slash_command(self, cmd: str) -> bool:
        """处理内部斜杠命令，返回 True 表示已拦截处理"""
        stripped = cmd.strip()
        if not stripped.startswith("/"):
            return False

        action = stripped.split()[0].lower()

        if action in ("/help", "/?"):
            self.ui.show_help()
            return True

        elif action == "/config":
            new_conf = interactive_setup()
            self.config = new_conf
            self.llm = LLMClient(new_conf)
            return True

        elif action == "/model":
            parts = stripped.split(maxsplit=1)
            if len(parts) > 1:
                self.config.model = parts[1].strip()
                save_config(self.config)
                self.console.print(f"[bold green]✓ 已切换模型为:[/bold green] {self.config.model}")
            else:
                current = self.config.model
                new_model = prompt(f"当前模型 [{current}]，请输入新模型名: ")
                if new_model.strip():
                    self.config.model = new_model.strip()
                    save_config(self.config)
                    self.console.print(f"[bold green]✓ 已切换模型为:[/bold green] {self.config.model}")
            self.llm = LLMClient(self.config)
            return True

        elif action == "/clear":
            self.console.clear()
            return True

        elif action == "/context":
            ctx = get_current_context()
            self.console.print("[bold cyan]当前终端探测到的系统环境:[/bold cyan]")
            self.console.print(ctx.get_summary_prompt())
            return True

        elif action == "/reset":
            self.history_memory.clear()
            self.console.print("[bold green]✓ 已清空上下文会话记忆。[/bold green]")
            return True

        else:
            self.console.print(f"[bold red]未知指令:[/bold red] {action}，输入 /help 查看支持的指令。")
            return True

    def execute_and_handle_error(self, command_to_run: str, context: SystemContext):
        """执行命令，并在发生非 0 报错时提供智能诊断与自愈"""
        result = self.executor.execute(command_to_run, stream=True)

        # 记录到对话上下文
        self.history_memory.append({
            "role": "assistant",
            "content": f"Executed command: `{command_to_run}`, exit code: {result.returncode}",
        })

        if not result.is_success and not result.interrupted:
            self.console.print()
            try:
                ask_diag = prompt("❌ 命令执行出错，是否让 AI 诊断原因并提供修复命令？ [Y/n]: ").strip().lower()
            except (KeyboardInterrupt, EOFError):
                return

            if ask_diag in ("", "y", "yes"):
                with self.console.status("[bold cyan]AI 正在诊断排障中...[/bold cyan]"):
                    diagnosis = self.llm.diagnose_failure(
                        command=command_to_run,
                        exit_code=result.returncode,
                        output=result.combined_output,
                        context=context,
                    )

                risk = None
                if diagnosis.fix_command:
                    risk = analyze_command_safety(diagnosis.fix_command)

                self.ui.show_diagnosis(
                    failed_command=command_to_run,
                    exit_code=result.returncode,
                    root_cause=diagnosis.root_cause,
                    fix_command=diagnosis.fix_command,
                    explanation=diagnosis.explanation,
                    risk=risk,
                )

                if diagnosis.fix_command:
                    try:
                        confirm = prompt(
                            "是否立即执行修复命令？ [Enter/Y 执行, e 编辑, c 放弃]: "
                        ).strip().lower()
                    except (KeyboardInterrupt, EOFError):
                        return

                    if confirm in ("", "y", "yes"):
                        self.execute_and_handle_error(diagnosis.fix_command, context)
                    elif confirm in ("e", "edit"):
                        edited = prompt("编辑修复命令: ", default=diagnosis.fix_command)
                        if edited.strip():
                            self.execute_and_handle_error(edited.strip(), context)

    def prompt_command_action(
        self,
        proposal: CommandProposal,
        risk: RiskAssessment,
        context: SystemContext,
    ):
        """交互式确认并执行 AI 生成的命令"""
        cmd = proposal.command
        if not cmd:
            return

        # 检查是否配置了安全命令免确认
        if self.config.auto_execute_safe and risk.level == RiskLevel.SAFE:
            self.console.print("[dim green]已启用安全命令免确认，自动执行...[/dim green]")
            self.execute_and_handle_error(cmd, context)
            return

        while True:
            try:
                choice = prompt(
                    "[Enter/Y 执行] [e 编辑] [? 详解参数] [c/n 取消]: "
                ).strip().lower()
            except (KeyboardInterrupt, EOFError):
                self.console.print("[dim]已取消[/dim]")
                return

            if choice in ("", "y", "yes"):
                # 如果是高危命令，进行二次强提醒确认
                if risk.level == RiskLevel.DANGEROUS:
                    try:
                        double_check = prompt(
                            "⚠️ 该命令具有破坏性！确定要继续执行吗？输入 'yes' 确认: "
                        ).strip()
                    except (KeyboardInterrupt, EOFError):
                        return
                    if double_check.lower() != "yes":
                        self.console.print("[yellow]已取消高危操作。[/yellow]")
                        return

                self.execute_and_handle_error(cmd, context)
                break

            elif choice in ("e", "edit"):
                try:
                    edited = prompt("编辑命令: ", default=cmd)
                except (KeyboardInterrupt, EOFError):
                    return
                if edited.strip():
                    new_risk = analyze_command_safety(edited.strip())
                    self.execute_and_handle_error(edited.strip(), context)
                break

            elif choice in ("?", "explain"):
                with self.console.status("[bold cyan]正在拆解命令选项与参数...[/bold cyan]"):
                    flags_explanation = self.llm.explain_command_flags(cmd)
                self.ui.show_markdown(flags_explanation)
                # 继续循环等待选择
                continue

            elif choice in ("c", "n", "no", "cancel"):
                self.console.print("[dim]已放弃执行[/dim]")
                break
            else:
                self.console.print("[yellow]无效选项，请重新选择[/yellow]")

    def run(self):
        """启动主交互循环"""
        context = get_current_context()
        self.ui.show_banner(self.config, context)

        # 检查配置有效性
        if not self.config.is_configured():
            self.console.print(
                "[bold yellow]⚠️ 未检测到有效的大模型配置，建议先进行初始化配置。[/bold yellow]"
            )
            try:
                run_setup = prompt("是否现在进行快速配置向导？ [Y/n]: ").strip().lower()
            except (KeyboardInterrupt, EOFError):
                return
            if run_setup in ("", "y", "yes"):
                self.config = interactive_setup()
                self.llm = LLMClient(self.config)

        while True:
            context = get_current_context()
            try:
                prompt_html = self._get_prompt_html(context)
                user_input = self.session.prompt(prompt_html).strip()
            except KeyboardInterrupt:
                continue
            except EOFError:
                self.console.print("\n[dim]退出 AI Terminal[/dim]")
                break

            if not user_input:
                continue

            # 退出命令
            if user_input.lower() in ("exit", "quit", ":q"):
                self.console.print("[dim]再见！[/dim]")
                break

            # 处理斜杠命令
            if self.handle_slash_command(user_input):
                continue

            # 强制直通模式 (!ls 或 !$ ...)
            if user_input.startswith("!"):
                raw_cmd = user_input[1:].strip()
                if raw_cmd:
                    self.execute_and_handle_error(raw_cmd, context)
                continue

            # 判断是否为纯原生 Shell 命令
            if is_pure_shell_command(user_input):
                self.execute_and_handle_error(user_input, context)
                continue

            # 自然语言：交由大模型生成命令或解答
            with self.console.status("[bold cyan]AI 正在理解意图并生成命令...[/bold cyan]"):
                proposal = self.llm.ask_command(
                    user_input=user_input,
                    context=context,
                    history=self.history_memory[-8:],  # 保留最近的记忆窗口
                )

            # 记录历史
            self.history_memory.append({"role": "user", "content": user_input})

            if proposal.is_command and proposal.command:
                risk = analyze_command_safety(proposal.command)
                self.ui.show_command_proposal(
                    command=proposal.command,
                    explanation=proposal.explanation,
                    risk=risk,
                    risk_notes=proposal.risk_notes,
                )
                self.prompt_command_action(proposal, risk, context)
            else:
                # 纯文本问答或解释
                self.ui.show_markdown(proposal.explanation)
                self.history_memory.append({"role": "assistant", "content": proposal.explanation})
