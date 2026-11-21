#!/usr/bin/env sh
# Запуск «Послевкусия» на этом компьютере: http://localhost:8765
# macOS: двойной клик не сработает для .sh — откройте Терминал в этой папке и выполните: sh start.sh
cd "$(dirname "$0")" || exit 1
PORT=${PORT:-8765}
URL="http://localhost:$PORT/"
echo "Послевкусие: $URL  (остановить — Ctrl+C)"
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) >/dev/null 2>&1 &
if command -v python3 >/dev/null; then exec python3 -m http.server "$PORT"; else exec python -m http.server "$PORT"; fi
