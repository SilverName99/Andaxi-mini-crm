import express, { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { isoDate, WORK_CATEGORIES, WORK_STATUSES } from '../lib/validation.js';
import { hhMmToMinutes } from '../lib/dates.js';
import { round2, splitWorkInterval, type RateConfig } from '../lib/rates.js';
import { allocateByClientMonth } from '../lib/hours.js';
import { ALLOWED_DOC_TYPES, deleteAttachment, resolveUploadPath, saveAttachment } from '../lib/uploads.js';
import { normalizeaza, parseCsv, parseData, parseNumar } from '../lib/csv.js';
import { HttpError } from '../middleware/errors.js';
import { CLIENT_REF } from '../lib/selects.js';

export const workLogsRouter = Router();

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, 'Ora trebuie sa fie in formatul HH:MM');

const workLogSchema = z.object({
  clientId: z.string().min(1, 'Selecteaza clientul'),
  date: isoDate,
  /** Fie interval (de la ora X la Y)… */
  start: timeString.optional(),
  end: timeString.optional(),
  /** …fie doar durata, pentru munca notata in ore (dezvoltare, lucrari lungi) */
  hours: z.coerce.number().positive('Numarul de ore trebuie sa fie mai mare ca 0').max(24).optional(),
  /** La intrarile pe durata: daca orele sunt in program normal sau in afara lui */
  rateType: z.enum(['STANDARD', 'OFF_HOURS']).default('STANDARD'),
  description: z.string().default(''),
  category: z.enum(WORK_CATEGORIES).default('SUPORT'),
  /** Eticheta libera pentru gruparea orelor pe lucrari */
  projectTag: z.string().max(60).default(''),
  billable: z.boolean().default(true),
  /** Ore acoperite de abonament / pachet: nu se factureaza, dar consuma credit */
  includedInPackage: z.boolean().default(false),
  /** Suma impusa manual (EUR); daca lipseste, se calculeaza din tarife */
  amountEur: z.coerce.number().nonnegative().nullable().optional(),
  invoiceRef: z.string().default(''),
}).refine((d) => (d.start && d.end) || d.hours, {
  message: 'Completeaza fie intervalul orar, fie numarul de ore',
  path: ['hours'],
});

/**
 * Tarifele aplicabile unui client: cele ale pachetului de ore, daca are unul
 * activ, altfel cele globale. Programul normal ramane cel din setari.
 */
async function rateConfig(clientId?: string): Promise<RateConfig> {
  const s = await getSettings();
  const abonamentPachet = clientId
    ? await prisma.subscription.findFirst({
        where: { clientId, status: 'ACTIVE', hourPackageId: { not: null } },
        include: { hourPackage: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  return {
    standardRate: abonamentPachet?.hourPackage?.standardRate ?? s.standardRate,
    offHoursRate: abonamentPachet?.hourPackage?.offHoursRate ?? s.offHoursRate,
    standardStart: s.standardStart,
    standardEnd: s.standardEnd,
    weekendOffHours: s.weekendOffHours,
  };
}

function buildData(input: z.infer<typeof workLogSchema>, config: RateConfig) {
  /*
   * Doua feluri de a nota munca: interval orar (si atunci impartirea intre
   * tariful normal si cel majorat se face automat) sau doar numarul de ore,
   * cu tariful ales explicit — asa se noteaza lucrarile de dezvoltare.
   */
  const peDurata = !input.start || !input.end;
  const minute = peDurata ? Math.round((input.hours ?? 0) * 60) : 0;

  const split = peDurata
    ? {
        standardMinutes: input.rateType === 'STANDARD' ? minute : 0,
        offHoursMinutes: input.rateType === 'STANDARD' ? 0 : minute,
        amountEur: round2(
          (minute / 60) * (input.rateType === 'STANDARD' ? config.standardRate : config.offHoursRate),
        ),
      }
    : splitWorkInterval(input.date, hhMmToMinutes(input.start!), hhMmToMinutes(input.end!), config);

  const startMinutes = peDurata ? 0 : hhMmToMinutes(input.start!);
  const endMinutes = peDurata ? 0 : hhMmToMinutes(input.end!);
  const manualAmount = input.amountEur !== null && input.amountEur !== undefined;
  return {
    clientId: input.clientId,
    date: input.date,
    entryMode: peDurata ? 'DURATION' : 'INTERVAL',
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
    // orele declarate incluse nu se factureaza niciodata, oricum ar fi trimisa bifa
    billable: input.includedInPackage ? false : input.billable,
    includedInPackage: input.includedInPackage,
    status: !input.includedInPackage && input.billable ? 'PENDING' : 'NONBILLABLE',
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
        client: { select: CLIENT_REF },
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
      prisma.subscription.findMany({ include: { hourPackage: true } }),
    ]);
    const alocari = allocateByClientMonth(toateLunii, subscriptions);

    res.json(
      logs.map((log) => {
        const a = alocari.get(log.id);
        return {
          ...log,
          billableEur: a?.billableEur ?? log.amountEur,
          includedMinutes: a ? a.includedStandardMinutes + a.includedOffHoursMinutes : 0,
          packageMinutes: a ? a.packageStandardMinutes + a.packageOffHoursMinutes : 0,
        };
      }),
    );
  }),
);

