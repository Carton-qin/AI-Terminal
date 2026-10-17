"""命令执行引擎：处理 Shell 执行、流式输出渲染、状态同步 (cd) 与异常捕获."""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class ExecutionResult:
    command: str
    returncode: int
    stdout: str
    stderr: str
    duration_ms: float
    interrupted: bool = False

    @property
    def is_success(self) -> bool:
        return self.returncode == 0 and not self.interrupted

    @property
    def combined_output(self) -> str:
        out = self.stdout.strip()
        err = self.stderr.strip()
        if out and err:
            return f"{out}\n{err}"
        return out or err


class CommandExecutor:
    def __init__(self):
        self.old_pwd: str = str(Path.cwd())

    def _handle_cd(self, command_str: str) -> Optional[ExecutionResult]:
        """专门处理内建 cd 命令，保证 Python 进程工作目录状态同步"""
        stripped = command_str.strip()
        if not (stripped == "cd" or stripped.startswith("cd ") or stripped.startswith("cd\t")):
            return None

        start_time = time.time()
        parts = stripped.split(maxsplit=1)
        target = parts[1].strip() if len(parts) > 1 else "~"

        # 处理引号
        if (target.startswith('"') and target.endswith('"')) or (target.startswith("'") and target.endswith("'")):
            target = target[1:-1]

        # 展开 ~
        if target.startswith("~"):
            target = os.path.expanduser(target)

        # 处理 cd -
        if target == "-":
            target = self.old_pwd

        try:
            target_path = Path(target).resolve()
            if not target_path.exists():
                return ExecutionResult(
                    command=command_str,
                    returncode=1,
                    stdout="",
                    stderr=f"cd: no such file or directory: {target}\n",
                    duration_ms=(time.time() - start_time) * 1000,
                )
            if not target_path.is_dir():
                return ExecutionResult(
                    command=command_str,
                    returncode=1,
                    stdout="",
                    stderr=f"cd: not a directory: {target}\n",
                    duration_ms=(time.time() - start_time) * 1000,
                )

            current = str(Path.cwd())
            os.chdir(target_path)
            self.old_pwd = current
            os.environ["PWD"] = str(target_path)
            os.environ["OLDPWD"] = current

            return ExecutionResult(
                command=command_str,
                returncode=0,
                stdout="",
                stderr="",
                duration_ms=(time.time() - start_time) * 1000,
            )
        except Exception as e:
            return ExecutionResult(
                command=command_str,
                returncode=1,
                stdout="",
                stderr=f"cd: 发生错误: {str(e)}\n",
                duration_ms=(time.time() - start_time) * 1000,
            )

    def execute(self, command: str, stream: bool = True) -> ExecutionResult:
        """执行 Shell 命令并实时流式打印输出，同时捕获完整的 stdout 与 stderr"""
        # 1. 优先检查内建 cd
        cd_res = self._handle_cd(command)
        if cd_res is not None:
            if not cd_res.is_success:
                sys.stderr.write(cd_res.stderr)
            return cd_res

        start_time = time.time()
        output_buffer: list[str] = []
        interrupted = False
        returncode = 0

        # 如果包含 cd && ...，在执行后尝试检查并同步目录
        cd_match = re.search(r"\bcd\s+([^\s;&|]+)", command)

        # 启动子进程
        # 使用当前 shell 或 /bin/sh
        shell_bin = os.getenv("SHELL", "/bin/bash")
        if not Path(shell_bin).exists():
            shell_bin = "/bin/sh"

        process = None
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                executable=shell_bin,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # 合并输出以保持控制台时序一致
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=str(Path.cwd()),
            )

            if process.stdout:
                for line in iter(process.stdout.readline, ""):
                    if stream:
                        sys.stdout.write(line)
                        sys.stdout.flush()
                    output_buffer.append(line)
                process.stdout.close()

            process.wait()
            returncode = process.returncode

        except KeyboardInterrupt:
            interrupted = True
            returncode = 130
            if process:
                try:
                    process.terminate()
                    process.wait(timeout=1)
                except Exception:
                    try:
                        process.kill()
                    except Exception:
                        pass
            sys.stdout.write("\n[命令已被用户按 Ctrl+C 中断]\n")
            sys.stdout.flush()
        except Exception as e:
            returncode = 1
            err_msg = f"\n执行命令失败: {str(e)}\n"
            sys.stderr.write(err_msg)
            output_buffer.append(err_msg)

        duration = (time.time() - start_time) * 1000
        full_output = "".join(output_buffer)

        # 如果复合命令中有 cd 且执行成功，尝试同步当前进程目录
        if returncode == 0 and cd_match:
            try:
                # 获取执行后的真实 pwd
                check_pwd = subprocess.run(
                    f"{command} && pwd",
                    shell=True,
                    executable=shell_bin,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                if check_pwd.returncode == 0:
                    lines = check_pwd.stdout.strip().splitlines()
                    if lines:
                        new_dir = lines[-1].strip()
                        if Path(new_dir).is_dir() and new_dir != str(Path.cwd()):
                            self.old_pwd = str(Path.cwd())
                            os.chdir(new_dir)
            except Exception:
                pass

        return ExecutionResult(
            command=command,
            returncode=returncode,
            stdout=full_output if returncode == 0 else "",
            stderr=full_output if returncode != 0 else "",
            duration_ms=duration,
            interrupted=interrupted,
        )
