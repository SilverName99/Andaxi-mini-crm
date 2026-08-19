import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { ALLOWED_IMAGE_TYPES, deleteUpload, saveImage } from '../lib/uploads.js';

export const settingsRouter = Router();

const settingsSchema = z.object({
  companyName: z.string().optional(),
  companyCui: z.string().optional(),
  companyIban: z.string().optional(),
  companyEmail: z.string().email().or(z.literal('')).optional(),
  standardRate: z.coerce.number().nonnegative().optional(),
  offHoursRate: z.coerce.number().nonnegative().optional(),
  standardStart: z.coerce.number().int().min(0).max(1440).optional(),
  standardEnd: z.coerce.number().int().min(0).max(1440).optional(),
  weekendOffHours: z.boolean().optional(),
  eurRon: z.coerce.number().positive().optional(),
  billingLeadDays: z.coerce.number().int().min(0).max(90).optional(),

  // preturi pe utilizator pentru ERP / CRM
  erpTier1Max: z.coerce.number().int().min(1).optional(),
  erpTier1Price: z.coerce.number().nonnegative().optional(),
  erpTier2Max: z.coerce.number().int().min(1).optional(),
  erpTier2Price: z.coerce.number().nonnegative().optional(),
  erpTier3Price: z.coerce.number().nonnegative().optional(),
  crmTier1Max: z.coerce.number().int().min(1).optional(),
  crmTier1Price: z.coerce.number().nonnegative().optional(),
  crmTier2Max: z.coerce.number().int().min(1).optional(),
  crmTier2Price: z.coerce.number().nonnegative().optional(),
  crmTier3Price: z.coerce.number().nonnegative().optional(),
  discountSemiannual: z.coerce.number().min(0).max(100).optional(),
  discountAnnual: z.coerce.number().min(0).max(100).optional(),
});

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const data = settingsSchema.parse(req.body);
    await getSettings();
    res.json(await prisma.settings.update({ where: { id: 'singleton' }, data }));
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
    res.json(await prisma.settings.update({ where: { id: 'singleton' }, data: { logoUrl } }));
  }),
);

settingsRouter.delete(
  '/logo',
  asyncHandler(async (_req, res) => {
    const current = await getSettings();
    if (current.logoUrl) deleteUpload(current.logoUrl);
    res.json(await prisma.settings.update({ where: { id: 'singleton' }, data: { logoUrl: '' } }));
  }),
);
