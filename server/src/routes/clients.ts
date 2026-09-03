import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { CLIENT_STATUSES, COLORS } from '../lib/validation.js';
import { ALLOWED_IMAGE_TYPES, deleteUpload, saveImage } from '../lib/uploads.js';
import { genereazaPin, genereazaToken } from '../lib/portal.js';
import { soldurileClientului } from '../lib/paid-hours.js';
import { includedStorageGb, isPerUserProduct } from '../lib/pricing.js';
import { getSettings } from '../prisma.js';
import { allocateTimeline, monthOf } from '../lib/hours.js';
import { endOfMonth, today } from '../lib/dates.js';
import { round2 } from '../lib/rates.js';
import { applyDiscount, type DiscountType } from '../lib/discount.js';

export const clientsRouter = Router();

const clientSchema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu'),
  company: z.string().default(''),
  cui: z.string().default(''),
  regCom: z.string().default(''),
  email: z.string().email('Email invalid').or(z.literal('')).default(''),
  phone: z.string().default(''),
  contact: z.string().default(''),
  website: z.string().default(''),
  address: z.string().default(''),
  city: z.string().default(''),
  county: z.string().default(''),
  country: z.string().default('Romania'),
  status: z.enum(CLIENT_STATUSES).default('ACTIVE'),
  color: z.enum(COLORS).default('violet'),
  notes: z.string().default(''),
});

clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, q } = req.query as { status?: string; q?: string };
    const clients = await prisma.client.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { company: { contains: q } },
                { email: { contains: q } },
                { cui: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        subscriptions: { where: { status: 'ACTIVE' }, select: { id: true, amountEur: true, cycle: true } },
        _count: { select: { workLogs: true, subscriptions: true } },
      },
    });
    res.json(clients);
  }),
);

/**
 * Cifrele din capul fisei: se calculeaza pe tot istoricul, nu pe primele 100 de
 * interventii trimise spre afisare, si tin cont de orele acoperite din
 * abonament si de reducerile lunare — altfel "de facturat" iese mai mare decat
 * ce ai de incasat cu adevarat.
 */
async function statisticiClient(clientId: string) {
  const [logs, abonamente, pozitii, reduceri] = await Promise.all([
    prisma.workLog.findMany({
      where: { clientId },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
    }),
    prisma.subscription.findMany({ where: { clientId }, include: { hourPackage: true } }),
    /*
     * Doar pozitiile ajunse la rand: scadentarul genereaza reinnoirile cu doua
     * luni inainte, dar un abonament scadent in noiembrie nu e "de facturat"
     * inca din septembrie.
     */
    prisma.billingItem.findMany({
      where: { clientId, status: 'PENDING', dueDate: { lte: endOfMonth(today()) } },
    }),
    prisma.monthlyDiscount.findMany({ where: { clientId } }),
  ]);

  const { byLog } = allocateTimeline(logs, abonamente);

  // orele nefacturate inca, grupate pe luni, ca sa putem scadea reducerea lunii
  const peLuni = new Map<string, number>();
  for (const log of logs) {
    if (log.status !== 'PENDING') continue;
    const alocare = byLog.get(log.id);
    const suma = alocare ? alocare.billableEur : log.billable ? log.amountEur : 0;
    const luna = monthOf(log.date);
    peLuni.set(luna, (peLuni.get(luna) ?? 0) + suma);
  }

  let oreEur = 0;
  let reducereEur = 0;
  for (const [luna, suma] of peLuni) {
    const reducere = reduceri.find((r) => r.month === luna);
    const { netEur, discountEur } = applyDiscount(
      suma,
      reducere ? { type: reducere.type as DiscountType, value: reducere.value } : null,
    );
    oreEur += netEur;
    reducereEur += discountEur;
  }

  const abonamenteEur = pozitii.reduce((total, p) => total + p.amountEur, 0);

  return {
    workLogCount: logs.length,
    minutes: logs.reduce((total, l) => total + l.standardMinutes + l.offHoursMinutes, 0),
    /** Pozitiile de abonament inca nefacturate */
    unbilledSubscriptionsEur: round2(abonamenteEur),
    /** Orele nefacturate, dupa acoperirea din abonament si dupa reducerile lunare */
    unbilledHoursEur: round2(oreEur),
    /** Cat s-a scazut din reducerile lunare */
    discountEur: round2(reducereEur),
    unbilledEur: round2(abonamenteEur + oreEur),
  };
}

clientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { hourPackage: true, _count: { select: { documents: true } } },
        },
        workLogs: {
          orderBy: [{ date: 'desc' }, { startMinutes: 'desc' }],
          // lista se pagineaza in interfata; plafonul e doar ca sa nu trimitem
          // un raspuns urias la un client cu ani de istoric
          take: 500,
          include: { attachments: { orderBy: { createdAt: 'asc' } } },
        },
        billingItems: {
          // istoricul ramane intreg; din cele nefacturate aratam doar pe cele
          // ajunse la scadenta in luna curenta sau mai devreme
          where: {
            OR: [{ status: { not: 'PENDING' } }, { dueDate: { lte: endOfMonth(today()) } }],
          },
          orderBy: { dueDate: 'desc' },
          take: 100,
          include: { subscription: true },
        },
        tasks: { orderBy: [{ done: 'asc' }, { dueDate: 'asc' }] },
      },
    });

    const [solduri, settings, stats] = await Promise.all([
      soldurileClientului(client.id),
      getSettings(),
      statisticiClient(client.id),
    ]);
    res.json({
      ...client,
      stats,
      subscriptions: client.subscriptions.map((sub) => {
        const sold = solduri.get(sub.label.trim());
        return {
          ...sub,
          paidUsedMinutes: sold?.usedMinutes ?? 0,
          paidRemainingMinutes: sold?.remainingMinutes ?? Math.round(sub.paidHours * 60),
          storageIncludedGb:
            isPerUserProduct(sub.product) && sub.users
              ? includedStorageGb(settings, sub.product, sub.users)
              : null,
        };
      }),
    });
  }),
);

clientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = clientSchema.parse(req.body);
    res.status(201).json(await prisma.client.create({ data }));
  }),
);

clientsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = clientSchema.partial().parse(req.body);
    res.json(await prisma.client.update({ where: { id: req.params.id }, data }));
  }),
);

clientsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.client.delete({ where: { id: client.id } });
    if (client.logoUrl) deleteUpload(client.logoUrl);
    res.json({ ok: true });
  }),
);

/* ────────────────────────────────────────────────────────── sigla clientului ── */

const logoSchema = z.object({
  /** Continutul fisierului, codificat base64 (fara prefixul "data:") */
  data: z.string().min(1, 'Fisierul este gol'),
  mimeType: z.string().refine((t) => t in ALLOWED_IMAGE_TYPES, {
    message: 'Acceptam doar PNG, JPG, WEBP sau SVG',
  }),
});

clientsRouter.post(
  '/:id/logo',
  asyncHandler(async (req, res) => {
    const { data, mimeType } = logoSchema.parse(req.body);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });

    let logoUrl: string;
    try {
      // id-ul e generat de noi (cuid), dar il curatam oricum inainte sa ajunga in nume de fisier
      logoUrl = saveImage(data, mimeType, `client-${client.id.replace(/[^a-zA-Z0-9]/g, '')}`, Date.now());
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Nu am putut salva imaginea');
    }

    // sigla veche dispare abia dupa ce noua a fost scrisa cu succes
    if (client.logoUrl) deleteUpload(client.logoUrl);
    res.json(await prisma.client.update({ where: { id: client.id }, data: { logoUrl } }));
  }),
);

clientsRouter.delete(
  '/:id/logo',
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });
    if (client.logoUrl) deleteUpload(client.logoUrl);
    res.json(await prisma.client.update({ where: { id: client.id }, data: { logoUrl: '' } }));
  }),
);

