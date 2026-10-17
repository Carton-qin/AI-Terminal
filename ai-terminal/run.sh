#!/usr/bin/env bash
# AI Terminal 启动脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 优先使用父目录或本地已建立的虚拟环境
if [ -f "$SCRIPT_DIR/../.venv/bin/python" ]; then
    PYTHON_BIN="$SCRIPT_DIR/../.venv/bin/python"
elif [ -f "$SCRIPT_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
else
    echo "错误: 未找到 Python 3 环境，请先安装 Python 3.9+"
    exit 1
fi

PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH" exec "$PYTHON_BIN" -m aiterm "$@"
