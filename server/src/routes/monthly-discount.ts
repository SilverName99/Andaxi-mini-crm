import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';

export const monthlyDiscountRouter = Router();

const filtru = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Luna trebuie sa fie in formatul YYYY-MM'),
});

const discountSchema = z.object({
  type: z.enum(['PERCENT', 'AMOUNT']),
  value: z.coerce.number().nonnegative('Reducerea nu poate fi negativa'),
  note: z.string().max(200).default(''),
});

/** Reducerea unei luni, daca a fost setata una */
monthlyDiscountRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    res.json(await prisma.monthlyDiscount.findUnique({ where: { clientId_month: { clientId, month } } }));
  }),
);

/** Seteaza sau actualizeaza reducerea lunii */
monthlyDiscountRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    const data = discountSchema.parse(req.body);

    // o reducere de zero inseamna, practic, ca nu exista
    if (data.value === 0) {
      await prisma.monthlyDiscount.deleteMany({ where: { clientId, month } });
      res.json(null);
      return;
    }

    res.json(
      await prisma.monthlyDiscount.upsert({
        where: { clientId_month: { clientId, month } },
        update: data,
        create: { clientId, month, ...data },
      }),
    );
  }),
);

monthlyDiscountRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    await prisma.monthlyDiscount.deleteMany({ where: { clientId, month } });
    res.json({ ok: true });
  }),
);
