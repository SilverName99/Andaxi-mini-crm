import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { isoDate, WORK_CATEGORIES, WORK_STATUSES } from '../lib/validation.js';
import { hhMmToMinutes } from '../lib/dates.js';
import { splitWorkInterval, type RateConfig } from '../lib/rates.js';

export const workLogsRouter = Router();

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, 'Ora trebuie sa fie in formatul HH:MM');

const workLogSchema = z.object({
  clientId: z.string().min(1, 'Selecteaza clientul'),
  date: isoDate,
  start: timeString,
  end: timeString,
  description: z.string().default(''),
  category: z.enum(WORK_CATEGORIES).default('SUPORT'),
  billable: z.boolean().default(true),
  /** Suma impusa manual (EUR); daca lipseste, se calculeaza din tarife */
  amountEur: z.coerce.number().nonnegative().nullable().optional(),
  invoiceRef: z.string().default(''),
});

async function rateConfig(): Promise<RateConfig> {
  const s = await getSettings();
  return {
    standardRate: s.standardRate,
    offHoursRate: s.offHoursRate,
    standardStart: s.standardStart,
    standardEnd: s.standardEnd,
    weekendOffHours: s.weekendOffHours,
  };
}

function buildData(input: z.infer<typeof workLogSchema>, config: RateConfig) {
  const startMinutes = hhMmToMinutes(input.start);
  const endMinutes = hhMmToMinutes(input.end);
  const split = splitWorkInterval(input.date, startMinutes, endMinutes, config);
  const manualAmount = input.amountEur !== null && input.amountEur !== undefined;
  return {
    clientId: input.clientId,
    date: input.date,
    startMinutes,
    endMinutes,
    description: input.description,
    category: input.category,
    standardMinutes: split.standardMinutes,
    offHoursMinutes: split.offHoursMinutes,
    standardRate: config.standardRate,
    offHoursRate: config.offHoursRate,
    amountEur: manualAmount ? input.amountEur! : split.amountEur,
    manualAmount,
    billable: input.billable,
    status: input.billable ? 'PENDING' : 'NONBILLABLE',
    invoiceRef: input.invoiceRef,
  };
}

workLogsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, status, from, to, category } = req.query as Record<string, string | undefined>;
    const logs = await prisma.workLog.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(category && category !== 'ALL' ? { category } : {}),
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: [{ date: 'desc' }, { startMinutes: 'desc' }],
      include: { client: { select: { id: true, name: true, company: true, color: true } } },
    });
    res.json(logs);
  }),
);

/** Estimare live pentru formular: cat costa intervalul, inainte de salvare */
workLogsRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const { date, start, end } = z
      .object({ date: isoDate, start: timeString, end: timeString })
      .parse(req.body);
    const config = await rateConfig();
    res.json(splitWorkInterval(date, hhMmToMinutes(start), hhMmToMinutes(end), config));
  }),
);

workLogsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = workLogSchema.parse(req.body);
    const data = buildData(input, await rateConfig());
    res.status(201).json(await prisma.workLog.create({ data }));
  }),
);

workLogsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = workLogSchema.parse(req.body);
    const current = await prisma.workLog.findUniqueOrThrow({ where: { id: req.params.id } });
    const data = buildData(input, await rateConfig());
    // Statusul de facturare setat manual (INVOICED/PAID) nu se pierde la editare
    const keepStatus = current.status === 'INVOICED' || current.status === 'PAID';
    res.json(
      await prisma.workLog.update({
        where: { id: req.params.id },
        data: keepStatus && input.billable ? { ...data, status: current.status } : data,
      }),
    );
  }),
);

workLogsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status, invoiceRef } = z
      .object({ status: z.enum(WORK_STATUSES), invoiceRef: z.string().optional() })
      .parse(req.body);
    res.json(
      await prisma.workLog.update({
        where: { id: req.params.id },
        data: { status, ...(invoiceRef !== undefined ? { invoiceRef } : {}) },
      }),
    );
  }),
);

workLogsRouter.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { ids, status, invoiceRef } = z
      .object({
        ids: z.array(z.string()).min(1),
        status: z.enum(WORK_STATUSES),
        invoiceRef: z.string().optional(),
      })
      .parse(req.body);
    const result = await prisma.workLog.updateMany({
      where: { id: { in: ids } },
      data: { status, ...(invoiceRef ? { invoiceRef } : {}) },
    });
    res.json({ updated: result.count });
  }),
);

workLogsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.workLog.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
