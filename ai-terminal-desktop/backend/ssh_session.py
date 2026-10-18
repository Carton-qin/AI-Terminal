"""远程 SSH / SFTP 会话管理，用于连接 VPS 并与前端 xterm.js 进行双向终端渲染."""

from __future__ import annotations

import asyncio
import io
import threading
from typing import Any, Dict, List, Optional
import paramiko


class SSHSession:
    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = "root",
        password: Optional[str] = None,
        private_key_str: Optional[str] = None,
        cols: int = 80,
        rows: int = 24,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.private_key_str = private_key_str
        self.cols = cols
        self.rows = rows

        self.client: Optional[paramiko.SSHClient] = None
        self.channel: Optional[paramiko.Channel] = None
        self.sftp_client: Optional[paramiko.SFTPClient] = None
        self._read_callback = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._is_running = False
        self._metrics_running = False
        self.latest_metrics: Optional[Dict[str, Any]] = None
        self.last_terminal_input: float = 0.0
        self.last_terminal_output: float = 0.0

    def connect(self, read_callback, loop: Optional[asyncio.AbstractEventLoop] = None):
        self._read_callback = read_callback
        self._loop = loop

        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        pkey = None
        if self.private_key_str:
            key_file = io.StringIO(self.private_key_str)
            try:
                pkey = paramiko.RSAKey.from_private_key(key_file)
            except Exception:
                try:
                    key_file.seek(0)
                    pkey = paramiko.Ed25519Key.from_private_key(key_file)
                except Exception:
                    pass

        self.client.connect(
            hostname=self.host.strip() if isinstance(self.host, str) else self.host,
            port=int(self.port) if self.port else 22,
            username=self.username.strip() if isinstance(self.username, str) else self.username,
            password=self.password if not pkey else None,
            pkey=pkey,
            timeout=15,
            banner_timeout=30,
            look_for_keys=(pkey is not None),
            allow_agent=(pkey is not None),
        )

        # 启用 TCP_NODELAY，禁用 Nagle 缓冲算法，消除 40~200ms 交互延迟
        try:
            import socket
            transport = self.client.get_transport()
            if transport and hasattr(transport, "sock") and transport.sock:
                transport.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception:
            pass

        # 自动探测远端 VPS 的操作系统架构、发行版与环境
        self.os_info = {
            "os_name": "Linux",
            "distro": "Linux (Debian/Ubuntu/CentOS)",
            "arch": "x86_64",
            "username": self.username,
            "is_root": (self.username == "root"),
        }
        try:
            _, stdout, _ = self.client.exec_command(
                "uname -s; uname -m; cat /etc/os-release 2>/dev/null",
                timeout=3,
            )
            raw = stdout.read().decode("utf-8", errors="ignore").splitlines()
            if len(raw) >= 1 and raw[0].strip():
                self.os_info["os_name"] = raw[0].strip()
            if len(raw) >= 2 and raw[1].strip():
                self.os_info["arch"] = raw[1].strip()
            for line in raw[2:]:
                if line.startswith("PRETTY_NAME="):
                    self.os_info["distro"] = line.split("=", 1)[1].strip().strip('"')
                    break
                elif line.startswith("NAME=") and self.os_info["distro"] == "Linux (Debian/Ubuntu/CentOS)":
                    self.os_info["distro"] = line.split("=", 1)[1].strip().strip('"')
        except Exception:
            pass

        self.channel = self.client.invoke_shell(
            term="xterm-256color",
            width=self.cols,
            height=self.rows,
        )

        self._is_running = True
        # 启动后延时 350ms 自动优化远端 Shell 环境变量与彩色高亮 Prompt
        def _init_shell_env():
            import time
            time.sleep(0.35)
            if self.channel and not self.channel.closed:
                init_cmd = (
                    "export TERM=xterm-256color COLORTERM=truecolor; "
                    "export PROMPT_COMMAND='printf \"\\033]7;file://%s%s\\033\\\\\" \"$HOSTNAME\" \"$PWD\" 2>/dev/null'; "
                    "[ -n \"$BASH_VERSION\" ] && export PS1='\\[\\e[38;5;45m\\]\\u\\[\\e[38;5;244m\\]@\\[\\e[38;5;81m\\]\\h\\[\\e[38;5;244m\\]:\\[\\e[38;5;141m\\]\\w\\[\\e[38;5;45m\\]\\\\$ \\[\\e[0m\\]'; "
                    "alias ls='ls --color=auto' 2>/dev/null; "
                    "alias ll='ls -la --color=auto' 2>/dev/null; "
                    "alias grep='grep --color=auto' 2>/dev/null; "
                    "clear\n"
                )
                try:
                    self.channel.send(init_cmd.encode("utf-8"))
                except Exception:
                    pass

        threading.Thread(target=_init_shell_env, daemon=True).start()

        # 在独立后台线程中读取通道输出，避免阻塞 asyncio 事件循环
        t = threading.Thread(target=self._read_loop, daemon=True)
        t.start()

        # 启动 FinalShell 风格实时 VPS 状态采样监控线程
        self._metrics_running = True
        t_metrics = threading.Thread(target=self._metrics_loop, daemon=True)
        t_metrics.start()

    def _read_loop(self):
        import time
        while self._is_running and self.channel and not self.channel.closed:
            try:
                if self.channel.recv_ready():
                    chunks = []
                    total_bytes = 0
                    while self.channel.recv_ready() and total_bytes < 32768:
                        chunk = self.channel.recv(16384)
                        if not chunk:
                            break
                        chunks.append(chunk)
                        total_bytes += len(chunk)
                    if not chunks:
                        break
                    data = b"".join(chunks) if len(chunks) > 1 else chunks[0]
                    self.last_terminal_output = time.time()
                    if self._loop and self._read_callback:
                        asyncio.run_coroutine_threadsafe(
                            self._read_callback(data),
                            self._loop,
                        )
                else:
                    time.sleep(0.005)
            except Exception:
                break
        self.close()

    def write(self, data: str | bytes):
        import time
        self.last_terminal_input = time.time()
        if self.channel and not self.channel.closed:
            if isinstance(data, str):
                data = data.encode("utf-8")
            try:
                self.channel.send(data)
            except Exception:
                pass

    def resize(self, cols: int, rows: int):
        self.cols = cols
        self.rows = rows
        if self.channel and not self.channel.closed:
            try:
                self.channel.resize_pty(width=cols, height=rows)
            except Exception:
                pass

    def get_sftp(self) -> paramiko.SFTPClient:
        import time
        if self.sftp_client:
            try:
                if self.sftp_client.sock and not self.sftp_client.sock.closed:
                    return self.sftp_client
            except Exception:
                self.sftp_client = None

        for _ in range(25):
            if self.client:
                transport = self.client.get_transport()
                if transport and transport.is_active():
                    try:
                        self.sftp_client = self.client.open_sftp()
                        return self.sftp_client
                    except Exception:
                        time.sleep(0.08)
                else:
                    time.sleep(0.08)
            else:
                time.sleep(0.08)

        if self.client:
            self.sftp_client = self.client.open_sftp()
            return self.sftp_client
        raise RuntimeError("SSH 客户端未连接或已断开")

    def list_dir(self, remote_path: str = ".") -> Dict[str, Any]:
        sftp = self.get_sftp()
        import stat
        import time
        import posixpath

        home_dir = "/root"
        try:
            home_dir = sftp.normalize(".")
        except Exception:
            home_dir = "/root" if self.username == "root" else f"/home/{self.username}"

        clean_path = (remote_path or ".").strip()
        if not clean_path or clean_path in (".", "~"):
            clean_path = home_dir
        elif clean_path.startswith("~/"):
            clean_path = posixpath.join(home_dir, clean_path[2:])

        try:
            try:
                abs_path = sftp.normalize(clean_path)
                items_raw = sftp.listdir_attr(abs_path)
            except Exception:
                # 若请求路径在远端不存在 (如切换会话时传来的本地路径)，平滑回退至远端家目录
                abs_path = home_dir
                items_raw = sftp.listdir_attr(abs_path)

            items = []
            for attr in items_raw:
                name = attr.filename
                if name in (".", ".."):
                    continue
                is_dir = stat.S_ISDIR(attr.st_mode)
                is_link = stat.S_ISLNK(attr.st_mode)
                size = attr.st_size
                mtime = attr.st_mtime
                permissions = oct(attr.st_mode)[-3:]

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
                    "name": name,
                    "is_dir": is_dir,
                    "is_link": is_link,
                    "size": size,
                    "size_str": size_str,
                    "mtime": mtime,
                    "mtime_str": mtime_str,
                    "permissions": permissions,
                })

            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            parent_path = posixpath.dirname(abs_path.rstrip("/"))
            if not parent_path:
                parent_path = "/"

            self.current_cwd = abs_path
            return {
                "current_path": abs_path,
                "parent_path": parent_path,
                "items": items,
            }
        except Exception as e:
            raise RuntimeError(f"读取目录失败 [{clean_path}]: {str(e)}")

    def read_file_stream(self, remote_path: str):
        sftp = self.get_sftp()
        remote_file = sftp.open(remote_path, "rb")
        try:
            while True:
                chunk = remote_file.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            remote_file.close()

    def write_file_stream(self, remote_path: str, chunks_iterable):
        sftp = self.get_sftp()
        with sftp.open(remote_path, "wb") as f:
            for chunk in chunks_iterable:
                if chunk:
                    f.write(chunk)

    def delete_item(self, remote_path: str):
        sftp = self.get_sftp()
        import stat
        import shlex
        try:
            attr = sftp.stat(remote_path)
            if stat.S_ISDIR(attr.st_mode):
                try:
                    sftp.rmdir(remote_path)
                except Exception:
                    if self.client:
                        self.client.exec_command(f"rm -rf {shlex.quote(remote_path)}")
            else:
                sftp.remove(remote_path)
        except Exception:
            if self.client:
                self.client.exec_command(f"rm -rf {shlex.quote(remote_path)}")

    def make_dir(self, remote_path: str):
        sftp = self.get_sftp()
        sftp.mkdir(remote_path)

    def rename_item(self, old_path: str, new_path: str):
        sftp = self.get_sftp()
        sftp.rename(old_path, new_path)

    def read_text_file(self, remote_path: str, max_size: int = 2 * 1024 * 1024) -> str:
        sftp = self.get_sftp()
        attr = sftp.stat(remote_path)
        if attr.st_size > max_size:
            raise ValueError(f"文件大小 ({attr.st_size / 1024:.1f} KB) 超过在线预览/编辑限制 (2 MB)")
        with sftp.open(remote_path, "rb") as f:
            return f.read().decode("utf-8", errors="replace")

    def write_text_file(self, remote_path: str, content: str):
        sftp = self.get_sftp()
        with sftp.open(remote_path, "wb") as f:
            f.write(content.encode("utf-8"))

    def extract_archive(self, archive_path: str, target_dir: Optional[str] = None) -> Dict[str, Any]:
        import shlex
        import posixpath
        if not target_dir:
            target_dir = posixpath.dirname(archive_path.rstrip("/")) or "."

        name = archive_path.lower()
        q_arch = shlex.quote(archive_path)
        q_target = shlex.quote(target_dir)

        if name.endswith(".zip"):
            cmd = f"unzip -o {q_arch} -d {q_target}"
        elif name.endswith(".tar.gz") or name.endswith(".tgz"):
            cmd = f"tar -zxvf {q_arch} -C {q_target}"
        elif name.endswith(".tar.bz2") or name.endswith(".tbz2"):
            cmd = f"tar -jxvf {q_arch} -C {q_target}"
        elif name.endswith(".tar.xz") or name.endswith(".txz"):
            cmd = f"tar -Jxvf {q_arch} -C {q_target}"
        elif name.endswith(".tar"):
            cmd = f"tar -xvf {q_arch} -C {q_target}"
        elif name.endswith(".gz"):
            cmd = f"gzip -dk {q_arch}"
        else:
            raise ValueError("不支持的压缩格式 (支持 .zip, .tar.gz, .tgz, .tar.bz2, .tar.xz, .tar, .gz)")

        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        _, stdout, stderr = self.client.exec_command(f"mkdir -p {q_target} && {cmd}", timeout=30)
        exit_code = stdout.channel.recv_exit_status()
        out_msg = stdout.read().decode("utf-8", errors="ignore")
        err_msg = stderr.read().decode("utf-8", errors="ignore")
        if exit_code != 0:
            raise RuntimeError(f"解压失败 (code {exit_code}): {err_msg or out_msg}")
        return {"status": "extracted", "target_dir": target_dir, "output": out_msg[:500]}

    def compress_files(self, paths: List[str], archive_name: str, archive_type: str = "tar.gz") -> Dict[str, Any]:
        import shlex
        if not paths:
            raise ValueError("请指定要压缩的文件或目录")

        q_paths = " ".join(shlex.quote(p) for p in paths)
        q_arch = shlex.quote(archive_name)

        if archive_type == "zip" or archive_name.lower().endswith(".zip"):
            cmd = f"zip -r {q_arch} {q_paths}"
        else:
            cmd = f"tar -zcvf {q_arch} {q_paths}"

        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        _, stdout, stderr = self.client.exec_command(cmd, timeout=60)
        exit_code = stdout.channel.recv_exit_status()
        out_msg = stdout.read().decode("utf-8", errors="ignore")
        err_msg = stderr.read().decode("utf-8", errors="ignore")
        if exit_code != 0:
            raise RuntimeError(f"压缩失败 (code {exit_code}): {err_msg or out_msg}")
        return {"status": "compressed", "archive": archive_name}

    def chmod_item(self, remote_path: str, mode: str, recursive: bool = False) -> Dict[str, Any]:
        import shlex
        clean_mode = mode.strip()
        if not clean_mode.isdigit() or len(clean_mode) not in (3, 4):
            raise ValueError("权限格式不正确 (应为三位或四位八进制数字，如 755 或 0644)")

        if recursive:
            cmd = f"chmod -R {clean_mode} {shlex.quote(remote_path)}"
            if self.client:
                _, stdout, stderr = self.client.exec_command(cmd, timeout=10)
                if stdout.channel.recv_exit_status() != 0:
                    raise RuntimeError(stderr.read().decode("utf-8", errors="ignore"))
        else:
            sftp = self.get_sftp()
            sftp.chmod(remote_path, int(clean_mode, 8))
        return {"status": "chmod_success", "path": remote_path, "mode": clean_mode}

    def search_files(self, base_path: str = ".", query: str = "", max_results: int = 50) -> List[Dict[str, Any]]:
        import shlex
        import stat
        import posixpath
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        clean_q = query.strip()
        if not clean_q:
            return []

        cmd = f"find {shlex.quote(base_path)} -maxdepth 4 -iname {shlex.quote(f'*{clean_q}*')} 2>/dev/null | head -n {max_results}"
        _, stdout, _ = self.client.exec_command(cmd, timeout=8)
        paths = [p.strip() for p in stdout.read().decode("utf-8", errors="ignore").splitlines() if p.strip()]

        sftp = self.get_sftp()
        results = []
        for p in paths:
            name = posixpath.basename(p)
            is_dir = False
            size = 0
            size_str = "--"
            try:
                attr = sftp.stat(p)
                is_dir = stat.S_ISDIR(attr.st_mode)
                size = attr.st_size
                if not is_dir:
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
                "path": p,
                "name": name,
                "is_dir": is_dir,
                "size": size,
                "size_str": size_str,
            })
        return results

    def find_big_files(self, base_path: str = "/", min_size_mb: int = 50, max_results: int = 30) -> List[Dict[str, Any]]:
        import shlex
        import posixpath
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")

        cmd = f"find {shlex.quote(base_path)} -xdev -type f -size +{min_size_mb}M -exec ls -lh {{}} + 2>/dev/null | head -n {max_results}"
        _, stdout, _ = self.client.exec_command(cmd, timeout=10)
        lines = stdout.read().decode("utf-8", errors="ignore").splitlines()

        results = []
        for l in lines:
            parts = l.split(None, 8)
            if len(parts) >= 9:
                perms, _, owner, _, size_str, _, _, _, file_path = parts
                results.append({
                    "path": file_path.strip(),
                    "name": posixpath.basename(file_path.strip()),
                    "size_str": size_str,
                    "permissions": perms,
                    "owner": owner,
                })
        return results

    def close(self):
        self._is_running = False
        self._metrics_running = False
        if self.channel:
            try:
                self.channel.close()
            except Exception:
                pass
            self.channel = None
        if self.sftp_client:
            try:
                self.sftp_client.close()
            except Exception:
                pass
            self.sftp_client = None
        if self.client:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

    def get_metrics(self) -> Dict[str, Any]:
        """获取当前远端 VPS 最新实测性能指标数据 (FinalShell 监控面板数据源)"""
        if self.latest_metrics:
            return self.latest_metrics
        return {
            "online": True,
            "cpu": {"percent": 0.0, "cores": 1},
            "memory": {"total_str": "--", "used_str": "--", "percent": 0.0},
            "swap": {"total_str": "--", "used_str": "--", "percent": 0.0},
            "disk": {"total_str": "--", "used_str": "--", "percent": 0.0},
            "network": {"rx_str": "--", "tx_str": "--", "rx_rate": 0, "tx_rate": 0},
            "load": {"load_1": 0.0, "load_5": 0.0, "load_15": 0.0, "procs": "--"},
            "uptime": {"seconds": 0, "str": "采样中..."},
        }

    def _metrics_loop(self):
        import time
        prev_cpu = None
        prev_net = None
        prev_time = None

        cmd = (
            "cat /proc/stat | head -n 1; echo '---MEM---'; "
            "cat /proc/meminfo; echo '---NET---'; "
            "cat /proc/net/dev; echo '---LOAD---'; "
            "cat /proc/loadavg; echo '---UPTIME---'; "
            "cat /proc/uptime; echo '---DF---'; "
            "df -k / | tail -n 1; echo '---CORES---'; "
            "grep -c ^processor /proc/cpuinfo 2>/dev/null || nproc 2>/dev/null || echo 1"
        )

        time.sleep(0.5)

        while self._is_running and self._metrics_running and self.client:
            try:
                transport = self.client.get_transport() if self.client else None
                if not transport or not transport.is_active():
                    break

                now_time = time.time()

                # 如果终端前台在过去 1.2 秒内有用户输入或正在流式打印输出，主动延后采样，杜绝与前台终端争抢 SSH Transport 锁与网络带宽
                if (now_time - self.last_terminal_input < 1.2) or (now_time - self.last_terminal_output < 1.2):
                    time.sleep(0.5)
                    continue

                _, stdout, _ = self.client.exec_command(cmd, timeout=4)
                raw = stdout.read().decode("utf-8", errors="ignore")

                dt = (now_time - prev_time) if prev_time else 3.5
                metrics = self._parse_metrics(raw, prev_cpu, prev_net, dt)
                if metrics:
                    self.latest_metrics = metrics
                    raw_cpu = metrics.get("cpu", {}).get("_raw")
                    raw_net = metrics.get("network", {}).get("_raw")
                    if raw_cpu:
                        prev_cpu = raw_cpu
                    if raw_net:
                        prev_net = raw_net
                    prev_time = now_time

                time.sleep(3.5)
            except Exception:
                time.sleep(3.5)

    @staticmethod
    def _parse_metrics(raw: str, prev_cpu=None, prev_net=None, dt: float = 2.5) -> Dict[str, Any]:
        sections: Dict[str, List[str]] = {}
        current_sec = "CPU"
        current_lines: List[str] = []
        for line in raw.splitlines():
            line_str = line.strip()
            if line_str.startswith("---") and line_str.endswith("---"):
                sections[current_sec] = current_lines
                current_sec = line_str.strip("-")
                current_lines = []
            else:
                current_lines.append(line)
        sections[current_sec] = current_lines

        # 1. CPU
        cpu_percent = 0.0
        raw_cpu = None
        cpu_lines = sections.get("CPU", [])
        if cpu_lines:
            parts = cpu_lines[0].split()
            if len(parts) >= 8 and parts[0] == "cpu":
                u, n, s, i = int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4])
                io = int(parts[5]) if len(parts) > 5 else 0
                irq = int(parts[6]) if len(parts) > 6 else 0
                sirq = int(parts[7]) if len(parts) > 7 else 0
                steal = int(parts[8]) if len(parts) > 8 else 0
                idle_all = i + io
                total = u + n + s + i + io + irq + sirq + steal
                raw_cpu = {"idle": idle_all, "total": total}
                if prev_cpu:
                    d_tot = total - prev_cpu["total"]
                    d_idle = idle_all - prev_cpu["idle"]
                    if d_tot > 0:
                        cpu_percent = round((1.0 - d_idle / d_tot) * 100, 1)
                        cpu_percent = max(0.0, min(100.0, cpu_percent))

        # Cores
        cores = 1
        cores_lines = sections.get("CORES", [])
        if cores_lines and cores_lines[0].strip().isdigit():
            cores = int(cores_lines[0].strip())

        # 2. Memory
        mem_total = 0
        mem_avail = 0
        swap_total = 0
        swap_free = 0
        for l in sections.get("MEM", []):
            if l.startswith("MemTotal:"):
                mem_total = int(l.split()[1])
            elif l.startswith("MemAvailable:"):
                mem_avail = int(l.split()[1])
            elif l.startswith("SwapTotal:"):
                swap_total = int(l.split()[1])
            elif l.startswith("SwapFree:"):
                swap_free = int(l.split()[1])

        mem_used = max(0, mem_total - mem_avail)
        mem_percent = round(mem_used / mem_total * 100, 1) if mem_total > 0 else 0.0
        swap_used = max(0, swap_total - swap_free)
        swap_percent = round(swap_used / swap_total * 100, 1) if swap_total > 0 else 0.0

        # 3. Net
        rx_bytes = 0
        tx_bytes = 0
        for l in sections.get("NET", []):
            if ":" in l:
                ifname, data = l.split(":", 1)
                if ifname.strip() != "lo":
                    cols = data.split()
                    if len(cols) >= 9:
                        rx_bytes += int(cols[0])
                        tx_bytes += int(cols[8])
        raw_net = {"rx": rx_bytes, "tx": tx_bytes}
        rx_rate = 0
        tx_rate = 0
        if prev_net and dt > 0:
            rx_rate = max(0, int((rx_bytes - prev_net["rx"]) / dt))
            tx_rate = max(0, int((tx_bytes - prev_net["tx"]) / dt))

        # 4. Load
        load_lines = sections.get("LOAD", [])
        load_1, load_5, load_15 = 0.0, 0.0, 0.0
        procs = "--"
        if load_lines:
            p = load_lines[0].split()
            if len(p) >= 4:
                try:
                    load_1, load_5, load_15 = float(p[0]), float(p[1]), float(p[2])
                    procs = p[3]
                except Exception:
                    pass

        # 5. Uptime
        uptime_lines = sections.get("UPTIME", [])
        uptime_sec = 0
        uptime_str = "0分"
        if uptime_lines:
            try:
                uptime_sec = int(float(uptime_lines[0].split()[0]))
                d = uptime_sec // 86400
                h = (uptime_sec % 86400) // 3600
                m = (uptime_sec % 3600) // 60
                uptime_str = f"{d}天 {h}小时" if d > 0 else f"{h}小时 {m}分"
            except Exception:
                pass

        # 6. Disk
        df_lines = sections.get("DF", [])
        disk_total = 0
        disk_used = 0
        disk_percent = 0.0
        if df_lines:
            dp = df_lines[0].split()
            if len(dp) >= 5:
                try:
                    disk_total = int(dp[1])
                    disk_used = int(dp[2])
                    disk_percent = float(dp[4].replace("%", ""))
                except Exception:
                    pass

        def fmt_sz(kb):
            mb = kb / 1024
            if mb < 1024:
                return f"{mb:.0f}M"
            return f"{mb/1024:.1f}G"

        def fmt_rate(bps):
            if bps < 1024:
                return f"{bps} B/s"
            elif bps < 1024 * 1024:
                return f"{bps/1024:.1f} KB/s"
            return f"{bps/(1024*1024):.1f} MB/s"

        return {
            "online": True,
            "cpu": {"percent": cpu_percent, "cores": cores, "_raw": raw_cpu},
            "memory": {
                "total_kb": mem_total,
                "used_kb": mem_used,
                "percent": mem_percent,
                "total_str": fmt_sz(mem_total),
                "used_str": fmt_sz(mem_used),
            },
            "swap": {
                "total_kb": swap_total,
                "used_kb": swap_used,
                "percent": swap_percent,
                "total_str": fmt_sz(swap_total),
                "used_str": fmt_sz(swap_used),
            },
            "disk": {
                "total_kb": disk_total,
                "used_kb": disk_used,
                "percent": disk_percent,
                "total_str": fmt_sz(disk_total),
                "used_str": fmt_sz(disk_used),
            },
            "network": {
                "rx_rate": rx_rate,
                "tx_rate": tx_rate,
                "rx_str": fmt_rate(rx_rate),
                "tx_str": fmt_rate(tx_rate),
                "_raw": raw_net,
            },
            "load": {
                "load_1": load_1,
                "load_5": load_5,
                "load_15": load_15,
                "procs": procs,
            },
            "uptime": {
                "seconds": uptime_sec,
                "str": uptime_str,
            },
        }

    def get_system_ports(self) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        cmd = "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null"
        _, stdout, _ = self.client.exec_command(cmd, timeout=8)
        lines = stdout.read().decode("utf-8", errors="ignore").splitlines()
        ports = []
        for line in lines:
            line_str = line.strip()
            if not line_str or line_str.startswith("Netid") or line_str.startswith("Active") or line_str.startswith("Proto"):
                continue
            parts = line_str.split()
            if len(parts) >= 4:
                proto = parts[0].lower()
                local_addr = parts[4] if len(parts) >= 5 and "LISTEN" in line_str else parts[3]
                ip_part = ""
                port_part = ""
                if ":" in local_addr:
                    ip_part, port_part = local_addr.rsplit(":", 1)
                else:
                    port_part = local_addr

                pid = "--"
                prog = "--"
                if "users:(" in line_str:
                    try:
                        u_info = line_str.split("users:(", 1)[1].rstrip(")")
                        for item in u_info.split(","):
                            if "pid=" in item:
                                pid = item.split("pid=")[1].split()[0]
                            elif not item.startswith("fd=") and not item.startswith("ino="):
                                prog = item.replace('"', '').strip()
                    except Exception:
                        pass
                elif len(parts) >= 7 and "/" in parts[-1]:
                    p_info = parts[-1].split("/", 1)
                    pid = p_info[0]
                    prog = p_info[1]

                if port_part.isdigit():
                    ports.append({
                        "proto": proto,
                        "port": int(port_part),
                        "listen_addr": ip_part or "*",
                        "pid": pid,
                        "program": prog,
                        "raw": line_str,
                    })
        ports.sort(key=lambda x: x["port"])
        return ports

    def get_system_processes(self, limit: int = 35) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        cmd = f"ps -eo pid,user,%cpu,%mem,stat,start,time,command --sort=-%cpu 2>/dev/null | head -n {limit + 1}"
        _, stdout, _ = self.client.exec_command(cmd, timeout=8)
        lines = stdout.read().decode("utf-8", errors="ignore").splitlines()
        procs = []
        for line in lines[1:]:
            parts = line.split(None, 7)
            if len(parts) >= 8:
                try:
                    procs.append({
                        "pid": int(parts[0]),
                        "user": parts[1],
                        "cpu": float(parts[2]),
                        "mem": float(parts[3]),
                        "stat": parts[4],
                        "start": parts[5],
                        "time": parts[6],
                        "command": parts[7],
                    })
                except Exception:
                    pass
        return procs

    def kill_process(self, pid: int, signal: int = 9) -> Dict[str, Any]:
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        cmd = f"kill -{signal} {pid}"
        _, stdout, stderr = self.client.exec_command(cmd, timeout=5)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"终止进程失败 (PID {pid}): {err}")
        return {"status": "killed", "pid": pid, "signal": signal}

    def get_docker_containers(self) -> Dict[str, Any]:
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        _, stdout, _ = self.client.exec_command("which docker", timeout=3)
        if not stdout.read().strip():
            return {"installed": False, "containers": []}

        cmd = "docker ps -a --format '{{json .}}'"
        _, stdout, stderr = self.client.exec_command(cmd, timeout=8)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode("utf-8", errors="ignore")
            return {"installed": True, "error": err, "containers": []}

        containers = []
        import json
        for line in stdout.read().decode("utf-8", errors="ignore").splitlines():
            line_str = line.strip()
            if line_str:
                try:
                    c = json.loads(line_str)
                    containers.append({
                        "id": c.get("ID", ""),
                        "names": c.get("Names", ""),
                        "image": c.get("Image", ""),
                        "status": c.get("Status", ""),
                        "state": c.get("State", "").lower(),
                        "ports": c.get("Ports", ""),
                        "created": c.get("CreatedAt", ""),
                    })
                except Exception:
                    pass
        return {"installed": True, "containers": containers}

    def docker_action(self, container_id: str, action: str) -> Dict[str, Any]:
        import shlex
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        clean_action = action.lower().strip()
        if clean_action in ("rm", "remove", "delete"):
            cmd = f"docker rm -f {shlex.quote(container_id)}"
        elif clean_action in ("start", "stop", "restart", "pause", "unpause"):
            cmd = f"docker {clean_action} {shlex.quote(container_id)}"
        else:
            raise ValueError(f"不支持的容器操作: {action}")
        _, stdout, stderr = self.client.exec_command(cmd, timeout=20)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Docker 执行 {action} 失败: {err}")
        return {"status": "success", "container_id": container_id, "action": action}

    def get_docker_logs(self, container_id: str, tail: int = 150) -> str:
        import shlex
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        cmd = f"docker logs --tail {tail} {shlex.quote(container_id)}"
        _, stdout, stderr = self.client.exec_command(cmd, timeout=10)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        return out + ("\n" + err if err else "")

    def collect_health_data(self) -> Dict[str, Any]:
        if not self.client:
            raise RuntimeError("SSH 客户端未连接")
        script = (
            "echo '===DISK==='; df -h /; "
            "echo '===BIGFILES==='; find /var/log /tmp /root /home -maxdepth 4 -type f -size +50M -exec ls -lh {} + 2>/dev/null | head -n 10; "
            "echo '===MEM==='; free -h 2>/dev/null || free -m; "
            "echo '===AUTH_FAIL==='; grep -c 'Failed password' /var/log/auth.log 2>/dev/null || echo 0; "
            "echo '===FAIL2BAN==='; which fail2ban-client >/dev/null && fail2ban-client status 2>/dev/null || echo 'not installed'; "
            "echo '===UPTIME==='; uptime; "
            "echo '===PORTS==='; ss -tulpn 2>/dev/null | grep LISTEN | head -n 15 || echo 'none'"
        )
        _, stdout, _ = self.client.exec_command(script, timeout=12)
        raw = stdout.read().decode("utf-8", errors="ignore")
        return {"raw": raw, "os_info": self.os_info}