/* ────────────────────────────────────────────── import din fisier ───────── */

/** Anteturile acceptate, in forma normalizata (fara diacritice, cu litere mici) */
const COLOANE = {
  data: ['data', 'ziua', 'date'],
  ore: ['ore', 'durata', 'nr ore', 'numar ore'],
  descriere: ['descriere', 'lucrare', 'detalii', 'ce am lucrat'],
  eticheta: ['eticheta', 'proiect', 'lucrare/proiect'],
  categorie: ['categorie', 'tip'],
  tarif: ['tarif', 'regim'],
  start: ['de la', 'ora start', 'start'],
  end: ['pana la', 'ora final', 'final', 'end'],
};

function iaValoare(rand: Record<string, string>, chei: string[]): string {
  for (const cheie of chei) {
    if (rand[cheie]) return rand[cheie];
  }
  return '';
}

const CATEGORII: Record<string, string> = {
  suport: 'SUPORT',
  'suport tehnic': 'SUPORT',
  interventie: 'INTERVENTIE',
  dezvoltare: 'DEZVOLTARE',
  consultanta: 'CONSULTANTA',
  altul: 'ALTUL',
  alta: 'ALTUL',
};

/** Cele doua regimuri de tarifare, scrise cum le-ar scrie un om */
function citesteTarif(valoare: string): 'STANDARD' | 'OFF_HOURS' {
  const v = normalizeaza(valoare);
  if (!v) return 'STANDARD';
  return /majorat|noapte|afara|off|weekend/.test(v) ? 'OFF_HOURS' : 'STANDARD';
}

interface RandImport {
  linie: number;
  date: string;
  hours: number | null;
  start: string;
  end: string;
  rateType: 'STANDARD' | 'OFF_HOURS';
  description: string;
  projectTag: string;
  category: string;
  minutes: number;
  amountEur: number;
  error: string;
}

/** Sablonul de completat, cu doua exemple */
workLogsRouter.get('/import/template', (_req, res) => {
  const linii = [
    'Data;Ore;Descriere;Eticheta;Categorie;Tarif',
    '03.07.2026;1;"Stoc oferta (optional) - bug";Mentenanta site;Suport;normal',
    '09.07.2026;2,5;Actualizare continut si imagini;Mentenanta site;Dezvoltare;normal',
    '15.07.2026;2;Interventie urgenta seara;;Interventie;majorat',
  ];
  // BOM, ca Excel sa recunoasca diacriticele
  const csv = `\ufeff${linii.join('\r\n')}\r\n`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sablon-ore-andaxi.csv"');
  res.send(csv);
});

/**
 * Import de ore dintr-un CSV. Cu `dryRun` returneaza doar ce ar urma sa se
 * creeze, cu erorile pe fiecare linie — ca sa se vada inainte de a scrie ceva.
 */
