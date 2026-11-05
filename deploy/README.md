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

### 7. Domeniu separat pentru portalul clienților (opțional)

Portalul merge oricum pe `https://crm.andaxi.ro/portal`. Dacă vrei o adresă
mai potrivită de trimis clienților — `https://client.andaxi.ro` — sunt trei pași.

**a) DNS**, în Cloudflare → DNS → Records → Add record:

| Câmp | Valoare |
|---|---|
| Type | `A` |
| Name | `client` |
| IPv4 address | `187.127.92.54` |
| Proxy status | **DNS only** (norișor gri, până iese certificatul) |

**b) Pe server**, o singură comandă (detectează singură portul aplicației,
scrie configurarea nginx, o testează înainte de reload și pune HTTPS):

```bash
DOMAIN=client.andaxi.ro ADMIN_EMAIL=contact@andaxi.ro \
bash /var/www/andaxi-crm/deploy/portal-domain.sh
```

**c) În CRM**: Setări → **Adresa portalului** → `https://client.andaxi.ro` →
Salvează. De atunci, linkurile copiate din fișa fiecărui client pleacă de pe
domeniul nou. Linkurile vechi, de pe `crm.andaxi.ro`, rămân valabile.

Pe domeniul nou se vede **doar portalul**: adresa scurtă duce direct în el, iar
rutele de administrare (`/api/clients`, `/api/settings`, pagina de login)
returnează 404 — sunt tăiate din nginx, nu doar ascunse.

### 8. Utilizator propriu pentru serviciu (opțional, recomandat)

Serviciul rulează implicit ca `www-data`, același utilizator cu care pot rula și
alte aplicații de pe server (nginx, PHP). Ca baza de date și cheia licențelor CMS
(`data/licenta/`) să le poată citi doar CRM-ul, mută-l pe utilizatorul lui,
`andaxi-crm`. Nu e obligatoriu și **nu se face singur la deploy**: îl rulezi tu, o
dată, ca root, când ai cinci minute (serviciul stă oprit câteva secunde):

```bash
bash /var/www/andaxi-crm/deploy/utilizator-propriu.sh
```

Scriptul:

1. creează utilizatorul de sistem `andaxi-crm` (fără login, fără home);
2. pune în systemd `/etc/systemd/system/andaxi-crm.service.d/utilizator.conf` cu
   `User=andaxi-crm` și `Group=andaxi-crm` (fișierul din repo rămâne neatins);
3. dă folderul aplicației lui `andaxi-crm` (`chown -R`), cu `data/` la `0700`,
   `data/licenta/` la `0700`, cheia la `0600` și `server/.env` la `0600`;
4. repornește serviciul și arată ca cine rulează.

Cheia și calea ei nu se schimbă. `deploy/deploy.sh` citește apoi utilizatorul din
systemd (`systemctl show -p User andaxi-crm`) și dă fișierele lui la fiecare
actualizare; fără scriptul de mai sus rămâne `www-data`, ca până acum.

De mână, aceiași pași:

```bash
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin andaxi-crm
systemctl stop andaxi-crm
mkdir -p /etc/systemd/system/andaxi-crm.service.d
printf '[Service]\nUser=andaxi-crm\nGroup=andaxi-crm\n' > /etc/systemd/system/andaxi-crm.service.d/utilizator.conf
systemctl daemon-reload
chown -R andaxi-crm:andaxi-crm /var/www/andaxi-crm
chmod 700 /var/www/andaxi-crm/data /var/www/andaxi-crm/data/licenta
chmod 600 /var/www/andaxi-crm/data/licenta/* /var/www/andaxi-crm/server/.env
systemctl start andaxi-crm
```

Înapoi la `www-data`: `bash /var/www/andaxi-crm/deploy/utilizator-propriu.sh --inapoi`.
La restaurarea cheii (README, „Cheia de semnare”) folosește utilizatorul din
`systemctl show -p User --value andaxi-crm` în loc de `www-data`.

### 9. Backup

**Cheia de semnare a licențelor CMS** (`data/licenta/cheie-privata.pem`, după ce o
generezi din Site-uri) **nu** intră în backup-ul de mai jos și nici în git: copiaz-o
o dată, offline — pașii în [README](../README.md), „Cheia de semnare”.

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
