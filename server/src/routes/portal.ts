import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { env } from '../env.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { buildMonthlySheet } from '../lib/monthly-sheet.js';
import { includedStorageGb, isPerUserProduct } from '../lib/pricing.js';
import { soldurileClientului } from '../lib/paid-hours.js';
import { ORE_RASPUNS, termenOreDeLucru } from '../lib/working-hours.js';
import { sablonEmail, trimiteEmail } from '../lib/mailer.js';
import { today } from '../lib/dates.js';
import { resolveUploadPath } from '../lib/uploads.js';
import {
  creeazaLimitator, PORTAL_COOKIE, PORTAL_SESSION_DAYS, signPortalSession, verifyPortalSession,
} from '../lib/portal.js';

export const portalRouter = Router();

/** Maxim 5 PIN-uri gresite la 15 minute, per link */
const limitator = creeazaLimitator();

/** Maxim 10 cereri de interventie pe ora, ca portalul sa nu poata fi inundat */
const limitatorCereri = creeazaLimitator(10, 60 * 60_000);

/**
 * Ce vede clientul in portal: cererile trimise de el si discutiile pe care i
 * le-ai deschis tu. Task-urile tale interne raman doar la tine.
 */
const DISCUTII_VIZIBILE = { OR: [{ fromPortal: true }, { sharedWithClient: true }] };

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

    const [client, settings, subscriptions, billing, prima, cereri] = await Promise.all([
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
      prisma.task.findMany({
        where: { clientId, ...DISCUTII_VIZIBILE },
        orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
        take: 30,
        include: { messages: { select: { author: true, readByClient: true } } },
      }),
    ]);

    const bani = portal.showMoney;
    const azi = today();
    const solduri = await soldurileClientului(clientId);

    res.json({
      client,
      brand: { companyName: settings.companyName, logoUrl: settings.logoUrl },
      flags: { showMoney: bani, showVat: bani && portal.showVat, allowRequests: portal.allowRequests },
      currency: { eurRon: settings.eurRon, vatRate: bani && portal.showVat ? settings.vatRate : null },
      /** Programul normal, ca sa se coloreze la fel ceasul zilei */
      program: {
        standardStart: settings.standardStart,
        standardEnd: settings.standardEnd,
        weekendOffHours: settings.weekendOffHours,
      },
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
        /** Ore platite prin abonament si cat a mai ramas din ele */
        paidHours: sub.paidHours,
        paidRemainingMinutes:
          solduri.get(sub.label.trim())?.remainingMinutes ?? Math.round(sub.paidHours * 60),
        nextDueDate: sub.nextDueDate,
        storageUsedGb: sub.storageUsedGb,
        storageIncludedGb:
          isPerUserProduct(sub.product) && sub.users
            ? includedStorageGb(settings, sub.product, sub.users)
            : null,
        amountEur: bani ? sub.amountEur : null,
      })),
      requests: cereri.map((task) => ({
        id: task.id,
        title: task.title,
        details: task.details,
        /** Gol la discutiile deschise de noi: acolo nu exista termen de raspuns */
        kind: task.requestKind,
        /** CLIENT (a cerut-o el) sau ADMIN (i-am deschis-o noi) */
        openedBy: task.fromPortal ? 'CLIENT' : 'ADMIN',
        dueAt: task.dueAt,
        chatClosed: task.chatClosed,
        done: task.done,
        doneAt: task.doneAt,
        createdAt: task.createdAt,
        /** Cate mesaje de la noi n-au fost citite inca */
        unread: task.messages.filter((m) => m.author === 'ADMIN' && !m.readByClient).length,
        messages: task.messages.length,
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
      approval: fisa.approval,
      rows: fisa.rows.map((row) => ({
        id: row.id,
        date: row.date,
        entryMode: row.entryMode,
        timeLabel: row.timeLabel,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
        description: row.description,
        category: row.category,
        projectTag: row.projectTag,
        includedInPackage: row.includedInPackage,
        billable: row.billable,
        /** Ca sa vada ce e deja platit, ce e facturat si ce urmeaza */
        status: row.status,
        minutes: row.minutes,
        paidMinutes: row.paidMinutes,
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

/* ─────────────────────────────────────────── ce poate trimite clientul ── */

const confirmareSchema = z.object({
  confirmedBy: z.string().trim().max(80).default(''),
  note: z.string().trim().max(500).default(''),
});

/**
 * "Am vazut orele lunii si sunt de acord". Pastram si cifrele de atunci, ca sa
 * se vada in CRM daca luna s-a mai schimbat dupa confirmare.
 */
portalRouter.post(
  '/month/:month/confirm',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.month);
    const { confirmedBy, note } = confirmareSchema.parse(req.body);

    const fisa = await buildMonthlySheet(portal.clientId, month);
    if (fisa.rows.length === 0) throw new HttpError(400, 'Luna nu are ore de confirmat.');

    const date = {
      confirmedAt: new Date().toISOString(),
      confirmedBy,
      note,
      minutes: fisa.totals.minutes,
      billableEur: fisa.totals.billableEur,
    };
    const confirmare = await prisma.monthlyApproval.upsert({
      where: { clientId_month: { clientId: portal.clientId, month } },
      create: { clientId: portal.clientId, month, ...date },
      update: date,
    });

    res.json({ ...confirmare, changedSince: false });
  }),
);

portalRouter.delete(
  '/month/:month/confirm',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.month);
    await prisma.monthlyApproval
      .delete({ where: { clientId_month: { clientId: portal.clientId, month } } })
      .catch(() => null); // daca nu exista, nu e nimic de retras
    res.json({ ok: true });
  }),
);

