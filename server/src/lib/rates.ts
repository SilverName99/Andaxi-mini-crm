import { isWeekend } from './dates.js';

export interface RateConfig {
  /** Tarif EUR/ora in intervalul standard (implicit 45) */
  standardRate: number;
  /** Tarif EUR/ora in afara intervalului standard (implicit 90) */
  offHoursRate: number;
  /** Inceputul intervalului standard, minute de la miezul noptii (09:00 = 540) */
  standardStart: number;
  /** Sfarsitul intervalului standard (16:00 = 960) */
  standardEnd: number;
  /** Daca e activ, tot weekendul se taxeaza la tarif majorat */
  weekendOffHours: boolean;
}

export interface RateSplit {
  standardMinutes: number;
  offHoursMinutes: number;
  totalMinutes: number;
  amountEur: number;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Imparte un interval de lucru intre tariful standard si cel majorat.
 *
 * - intervalul e [start, end); daca end <= start, se considera ca trece peste
 *   miezul noptii (ex. 22:00 -> 02:00) si se adauga 24h;
 * - fereastra standard se aplica si zilei urmatoare, pentru intervalele peste noapte;
 * - daca `weekendOffHours` e activ si ziua e sambata/duminica, totul e la tarif majorat.
 */
export function splitWorkInterval(
  date: string,
  startMinutes: number,
  endMinutes: number,
  config: RateConfig,
): RateSplit {
  const start = startMinutes;
  const end = endMinutes <= startMinutes ? endMinutes + 1440 : endMinutes;
  const totalMinutes = end - start;

  let standardMinutes = 0;
  if (!(config.weekendOffHours && isWeekend(date))) {
    // fereastra standard pentru ziua curenta si, daca intervalul trece de miezul
    // noptii, si pentru ziua urmatoare (+1440)
    for (const dayOffset of [0, 1440]) {
      standardMinutes += overlap(
        start,
        end,
        config.standardStart + dayOffset,
        config.standardEnd + dayOffset,
      );
    }
  }

  const offHoursMinutes = totalMinutes - standardMinutes;
  const amountEur = round2(
    (standardMinutes / 60) * config.standardRate + (offHoursMinutes / 60) * config.offHoursRate,
  );

  return { standardMinutes, offHoursMinutes, totalMinutes, amountEur };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Echivalentul in RON, la cursul configurat */
export function toRon(amountEur: number, eurRon: number): number {
  return round2(amountEur * eurRon);
}
