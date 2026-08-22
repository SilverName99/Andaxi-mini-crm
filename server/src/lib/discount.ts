import { round2 } from './rates.js';

export type DiscountType = 'PERCENT' | 'AMOUNT';

export interface DiscountInput {
  type: DiscountType;
  value: number;
}

export interface DiscountResult {
  /** Cat se scade efectiv */
  discountEur: number;
  /** Cat ramane de facturat dupa reducere */
  netEur: number;
}

/**
 * Aplica reducerea lunii peste suma de facturat.
 * Reducerea nu poate depasi suma: o suma fixa mai mare decat totalul duce la 0,
 * nu la o valoare negativa.
 */
export function applyDiscount(amountEur: number, discount: DiscountInput | null): DiscountResult {
  if (!discount || discount.value <= 0 || amountEur <= 0) {
    return { discountEur: 0, netEur: round2(amountEur) };
  }

  const brut = discount.type === 'PERCENT' ? (amountEur * discount.value) / 100 : discount.value;
  const discountEur = round2(Math.min(brut, amountEur));
  return { discountEur, netEur: round2(amountEur - discountEur) };
}
