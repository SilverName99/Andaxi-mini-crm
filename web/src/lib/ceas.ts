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
}

/** Segmentele tuturor intervalelor unei zile, gata de desenat */
export function segmenteleZilei(
  date: string,
  intervale: IntervalZi[],
  program: FereastraProgram,
): SegmentCeas[] {
  return intervale.flatMap((i) => segmenteInterval(date, i.start, i.end, program));
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
