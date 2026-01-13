@echo off
chcp 65001 > nul
echo 正在启动本地 Web 服务器...
cd /d "%~dp0"
http-server -p 8000
pause