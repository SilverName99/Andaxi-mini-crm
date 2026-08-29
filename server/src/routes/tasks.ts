import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { isoDate, PRIORITIES } from '../lib/validation.js';
import { today } from '../lib/dates.js';
import { CLIENT_REF } from '../lib/selects.js';
import { HttpError } from '../middleware/errors.js';
import { getSettings } from '../prisma.js';
import { sablonEmail, trimiteEmail } from '../lib/mailer.js';

export const tasksRouter = Router();

const taskSchema = z.object({
  clientId: z.string().nullable().optional(),
  title: z.string().min(1, 'Titlul este obligatoriu'),
  details: z.string().default(''),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  done: z.boolean().default(false),
  /** Discutia cu clientul: o inchizi cand cererea s-a rezolvat */
  chatClosed: z.boolean().optional(),
});

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { done, clientId } = req.query as { done?: string; clientId?: string };
    res.json(
      await prisma.task.findMany({
        where: {
          ...(done === 'true' ? { done: true } : done === 'false' ? { done: false } : {}),
          ...(clientId ? { clientId } : {}),
        },
        orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          client: { select: CLIENT_REF },
          messages: { select: { author: true, readByAdmin: true } },
        },
      }),
    );
  }),
);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = taskSchema.parse(req.body);
    res.status(201).json(
      await prisma.task.create({
        data: { ...data, clientId: data.clientId || null, dueDate: data.dueDate ?? null },
      }),
    );
  }),
);

tasksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = taskSchema.partial().parse(req.body);
    res.json(
      await prisma.task.update({
        where: { id: req.params.id },
        data: {
          ...data,
          ...(data.clientId !== undefined ? { clientId: data.clientId || null } : {}),
          ...(data.done !== undefined ? { doneAt: data.done ? today() : null } : {}),
        },
      }),
    );
  }),
);

tasksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

/* ─────────────────────────────────── discutia pe marginea unei cereri ── */

tasksRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { client: { select: CLIENT_REF } },
    });

    const mesaje = await prisma.requestMessage.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.requestMessage.updateMany({
      where: { taskId: task.id, author: 'CLIENT', readByAdmin: false },
      data: { readByAdmin: true },
    });

    res.json({
      id: task.id,
      title: task.title,
      details: task.details,
      kind: task.requestKind || '',
      dueAt: task.dueAt,
      chatClosed: task.chatClosed,
      done: task.done,
      client: task.client,
      createdAt: task.createdAt,
      messages: mesaje,
    });
  }),
);

const mesajSchema = z.object({ body: z.string().trim().min(1, 'Scrie un mesaj').max(4000) });

/** Raspunsul tau ajunge in portal si, daca are email, si la client */
tasksRouter.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { client: { select: { name: true, company: true, email: true } } },
    });
    if (task.chatClosed) throw new HttpError(400, 'Discutia e inchisa. Redeschide-o ca sa mai poti scrie.');

    const { body } = mesajSchema.parse(req.body);
    const settings = await getSettings();
    const mesaj = await prisma.requestMessage.create({
      data: { taskId: task.id, author: 'ADMIN', body, readByAdmin: true },
    });

    if (task.client?.email) {
      const portal = await prisma.clientPortal.findUnique({ where: { clientId: task.clientId ?? '' } });
      const link = portal && settings.portalBaseUrl ? `${settings.portalBaseUrl.replace(/\/+$/, '')}/portal#${portal.token}` : '';

      void trimiteEmail({
        to: task.client.email,
        subject: `Răspuns la cererea „${task.title}"`,
        text: `${body}\n\n${link ? `Poți răspunde din portal: ${link}` : ''}`,
        html: sablonEmail(
          `Răspuns la cererea „${task.title}"`,
          [body],
          link ? { text: 'Deschide portalul', url: link } : undefined,
        ),
      });
    }

    res.status(201).json(mesaj);
  }),
);
