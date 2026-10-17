"""系统上下文探针模块：收集当前操作系统、Shell、发行版、路径、Git 与资源信息，为大模型提供精准执行环境."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class SystemContext:
    os_name: str
    os_version: str
    architecture: str
    distro: str
    shell: str
    username: str
    is_root: bool
    cwd: str
    home_dir: str
    git_branch: Optional[str] = None
    git_dirty: bool = False
    available_pkg_managers: str = ""

    def get_summary_prompt(self) -> str:
        """生成供 LLM 提示词注入的上下文摘要"""
        info_lines = [
            f"- 操作系统: {self.os_name} {self.os_version} ({self.architecture})",
            f"- 系统发行版/环境: {self.distro}",
            f"- 当前使用的 Shell: {self.shell}",
            f"- 当前用户: {self.username} {'(管理员/Root)' if self.is_root else '(普通用户)'}",
            f"- 当前工作目录: {self.cwd}",
            f"- 可用包管理器/常用工具: {self.available_pkg_managers or '无检测到'}",
        ]
        if self.git_branch:
            info_lines.append(
                f"- Git 状态: 分支 [{self.git_branch}], {'有未提交修改' if self.git_dirty else '工作区干净'}"
            )
        return "\n".join(info_lines)


def detect_distro() -> str:
    """检测具体的 Linux 发行版或 macOS 版本"""
    sys_name = platform.system()
    if sys_name == "Darwin":
        mac_ver, _, _ = platform.mac_ver()
        return f"macOS {mac_ver or 'Unknown'}"
    elif sys_name == "Linux":
        os_release_path = Path("/etc/os-release")
        if os_release_path.is_file():
            try:
                with open(os_release_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("PRETTY_NAME="):
                            return line.split("=", 1)[1].strip().strip('"')
            except Exception:
                pass
        return "Generic Linux"
    elif sys_name == "Windows":
        return f"Windows {platform.version()}"
    return sys_name


def detect_pkg_managers() -> str:
    """快速嗅探常见的包管理器与容器工具"""
    tools = ["brew", "apt-get", "apt", "yum", "dnf", "pacman", "apk", "docker", "systemctl", "ufw"]
    found = [t for t in tools if shutil.which(t) is not None]
    return ", ".join(found)


def detect_git_status() -> tuple[Optional[str], bool]:
    """检测当前目录是否处于 Git 仓库以及分支与状态"""
    try:
        branch_res = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1,
        )
        if branch_res.returncode != 0:
            return None, False

        branch = branch_res.stdout.strip()

        status_res = subprocess.run(
            ["git", "status", "--porcelain"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1,
        )
        dirty = bool(status_res.stdout.strip())
        return branch, dirty
    except Exception:
        return None, False


def get_current_context() -> SystemContext:
    """收集当前的系统完整环境状态"""
    cwd = str(Path.cwd())
    home = str(Path.home())
    git_branch, git_dirty = detect_git_status()

    is_root = False
    try:
        is_root = (os.geteuid() == 0)  # Unix only
    except AttributeError:
        pass

    shell = os.getenv("SHELL", "bash")
    username = os.getenv("USER") or os.getenv("USERNAME") or "user"

    return SystemContext(
        os_name=platform.system(),
        os_version=platform.release(),
        architecture=platform.machine(),
        distro=detect_distro(),
        shell=shell,
        username=username,
        is_root=is_root,
        cwd=cwd,
        home_dir=home,
        git_branch=git_branch,
        git_dirty=git_dirty,
        available_pkg_managers=detect_pkg_managers(),
    )
