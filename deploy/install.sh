#!/usr/bin/env bash
# Instalare completa a mini-CRM-ului pe un VPS Ubuntu/Debian.
# Nu atinge aplicatiile care ruleaza deja: adauga doar un serviciu nou si un
# site nginx nou, pe un port local liber.
#
# Rulare (ca root):
#   DOMAIN=crm.andaxi.ro ADMIN_EMAIL=contact@andaxi.ro \
#   bash <(curl -fsSL https://raw.githubusercontent.com/SilverName99/Andaxi-mini-crm/main/deploy/install.sh)
set -euo pipefail

DOMAIN="${DOMAIN:-crm.andaxi.ro}"
ADMIN_EMAIL="${ADMIN_EMAIL:-contact@andaxi.ro}"
ADMIN_NAME="${ADMIN_NAME:-Alexandru}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
REPO="${REPO:-https://github.com/SilverName99/Andaxi-mini-crm.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/andaxi-crm}"
PORT="${PORT:-}"
SETUP_HTTPS="${SETUP_HTTPS:-true}"

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; BOLD=$'\e[1m'; OFF=$'\e[0m'
pas()  { echo; echo "${BLUE}${BOLD}▸ $*${OFF}"; }
ok()   { echo "${GREEN}  ✔ $*${OFF}"; }
info() { echo "  $*"; }
avert(){ echo "${YELLOW}  ! $*${OFF}"; }
stop() { echo; echo "${RED}${BOLD}✖ $*${OFF}"; exit 1; }

port_ocupat() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0 || return 1; }

echo "${BOLD}═══ Instalare Andaxi mini-CRM ═══${OFF}"
info "domeniu: $DOMAIN · folder: $APP_DIR · branch: $BRANCH"

[ "$(id -u)" -eq 0 ] || stop "Ruleaza ca root (in terminalul Hostinger esti deja root)."
command -v apt-get >/dev/null || stop "Scriptul e pentru Ubuntu/Debian."

if [ -z "$ADMIN_PASSWORD" ]; then
  if [ -t 0 ]; then
    echo
    read -rsp "  Alege parola pentru contul $ADMIN_EMAIL (min. 8 caractere): " ADMIN_PASSWORD; echo
  else
    stop "Lipseste parola. Ruleaza cu: ADMIN_PASSWORD='parola-ta' bash <(curl …)"
  fi
fi
[ "${#ADMIN_PASSWORD}" -ge 8 ] || stop "Parola trebuie sa aiba minim 8 caractere."

# ─────────────────────────────────────────────── verificari inainte de a schimba ceva
pas "Verific ce e deja pe server"
if port_ocupat 80 && ! command -v nginx >/dev/null; then
  stop "Portul 80 e ocupat de altceva decat nginx (probabil Apache sau un container Docker).
    Nu vreau sa stric ce ai deja. Trimite-mi rezultatul lui deploy/check.sh si iti dau varianta potrivita."
fi
command -v nginx >/dev/null && ok "nginx: instalat" || info "nginx: se va instala"

# ─────────────────────────────────────────────── pachete
pas "Instalez ce lipseste (git, nginx, certbot, sqlite3)"
LIPSA=()
for pachet in git curl nginx certbot python3-certbot-nginx sqlite3; do
  dpkg -s "$pachet" >/dev/null 2>&1 || LIPSA+=("$pachet")
