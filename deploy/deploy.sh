#!/usr/bin/env bash
# Deploy / actualizare mini-CRM Andaxi pe server.
# Ruleaza din folderul aplicatiei:  sudo -u www-data bash deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/andaxi-crm}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "→ Aduc ultima versiune (${BRANCH})…"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "→ Instalez dependentele…"
npm install

echo "→ Generez clientul Prisma si aplic schema pe baza de date…"
npm run db:generate
npm run db:push

echo "→ Construiesc aplicatia…"
npm run build

echo "→ Repornesc serviciul…"
if systemctl is-enabled --quiet andaxi-crm 2>/dev/null; then
  sudo systemctl restart andaxi-crm
  sleep 2
  sudo systemctl status andaxi-crm --no-pager --lines 5
else
  echo "  (serviciul andaxi-crm nu e instalat — vezi deploy/README.md)"
fi

echo "✔ Gata."
