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

### Orele plătite prin abonament

Fiecare abonament poate avea un număr de **ore plătite** (câmpul *Ore plătite
prin abonament*, în formularul de abonament). E un **rezervor consumat o
singură dată**: nu se reîncarcă lunar, iar orele neconsumate rămân acolo până
le folosești.

Legătura se face prin câmpul *Lucrare / proiect*: când notezi ore și alegi din
dropdown abonamentul respectiv, minutele scad direct din rezervorul lui — iar
**o oră în afara programului scade dublu**, ca peste tot în platformă. Ce
depășește rezervorul se facturează normal, la 45/90 €/h.

Soldul se vede în trei locuri: pe fișa clientului, în lista de abonamente și
**în portalul clientului**, cu bară de progres („7h folosite din 10 h · 3h
rămase").

Ordinea în care se acoperă o intervenție: întâi rezervorul abonamentului ales
(cel mai specific), apoi orele incluse ale lunii, apoi pachetul preplătit, iar
ce rămâne se facturează.

### Pachetele de ore preplătite

Un client poate cumpăra lunar un pachet de ore, la tarif redus (se definesc în
Setări). Pachetul se atribuie ca abonament, deci se facturează automat lunar,
indiferent de consum, iar tarifele lui le înlocuiesc pe cele globale pentru
intervențiile clientului.

Orele lucrate se scad întâi din cele incluse în mentenanță, apoi din soldul
pachetului; ce depășește se facturează la tarifele pachetului. Spre deosebire de
orele incluse, **soldul pachetului se reportează** în lunile următoare, iar fișa
lunară arată extrasul: sold la început, primite, consumate, sold rămas.

### Ceasul zilei

Fiecare intervenție notată cu interval orar devine un arc colorat pe ceasul
zilei — indigo cât a picat în programul normal, fucsia pentru restul.

Cadranul e **de 12 ore, ca la orice ceas**, cu un comutator între cele două
jumătăți ale zilei: 🌙 pentru noapte și dimineață (00:00–12:00), ☀️ pentru zi
și seară (12:00–24:00). Ceasul se deschide pe jumătatea în care s-a lucrat mai
mult, iar un punct pe cealaltă iconiță arată că mai e ceva de văzut și acolo. Previzualizarea din colțul fiecărei zile din calendar
rămâne pe 24 de ore, ca să încapă toată ziua într-o singură privire.

În calendarul clientului ceasul e și de desenat: tragi cu mouse-ul sau cu
degetul peste orele lucrate (se rotunjește la sfert de oră) și intervalul se
completează singur în formular, cu suma calculată pe loc. Dacă treci de ora 12,
intervalul continuă singur în cealaltă jumătate a zilei. Câmpurile *De la* și
*Până la* rămân acolo pentru orele exacte, iar butonul *Doar durata* păstrează
vechiul mod, pentru lucrările notate fără ceas.

Culorile urmează exact regula de facturare de pe server, inclusiv weekendul
integral majorat, dacă e activat în Setări.

### Fișierul explicativ al lunii (PDF)

Sub calendarul clientului e butonul **Descarcă fișier explicativ (PDF)**: un
raport de o pagină (sau mai multe, dacă luna e plină) cu antetul firmei și
sigla, **calendarul lunii cu ceasul fiecărei zile**, lista tuturor lucrărilor
(data, intervalul, descrierea, eticheta, orele, valoarea) și totalul cu
reducere și TVA. E gata de trimis clientului, alături de factura din ERP.

PDF-ul se generează pe server (pdfkit), cu fonturile din `server/assets/fonts`
— cele standard din PDF nu au diacriticele românești.

### Import de ore din fișier

Pentru lunile completate în urmă, orele se pot importa dintr-un CSV în loc să
fie introduse zi cu zi. Șablonul se descarcă din calendarul clientului și are
coloanele `Data · De la · Până la · Ore · Descriere · Etichetă · Categorie · Tarif`.

Munca se notează în două feluri, alese linie cu linie:

- **cu interval orar** (`De la` / `Până la`) — atunci împărțirea între tariful
  normal și cel majorat se face singură, după ceas, iar coloanele `Ore` și
  `Tarif` se lasă goale;
- **doar cu durata** (`Ore`) — pentru lucrările lungi, unde alegi regimul din
  coloana `Tarif` (`normal` sau `majorat`).

Orele se pot scrie cum le scrie omul sau Excel: `9`, `9:00`, `09:30`, `9.30`
sau `17:00:00`. O oră de neînțeles oprește linia respectivă cu un mesaj clar,
în loc să fie ghicită.

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

### Reducerea pe lună

Fiecare lună de lucru la un client poate avea o reducere — procent sau sumă fixă
— setată din calendarul clientului sau din fișa lunară. Se scade din orele lunii
**înainte de TVA**, iar antetul calendarului arată direct suma rămasă de
facturat. O reducere mai mare decât suma de facturat duce totalul la zero, nu la
o valoare negativă.

### Documentele lunii

Pe lângă fișierele atașate unei intervenții, fiecare lună de lucru la un client
poate avea propriile documente (raportul cu toate modificările, trimis odată cu
factura). Se încarcă din fișa lunară sau din calendarul clientului.

### Portalul clientului

Fiecare client poate primi un link prin care își vede, în timp real, orele
lucrate pe zile, ce a intrat în abonament sau în pachetul de ore, abonamentele
active și pozițiile de plată. Totul e **doar de citit**.

Se pornește din fișa clientului → tab-ul *Detalii* → *Portalul clientului*:

- linkul are forma `https://crm.andaxi.ro/portal#<token>`; partea secretă stă
  după `#`, deci nu ajunge în logurile serverului;
- opțional un **PIN de 6 cifre**, trimis clientului separat de link (telefon,
  SMS); după 5 PIN-uri greșite linkul se blochează 15 minute;
- două bife per client: *Arată sumele* (dezactivată, clientul vede doar orele)
  și *Arată și TVA-ul*;
- *Link nou* invalidează imediat linkul vechi, *Retrage accesul* îl șterge de
  tot; se vede și când a intrat clientul ultima dată.

Rutele portalului (`/api/portal/*`) sunt separate de cele de administrare și
citesc clientul **din sesiune**, niciodată din adresa cererii, iar răspunsurile
se construiesc câmp cu câmp — setările firmei și tarifele nu pleacă spre client.
Lunile neîncheiate și pozițiile viitoare sunt marcate „estimare", ca să nu fie
confundate cu facturile emise din ERP.

#### Confirmarea lunii

Din portal, clientul poate apăsa **Confirm orele** pentru o lună: confirmarea
ajunge în CRM cu data, ora, numele scris de el și cifrele de la acel moment.
Fișa lunară și calendarul clientului arată apoi una din trei stări —
*Neconfirmat de client*, *Confirmat de client pe …* sau, dacă luna s-a mai
modificat de atunci, *Confirmat …, dar s-a modificat după*. Clientul își poate
retrage confirmarea, iar CRM-ul nu poate confirma în locul lui: ruta de
administrare e doar de citit.

#### Cererile de intervenție

Clientul alege din portal unul din două feluri de cerere:

| Fel | Timp de răspuns |
|---|---|
| Intervenție normală | 24 de **ore de lucru** |
| Intervenție rapidă | 12 **ore de lucru** |

„Ore de lucru" înseamnă exact asta: ceasul merge doar în programul din Setări
(implicit 09:00–16:00), de luni până vineri. O cerere trimisă sâmbătă seara are
termenul calculat de luni dimineața. Termenul apare la client în portal și la
tine pe task, iar depășirea lui se colorează roșu.

Cererea devine **task în CRM**, marcat cu felul ei, și **deschide o discuție**
între tine și client: el scrie din portal, tu răspunzi din CRM, iar tu o poți
**închide** (clientul o vede în continuare, dar nu mai poate scrie) și
redeschide oricând. Se pot opri per client, iar volumul e limitat la 10 cereri
pe oră.

La fiecare cerere nouă și la fiecare mesaj al clientului primești **un email**;
când răspunzi tu, clientul primește un email cu linkul portalului (dacă are
adresă în fișă și SMTP-ul e configurat).

### Trimiterea emailurilor (SMTP)

În Setări → *Trimitere emailuri* pui serverul, portul, utilizatorul și parola
contului de email (la Hostinger: `smtp.hostinger.com`, portul 465 cu SSL sau
587 cu STARTTLS). Butonul **Trimite test** verifică datele pe loc, chiar
înainte să le salvezi.

Parola se ține în baza de date și **nu pleacă niciodată înapoi către
interfață**; câmpul rămâne gol, iar dacă nu scrii nimic la salvare, parola de
acum rămâne neschimbată. Fără SMTP configurat aplicația merge la fel — doar că
nu pleacă niciun email.

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
