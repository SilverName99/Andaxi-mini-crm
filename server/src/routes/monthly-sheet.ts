import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { buildMonthlySheet } from '../lib/monthly-sheet.js';

export const monthlySheetRouter = Router();

monthlySheetRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = z
      .object({ clientId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(req.query);

    res.json(await buildMonthlySheet(clientId, month));
  }),
);