/* ───────────────────────────────────────────────────── portalul clientului ── */

/** Ce vede administratorul despre portal (tokenul e inclus: linkul trebuie recopiat oricand) */
function portalPublic(portal: {
  token: string;
  pinHash: string;
  pin: string;
  enabled: boolean;
  showMoney: boolean;
  showVat: boolean;
  allowRequests: boolean;
  lastSeenAt: string | null;
  updatedAt: Date;
}) {
  return {
    token: portal.token,
    hasPin: Boolean(portal.pinHash),
    /** PIN-ul in clar, ca sa-l poti reciti; pleaca doar catre interfata ta */
    pin: portal.pin,
    enabled: portal.enabled,
    showMoney: portal.showMoney,
    showVat: portal.showVat,
    allowRequests: portal.allowRequests,
    lastSeenAt: portal.lastSeenAt,
    updatedAt: portal.updatedAt,
  };
}

clientsRouter.get(
  '/:id/portal',
  asyncHandler(async (req, res) => {
    const portal = await prisma.clientPortal.findUnique({ where: { clientId: req.params.id } });
    res.json(portal ? portalPublic(portal) : null);
  }),
);

const portalSetariSchema = z.object({
  enabled: z.boolean().optional(),
  showMoney: z.boolean().optional(),
  showVat: z.boolean().optional(),
  allowRequests: z.boolean().optional(),
  /** true = generam si un PIN de 6 cifre, care se arata o singura data */
  withPin: z.boolean().optional(),
});

/** Porneste portalul sau ii schimba linkul (cel vechi devine inutilizabil) */
clientsRouter.post(
  '/:id/portal',
  asyncHandler(async (req, res) => {
    const { withPin, ...setari } = portalSetariSchema.parse(req.body);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });

    const pin = withPin ? genereazaPin() : null;
    const date = {
      token: genereazaToken(),
      enabled: true,
      ...setari,
      // withPin spus explicit decide si stergerea: "doar link" inseamna fara PIN
      ...(withPin === undefined
        ? {}
        : { pinHash: pin ? await bcrypt.hash(pin, 10) : '', pin: pin ?? '' }),
    };

    const portal = await prisma.clientPortal.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, ...date },
      update: date,
    });
    res.status(201).json(portalPublic(portal));
  }),
);

clientsRouter.put(
  '/:id/portal',
  asyncHandler(async (req, res) => {
    const { withPin: _ignorat, ...setari } = portalSetariSchema.parse(req.body);
    const portal = await prisma.clientPortal.update({
      where: { clientId: req.params.id },
      data: setari,
    });
    res.json(portalPublic(portal));
  }),
);

/** PIN nou (generat sau ales) */
clientsRouter.post(
  '/:id/portal/pin',
  asyncHandler(async (req, res) => {
    const { pin: ales } = z
      .object({ pin: z.string().regex(/^\d{4,8}$/, 'PIN-ul trebuie sa aiba intre 4 si 8 cifre').optional() })
      .parse(req.body);

    const pin = ales ?? genereazaPin();
    const portal = await prisma.clientPortal.update({
      where: { clientId: req.params.id },
      data: { pinHash: await bcrypt.hash(pin, 10), pin },
    });
    res.json(portalPublic(portal));
  }),
);

clientsRouter.delete(
  '/:id/portal/pin',
  asyncHandler(async (req, res) => {
    const portal = await prisma.clientPortal.update({
      where: { clientId: req.params.id },
      data: { pinHash: '', pin: '' },
    });
    res.json(portalPublic(portal));
  }),
);

/** Opreste complet accesul: linkul dispare din baza */
clientsRouter.delete(
  '/:id/portal',
  asyncHandler(async (req, res) => {
    await prisma.clientPortal.delete({ where: { clientId: req.params.id } });
    res.json({ ok: true });
  }),
);
