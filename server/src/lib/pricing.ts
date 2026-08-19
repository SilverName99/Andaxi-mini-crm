import { CYCLE_MONTHS, type Cycle } from './cycles.js';
import { round2 } from './rates.js';

/** Produsele pentru care pretul se calculeaza pe numar de utilizatori */
export const PER_USER_PRODUCTS = ['ERP', 'CRM'] as const;
export type PerUserProduct = (typeof PER_USER_PRODUCTS)[number];

export function isPerUserProduct(product: string): product is PerUserProduct {
  return (PER_USER_PRODUCTS as readonly string[]).includes(product);
}

/** Ce ne trebuie din setari ca sa calculam pretul (subsetul relevant) */
export interface PricingSettings {
  erpTier1Max: number;
  erpTier1Price: number;
  erpTier2Max: number;
  erpTier2Price: number;
  erpTier3Price: number;
  crmTier1Max: number;
  crmTier1Price: number;
  crmTier2Max: number;
  crmTier2Price: number;
  crmTier3Price: number;
  discountSemiannual: number;
  discountAnnual: number;
}

export interface PriceBreakdown {
  users: number;
  /** EUR / utilizator / luna, dupa pragul in care intra numarul de utilizatori */
  pricePerUser: number;
  months: number;
  /** Reducerea aplicata pentru ciclul ales, in procente */
  discountPercent: number;
  /** Cat s-ar plati fara reducere */
  fullEur: number;
  /** Suma finala pentru un ciclu complet */
  amountEur: number;
  /** Echivalentul lunar */
  monthlyEur: number;
}

/** Pragul in care intra numarul de utilizatori, pentru produsul dat */
export function pricePerUser(settings: PricingSettings, product: PerUserProduct, users: number): number {
  const t = product === 'ERP'
    ? { max1: settings.erpTier1Max, p1: settings.erpTier1Price, max2: settings.erpTier2Max, p2: settings.erpTier2Price, p3: settings.erpTier3Price }
    : { max1: settings.crmTier1Max, p1: settings.crmTier1Price, max2: settings.crmTier2Max, p2: settings.crmTier2Price, p3: settings.crmTier3Price };

  if (users <= t.max1) return t.p1;
  if (users <= t.max2) return t.p2;
  return t.p3;
}

export function discountFor(settings: PricingSettings, cycle: Cycle): number {
  if (cycle === 'SEMIANNUAL') return settings.discountSemiannual;
  if (cycle === 'ANNUAL') return settings.discountAnnual;
  return 0;
}

/**
 * Pretul unui abonament ERP/CRM: utilizatori × tarif/utilizator × luni,
 * minus reducerea aferenta ciclului de facturare.
 * Ex.: 5 utilizatori, 50 €/luna, anual, -10% → 5 × 50 × 12 × 0,9 = 2.700 €
 */
export function computeSubscriptionPrice(
  settings: PricingSettings,
  product: PerUserProduct,
  cycle: Cycle,
  users: number,
): PriceBreakdown {
  const perUser = pricePerUser(settings, product, users);
  const months = CYCLE_MONTHS[cycle];
  const discountPercent = discountFor(settings, cycle);
  const fullEur = round2(users * perUser * months);
  const amountEur = round2(fullEur * (1 - discountPercent / 100));

  return {
    users,
    pricePerUser: perUser,
    months,
    discountPercent,
    fullEur,
    amountEur,
    monthlyEur: round2(amountEur / months),
  };
}
