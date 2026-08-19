# Instalare pe server (Hostinger KVM, Ubuntu)

Ghid pas cu pas pentru a pune mini-CRM-ul pe VPS, **fără să afecteze aplicațiile
care rulează deja acolo**. Aplicația ascultă pe un port local (implicit `4000`)
și e publicată prin nginx pe un subdomeniu propriu.

## Varianta rapidă: două comenzi

Deschide terminalul serverului (în hPanel: **VPS → Overview → butonul „Terminal"**;
te loghează automat ca `root`) și rulează:

**1. Verifici ce e deja pe server** (nu modifică nimic):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/SilverName99/Andaxi-mini-crm/main/deploy/check.sh)
```

**2. Instalezi** (îți cere parola pentru cont și face restul singur — instalează
Node/nginx/certbot dacă lipsesc, alege un port local liber, construiește
aplicația, o pornește ca serviciu, o publică pe domeniu, pune HTTPS și
configurează backup zilnic):

```bash
DOMAIN=crm.andaxi.ro ADMIN_EMAIL=contact@andaxi.ro \
bash <(curl -fsSL https://raw.githubusercontent.com/SilverName99/Andaxi-mini-crm/main/deploy/install.sh)
```

Scriptul **se oprește singur** dacă portul 80 e ocupat de altceva decât nginx,
ca să nu strice aplicațiile care rulează deja pe server.

> **Cât timp codul e încă pe branch-ul de dezvoltare** (nu a fost dat merge în
> `main`), înlocuiește `main` cu `claude/mini-crm-invoicing-services-txcftm` în
> cele două adrese de mai sus și adaugă `BRANCH=claude/mini-crm-invoicing-services-txcftm`
> înaintea comenzii de instalare.

### Înainte: DNS-ul (Cloudflare)

Domeniul `andaxi.ro` e pe Cloudflare, deci acolo se face legătura către VPS —
subdomeniul creat în hPanel arată spre găzduirea partajată, nu spre VPS.

În Cloudflare → **DNS → Records → Add record**:

| Câmp | Valoare |
|---|---|
| Type | `A` |
| Name | `crm` |
| IPv4 address | `187.127.92.54` |
| Proxy status | **DNS only** (norișor gri) |
| TTL | Auto |

Lasă-l pe „DNS only" până iese certificatul HTTPS — cu proxy-ul pornit, certbot
nu poate verifica domeniul. După ce site-ul merge pe `https://`, poți porni
proxy-ul (norișor portocaliu), dar atunci treci și **SSL/TLS → Overview** pe
**Full (strict)**.

---

## Instalare pas cu pas (manual)

### Ce trebuie pregătit înainte

- un subdomeniu (ex. `crm.andaxi.ro`) cu înregistrare **A** către IP-ul serverului;
- Node.js 20+ și npm pe server;
- nginx (probabil deja instalat pentru cealaltă aplicație);
- un port local liber (verifică cu `sudo ss -lptn` — dacă `4000` e ocupat, alege altul și schimbă-l în `.env` și în `nginx-crm.conf`).

### 1. Node.js 20 (dacă lipsește)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # trebuie să fie v20 sau mai nou
```

### 2. Clonarea aplicației

```bash
sudo mkdir -p /var/www/andaxi-crm
sudo chown -R $USER:$USER /var/www/andaxi-crm
git clone https://github.com/SilverName99/Andaxi-mini-crm.git /var/www/andaxi-crm
cd /var/www/andaxi-crm
```

### 3. Configurarea

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

### 4. Serviciul systemd

```bash
sudo chown -R www-data:www-data /var/www/andaxi-crm
sudo cp deploy/andaxi-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now andaxi-crm
sudo systemctl status andaxi-crm --no-pager
```

Verificare rapidă: `curl http://127.0.0.1:4000/api/health` → `{"ok":true,…}`.

### 5. nginx + HTTPS

```bash
sudo cp deploy/nginx-crm.conf /etc/nginx/sites-available/crm.andaxi.ro
sudo ln -s /etc/nginx/sites-available/crm.andaxi.ro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.andaxi.ro
```

Certbot adaugă singur blocul HTTPS și redirecționarea de pe HTTP.

### 6. Actualizări ulterioare

```bash
cd /var/www/andaxi-crm
bash deploy/deploy.sh
```

### 7. Backup

Toată baza de date e un singur fișier:

```bash
# backup zilnic la 3 dimineața, păstrat 30 de zile
sudo crontab -e
0 3 * * * sqlite3 /var/www/andaxi-crm/data/crm.db ".backup '/var/backups/crm-$(date +\%F).db'" && find /var/backups -name 'crm-*.db' -mtime +30 -delete
```

### Depanare

| Simptom | Cauză probabilă | Rezolvare |
|---|---|---|
| `502 Bad Gateway` | serviciul nu rulează | `sudo systemctl status andaxi-crm`, `sudo journalctl -u andaxi-crm -n 50` |
| Portul e ocupat | altă aplicație pe `4000` | schimbă `PORT` în `.env` și `proxy_pass` în configul nginx |
| Login-ul nu ține sesiunea | site-ul e pe HTTP | cookie-ul e `secure` în producție — instalează certificatul cu certbot |
| `JWT_SECRET lipsește` la pornire | `.env` incomplet | completează `JWT_SECRET` și repornește serviciul |
