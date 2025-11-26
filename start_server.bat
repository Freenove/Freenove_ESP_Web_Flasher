@echo off
echo 正在启动本地 Web 服务器...
echo 请确保您已全局安装 http-server (npm install -g http-server)
cd /d "%~dp0"
http-server -p 8000
pause