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

/** Bucatile colorate ale unui interval, dupa aceeasi regula ca la facturare */
function segmente(
  iso: string,
  interval: Interval,
  standardStart: number,
  standardEnd: number,
  weekendOffHours: boolean,
): { from: number; to: number; standard: boolean }[] {
  const sfarsit = Math.min(interval.end <= interval.start ? interval.end + 1440 : interval.end, 1440);
  if (sfarsit <= interval.start) return [];
  if (weekendOffHours && isWeekend(iso)) return [{ from: interval.start, to: sfarsit, standard: false }];

  const taieturi = [interval.start, sfarsit, standardStart, standardEnd]
    .filter((m) => m >= interval.start && m <= sfarsit)
    .sort((a, b) => a - b);

  const out: { from: number; to: number; standard: boolean }[] = [];
  for (let i = 0; i < taieturi.length - 1; i += 1) {
    const from = taieturi[i];
    const to = taieturi[i + 1];
    if (to <= from) continue;
    const mijloc = (from + to) / 2;
    out.push({ from, to, standard: mijloc >= standardStart && mijloc < standardEnd });
  }
  return out;
}

/** Arcul unui interval pe un ceas de 24h, ca sa apara si in PDF ceasul din aplicatie */
function deseneazaCeas(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  raza: number,
  bucati: { from: number; to: number; standard: boolean }[],
) {
  doc.save();
  doc.lineWidth(2.2).strokeColor(GRI_DESCHIS).circle(cx, cy, raza).stroke();

  for (const bucata of bucati) {
    const unghi = (minut: number) => (minut / 1440) * 2 * Math.PI - Math.PI / 2;
    const a1 = unghi(bucata.from);
    const a2 = unghi(bucata.to);
    const pasi = Math.max(2, Math.ceil(((a2 - a1) / (2 * Math.PI)) * 48));

    doc.lineWidth(2.6).strokeColor(bucata.standard ? INDIGO : FUCSIA);
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
  const { client, settings, rows, totals, discount, paidPools, packageStatement } = fisa;

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
        width: latimeCelula - 14,
      });

      const intervale = aleZilei
        .filter((r) => r.entryMode === 'INTERVAL' && r.endMinutes !== r.startMinutes)
        .map((r) => ({ start: r.startMinutes, end: r.endMinutes }));

      if (intervale.length > 0) {
        const bucati = intervale.flatMap((interval) =>
          segmente(iso, interval, settings.standardStart, settings.standardEnd, settings.weekendOffHours),
        );
        deseneazaCeas(doc, x + latimeCelula - 15, y + inaltimeCelula - 16, 8, bucati);
      }
    }
  }
  y += inaltimeCelula + 10;

  // legenda culorilor de pe ceasuri
  doc.circle(stanga + 3, y + 4, 3).fillColor(INDIGO).fill();
  doc.font('normal').fontSize(7.5).fillColor(GRI).text('program normal', stanga + 10, y);
  doc.circle(stanga + 88, y + 4, 3).fillColor(FUCSIA).fill();
  doc.fillColor(GRI).text('în afara programului', stanga + 95, y);
  y += 18;

  /* ───────────────────────────────────────────── orele din pachete si abonamente ── */
  const randuriOre: string[] = [];

  if (totals.includedMinutes > 0) {
    randuriOre.push(
      `Ore incluse în pachet: ${formatOre(totals.usedIncludedMinutes, '0h')} consumate din ${formatOre(totals.includedMinutes)}` +
        ` · ${formatOre(totals.remainingIncludedMinutes)} rămase în luna asta`,
    );
  }
  if (packageStatement.creditedMinutes > 0 || packageStatement.usedMinutes > 0) {
    randuriOre.push(
      `Pachet preplătit: ${formatOre(packageStatement.usedMinutes, '0h')} consumate luna asta` +
        ` · sold la final ${formatOre(packageStatement.closingMinutes)}`,
    );
  }
  for (const pool of paidPools) {
    randuriOre.push(
      `Ore plătite prin „${pool.label}": ${formatOre(pool.usedThisMonth, '0h')} consumate luna asta` +
        ` · ${formatOre(pool.remainingMinutes)} rămase din ${formatOre(pool.totalMinutes)}`,
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
    { titlu: 'Lucrare', x: stanga + 120, latime: latime - 120 - 55 - 95 },
    { titlu: 'Ore', x: stanga + latime - 150, latime: 55, aliniere: 'right' as const },
    { titlu: 'Valoare', x: stanga + latime - 95, latime: 95, aliniere: 'right' as const },
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
    // rand nou de pagina, cu antetul tabelului repetat
    if (y > doc.page.height - 130) {
      doc.addPage();
      y = doc.page.margins.top;
      scrieAntetTabel();
    }

    const lucrari = etichete(row.projectTag).join(' · ');
    const descriere = [row.description || '—', lucrari ? `· ${lucrari}` : '']
      .filter(Boolean)
      .join(' ');
    const inaltimeText = doc.font('normal').fontSize(8.5).heightOfString(descriere, { width: coloane[2].latime });

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
    doc.fillColor(TEXT).text(descriere, coloane[2].x, y, { width: coloane[2].latime });
    doc.text(formatOre(row.minutes), coloane[3].x, y, { width: coloane[3].latime, align: 'right' });
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

    y += Math.max(inaltimeText, row.billableEur > 0 ? 18 : 11) + 7;
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
