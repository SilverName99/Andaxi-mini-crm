import { round2 } from './rates.js';

/**
 * Cat consuma din orele incluse o ora lucrata in afara programului.
 * Doi, ca pachetul sa ramana neutru ca bani: o ora de noapte costa dublu,
 * deci consuma dublu.
 */
export const OFF_HOURS_FACTOR = 2;

export interface AllocatableLog {
  id: string;
  date: string;
  startMinutes: number;
  standardMinutes: number;
  offHoursMinutes: number;
  standardRate: number;
  offHoursRate: number;
  amountEur: number;
  billable: boolean;
  manualAmount: boolean;
}

export interface Allocation {
  logId: string;
  /** Minute acoperite din orele incluse in abonament */
  includedStandardMinutes: number;
  includedOffHoursMinutes: number;
  /** Minute care raman de facturat */
  billableStandardMinutes: number;
  billableOffHoursMinutes: number;
  /** Cat s-ar factura fara orele incluse */
  grossEur: number;
  /** Cat se factureaza efectiv */
  billableEur: number;
}

export interface MonthAllocation {
  /** Creditul lunii, in minute */
  includedMinutes: number;
  /** Cat s-a consumat din el (in minute de credit, orele de noapte contand dublu) */
  usedMinutes: number;
  remainingMinutes: number;
  grossEur: number;
  billableEur: number;
  coveredEur: number;
  allocations: Map<string, Allocation>;
}

/**
 * Imparte orele unei luni intre ce intra in abonament si ce se factureaza.
 *
 * Reguli:
 * - se consuma cronologic, in ordinea in care s-a lucrat;
 * - in cadrul aceleiasi interventii se acopera intai orele normale (credit 1:1),
 *   apoi cele in afara programului (credit 2:1) — asa clientul primeste cat mai
 *   multe ore acoperite pentru acelasi credit;
 * - interventiile nefacturabile sau cu suma impusa manual nu ating creditul:
 *   primele sunt oricum gratuite, la celelalte suma a fost deja negociata.
 */
export function allocateMonth(logs: AllocatableLog[], includedMinutes: number): MonthAllocation {
  const ordonate = [...logs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes,
  );

  let credit = Math.max(0, includedMinutes);
  const allocations = new Map<string, Allocation>();
  let grossEur = 0;
  let billableEur = 0;

  for (const log of ordonate) {
    const gross = log.billable ? log.amountEur : 0;
    grossEur += gross;

    if (!log.billable || log.manualAmount) {
      allocations.set(log.id, {
        logId: log.id,
        includedStandardMinutes: 0,
        includedOffHoursMinutes: 0,
        billableStandardMinutes: log.standardMinutes,
        billableOffHoursMinutes: log.offHoursMinutes,
        grossEur: gross,
        billableEur: gross,
      });
      billableEur += gross;
      continue;
    }

    const includedStandard = Math.min(log.standardMinutes, credit);
    credit -= includedStandard;

    // orele de noapte consuma dublu, deci creditul acopera jumatate din ele
    const includedOffHours = Math.min(log.offHoursMinutes, Math.floor(credit / OFF_HOURS_FACTOR));
    credit -= includedOffHours * OFF_HOURS_FACTOR;

    const billableStandard = log.standardMinutes - includedStandard;
    const billableOffHours = log.offHoursMinutes - includedOffHours;
    const billable = round2(
      (billableStandard / 60) * log.standardRate + (billableOffHours / 60) * log.offHoursRate,
    );

    allocations.set(log.id, {
      logId: log.id,
      includedStandardMinutes: includedStandard,
      includedOffHoursMinutes: includedOffHours,
      billableStandardMinutes: billableStandard,
      billableOffHoursMinutes: billableOffHours,
      grossEur: gross,
      billableEur: billable,
    });
    billableEur += billable;
  }

  const remaining = credit;
  return {
    includedMinutes,
    usedMinutes: Math.max(0, includedMinutes - remaining),
    remainingMinutes: remaining,
    grossEur: round2(grossEur),
    billableEur: round2(billableEur),
    coveredEur: round2(grossEur - billableEur),
    allocations,
  };
}

/** Luna unei date "2026-07-14" -> "2026-07" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Cate minute include un abonament intr-o luna data.
 * Se numara doar abonamentele active in luna respectiva.
 */
export function includedMinutesForMonth(
  subscriptions: { includedHoursPerMonth: number; status: string; startDate: string; endDate: string | null }[],
  month: string,
): number {
  const primaZi = `${month}-01`;
  const ultimaZi = `${month}-31`;

  return subscriptions
    .filter((sub) => sub.status === 'ACTIVE' && sub.includedHoursPerMonth > 0)
    .filter((sub) => sub.startDate <= ultimaZi && (!sub.endDate || sub.endDate >= primaZi))
    .reduce((total, sub) => total + sub.includedHoursPerMonth * 60, 0);
}

/**
 * Aloca un set de interventii care pot fi de la mai multi clienti si din mai
 * multe luni: orele incluse se numara separat pentru fiecare pereche
 * client + luna, pentru ca asa se consuma si in realitate.
 */
export function allocateByClientMonth<T extends AllocatableLog & { clientId: string }>(
  logs: T[],
  subscriptions: {
    clientId: string;
    includedHoursPerMonth: number;
    status: string;
    startDate: string;
    endDate: string | null;
  }[],
): Map<string, Allocation> {
  const grupuri = new Map<string, T[]>();
  for (const log of logs) {
    const cheie = `${log.clientId}|${monthOf(log.date)}`;
    grupuri.set(cheie, [...(grupuri.get(cheie) ?? []), log]);
  }

  const rezultat = new Map<string, Allocation>();
  for (const [cheie, aleGrupului] of grupuri) {
    const [clientId, month] = cheie.split('|');
    const minute = includedMinutesForMonth(
      subscriptions.filter((sub) => sub.clientId === clientId),
      month,
    );
    for (const [logId, alocare] of allocateMonth(aleGrupului, minute).allocations) {
      rezultat.set(logId, alocare);
    }
  }
  return rezultat;
}
