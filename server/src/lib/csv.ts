/**
 * Citirea fisierelor CSV exportate din Excel: separatorul poate fi ";" (setarea
 * romaneasca) sau ",", numerele pot avea virgula zecimala, iar fisierul poate
 * incepe cu BOM.
 */

/** Imparte o linie in campuri, respectand ghilimelele */
function imparteLinie(linie: string, separator: string): string[] {
  const campuri: string[] = [];
  let curent = '';
  let inGhilimele = false;

  for (let i = 0; i < linie.length; i += 1) {
    const c = linie[i];
    if (c === '"') {
      // doua ghilimele consecutive inseamna un ghilimel in text
      if (inGhilimele && linie[i + 1] === '"') {
        curent += '"';
        i += 1;
      } else {
        inGhilimele = !inGhilimele;
      }
    } else if (c === separator && !inGhilimele) {
      campuri.push(curent.trim());
      curent = '';
    } else {
      curent += c;
    }
  }
  campuri.push(curent.trim());
  return campuri;
}

/** Fara diacritice si fara majuscule, ca sa putem compara denumirile coloanelor */
export function normalizeaza(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toLowerCase()
    .trim();
}

/**
 * Transforma textul CSV intr-o lista de obiecte, cu cheile din antet
 * normalizate. Liniile goale se ignora.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const curat = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const linii = curat.split('\n').filter((l) => l.trim().length > 0);
  if (linii.length === 0) return [];

  const separator = (linii[0].match(/;/g)?.length ?? 0) >= (linii[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const antet = imparteLinie(linii[0], separator).map(normalizeaza);

  return linii.slice(1).map((linie) => {
    const valori = imparteLinie(linie, separator);
    const rand: Record<string, string> = {};
    antet.forEach((cheie, index) => {
      if (cheie) rand[cheie] = valori[index] ?? '';
    });
    return rand;
  });
}

/** "3,5" sau "3.5" -> 3.5; null daca nu e numar */
export function parseNumar(valoare: string): number | null {
  const curat = valoare.replace(/\s/g, '').replace(',', '.');
  if (!curat) return null;
  const numar = Number(curat);
  return Number.isFinite(numar) ? numar : null;
}

/** Accepta "21.08.2026", "21/08/2026" sau "2026-08-21" */
export function parseData(valoare: string): string | null {
  const curat = valoare.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(curat);
  if (iso) return curat;

  const ro = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(curat);
  if (!ro) return null;

  const [, zi, luna, an] = ro;
  const data = `${an}-${luna.padStart(2, '0')}-${zi.padStart(2, '0')}`;
  // verificam ca data exista cu adevarat (31 februarie nu trece)
  const test = new Date(`${data}T00:00:00Z`);
  return test.toISOString().slice(0, 10) === data ? data : null;
}
