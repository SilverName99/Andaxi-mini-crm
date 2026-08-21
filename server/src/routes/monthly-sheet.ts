import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { allocateMonth, includedMinutesForMonth } from '../lib/hours.js';
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
      prisma.workLog.findMany({
        where: { clientId, date: { gte: primaZi, lte: ultimaZi } },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
      }),
      prisma.subscription.findMany({ where: { clientId } }),
      getSettings(),
    ]);

    const includedMinutes = includedMinutesForMonth(subscriptions, month);
    const alocare = allocateMonth(logs, includedMinutes);

    const rows = logs.map((log) => {
      const a = alocare.allocations.get(log.id)!;
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
        billableMinutes: a.billableStandardMinutes + a.billableOffHoursMinutes,
        grossEur: a.grossEur,
        billableEur: a.billableEur,
      };
    });

    const minutes = rows.reduce((s, r) => s + r.minutes, 0);
    const tva = round2((alocare.billableEur * settings.vatRate) / 100);

    res.json({
      month,
      client,
      settings,
      /** Abonamentele care aduc ore incluse in luna asta */
      includedFrom: subscriptions
        .filter((sub) => sub.includedHoursPerMonth > 0 && sub.status === 'ACTIVE')
        .map((sub) => ({ id: sub.id, label: sub.label, hours: sub.includedHoursPerMonth })),
      rows,
      totals: {
        minutes,
        includedMinutes,
        usedIncludedMinutes: alocare.usedMinutes,
        remainingIncludedMinutes: alocare.remainingMinutes,
        billableMinutes: rows.reduce((s, r) => s + r.billableMinutes, 0),
        grossEur: alocare.grossEur,
        coveredEur: alocare.coveredEur,
        billableEur: alocare.billableEur,
        tva,
        totalCuTva: round2(alocare.billableEur + tva),
      },
    });
  }),
);
