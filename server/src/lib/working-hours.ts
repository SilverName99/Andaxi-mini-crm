/**
 * Termenele de raspuns se numara in ore de lucru: ceasul merge doar in
 * programul normal, de luni pana vineri. Sambata, duminica si serile nu se pun
 * la socoteala — o cerere trimisa vineri seara are termenul luni.
 */

/** Toata platforma lucreaza pe ora Romaniei, indiferent de fusul serverului */
const FUS = 'Europe/Bucharest';

/** Cate minute e ora locala inaintea celei universale, la momentul dat */
function decalaj(moment: Date): number {
  const local = new Date(moment.toLocaleString('en-US', { timeZone: FUS }));
  const utc = new Date(moment.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

/** Ceasul local: ziua saptamanii (luni = 0) si minutul din zi */
function local(moment: Date): { ziSaptamana: number; minutDinZi: number; miezulNoptii: Date } {
  const mutat = new Date(moment.getTime() + decalaj(moment) * 60_000);
  const ziSaptamana = (mutat.getUTCDay() + 6) % 7;
  const minutDinZi = mutat.getUTCHours() * 60 + mutat.getUTCMinutes();
  const miezulNoptii = new Date(mutat.getTime() - minutDinZi * 60_000);
  return { ziSaptamana, minutDinZi, miezulNoptii };
}

export interface ProgramLucru {
  /** Minute de la miezul noptii; 09:00 = 540 */
  standardStart: number;
  standardEnd: number;
}

/**
 * Momentul in care se implinesc `oreDeLucru` ore de program, pornind de la
 * `dela`. Daca pornirea cade in afara programului, ceasul incepe la prima ora
 * de lucru care urmeaza.
 */
export function termenOreDeLucru(dela: Date, oreDeLucru: number, program: ProgramLucru): Date {
  const lungimeZi = Math.max(0, program.standardEnd - program.standardStart);
  if (lungimeZi === 0) return dela; // program gol: nu avem cum sa numaram

  let ramase = Math.round(oreDeLucru * 60);
  let { ziSaptamana, minutDinZi, miezulNoptii } = local(dela);

  // maximum doi ani de zile parcurse, ca o gresala de configurare sa nu blocheze serverul
  for (let pas = 0; pas < 800; pas += 1) {
    const eZiLucratoare = ziSaptamana < 5;
    const inceput = Math.max(minutDinZi, program.standardStart);
    const disponibile = eZiLucratoare ? Math.max(0, program.standardEnd - inceput) : 0;

    if (disponibile >= ramase) {
      const minutFinal = inceput + ramase;
      const localFinal = new Date(miezulNoptii.getTime() + minutFinal * 60_000);
      // inapoi din ora locala in ora universala
      return new Date(localFinal.getTime() - decalaj(localFinal) * 60_000);
    }

    ramase -= disponibile;
    // trecem la ziua urmatoare, de la prima ora de program
    miezulNoptii = new Date(miezulNoptii.getTime() + 24 * 60 * 60_000);
    ziSaptamana = (ziSaptamana + 1) % 7;
    minutDinZi = 0;
  }

  return dela;
}

/** Cate ore de lucru are fiecare fel de cerere */
export const ORE_RASPUNS: Record<'NORMAL' | 'URGENT', number> = {
  NORMAL: 24,
  URGENT: 12,
};
