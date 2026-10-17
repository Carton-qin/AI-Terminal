@echo off
chcp 65001 >nul
echo ========================================================
echo   AI Terminal - Windows 独立后端与桌面应用构建脚本
echo ========================================================

echo [1/3] 正在构建前端 React 单页应用...
cd /d "%~dp0..\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端构建失败!
    exit /b %errorlevel%
)

echo [2/3] 正在使用 PyInstaller 编译 Windows 后端独立二进制 (aiterm-backend.exe)...
cd /d "%~dp0.."
if not exist "backend-dist" mkdir "backend-dist"

pyinstaller --noconfirm --onedir --name aiterm-backend ^
  --paths "%~dp0..\backend" ^
  --paths "%~dp0..\..\ai-terminal" ^
  --collect-all uvicorn ^
  --collect-all fastapi ^
  --collect-all paramiko ^
  --collect-all cryptography ^
  --add-data "%~dp0..\frontend\dist;frontend/dist" ^
  --distpath "%~dp0..\backend-dist" ^
  --workpath "%~dp0..\..\build\pyinstaller_win\build" ^
  "%~dp0..\backend\app.py"

if %errorlevel% neq 0 (
    echo [错误] 后端 PyInstaller 编译失败!
    exit /b %errorlevel%
)

echo [3/3] 正在使用 electron-builder 打包 Windows 安装包 (.exe / NSIS)...
cd /d "%~dp0.."
call npx electron-builder --win nsis portable zip

echo ========================================================
echo   Windows 打包完成！生成产物位于: dist-electron/
echo ========================================================
pause
