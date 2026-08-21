import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { ALLOWED_DOC_TYPES, deleteAttachment, resolveUploadPath, saveAttachment } from '../lib/uploads.js';

export const monthlyDocumentsRouter = Router();

const filtru = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Luna trebuie sa fie in formatul YYYY-MM'),
});

/** Documentele atasate unei luni de lucru la un client */
monthlyDocumentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    res.json(
      await prisma.monthlyDocument.findMany({
        where: { clientId, month },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }),
);

/** Incarcare: fisierul vine binar, cu numele in antetul X-File-Name */
monthlyDocumentsRouter.post(
  '/',
  express.raw({ type: () => true, limit: '12mb' }),
  asyncHandler(async (req, res) => {
    const { clientId, month } = filtru.parse(req.query);
    const mimeType = (req.headers['content-type'] ?? '').split(';')[0].trim();
    const numeBrut = req.headers['x-file-name'];
    const fileName = decodeURIComponent(Array.isArray(numeBrut) ? numeBrut[0] : (numeBrut ?? 'document')).slice(0, 255);

    if (!(mimeType in ALLOWED_DOC_TYPES)) {
      throw new HttpError(400, 'Acceptam PDF, Word, Excel, text sau imagini');
    }
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'Fisierul lipseste din cerere');

    await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const cate = await prisma.monthlyDocument.count({ where: { clientId, month } });

    let salvat: { path: string; size: number };
    try {
      salvat = saveAttachment(req.body, mimeType, Date.now(), cate, 'luni');
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Nu am putut salva fisierul');
    }

    res.status(201).json(
      await prisma.monthlyDocument.create({
        data: { clientId, month, fileName, mimeType, size: salvat.size, path: salvat.path },
      }),
    );
  }),
);

monthlyDocumentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const document = await prisma.monthlyDocument.findUniqueOrThrow({ where: { id: req.params.id } });
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

monthlyDocumentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const document = await prisma.monthlyDocument.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.monthlyDocument.delete({ where: { id: document.id } });
    deleteAttachment(document.path);
    res.json({ ok: true });
  }),
);
