import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { env } from '../env.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { buildMonthlySheet } from '../lib/monthly-sheet.js';
import { includedStorageGb, isPerUserProduct } from '../lib/pricing.js';
import { today } from '../lib/dates.js';
import { resolveUploadPath } from '../lib/uploads.js';
import {
  creeazaLimitator, PORTAL_COOKIE, PORTAL_SESSION_DAYS, signPortalSession, verifyPortalSession,
} from '../lib/portal.js';

export const portalRouter = Router();

/** Maxim 5 PIN-uri gresite la 15 minute, per link */
const limitator = creeazaLimitator();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portal?: { portalId: string; clientId: string };
    }
  }
}

/**
 * Toate rutele de mai jos citesc clientul DIN SESIUNE, niciodata din adresa
 * cererii: altfel un client curios ar schimba un id si ar vedea alt client.
 */
function requirePortal(req: Request, res: Response, next: NextFunction): void {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[PORTAL_COOKIE];
  const sesiune = cookie ? verifyPortalSession(cookie) : null;
  if (!sesiune) {
    res.status(401).json({ error: 'Sesiune expirata. Deschide din nou linkul primit.' });
    return;
  }
  req.portal = sesiune;
  next();
}

async function portalActiv(portalId: string) {
  const portal = await prisma.clientPortal.findUnique({ where: { id: portalId } });
  if (!portal || !portal.enabled) throw new HttpError(403, 'Accesul la portal a fost oprit.');
  return portal;
}

/* ─────────────────────────────────────────────────────────────── intrarea ── */

const sessionSchema = z.object({
  token: z.string().min(10, 'Link invalid'),
  pin: z.string().trim().optional(),
});

portalRouter.post(
  '/session',
  asyncHandler(async (req, res) => {
    const { token, pin } = sessionSchema.parse(req.body);
    const portal = await prisma.clientPortal.findUnique({ where: { token } });

    // acelasi raspuns si daca linkul nu exista, si daca a fost oprit
    if (!portal || !portal.enabled) throw new HttpError(404, 'Linkul nu mai este valid.');

    if (portal.pinHash) {
      if (!pin) {
        res.json({ needsPin: true });
        return;
      }
      const asteptare = limitator.asteptare(portal.id);
      if (asteptare > 0) {
        throw new HttpError(429, `Prea multe incercari. Mai asteapta ${Math.ceil(asteptare / 60)} minute.`);
      }
      if (!(await bcrypt.compare(pin, portal.pinHash))) {
        const { incercariRamase } = limitator.esec(portal.id);
        const cate = incercariRamase === 1 ? 'o incercare' : `${incercariRamase} incercari`;
        throw new HttpError(401, incercariRamase > 0 ? `PIN gresit. Mai ai ${cate}.` : 'PIN gresit.');
      }
      limitator.reset(portal.id);
    }

    await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastSeenAt: new Date().toISOString() },
    });

    res.cookie(PORTAL_COOKIE, signPortalSession({ portalId: portal.id, clientId: portal.clientId }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      maxAge: PORTAL_SESSION_DAYS * 86_400_000,
    });
    res.json({ ok: true });
  }),
);

portalRouter.post('/logout', (_req, res) => {
  res.clearCookie(PORTAL_COOKIE);
  res.json({ ok: true });
});

/* ──────────────────────────────────────────────────────────────── datele ── */

