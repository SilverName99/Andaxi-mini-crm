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
