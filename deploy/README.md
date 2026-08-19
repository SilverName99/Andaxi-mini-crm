# Instalare pe server (Hostinger KVM, Ubuntu)

Ghid pas cu pas pentru a pune mini-CRM-ul pe VPS, **fără să afecteze aplicațiile
care rulează deja acolo**. Aplicația ascultă pe un port local (implicit `4000`)
și e publicată prin nginx pe un subdomeniu propriu.

## 0. Ce trebuie pregătit înainte

- un subdomeniu (ex. `crm.andaxi.ro`) cu înregistrare **A** către IP-ul serverului;
- Node.js 20+ și npm pe server;
- nginx (probabil deja instalat pentru cealaltă aplicație);
- un port local liber (verifică cu `sudo ss -lptn` — dacă `4000` e ocupat, alege altul și schimbă-l în `.env` și în `nginx-crm.conf`).

## 1. Node.js 20 (dacă lipsește)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # trebuie să fie v20 sau mai nou
```

## 2. Clonarea aplicației

```bash
sudo mkdir -p /var/www/andaxi-crm
sudo chown -R $USER:$USER /var/www/andaxi-crm
git clone https://github.com/SilverName99/Andaxi-mini-crm.git /var/www/andaxi-crm
cd /var/www/andaxi-crm
```

## 3. Configurarea

```bash
cp server/.env.example server/.env
nano server/.env
```

Completează:

```ini
# cale absolută, ca baza de date să nu fie ștearsă la actualizări
DATABASE_URL="file:/var/www/andaxi-crm/data/crm.db"

# generează-l cu: openssl rand -hex 32
JWT_SECRET="…"

PORT=4000
CORS_ORIGINS="https://crm.andaxi.ro"

SEED_EMAIL="alexandru.serac99@gmail.com"
SEED_PASSWORD="parola-ta-initiala"
SEED_NAME="Alexandru"
SEED_DEMO="false"
```

```bash
mkdir -p /var/www/andaxi-crm/data
npm run setup     # install + prisma generate + db push + creare cont
npm run build
```

> `npm run setup` creează contul cu datele din `SEED_EMAIL` / `SEED_PASSWORD`.
> După prima autentificare, schimbă parola din **Setări → Cont** și șterge
> `SEED_PASSWORD` din `.env`.

## 4. Serviciul systemd

```bash
sudo chown -R www-data:www-data /var/www/andaxi-crm
sudo cp deploy/andaxi-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now andaxi-crm
sudo systemctl status andaxi-crm --no-pager
```

Verificare rapidă: `curl http://127.0.0.1:4000/api/health` → `{"ok":true,…}`.

## 5. nginx + HTTPS

```bash
sudo cp deploy/nginx-crm.conf /etc/nginx/sites-available/crm.andaxi.ro
sudo ln -s /etc/nginx/sites-available/crm.andaxi.ro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.andaxi.ro
```

Certbot adaugă singur blocul HTTPS și redirecționarea de pe HTTP.

## 6. Actualizări ulterioare

```bash
cd /var/www/andaxi-crm
bash deploy/deploy.sh
```

## 7. Backup

Toată baza de date e un singur fișier:

```bash
# backup zilnic la 3 dimineața, păstrat 30 de zile
sudo crontab -e
0 3 * * * sqlite3 /var/www/andaxi-crm/data/crm.db ".backup '/var/backups/crm-$(date +\%F).db'" && find /var/backups -name 'crm-*.db' -mtime +30 -delete
```

## Depanare

| Simptom | Cauză probabilă | Rezolvare |
|---|---|---|
| `502 Bad Gateway` | serviciul nu rulează | `sudo systemctl status andaxi-crm`, `sudo journalctl -u andaxi-crm -n 50` |
| Portul e ocupat | altă aplicație pe `4000` | schimbă `PORT` în `.env` și `proxy_pass` în configul nginx |
| Login-ul nu ține sesiunea | site-ul e pe HTTP | cookie-ul e `secure` în producție — instalează certificatul cu certbot |
| `JWT_SECRET lipsește` la pornire | `.env` incomplet | completează `JWT_SECRET` și repornește serviciul |
