@echo off
cd /d "%~dp0"
start "" "http://localhost:5000"
node app.js
pause

