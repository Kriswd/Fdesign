@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
set "MODE=%~1"
if not defined FDESIGN_DATA_DIR (
  set "FDESIGN_DATA_DIR=%~dp0output"
)

if /i "%MODE%"=="dev" goto dev
if /i "%MODE%"=="prod-admin" goto prod_admin
if /i "%MODE%"=="prod-user" goto prod_user
if /i "%MODE%"=="prod" goto prod_user
if /i "%MODE%"=="release" goto prod_user

:menu
cls
echo ========================================
echo   Fdesign V3.0 Launcher
echo ========================================
echo.
echo   1 - dev (server + vite dev)
echo   2 - prod admin
echo   3 - prod user
echo.
set "CHOOSE="
set /p CHOOSE=Select 1/2/3:
if "%CHOOSE%"=="1" goto dev
if "%CHOOSE%"=="2" goto prod_admin
if "%CHOOSE%"=="3" goto prod_user
echo 输入无效，请重试...
ping 127.0.0.1 -n 2 >nul
goto menu

:resolve_runtime
set "NODE_EXE=node"
set "NPM_CMD=npm"
if exist "%~dp0runtime\node\node.exe" (
  set "NODE_EXE=%~dp0runtime\node\node.exe"
)
if exist "%~dp0runtime\node\npm.cmd" (
  set "NPM_CMD=%~dp0runtime\node\npm.cmd"
)
goto :eof

:ensure_logs_dir
set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
goto :eof

:kill_port
set "TARGET_PORT=%~1"
if "%TARGET_PORT%"=="" goto :eof
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%TARGET_PORT% " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
goto :eof

:run_env_doctor
set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG_FILE=%LOG_DIR%\startup_%STAMP%.log"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\env_doctor.ps1" > "%LOG_FILE%" 2>&1
set "EC=%ERRORLEVEL%"
type "%LOG_FILE%"
if not "%EC%"=="0" (
  echo.
  echo Environment check failed. Log: "%LOG_FILE%"
  pause
  exit /b %EC%
)
goto :eof

:resolve_expected_script_build
set "EXPORT_JSX_PATH=%~dp0server\photoshop\render_export.jsx"
set "EXPECTED_JSX_BUILD="
if not exist "%EXPORT_JSX_PATH%" (
  echo [ERROR] 未找到导出脚本: "%EXPORT_JSX_PATH%"
  exit /b 1
)
for /f "usebackq tokens=4" %%i in (`findstr /c:"var SCRIPT_BUILD" "%EXPORT_JSX_PATH%"`) do set "EXPECTED_JSX_BUILD=%%i"
set "EXPECTED_JSX_BUILD=%EXPECTED_JSX_BUILD:"=%"
set "EXPECTED_JSX_BUILD=%EXPECTED_JSX_BUILD:;=%"
if not defined EXPECTED_JSX_BUILD (
  echo [ERROR] 无法从脚本读取 SCRIPT_BUILD: "%EXPORT_JSX_PATH%"
  exit /b 1
)
echo [info] 本地导出脚本版本: %EXPECTED_JSX_BUILD%
goto :eof

:verify_server_script_build
set "HEALTH_JSX_BUILD="
set "HEALTH_JSX_PATH="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ErrorActionPreference='Stop';$h=Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 8;[string]$h.runtime.exportJsxScriptBuild"`) do set "HEALTH_JSX_BUILD=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ErrorActionPreference='Stop';$h=Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 8;[string]$h.runtime.exportJsxPath"`) do set "HEALTH_JSX_PATH=%%i"
if not defined HEALTH_JSX_BUILD (
  echo [ERROR] 无法从 /health 获取服务端导出脚本版本。
  echo [INFO] 后端日志: "%DEV_SERVER_LOG%"
  call :kill_port 3001
  exit /b 1
)
if /i not "%HEALTH_JSX_BUILD%"=="%EXPECTED_JSX_BUILD%" (
  echo [ERROR] 服务端导出脚本版本与本地不一致，已阻断启动。
  echo [INFO] 期望版本: %EXPECTED_JSX_BUILD%
  echo [INFO] 服务版本: %HEALTH_JSX_BUILD%
  echo [INFO] 服务脚本路径: %HEALTH_JSX_PATH%
  echo [INFO] 后端日志: "%DEV_SERVER_LOG%"
  call :kill_port 3001
  exit /b 1
)
echo [info] 服务端导出脚本版本校验通过: %HEALTH_JSX_BUILD%
goto :eof

:build_frontend
echo.
echo [info] Building frontend assets...
set "VITE_BIN=%~dp0node_modules\vite\bin\vite.js"
if exist "%VITE_BIN%" (
  echo [info] Using local Vite: "%VITE_BIN%"
  "%NODE_EXE%" "%VITE_BIN%" build
) else (
  echo [warn] Local Vite not found, fallback to npm run build
  call "%NPM_CMD%" run build
)
if errorlevel 1 (
  echo.
  echo [error] Frontend build failed.
  echo [info] NODE_EXE=%NODE_EXE%
  echo [info] NPM_CMD=%NPM_CMD%
  pause
  exit /b 1
)
goto :eof

:dev
call :resolve_runtime
call :ensure_logs_dir
call :resolve_expected_script_build
if errorlevel 1 exit /b 1
echo.
echo [DEV] 启动开发模式...
set "FDESIGN_BACKUP_ON_START=0"
call :kill_port 3001
call :kill_port 3020
set "DEV_SERVER_LOG=%LOG_DIR%\dev_server.log"
set "DEV_WEB_LOG=%LOG_DIR%\dev_web.log"
if exist "%DEV_SERVER_LOG%" del /f /q "%DEV_SERVER_LOG%" >nul 2>&1
if exist "%DEV_WEB_LOG%" del /f /q "%DEV_WEB_LOG%" >nul 2>&1
start "PSD-Server" cmd /c ""%NODE_EXE%" "%~dp0server\index.js" > "%DEV_SERVER_LOG%" 2>&1"
ping 127.0.0.1 -n 4 >nul
call :verify_server_script_build
if errorlevel 1 exit /b 1
if exist "%~dp0node_modules\vite\bin\vite.js" (
  start "PSD-Dev" cmd /c ""%NODE_EXE%" "%~dp0node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 3020 > "%DEV_WEB_LOG%" 2>&1"
) else (
  start "PSD-Dev" cmd /c ""%NPM_CMD%" run dev > "%DEV_WEB_LOG%" 2>&1"
)
ping 127.0.0.1 -n 4 >nul
netstat -ano | findstr ":3020 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] 前端未成功监听 3020 端口。
  echo [INFO] 后端日志: "%DEV_SERVER_LOG%"
  echo [INFO] 前端日志: "%DEV_WEB_LOG%"
  echo.
  if exist "%DEV_WEB_LOG%" type "%DEV_WEB_LOG%"
  exit /b 1
)
start "" "http://127.0.0.1:3020/"
echo.
echo Backend API: http://127.0.0.1:3001
echo Frontend:    http://127.0.0.1:3020
echo.
exit /b 0

:prod_admin
call :resolve_runtime
call :run_env_doctor
call :build_frontend
call :kill_port 3001
start "" "http://127.0.0.1:3001/admin"
"%NODE_EXE%" "%~dp0server\index.js"
pause
exit /b 0

:prod_user
call :resolve_runtime
call :run_env_doctor
call :build_frontend
call :kill_port 3001
start "" "http://127.0.0.1:3001/"
"%NODE_EXE%" "%~dp0server\index.js"
pause
exit /b 0
