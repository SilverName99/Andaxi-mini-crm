import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { allocateTimeline } from '../lib/hours.js';
import { minutesToHhMm } from '../lib/dates.js';
import { round2 } from '../lib/rates.js';

export const monthlySheetRouter = Router();

/**
 * Fisa lunara a unui client: fiecare lucrare din luna, cu orele ei si cu ce
 * s-a acoperit din abonament. Inlocuieste tabelul tinut pana acum in Excel.
 */
monthlySheetRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = z
      .object({ clientId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(req.query);

    const primaZi = `${month}-01`;
    const ultimaZi = `${month}-31`;

    const [client, logs, subscriptions, settings] = await Promise.all([
      prisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { id: true, name: true, company: true, cui: true, color: true },
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

    const { byClientMonth, byLog } = allocateTimeline(logs, subscriptions);
    const alocare = byClientMonth.get(`${clientId}|${month}`);
    const logsLuna = logs.filter((log) => log.date.startsWith(month));

    const rows = logsLuna.map((log) => {
      const a = byLog.get(log.id)!;
      return {
        id: log.id,
        date: log.date,
        timeLabel: `${minutesToHhMm(log.startMinutes)}–${minutesToHhMm(log.endMinutes)}`,
        description: log.description,
        category: log.category,
        projectTag: log.projectTag,
        status: log.status,
        billable: log.billable,
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
    const tva = round2((billableEur * settings.vatRate) / 100);

    res.json({
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
        tva,
        totalCuTva: round2(billableEur + tva),
      },
    });
  }),
);
