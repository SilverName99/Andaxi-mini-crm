import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { buildMonthlySheet } from './monthly-sheet.js';
import { minutesToHhMm } from './dates.js';
import { isWeekend } from './dates.js';
import { env } from '../env.js';
import { etichete } from './etichete.js';

/** Fonturile standard din PDF nu au diacritice romanesti, deci le aducem pe ale noastre */
const FONTURI = fileURLToPath(new URL('../../assets/fonts', import.meta.url));
const NORMAL = path.join(FONTURI, 'LiberationSans-Regular.ttf');
const BOLD = path.join(FONTURI, 'LiberationSans-Bold.ttf');

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];
const ZILE = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

const INDIGO = '#4f46e5';
const FUCSIA = '#c026d3';
const VERDE = '#10b981';
const ROSU = '#e11d48';
const GRI = '#64748b';
const GRI_DESCHIS = '#e2e8f0';
const TEXT = '#0f172a';

function numeLuna(month: string): string {
  const [an, luna] = month.split('-').map(Number);
  return `${LUNI[luna - 1]} ${an}`;
}

function ziDinIso(iso: string): number {
  return Number(iso.slice(8));
}

/** Ziua saptamanii, luni = 0 */
function ziSaptamana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function formatOre(minute: number, gol = '—'): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  if (!minute) return gol;
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function suma(valoare: number, moneda: 'RON' | 'EUR'): string {
  return `${valoare.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}

/** In lei suma principala, in euro cea de referinta */
function inLei(valoareEur: number, curs: number): string {
  return suma(valoareEur * curs, 'RON');
}

/** Toate zilele lunii, plus zilele goale de la inceput pana la prima zi de luni */
function grilaLunii(month: string): (string | null)[] {
  const [an, luna] = month.split('-').map(Number);
  const zileInLuna = new Date(Date.UTC(an, luna, 0)).getUTCDate();
  const prima = `${month}-01`;
  const grila: (string | null)[] = Array.from({ length: ziSaptamana(prima) }, () => null);
  for (let zi = 1; zi <= zileInLuna; zi += 1) {
    grila.push(`${month}-${String(zi).padStart(2, '0')}`);
  }
  while (grila.length % 7 !== 0) grila.push(null);
  return grila;
}

interface Interval {
  start: number;
  end: number;
}

/** O bucata de arc de pe ceasul unei zile, cu motivul culorii ei */
interface Bucata {
  from: number;
  to: number;
  /** true = program normal, false = in afara programului */
  standard: boolean;
  /** Acoperita de orele incluse in abonament / pachet: nu se factureaza */
  acoperit?: boolean;
  /** Interventie cu suma impusa manual: se contorizeaza oricum */
  impus?: boolean;
}

/** Bucatile colorate ale unui interval, dupa aceeasi regula ca la facturare */
function segmente(
  iso: string,
  interval: Interval,
  standardStart: number,
  standardEnd: number,
  weekendOffHours: boolean,
): Bucata[] {
  const sfarsit = Math.min(interval.end <= interval.start ? interval.end + 1440 : interval.end, 1440);
  if (sfarsit <= interval.start) return [];
  if (weekendOffHours && isWeekend(iso)) return [{ from: interval.start, to: sfarsit, standard: false }];

  const taieturi = [interval.start, sfarsit, standardStart, standardEnd]
    .filter((m) => m >= interval.start && m <= sfarsit)
    .sort((a, b) => a - b);

  const out: Bucata[] = [];
  for (let i = 0; i < taieturi.length - 1; i += 1) {
    const from = taieturi[i];
    const to = taieturi[i + 1];
    if (to <= from) continue;
    const mijloc = (from + to) / 2;
    out.push({ from, to, standard: mijloc >= standardStart && mijloc < standardEnd });
  }
  return out;
}

/**
 * Taie bucatile unei interventii in partea acoperita de orele incluse si cea
 * ramasa de facturat, in aceeasi ordine ca la calculul sumelor: intai orele din
 * programul normal, apoi cele din afara lui.
 */
function marcheazaAcoperit(bucati: Bucata[], acoperite: number): Bucata[] {
  const durata = (b: Bucata) => b.to - b.from;
  const total = (standard: boolean) =>
    bucati.filter((b) => b.standard === standard).reduce((t, b) => t + durata(b), 0);

  let deStandard = Math.min(Math.max(0, acoperite), total(true));
  let deOff = Math.min(Math.max(0, acoperite - deStandard), total(false));
  if (deStandard <= 0 && deOff <= 0) return bucati;

  const out: Bucata[] = [];
  for (const b of bucati) {
    const acoperit = Math.min(durata(b), b.standard ? deStandard : deOff);
    if (b.standard) deStandard -= acoperit;
    else deOff -= acoperit;

    if (acoperit > 0) out.push({ ...b, to: b.from + acoperit, acoperit: true });
    if (acoperit < durata(b)) out.push({ ...b, from: b.from + acoperit, acoperit: false });
  }
  return out;
}

/** Culoarea unei bucati: suma impusa bate orele incluse, care bat regimul orar */
function culoare(bucata: Bucata): string {
  if (bucata.impus) return ROSU;
  if (bucata.acoperit) return VERDE;
  return bucata.standard ? INDIGO : FUCSIA;
}

/** Arcul unui interval pe un ceas de 24h, ca sa apara si in PDF ceasul din aplicatie */
function deseneazaCeas(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  raza: number,
  bucati: Bucata[],
  grosime = 4,
) {
  doc.save();
  doc.lineWidth(grosime).strokeColor(GRI_DESCHIS).circle(cx, cy, raza).stroke();

  for (const bucata of bucati) {
    const unghi = (minut: number) => (minut / 1440) * 2 * Math.PI - Math.PI / 2;
    const a1 = unghi(bucata.from);
    const a2 = unghi(bucata.to);
    const pasi = Math.max(2, Math.ceil(((a2 - a1) / (2 * Math.PI)) * 96));

    doc.lineWidth(grosime).strokeColor(culoare(bucata));
    doc.moveTo(cx + raza * Math.cos(a1), cy + raza * Math.sin(a1));
    for (let i = 1; i <= pasi; i += 1) {
      const a = a1 + ((a2 - a1) * i) / pasi;
      doc.lineTo(cx + raza * Math.cos(a), cy + raza * Math.sin(a));
    }
    doc.stroke();
  }
  doc.restore();
}

/**
 * Raportul lunii, gata de trimis clientului: calendarul lunii cu ceasul
 * fiecarei zile, lista lucrarilor si totalul de plata.
 */
export async function buildMonthReportPdf(clientId: string, month: string): Promise<Buffer> {
  const fisa = await buildMonthlySheet(clientId, month);
  const { client, settings, rows, totals, discount, paidPools, packageStatement, includedFrom } = fisa;

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.registerFont('normal', NORMAL);
  doc.registerFont('bold', BOLD);
  doc.font('normal').fillColor(TEXT);

  const bucati: Buffer[] = [];
  doc.on('data', (b: Buffer) => bucati.push(b));
  const gata = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(bucati))));

  const stanga = doc.page.margins.left;
  const latime = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  /* ─────────────────────────────────────────────────────────────── antet ── */
  const sigla = settings.logoUrl ? path.join(env.uploadDir, path.basename(settings.logoUrl)) : '';
  let cuSigla = false;
  if (sigla && fs.existsSync(sigla) && !sigla.endsWith('.svg')) {
    try {
      doc.image(sigla, stanga, 38, { fit: [46, 46] });
      cuSigla = true;
    } catch {
      /* sigla nu se poate desena (format neacceptat) — mergem mai departe fara ea */
    }
  }
  const xTitlu = cuSigla ? stanga + 58 : stanga;

  doc.font('bold').fontSize(17).fillColor(TEXT).text('Raport de activitate', xTitlu, 40);
  doc.font('normal').fontSize(10).fillColor(GRI).text(`${numeLuna(month)} · ${settings.companyName}`, xTitlu);

  doc.font('bold').fontSize(11).fillColor(TEXT).text(client.company || client.name, stanga, 40, {
    width: latime,
    align: 'right',
  });
  if (client.cui) {
    doc.font('normal').fontSize(9).fillColor(GRI).text(client.cui, stanga, 56, { width: latime, align: 'right' });
  }

  doc.moveTo(stanga, 92).lineTo(stanga + latime, 92).lineWidth(1).strokeColor(GRI_DESCHIS).stroke();

  /* ──────────────────────────────────────────────────── calendarul lunii ── */
  const grila = grilaLunii(month);
  const latimeCelula = latime / 7;
  const inaltimeCelula = 48;
  let y = 108;

  doc.font('bold').fontSize(11).fillColor(TEXT).text('Calendarul lunii', stanga, y);
  y += 20;

  doc.font('bold').fontSize(8).fillColor(GRI);
  ZILE.forEach((zi, index) => {
    doc.text(zi, stanga + index * latimeCelula, y, { width: latimeCelula, align: 'center' });
  });
  y += 14;

  const peZi = new Map<string, typeof rows>();
  for (const row of rows) peZi.set(row.date, [...(peZi.get(row.date) ?? []), row]);

  /**
   * Bucatile de desenat pentru o zi: doar interventiile cu interval orar pot
   * aparea pe ceas. Culorile sunt cele din aplicatie — verde ce a intrat in
   * orele incluse, rosu ce are suma impusa manual.
   */
  const bucatileZilei = (iso: string, aleZilei: typeof rows): Bucata[] =>
    aleZilei
      .filter((r) => r.entryMode === 'INTERVAL' && r.endMinutes !== r.startMinutes)
      .flatMap((r) => {
        const parti = segmente(
          iso,
          { start: r.startMinutes, end: r.endMinutes },
          settings.standardStart,
          settings.standardEnd,
          settings.weekendOffHours,
        );
        if (r.manualAmount) return parti.map((parte) => ({ ...parte, impus: true }));

        // orele trecute explicit ca incluse in pachet sunt acoperite in intregime
        const acoperite = r.includedInPackage
          ? r.minutes
          : r.paidMinutes + r.includedMinutes + r.packageMinutes;
        return acoperite > 0 ? marcheazaAcoperit(parti, acoperite) : parti;
      });

  const bucatiPeZi = new Map<string, Bucata[]>();
  for (const [iso, aleZilei] of peZi) bucatiPeZi.set(iso, bucatileZilei(iso, aleZilei));
  const toateBucatile = [...bucatiPeZi.values()].flat();

  for (let i = 0; i < grila.length; i += 1) {
    const iso = grila[i];
    const coloana = i % 7;
    const x = stanga + coloana * latimeCelula;
    if (coloana === 0 && i > 0) y += inaltimeCelula;

    if (!iso) continue;
    const aleZilei = peZi.get(iso) ?? [];
    const minute = aleZilei.reduce((s, r) => s + r.minutes, 0);

    doc
      .roundedRect(x + 2, y + 2, latimeCelula - 4, inaltimeCelula - 4, 5)
      .lineWidth(0.8)
      .strokeColor(minute > 0 ? '#c7d2fe' : GRI_DESCHIS)
      .stroke();

    doc.font('bold').fontSize(9).fillColor(minute > 0 ? INDIGO : GRI).text(String(ziDinIso(iso)), x + 7, y + 7);

    if (minute > 0) {
      doc.font('normal').fontSize(7.5).fillColor(GRI).text(formatOre(minute), x + 7, y + 19, {
        width: latimeCelula - 36,
      });

      const bucati = bucatiPeZi.get(iso) ?? [];
      if (bucati.length > 0) {
        deseneazaCeas(doc, x + latimeCelula - 17, y + inaltimeCelula / 2 + 2, 11, bucati, 4.5);
      }
    }
  }
  y += inaltimeCelula + 10;

  // legenda culorilor de pe ceasuri — doar cele care apar chiar in luna asta
  const legenda = [
    { culoare: INDIGO, text: 'program normal', apare: toateBucatile.some((b) => b.standard && !b.acoperit && !b.impus) },
    { culoare: FUCSIA, text: 'în afara programului', apare: toateBucatile.some((b) => !b.standard && !b.acoperit && !b.impus) },
    { culoare: VERDE, text: 'inclus în abonament', apare: toateBucatile.some((b) => b.acoperit) },
    { culoare: ROSU, text: 'sumă stabilită separat', apare: toateBucatile.some((b) => b.impus) },
  ].filter((item) => item.apare);

  if (legenda.length > 0) {
    doc.font('normal').fontSize(7.5);
    let xLegenda = stanga;
    for (const item of legenda) {
      doc.circle(xLegenda + 3, y + 4, 3).fillColor(item.culoare).fill();
      doc.fillColor(GRI).text(item.text, xLegenda + 10, y, { lineBreak: false });
      xLegenda += doc.widthOfString(item.text) + 26;
    }
    y += 18;
  }

  /* ───────────────────────────────────────────── orele din pachete si abonamente ── */
  const randuriOre: string[] = [];

  /*
   * Orele incluse se acorda pe saptamana, nu pe luna, iar o saptamana poate
   * sta in doua luni — deci un „rest pe luna" ar fi mincinos. Scriem cat s-a
   * consumat si cat primeste clientul in fiecare saptamana.
   */
  const oreSaptamanal = includedFrom.reduce((total, sub) => total + sub.hours, 0);
  if (oreSaptamanal > 0 || totals.usedIncludedMinutes > 0) {
    randuriOre.push(
      `Ore incluse în abonament: ${formatOre(totals.usedIncludedMinutes, '0h')} consumate în ${numeLuna(month)}` +
        (oreSaptamanal > 0 ? ` · ${formatOre(oreSaptamanal * 60)} în fiecare săptămână` : ''),
    );
  }
  if (packageStatement.creditedMinutes > 0 || packageStatement.usedMinutes > 0) {
    randuriOre.push(
      `Pachet preplătit: ${formatOre(packageStatement.usedMinutes, '0h')} consumate luna asta` +
        ` · sold la final ${formatOre(packageStatement.closingMinutes, '0h')}`,
    );
  }
  for (const pool of paidPools) {
    randuriOre.push(
      `Ore plătite prin „${pool.label}": ${formatOre(pool.usedThisMonth, '0h')} consumate luna asta` +
        ` · ${formatOre(pool.remainingMinutes, '0h')} rămase din ${formatOre(pool.totalMinutes)}`,
    );
  }

  if (randuriOre.length > 0) {
    const inaltime = randuriOre.length * 13 + 14;
    doc.roundedRect(stanga, y, latime, inaltime, 6).fillColor('#f8fafc').fill();
    y += 8;
    for (const rand of randuriOre) {
      doc.circle(stanga + 13, y + 5, 2.5).fillColor(INDIGO).fill();
      doc.font('normal').fontSize(8.5).fillColor(TEXT).text(rand, stanga + 20, y, { width: latime - 30 });
      y += 13;
    }
    y += 12;
  }

  /* ─────────────────────────────────────────────────── lista lucrarilor ── */
  doc.font('bold').fontSize(11).fillColor(TEXT).text('Ce s-a lucrat', stanga, y);
  y += 18;

  const coloane = [
    { titlu: 'Data', x: stanga, latime: 58 },
    { titlu: 'Interval', x: stanga + 58, latime: 62 },
    { titlu: 'Lucrare', x: stanga + 120, latime: latime - 120 - 66 - 85 },
    // mai lata decat ar cere cifra singura: aici incap si orele din afara programului
    { titlu: 'Ore', x: stanga + latime - 151, latime: 66, aliniere: 'right' as const },
    { titlu: 'Valoare', x: stanga + latime - 85, latime: 85, aliniere: 'right' as const },
  ];

  const scrieAntetTabel = () => {
    doc.font('bold').fontSize(8).fillColor(GRI);
    for (const c of coloane) {
      doc.text(c.titlu.toUpperCase(), c.x, y, { width: c.latime, align: c.aliniere ?? 'left' });
    }
    y += 12;
    doc.moveTo(stanga, y).lineTo(stanga + latime, y).lineWidth(0.8).strokeColor(GRI_DESCHIS).stroke();
    y += 6;
  };
  scrieAntetTabel();

  if (rows.length === 0) {
    doc.font('normal').fontSize(9).fillColor(GRI).text('Luna aceasta nu are ore înregistrate.', stanga, y);
    y += 16;
  }

  for (const row of rows) {
    /*
     * Descrierea isi pastreaza randurile, dar fara randurile goale dintre ele:
     * in aplicatie spatiul dintre paragrafe se vede bine, intr-un PDF tipabil
     * ar rupe tabelul in pagini aproape goale.
     */
    const lucrari = etichete(row.projectTag).join(' · ');
    const descriere =
      (row.description || '—')
        .split('\n')
        .map((linie) => linie.trim())
        .filter(Boolean)
        .join('\n') + (lucrari ? ` · ${lucrari}` : '');
    const stilDescriere = { width: coloane[2].latime, lineGap: 1.5 };
    const inaltimeText = doc.font('normal').fontSize(8.5).heightOfString(descriere, stilDescriere);
    const inaltimeRand = Math.max(inaltimeText, row.billableEur > 0 ? 18 : 11) + 7;

    /*
     * Pagina noua doar cand randul chiar nu mai incape — asa paginile nu mai
     * ramane pe jumatate goale. Un rand mai lung decat o pagina intreaga se
     * lasa sa curga, altfel ar sari o pagina degeaba.
     */
    const josPagina = doc.page.height - doc.page.margins.bottom;
    const inaltimeUtila = josPagina - doc.page.margins.top;
    if (y + inaltimeRand > josPagina && inaltimeRand <= inaltimeUtila) {
      doc.addPage();
      y = doc.page.margins.top;
      scrieAntetTabel();
    }

    doc.font('normal').fontSize(8.5).fillColor(TEXT);
    doc.text(row.date.split('-').reverse().join('.'), coloane[0].x, y, { width: coloane[0].latime });
    doc.fillColor(GRI).text(
      row.entryMode === 'INTERVAL'
        ? `${minutesToHhMm(row.startMinutes)}–${minutesToHhMm(row.endMinutes)}`
        : '—',
      coloane[1].x,
      y,
      { width: coloane[1].latime },
    );
    doc.fillColor(TEXT).text(descriere, coloane[2].x, y, stilDescriere);
    /*
     * Orele lucrate si, cu fucsia, cat din ele a picat in afara programului —
     * exact ca in calendarul din aplicatie ("3h + 1h"). Le asezam de la dreapta
     * la stanga, ca sa putem colora doar a doua bucata.
     */
    const textOre = formatOre(row.minutes);
    const textOff = row.offHoursMinutes > 0 ? ` + ${formatOre(row.offHoursMinutes)}` : '';
    const dreaptaOre = coloane[3].x + coloane[3].latime;
    const latimeOff = textOff ? doc.widthOfString(textOff) : 0;
    doc.fillColor(TEXT).text(textOre, dreaptaOre - doc.widthOfString(textOre) - latimeOff, y, {
      lineBreak: false,
    });
    if (textOff) {
      doc.fillColor(FUCSIA).text(textOff, dreaptaOre - latimeOff, y, { lineBreak: false });
    }
    if (row.billableEur > 0) {
      doc.font('bold').fillColor(TEXT).text(inLei(row.billableEur, settings.eurRon), coloane[4].x, y, {
        width: coloane[4].latime,
        align: 'right',
      });
      doc.font('normal').fontSize(7).fillColor(GRI).text(suma(row.billableEur, 'EUR'), coloane[4].x, y + 10, {
        width: coloane[4].latime,
        align: 'right',
      });
      doc.fontSize(8.5);
    } else {
      doc.font('normal').fillColor(GRI).text('inclus', coloane[4].x, y, {
        width: coloane[4].latime,
        align: 'right',
      });
    }

    y += inaltimeRand;
    doc.moveTo(stanga, y - 4).lineTo(stanga + latime, y - 4).lineWidth(0.4).strokeColor('#f1f5f9').stroke();
  }

  /* ────────────────────────────────────────────────────────────── total ── */
  const latimeTotal = 230;
  const xTotal = stanga + latime - latimeTotal;

  /** eticheta, suma in EUR (null = doar text), text simplu, accent */
  const randuriTotal: { eticheta: string; eur: number | null; text?: string; accent?: boolean; semn?: string }[] = [
    { eticheta: 'Ore lucrate', eur: null, text: formatOre(totals.minutes) },
    ...(totals.discountEur > 0
      ? [
          {
            eticheta: discount?.type === 'PERCENT' ? `Reducere ${discount.value}%` : 'Reducere',
            eur: totals.discountEur,
            semn: '−',
          },
        ]
      : []),
    { eticheta: 'De plată', eur: totals.netEur, accent: true },
    ...(settings.vatRate > 0
      ? [
          { eticheta: `TVA ${settings.vatRate}%`, eur: totals.tva },
          { eticheta: 'Total cu TVA', eur: totals.totalCuTva, accent: true },
        ]
      : []),
  ];

  const inaltimeRand = (rand: (typeof randuriTotal)[number]) => (rand.eur === null ? 16 : 22);
  const inaltimeTotal = randuriTotal.reduce((total, rand) => total + inaltimeRand(rand), 14);

  // spatiul de care are nevoie blocul: 10 deasupra, cutia si randul cu cursul dedesubt
  const nevoieTotal = 10 + inaltimeTotal + 16;
  if (y + nevoieTotal > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y += 10;

  doc.roundedRect(xTotal, y, latimeTotal, inaltimeTotal, 6).fillColor('#f8fafc').fill();
  y += 8;
  for (const rand of randuriTotal) {
    doc.font(rand.accent ? 'bold' : 'normal').fontSize(rand.accent ? 10 : 9).fillColor(rand.accent ? TEXT : GRI);
    doc.text(rand.eticheta, xTotal + 10, y + 2, { width: latimeTotal - 20 });
    doc.text(
      rand.eur === null ? (rand.text ?? '') : `${rand.semn ?? ''}${inLei(rand.eur, settings.eurRon)}`,
      xTotal + 10,
      y + 2,
      { width: latimeTotal - 20, align: 'right' },
    );
    if (rand.eur !== null) {
      doc.font('normal').fontSize(7).fillColor(GRI).text(
        `${rand.semn ?? ''}${suma(rand.eur, 'EUR')}`,
        xTotal + 10,
        y + (rand.accent ? 14 : 13),
        { width: latimeTotal - 20, align: 'right' },
      );
    }
    y += inaltimeRand(rand);
  }
  y += 6;
  doc.font('normal').fontSize(7).fillColor(GRI).text(
    `Sumele sunt calculate la cursul 1 EUR = ${settings.eurRon.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} RON`,
    xTotal,
    y,
    { width: latimeTotal, align: 'right' },
  );

  /* ──────────────────────────────────────────────────────────── subsol ── */
  const pagini = doc.bufferedPageRange();
  for (let i = 0; i < pagini.count; i += 1) {
    doc.switchToPage(pagini.start + i);
    // scrisul sub marginea de jos ar deschide o pagina noua, deci o coboram cat scriem subsolul
    const margineJos = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('normal').fontSize(7.5).fillColor(GRI);
    doc.text(
      `${settings.companyName}${settings.companyEmail ? ` · ${settings.companyEmail}` : ''} — generat pe ${new Date().toLocaleDateString('ro-RO')}`,
      stanga,
      doc.page.height - 30,
      { width: latime, lineBreak: false },
    );
    doc.text(`Pagina ${i + 1} din ${pagini.count}`, stanga, doc.page.height - 30, {
      width: latime,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = margineJos;
  }

  doc.end();
  return gata;
}
