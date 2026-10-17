#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/.." && pwd)"

echo "📦 [1/3] 正在构建前端 React 单页应用..."
(cd "$DESKTOP_DIR/frontend" && npm run build)

echo "🐍 [2/3] 正在使用 PyInstaller 编译 macOS 后端独立二进制..."
export PYINSTALLER_CONFIG_DIR="$ROOT_DIR/build/pyinstaller_cache"

mkdir -p "$DESKTOP_DIR/backend-dist"

"$ROOT_DIR/.venv/bin/pyinstaller" --noconfirm --onedir --name aiterm-backend \
  --paths "$DESKTOP_DIR/backend" \
  --paths "$ROOT_DIR/ai-terminal" \
  --collect-all uvicorn \
  --collect-all fastapi \
  --collect-all websockets \
  --collect-all paramiko \
  --collect-all cryptography \
  --hidden-import ai_service \
  --hidden-import host_store \
  --hidden-import pty_session \
  --hidden-import ssh_session \
  --hidden-import aiterm \
  --hidden-import aiterm.config \
  --hidden-import aiterm.context \
  --hidden-import aiterm.llm \
  --hidden-import aiterm.safety \
  --add-data "$DESKTOP_DIR/frontend/dist:frontend/dist" \
  --distpath "$DESKTOP_DIR/backend-dist" \
  --workpath "$ROOT_DIR/build/pyinstaller/build" \
  "$DESKTOP_DIR/backend/app.py"

echo "✅ [3/3] 后端二进制编译成功: $DESKTOP_DIR/backend-dist/aiterm-backend"
