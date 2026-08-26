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
  /** Ore marcate explicit ca acoperite de abonament / pachet: nu se factureaza,
   *  dar consuma din creditul lunii */
  includedInPackage?: boolean;
}

export interface Allocation {
  logId: string;
  /** Minute acoperite din orele incluse in abonament */
  includedStandardMinutes: number;
  includedOffHoursMinutes: number;
  /** Minute acoperite din pachetul de ore preplatit */
  packageStandardMinutes: number;
  packageOffHoursMinutes: number;
  /** Minute care raman de facturat */
  billableStandardMinutes: number;
  billableOffHoursMinutes: number;
  /** Cat s-ar factura fara orele incluse */
  grossEur: number;
  /** Cat se factureaza efectiv */
  billableEur: number;
}

export interface MonthAllocation {
  /** Creditul lunii din abonament, in minute */
  includedMinutes: number;
  /** Cat s-a consumat din el (in minute de credit, orele de noapte contand dublu) */
  usedMinutes: number;
  remainingMinutes: number;
  /** Soldul pachetului preplatit la inceputul lunii, in minute */
  packageOpeningMinutes: number;
  /** Ore creditate in luna asta din pachet */
  packageCreditedMinutes: number;
  packageUsedMinutes: number;
  packageClosingMinutes: number;
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
 *   primele sunt oricum gratuite, la celelalte suma a fost deja negociata;
 * - exceptie: orele marcate "incluse in pachet" consuma credit, dar nu se
 *   factureaza niciodata — asa creditul lunii nu ajunge sa acopere de doua ori
 *   aceleasi ore.
 */
export function allocateMonth(
  logs: AllocatableLog[],
  includedMinutes: number,
  packageOpeningMinutes = 0,
  packageCreditedMinutes = 0,
): MonthAllocation {
  const ordonate = [...logs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes,
  );

  let credit = Math.max(0, includedMinutes);
  let pachet = Math.max(0, packageOpeningMinutes + packageCreditedMinutes);
  const allocations = new Map<string, Allocation>();
  let grossEur = 0;
  let billableEur = 0;

  /** Acopera minute dintr-un sold, tinand cont ca orele de noapte consuma dublu */
  const acopera = (minute: number, sold: number, factor: number) => {
    const acoperite = Math.min(minute, Math.floor(sold / factor));
    return { acoperite, ramas: sold - acoperite * factor };
  };

  for (const log of ordonate) {
    // orele declarate incluse au si ele o valoare: intra in "cat s-a acoperit"
    const acoperitManual = log.includedInPackage === true;
    const gross = log.billable || acoperitManual ? log.amountEur : 0;
    grossEur += gross;

    if (!acoperitManual && (!log.billable || log.manualAmount)) {
      allocations.set(log.id, {
        logId: log.id,
        includedStandardMinutes: 0,
        includedOffHoursMinutes: 0,
        packageStandardMinutes: 0,
        packageOffHoursMinutes: 0,
        billableStandardMinutes: log.standardMinutes,
        billableOffHoursMinutes: log.offHoursMinutes,
        grossEur: gross,
        billableEur: gross,
      });
      billableEur += gross;
      continue;
    }

    // 1. orele incluse in abonament
    const incStandard = acopera(log.standardMinutes, credit, 1);
    credit = incStandard.ramas;
    const incOffHours = acopera(log.offHoursMinutes, credit, OFF_HOURS_FACTOR);
    credit = incOffHours.ramas;

    // 2. soldul pachetului preplatit
    const pacStandard = acopera(log.standardMinutes - incStandard.acoperite, pachet, 1);
    pachet = pacStandard.ramas;
    const pacOffHours = acopera(log.offHoursMinutes - incOffHours.acoperite, pachet, OFF_HOURS_FACTOR);
    pachet = pacOffHours.ramas;

    /*
     * 3. ce ramane se factureaza la tarifele inregistrate pe interventie —
     * mai putin orele declarate incluse, care raman gratuite chiar daca au
     * depasit creditul lunii.
     */
    const billableStandard = acoperitManual
      ? 0
      : log.standardMinutes - incStandard.acoperite - pacStandard.acoperite;
    const billableOffHours = acoperitManual
      ? 0
      : log.offHoursMinutes - incOffHours.acoperite - pacOffHours.acoperite;
    const billable = round2(
      (billableStandard / 60) * log.standardRate + (billableOffHours / 60) * log.offHoursRate,
    );

    allocations.set(log.id, {
      logId: log.id,
      includedStandardMinutes: incStandard.acoperite,
      includedOffHoursMinutes: incOffHours.acoperite,
      packageStandardMinutes: pacStandard.acoperite,
      packageOffHoursMinutes: pacOffHours.acoperite,
      billableStandardMinutes: billableStandard,
      billableOffHoursMinutes: billableOffHours,
      grossEur: gross,
      billableEur: billable,
    });
    billableEur += billable;
  }

  const disponibilPachet = Math.max(0, packageOpeningMinutes + packageCreditedMinutes);
  return {
    includedMinutes,
    usedMinutes: Math.max(0, includedMinutes - credit),
    remainingMinutes: credit,
    packageOpeningMinutes,
    packageCreditedMinutes,
    packageUsedMinutes: disponibilPachet - pachet,
    packageClosingMinutes: pachet,
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

/** Cate minute crediteaza pachetele preplatite intr-o luna data */
export function packageMinutesForMonth(
  subscriptions: {
    status: string;
    startDate: string;
    endDate: string | null;
    hourPackage?: { hoursPerMonth: number } | null;
  }[],
  month: string,
): number {
  const primaZi = `${month}-01`;
  const ultimaZi = `${month}-31`;

  return subscriptions
    .filter((sub) => sub.status === 'ACTIVE' && sub.hourPackage)
    .filter((sub) => sub.startDate <= ultimaZi && (!sub.endDate || sub.endDate >= primaZi))
    .reduce((total, sub) => total + (sub.hourPackage?.hoursPerMonth ?? 0) * 60, 0);
}

/** Lista lunilor "YYYY-MM" dintre doua capete, inclusiv */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  let cursor = from;
  let pasi = 0;

  while (cursor <= to && pasi < 240) {
    out.push(cursor);
    pasi += 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    cursor = `${y}-${String(m).padStart(2, '0')}`;
  }
  return out;
}

export interface TimelineSubscription {
  clientId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  includedHoursPerMonth: number;
  hourPackage?: { hoursPerMonth: number } | null;
}

export interface TimelineResult {
  /** Alocarea fiecarei interventii */
  byLog: Map<string, Allocation>;
  /** Situatia fiecarei luni, pe client: cheia e "clientId|YYYY-MM" */
  byClientMonth: Map<string, MonthAllocation>;
}

/**
 * Aloca interventiile mai multor clienti, luna cu luna.
 *
 * Orele incluse in abonament se reseteaza in fiecare luna, dar soldul pachetului
 * preplatit se reporteaza — deci lunile trebuie parcurse in ordine, de la
 * inceputul pachetului, chiar daca in unele nu s-a lucrat nimic.
 */
export function allocateTimeline<T extends AllocatableLog & { clientId: string }>(
  logs: T[],
  subscriptions: TimelineSubscription[],
): TimelineResult {
  const byLog = new Map<string, Allocation>();
  const byClientMonth = new Map<string, MonthAllocation>();

  const clientIds = new Set([...logs.map((l) => l.clientId), ...subscriptions.map((s) => s.clientId)]);

  for (const clientId of clientIds) {
    const aleClientului = logs.filter((l) => l.clientId === clientId);
    const abonamente = subscriptions.filter((s) => s.clientId === clientId);
    const pachete = abonamente.filter((s) => s.hourPackage && s.status === 'ACTIVE');

    const luniCuOre = aleClientului.map((l) => monthOf(l.date));
    const luniPachet = pachete.map((s) => monthOf(s.startDate));
    const toateLunile = [...luniCuOre, ...luniPachet];
    if (toateLunile.length === 0) continue;

    const prima = toateLunile.reduce((a, b) => (a < b ? a : b));
    const ultima = luniCuOre.length ? luniCuOre.reduce((a, b) => (a > b ? a : b)) : prima;

    let soldPachet = 0;
    for (const month of monthsBetween(prima, ultima)) {
      const alocare = allocateMonth(
        aleClientului.filter((l) => monthOf(l.date) === month),
        includedMinutesForMonth(abonamente, month),
        soldPachet,
        packageMinutesForMonth(abonamente, month),
      );
      soldPachet = alocare.packageClosingMinutes;

      byClientMonth.set(`${clientId}|${month}`, alocare);
      for (const [logId, a] of alocare.allocations) byLog.set(logId, a);
    }
  }

  return { byLog, byClientMonth };
}

/** Varianta scurta, cand intereseaza doar alocarea pe interventii */
export function allocateByClientMonth<T extends AllocatableLog & { clientId: string }>(
  logs: T[],
  subscriptions: TimelineSubscription[],
): Map<string, Allocation> {
  return allocateTimeline(logs, subscriptions).byLog;
}
