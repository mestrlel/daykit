#!/bin/sh
# PATH задан явно: у среды, из которой это запускают, он бывает урезан.
PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
export PATH
cd "$(dirname "$0")" || exit 1

open -ga Docker 2>/dev/null                      # no-op, если Docker Desktop уже поднят
i=0
while ! docker info >/dev/null 2>&1; do          # демон стартует не мгновенно
  i=$((i + 1))
  [ "$i" -gt 90 ] && echo "Docker Desktop не поднялся за 3 минуты" && exit 1
  sleep 2
done

current_url() {
  docker compose exec -T app python -c "import json,os,urllib.request;print(os.environ.get('WEBAPP_URL') or 'https://'+json.load(urllib.request.urlopen('http://tunnel:2000/quicktunnel',timeout=4))['hostname'])" 2>/dev/null | tr -d '\r'
}

docker compose up -d --build || exit 1
echo "стек поднят, жду адрес туннеля…"
i=0
while [ "$i" -lt 60 ]; do                        # quick-туннель получает адрес не сразу
  U=$(current_url)
  [ -n "$U" ] && echo "готово. Mini App: $U" && exit 0
  i=$((i + 1)); sleep 3
done
echo "стек поднят, но адрес туннеля не появился — docker compose logs tunnel"
