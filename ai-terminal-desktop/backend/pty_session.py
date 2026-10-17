"""本地虚拟终端 (PTY) 会话管理，用于驱动本地 Shell 并与 WebSocket 进行双向流式透传."""

from __future__ import annotations

import asyncio
import os
import platform
import struct
import subprocess
import threading
from typing import Optional

try:
    import fcntl
    import pty
    import termios
    HAS_UNIX_PTY = True
except ImportError:
    fcntl = None
    pty = None
    termios = None
    HAS_UNIX_PTY = False


class PTYSession:
    def __init__(self, cols: int = 80, rows: int = 24):
        self.cols = cols
        self.rows = rows
        self.master_fd: Optional[int] = None
        self.pid: Optional[int] = None
        self.proc: Optional[subprocess.Popen] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._read_callback = None
        is_win = platform.system() == "Windows"
        self.os_info = {
            "os_name": platform.system(),
            "distro": f"Windows {platform.release()}" if is_win else "macOS",
            "arch": platform.machine(),
            "username": os.getenv("USERNAME" if is_win else "USER", "user"),
            "is_root": False if is_win else (os.geteuid() == 0 if hasattr(os, "geteuid") else False),
        }

    def start(self, read_callback):
        self._read_callback = read_callback
        self._loop = asyncio.get_event_loop()

        if HAS_UNIX_PTY and platform.system() != "Windows":
            # Unix / macOS PTY 机制
            self.master_fd, slave_fd = pty.openpty()
            self.resize(self.cols, self.rows)

            shell = os.getenv("SHELL", "/bin/zsh" if os.path.exists("/bin/zsh") else "/bin/bash")
            pid = os.fork()
            if pid == 0:
                os.close(self.master_fd)
                os.setsid()
                fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
                os.dup2(slave_fd, 0)
                os.dup2(slave_fd, 1)
                os.dup2(slave_fd, 2)
                if slave_fd > 2:
                    os.close(slave_fd)

                env = os.environ.copy()
                env["TERM"] = "xterm-256color"
                env["COLORTERM"] = "truecolor"
                env["CLICOLOR"] = "1"
                env["LSCOLORS"] = "Gxfxcxdxbxegedabagacad"
                env["LANG"] = "en_US.UTF-8"
                os.execvpe(shell, [shell, "-l"], env)
            else:
                os.close(slave_fd)
                self.pid = pid
                self._loop.add_reader(self.master_fd, self._on_read)
        else:
            # Windows 进程管理 (PowerShell / CMD)
            shell_cmd = ["powershell.exe", "-NoLogo"] if os.path.exists(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe") else ["cmd.exe"]
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            self.proc = subprocess.Popen(
                shell_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=0,
                env=env,
            )
            self.pid = self.proc.pid

            def _win_read_loop():
                while self.proc and self.proc.poll() is None:
                    try:
                        read_fn = getattr(self.proc.stdout, "read1", self.proc.stdout.read)
                        data = read_fn(16384)
                        if not data:
                            break
                        if self._loop and self._read_callback:
                            asyncio.run_coroutine_threadsafe(
                                self._read_callback(data),
                                self._loop,
                            )
                    except Exception:
                        break
                self.close()

            threading.Thread(target=_win_read_loop, daemon=True).start()

    def _on_read(self):
        try:
            data = os.read(self.master_fd, 16384)
            if data:
                asyncio.create_task(self._read_callback(data))
            else:
                self.close()
        except OSError:
            self.close()

    def write(self, data: str | bytes):
        if isinstance(data, str):
            data = data.encode("utf-8")

        if self.master_fd is not None:
            try:
                os.write(self.master_fd, data)
            except OSError:
                pass
        elif self.proc and self.proc.stdin:
            try:
                self.proc.stdin.write(data)
                self.proc.stdin.flush()
            except Exception:
                pass

    def resize(self, cols: int, rows: int):
        self.cols = cols
        self.rows = rows
        if self.master_fd is not None and HAS_UNIX_PTY:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    def close(self):
        if self.master_fd is not None and self._loop:
            try:
                self._loop.remove_reader(self.master_fd)
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None
        if self.proc is not None:
            try:
                self.proc.terminate()
            except Exception:
                pass
            self.proc = None
        if self.pid is not None and platform.system() != "Windows":
            try:
                os.kill(self.pid, 9)
            except Exception:
                pass
            self.pid = None

    def get_metrics(self):
        import shutil
        disk = shutil.disk_usage("/")
        load_1, load_5, load_15 = os.getloadavg() if hasattr(os, "getloadavg") else (0.1, 0.1, 0.1)

        def fmt_sz(b):
            mb = b / (1024 * 1024)
            if mb < 1024:
                return f"{mb:.0f}M"
            return f"{mb/1024:.1f}G"

        return {
            "online": True,
            "cpu": {
                "percent": min(100.0, round(load_1 * 12.0, 1)),
                "cores": os.cpu_count() or 4,
            },
            "memory": {
                "total_kb": 16 * 1024 * 1024,
                "used_kb": 8 * 1024 * 1024,
                "percent": 50.0,
                "total_str": "16G",
                "used_str": "8G",
            },
            "swap": {
                "total_kb": 0,
                "used_kb": 0,
                "percent": 0.0,
                "total_str": "0M",
                "used_str": "0M",
            },
            "disk": {
                "total_kb": int(disk.total / 1024),
                "used_kb": int(disk.used / 1024),
                "percent": round(disk.used / disk.total * 100, 1) if disk.total > 0 else 0.0,
                "total_str": fmt_sz(disk.total),
                "used_str": fmt_sz(disk.used),
            },
            "network": {
                "rx_rate": 0,
                "tx_rate": 0,
                "rx_str": "--",
                "tx_str": "--",
            },
            "load": {
                "load_1": round(load_1, 2),
                "load_5": round(load_5, 2),
                "load_15": round(load_15, 2),
                "procs": "--",
            },
            "uptime": {
                "seconds": 0,
                "str": "本地 macOS",
            },
        }

    def list_dir(self, path: str = ".") -> dict:
        import os
        import posixpath
        import stat
        import time

        clean_path = (path or ".").strip()
        home_dir = os.path.expanduser("~")
        if not clean_path or clean_path == "~":
            clean_path = home_dir
        else:
            clean_path = os.path.expanduser(clean_path)

        abs_path = os.path.realpath(os.path.abspath(clean_path))
        if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
            abs_path = home_dir
        items = []

        try:
            with os.scandir(abs_path) as it:
                for entry in it:
                    if entry.name.startswith("."):
                        continue
                    try:
                        st = entry.stat(follow_symlinks=False)
                        is_dir = entry.is_dir(follow_symlinks=False)
                        is_link = entry.is_symlink()
                        size = st.st_size
                        mtime = st.st_mtime
                        permissions = oct(st.st_mode)[-3:]

                        if is_dir:
                            size_str = "--"
                        elif size < 1024:
                            size_str = f"{size} B"
                        elif size < 1024 * 1024:
                            size_str = f"{size / 1024:.1f} KB"
                        elif size < 1024 * 1024 * 1024:
                            size_str = f"{size / (1024 * 1024):.1f} MB"
                        else:
                            size_str = f"{size / (1024 * 1024 * 1024):.2f} GB"

                        try:
                            mtime_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime))
                        except Exception:
                            mtime_str = "--"

                        items.append({
                            "name": entry.name,
                            "is_dir": is_dir,
                            "is_link": is_link,
                            "size": size,
                            "size_str": size_str,
                            "mtime": mtime,
                            "mtime_str": mtime_str,
                            "permissions": permissions,
                        })
                    except Exception:
                        pass

            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            parent_path = posixpath.dirname(abs_path.rstrip("/"))
            if not parent_path:
                parent_path = "/"

            return {
                "current_path": abs_path,
                "parent_path": parent_path,
                "items": items,
            }
        except Exception as e:
            raise RuntimeError(f"读取本地目录失败 [{abs_path}]: {str(e)}")

    def read_file_stream(self, path: str):
        full_path = os.path.expanduser(path)
        with open(full_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk

    def write_file_stream(self, path: str, chunks_iterable):
        full_path = os.path.expanduser(path)
        with open(full_path, "wb") as f:
            for chunk in chunks_iterable:
                if chunk:
                    f.write(chunk)

    def delete_item(self, path: str):
        import shutil
        full_path = os.path.expanduser(path)
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)

    def make_dir(self, path: str):
        full_path = os.path.expanduser(path)
        os.makedirs(full_path, exist_ok=True)

    def rename_item(self, old_path: str, new_path: str):
        old_full = os.path.expanduser(old_path)
        new_full = os.path.expanduser(new_path)
        os.rename(old_full, new_full)

    def read_text_file(self, path: str, max_size: int = 2 * 1024 * 1024) -> str:
        full_path = os.path.expanduser(path)
        size = os.path.getsize(full_path)
        if size > max_size:
            raise ValueError(f"文件大小 ({size / 1024:.1f} KB) 超过限制 (2 MB)")
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def write_text_file(self, path: str, content: str):
        full_path = os.path.expanduser(path)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

    def extract_archive(self, archive_path: str, target_dir: Optional[str] = None) -> dict:
        import os
        import posixpath
        import shutil
        full_archive = os.path.realpath(os.path.abspath(os.path.expanduser(archive_path)))
        if not target_dir:
            target_dir = os.path.dirname(full_archive)
        else:
            target_dir = os.path.realpath(os.path.abspath(os.path.expanduser(target_dir)))
        os.makedirs(target_dir, exist_ok=True)
        shutil.unpack_archive(full_archive, target_dir)
        return {"status": "extracted", "target_dir": target_dir}

    def compress_files(self, paths: list, archive_name: str, archive_type: str = "tar.gz") -> dict:
        import os
        import tarfile
        import zipfile
        full_arch = os.path.realpath(os.path.abspath(os.path.expanduser(archive_name)))
        if archive_type == "zip" or archive_name.lower().endswith(".zip"):
            with zipfile.ZipFile(full_arch, "w", zipfile.ZIP_DEFLATED) as z:
                for p in paths:
                    fp = os.path.realpath(os.path.abspath(os.path.expanduser(p)))
                    if os.path.isdir(fp):
                        for root, _, files in os.walk(fp):
                            for file in files:
                                item_p = os.path.join(root, file)
                                z.write(item_p, os.path.relpath(item_p, os.path.dirname(fp)))
                    else:
                        z.write(fp, os.path.basename(fp))
        else:
            with tarfile.open(full_arch, "w:gz") as t:
                for p in paths:
                    fp = os.path.realpath(os.path.abspath(os.path.expanduser(p)))
                    t.add(fp, arcname=os.path.basename(fp))
        return {"status": "compressed", "archive": full_arch}

    def chmod_item(self, path: str, mode: str, recursive: bool = False) -> dict:
        import os
        full_path = os.path.realpath(os.path.abspath(os.path.expanduser(path)))
        int_mode = int(mode.strip(), 8)
        if recursive and os.path.isdir(full_path):
            for root, dirs, files in os.walk(full_path):
                os.chmod(root, int_mode)
                for f in files:
                    os.chmod(os.path.join(root, f), int_mode)
        else:
            os.chmod(full_path, int_mode)
        return {"status": "chmod_success", "path": full_path, "mode": mode}

    def search_files(self, base_path: str = ".", query: str = "", max_results: int = 50) -> list:
        import os
        full_base = os.path.realpath(os.path.abspath(os.path.expanduser(base_path)))
        clean_q = query.strip().lower()
        if not clean_q:
            return []
        results = []
        for root, dirs, files in os.walk(full_base):
            # 限制深度 4 层
            rel_depth = len(os.path.relpath(root, full_base).split(os.sep))
            if rel_depth > 4:
                continue
            for name in dirs + files:
                if clean_q in name.lower():
                    fp = os.path.join(root, name)
                    is_dir = os.path.isdir(fp)
                    size = 0
                    size_str = "--"
                    try:
                        if not is_dir:
                            size = os.path.getsize(fp)
                            if size < 1024:
                                size_str = f"{size} B"
                            elif size < 1024 * 1024:
                                size_str = f"{size / 1024:.1f} KB"
                            elif size < 1024 * 1024 * 1024:
                                size_str = f"{size / (1024 * 1024):.1f} MB"
                            else:
                                size_str = f"{size / (1024 * 1024 * 1024):.2f} GB"
                    except Exception:
                        pass
                    results.append({
                        "path": fp,
                        "name": name,
                        "is_dir": is_dir,
                        "size": size,
                        "size_str": size_str,
                    })
                    if len(results) >= max_results:
                        return results
        return results

    def find_big_files(self, base_path: str = "/", min_size_mb: int = 50, max_results: int = 30) -> list:
        import os
        full_base = os.path.realpath(os.path.abspath(os.path.expanduser(base_path)))
        min_bytes = min_size_mb * 1024 * 1024
        results = []
        for root, _, files in os.walk(full_base):
            for file in files:
                fp = os.path.join(root, file)
                try:
                    st = os.stat(fp)
                    if st.st_size >= min_bytes:
                        size_mb = st.st_size / (1024 * 1024)
                        size_str = f"{size_mb:.1f} MB" if size_mb < 1024 else f"{size_mb/1024:.2f} GB"
                        results.append({
                            "path": fp,
                            "name": file,
                            "size_str": size_str,
                            "size": st.st_size,
                            "permissions": oct(st.st_mode)[-3:],
                        })
                        if len(results) >= max_results:
                            return results
                except Exception:
                    pass
        return results

    def get_system_ports(self) -> list:
        # 本地会话模拟或返回安全空列表
        return []

    def get_system_processes(self, limit: int = 35) -> list:
        return []

    def kill_process(self, pid: int, signal: int = 9) -> dict:
        import os
        os.kill(pid, signal)
        return {"status": "killed", "pid": pid, "signal": signal}

    def get_docker_containers(self) -> dict:
        return {"installed": False, "containers": []}

    def docker_action(self, container_id: str, action: str) -> dict:
        return {"status": "success", "container_id": container_id, "action": action}

    def get_docker_logs(self, container_id: str, tail: int = 150) -> str:
        return ""

    def collect_health_data(self) -> dict:
        return {"raw": "macOS local session", "os_info": self.os_info}
