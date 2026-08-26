import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';

export const monthlyApprovalRouter = Router();

const filtru = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Luna trebuie sa fie in formatul YYYY-MM'),
});

/**
 * Confirmarea trimisa de client din portal. Ruta e doar de citit: confirmarea
 * apartine clientului, iar din CRM ea se vede, nu se scrie.
 */
monthlyApprovalRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    res.json(await prisma.monthlyApproval.findUnique({ where: { clientId_month: { clientId, month } } }));
  }),
);
