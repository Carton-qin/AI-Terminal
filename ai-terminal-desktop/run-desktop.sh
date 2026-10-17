#!/usr/bin/env bash
# AI Terminal 独立桌面工作台一键启动脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "⚡ 正在启动 AI Terminal 独立桌面工作台..."

# 优先使用项目配置的 Python 虚拟环境
if [ -f "$ROOT_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
else
    echo "❌ 错误: 未检测到 Python 3 环境"
    exit 1
fi

# 检查前端静态产物是否存在，若无则执行一次构建
if [ ! -d "$SCRIPT_DIR/frontend/dist" ]; then
    echo "📦 检测到尚未构建前端，正在进行首次极速打包..."
    (cd "$SCRIPT_DIR/frontend" && npm run build)
fi

PORT=8765
URL="http://127.0.0.1:$PORT"

echo "🚀 服务端口: $PORT"
echo "🌐 正在打开桌面工作台: $URL"

# 在 macOS 上自动唤起浏览器窗口
if [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 1 && open "$URL") &
fi

# 启动后端服务
cd "$SCRIPT_DIR/backend"
PYTHONPATH="$SCRIPT_DIR/backend:$ROOT_DIR/ai-terminal:$PYTHONPATH" exec "$PYTHON_BIN" app.py
