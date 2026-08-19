import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';

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
