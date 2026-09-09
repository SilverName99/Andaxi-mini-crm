/**
 * Ceasul de 24 de ore: transforma intervalele lucrate in bucati colorate.
 * Regula de impartire e aceeasi cu cea de pe server (splitWorkInterval), ca
 * ce vezi pe ceas sa fie exact ce se si factureaza.
 */

export interface FereastraProgram {
  /** Minute de la miezul noptii; 09:00 = 540 */
  standardStart: number;
  standardEnd: number;
  /** Daca e activ, sambata si duminica sunt integral in afara programului */
  weekendOffHours: boolean;
}

export interface SegmentCeas {
  /** Minute de la miezul noptii, in ziua desenata (0…1440) */
  from: number;
  to: number;
  /** true = program normal, false = in afara programului */
  standard: boolean;
  /** Bucata acoperita de orele incluse in abonament / pachet: nu se factureaza */
  acoperit?: boolean;
}

export function esteWeekend(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const zi = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return zi === 0 || zi === 6;
}

/**
 * Imparte un interval in bucatile care se deseneaza pe ceas. Intervalele care
 * trec de miezul noptii se taie la 24:00 — restul apartine zilei urmatoare.
 */
export function segmenteInterval(
  date: string,
  start: number,
  end: number,
  program: FereastraProgram,
): SegmentCeas[] {
  const sfarsit = Math.min(end <= start ? end + 1440 : end, 1440);
  if (sfarsit <= start) return [];

  if (program.weekendOffHours && esteWeekend(date)) {
    return [{ from: start, to: sfarsit, standard: false }];
  }

  // taiem intervalul la marginile programului normal si colorăm fiecare bucata
  const taieturi = [start, sfarsit, program.standardStart, program.standardEnd]
    .filter((m) => m >= start && m <= sfarsit)
    .sort((a, b) => a - b);

  const segmente: SegmentCeas[] = [];
  for (let i = 0; i < taieturi.length - 1; i += 1) {
    const from = taieturi[i];
    const to = taieturi[i + 1];
    if (to <= from) continue;
    const mijloc = (from + to) / 2;
    const standard = mijloc >= program.standardStart && mijloc < program.standardEnd;

    const ultim = segmente[segmente.length - 1];
    if (ultim && ultim.standard === standard && ultim.to === from) ultim.to = to;
    else segmente.push({ from, to, standard });
  }
  return segmente;
}

export interface IntervalZi {
  start: number;
  end: number;
  /**
   * Cate minute din interventie sunt acoperite de abonament sau de pachet.
   * Se coloreaza verde pe ceas, ca sa se vada dintr-o privire cat a intrat in
   * orele incluse si cat ramane de facturat.
   */
  acoperite?: number;
}

/**
 * Taie segmentele unei interventii in partea acoperita de orele incluse si
 * partea ramasa de facturat. Ordinea e aceeasi cu cea de la calculul sumelor
 * (allocateMonth): intai se acopera orele din programul normal, apoi cele din
 * afara lui, fiecare in ordine cronologica.
 */
export function marcheazaAcoperit(segmente: SegmentCeas[], acoperite: number): SegmentCeas[] {
  const durata = (s: SegmentCeas) => s.to - s.from;
  const total = (standard: boolean) =>
    segmente.filter((s) => s.standard === standard).reduce((t, s) => t + durata(s), 0);

  let deStandard = Math.min(Math.max(0, acoperite), total(true));
  let deOff = Math.min(Math.max(0, acoperite - deStandard), total(false));
  if (deStandard <= 0 && deOff <= 0) return segmente;

  const out: SegmentCeas[] = [];
  for (const s of segmente) {
    const acoperit = Math.min(durata(s), s.standard ? deStandard : deOff);
    if (s.standard) deStandard -= acoperit;
    else deOff -= acoperit;

    if (acoperit > 0) out.push({ ...s, to: s.from + acoperit, acoperit: true });
    if (acoperit < durata(s)) out.push({ ...s, from: s.from + acoperit, acoperit: false });
  }
  return out;
}

/** Segmentele tuturor intervalelor unei zile, gata de desenat */
export function segmenteleZilei(
  date: string,
  intervale: IntervalZi[],
  program: FereastraProgram,
): SegmentCeas[] {
  return intervale.flatMap((i) => {
    const segmente = segmenteInterval(date, i.start, i.end, program);
    return i.acoperite ? marcheazaAcoperit(segmente, i.acoperite) : segmente;
  });
}

/** Minutele acoperite de segmente, pe cele doua regimuri */
export function minuteSegmente(segmente: SegmentCeas[]): { standard: number; offHours: number } {
  return segmente.reduce(
    (total, s) => {
      const minute = s.to - s.from;
      return s.standard
        ? { ...total, standard: total.standard + minute }
        : { ...total, offHours: total.offHours + minute };
    },
    { standard: 0, offHours: 0 },
  );
}
