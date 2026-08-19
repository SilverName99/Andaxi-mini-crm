import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { syncBillingItems } from '../lib/billing-sync.js';
import { BILLING_STATUSES, isoDate } from '../lib/validation.js';
import { addDays, today } from '../lib/dates.js';

export const billingRouter = Router();

/**
 * Scadentarul: pozitiile generate din abonamente.
 * Filtre: status, clientId, from/to (dupa dueDate), scope=due (doar ce e scadent
 * in urmatoarele `leadDays` zile sau restant).
 */
billingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    await syncBillingItems();
    const { status, clientId, from, to, scope } = req.query as Record<string, string | undefined>;

    let dueFilter: { gte?: string; lte?: string } = {};
    if (from) dueFilter.gte = from;
    if (to) dueFilter.lte = to;
    if (scope === 'due') {
      const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
      dueFilter = { lte: addDays(today(), settings?.billingLeadDays ?? 7) };
    }

    const items = await prisma.billingItem.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(clientId ? { clientId } : {}),
        ...(Object.keys(dueFilter).length ? { dueDate: dueFilter } : {}),
        ...(scope === 'due' ? { status: 'PENDING' } : {}),
      },
      orderBy: [{ dueDate: 'asc' }],
      include: {
        client: { select: { id: true, name: true, company: true, color: true } },
        subscription: { select: { id: true, label: true, kind: true, product: true, cycle: true } },
      },
    });
    res.json(items);
  }),
);

const updateSchema = z.object({
  status: z.enum(BILLING_STATUSES).optional(),
  invoiceRef: z.string().optional(),
  invoicedAt: isoDate.nullable().optional(),
  paidAt: isoDate.nullable().optional(),
  amountEur: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

billingRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    // Marcarea statusului completeaza automat datele, ca sa nu fie de scris manual
    if (data.status === 'INVOICED' && data.invoicedAt === undefined) data.invoicedAt = today();
    if (data.status === 'PAID' && data.paidAt === undefined) data.paidAt = today();
    if (data.status === 'PENDING') {
      data.invoicedAt = null;
      data.paidAt = null;
    }
    res.json(await prisma.billingItem.update({ where: { id: req.params.id }, data }));
  }),
);

/** Marcare in masa (ex. "toate pozitiile scadente au fost facturate in ERP") */
billingRouter.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { ids, status } = z
      .object({ ids: z.array(z.string()).min(1), status: z.enum(BILLING_STATUSES) })
      .parse(req.body);
    const stamp =
      status === 'INVOICED'
        ? { invoicedAt: today() }
        : status === 'PAID'
          ? { paidAt: today() }
          : status === 'PENDING'
            ? { invoicedAt: null, paidAt: null }
            : {};
    const result = await prisma.billingItem.updateMany({
      where: { id: { in: ids } },
      data: { status, ...stamp },
    });
    res.json({ updated: result.count });
  }),
);
