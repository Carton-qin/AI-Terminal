"""VPS 主机、分组与自动化运维脚本持久化存储（带 AES 加密）."""

from __future__ import annotations

import base64
import json
import os
import sqlite3
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def get_storage_dir() -> Path:
    global_dir = Path.home() / ".aiterm"
    try:
        global_dir.mkdir(parents=True, exist_ok=True)
        test_file = global_dir / ".write_test"
        test_file.touch()
        test_file.unlink()
        return global_dir
    except Exception:
        local_dir = Path.cwd() / ".aiterm"
        local_dir.mkdir(parents=True, exist_ok=True)
        return local_dir


def get_db_path() -> Path:
    return get_storage_dir() / "storage.db"


def get_key_file() -> Path:
    return get_storage_dir() / "master.key"


def get_or_create_master_key() -> bytes:
    """获取或初始化 256 位 AES-GCM 主密钥"""
    key_file = get_key_file()
    if key_file.exists():
        try:
            return key_file.read_bytes()
        except Exception:
            pass
    key = AESGCM.generate_key(bit_length=256)
    try:
        key_file.write_bytes(key)
        os.chmod(key_file, 0o600)
    except Exception:
        pass
    return key


def encrypt_data(plain_text: str) -> str:
    """使用 AES-GCM 加密字符串"""
    if not plain_text:
        return ""
    key = get_or_create_master_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = nonce + ciphertext
    return base64.b64encode(payload).decode("utf-8")


def decrypt_data(cipher_b64: str) -> str:
    """解密 AES-GCM 密文"""
    if not cipher_b64:
        return ""
    try:
        key = get_or_create_master_key()
        aesgcm = AESGCM(key)
        raw = base64.b64decode(cipher_b64.encode("utf-8"))
        nonce = raw[:12]
        ciphertext = raw[12:]
        decrypted = aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted.decode("utf-8")
    except Exception:
        return ""


@dataclass
class HostItem:
    id: str
    name: str
    ip: str
    port: int = 22
    username: str = "root"
    auth_type: str = "password"  # password | key
    group_name: str = "默认分组"
    description: str = ""
    created_at: str = ""

    def to_safe_dict(self) -> Dict[str, Any]:
        """返回不含私密密码/私钥的字典"""
        return asdict(self)


