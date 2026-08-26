#!/usr/bin/env bash
# Publica portalul clientilor pe un domeniu separat (ex. client.andaxi.ro),
# catre aceeasi aplicatie. Pe domeniul asta se vede DOAR portalul: rutele de
# administrare returneaza 404.
#
# Ruleaza ca root, pe server:
#   DOMAIN=client.andaxi.ro ADMIN_EMAIL=contact@andaxi.ro bash /var/www/andaxi-crm/deploy/portal-domain.sh
set -euo pipefail

DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
APP_DIR="${APP_DIR:-/var/www/andaxi-crm}"

verde()  { printf '\033[32m✔\033[0m %s\n' "$1"; }
galben() { printf '\033[33m!\033[0m %s\n' "$1"; }
pas()    { printf '\n\033[1m→ %s\033[0m\n' "$1"; }
stop()   { printf '\033[31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = "0" ] || stop "Ruleaza cu sudo/root."
[ -n "$DOMAIN" ] || stop "Lipseste DOMAIN. Exemplu: DOMAIN=client.andaxi.ro bash $0"
[ -d "$APP_DIR" ] || stop "Nu gasesc aplicatia in $APP_DIR."
command -v nginx >/dev/null || stop "nginx nu e instalat pe server."

# portul aplicatiei: din server/.env, altfel 4000
PORT="$(grep -E '^PORT=' "$APP_DIR/server/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' \r' || true)"
PORT="${PORT:-4000}"
curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 \
  || stop "Aplicatia nu raspunde pe portul $PORT. Porneste-o intai: systemctl start andaxi-crm"
verde "aplicatia raspunde pe portul $PORT"

pas "Scriu configurarea nginx pentru $DOMAIN"
SITE="/etc/nginx/sites-available/$DOMAIN"
[ -f "$SITE" ] && cp "$SITE" "$SITE.backup-$(date +%F-%H%M)" && galben "am pastrat o copie a configurarii vechi"

sed -e "s/client\.andaxi\.ro/$DOMAIN/g" -e "s|127\.0\.0\.1:4000|127.0.0.1:$PORT|g" \
  "$APP_DIR/deploy/nginx-portal.conf" > "$SITE"

ln -sf "$SITE" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t >/dev/null 2>&1 || { nginx -t; stop "Configurarea nginx are o problema (vezi mai sus)."; }
systemctl reload nginx || systemctl start nginx
verde "nginx configurat"

pas "Verific DNS-ul"
IP_SERVER="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || echo '')"
IP_DOMENIU="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || echo '')"

if [ -z "$IP_DOMENIU" ]; then
  galben "$DOMAIN inca nu se rezolva in DNS."
  galben "Adauga in Cloudflare un record A: Name = ${DOMAIN%%.*}, IPv4 = ${IP_SERVER:-IP-ul serverului}, Proxy status = DNS only."
  galben "Apoi ruleaza:  certbot --nginx -d $DOMAIN"
  exit 0
fi

if [ -n "$IP_SERVER" ] && [ "$IP_DOMENIU" != "$IP_SERVER" ]; then
  galben "$DOMAIN arata spre $IP_DOMENIU, dar serverul asta e $IP_SERVER."
  galben "Daca ai proxy-ul Cloudflare pornit (norisor portocaliu), treci-l pe DNS only si ruleaza:  certbot --nginx -d $DOMAIN"
  exit 0
fi
verde "$DOMAIN arata spre serverul asta"

pas "Instalez certificatul HTTPS"
if ! command -v certbot >/dev/null; then
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || stop "Nu am putut instala certbot."
fi
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
     ${ADMIN_EMAIL:+-m "$ADMIN_EMAIL"} ${ADMIN_EMAIL:+--no-eff-email} --redirect; then
  verde "HTTPS activ"
else
  galben "certbot nu a reusit. Reincearca manual:  certbot --nginx -d $DOMAIN"
fi

printf '\n\033[1mGata.\033[0m Portalul e pe: https://%s\n' "$DOMAIN"
printf 'Ultimul pas, din CRM: Setari → Adresa portalului → scrie https://%s si salveaza.\n' "$DOMAIN"
printf 'Dupa asta, linkurile copiate din fisa fiecarui client pleaca de pe domeniul nou.\n'
