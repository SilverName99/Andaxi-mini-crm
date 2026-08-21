import express, { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { isoDate, WORK_CATEGORIES, WORK_STATUSES } from '../lib/validation.js';
import { hhMmToMinutes } from '../lib/dates.js';
import { splitWorkInterval, type RateConfig } from '../lib/rates.js';
import { allocateByClientMonth } from '../lib/hours.js';
import { ALLOWED_DOC_TYPES, deleteAttachment, resolveUploadPath, saveAttachment } from '../lib/uploads.js';
import { HttpError } from '../middleware/errors.js';

export const workLogsRouter = Router();

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, 'Ora trebuie sa fie in formatul HH:MM');

const workLogSchema = z.object({
  clientId: z.string().min(1, 'Selecteaza clientul'),
  date: isoDate,
  start: timeString,
  end: timeString,
  description: z.string().default(''),
  category: z.enum(WORK_CATEGORIES).default('SUPORT'),
  /** Eticheta libera pentru gruparea orelor pe lucrari */
  projectTag: z.string().max(60).default(''),
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
    projectTag: input.projectTag.trim(),
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
    const { clientId, status, from, to, category, projectTag } = req.query as Record<string, string | undefined>;
    const logs = await prisma.workLog.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(category && category !== 'ALL' ? { category } : {}),
        ...(projectTag ? { projectTag } : {}),
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: [{ date: 'desc' }, { startMinutes: 'desc' }],
      include: {
        client: { select: { id: true, name: true, company: true, color: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });

    /*
     * Cat se factureaza efectiv depinde de orele incluse in abonament, care se
     * consuma pe luna. Alocarea are nevoie de toate interventiile lunilor
     * atinse, nu doar de cele din filtru, altfel un filtru pe status ar arata
     * alte sume decat fisa lunara.
     */
    const luni = [...new Set(logs.map((l) => l.date.slice(0, 7)))];
    const [toateLunii, subscriptions] = await Promise.all([
      luni.length
        ? prisma.workLog.findMany({
            where: { OR: luni.map((luna) => ({ date: { gte: `${luna}-01`, lte: `${luna}-31` } })) },
          })
        : Promise.resolve([]),
      prisma.subscription.findMany(),
    ]);
    const alocari = allocateByClientMonth(toateLunii, subscriptions);

    res.json(
      logs.map((log) => {
        const a = alocari.get(log.id);
        return {
          ...log,
          billableEur: a?.billableEur ?? log.amountEur,
          includedMinutes: a ? a.includedStandardMinutes + a.includedOffHoursMinutes : 0,
        };
      }),
    );
  }),
);

workLogsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.workLog.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          client: { select: { id: true, name: true, company: true, color: true } },
          attachments: { orderBy: { createdAt: 'asc' } },
        },
      }),
    );
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
    // stergem intai fisierele de pe disc; randurile pleaca odata cu interventia
    const attachments = await prisma.attachment.findMany({ where: { workLogId: req.params.id } });
    await prisma.workLog.delete({ where: { id: req.params.id } });
    for (const attachment of attachments) deleteAttachment(attachment.path);
    res.json({ ok: true });
  }),
);

/* ───────────────────────────────────────────────────────── atasamente ────── */

/**
 * Incarcarea unui atasament. Fisierul vine ca binar brut (nu base64, care ar
 * umfla transferul cu o treime), cu numele in antetul X-File-Name.
 */
workLogsRouter.post(
  '/:id/attachments',
  express.raw({ type: () => true, limit: '12mb' }),
  asyncHandler(async (req, res) => {
    const mimeType = (req.headers['content-type'] ?? '').split(';')[0].trim();
    const numeBrut = req.headers['x-file-name'];
    const fileName = decodeURIComponent(Array.isArray(numeBrut) ? numeBrut[0] : (numeBrut ?? 'fisier')).slice(0, 255);

    if (!(mimeType in ALLOWED_DOC_TYPES)) {
      throw new HttpError(400, 'Acceptam PDF, Word, Excel, text sau imagini');
    }
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'Fisierul lipseste din cerere');

    const log = await prisma.workLog.findUniqueOrThrow({ where: { id: req.params.id } });
    const cate = await prisma.attachment.count({ where: { workLogId: log.id } });

    let salvat: { path: string; size: number };
    try {
      salvat = saveAttachment(req.body, mimeType, Date.now(), cate);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Nu am putut salva fisierul');
    }

    res.status(201).json(
      await prisma.attachment.create({
        data: { workLogId: log.id, fileName, mimeType, size: salvat.size, path: salvat.path },
      }),
    );
  }),
);

/** Descarcarea unui atasament; ruta e in spatele autentificarii, ca si restul API-ului */
workLogsRouter.get(
  '/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: req.params.attachmentId },
    });
    if (attachment.workLogId !== req.params.id) throw new HttpError(404, 'Fisierul nu apartine acestei interventii');

    // filename simplu pentru browsere vechi, filename* pentru diacritice
    const numeAscii = attachment.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${numeAscii}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.sendFile(resolveUploadPath(attachment.path), (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Fisierul nu mai exista pe server' });
    });
  }),
);

workLogsRouter.delete(
  '/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: req.params.attachmentId },
    });
    if (attachment.workLogId !== req.params.id) throw new HttpError(404, 'Fisierul nu apartine acestei interventii');

    await prisma.attachment.delete({ where: { id: attachment.id } });
    deleteAttachment(attachment.path);
    res.json({ ok: true });
  }),
);
