#!/usr/bin/env bash
# Deploy / actualizare mini-CRM Andaxi pe server.
# Ruleaza ca root:  bash /var/www/andaxi-crm/deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/andaxi-crm}"
cd "$APP_DIR"

# fisierele aplicatiei apartin lui www-data, dar comenzile se ruleaza ca root;
# fara asta git refuza sa lucreze in folder ("dubious ownership")
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# implicit ramanem pe branch-ul pe care e deja instalata aplicatia
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "→ Aduc ultima versiune (${BRANCH})…"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "→ Instalez dependentele…"
npm install --include=dev --no-audit --no-fund

echo "→ Generez clientul Prisma si aplic schema pe baza de date…"
npm run db:generate
npm run db:push

echo "→ Construiesc aplicatia…"
npm run build

# atasamentele pot ajunge la 10 MB, iar primele versiuni ale configuratiei nginx
# limitau corpul cererii la 10M; ridicam limita, o singura data, pe fisierul nostru
for site in /etc/nginx/sites-available/*; do
  if [ -f "$site" ] && grep -q "andaxi-crm.access.log" "$site" && grep -q "client_max_body_size 10M;" "$site"; then
    echo "→ Ridic limita de upload din nginx la 25M…"
    sed -i 's/client_max_body_size 10M;/client_max_body_size 25M;/' "$site"
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
  fi
done

echo "→ Repun drepturile pe fisiere…"
chown -R www-data:www-data "$APP_DIR"

echo "→ Repornesc serviciul…"
if systemctl is-enabled --quiet andaxi-crm 2>/dev/null; then
  systemctl restart andaxi-crm
  sleep 2
  systemctl status andaxi-crm --no-pager --lines 5
else
  echo "  (serviciul andaxi-crm nu e instalat — vezi deploy/README.md)"
fi

echo "✔ Gata."
