#!/bin/bash
set -o pipefail
# Панель управления. Двойной клик из Finder открывает её в Терминале.

cd "$(dirname "$0")" || exit 1
# у Finder урезанный PATH — docker в нём не виден
PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

E=$'\033'; R="$E[0m"; B="$E[1m"; DIM="$E[2m"
PINK="$E[38;5;205m"; GREEN="$E[38;5;42m"; BLUE="$E[38;5;75m"
AMBER="$E[38;5;214m"; RED="$E[38;5;203m"; GREY="$E[38;5;245m"

line() { printf "  ${GREY}%s${R}\n" "──────────────────────────────────────────────"; }
dot()  { [ "$1" = up ] && printf "${GREEN}●${R}" || printf "${RED}○${R}"; }

daemon_up() { docker info >/dev/null 2>&1; }
svc_status() { docker compose ps --format '{{.Service}} {{.Status}}' 2>/dev/null | grep "^$1 " | cut -d' ' -f2-; }

tunnel_url() {
  docker compose exec -T app python -c "import json,os,urllib.request;print(os.environ.get('WEBAPP_URL') or 'https://'+json.load(urllib.request.urlopen('http://tunnel:2000/quicktunnel',timeout=4))['hostname'])" 2>/dev/null | tr -d '\r'
}

status() {
  printf "\n"
  if daemon_up; then
    printf "   Docker Desktop   %s ${DIM}работает${R}\n" "$(dot up)"
    local app tun
    app=$(svc_status app); tun=$(svc_status tunnel)
    [ -n "$app" ] && printf "   Приложение       %s ${DIM}%s${R}\n" "$(dot up)" "$app" \
                  || printf "   Приложение       %s ${DIM}остановлено${R}\n" "$(dot down)"
    [ -n "$tun" ] && printf "   Туннель          %s ${DIM}%s${R}\n" "$(dot up)" "$tun" \
                  || printf "   Туннель          %s ${DIM}остановлен${R}\n" "$(dot down)"
    URL=$(tunnel_url)
    [ -n "$URL" ] && printf "   Адрес            ${BLUE}%s${R}\n" "$URL" \
                  || { [ -n "$app" ] && printf "   Адрес            ${DIM}ещё определяется${R}\n"; }
  else
    printf "   Docker Desktop   %s ${DIM}выключен${R}\n" "$(dot down)"
    printf "   Приложение       %s\n" "$(dot down)"
    printf "   Туннель          %s\n" "$(dot down)"
  fi
  printf "\n"
}

wait_daemon() {
  printf "   ${DIM}жду Docker"
  local i=0
  until daemon_up; do
    i=$((i + 1)); [ "$i" -gt 90 ] && printf " — не поднялся за 3 минуты${R}\n" && return 1
    printf "."; sleep 2
  done
  printf " готов${R}\n"
}

start_all() {
  printf "\n   ${GREEN}${B}Запускаю${R}\n"
  open -ga Docker 2>/dev/null
  wait_daemon || return
  docker compose up -d --build 2>&1 | sed 's/^/   /' || return 1
  printf "   ${DIM}жду адрес туннеля"
  local i=0 U=
  while [ "$i" -lt 40 ]; do
    U=$(tunnel_url); [ -n "$U" ] && break
    printf "."; i=$((i + 1)); sleep 3
  done
  [ -n "$U" ] && printf " готов${R}\n   ${BLUE}%s${R}\n" "$U" \
              || printf "${R}\n   ${AMBER}адрес не появился — нажми L и посмотри логи${R}\n"
}

stop_all() {
  printf "\n   ${AMBER}${B}Выключаю всё${R}\n"
  docker compose down 2>&1 | sed 's/^/   /'
  osascript -e 'quit app "Docker Desktop"' 2>/dev/null || osascript -e 'quit app "Docker"' 2>/dev/null
  printf "   ${DIM}Docker Desktop закрыт${R}\n"
}

header() {
  clear 2>/dev/null || printf '\033[2J\033[H'
  printf "\n"
  printf "  ${PINK}${B}╭────────────────────────────────────────────╮${R}\n"
  printf "  ${PINK}${B}│${R}  ${B}FOR GITHUB${R}  ${DIM}словарь · привычки · фокус${R}       ${PINK}${B}│${R}\n"
  printf "  ${PINK}${B}╰────────────────────────────────────────────╯${R}\n"
}

menu() {
  line
  printf "   ${GREEN}${B}S${R}  Запустить всё\n"
  printf "   ${RED}${B}X${R}  Выключить всё, вместе с Docker\n"
  printf "   ${AMBER}${B}R${R}  Перезапустить\n"
  printf "   ${BLUE}${B}L${R}  Логи ${DIM}(Ctrl+C — выйти из логов)${R}\n"
  printf "   ${BLUE}${B}O${R}  Открыть приложение в браузере\n"
  printf "   ${GREY}${B}Q${R}  ${DIM}Закрыть панель, ничего не выключая${R}\n"
  line
  printf "\n   выбор: "
}

[ "$1" = status ] && { header; status; exit 0; }

while true; do
  header; status; menu
  read -rsn1 key
  case "$key" in
    s|S|ы|Ы) start_all ;;
    x|X|ч|Ч) stop_all ;;
    r|R|к|К) stop_all; start_all ;;
    l|L|д|Д) printf "\n"; docker compose logs -f --tail 40 ;;
    o|O|щ|Щ) U=$(tunnel_url); [ -n "$U" ] && open "$U" || printf "\n   ${DIM}адреса пока нет${R}\n" ;;
    q|Q|й|Й) printf "\n   ${DIM}панель закрыта, приложение работает${R}\n\n"; exit 0 ;;
    *) continue ;;
  esac
  printf "\n   ${DIM}любая клавиша — назад${R}"
  read -rsn1
done