/** Tot ce nu depinde de luna aleasa: cine e clientul, abonamentele, platile */
portalRouter.get(
  '/me',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const clientId = portal.clientId;

    const [client, settings, subscriptions, billing, prima] = await Promise.all([
      prisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { name: true, company: true, cui: true, logoUrl: true, color: true },
      }),
      getSettings(),
      prisma.subscription.findMany({
        where: { clientId, status: { not: 'CANCELLED' } },
        include: { hourPackage: true },
        orderBy: [{ status: 'asc' }, { nextDueDate: 'asc' }],
      }),
      prisma.billingItem.findMany({
        where: { clientId },
        include: { subscription: { select: { label: true, product: true, cycle: true } } },
        orderBy: { dueDate: 'desc' },
        take: 60,
      }),
      prisma.workLog.findFirst({ where: { clientId }, orderBy: { date: 'asc' }, select: { date: true } }),
    ]);

    const bani = portal.showMoney;
    const azi = today();

    res.json({
      client,
      brand: { companyName: settings.companyName, logoUrl: settings.logoUrl },
      flags: { showMoney: bani, showVat: bani && portal.showVat },
      currency: { eurRon: settings.eurRon, vatRate: bani && portal.showVat ? settings.vatRate : null },
      /** Din ce luna are rost sa te uiti inapoi */
      firstMonth: (prima?.date ?? azi).slice(0, 7),
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        label: sub.label,
        kind: sub.kind,
        product: sub.product,
        cycle: sub.cycle,
        status: sub.status,
        users: sub.users,
        includedHoursPerMonth: sub.includedHoursPerMonth,
        packageHours: sub.hourPackage?.hoursPerMonth ?? null,
        nextDueDate: sub.nextDueDate,
        storageUsedGb: sub.storageUsedGb,
        storageIncludedGb:
          isPerUserProduct(sub.product) && sub.users
            ? includedStorageGb(settings, sub.product, sub.users)
            : null,
        amountEur: bani ? sub.amountEur : null,
      })),
      billing: billing.map((item) => ({
        id: item.id,
        label: item.subscription?.label ?? '',
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        dueDate: item.dueDate,
        status: item.status,
        invoiceRef: item.invoiceRef,
        paidAt: item.paidAt,
        /** Ce urmeaza sa vina: estimare, nu factura emisa */
        estimat: item.status === 'PENDING' && item.dueDate > azi,
        amountEur: bani ? item.amountEur : null,
      })),
    });
  }),
);

/** O luna: orele pe zile, ce a intrat in abonament si (optional) sumele */
portalRouter.get(
  '/month',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);

    const fisa = await buildMonthlySheet(portal.clientId, month);
    const bani = portal.showMoney;
    const tva = bani && portal.showVat;

    /*
     * Construim explicit ce pleaca spre client. Un "delete" pe obiectul fisei ar
     * lasa sa scape la prima modificare tarifele si datele firmei din setari.
     */
    res.json({
      month,
      /** Luna care inca nu s-a incheiat e o estimare, nu o factura */
      inCurs: month >= today().slice(0, 7),
      includedFrom: fisa.includedFrom,
      packages: fisa.packages.map((p) => ({
        id: p.id,
        label: p.label,
        packageName: p.packageName,
        hours: p.hours,
      })),
      packageStatement: fisa.packageStatement,
      documents: fisa.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        size: d.size,
        createdAt: d.createdAt,
      })),
      discount: bani && fisa.discount ? { type: fisa.discount.type, value: fisa.discount.value } : null,
      rows: fisa.rows.map((row) => ({
        id: row.id,
        date: row.date,
        entryMode: row.entryMode,
        timeLabel: row.timeLabel,
        description: row.description,
        category: row.category,
        projectTag: row.projectTag,
        includedInPackage: row.includedInPackage,
        billable: row.billable,
        minutes: row.minutes,
        includedMinutes: row.includedMinutes,
        packageMinutes: row.packageMinutes,
        billableMinutes: row.billableMinutes,
        billableEur: bani ? row.billableEur : null,
        grossEur: bani ? row.grossEur : null,
      })),
      totals: {
        minutes: fisa.totals.minutes,
        includedMinutes: fisa.totals.includedMinutes,
        usedIncludedMinutes: fisa.totals.usedIncludedMinutes,
        remainingIncludedMinutes: fisa.totals.remainingIncludedMinutes,
        packageMinutes: fisa.totals.packageMinutes,
        billableMinutes: fisa.totals.billableMinutes,
        coveredEur: bani ? fisa.totals.coveredEur : null,
        billableEur: bani ? fisa.totals.billableEur : null,
        discountEur: bani ? fisa.totals.discountEur : null,
        netEur: bani ? fisa.totals.netEur : null,
        tva: tva ? fisa.totals.tva : null,
        totalCuTva: tva ? fisa.totals.totalCuTva : null,
      },
    });
  }),
);

/** Descarcarea unui document al lunii — doar dintre documentele clientului */
portalRouter.get(
  '/documents/:id',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const document = await prisma.monthlyDocument.findFirst({
      where: { id: req.params.id, clientId: portal.clientId },
    });
    if (!document) throw new HttpError(404, 'Documentul nu a fost gasit.');

    const numeAscii = document.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${numeAscii}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    res.sendFile(resolveUploadPath(document.path), (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Fisierul nu mai exista pe server' });
    });
  }),
);
