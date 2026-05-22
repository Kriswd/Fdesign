@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
if not defined FDESIGN_DATA_DIR (
  set "FDESIGN_DATA_DIR=%~dp0output"
)
call :start
exit /b %ERRORLEVEL%

:resolve_runtime
set "NODE_EXE=node"
if exist "%~dp0runtime\node\node.exe" (
  set "NODE_EXE=%~dp0runtime\node\node.exe"
)
goto :eof

:kill_port
set "TARGET_PORT=%~1"
if "%TARGET_PORT%"=="" goto :eof
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%TARGET_PORT% " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
goto :eof

:start
call :resolve_runtime
call :kill_port 3001

echo.
echo [INFO] Starting Fdesign V3.0...
echo [INFO] ????: %FDESIGN_DATA_DIR%
echo.

start "" "http://127.0.0.1:3001/"
"%NODE_EXE%" "%~dp0server\index.js"
pause
exit /b %ERRORLEVEL%

