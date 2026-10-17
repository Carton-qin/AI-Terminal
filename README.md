# VPS 管理与优化记录

## 服务器信息
- **IP**: `154.16.10.18`
- **CPU**: 1 vCPU (AMD EPYC 7532)
- **内存**: 1 GB RAM + 1 GB Swap
- **硬盘**: 5 GB SSD
- **操作系统**: Debian GNU/Linux 11 (Bullseye)
- **当前时区**: Asia/Shanghai (CST, UTC+8)

---

## 已执行的优化项目

### 1. 软件源与系统更新
- 针对 Debian 11 安全源生命周期，已自动配置 `archive.debian.org/debian-security`，解决了软件包安装 404 问题。
- 升级了所有过期的系统库与安全补丁（libc6, openssl, openssh, systemd 等）。
- 安装常用基础工具：`curl`, `wget`, `htop`, `iotop`, `tmux`, `git`, `ufw`, `fail2ban`, `ca-certificates`, `dnsutils`, `jq`, `lsof`, `net-tools`。
- 清理 apt 缓存，节省磁盘空间。

### 2. 虚拟内存 (Swap) 调优
- 考虑到 1GB 内存较小，配置了 **1024 MB Swapfile** 并开机自启 (`/etc/fstab`)。
- 调整内核 swappiness 参数为 `20`（优先使用物理内存，避免无谓的磁盘 I/O，同时防止高内存负载时 OOM 崩溃）。

### 3. 网络与内核协议栈优化 (`/etc/sysctl.d/99-custom-sysctl.conf`)
- **TCP BBR + FQ**：高吞吐低延迟拥塞控制算法。
- **TCP Fast Open (TFO)**：设置为 `3`（同时支持 client 和 server）。
- **连接复用与超时**：降低 `tcp_fin_timeout` 至 20s，开启 `tcp_tw_reuse` 快速复用 TIME_WAIT 连接。
- **缓冲区优化**：增大 socket 接收与发送缓冲区上限至 16MB。
- **连接队列**：将 `somaxconn` 与 `tcp_max_syn_backlog` 提升至 65535。
- **IP 转发**：开启 `net.ipv4.ip_forward = 1`，方便后续搭建 Docker、代理或网络隧道。

### 4. 资源限制 (ulimit)
- 提高系统单用户最大打开文件句柄数（nofile）与最大进程数（nproc）至 `65535`。
- 同步在 systemd 全局配置中生效。

### 5. SSH 体验与安全加固
- **消除登录卡顿**：配置 `UseDNS no`，禁用反向 DNS 查询。
- **防掉线心跳**：配置 `ClientAliveInterval 30` 与 `ClientAliveCountMax 3`，防止闲置短时间被路由器或 NAT 断连。
- **Fail2ban 防爆破**：已启用 SSH 封禁规则，10 分钟内重试超过 5 次自动拉黑 1 小时。

### 6. 小磁盘日志占用限制
- 考虑到 VPS 硬盘仅有 5GB，对 `systemd-journald` 进行了大小硬限制（最大 50MB），避免系统日志无节制增长吃满硬盘。

---

## 本地文件
- [optimize.sh](file:///Users/gaojia/Documents/VPS-manage/optimize.sh)：可用于重新运行或迁移到其他机器的自动化一键优化脚本。
