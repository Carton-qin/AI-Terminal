"""命令行入口模块：支持交互式 REPL 启动以及单次 (One-shot) 指令转译执行."""

from __future__ import annotations

import argparse
import sys
from typing import Optional

from rich.console import Console

from aiterm import __version__
from aiterm.config import Config, interactive_setup, load_config
from aiterm.context import get_current_context
from aiterm.executor import CommandExecutor
from aiterm.llm import LLMClient
from aiterm.repl import REPL
from aiterm.safety import RiskAssessment, RiskLevel, analyze_command_safety
from aiterm.ui import TerminalUI


def parse_args():
    parser = argparse.ArgumentParser(
        prog="aiterm",
        description="AI Terminal - 智能终端命令行助手与 Agent",
    )
    parser.add_argument(
        "query",
        nargs="*",
        help="自然语言意图（例如 'aiterm 查找占用磁盘最大的目录'），若留空则进入全功能交互式终端",
    )
    parser.add_argument(
        "-c", "--config",
        action="store_true",
        help="运行交互式配置向导",
    )
    parser.add_argument(
        "-m", "--model",
        type=str,
        default=None,
        help="指定本次运行的大模型 ID",
    )
    parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="在单次模式下若命令安全则自动执行无需二次确认",
    )
    parser.add_argument(
        "-v", "--version",
        action="version",
        version=f"aiterm v{__version__}",
    )
    return parser.parse_args()


def run_one_shot(query: str, config: Config, auto_yes: bool = False):
    """单次命令行转换模式：aiterm "查看当前公网IP" """
    console = Console()
    ui = TerminalUI(console)
    context = get_current_context()
    llm = LLMClient(config)
    executor = CommandExecutor()

    with console.status("[bold cyan]AI 正在理解并生成命令...[/bold cyan]"):
        proposal = llm.ask_command(user_input=query, context=context)

    if not proposal.is_command or not proposal.command:
        ui.show_markdown(proposal.explanation)
        return

    risk = analyze_command_safety(proposal.command)
    ui.show_command_proposal(
        command=proposal.command,
        explanation=proposal.explanation,
        risk=risk,
        risk_notes=proposal.risk_notes,
    )

    if auto_yes and risk.level == RiskLevel.SAFE:
        executor.execute(proposal.command, stream=True)
        return

    from prompt_toolkit.shortcuts import prompt
    try:
        choice = prompt("[Enter/Y 执行] [e 编辑] [c 取消]: ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        console.print("[dim]已取消[/dim]")
        return

    if choice in ("", "y", "yes"):
        if risk.level == RiskLevel.DANGEROUS:
            try:
                check = prompt("⚠️ 高危命令！请输入 'yes' 确认继续: ").strip()
            except (KeyboardInterrupt, EOFError):
                return
            if check.lower() != "yes":
                console.print("[yellow]已取消[/yellow]")
                return
        executor.execute(proposal.command, stream=True)
    elif choice in ("e", "edit"):
        try:
            edited = prompt("编辑命令: ", default=proposal.command)
        except (KeyboardInterrupt, EOFError):
            return
        if edited.strip():
            executor.execute(edited.strip(), stream=True)


def main():
    args = parse_args()

    if args.config:
        interactive_setup()
        sys.exit(0)

    config = load_config()
    if args.model:
        config.model = args.model
    if args.yes:
        config.auto_execute_safe = True

    # 如果有位置参数 query，执行单次模式
    if args.query:
        query_text = " ".join(args.query).strip()
        run_one_shot(query_text, config, auto_yes=args.yes)
        sys.exit(0)

    # 否则进入交互式 REPL
    repl = REPL(config)
    repl.run()


if __name__ == "__main__":
    main()
