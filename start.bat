@echo off
rem Запуск «Послевкусия» на Windows: http://localhost:8765 (нужен Python с python.org)
chcp 65001 >nul
cd /d "%~dp0"
echo Послевкусие: http://localhost:8765/   (остановить - закройте это окно)
start "" http://localhost:8765/
python -m http.server 8765 || py -m http.server 8765
pause
