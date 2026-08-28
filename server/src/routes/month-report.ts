import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { buildMonthReportPdf } from '../lib/month-report.js';
import { prisma } from '../prisma.js';

export const monthReportRouter = Router();

const filtru = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Luna trebuie sa fie in formatul YYYY-MM'),
});

/** Numele fisierului: "raport-bioshop-2026-08.pdf" */
function numeFisier(client: string, month: string): string {
  const curat = client
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return `raport-${curat || 'client'}-${month}.pdf`;
}

/** Raportul lunii, in PDF: calendarul, lucrarile si totalul */
monthReportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { name: true, company: true },
    });

    const pdf = await buildMonthReportPdf(clientId, month);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${numeFisier(client.company || client.name, month)}"`,
    );
    res.send(pdf);
  }),
);
