import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { isoDate, CYCLES, PRODUCTS, SUBSCRIPTION_KINDS, SUBSCRIPTION_STATUSES } from '../lib/validation.js';
import { syncBillingItems } from '../lib/billing-sync.js';
import { computeSubscriptionPrice, isPerUserProduct } from '../lib/pricing.js';
import { isCycle } from '../lib/cycles.js';

export const subscriptionsRouter = Router();

const subscriptionSchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1, 'Denumirea este obligatorie'),
  kind: z.enum(SUBSCRIPTION_KINDS).default('HOSTING_MENTENANTA'),
  product: z.enum(PRODUCTS).default('PREZENTARE'),
  amountEur: z.coerce.number().positive('Suma trebuie sa fie mai mare ca 0').optional(),
  /// Pentru ERP/CRM: numarul de utilizatori, din care se calculeaza suma
  users: z.coerce.number().int().positive('Numarul de utilizatori trebuie sa fie cel putin 1').nullable().optional(),
  cycle: z.enum(CYCLES).default('MONTHLY'),
  /// Ore de interventie incluse in fiecare luna
  includedHoursPerMonth: z.coerce.number().min(0).max(200).default(0),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).default('ACTIVE'),
  notes: z.string().default(''),
});

/**
 * Pentru ERP si CRM pretul se calculeaza pe server din numarul de utilizatori,
 * ca sa nu depinda de ce trimite interfata. Daca produsul nu e pe utilizatori
 * (sau s-a ales pret negociat manual), ramane suma introdusa.
 */
async function rezolvaSuma(input: {
  product: string;
  cycle: string;
  users?: number | null;
  amountEur?: number;
}): Promise<{ amountEur: number; users: number | null }> {
  if (isPerUserProduct(input.product) && input.users && isCycle(input.cycle)) {
    const settings = await getSettings();
    const pret = computeSubscriptionPrice(settings, input.product, input.cycle, input.users);
    return { amountEur: pret.amountEur, users: input.users };
  }
  if (!input.amountEur) {
    throw new HttpError(400, 'Completeaza suma sau numarul de utilizatori');
  }
  return { amountEur: input.amountEur, users: null };
}

/** Calcul de preview pentru formular: cat costa X utilizatori pe ciclul ales */
subscriptionsRouter.post(
  '/price',
  asyncHandler(async (req, res) => {
    const { product, cycle, users } = z
      .object({
        product: z.enum(PRODUCTS),
        cycle: z.enum(CYCLES),
        users: z.coerce.number().int().positive(),
      })
      .parse(req.body);

    if (!isPerUserProduct(product)) {
      throw new HttpError(400, 'Produsul acesta nu se factureaza pe utilizatori');
    }
    res.json(computeSubscriptionPrice(await getSettings(), product, cycle, users));
  }),
);

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
    const { amountEur, users } = await rezolvaSuma(data);
    const created = await prisma.subscription.create({
      data: { ...data, amountEur, users, endDate: data.endDate ?? null, nextDueDate: data.startDate },
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
    const { amountEur, users } = await rezolvaSuma({
      product: data.product ?? current.product,
      cycle: data.cycle ?? current.cycle,
      users: data.users === undefined ? current.users : data.users,
      amountEur: data.amountEur ?? current.amountEur,
    });
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        ...data,
        amountEur,
        users,
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
