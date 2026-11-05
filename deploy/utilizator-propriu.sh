#!/usr/bin/env bash
# Muta serviciul mini-CRM pe un utilizator de sistem al lui (andaxi-crm), in locul
# lui www-data, pe care il pot folosi si alte aplicatii de pe server (nginx, PHP).
# Asa cheia licentelor si baza de date nu le poate citi decat CRM-ul.
#
# NU se ruleaza singur la deploy. O data, cand vrei, ca root:
#   bash /var/www/andaxi-crm/deploy/utilizator-propriu.sh
# Inapoi la www-data:
#   bash /var/www/andaxi-crm/deploy/utilizator-propriu.sh --inapoi
#
# Ce face: creeaza utilizatorul (fara login, fara home), pune un fisier „drop-in"
# pentru systemd (User=/Group=), da folderul aplicatiei acestui utilizator,
# strange drepturile pe data/ (0700) si pe cheie (0600) si reporneste serviciul.
# deploy.sh citeste apoi utilizatorul din systemd, deci actualizarile il pastreaza.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/andaxi-crm}"
UTILIZATOR="${UTILIZATOR:-andaxi-crm}"
DROPIN_DIR=/etc/systemd/system/andaxi-crm.service.d
DROPIN="$DROPIN_DIR/utilizator.conf"

[ "$(id -u)" -eq 0 ] || { echo "Ruleaza ca root."; exit 1; }
[ -d "$APP_DIR" ] || { echo "Nu gasesc $APP_DIR"; exit 1; }

if [ "${1:-}" = "--inapoi" ]; then
  rm -f "$DROPIN"
  systemctl daemon-reload
  chown -R www-data:www-data "$APP_DIR"
  systemctl restart andaxi-crm
  echo "✔ Serviciul ruleaza din nou ca www-data."
  exit 0
fi

if ! id "$UTILIZATOR" >/dev/null 2>&1; then
  echo "→ Creez utilizatorul de sistem $UTILIZATOR…"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$UTILIZATOR"
fi

echo "→ Opresc serviciul…"
systemctl stop andaxi-crm

echo "→ Pun utilizatorul in systemd ($DROPIN)…"
mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<CONF
[Service]
User=$UTILIZATOR
Group=$UTILIZATOR
CONF
systemctl daemon-reload

echo "→ Dau folderul aplicatiei lui $UTILIZATOR…"
chown -R "$UTILIZATOR:$UTILIZATOR" "$APP_DIR"
if [ -d "$APP_DIR/data" ]; then
  chmod 700 "$APP_DIR/data"
  [ -d "$APP_DIR/data/licenta" ] && chmod 700 "$APP_DIR/data/licenta" && find "$APP_DIR/data/licenta" -type f -exec chmod 600 {} +
fi
# .env are JWT_SECRET si parola SMTP
[ -f "$APP_DIR/server/.env" ] && chmod 600 "$APP_DIR/server/.env"

echo "→ Pornesc serviciul…"
systemctl start andaxi-crm
sleep 2
systemctl status andaxi-crm --no-pager --lines 5
echo "✔ Gata: serviciul ruleaza ca $(systemctl show -p User --value andaxi-crm)."
