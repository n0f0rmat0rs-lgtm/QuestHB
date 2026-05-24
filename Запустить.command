#!/bin/bash
cd "$(dirname "$0")"
echo "Устанавливаем зависимости..."
pip3 install -q flask
echo "Запускаем игру..."
python3 app.py &
SERVER_PID=$!
sleep 2
open http://localhost:5000
echo ""
echo "Игра открыта в браузере!"
echo "Чтобы остановить сервер - закройте это окно."
wait $SERVER_PID
