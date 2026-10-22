#!/usr/bin/env bash
# Экспорт всех экранов доски в PNG через headless Chrome.
# Нужен запущенный dev-сервер (npm run dev). Список экранов берётся из src/board/shots.tsx.
#   scripts/export-shots.sh [адрес] [папка]
set -euo pipefail

cd "$(dirname "$0")/.."
BASE="${1:-http://localhost:5173}"
OUT="${2:-../../design/screens}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
SCALE=2

mkdir -p "$OUT"
curl -sf "$BASE" > /dev/null || { echo "Dev-сервер не отвечает на $BASE" >&2; exit 1; }

# id и тип каждого экрана: { id: 'web-dashboard', group: 'web', kind: 'web', ...
grep -oE "id: '[a-z-]+', group: '[a-z]+', kind: '(web|phone)'" src/board/shots.tsx |
  sed -E "s/id: '([a-z-]+)'.*kind: '([a-z]+)'/\1 \2/" |
  while read -r id kind; do
    # Веб 1440×900; телефон 352×822 плюс поля 24 px из ShotView
    if [ "$kind" = web ]; then size=1440,900; else size=400,870; fi
    # Пустой кадр весит несколько КБ: страница не успела загрузиться, повторяем с запасом времени
    for budget in 4000 8000 15000; do
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion \
        --force-device-scale-factor="$SCALE" --window-size="$size" --virtual-time-budget="$budget" \
        --screenshot="$OUT/$id.png" "$BASE/#shot/$id" 2> /dev/null
      [ "$(stat -c %s "$OUT/$id.png")" -gt 20000 ] && break
    done
    echo "$OUT/$id.png"
  done

# Доска и UX-документация целиком, ширина 1600. Высоты страниц при этой ширине:
# document.documentElement.scrollHeight, обновить при изменении контента.
# Доска монтирует 33 живых экрана и не всегда успевает за бюджет: пустая доска весит ~350 КБ, полная больше 1 МБ.
page() {
  local name=$1 height=$2 min=$3
  for budget in 15000 30000 45000 60000; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion \
      --window-size=1600,"$height" --virtual-time-budget="$budget" \
      --screenshot="$OUT/../$name.png" "$BASE/#$name" 2> /dev/null
    [ "$(stat -c %s "$OUT/../$name.png")" -gt "$min" ] && break
  done
  echo "$OUT/../$name.png"
}
page board 5789 800000
page ux 7224 600000
