import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { isoDate, CYCLES, PRODUCTS, SUBSCRIPTION_KINDS, SUBSCRIPTION_STATUSES } from '../lib/validation.js';
import { syncBillingItems } from '../lib/billing-sync.js';
import { computeSubscriptionPrice, includedStorageGb, isPerUserProduct, prorate } from '../lib/pricing.js';
import { today } from '../lib/dates.js';
import { CYCLE_MONTHS, isCycle } from '../lib/cycles.js';
import { round2 } from '../lib/rates.js';
import { CLIENT_REF } from '../lib/selects.js';
import { soldurilePeClienti } from '../lib/paid-hours.js';

export const subscriptionsRouter = Router();

const subscriptionSchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1, 'Denumirea este obligatorie'),
  kind: z.enum(SUBSCRIPTION_KINDS).default('HOSTING_MENTENANTA'),
  product: z.enum(PRODUCTS).default('PREZENTARE'),
  amountEur: z.coerce.number().positive('Suma trebuie sa fie mai mare ca 0').optional(),
  /// Pentru ERP/CRM: numarul de utilizatori, din care se calculeaza suma
  users: z.coerce.number().int().positive('Numarul de utilizatori trebuie sa fie cel putin 1').nullable().optional(),
  /// Pentru pachetele de ore: care pachet a fost cumparat
  hourPackageId: z.string().nullable().optional(),
  /// Spatiul ocupat efectiv de client (GB), completat manual
  storageUsedGb: z.coerce.number().nonnegative().nullable().optional(),
  /// De cand se aplica noul numar de utilizatori (pentru proratare)
  usersEffectiveDate: isoDate.optional(),
  cycle: z.enum(CYCLES).default('MONTHLY'),
  /// Ore de interventie incluse in fiecare luna
  includedHoursPerMonth: z.coerce.number().min(0).max(200).default(0),
  /** Ore platite prin abonament: rezervor care se consuma o singura data */
  paidHours: z.coerce.number().min(0).max(2000).default(0),
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
  hourPackageId?: string | null;
}): Promise<{ amountEur: number; users: number | null }> {
  // pachetele de ore sunt preplatite: suma e numarul de ore × tariful pachetului
  if (input.hourPackageId && isCycle(input.cycle)) {
    const pachet = await prisma.hourPackage.findUnique({ where: { id: input.hourPackageId } });
    if (!pachet) throw new HttpError(400, 'Pachetul de ore nu exista');
    return {
      amountEur: round2(pachet.hoursPerMonth * pachet.standardRate * CYCLE_MONTHS[input.cycle]),
      users: null,
    };
  }

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
      include: {
        client: { select: CLIENT_REF },
        hourPackage: true,
      },
    });

    const settings = await getSettings();
    const solduri = await soldurilePeClienti([...new Set(subscriptions.map((sub) => sub.clientId))]);

    res.json(
      subscriptions.map((sub) => {
        const sold = solduri.get(sub.clientId)?.get(sub.label.trim());
        return {
          ...sub,
          // spatiul inclus urmeaza pragul de utilizatori, ca si pretul
          storageIncludedGb:
            isPerUserProduct(sub.product) && sub.users
              ? includedStorageGb(settings, sub.product, sub.users)
              : null,
          /** Cat a mai ramas din orele platite prin abonament */
          paidUsedMinutes: sold?.usedMinutes ?? 0,
          paidRemainingMinutes: sold?.remainingMinutes ?? Math.round(sub.paidHours * 60),
        };
      }),
    );
  }),
);

subscriptionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { usersEffectiveDate: _ignorat, ...data } = subscriptionSchema.parse(req.body);
    if (data.endDate && data.endDate < data.startDate) {
      throw new HttpError(400, 'Data de final nu poate fi inaintea datei de start');
    }
    const { amountEur, users } = await rezolvaSuma(data);
    const created = await prisma.subscription.create({
      data: {
        ...data,
        ...(data.storageUsedGb !== undefined && data.storageUsedGb !== null ? { storageUpdatedAt: today() } : {}),
        amountEur,
        users,
        hourPackageId: data.hourPackageId || null,
        endDate: data.endDate ?? null,
        nextDueDate: data.startDate,
      },
    });
    await syncBillingItems();
    res.status(201).json(created);
  }),
);

subscriptionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { usersEffectiveDate, ...data } = subscriptionSchema.partial().parse(req.body);
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
      hourPackageId: data.hourPackageId === undefined ? current.hourPackageId : data.hourPackageId,
    });
    /*
     * Daca se schimba numarul de utilizatori, tinem minte de cand si cat ar
     * trebui prorat pentru perioada deja facturata — altfel diferenta se pierde.
     */
    let schimbare: { previousUsers: number; newUsers: number } | null = null;
    if (data.users !== undefined && data.users !== null && current.users && data.users !== current.users) {
      schimbare = { previousUsers: current.users, newUsers: data.users };
    }

    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        ...data,
        amountEur,
        users,
        ...(data.hourPackageId !== undefined ? { hourPackageId: data.hourPackageId || null } : {}),
        // marcam cand a fost actualizat spatiul, ca sa se vada cat de proaspata e cifra
        ...(data.storageUsedGb !== undefined && data.storageUsedGb !== current.storageUsedGb
          ? { storageUpdatedAt: today() }
          : {}),
        endDate,
        ...(resetSeries ? { nextDueDate: data.startDate } : {}),
      },
    });
    if (schimbare) {
      const effectiveDate = usersEffectiveDate ?? today();
      // pozitia care acopera data modificarii, daca exista deja una generata
      const pozitie = await prisma.billingItem.findFirst({
        where: {
          subscriptionId: updated.id,
          periodStart: { lte: effectiveDate },
          periodEnd: { gte: effectiveDate },
        },
      });

      await prisma.subscriptionUserChange.create({
        data: {
          subscriptionId: updated.id,
          effectiveDate,
          previousUsers: schimbare.previousUsers,
          newUsers: schimbare.newUsers,
          previousAmountEur: current.amountEur,
          newAmountEur: amountEur,
          proratedEur: pozitie
            ? prorate(current.amountEur, amountEur, pozitie.periodStart, pozitie.periodEnd, effectiveDate)
            : 0,
          billingItemId: pozitie?.id ?? null,
        },
      });
    }

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

/* ─────────────────────────────────── istoricul de utilizatori ──────────── */

subscriptionsRouter.get(
  '/:id/user-changes',
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.subscriptionUserChange.findMany({
        where: { subscriptionId: req.params.id },
        orderBy: { effectiveDate: 'desc' },
      }),
    );
  }),
);

/** Adauga diferenta prorata la pozitia din scadentar care acopera modificarea */
subscriptionsRouter.post(
  '/:id/user-changes/:changeId/apply',
  asyncHandler(async (req, res) => {
    const schimbare = await prisma.subscriptionUserChange.findUniqueOrThrow({
      where: { id: req.params.changeId },
    });
    if (schimbare.subscriptionId !== req.params.id) {
      throw new HttpError(404, 'Modificarea nu apartine acestui abonament');
    }
    if (schimbare.applied) throw new HttpError(400, 'Diferenta a fost deja aplicata');
    if (!schimbare.billingItemId || !schimbare.proratedEur) {
      throw new HttpError(400, 'Nu exista o pozitie de facturat peste care sa se aplice diferenta');
    }

    const pozitie = await prisma.billingItem.findUniqueOrThrow({ where: { id: schimbare.billingItemId } });
    if (pozitie.status !== 'PENDING') {
      throw new HttpError(400, 'Pozitia a fost deja facturata; treci diferenta pe factura urmatoare');
    }

    const nota = `Ajustare ${schimbare.previousUsers} → ${schimbare.newUsers} utilizatori de la ${schimbare.effectiveDate}`;
    await prisma.billingItem.update({
      where: { id: pozitie.id },
      data: {
        amountEur: round2(pozitie.amountEur + schimbare.proratedEur),
        notes: pozitie.notes ? `${pozitie.notes} · ${nota}` : nota,
      },
    });
    res.json(
      await prisma.subscriptionUserChange.update({ where: { id: schimbare.id }, data: { applied: true } }),
    );
  }),
);
