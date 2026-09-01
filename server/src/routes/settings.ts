import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { ALLOWED_IMAGE_TYPES, deleteUpload, saveImage } from '../lib/uploads.js';
import { trimiteTest } from '../lib/mailer.js';

export const settingsRouter = Router();

const settingsSchema = z.object({
  companyName: z.string().optional(),
  companyCui: z.string().optional(),
  companyIban: z.string().optional(),
  companyEmail: z.string().email().or(z.literal('')).optional(),
  portalBaseUrl: z.string().url('Trebuie sa fie o adresa completa, ex. https://client.andaxi.ro').or(z.literal('')).optional(),
  standardRate: z.coerce.number().nonnegative().optional(),
  offHoursRate: z.coerce.number().nonnegative().optional(),
  standardStart: z.coerce.number().int().min(0).max(1440).optional(),
  standardEnd: z.coerce.number().int().min(0).max(1440).optional(),
  weekendOffHours: z.boolean().optional(),
  eurRon: z.coerce.number().positive().optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  billingLeadDays: z.coerce.number().int().min(0).max(90).optional(),

  // preturi pe utilizator pentru ERP / CRM
  erpTier1Max: z.coerce.number().int().min(1).optional(),
  erpTier1Price: z.coerce.number().nonnegative().optional(),
  erpTier2Max: z.coerce.number().int().min(1).optional(),
  erpTier2Price: z.coerce.number().nonnegative().optional(),
  erpTier3Price: z.coerce.number().nonnegative().optional(),
  erpTier1StorageGb: z.coerce.number().nonnegative().optional(),
  erpTier2StorageGb: z.coerce.number().nonnegative().optional(),
  erpTier3StorageGb: z.coerce.number().nonnegative().optional(),
  crmTier1Max: z.coerce.number().int().min(1).optional(),
  crmTier1Price: z.coerce.number().nonnegative().optional(),
  crmTier2Max: z.coerce.number().int().min(1).optional(),
  crmTier2Price: z.coerce.number().nonnegative().optional(),
  crmTier3Price: z.coerce.number().nonnegative().optional(),
  crmTier1StorageGb: z.coerce.number().nonnegative().optional(),
  crmTier2StorageGb: z.coerce.number().nonnegative().optional(),
  crmTier3StorageGb: z.coerce.number().nonnegative().optional(),
  discountSemiannual: z.coerce.number().min(0).max(100).optional(),
  discountAnnual: z.coerce.number().min(0).max(100).optional(),

  // SMTP
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  /** Gol inseamna "lasa parola de acum neschimbata" */
  smtpPass: z.string().optional(),
  smtpFrom: z.string().email().or(z.literal('')).optional(),
  smtpFromName: z.string().max(80).optional(),
  notifyEmail: z.string().email().or(z.literal('')).optional(),
});

/** Setarile trimise catre interfata: parola SMTP nu pleaca niciodata inapoi */
function faraParola<T extends { smtpPass: string }>(settings: T) {
  const { smtpPass, ...restul } = settings;
  return { ...restul, smtpHasPassword: smtpPass.length > 0 };
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(faraParola(await getSettings()));
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { smtpPass, ...data } = settingsSchema.parse(req.body);
    await getSettings();
    res.json(
      faraParola(
        await prisma.settings.update({
          where: { id: 'singleton' },
          // parola se schimba doar cand chiar scrii una noua
          data: { ...data, ...(smtpPass ? { smtpPass } : {}) },
        }),
      ),
    );
  }),
);

/* ─────────────────────────────────────────────────────── test pentru SMTP ── */

const testSchema = z.object({
  to: z.string().email('Scrie o adresa de email valida'),
  /** Datele de test, daca vrei sa incerci inainte sa salvezi */
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
  smtpFromName: z.string().optional(),
});

settingsRouter.post(
  '/smtp-test',
  asyncHandler(async (req, res) => {
    const { to, ...date } = testSchema.parse(req.body);
    const salvate = await getSettings();

    const config = {
      smtpHost: date.smtpHost ?? salvate.smtpHost,
      smtpPort: date.smtpPort ?? salvate.smtpPort,
      smtpSecure: date.smtpSecure ?? salvate.smtpSecure,
      smtpUser: date.smtpUser ?? salvate.smtpUser,
      // daca nu scrii parola in formular, incercam cu cea salvata
      smtpPass: date.smtpPass || salvate.smtpPass,
      smtpFrom: date.smtpFrom ?? salvate.smtpFrom,
      smtpFromName: date.smtpFromName ?? salvate.smtpFromName,
      companyName: salvate.companyName,
    };

    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
      throw new HttpError(400, 'Completeaza serverul, utilizatorul si parola inainte de test');
    }

    try {
      await trimiteTest(config, to);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Serverul de email a refuzat mesajul');
    }
    res.json({ ok: true });
  }),
);

/* ─────────────────────────────────────────────────────────── sigla firmei ── */

const logoSchema = z.object({
  /** Continutul fisierului, codificat base64 (fara prefixul "data:") */
  data: z.string().min(1, 'Fisierul este gol'),
  mimeType: z.string().refine((t) => t in ALLOWED_IMAGE_TYPES, {
    message: 'Acceptam doar PNG, JPG, WEBP sau SVG',
  }),
});

settingsRouter.post(
  '/logo',
  asyncHandler(async (req, res) => {
    const { data, mimeType } = logoSchema.parse(req.body);
    const current = await getSettings();

    let logoUrl: string;
    try {
      logoUrl = saveImage(data, mimeType, 'logo', Date.now());
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Nu am putut salva imaginea');
    }

    // stergem sigla veche abia dupa ce noua a fost scrisa cu succes
    if (current.logoUrl) deleteUpload(current.logoUrl);
    res.json(faraParola(await prisma.settings.update({ where: { id: 'singleton' }, data: { logoUrl } })));
  }),
);

settingsRouter.delete(
  '/logo',
  asyncHandler(async (_req, res) => {
    const current = await getSettings();
    if (current.logoUrl) deleteUpload(current.logoUrl);
    res.json(faraParola(await prisma.settings.update({ where: { id: 'singleton' }, data: { logoUrl: '' } })));
  }),
);
