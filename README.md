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
| **Site-uri** | Site-urile de pe CMS-ul Andaxi: pluginurile fiecăruia, licența semnată (`licenta.json`, re-semnată singură la salvare și preluată de site singur), istoricul licențelor, cheia de semnare și starea site-ului |
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

### Contractul abonamentului

Fiecare abonament ține la dosar contractul semnat (scanat) și orice alte acte:
în fereastra de editare a abonamentului, secțiunea *Contract și acte* — PDF,
Word, Excel, text sau imagini, maximum 10 MB fiecare. Pe cardul abonamentului
apare o agrafă cu numărul de acte. Fișierele stau în `data/uploads/contracte`,
în afara codului, deci supraviețuiesc actualizărilor.

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

### Site-uri și licențele CMS

Site-urile făcute pe CMS-ul Andaxi ([andaxi-cms](https://github.com/SilverName99/andaxi-cms))
pornesc pluginurile (magazin, blog, cupoane…) **doar** dintr-o licență semnată:
fișierul `site/storage/licenta/licenta.json` de pe server. Licența o emite CRM-ul,
din secțiunea **Site-uri**.

**Un site** are: nume, domeniu (`biovitality.ro`), clientul din CRM (opțional),
**slug-ul din CMS** (`biovitality` — același cu `--site=` de la deploy și cu
`LICENTA_SITE` din `.env`-ul site-ului; licența e legată de el și nu se mai poate
schimba după prima licență) și notițe. Click pe un site → **Pluginuri și licență**:

- fiecare plugin din catalogul CMS-ului, cu starea lui: **Pornit**, **Se oprește**
  (nu începe nimic nou, termină ce e în curs) sau **Oprit** (dispare de pe site;
  datele nu se șterg). Pluginurile care ating bani se trec întâi pe „Se oprește”,
  cel puțin 30 de zile, apoi pe „Oprit” — pagina avertizează. Tot acolo vezi ce
  dependențe lipsesc (ex. „Cupoane” are nevoie de „Magazin online”);
- **presetări**: pachetele de abonament ale CMS-ului (Prezentare, Catalog, Magazin,
  Asociație) și listele site-urilor vechi (bioscem, biovitality, vertij,
  grafoanaytis). O presetare înlocuiește toată lista; apoi ajustezi și salvezi;
- **Salvează** → dacă lista diferă de cea din ultima licență, CRM-ul **semnează singur**
  licența următoare (versiunea +1) și o ține ca licența curentă a site-ului; un site cu
  preluarea automată o ia în cel mult 5 minute (mai jos, „Preluarea automată a
  licenței”). Aceeași listă (sau doar numele, domeniul, notițele) nu face o licență nouă;
  nici fără perechea de chei (atunci se salvează doar lista, ca înainte);
- **Generează licența** → semnează de mână lista salvată (de exemplu după o rotație a
  cheii, sau cu o versiune aleasă) și oferă **Descarcă licenta.json**; versiunea crește
  mereu (site-ul refuză o versiune mai mică decât ultima primită);
- **Licențe emise**: cine, când, ce versiune și ce pluginuri; fiecare se poate
  descărca din nou. Istoricul nu se șterge: un site cu licențe emise **nu se poate
  șterge** (refuzat și de baza de date, `onDelete: Restrict`); doar unul fără
  nicio licență.

Pe listă, fiecare site cu domeniu are și **starea** (pingul `GET /_andaxi/ping`
al CMS-ului, la deschiderea paginii și la 5 minute): *merge*, *în mentenanță*,
*nu răspunde* sau *fără ping (cod vechi)* — site-ul încă n-a trecut pe CMS.
Pingul pleacă doar spre internetul public: domeniul se rezolvă o dată, iar dacă
duce la o adresă locală (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, 100.64/10,
`::1`, `fc00::/7`, `fe80::/10`…) cererea nu pleacă deloc; conexiunea se face exact
la adresa verificată, redirecționările nu se urmează (un domeniu care
redirecționează apare ca „nu răspunde”, cu motivul; pune în CRM domeniul final),
iar răspunsul se citește cel mult 4 KB.

Formatul licenței (exact cel din `andaxi-cms/src/Support/Licenta.php`):

```json
{
    "site": "biovitality",
    "emisa_la": "2026-11-05T21:00:00Z",
    "versiune": 1,
    "pluginuri": {"catalog": "pornit", "magazin": "pornit", "campanii": "pornit"},
    "semnatura": "<Ed25519, base64>"
}
```

Doar pluginurile care nu sunt oprite intră în `pluginuri`. CMS-ul nu are câmp de
domeniu sau de expirare: licența e valabilă până vine alta, pentru site-ul cu
slug-ul din `site`. Semnătura e Ed25519 peste `"andaxi-licenta-v1\n"` + JSON-ul
canonic (chei sortate, fără spații) al câmpurilor fără `semnatura`.

#### Cheia de semnare

O singură dată, în **Site-uri → Generează perechea de chei**. CRM-ul face pe server
o pereche Ed25519:

- **cheia privată** stă în `data/licenta/cheie-privata.pem` (lângă baza de date, în
  afara git-ului; altă cale cu `LICENTA_CHEIE_PRIVATA` în `server/.env`), cu drepturi
  `0600`. Nu apare niciodată în pagină, nu se poate descărca, nu se scrie în jurnal;
- **cheia publică** se vede în pagină, cu buton de copiere. E valoarea pentru
  `deploy/adopta.sh --cheie-licenta=…` și pentru `LICENTA_CHEIE_PUBLICA` din `.env`-ul
  fiecărui site.

O a doua pereche nu se face din greșeală: butonul dispare, iar **rotația** cere să
scrii `ROTESC CHEIA`. Rotația se face o singură dată chiar dacă butonul e apăsat de
două ori sau din două ferestre: serverul rotește doar dacă cheia de acum e cea
afișată în pagină, sub un lacăt, iar cheia nouă se scrie întâi complet și abia apoi
ia locul celei vechi. Cheia veche rămâne pe server ca `cheie-privata.<data>.pem.veche`,
iar cheia publică veche se vede în pagină. După o rotație, pe fiecare site se pune
cheia publică nouă (pe durata schimbării ambele, separate prin virgulă:
`LICENTA_CHEIE_PUBLICA=<nouă>,<veche>`) și se emite o licență nouă.

**Copia de siguranță a cheii private (obligatoriu, o dată, imediat după generare).**
Backup-ul zilnic al bazei de date **nu** o conține. De pe calculatorul tău:

```bash
scp root@187.127.92.54:/var/www/andaxi-crm/data/licenta/cheie-privata.pem ./andaxi-cheie-licente.pem
```

Pune fișierul într-un manager de parole (ca atașament) sau pe un stick criptat ținut
deoparte, apoi șterge copia de pe calculator. Niciodată în git, pe email sau în chat.
**Dacă se pierde**: se generează o pereche nouă și se pune cheia publică nouă pe
*fiecare* site, cu o licență nouă pentru fiecare (site-urile merg mai departe între
timp cu ultima licență bună, dar nu mai pot primi alta).

Punerea la loc (server nou sau cheie pierdută de pe server):

```bash
scp ./andaxi-cheie-licente.pem root@187.127.92.54:/var/www/andaxi-crm/data/licenta/cheie-privata.pem
ssh root@187.127.92.54 'U=$(systemctl show -p User --value andaxi-crm); chown "${U:-www-data}:" /var/www/andaxi-crm/data/licenta/cheie-privata.pem && chmod 600 /var/www/andaxi-crm/data/licenta/cheie-privata.pem && systemctl restart andaxi-crm'
```

#### Cum pui licența pe site (Hostinger)

`licenta.json` nu e secret (e doar semnat). Fișierul merge în
`~/domains/<domeniu>/site/storage/licenta/licenta.json`. Cu `scp`, de pe calculator
(portul și utilizatorul SSH sunt în hPanel → SSH Access):

```bash
ssh -p 65002 uXXXXXXXXX@<IP> 'mkdir -p ~/domains/biovitality.ro/site/storage/licenta'
scp -P 65002 licenta.json uXXXXXXXXX@<IP>:~/domains/biovitality.ro/site/storage/licenta/licenta.json
```

Sau direct în terminalul serverului: deschizi `licenta.json` descărcat într-un editor
de text, copiezi tot și lipești între cele două rânduri:

```bash
mkdir -p ~/domains/biovitality.ro/site/storage/licenta
cat > ~/domains/biovitality.ro/site/storage/licenta/licenta.json <<'EOF'
…conținutul fișierului licenta.json…
EOF
```

La adoptare, `deploy/adopta.sh` al CMS-ului verifică singur că licența există și se
verifică cu cheia dată la `--cheie-licenta=`. Pe un site deja adoptat, licența nouă
se pune la fel (peste cea veche); verificarea:
`$PHP ~/platforma/bin/platforma --site=<domeniu> scripts/diagnostic.php --licenta`.
Cu preluarea automată (mai jos) nu mai urci nimic: doar prima licență, la adoptare.

#### Preluarea automată a licenței

Site-ul își ia singur licența curentă: cronul CMS-ului `scripts/licenta-sincronizare.php`
(la 5 minute) și butonul **Verifică acum** din adminul site-ului (Abonamentul tău) cer

```
GET https://crm.andaxi.ro/api/site/licenta
Authorization: Bearer <cheia site-ului>
```

și primesc licența cu versiunea cea mai mare a site-ului, exact fișierul semnat. Site-ul o
pune doar dacă semnătura se verifică cu cheia publică pe care o are deja, e pentru el și nu
e mai veche decât cea de acum (detaliile: `docs/PLUGINURI.md` al CMS-ului, „Preluarea
automată”). Deci un plugin bifat (sau oprit) și salvat aici ajunge pe site în cel mult 5
minute, fără niciun fișier.

**Cheia site-ului** (o dată pe site): Site-uri → site-ul → **Preluare automată** →
**Generează cheia site-ului**. Se arată **o singură dată** (`LICENTA_CHEIE=<id>.<43 de
caractere>`); o copiezi direct în `.env`-ul site-ului de pe server, nu pe chat sau pe email. În
baza CRM-ului rămâne doar SHA-256 al ei. **Cheie nouă** o înlocuiește pe cea veche pe loc
(site-ul nu mai preia nimic până nu primește noua cheie în `.env`; licența pe care o are
rămâne). Cheia nu e ancora de încredere: cine o fură poate doar citi licența acelui site
(care nici nu e secretă); o licență falsă tot nu trece de semnătură.

Pe site, în `~/domains/<domeniu>/site/.env`:

```
LICENTA_URL=https://crm.andaxi.ro/api/site/licenta
LICENTA_CHEIE=<cheia din CRM>
```

și cronul (hPanel → Advanced → Cron Jobs, la 5 minute):

```
/opt/alt/php83/usr/bin/php -d extension=sodium.so /home/uXXXXXXXXX/platforma/bin/platforma --site=/home/uXXXXXXXXX/domains/<domeniu>/site scripts/licenta-sincronizare.php
```

**Ce vezi:** la site, în CRM, „Ultima preluare de site: <ora>, versiunea <n>” (și pe lista
site-urilor); dacă licența curentă e mai nouă decât cea preluată, scrie că site-ul o ia la
următoarea preluare. În adminul site-ului, la Abonamentul tău, „Ultima verificare: … La zi
(versiunea <n>)” sau motivul pentru care n-a mers (site-ul merge mai departe cu licența de
până atunci).

**Apărări la endpoint:** doar HTTPS (antetul `X-Forwarded-Proto` pus de nginx; altfel 403),
cel mult 30 de cereri în 10 minute de pe un IP și 10 chei greșite în 15 minute (apoi 429, cu
`Retry-After`), comparația cheii în timp constant (și pentru un site care nu există), cheia
niciodată în jurnal. Fiecare preluare (și fiecare refuz) are un rând în jurnalul serviciului:

```bash
journalctl -u andaxi-crm | grep '\[licente\] preluare'
```

#### Catalogul pluginurilor

Lista pluginurilor, a pachetelor și a listelor site-urilor vechi e o copie a
`config/plugins.php` din andaxi-cms, în `server/catalog/cms-pluginuri.json` (cu
commit-ul CMS-ului din care vine, afișat în pagină). Când CMS-ul primește un plugin
nou, se reface (cu PHP, dintr-o clonă a CMS-ului) și se face commit:

```bash
php server/scripts/catalog-cms.php ../andaxi-cms > server/catalog/cms-pluginuri.json
```

#### Testul de interoperabilitate

`server/src/lib/licenta.test.ts` (rulează cu `npm test`, alături de testele cheii,
pingului și istoricului: `licenta-chei.test.ts`, `ping-site.test.ts`,
`site-istoric.test.ts`, și ale preluării automate: `site-api.test.ts`, cu rutele adevărate
pe o bază SQLite temporară — re-semnarea la salvare și versiunea care doar crește, două
salvări deodată, cheia site-ului arătată o dată și păstrată doar ca hash, 401 pentru o
cheie lipsă sau greșită, licența curentă octet cu octet, ultima preluare, rotația, limita
de cereri, nicio cheie în jurnal) verifică vectorul de test din
`docs/PLUGINURI.md` al CMS-ului (cheie, mesaj semnat, semnătură) și trece licențele
semnate de CRM prin **codul PHP al CMS-ului** (`Licenta::verifica`, prin
`server/scripts/licenta-cms.php`): o licență bună trebuie acceptată cu exact
aceleași date, una modificată, pentru alt site sau cu altă cheie respinsă, iar
`Licenta::semneaza` din CMS și CRM-ul trebuie să scrie același fișier, octet cu
octet. Are nevoie de PHP cu sodium și de o clonă andaxi-cms lângă acest repo (sau
în `ANDAXI_CMS_DIR`); fără ele partea PHP se sare la `npm test`, dar pică la:

```bash
npm run test:licenta-cms                                 # clona în ../andaxi-cms
ANDAXI_CMS_DIR=/cale/andaxi-cms npm run test:licenta-cms
```

Rulează-l după orice schimbare în `server/src/lib/licenta.ts` sau în `Licenta.php`.

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
npm test            # teste pentru tarife, scadențe și licențele CMS
npm run test:licenta-cms   # licențele trecute prin codul PHP al CMS-ului (vezi „Site-uri și licențele CMS”)
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
  src/lib/licenta.ts      # formatul și semnarea licențelor CMS
  src/lib/licenta-chei.ts # cheia de semnare (fișierul 0600 din data/licenta)
  src/routes/             # clienți, abonamente, scadențar, ore, task-uri, rapoarte, site-uri
  catalog/                # copia catalogului de pluginuri al CMS-ului
  scripts/                # refacerea catalogului, puntea PHP a testului de licențe
web/
  src/pages/              # câte un fișier per secțiune
  src/components/ui.tsx   # componentele vizuale comune
deploy/                   # systemd, nginx, scripturi de instalare (vezi deploy/README.md)
data/                     # baza de date SQLite, fișierele încărcate, cheia licențelor — nu în git
```

## Punere pe server

Ghid complet: [`deploy/README.md`](deploy/README.md).

## Legătura cu ERP-ul

Deocamdată legătura e manuală: în scadențar și la ore treci numărul facturii
emise în ERP. Structura e pregătită pentru o integrare ulterioară — fiecare
poziție are câmpul `invoiceRef`, iar sumele sunt stocate în EUR cu cursul
separat, exact ca în ERP.
