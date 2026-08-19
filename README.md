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
| **Ore & intervenții** | Suport tehnic la oră, cu tarif calculat automat pe interval |
| **Task-uri** | Lucruri de făcut, cu sau fără client asociat |
| **Rapoarte** | Totaluri pe client și pe lună, cu TVA calculat și export CSV |
| **Setări** | Sigla firmei, tarife orare, prețuri pe utilizator (ERP/CRM), program de lucru, curs EUR/RON, cotă TVA, date firmă, schimbare parolă |

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