workLogsRouter.post(
  '/import',
  express.text({ type: () => true, limit: '2mb' }),
  asyncHandler(async (req, res) => {
    const { clientId, dryRun, mode } = z
      .object({
        clientId: z.string().min(1),
        dryRun: z.string().optional(),
        /** append = se adauga peste ce exista · replace = zilele din fisier se rescriu */
        mode: z.enum(['append', 'replace']).default('append'),
      })
      .parse(req.query);

    await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const config = await rateConfig(clientId);
    const randuri = parseCsv(typeof req.body === 'string' ? req.body : '');

    if (randuri.length === 0) throw new HttpError(400, 'Fișierul nu conține nicio linie de date');

    const rezultate: RandImport[] = randuri.map((rand, index) => {
      const linie = index + 2; // +1 pentru antet, +1 ca numaratoarea sa inceapa de la 1
      const date = parseData(iaValoare(rand, COLOANE.data));
      const start = iaValoare(rand, COLOANE.start);
      const end = iaValoare(rand, COLOANE.end);
      const ore = parseNumar(iaValoare(rand, COLOANE.ore));
      const rateType = citesteTarif(iaValoare(rand, COLOANE.tarif));
      const categorieBruta = normalizeaza(iaValoare(rand, COLOANE.categorie));

      const gol: RandImport = {
        linie,
        date: date ?? '',
        hours: ore,
        start,
        end,
        rateType,
        description: iaValoare(rand, COLOANE.descriere),
        projectTag: iaValoare(rand, COLOANE.eticheta),
        category: CATEGORII[categorieBruta] ?? 'SUPORT',
        minutes: 0,
        amountEur: 0,
        error: '',
      };

      if (!date) return { ...gol, error: 'Data lipsește sau nu e validă' };

      const areInterval = Boolean(start && end);
      if (!areInterval && (!ore || ore <= 0)) {
        return { ...gol, error: 'Completează numărul de ore sau intervalul orar' };
      }

      try {
        if (areInterval) {
          const split = splitWorkInterval(date, hhMmToMinutes(start), hhMmToMinutes(end), config);
          return {
            ...gol,
            minutes: split.totalMinutes,
            amountEur: split.amountEur,
          };
        }
        const minute = Math.round((ore ?? 0) * 60);
        return {
          ...gol,
          minutes: minute,
          amountEur: round2(
            (minute / 60) * (rateType === 'STANDARD' ? config.standardRate : config.offHoursRate),
          ),
        };
      } catch (err) {
        return { ...gol, error: err instanceof Error ? err.message : 'Linie invalida' };
      }
    });

    const valide = rezultate.filter((r) => !r.error);
    const zile = [...new Set(valide.map((r) => r.date))];

    /*
     * La reimport, orele s-ar aduna peste cele existente. In modul "replace"
     * stergem intai ce era in zilele din fisier — mai putin ce a fost deja
     * facturat sau incasat, ca sa nu dispara din istoricul de facturare.
     */
    const existente = zile.length
      ? await prisma.workLog.findMany({ where: { clientId, date: { in: zile } } })
      : [];
    const deSters = existente.filter((l) => l.status === 'PENDING' || l.status === 'NONBILLABLE');
    const protejate = existente.filter((l) => l.status === 'INVOICED' || l.status === 'PAID');

    if (dryRun) {
      res.json({
        rows: rezultate,
        valid: valide.length,
        invalid: rezultate.length - valide.length,
        mode,
        /** Cate interventii exista deja in zilele din fisier */
        existing: existente.length,
        /** Cate ar fi sterse in modul "replace" */
        replaceable: deSters.length,
        /** Cate raman oricum, fiind deja facturate */
        locked: protejate.length,
        days: zile.length,
      });
      return;
    }

    if (mode === 'replace' && deSters.length > 0) {
      const atasamente = await prisma.attachment.findMany({
        where: { workLogId: { in: deSters.map((l) => l.id) } },
      });
      await prisma.workLog.deleteMany({ where: { id: { in: deSters.map((l) => l.id) } } });
      for (const atasament of atasamente) deleteAttachment(atasament.path);
    }

    for (const rand of valide) {
      const data = buildData(
        {
          clientId,
          date: rand.date,
          start: rand.start || undefined,
          end: rand.end || undefined,
          hours: rand.hours ?? undefined,
          rateType: rand.rateType,
          description: rand.description,
          category: rand.category as (typeof WORK_CATEGORIES)[number],
          projectTag: rand.projectTag,
          billable: true,
          includedInPackage: false,
          invoiceRef: '',
        },
        config,
      );
      await prisma.workLog.create({ data });
    }

    res.json({
      created: valide.length,
      skipped: rezultate.length - valide.length,
      deleted: mode === 'replace' ? deSters.length : 0,
      locked: mode === 'replace' ? protejate.length : 0,
    });
  }),
);

workLogsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.workLog.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          client: { select: CLIENT_REF },
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
    const { date, start, end, clientId, hours, rateType } = z
      .object({
        date: isoDate,
        start: timeString.optional(),
        end: timeString.optional(),
        hours: z.coerce.number().positive().max(24).optional(),
        rateType: z.enum(['STANDARD', 'OFF_HOURS']).default('STANDARD'),
        clientId: z.string().optional(),
      })
      .parse(req.body);
    const config = await rateConfig(clientId);

    if (!start || !end) {
      const minute = Math.round((hours ?? 0) * 60);
      const standardMinutes = rateType === 'STANDARD' ? minute : 0;
      const offHoursMinutes = minute - standardMinutes;
      res.json({
        standardMinutes,
        offHoursMinutes,
        totalMinutes: minute,
        amountEur: round2(
          (standardMinutes / 60) * config.standardRate + (offHoursMinutes / 60) * config.offHoursRate,
        ),
      });
      return;
    }
    res.json(splitWorkInterval(date, hhMmToMinutes(start), hhMmToMinutes(end), config));
  }),
);

workLogsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = workLogSchema.parse(req.body);
    const data = buildData(input, await rateConfig(input.clientId));
    res.status(201).json(await prisma.workLog.create({ data }));
  }),
);

workLogsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = workLogSchema.parse(req.body);
    const current = await prisma.workLog.findUniqueOrThrow({ where: { id: req.params.id } });
    const data = buildData(input, await rateConfig(input.clientId));
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