class HostStore:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or get_db_path()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=5000;")
        except Exception:
            pass
        return conn

    def _init_db(self):
        get_storage_dir().mkdir(parents=True, exist_ok=True)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # 主机表
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS hosts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL DEFAULT 'root',
                auth_type TEXT NOT NULL DEFAULT 'password',
                encrypted_secret TEXT NOT NULL DEFAULT '',
                group_name TEXT NOT NULL DEFAULT '默认分组',
                description TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            # 运维脚本片段库 (含系统预置与用户自定义常用命令)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT DEFAULT '系统优化',
                description TEXT DEFAULT '',
                script TEXT NOT NULL,
                is_custom INTEGER DEFAULT 0
            )
            """)
            try:
                cursor.execute("ALTER TABLE snippets ADD COLUMN is_custom INTEGER DEFAULT 0")
            except Exception:
                pass
            # 大模型配置档案库 (支持多配置快速保存与切换)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                encrypted_key TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            # 分组管理表
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS host_groups (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            # SSH 密钥对库
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ssh_keys (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                key_type TEXT NOT NULL DEFAULT 'ed25519',
                public_key TEXT NOT NULL,
                encrypted_private_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            # 确保默认分组存在
            cursor.execute("INSERT OR IGNORE INTO host_groups (id, name) VALUES ('grp-default', '默认分组')")
            # 同步已有主机中自定义的分组名到 host_groups
            cursor.execute("SELECT DISTINCT group_name FROM hosts WHERE group_name IS NOT NULL AND group_name != ''")
            for row in cursor.fetchall():
                cursor.execute(
                    "INSERT OR IGNORE INTO host_groups (id, name) VALUES (?, ?)",
                    (f"grp-{uuid.uuid4().hex[:8]}", row[0])
                )
            conn.commit()

        # 确保初始连接关闭后再同步预置片段和模型档案，避免 SQLite 文件锁冲突
        try:
            self.sync_community_snippets()
        except Exception as e:
            print(f"[Warning] 同步社区脚本片段失败: {e}")

        try:
            self._seed_default_profiles()
        except Exception as e:
            print(f"[Warning] 初始化默认 AI 配置失败: {e}")

    def sync_community_snippets(self):
        """导入或更新全面的 NodeSeek 社区 VPS 运维与跑分脚本（UPSERT 模式，绝不覆盖用户自定义脚本）"""
        candidate_paths = [
            Path(__file__).resolve().parent.parent.parent / "optimize.sh",
            Path.cwd() / "optimize.sh",
            get_storage_dir() / "optimize.sh",
        ]
        optimize_path = next((p for p in candidate_paths if p.exists()), candidate_paths[0])
        opt_content = ""
        if optimize_path.exists():
            try:
                opt_content = optimize_path.read_text(encoding="utf-8")
            except Exception:
                pass

        community_snippets = [
            # 1. DD 系统重装
            (
                "dd-1",
                "史上最强 DD 脚本 (Debian 12 纯净版)",
                "DD系统重装",
                "leitbogioro 史上最强重装脚本，自动识别虚拟化架构并安装 Debian 12，默认密码 Password123（执行前请按需修改 -pwd 参数）",
                "wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian 12 -pwd 'Password123'",
            ),
            (
                "dd-2",
                "萌咖 MoeClub 经典 DD 脚本 (Debian 11)",
                "DD系统重装",
                "经典萌咖纯净一键 DD 脚本，内置固件与驱动包，默认密码 Password123，SSH 端口 22",
                "bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/MoeClub/Note/master/InstallNET.sh') -d 11 -v 64 -p 'Password123' -port 22 -a -firmware",
            ),
            (
                "dd-3",
                "beta.gs 交互式一键重装脚本 (NewReinstall)",
                "DD系统重装",
                "fcurrk 大佬开发的多系统交互式重装脚本，支持 Alpine/Debian/Ubuntu/CentOS/Windows 自由选择",
                "wget --no-check-certificate -O NewReinstall.sh https://raw.githubusercontent.com/fcurrk/reinstall/master/NewReinstall.sh && chmod a+x NewReinstall.sh && bash NewReinstall.sh",
            ),
            (
                "dd-4",
                "DD Windows 10 中文精简版 (史上最强脚本)",
                "DD系统重装",
                "一键 DD 为精简版 Windows 10 中文系统。默认账户: Administrator，默认密码: Teddysun.com",
                "bash <(curl -sSL https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh) -windows 10 -lang 'cn'",
            ),
            (
                "dd-5",
                "Windows 快速一键数字权利激活 (PowerShell)",
                "DD系统重装",
                "Windows 下快捷键 Win+R 输入 powershell 运行后执行此命令，通过 MAS 脚本一键永久数字激活",
                "irm https://get.activated.win | iex",
            ),
            (
                "dd-6",
                "杜甫独立服务器指定 RAID 0 重装 Debian 12",
                "DD系统重装",
                "针对多盘独立服务器/机柜杜甫，自动配置 RAID 0 磁盘阵列并一键重装为 Debian 12",
                "wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian 12 -raid '0' -pwd 'Password123'",
            ),
            (
                "dd-7",
                "杜甫独立服务器指定静态网络参数 DD 重装",
                "DD系统重装",
                "针对无 DHCP 环境的独立服务器，手动绑定 IPv4/网关/掩码及 IPv6，防止重装后失联",
                "wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian 12 --ip-addr 139.162.52.1 --ip-mask 24 --ip-gate 139.162.52.1 -pwd 'Password123'",
            ),

            # 2. 综合跑分测试
            (
                "bench-1",
                "bench.sh 经典系统信息与网络测速",
                "综合跑分测试",
                "秋水逸冰经典 bench.sh，快速获取 CPU 型号、主频、核心数、磁盘 I/O 及全球节点测速",
                "wget -qO- bench.sh | bash",
            ),
            (
                "bench-2",
                "LemonBench 柠檬测试 (快速模式)",
                "综合跑分测试",
                "服务器硬件与网络综合性能快速体检，包含 CPU 性能、内存读写、磁盘 4K 速度与三网网络",
                "wget -qO- https://raw.githubusercontent.com/LemonBench/LemonBench/main/LemonBench.sh | bash -s -- --fast",
            ),
            (
                "bench-3",
                "融合怪 VPS 综合性能大体检 (ecs.sh)",
                "综合跑分测试",
                "spiritysdx 极度全面的融合怪评测：基础硬件、流媒体解锁、IP质量欺诈度、Geekbench、回程路由大合集",
                "bash <(wget -qO- --no-check-certificate https://gitlab.com/spiritysdx/za/-/raw/main/ecs.sh)",
            ),
            (
                "bench-4",
                "NodeBench 现代化 VPS 性能跑分",
                "综合跑分测试",
                "LloydAsp 维护的轻量级现代化系统体检跑分脚本",
                "bash <(curl -sL https://raw.githubusercontent.com/LloydAsp/NodeBench/main/NodeBench.sh)",
            ),

            # 3. CPU与性能测试
            (
                "yabs-1",
                "YABS 全功能性能测试 (CPU + 磁盘 + 网络)",
                "CPU与性能测试",
                "Yet Another Bench Script: 自动运行 FIO 磁盘4K/64K/512K/1M读写、Geekbench 6 与 iperf3 全球测速",
                "curl -sL yabs.sh | bash",
            ),
            (
                "yabs-2",
                "YABS 跳过网络测 Geekbench 5 (-i5)",
                "CPU与性能测试",
                "跳过网络带宽测试，直接测试 FIO 磁盘性能并使用经典 Geekbench 5 评测单核/多核跑分",
                "curl -sL yabs.sh | bash -s -- -i5",
            ),
            (
                "yabs-3",
                "YABS 仅测 CPU 算力 (-if5)",
                "CPU与性能测试",
                "跳过网络与磁盘读写测试，极速评测 Geekbench 5 CPU 单核与多核算力，省流量耗时短",
                "curl -sL yabs.sh | bash -s -- -if5",
            ),
            (
                "yabs-4",
                "YABS 测速 + Geekbench 5 测试 (-5)",
                "CPU与性能测试",
                "运行完整 YABS 测试，但强制将基准换为经典的 Geekbench 5（适合低配或旧内核机器）",
                "curl -sL yabs.sh | bash -s -- -5",
            ),

            # 4. 流媒体与IP质量
            (
                "media-1",
                "流媒体解锁检测 (最常用经典版本)",
                "流媒体与IP质量",
                "快速检测 Netflix、YouTube Premium、Disney+、Bilibili、HBO、OpenAI/ChatGPT 等解锁情况",
                "bash <(curl -L -s check.unlock.media)",
            ),
            (
                "media-2",
                "Media.Check.Place 原生流媒体检测",
                "流媒体与IP质量",
                "原生检测流媒体区域与 IP 性质，区分机房广播 IP 与原生住宅家庭宽带属性",
                "bash <(curl -sL Media.Check.Place)",
            ),
            (
                "media-3",
                "IP.Check.Place IP 质量与欺诈度体检",
                "流媒体与IP质量",
                "全面排查 IP 欺诈分 (Scamalytics/IPQS)、邮件黑名单、DNS 污染与数据库送中风险",
                "bash <(curl -sL IP.Check.Place)",
            ),
            (
                "media-4",
                "RegionRestrictionCheck 区域限制检测 (高精度)",
                "流媒体与IP质量",
                "准确度极高的流媒体及区域版权限制检测脚本，支持双栈 IPv4/IPv6",
                "bash <(curl -L -s https://github.com/1-stream/RegionRestrictionCheck/raw/main/check.sh)",
            ),
            (
                "media-5",
                "TQ (TcpQuality) 网络质量与丢包体检",
                "流媒体与IP质量",
                "测试当前 VPS 与国内各大骨干网之间的 TCP 连接质量、握手耗时与丢包率",
                "bash <(curl -fsSL https://raw.githubusercontent.com/ibsgss/TcpQuality/main/runTcpQuality.sh)",
            ),
            (
                "media-6",
                "DNS-Alice-Unlock 一键修改解锁 DNS",
                "流媒体与IP质量",
                "一键修改 /etc/resolv.conf 配置流媒体解锁 DNS 服务",
                "wget https://raw.githubusercontent.com/Jimmyzxk/DNS-Alice-Unlock/refs/heads/main/dns-unlock.sh && bash dns-unlock.sh",
            ),
            (
                "media-7",
                "BBR v3 优化与自动别名配置",
                "流媒体与IP质量",
                "一键部署 BBR v3 内核调优并写入 bbr 命令别名（执行后需 source ~/.bashrc 即可生效）",
                "bash <(curl -fsSL 'https://raw.githubusercontent.com/Eric86777/vps-tcp-tune/main/install-alias.sh?'$(date +%s))",
            ),

            # 5. 测速与网络路由
            (
                "net-1",
                "Speedtest 国内三网多节点快速测速",
                "测速与网络路由",
                "集成全国电信、联通、移动多省份骨干节点的命令行 Speedtest 快速带宽测试",
                "bash <(curl -sL bash.icu/speedtest)",
            ),
            (
                "net-2",
                "Taier 综合网络测速脚本",
                "测速与网络路由",
                "yserver 提供的多节点全国测速，包含延迟与抖动分析",
                "bash <(curl -sL res.yserver.ink/taier.sh)",
            ),
            (
                "net-3",
                "hyperspeed 三网大带宽测速",
                "测速与网络路由",
                "专注国内三大运营商多节点单线程/多线程测速，支持万兆及千兆 VPS",
                "bash <(curl -Lso- https://bench.im/hyperspeed)",
            ),
            (
                "net-4",
                "nws.sh 全球网络测速",
                "测速与网络路由",
                "NodeQuality 全球多区域 CDN 与机房延迟及带宽测试",
                "wget -qO- nws.sh | bash",
            ),
            (
                "net-5",
                "nws.sh 区域网络测速 (亚洲节点)",
                "测速与网络路由",
                "针对 Asia 亚洲地区节点进行专项速度测试，可将 asia 替换为其他地区",
                "wget -qO- nws.sh | bash -s -- -r asia",
            ),
            (
                "net-6",
                "nws.sh 全球 Ping 与路由测试",
                "测速与网络路由",
                "测试 VPS 到全球骨干网节点的 Ping 响应时间及路由跳数追踪",
                "wget -qO- nws.sh | bash -s -- -rt",
            ),
            (
                "net-7",
                "backtrace 快速三网回程路由 (小白首选)",
                "测速与网络路由",
                "极速输出电信、联通、移动、教育网等回程线路（163/CN2/9929/CMIN2 等）类型，秒出结果",
                "curl https://raw.githubusercontent.com/ludashi2020/backtrace/main/install.sh -sSf | sh",
            ),
            (
                "net-8",
                "AutoTrace 详细四网回程路由测试 (推荐)",
                "测速与网络路由",
                "测试回程广州/上海/北京节点路由，详细显示每一跳 AS 号与经由线路",
                "wget -N --no-check-certificate https://raw.githubusercontent.com/Chennhaoo/Shell_Bash/master/AutoTrace.sh && chmod +x AutoTrace.sh && bash AutoTrace.sh",
            ),
            (
                "net-9",
                "testrace 多网回程路由测试",
                "测速与网络路由",
                "vpsxb 维护的国内四网回程路由检测工具",
                "wget https://ghproxy.com/https://raw.githubusercontent.com/vpsxb/testrace/main/testrace.sh -O testrace.sh && bash testrace.sh",
            ),

            # 6. 系统与网络调优
            (
                "opt-1",
                "Debian/Ubuntu 一键综合优化 (当前机器已验证)",
                "系统与网络调优",
                "包含软件源升级、1GB Swap、BBR+FQ加速、TCP高并发缓冲区、ulimit 调优及日志防爆限制",
                opt_content or "echo '优化脚本'",
            ),
            (
                "opt-2",
                "TCP BBR 拥塞控制一键开启与检测",
                "系统与网络调优",
                "开启 BBR 算法并验证当前内核模块状态",
                "sudo modprobe tcp_bbr && echo 'net.core.default_qdisc=fq' | sudo tee -a /etc/sysctl.conf && echo 'net.ipv4.tcp_congestion_control=bbr' | sudo tee -a /etc/sysctl.conf && sudo sysctl -p && sysctl net.ipv4.tcp_available_congestion_control",
            ),
            (
                "opt-bbr-native",
                "一键开启原生 BBR (适合较新 Debian/Ubuntu)",
                "系统与网络调优",
                "向 /etc/sysctl.conf 注入 fq 队列调度器与 bbr 拥塞控制算法，无需重启立即生效",
                'echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf && echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf && sysctl -p && sysctl net.ipv4.tcp_available_congestion_control && lsmod | grep bbr',
            ),
            (
                "opt-bbr-zeruns",
                "多功能 BBR 安装脚本 (zeruns)",
                "系统与网络调优",
                "支持 BBR/BBR魔改版/BBRplus/Lotserver 锐速切换，适用于多种内核版本",
                'wget -N --no-check-certificate "https://gist.github.com/zeruns/a0ec603f20d1b86de6a774a8ba27588f/raw/4f9957ae23f5efb2bb7c57a198ae2cffebfb1c56/tcp.sh" && chmod +x tcp.sh && ./tcp.sh',
            ),
            (
                "opt-tcpx",
                "tcpx 锐速/BBRPLUS/BBR2/BBR3 多内核全功能工具箱",
                "系统与网络调优",
                "ylx2016 大佬著名的 Linux 网络加速脚本，可一键安装各版加速内核并自动重启",
                'wget -O tcpx.sh "https://github.com/ylx2016/Linux-NetSpeed/raw/master/tcpx.sh" && chmod +x tcpx.sh && ./tcpx.sh',
            ),
            (
                "opt-swap",
                "虚拟内存 SWAP 一键添加与配置",
                "系统与网络调优",
                "Moerats 经典脚本，一键创建、调整或删除 Swap 虚拟内存，避免小内存机器 OOM 崩溃",
                "wget https://www.moerats.com/usr/shell/swap.sh && bash swap.sh",
            ),
            (
                "opt-fail2ban",
                "Fail2ban 防 SSH 暴力破解安全加固",
                "系统与网络调优",
                "监控 SSH 认证日志，自动封禁尝试密码爆破的恶意黑客 IP 地址",
                "wget --no-check-certificate https://raw.githubusercontent.com/FunctionClub/Fail2ban/master/fail2ban.sh && bash fail2ban.sh 2>&1 | tee fail2ban.log",
            ),
            (
                "opt-tcp-window",
                "TCP 窗口与缓冲区高吞吐调优",
                "系统与网络调优",
                "针对跨国长肥网络 (LFN) 调大 wmem/rmem 缓冲区，突破带宽瓶颈",
                "wget http://sh.nekoneko.cloud/tools.sh -O tools.sh && bash tools.sh",
            ),
            (
                "opt-warp",
                "Cloudflare WARP 多功能双栈脚本 (fscarmen)",
                "系统与网络调优",
                "一键为 IPv4-only 或 IPv6-only VPS 获得双栈公网出口，可解锁流媒体及 ChatGPT",
                "wget -N https://gitlab.com/fscarmen/warp/-/raw/main/menu.sh && bash menu.sh",
            ),
            (
                "opt-port-25",
                "25 邮件端口出站开放测试 (防滥用检测)",
                "系统与网络调优",
                "检测 VPS 提供商是否封禁 TCP 25 出站端口（判断能否搭建邮件服务器）",
                "telnet smtp.aol.com 25",
            ),
            (
                "opt-disable-ipv6",
                "一键彻底禁用 IPv6 (防止送中或规避劣质 v6 路由)",
                "系统与网络调优",
                "关闭所有网卡的 IPv6 功能，避免 Google 搜索跳转送中或 IPv6 慢路由丢包",
                'echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf && echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.conf && echo "net.ipv6.conf.lo.disable_ipv6 = 1" >> /etc/sysctl.conf && sysctl -p',
            ),

            # 7. 常用环境与控制面板
            (
                "opt-3",
                "Docker CE 与 Docker Compose 一键部署",
                "常用环境与控制面板",
                "配置官方 Docker 源与开机自启",
                "curl -fsSL https://get.docker.com | bash && sudo systemctl enable --now docker",
            ),
            (
                "env-python",
                "Python 多版本源码一键编译与环境构建",
                "常用环境与控制面板",
                "自动下载依赖并多线程编译安装最新 Python 环境与 pip",
                "curl -O https://raw.githubusercontent.com/lx969788249/lxspacepy/master/pyinstall.sh && chmod +x pyinstall.sh && ./pyinstall.sh",
            ),
            (
                "env-iperf3",
                "iperf3 网络吞吐测速工具一键安装",
                "常用环境与控制面板",
                "安装标准网络带宽吞吐量测试套件 (Debian/Ubuntu)",
                "apt update && apt install -y iperf3",
            ),
            (
                "env-realm",
                "realm 极简高性能端口转发一键脚本",
                "常用环境与控制面板",
                "基于 Rust 的高性能中转转发工具，内存占用极低，配置简单",
                "bash <(curl -L https://raw.githubusercontent.com/zhouh047/realm-oneclick-install/main/realm.sh) -i",
            ),
            (
                "env-gost",
                "gost 多协议轻量安全隧道脚本",
                "常用环境与控制面板",
                "支持 HTTP/SOCKS5/TLS/KCP 等多种协议的中继与端口转发",
                "wget --no-check-certificate -O gost.sh https://raw.githubusercontent.com/qqrrooty/EZgost/main/gost.sh && chmod +x gost.sh && ./gost.sh",
            ),
            (
                "env-aurora",
                "极光面板 (Aurora Admin Panel) 一键安装",
                "常用环境与控制面板",
                "强大的多服务器流量转发可视化管理平台，支持 iptables/gost/socat/realm",
                "bash <(curl -fsSL https://raw.githubusercontent.com/Aurora-Admin-Panel/deploy/main/install.sh)",
            ),
            (
                "env-nezha",
                "哪吒监控 (Nezha Monitoring) 一键安装",
                "常用环境与控制面板",
                "支持安装哪吒监控面板 Dashboard 或被控端 Agent，提供实时服务器健康大屏",
                "curl -L https://raw.githubusercontent.com/naiba/nezha/master/script/install.sh -o nezha.sh && chmod +x nezha.sh && sudo ./nezha.sh",
            ),
            (
                "env-nezha-beautify",
                "哪吒监控 Dashboard 纯净美化脚本 (自定义代码)",
                "常用环境与控制面板",
                "放入哪吒监控管理后台【设置】-【自定义代码】中，隐藏小鸡动画人物、简化界面更高级",
                "<script> window.ShowNetTransfer = true; window.FixedTopServerName = true; window.DisableAnimatedMan = true; window.DisableSpeed = true; </script>",
            ),
            (
                "env-aria2",
                "Aria2 增强版一键安装脚本",
                "常用环境与控制面板",
                "自动配置最新 BT Tracker、Aria2 WebUI 客户端与多线程满速下载",
                "wget -N git.io/aria2.sh && chmod +x aria2.sh && ./aria2.sh",
            ),
            (
                "env-baota",
                "宝塔 Linux 面板 (Ubuntu/Debian 经典版)",
                "常用环境与控制面板",
                "可视化建站管理面板，一键配置 LNMP/LAMP、网站、FTP、数据库",
                "wget -O install.sh http://v7.hostcli.com/install/install-ubuntu_6.0.sh && sudo bash install.sh",
            ),
            (
                "env-pve",
                "PVE (Proxmox VE) 虚拟化环境一键构建",
                "常用环境与控制面板",
                "在一台独立服务器上快速安装构建 Proxmox VE 虚拟化后端，开设 KVM/LXC 小鸡",
                "bash <(wget -qO- --no-check-certificate https://raw.githubusercontent.com/oneclickvirt/pve/main/scripts/build_backend.sh)",
            ),
            (
                "env-argox",
                "ArgoX (Cloudflare Argo 隧道综合工具)",
                "常用环境与控制面板",
                "fscarmen 大佬基于 Cloudflare Argo 穿透与 CDN 加速的一键集成脚本",
                "bash <(wget -qO- https://raw.githubusercontent.com/fscarmen/argox/main/argox.sh)",
            ),

            # 8. 综合多功能工具箱
            (
                "box-kejilion",
                "科技lion Linux 综合工具箱",
                "综合多功能工具箱",
                "功能极其丰富的运维大总管：系统监控、建站、科学上网、DD系统、BBR管理、安全加固",
                "apt update -y && apt install -y curl && bash <(curl -sL kejilion.sh)",
            ),
            (
                "box-bluesky",
                "蓝天 SKY-BOX 综合运维工具箱",
                "综合多功能工具箱",
                "集测速、跑分、流媒体检测、Linux 优化与建站工具于一体的多功能面板",
                "wget -O box.sh https://raw.githubusercontent.com/BlueSkyXN/SKY-BOX/main/box.sh && chmod +x box.sh && clear && ./box.sh",
            ),

            # 9. 杜甫独立服务器巡检
            (
                "opt-4",
                "系统硬件与综合网络延迟巡检",
                "杜甫独立服务器巡检",
                "查看 CPU 架构、内存占用、磁盘空间与当前监听端口",
                "echo '=== 硬件与内存 ===' && free -h && echo '=== 磁盘剩余 ===' && df -h / && echo '=== 监听端口 ===' && ss -tulpn",
            ),
            (
                "dufu-sick",
                "SICK 杜甫硬件完整巡检 (sick.onl)",
                "杜甫独立服务器巡检",
                "独立服务器必备！秒查 CPU 详细型号、内存频率、硬盘通电时长、SMART 磨损与健康度",
                "curl -sL https://sick.onl | bash",
            ),
            (
                "dufu-sick-cn",
                "SICK 中文详细硬件检测脚本",
                "杜甫独立服务器巡检",
                "纯中文输出独立的硬件检测与健康报告，排查二手盘/矿盘/翻新盘",
                "curl -sL https://raw.githubusercontent.com/Yuri-NagaSaki/SICK/refs/heads/main/hardware_info.sh | bash -s -- -cn",
            ),
            (
                "dufu-aniverse",
                "Aniverse A 综合硬件与系统测评",
                "杜甫独立服务器巡检",
                "检测 CPU 真实体质、内存延迟、硬盘 IOPS 及网络回程质量",
                "wget https://github.com/Aniverse/A/raw/i/a && bash a",
            ),
        ]

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.executemany(
                """
                INSERT INTO snippets (id, name, category, description, script)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    category=excluded.category,
                    description=excluded.description,
                    script=excluded.script
                """,
                community_snippets,
            )
            conn.commit()

    def list_hosts(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, ip, port, username, auth_type, group_name, description, created_at FROM hosts ORDER BY group_name, name")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def add_host(
        self,
        name: str,
        ip: str,
        port: int = 22,
        username: str = "root",
        auth_type: str = "password",
        secret: str = "",
        group_name: str = "默认分组",
        description: str = "",
    ) -> str:
        group_name = group_name.strip() or "默认分组"
        host_id = str(uuid.uuid4())[:8]
        enc_secret = encrypt_data(secret)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR IGNORE INTO host_groups (id, name) VALUES (?, ?)", (f"grp-{uuid.uuid4().hex[:8]}", group_name))
            cursor.execute(
                """
                INSERT INTO hosts (id, name, ip, port, username, auth_type, encrypted_secret, group_name, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (host_id, name, ip, port, username, auth_type, enc_secret, group_name, description),
            )
            conn.commit()
        return host_id

    def get_host_credentials(self, host_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM hosts WHERE id = ?", (host_id,))
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["secret"] = decrypt_data(data.pop("encrypted_secret", ""))
            return data

    def delete_host(self, host_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM hosts WHERE id = ?", (host_id,))
            conn.commit()

    def list_groups(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT g.id, g.name, COUNT(h.id) AS host_count, g.created_at
            FROM host_groups g
            LEFT JOIN hosts h ON h.group_name = g.name
            GROUP BY g.id, g.name
            ORDER BY CASE WHEN g.name = '默认分组' THEN 0 ELSE 1 END, g.created_at ASC
            """)
            return [dict(row) for row in cursor.fetchall()]

    def add_group(self, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("分组名称不能为空")
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM host_groups WHERE name = ?", (name,))
            row = cursor.fetchone()
            if row:
                return row["id"]
            grp_id = f"grp-{uuid.uuid4().hex[:8]}"
            cursor.execute("INSERT INTO host_groups (id, name) VALUES (?, ?)", (grp_id, name))
            conn.commit()
            return grp_id

    def rename_group(self, group_id: str, new_name: str):
        new_name = new_name.strip()
        if not new_name:
            raise ValueError("分组名称不能为空")
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM host_groups WHERE id = ?", (group_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError("未找到目标分组")
            old_name = row["name"]
            if old_name == "默认分组":
                raise ValueError("「默认分组」为系统基础分组，不可重命名")
            cursor.execute("UPDATE host_groups SET name = ? WHERE id = ?", (new_name, group_id))
            cursor.execute("UPDATE hosts SET group_name = ? WHERE group_name = ?", (new_name, old_name))
            conn.commit()

    def delete_group(self, group_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM host_groups WHERE id = ?", (group_id,))
            row = cursor.fetchone()
            if not row:
                return
            old_name = row["name"]
            if old_name == "默认分组":
                raise ValueError("「默认分组」为系统基础分组，不可删除")
            # 将该分组下的服务器自动迁移至「默认分组」
            cursor.execute("UPDATE hosts SET group_name = '默认分组' WHERE group_name = ?", (old_name,))
            cursor.execute("DELETE FROM host_groups WHERE id = ?", (group_id,))
            conn.commit()

    def move_host_to_group(self, host_id: str, new_group_name: str):
        new_group_name = new_group_name.strip() or "默认分组"
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR IGNORE INTO host_groups (id, name) VALUES (?, ?)", (f"grp-{uuid.uuid4().hex[:8]}", new_group_name))
            cursor.execute("UPDATE hosts SET group_name = ? WHERE id = ?", (new_group_name, host_id))
            conn.commit()

    def update_host(
        self,
        host_id: str,
        name: str,
        ip: str,
        port: int = 22,
        username: str = "root",
        auth_type: str = "password",
        secret: Optional[str] = None,
        group_name: str = "默认分组",
        description: str = "",
    ):
        group_name = group_name.strip() or "默认分组"
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR IGNORE INTO host_groups (id, name) VALUES (?, ?)", (f"grp-{uuid.uuid4().hex[:8]}", group_name))
            if secret:
                enc_secret = encrypt_data(secret)
                cursor.execute(
                    """
                    UPDATE hosts SET
                        name = ?, ip = ?, port = ?, username = ?, auth_type = ?,
                        encrypted_secret = ?, group_name = ?, description = ?
                    WHERE id = ?
                    """,
                    (name, ip, port, username, auth_type, enc_secret, group_name, description, host_id),
                )
            else:
                cursor.execute(
                    """
                    UPDATE hosts SET
                        name = ?, ip = ?, port = ?, username = ?, auth_type = ?,
                        group_name = ?, description = ?
                    WHERE id = ?
                    """,
                    (name, ip, port, username, auth_type, group_name, description, host_id),
                )
            conn.commit()

    def list_snippets(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, name, category, description, script, COALESCE(is_custom, 0) AS is_custom FROM snippets
            ORDER BY
                CASE
                    WHEN is_custom = 1 THEN 0
                    WHEN category = '自定义命令' THEN 0
                    WHEN category = 'DD系统重装' THEN 1
                    WHEN category = '综合跑分测试' THEN 2
                    WHEN category = 'CPU与性能测试' THEN 3
                    WHEN category = '流媒体与IP质量' THEN 4
                    WHEN category = '测速与网络路由' THEN 5
                    WHEN category = '系统与网络调优' THEN 6
                    WHEN category = '常用环境与控制面板' THEN 7
                    WHEN category = '综合多功能工具箱' THEN 8
                    WHEN category = '杜甫独立服务器巡检' THEN 9
                    ELSE 10
                END,
                id
            """)
            return [dict(row) for row in cursor.fetchall()]

    def add_snippet(self, name: str, category: str, description: str, script: str) -> str:
        name = name.strip()
        script = script.strip()
        if not name or not script:
            raise ValueError("命令名称和脚本内容不能为空")
        category = category.strip() or "自定义命令"
        snippet_id = f"custom-{uuid.uuid4().hex[:8]}"
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO snippets (id, name, category, description, script, is_custom)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (snippet_id, name, category, description.strip(), script),
            )
            conn.commit()
            return snippet_id

    def update_snippet(self, snippet_id: str, name: str, category: str, description: str, script: str):
        name = name.strip()
        script = script.strip()
        if not name or not script:
            raise ValueError("命令名称和脚本内容不能为空")
        category = category.strip() or "自定义命令"
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE snippets SET
                    name = ?, category = ?, description = ?, script = ?, is_custom = 1
                WHERE id = ?
                """,
                (name, category, description.strip(), script, snippet_id),
            )
            conn.commit()

    def delete_snippet(self, snippet_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM snippets WHERE id = ?", (snippet_id,))
            conn.commit()

    def _seed_default_profiles(self):
        """导入预置服务商档案，便于一键套用与自由切换"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM ai_profiles")
            if cursor.fetchone()[0] == 0:
                defaults = [
                    (
                        "prof-agentrouter",
                        "AgentRouter (推荐)",
                        "https://agentrouter.org/v1",
                        "",
                        "claude-3-5-sonnet-20241022",
                    ),
                    (
                        "prof-deepseek",
                        "DeepSeek 官方",
                        "https://api.deepseek.com/v1",
                        "",
                        "deepseek-chat",
                    ),
                    (
                        "prof-ollama",
                        "Ollama 本地大模型",
                        "http://localhost:11434/v1",
                        "ollama",
                        "qwen2.5:7b",
                    ),
                    (
                        "prof-openai",
                        "OpenAI 官方",
                        "https://api.openai.com/v1",
                        "",
                        "gpt-4o",
                    ),
                ]
                cursor.executemany(
                    "INSERT INTO ai_profiles (id, name, base_url, encrypted_key, model) VALUES (?, ?, ?, ?, ?)",
                    defaults,
                )
                conn.commit()

    def list_ai_profiles(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ai_profiles ORDER BY created_at")
            rows = cursor.fetchall()
            result = []
            for r in rows:
                d = dict(r)
                enc_key = d.pop("encrypted_key", "")
                d["api_key"] = decrypt_data(enc_key) if enc_key else ""
                result.append(d)
            return result

    def save_ai_profile(
        self,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        profile_id: Optional[str] = None,
    ) -> str:
        pid = profile_id or str(uuid.uuid4())[:8]
        enc_key = encrypt_data(api_key) if api_key else ""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO ai_profiles (id, name, base_url, encrypted_key, model)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    base_url=excluded.base_url,
                    encrypted_key=excluded.encrypted_key,
                    model=excluded.model
                """,
                (pid, name, base_url, enc_key, model),
            )
            conn.commit()
        return pid

    def delete_ai_profile(self, profile_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ai_profiles WHERE id = ?", (profile_id,))
            conn.commit()

    # --- SSH 密钥库与自动化推送 ---
    def generate_ssh_key(self, name: str, key_type: str = "ed25519") -> Dict[str, Any]:
        from cryptography.hazmat.primitives.asymmetric import ed25519, rsa
        from cryptography.hazmat.primitives import serialization

        clean_type = key_type.lower()
        if clean_type == "rsa":
            priv = rsa.generate_private_key(public_exponent=65537, key_size=3072)
            priv_pem = priv.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.OpenSSH,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode("utf-8")
            pub_ssh = priv.public_key().public_bytes(
                encoding=serialization.Encoding.OpenSSH,
                format=serialization.PublicFormat.OpenSSH,
            ).decode("utf-8")
        else:
            priv = ed25519.Ed25519PrivateKey.generate()
            priv_pem = priv.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.OpenSSH,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode("utf-8")
            pub_ssh = priv.public_key().public_bytes(
                encoding=serialization.Encoding.OpenSSH,
                format=serialization.PublicFormat.OpenSSH,
            ).decode("utf-8")

        key_id = f"key-{uuid.uuid4().hex[:8]}"
        enc_priv = encrypt_data(priv_pem)
        clean_name = name.strip() or f"Key-{clean_type.upper()}-{key_id[-4:]}"

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO ssh_keys (id, name, key_type, public_key, encrypted_private_key)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key_id, clean_name, clean_type, pub_ssh, enc_priv),
            )
            conn.commit()

        return {
            "id": key_id,
            "name": clean_name,
            "key_type": clean_type,
            "public_key": pub_ssh,
        }

    def list_ssh_keys(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, key_type, public_key, created_at FROM ssh_keys ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "name": r[1],
                    "key_type": r[2],
                    "public_key": r[3],
                    "created_at": str(r[4]),
                }
                for r in rows
            ]

    def delete_ssh_key(self, key_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ssh_keys WHERE id = ?", (key_id,))
            conn.commit()

    def get_ssh_key_private(self, key_id: str) -> Optional[str]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT encrypted_private_key FROM ssh_keys WHERE id = ?", (key_id,))
            row = cursor.fetchone()
            if row and row[0]:
                return decrypt_data(row[0])
            return None

    def deploy_ssh_key_to_host(self, key_id: str, host_id: str) -> Dict[str, Any]:
        """将生成的 SSH 公钥通过现有密码连接远程部署到目标 VPS，并自动将该主机切换为密钥登录"""
        host = self.get_host(host_id)
        if not host:
            raise ValueError("目标主机不存在")

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT public_key, encrypted_private_key FROM ssh_keys WHERE id = ?", (key_id,))
            key_row = cursor.fetchone()
            if not key_row:
                raise ValueError("指定密钥对不存在")
            pub_key = key_row[0]
            priv_key = decrypt_data(key_row[1])

        # 连接目标主机进行部署
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            connect_kwargs = {
                "hostname": host["ip"],
                "port": host["port"],
                "username": host["username"],
                "timeout": 10,
                "banner_timeout": 15,
                "auth_timeout": 10,
            }
            if host["auth_type"] == "key":
                import io
                key_file = io.StringIO(host["secret"])
                pkey = None
                for k_cls in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
                    try:
                        key_file.seek(0)
                        pkey = k_cls.from_private_key(key_file)
                        break
                    except Exception:
                        pass
                connect_kwargs["pkey"] = pkey
            else:
                connect_kwargs["password"] = host["secret"]

            client.connect(**connect_kwargs)

            # 在远端执行公钥写入与权限配置
            import shlex
            deploy_script = (
                f"mkdir -p ~/.ssh && chmod 700 ~/.ssh && "
                f"echo {shlex.quote(pub_key)} >> ~/.ssh/authorized_keys && "
                f"chmod 600 ~/.ssh/authorized_keys"
            )
            _, stdout, stderr = client.exec_command(deploy_script, timeout=10)
            exit_code = stdout.channel.recv_exit_status()
            if exit_code != 0:
                err = stderr.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"远端写入公钥失败: {err}")

            # 自动将该主机更新为 Key 验证模式
            self.update_host(
                host_id=host_id,
                name=host["name"],
                ip=host["ip"],
                port=host["port"],
                username=host["username"],
                auth_type="key",
                secret=priv_key,
                group_name=host.get("group_name", "默认分组"),
                description=host.get("description", ""),
            )
            return {"status": "deployed", "host_id": host_id, "auth_type": "key"}
        finally:
            client.close()

