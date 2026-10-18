#!/bin/bash
# Hecele'yi yerel sunucuda açar (EMA sesi ve mikrofon için gerekli).
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:$PORT" ) &
echo "Hecele çalışıyor: http://localhost:$PORT  (kapatmak için bu pencereyi kapatın)"
python3 -m http.server "$PORT"