done
if [ ${#LIPSA[@]} -gt 0 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq "${LIPSA[@]}"
  ok "instalate: ${LIPSA[*]}"
else
  ok "toate erau deja instalate"
fi

pas "Verific Node.js"
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  info "instalez Node.js 20 (acum: ${NODE_MAJOR:-lipseste})"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
ok "Node $(node -v), npm $(npm -v)"

# ─────────────────────────────────────────────── port liber
pas "Aleg un port local liber"
if [ -z "$PORT" ]; then
  for candidat in $(seq 4000 4020); do
    if ! port_ocupat "$candidat"; then PORT="$candidat"; break; fi
  done
fi
[ -n "$PORT" ] || stop "Nu am gasit niciun port liber intre 4000 si 4020."
ok "port: $PORT (doar local, nu se expune direct in internet)"

# ─────────────────────────────────────────────── cod
pas "Aduc codul aplicatiei"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
  ok "actualizat din $BRANCH"
else
  mkdir -p "$APP_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
  ok "clonat in $APP_DIR"
fi
mkdir -p "$APP_DIR/data"

# ─────────────────────────────────────────────── configurare
pas "Scriu configurarea"
ENV_FILE="$APP_DIR/server/.env"
if [ -f "$ENV_FILE" ]; then
  ok ".env exista deja — il pastrez neschimbat"
else
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:$APP_DIR/data/crm.db"
JWT_SECRET="$(openssl rand -hex 32)"
PORT=$PORT
NODE_ENV=production
CORS_ORIGINS="https://$DOMAIN"
SESSION_DAYS=30
SEED_EMAIL="$ADMIN_EMAIL"
SEED_PASSWORD="$ADMIN_PASSWORD"
SEED_NAME="$ADMIN_NAME"
SEED_DEMO="false"
EOF
  chmod 600 "$ENV_FILE"
  ok "am generat .env (cu secret unic pentru sesiuni)"
fi

# ─────────────────────────────────────────────── build
pas "Instalez dependentele si construiesc aplicatia (dureaza 1-3 minute)"
cd "$APP_DIR"
npm install --include=dev --no-audit --no-fund --loglevel=error
npm run db:generate --silent
npm run db:push --silent
npm run db:seed
npm run build --silent
ok "aplicatia e construita"

chown -R www-data:www-data "$APP_DIR"

# ─────────────────────────────────────────────── serviciu
pas "Configurez serviciul care porneste automat la reboot"
cat > /etc/systemd/system/andaxi-crm.service <<EOF
[Unit]
Description=Andaxi mini-CRM (API + interfata)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR/server
EnvironmentFile=$APP_DIR/server/.env
Environment=NODE_ENV=production
ExecStart=$(command -v node) dist/index.js
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet andaxi-crm
systemctl restart andaxi-crm
sleep 3
systemctl is-active --quiet andaxi-crm || {
  journalctl -u andaxi-crm -n 30 --no-pager
  stop "Serviciul nu a pornit. Log-ul e mai sus."
}
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || stop "Serviciul ruleaza dar nu raspunde pe portul $PORT."
ok "serviciul andaxi-crm ruleaza"

# ─────────────────────────────────────────────── nginx
pas "Public aplicatia pe $DOMAIN"
cat > "/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 10M;
    access_log /var/log/nginx/andaxi-crm.access.log;
    error_log  /var/log/nginx/andaxi-crm.error.log;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t >/dev/null 2>&1 || { nginx -t; stop "Configurarea nginx are o problema (vezi mai sus)."; }
systemctl reload nginx || systemctl start nginx
ok "nginx configurat"

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ok "firewall: am deschis porturile 80 si 443"
fi

# ─────────────────────────────────────────────── HTTPS
if [ "$SETUP_HTTPS" = "true" ]; then
  pas "Instalez certificatul HTTPS"
  IP_SERVER="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || echo '')"
  IP_DOMENIU="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || echo '')"
  if [ -z "$IP_DOMENIU" ]; then
    avert "$DOMAIN inca nu se rezolva in DNS. Sar peste HTTPS."
    avert "Dupa ce adaugi recordul A in Cloudflare, ruleaza:  certbot --nginx -d $DOMAIN"
  elif [ -n "$IP_SERVER" ] && [ "$IP_DOMENIU" != "$IP_SERVER" ]; then
    avert "$DOMAIN arata spre $IP_DOMENIU, dar serverul asta e $IP_SERVER."
    avert "Daca ai proxy-ul Cloudflare pornit (norisor portocaliu), opreste-l temporar (DNS only) si ruleaza:  certbot --nginx -d $DOMAIN"
  else
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect \
      && ok "HTTPS activ" \
      || avert "certbot nu a reusit. Reincearca manual: certbot --nginx -d $DOMAIN"
  fi
fi

# ─────────────────────────────────────────────── backup zilnic
pas "Configurez backup zilnic al bazei de date"
mkdir -p /var/backups/andaxi-crm
cat > /etc/cron.daily/andaxi-crm-backup <<EOF
#!/bin/sh
# backup zilnic, pastrat 30 de zile
sqlite3 "$APP_DIR/data/crm.db" ".backup '/var/backups/andaxi-crm/crm-\$(date +%F).db'" 2>/dev/null
find /var/backups/andaxi-crm -name 'crm-*.db' -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/andaxi-crm-backup
ok "backup zilnic in /var/backups/andaxi-crm"

# ─────────────────────────────────────────────── gata
echo
echo "${GREEN}${BOLD}═══════════════════════════════════════════${OFF}"
echo "${GREEN}${BOLD} Gata! Aplicatia ruleaza.${OFF}"
echo "${GREEN}${BOLD}═══════════════════════════════════════════${OFF}"
echo
echo "  Adresa:   ${BOLD}https://$DOMAIN${OFF}"
echo "  Cont:     ${BOLD}$ADMIN_EMAIL${OFF}"
echo "  Parola:   cea aleasa de tine acum"
echo
echo "  Dupa prima autentificare, schimba parola din Setari → Cont."
echo
echo "  Comenzi utile:"
echo "    systemctl status andaxi-crm      # cum merge aplicatia"
echo "    journalctl -u andaxi-crm -f      # log in timp real"
echo "    bash $APP_DIR/deploy/deploy.sh   # actualizare la o versiune noua"
echo
