import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { isoDate, CYCLES, PRODUCTS, SUBSCRIPTION_KINDS, SUBSCRIPTION_STATUSES } from '../lib/validation.js';
import { syncBillingItems } from '../lib/billing-sync.js';

export const subscriptionsRouter = Router();

const subscriptionSchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1, 'Denumirea este obligatorie'),
  kind: z.enum(SUBSCRIPTION_KINDS).default('HOSTING_MENTENANTA'),
  product: z.enum(PRODUCTS).default('PREZENTARE'),
  amountEur: z.coerce.number().positive('Suma trebuie sa fie mai mare ca 0'),
  cycle: z.enum(CYCLES).default('MONTHLY'),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).default('ACTIVE'),
  notes: z.string().default(''),
});

subscriptionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, status } = req.query as { clientId?: string; status?: string };
    await syncBillingItems();
    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { nextDueDate: 'asc' }],
      include: { client: { select: { id: true, name: true, company: true, color: true } } },
    });
    res.json(subscriptions);
  }),
);

subscriptionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = subscriptionSchema.parse(req.body);
    if (data.endDate && data.endDate < data.startDate) {
      throw new HttpError(400, 'Data de final nu poate fi inaintea datei de start');
    }
    const created = await prisma.subscription.create({
      data: { ...data, endDate: data.endDate ?? null, nextDueDate: data.startDate },
    });
    await syncBillingItems();
    res.status(201).json(created);
  }),
);

subscriptionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = subscriptionSchema.partial().parse(req.body);
    const current = await prisma.subscription.findUniqueOrThrow({ where: { id: req.params.id } });
    const startDate = data.startDate ?? current.startDate;
    const endDate = data.endDate === undefined ? current.endDate : data.endDate;
    if (endDate && endDate < startDate) {
      throw new HttpError(400, 'Data de final nu poate fi inaintea datei de start');
    }
    // Daca s-a mutat data de start, resetam seria de facturare de la noua data;
    // pozitiile deja marcate ca facturate raman neatinse.
    const resetSeries = data.startDate && data.startDate !== current.startDate;
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        ...data,
        endDate,
        ...(resetSeries ? { nextDueDate: data.startDate } : {}),
      },
    });
    if (resetSeries) {
      await prisma.billingItem.deleteMany({
        where: { subscriptionId: updated.id, status: 'PENDING' },
      });
    }
    await syncBillingItems();
    res.json(updated);
  }),
);

subscriptionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.subscription.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
