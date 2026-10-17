#!/usr/bin/env bash
# ==============================================================================
# VPS One-Click Optimization Script for Debian/Ubuntu
# Specifically tuned for 1C1G / Small Disk VPS
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting VPS System Optimization..."
echo "=========================================================="

# ------------------------------------------------------------------------------
# 1. Set Timezone to Asia/Shanghai and Synchronize Time
# ------------------------------------------------------------------------------
echo "[1/7] Configuring Timezone and NTP Time Sync..."
timedatectl set-timezone Asia/Shanghai || ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# Install systemd-timesyncd if not present and enable it
if ! systemctl is-active --quiet systemd-timesyncd; then
    apt-get update -qq
    apt-get install -y -qq systemd-timesyncd || true
    systemctl enable --now systemd-timesyncd || true
fi
timedatectl set-ntp true || true
echo "Current Time: $(date)"

# ------------------------------------------------------------------------------
# 2. Configure Repositories & System Update
# ------------------------------------------------------------------------------
echo "[2/7] Configuring Repositories and Updating System Packages..."
cat << 'EOF' > /etc/apt/sources.list
deb http://deb.debian.org/debian bullseye main contrib non-free
deb http://archive.debian.org/debian-security bullseye-security main contrib non-free
deb http://deb.debian.org/debian bullseye-updates main contrib non-free
EOF
echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until

export DEBIAN_FRONTEND=noninteractive
apt-get clean
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Essential lightweight tools
apt-get install -y -qq \
    curl \
    wget \
    htop \
    iotop \
    tmux \
    git \
    ufw \
    fail2ban \
    ca-certificates \
    dnsutils \
    lsof \
    bc \
    jq \
    net-tools \
    sudo

# Clean up apt caches to save precious disk space (5G disk)
apt-get autoremove -y -qq
apt-get clean

# ------------------------------------------------------------------------------
# 3. Swap Configuration (1GB Swap for 1GB RAM)
# ------------------------------------------------------------------------------
echo "[3/7] Checking and Configuring Swap..."
CURRENT_SWAP=$(free -m | awk '/Swap:/ {print $2}')
if [ "$CURRENT_SWAP" -lt 512 ]; then
    echo "Creating 1GB Swap file at /swapfile..."
    # fallocate or dd fallback
    if ! fallocate -l 1G /swapfile 2>/dev/null; then
        dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
    fi
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    
    # Persist in /etc/fstab
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi
    echo "Swap created successfully."
else
    echo "Swap already configured (${CURRENT_SWAP} MB), skipping creation."
fi

# ------------------------------------------------------------------------------
# 4. Kernel & Network Optimization (sysctl)
# ------------------------------------------------------------------------------
echo "[4/7] Tuning Kernel Parameters and Network Stack (sysctl)..."

cat > /etc/sysctl.d/99-custom-sysctl.conf << 'EOF'
# Memory and Swap behavior
vm.swappiness = 20
vm.vfs_cache_pressure = 50

# Maximum open files and inotify limits
fs.file-max = 1000000
fs.inotify.max_user_instances = 8192

# Network backlog and connection queue
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 32768

# Socket buffer limits (16MB max)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Connection reuse and timeouts
net.ipv4.tcp_fin_timeout = 20
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 3

# Fast Open
net.ipv4.tcp_fastopen = 3

# Congestion Control (BBR)
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# IP Forwarding (useful for VPN / Docker / Proxy)
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

sysctl --system > /dev/null 2>&1 || true

# ------------------------------------------------------------------------------
# 5. File Descriptor & Process Limits
# ------------------------------------------------------------------------------
echo "[5/7] Increasing File Descriptor (ulimit) Limits..."

cat > /etc/security/limits.d/99-nofile.conf << 'EOF'
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
root soft nofile 65535
root hard nofile 65535
root soft nproc 65535
root hard nproc 65535
EOF

# Ensure PAM limits are applied for sessions
if grep -q "pam_limits.so" /etc/pam.d/common-session; then
    :
else
    echo "session required pam_limits.so" >> /etc/pam.d/common-session
fi

# systemd global limits
mkdir -p /etc/systemd/system.conf.d/
cat > /etc/systemd/system.conf.d/limits.conf << 'EOF'
[Manager]
DefaultLimitNOFILE=65535
DefaultLimitNPROC=65535
EOF

# ------------------------------------------------------------------------------
# 6. SSH Optimization & Fail2ban Protection
# ------------------------------------------------------------------------------
echo "[6/7] Optimizing SSH Connection and Configuring Fail2ban..."

# Speed up SSH login by disabling reverse DNS lookup & configure keepalive
sed -i 's/^#*UseDNS.*/UseDNS no/' /etc/ssh/sshd_config
sed -i 's/^#*ClientAliveInterval.*/ClientAliveInterval 30/' /etc/ssh/sshd_config
sed -i 's/^#*ClientAliveCountMax.*/ClientAliveCountMax 3/' /etc/ssh/sshd_config

# Ensure UseDNS and ClientAlive settings exist if not already replaced
grep -q "^UseDNS" /etc/ssh/sshd_config || echo "UseDNS no" >> /etc/ssh/sshd_config
grep -q "^ClientAliveInterval" /etc/ssh/sshd_config || echo "ClientAliveInterval 30" >> /etc/ssh/sshd_config
grep -q "^ClientAliveCountMax" /etc/ssh/sshd_config || echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config

# Ensure root password login remains enabled for the user
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config

systemctl restart ssh || systemctl restart sshd

# Configure Fail2ban for SSH protection
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(default_backend)s
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ------------------------------------------------------------------------------
# 7. Systemd Journal & Log Size Limiting (Protects 5G Disk)
# ------------------------------------------------------------------------------
echo "[7/7] Restricting Systemd Journal Size to Prevent Disk Fill-up..."

mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/size-limit.conf << 'EOF'
[Journal]
SystemMaxUse=50M
SystemMaxFileSize=10M
RuntimeMaxUse=30M
RuntimeMaxFileSize=10M
EOF

systemctl restart systemd-journald
journalctl --vacuum-size=50M > /dev/null 2>&1 || true

echo "=========================================================="
echo " Optimization Completed Successfully!"
echo "=========================================================="
