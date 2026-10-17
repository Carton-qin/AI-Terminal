"""安全审计模块：对即将执行的 Shell 命令进行多级风险识别与警示."""

from __future__ import annotations

import re
import shlex
from dataclasses import dataclass
from enum import Enum
from typing import List, Tuple


class RiskLevel(str, Enum):
    SAFE = "SAFE"          # 🟢 只读/无害查询命令，如 ls, cat, ps, df, git status
    MODERATE = "MODERATE"  # 🟡 普通修改类命令，如 mkdir, touch, git commit, pip install
    DANGEROUS = "DANGEROUS"# 🔴 高危/破坏性命令，如 rm -rf, mkfs, dd, reboot, 提权修改系统


@dataclass
class RiskAssessment:
    level: RiskLevel
    reason: str
    matched_patterns: List[str]

    @property
    def badge(self) -> str:
        if self.level == RiskLevel.SAFE:
            return "[bold green]🟢 安全 (Read-only)[/bold green]"
        elif self.level == RiskLevel.MODERATE:
            return "[bold yellow]🟡 修改 (Moderate)[/bold yellow]"
        else:
            return "[bold red]🔴 高危风险 (Dangerous)[/bold red]"


# 高危模式特征
DANGEROUS_RULES: List[Tuple[str, str]] = [
    # 破坏性删除
    (
        r"rm\s+.*(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force).*",
        "包含递归强制删除 (rm -rf)，极易导致不可逆的文件丢失！",
    ),
    (
        r"rm\s+(-[a-zA-Z]*\s+)?(\/|\/\*|~|~\/\*|\$HOME|\.\/|\*|\.\/\*)(\s+|$)",
        "试图删除系统根目录、主目录或当前目录下全部文件！",
    ),
    # 磁盘与文件系统直接覆盖
    (
        r"\bdd\b.*\bof=/dev/",
        "直接通过 dd 写入裸块设备或磁盘分区，会导致分区表与数据被物理覆写！",
    ),
    (
        r"\b(mkfs|fdisk|parted|sfdisk|wipefs)\b",
        "格式化或重分区底层存储设备！",
    ),
    (
        r">\s*/dev/(sd|nvme|hd|vd)",
        "重定向输出覆写裸磁盘设备！",
    ),
    # 提权与权限泛滥
    (
        r"chmod\s+(-[a-zA-Z]*R\s+)?(777|0777)\s+(/|/etc|/var|/usr|/bin|/sbin)",
        "将系统核心目录修改为 777 全局可写，导致严重安全隐患！",
    ),
    (
        r">\s*(/etc/passwd|/etc/shadow|/etc/sudoers)",
        "重定向覆写系统核心鉴权账户配置文件！",
    ),
    # 防火墙与网络破坏
    (
        r"iptables\s+(-[a-zA-Z]*F|-X|-Z)|ufw\s+disable",
        "清空或禁用系统防火墙规则！",
    ),
    # 宕机与重启
    (
        r"\b(reboot|poweroff|halt|shutdown|init\s+0)\b",
        "执行关机或立即重启操作，可能中断正在运行的线上业务！",
    ),
    # 叉子炸弹与恶意脚本管道
    (
        r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:",
        "检测到 Fork Bomb 拒绝服务攻击代码！",
    ),
    (
        r"curl\b.*\|\s*(sudo\s+)?(bash|sh|zsh)",
        "直接将远程未校验脚本管道送入 Shell 执行！",
    ),
    # 杀死根进程
    (
        r"kill\s+(-9\s+)?1\b",
        "试图杀死 init/systemd (PID 1) 系统核心进程！",
    ),
]

# 安全只读命令前缀 (通常纯只读，无任何副作用)
SAFE_COMMAND_HEADS = {
    "ls", "dir", "vdir", "pwd",
    "cat", "head", "tail", "less", "more", "bat",
    "grep", "egrep", "fgrep", "rg", "ag",
    "find", "fd", "locate", "which", "whereis", "type",
    "whoami", "id", "uname", "hostname", "uptime", "date",
    "df", "du", "free",
    "ps", "top", "htop", "btop", "pstree",
    "netstat", "ss", "lsof", "ip", "ifconfig", "route", "ping", "traceroute", "dig", "nslookup",
    "git", # 需要看子命令
    "echo", "printf",
    "wc", "sort", "uniq", "awk", "cut", "tr", "diff", "file", "stat",
}

SAFE_GIT_SUBCOMMANDS = {
    "status", "log", "diff", "show", "branch", "tag", "remote", "config --get", "rev-parse"
}


def analyze_command_safety(command: str) -> RiskAssessment:
    """分析给定命令的风险等级"""
    cleaned = command.strip()
    if not cleaned:
        return RiskAssessment(RiskLevel.SAFE, "空命令", [])

    matched_reasons = []
    matched_patterns = []

    # 1. 优先检测危险规则
    for pattern, reason in DANGEROUS_RULES:
        if re.search(pattern, cleaned, re.IGNORECASE):
            matched_reasons.append(reason)
            matched_patterns.append(pattern)

    if matched_reasons:
        return RiskAssessment(
            RiskLevel.DANGEROUS,
            "；".join(matched_reasons),
            matched_patterns,
        )

    # 2. 检查管道或连续执行 (&&, ;, ||, |)
    # 若包含重定向写入 (> 或 >>)，通常不是纯只读
    if re.search(r"(>|>>)", cleaned):
        return RiskAssessment(
            RiskLevel.MODERATE,
            "命令包含输出重定向写入文件操作",
            [">"],
        )

    # 3. 检查是否为已知纯安全只读指令
    try:
        tokens = shlex.split(cleaned)
    except Exception:
        tokens = cleaned.split()

    if tokens:
        first_cmd = tokens[0].lower().split("/")[-1]
        
        # 处理 sudo 前缀
        if first_cmd == "sudo" and len(tokens) > 1:
            first_cmd = tokens[1].lower().split("/")[-1]
            tokens = tokens[1:]

        if first_cmd in SAFE_COMMAND_HEADS:
            if first_cmd == "git":
                subcmd = tokens[1].lower() if len(tokens) > 1 else ""
                if subcmd in SAFE_GIT_SUBCOMMANDS:
                    return RiskAssessment(RiskLevel.SAFE, "常规 Git 查询与查看操作", [])
                else:
                    return RiskAssessment(RiskLevel.MODERATE, "Git 变更与仓库操作", [])
            elif first_cmd in ("sed", "perl") and "-i" in tokens:
                return RiskAssessment(RiskLevel.MODERATE, "命令包含原文件就地修改参数 (-i)", ["-i"])
            else:
                return RiskAssessment(RiskLevel.SAFE, "只读信息查询命令，无写破坏性", [])

    # 4. 其余普通修改命令 (如 mkdir, cp, mv, curl, tar, python, node 等)
    return RiskAssessment(
        RiskLevel.MODERATE,
        "普通操作/修改命令，将在执行前请求确认",
        [],
    )
