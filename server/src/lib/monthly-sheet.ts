import { getSettings, prisma } from '../prisma.js';
import { allocateTimeline } from './hours.js';
import { minutesToHhMm } from './dates.js';
import { round2 } from './rates.js';
import { applyDiscount, type DiscountType } from './discount.js';
import { CLIENT_REF } from './selects.js';

/**
 * Fisa lunara a unui client: fiecare lucrare din luna, cu orele ei si cu ce
 * s-a acoperit din abonament. Inlocuieste tabelul tinut pana acum in Excel.
 *
 * Sta intr-o biblioteca pentru ca o folosesc doua rute: fisa din CRM si
 * portalul clientului — care trebuie sa arate exact aceleasi cifre.
 */
export async function buildMonthlySheet(clientId: string, month: string) {
  const primaZi = `${month}-01`;
  const ultimaZi = `${month}-31`;

  const [client, logs, subscriptions, settings] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { ...CLIENT_REF, cui: true },
    }),
    // luam tot istoricul clientului: soldul pachetului se reporteaza, deci
    // luna curenta depinde de ce s-a consumat inainte
    prisma.workLog.findMany({
      where: { clientId, date: { lte: ultimaZi } },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
    }),
    prisma.subscription.findMany({ where: { clientId }, include: { hourPackage: true } }),
    getSettings(),
  ]);
  const [documents, discount] = await Promise.all([
    prisma.monthlyDocument.findMany({ where: { clientId, month }, orderBy: { createdAt: 'asc' } }),
    prisma.monthlyDiscount.findUnique({ where: { clientId_month: { clientId, month } } }),
  ]);

  const { byClientMonth, byLog } = allocateTimeline(logs, subscriptions);
  const alocare = byClientMonth.get(`${clientId}|${month}`);
  const logsLuna = logs.filter((log) => log.date.startsWith(month));

  const rows = logsLuna.map((log) => {
    const a = byLog.get(log.id)!;
    return {
      id: log.id,
      date: log.date,
      entryMode: log.entryMode,
      timeLabel:
        log.entryMode === 'DURATION' ? '' : `${minutesToHhMm(log.startMinutes)}–${minutesToHhMm(log.endMinutes)}`,
      description: log.description,
      category: log.category,
      projectTag: log.projectTag,
      status: log.status,
      billable: log.billable,
      includedInPackage: log.includedInPackage,
      manualAmount: log.manualAmount,
      minutes: log.standardMinutes + log.offHoursMinutes,
      standardMinutes: log.standardMinutes,
      offHoursMinutes: log.offHoursMinutes,
      standardRate: log.standardRate,
      offHoursRate: log.offHoursRate,
      includedMinutes: a.includedStandardMinutes + a.includedOffHoursMinutes,
      packageMinutes: a.packageStandardMinutes + a.packageOffHoursMinutes,
      billableMinutes: a.billableStandardMinutes + a.billableOffHoursMinutes,
      grossEur: a.grossEur,
      billableEur: a.billableEur,
    };
  });

  const minutes = rows.reduce((s, r) => s + r.minutes, 0);
  const billableEur = alocare?.billableEur ?? 0;

  // reducerea se scade inaintea TVA-ului, ca pe factura
  const { discountEur, netEur } = applyDiscount(
    billableEur,
    discount ? { type: discount.type as DiscountType, value: discount.value } : null,
  );
  const tva = round2((netEur * settings.vatRate) / 100);

  return {
    month,
    client,
    settings,
    /** Abonamentele care aduc ore incluse in luna asta */
    includedFrom: subscriptions
      .filter((sub) => sub.includedHoursPerMonth > 0 && sub.status === 'ACTIVE')
      .map((sub) => ({ id: sub.id, label: sub.label, hours: sub.includedHoursPerMonth })),
    /** Pachetele de ore preplatite ale clientului */
    packages: subscriptions
      .filter((sub) => sub.hourPackage && sub.status === 'ACTIVE')
      .map((sub) => ({
        id: sub.id,
        label: sub.label,
        packageName: sub.hourPackage!.name,
        hours: sub.hourPackage!.hoursPerMonth,
        standardRate: sub.hourPackage!.standardRate,
        offHoursRate: sub.hourPackage!.offHoursRate,
      })),
    /** Extrasul pachetului pentru luna afisata */
    packageStatement: {
      openingMinutes: alocare?.packageOpeningMinutes ?? 0,
      creditedMinutes: alocare?.packageCreditedMinutes ?? 0,
      usedMinutes: alocare?.packageUsedMinutes ?? 0,
      closingMinutes: alocare?.packageClosingMinutes ?? 0,
    },
    documents,
    discount,
    rows,
    totals: {
      minutes,
      includedMinutes: alocare?.includedMinutes ?? 0,
      usedIncludedMinutes: alocare?.usedMinutes ?? 0,
      remainingIncludedMinutes: alocare?.remainingMinutes ?? 0,
      packageMinutes: rows.reduce((s, r) => s + r.packageMinutes, 0),
      billableMinutes: rows.reduce((s, r) => s + r.billableMinutes, 0),
      grossEur: alocare?.grossEur ?? 0,
      coveredEur: alocare?.coveredEur ?? 0,
      billableEur,
      discountEur,
      netEur,
      tva,
      totalCuTva: round2(netEur + tva),
    },
  };
}

export type MonthlySheet = Awaited<ReturnType<typeof buildMonthlySheet>>;