const cerereSchema = z.object({
  title: z.string().trim().min(3, 'Scrie pe scurt ce ai nevoie').max(120),
  details: z.string().trim().max(20000).default(''),
  /** NORMAL = raspuns in 24 de ore de lucru · URGENT = in 12 */
  kind: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
});

/** Cererile clientului devin task-uri in CRM, marcate ca venite din portal */
portalRouter.post(
  '/requests',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    if (!portal.allowRequests) throw new HttpError(403, 'Cererile din portal sunt oprite.');

    const asteptare = limitatorCereri.asteptare(portal.id);
    if (asteptare > 0) throw new HttpError(429, 'Ai trimis prea multe cereri. Incearca mai tarziu.');

    const { title, details, kind } = cerereSchema.parse(req.body);
    const settings = await getSettings();
    const dueAt = termenOreDeLucru(new Date(), ORE_RASPUNS[kind], settings).toISOString();

    const task = await prisma.task.create({
      data: {
        clientId: portal.clientId,
        title,
        details,
        fromPortal: true,
        requestKind: kind,
        dueAt,
        priority: kind === 'URGENT' ? 'HIGH' : 'MEDIUM',
      },
    });
    limitatorCereri.esec(portal.id);

    // anuntam pe email, dar o problema de posta nu trebuie sa strice cererea
    const client = await prisma.client.findUnique({
      where: { id: portal.clientId },
      select: { name: true, company: true, email: true },
    });
    const numeClient = client?.company || client?.name || 'Client';
    const termen = new Date(dueAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });

    void trimiteEmail({
      to: settings.notifyEmail || settings.companyEmail || settings.smtpUser,
      subject: `${kind === 'URGENT' ? '[URGENT] ' : ''}Cerere nouă de la ${numeClient}: ${title}`,
      replyTo: client?.email || undefined,
      text: `${numeClient} a trimis o cerere din portal.\n\n${title}\n\n${details}\n\nTermen de răspuns: ${termen}`,
      html: sablonEmail(`Cerere nouă de la ${numeClient}`, [
        `<strong>${title}</strong>`,
        details || '(fără detalii)',
        `Fel: ${kind === 'URGENT' ? 'Intervenție rapidă — 12 ore de lucru' : 'Intervenție normală — 24 de ore de lucru'}`,
        `Termen de răspuns: <strong>${termen}</strong>`,
      ]),
    });

    res.status(201).json({
      id: task.id,
      title: task.title,
      details: task.details,
      kind,
      openedBy: 'CLIENT',
      dueAt: task.dueAt,
      chatClosed: task.chatClosed,
      done: task.done,
      doneAt: task.doneAt,
      createdAt: task.createdAt,
      unread: 0,
      messages: 0,
    });
  }),
);

/* ─────────────────────────────────────────── discutia pe marginea cererii ── */

/** Cererea, doar daca e a clientului din sesiune */
async function cerereaClientului(clientId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, clientId, ...DISCUTII_VIZIBILE } });
  if (!task) throw new HttpError(404, 'Cererea nu a fost gasita.');
  return task;
}

portalRouter.get(
  '/requests/:id/messages',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const task = await cerereaClientului(portal.clientId, req.params.id);

    const mesaje = await prisma.requestMessage.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
    });
    // ce a scris administratorul a fost acum citit
    await prisma.requestMessage.updateMany({
      where: { taskId: task.id, author: 'ADMIN', readByClient: false },
      data: { readByClient: true },
    });

    res.json({
      id: task.id,
      title: task.title,
      details: task.details,
      kind: task.requestKind,
      openedBy: task.fromPortal ? 'CLIENT' : 'ADMIN',
      dueAt: task.dueAt,
      chatClosed: task.chatClosed,
      done: task.done,
      createdAt: task.createdAt,
      messages: mesaje.map((m) => ({
        id: m.id,
        author: m.author,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt,
      })),
    });
  }),
);

const mesajSchema = z.object({
  body: z.string().trim().min(1, 'Scrie un mesaj').max(20000),
  authorName: z.string().trim().max(80).default(''),
});

portalRouter.post(
  '/requests/:id/messages',
  requirePortal,
  asyncHandler(async (req, res) => {
    const portal = await portalActiv(req.portal!.portalId);
    const task = await cerereaClientului(portal.clientId, req.params.id);
    if (task.chatClosed) throw new HttpError(403, 'Discutia a fost inchisa.');

    const asteptare = limitatorCereri.asteptare(`mesaje-${portal.id}`);
    if (asteptare > 0) throw new HttpError(429, 'Prea multe mesaje trimise. Incearca mai tarziu.');

    const { body, authorName } = mesajSchema.parse(req.body);
    const mesaj = await prisma.requestMessage.create({
      data: { taskId: task.id, author: 'CLIENT', authorName, body, readByClient: true },
    });
    limitatorCereri.esec(`mesaje-${portal.id}`);

    const [settings, client] = await Promise.all([
      getSettings(),
      prisma.client.findUnique({
        where: { id: portal.clientId },
        select: { name: true, company: true, email: true },
      }),
    ]);
    const numeClient = client?.company || client?.name || 'Client';

    void trimiteEmail({
      to: settings.notifyEmail || settings.companyEmail || settings.smtpUser,
      subject: `Mesaj nou de la ${numeClient}: ${task.title}`,
      replyTo: client?.email || undefined,
      text: `${authorName || numeClient} a scris pe cererea „${task.title}":\n\n${body}`,
      html: sablonEmail(`Mesaj nou de la ${numeClient}`, [`<strong>${task.title}</strong>`, body]),
    });

    res.status(201).json({
      id: mesaj.id,
      author: mesaj.author,
      authorName: mesaj.authorName,
      body: mesaj.body,
      createdAt: mesaj.createdAt,
    });
  }),
);
