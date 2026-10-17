@echo off
chcp 65001 >nul
title AI Terminal 桌面工作台

echo ========================================================
echo   ⚡ 正在启动 AI Terminal 智能桌面工作台 (Windows)...
echo ========================================================

cd /d "%~dp0"

REM 检查是否有现成的打包二进制
if exist "dist-electron\win-unpacked\AI-Terminal.exe" (
    echo [启动模式] 启动已打包的桌面客户端...
    start "" "dist-electron\win-unpacked\AI-Terminal.exe"
    exit /b 0
)

REM 优先检查 Python 虚拟环境
set PYTHON_BIN=python
if exist "..\.venv\Scripts\python.exe" (
    set PYTHON_BIN=..\.venv\Scripts\python.exe
)

REM 检查前端构建产物
if not exist "frontend\dist\index.html" (
    echo [构建提示] 正在执行前端首次编译打包...
    cd frontend
    call npm run build
    cd ..
)

echo [服务配置] 启动本地服务端口: 8765
echo [浏览器唤起] 正在打开工作台: http://127.0.0.1:8765

start "" http://127.0.0.1:8765

cd backend
set PYTHONPATH=%cd%;%cd%\..\..\ai-terminal;%PYTHONPATH%
%PYTHON_BIN% app.py
pause
