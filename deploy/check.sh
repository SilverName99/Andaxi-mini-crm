#!/usr/bin/env bash
# Verificare "ce e pe server" — NU modifica nimic, doar afiseaza.
# Rulare:  bash <(curl -fsSL https://raw.githubusercontent.com/SilverName99/Andaxi-mini-crm/main/deploy/check.sh)

echo "═══════════════════════════════════════════"
echo " Andaxi mini-CRM · verificare server"
echo "═══════════════════════════════════════════"
echo

# pe unele sisteme ss/nginx sunt doar in /usr/sbin, care nu e mereu in PATH
export PATH="$PATH:/usr/sbin:/sbin"
SS="$(command -v ss || true)"

echo "▸ Sistem:      $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -a)"
echo "▸ Memorie:     $(free -h 2>/dev/null | awk '/^Mem:/{print $3" folositi din "$2}')"
echo "▸ Disc:        $(df -h / | awk 'NR==2{print $3" folositi din "$2" ("$5")"}')"
echo

echo "▸ Node.js:     $(command -v node >/dev/null && node -v || echo 'NU e instalat')"
echo "▸ npm:         $(command -v npm  >/dev/null && npm -v  || echo 'NU e instalat')"
echo "▸ git:         $(command -v git  >/dev/null && git --version | awk '{print $3}' || echo 'NU e instalat')"
echo "▸ nginx:       $(command -v nginx>/dev/null && nginx -v 2>&1 | awk '{print $3}' || echo 'NU e instalat')"
echo "▸ apache:      $(command -v apache2>/dev/null && echo 'instalat (atentie, poate ocupa portul 80)' || echo 'nu')"
echo "▸ docker:      $(command -v docker>/dev/null && docker --version | awk '{print $3}' | tr -d ',' || echo 'nu')"
echo "▸ certbot:     $(command -v certbot>/dev/null && echo instalat || echo 'NU e instalat')"
echo

echo "▸ Servicii care asculta (port → program):"
if [ -n "$SS" ]; then
  "$SS" -lptnH 2>/dev/null | awk '{
    split($4, a, ":"); port = a[length(a)];
    prog = "?"; if (match($0, /users:\(\("[^"]+/)) { prog = substr($0, RSTART+9, RLENGTH-9); }
    key = port " " prog; if (!seen[key]++) printf "   %-8s %s\n", port, prog;
  }' | sort -n
else
  netstat -lptn 2>/dev/null | sed 's/^/   /' || echo "   (nici ss, nici netstat nu sunt disponibile)"
fi
echo

# verificare de port care nu depinde de ss/netstat
port_ocupat() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0 || return 1; }

for p in 80 443 4000; do
  if port_ocupat "$p"; then
    echo "▸ Portul $p:   OCUPAT"
  else
    echo "▸ Portul $p:   liber"
  fi
done
echo

if command -v docker >/dev/null 2>&1; then
  echo "▸ Containere Docker care ruleaza:"
  docker ps --format '   {{.Names}} → {{.Ports}}' 2>/dev/null || echo "   (nu pot citi)"
  echo
fi

echo "▸ Site-uri nginx active:"
ls /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/   /' || echo "   (nginx nu e instalat)"
echo

echo "▸ mini-CRM instalat deja: $([ -d /var/www/andaxi-crm ] && echo DA || echo nu)"
echo
echo "Gata. Trimite tot ce e mai sus."
