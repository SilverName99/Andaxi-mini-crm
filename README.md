# Andaxi mini-CRM

CRM-ul intern pentru [andaxi.ro](https://andaxi.ro): clienți, abonamente recurente
de găzduire/mentenanță și ore de intervenție — într-un singur loc, cu un cont.

**Nu emite facturi.** Facturarea rămâne în [ANDAXI-ERP](https://github.com/SilverName99/ANDAXI-ERP);
aici ții evidența a *ce* trebuie facturat, *când*, și marchezi ce ai emis deja
(cu numărul facturii din ERP ca referință).

## Ce face

| Secțiune | La ce folosește |
|---|---|
| **Panou de control** | Venit recurent lunar, ce ai de facturat, ore nefacturate, restanțe, evoluție pe 6 luni |
| **Clienți** | Fișă completă (date firmă, contact, notițe) + tot istoricul pe client |
| **Abonamente** | Găzduire / mentenanță pentru landing page, site prezentare, magazin online, CRM, ERP — facturate lunar, la 6 luni sau anual |
| **Scadențar** | Pozițiile de facturat, generate automat din abonamente; marchezi „facturat" / „încasat" și treci numărul facturii din ERP |
| **Calendar** | Lună întreagă cu scadențe, intervenții și task-uri la un loc; click pe o zi pentru detalii |
| **Fișă lunară** | Ce s-a lucrat într-o lună la un client, cu orele acoperite din abonament și totalul de facturat; se printează sau se salvează ca PDF |
| **Ore & intervenții** | Suport tehnic la oră, cu tarif calculat automat pe interval; click pe o intervenție deschide detaliile, cu fișiere atașate (PDF, Word) |
| **Calendar de client** | O lună pe zile pentru un singur client: click pe o zi și notezi câte ore ai lucrat și ce ai făcut; tot acolo atașezi documentul lunii |
| **Task-uri** | Lucruri de făcut, cu sau fără client asociat |
| **Rapoarte** | Totaluri pe client și pe lună, cu TVA calculat și export CSV |
| **Setări** | Sigla firmei, tarife orare, pachete de ore preplătite, prețuri pe utilizator (ERP/CRM), program de lucru, curs EUR/RON, cotă TVA, date firmă, schimbare parolă |

### Tarifele orare

Tariful se calculează automat din intervalul orar, iar un interval care iese din
programul normal se **împarte** între cele două tarife:

- `09:00–16:00` → **45 €/h** (interval configurabil în Setări)
- în afara acestui interval → **90 €/h**
- exemplu: `15:00–18:00` = 1h × 45 € + 2h × 90 € = **225 €**
- intervalele peste miezul nopții (`22:00–02:00`) sunt gestionate corect
- opțional: weekendul integral la tarif majorat
- se poate impune și o sumă fixă manual, când ai negociat altfel

Tarifele aplicate se salvează pe fiecare înregistrare, deci modificarea lor în
Setări **nu** rescrie istoricul.

### Prețurile pe utilizator (ERP și CRM)

Pentru abonamentele de tip ERP sau CRM, în loc de sumă se introduce **numărul de
utilizatori**, iar prețul se calculează din grila configurată în Setări: trei
praguri (implicit 1-5 → 50 €, 6-10 → 45 €, 11+ → 40 € / utilizator / lună) și
reduceri pe ciclu (5% la 6 luni, 10% anual). Calculul se face pe server, nu în
interfață. Rămâne disponibilă opțiunea „preț negociat manual".

### Scadențarul

Pentru fiecare abonament activ se generează automat câte o poziție per perioadă,
de la prima scadență până la 60 de zile în viitor. Generarea e idempotentă (nu
apar dublări), iar pozițiile deja marcate ca facturate nu se modifică.
Sumele sunt în EUR, cu echivalentul în RON afișat la cursul din Setări.

### Cum se notează orele

Două feluri, amândouă acceptate:

- **interval orar** (`14:00–17:00`) — împărțirea între tariful normal și cel
  majorat se face automat, după programul din Setări;
- **doar durata** (`3 h`) cu tariful ales explicit — așa se notează lucrările de
  dezvoltare, unde ora exactă nu contează. E modul folosit în calendarul de
  client.

### Orele incluse în abonament

Un abonament de mentenanță poate include un număr de ore pe lună. Ele se
consumă automat din intervențiile lunii, în ordine cronologică, iar o oră
lucrată în afara programului consumă **dublu** (costă dublu, deci consumă
dublu). Ce depășește orele incluse se facturează la tarifele obișnuite.

Consecință: valoarea de facturat a unei intervenții nu mai e o proprietate a ei,
ci depinde de ce s-a consumat înaintea ei în lună. De aceea intervenția
păstrează valoarea brută, iar alocarea se calculează pe lună — la fel în fișa
lunară, în rapoarte și pe panoul de control.

Orele incluse **nu se reportează** în luna următoare (fiecare lună începe cu
pachetul întreg).

### Pachetele de ore preplătite

Un client poate cumpăra lunar un pachet de ore, la tarif redus (se definesc în
Setări). Pachetul se atribuie ca abonament, deci se facturează automat lunar,
indiferent de consum, iar tarifele lui le înlocuiesc pe cele globale pentru
intervențiile clientului.

Orele lucrate se scad întâi din cele incluse în mentenanță, apoi din soldul
pachetului; ce depășește se facturează la tarifele pachetului. Spre deosebire de
orele incluse, **soldul pachetului se reportează** în lunile următoare, iar fișa
lunară arată extrasul: sold la început, primite, consumate, sold rămas.

### Import de ore din fișier

Pentru lunile completate în urmă, orele se pot importa dintr-un CSV în loc să
fie introduse zi cu zi. Șablonul se descarcă din calendarul clientului și are
coloanele `Data · Ore · Descriere · Etichetă · Categorie · Tarif` (opțional `De la`
și `Până la`, dacă vrei interval orar în locul duratei).

Fișierul acceptă separator `;` sau `,`, virgulă zecimală, diacritice și date în
format `zz.ll.aaaa` sau `aaaa-ll-zz`. Înainte de import se afișează exact ce
urmează să fie creat, cu erorile pe fiecare linie — liniile cu probleme sunt
sărite, restul se importă.

Tot acolo se alege ce se întâmplă cu orele care există deja în zilele din fișier:

- **Adaugă peste** — se păstrează tot ce era; la un reimport orele se dublează;
- **Înlocuiește** — se șterg întâi intervențiile din zilele acoperite de fișier,
  apoi se importă cele noi. Restul lunii rămâne neatins, iar orele deja
  **facturate sau încasate nu se șterg niciodată** — ar rupe istoricul de
  facturare.

### Documentele lunii

Pe lângă fișierele atașate unei intervenții, fiecare lună de lucru la un client
poate avea propriile documente (raportul cu toate modificările, trimis odată cu
factura). Se încarcă din fișa lunară sau din calendarul clientului.

### TVA

Toate prețurile din platformă (abonamente, tarife orare) sunt **fără TVA**.
Cota se configurează în Setări (implicit 21%) și se aplică doar în rapoarte,
unde apar alături totalul fără TVA, TVA-ul și totalul cu TVA — inclusiv în
exportul CSV.

## Stack

- **Backend:** Node 20 + Express + Prisma (SQLite, portabil pe PostgreSQL) + JWT în cookie httpOnly
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + TanStack Query + Recharts
- În producție API-ul servește și interfața → **un singur port** de expus prin nginx.

## Dezvoltare locală

```bash
npm install
cp server/.env.example server/.env      # completează JWT_SECRET și SEED_PASSWORD
npm run db:generate && npm run db:push
npm run db:seed                         # creează contul; SEED_DEMO=true adaugă date de test

npm run dev:server                      # API pe http://localhost:4000
npm run dev:web                         # interfața pe http://localhost:5173
```

Alte comenzi utile:

```bash
npm run typecheck   # TypeScript pe server + web
npm test            # teste pentru calculul tarifelor și al scadențelor
npm run build       # build de producție (server + web)
```

## Structura

```
server/
  prisma/schema.prisma    # modelul de date
  prisma/seed.ts          # contul inițial (+ date demo opționale)
  src/lib/rates.ts        # împărțirea orelor pe tarife
  src/lib/cycles.ts       # lunar / la 6 luni / anual
  src/lib/billing-sync.ts # generarea pozițiilor de facturat
  src/routes/             # clienți, abonamente, scadențar, ore, task-uri, rapoarte
web/
  src/pages/              # câte un fișier per secțiune
  src/components/ui.tsx   # componentele vizuale comune
deploy/                   # systemd, nginx, scripturi de instalare (vezi deploy/README.md)
data/                     # baza de date SQLite și fișierele încărcate (sigla) — nu în git
```

## Punere pe server

Ghid complet: [`deploy/README.md`](deploy/README.md).

## Legătura cu ERP-ul

Deocamdată legătura e manuală: în scadențar și la ore treci numărul facturii
emise în ERP. Structura e pregătită pentru o integrare ulterioară — fiecare
poziție are câmpul `invoiceRef`, iar sumele sunt stocate în EUR cu cursul
separat, exact ca în ERP.
