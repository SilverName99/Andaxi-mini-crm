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
  erpTier1StorageGb: number;
  erpTier2StorageGb: number;
  erpTier3StorageGb: number;
  crmTier1StorageGb: number;
  crmTier2StorageGb: number;
  crmTier3StorageGb: number;
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

/** Spatiul inclus la pragul in care intra numarul de utilizatori, in GB */
export function includedStorageGb(
  settings: PricingSettings,
  product: PerUserProduct,
  users: number,
): number {
  const t = product === 'ERP'
    ? { max1: settings.erpTier1Max, s1: settings.erpTier1StorageGb, max2: settings.erpTier2Max, s2: settings.erpTier2StorageGb, s3: settings.erpTier3StorageGb }
    : { max1: settings.crmTier1Max, s1: settings.crmTier1StorageGb, max2: settings.crmTier2Max, s2: settings.crmTier2StorageGb, s3: settings.crmTier3StorageGb };

  if (users <= t.max1) return t.s1;
  if (users <= t.max2) return t.s2;
  return t.s3;
}

/**
 * Diferenta de facturat cand numarul de utilizatori se schimba in mijlocul unei
 * perioade deja facturate: se proportioneaza cu zilele ramase.
 */
export function prorate(
  previousAmountEur: number,
  newAmountEur: number,
  periodStart: string,
  periodEnd: string,
  effectiveDate: string,
): number {
  const zi = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const total = Math.round((zi(periodEnd) - zi(periodStart)) / 86_400_000) + 1;
  if (total <= 0) return 0;

  const dataAplicarii = effectiveDate < periodStart ? periodStart : effectiveDate;
  if (dataAplicarii > periodEnd) return 0;

  const ramase = Math.round((zi(periodEnd) - zi(dataAplicarii)) / 86_400_000) + 1;
  return round2(((newAmountEur - previousAmountEur) * ramase) / total);
}
