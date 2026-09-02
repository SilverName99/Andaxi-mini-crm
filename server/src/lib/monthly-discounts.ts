import { applyDiscount, type DiscountType } from './discount.js';
import { monthOf } from './hours.js';

interface ReducereLunara {
  clientId: string;
  month: string;
  type: string;
  value: number;
}

interface LogCuLuna {
  clientId: string;
  date: string;
  billable: boolean;
}

/**
 * Reducerea lunii se dă pe totalul orelor din luna aceea, nu pe fiecare
 * intervenție. Ca să putem totuși raporta pe client, pe lună sau pe stare de
 * facturare, o împărțim proporțional: fiecare intervenție păstrează cota ei
 * din lună, înmulțită cu un factor.
 *
 * Rezultatul e o funcție log → factor (1 acolo unde nu e nicio reducere).
 */
export function factorReducere<T extends LogCuLuna>(
  logs: T[],
  valoare: (log: T) => number,
  reduceri: ReducereLunara[],
): (log: T) => number {
  const brutPeLuna = new Map<string, number>();
  for (const log of logs) {
    if (!log.billable) continue;
    const cheie = `${log.clientId}|${monthOf(log.date)}`;
    brutPeLuna.set(cheie, (brutPeLuna.get(cheie) ?? 0) + valoare(log));
  }

  const factori = new Map<string, number>();
  for (const reducere of reduceri) {
    const cheie = `${reducere.clientId}|${reducere.month}`;
    const brut = brutPeLuna.get(cheie) ?? 0;
    if (brut <= 0) continue;
    const { netEur } = applyDiscount(brut, { type: reducere.type as DiscountType, value: reducere.value });
    factori.set(cheie, netEur / brut);
  }

  return (log: T) => factori.get(`${log.clientId}|${monthOf(log.date)}`) ?? 1;
}
