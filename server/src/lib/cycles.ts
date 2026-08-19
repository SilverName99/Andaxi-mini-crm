import { addDays, addMonths } from './dates.js';

export type Cycle = 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';

export const CYCLE_MONTHS: Record<Cycle, number> = {
  MONTHLY: 1,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

export const CYCLE_LABELS: Record<Cycle, string> = {
  MONTHLY: 'Lunar',
  SEMIANNUAL: 'La 6 luni',
  ANNUAL: 'Anual',
};

export function isCycle(value: string): value is Cycle {
  return value === 'MONTHLY' || value === 'SEMIANNUAL' || value === 'ANNUAL';
}

/** Data scadentei urmatoare, dupa un ciclu complet */
export function nextDue(dueDate: string, cycle: Cycle): string {
  return addMonths(dueDate, CYCLE_MONTHS[cycle]);
}

/** Ultima zi acoperita de perioada care incepe la `periodStart` */
export function periodEnd(periodStart: string, cycle: Cycle): string {
  return addDays(nextDue(periodStart, cycle), -1);
}

/** Valoarea lunara echivalenta (pentru MRR) */
export function monthlyEquivalent(amountEur: number, cycle: Cycle): number {
  return amountEur / CYCLE_MONTHS[cycle];
}
