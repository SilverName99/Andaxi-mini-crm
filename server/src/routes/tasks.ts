import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { isoDate, PRIORITIES } from '../lib/validation.js';
import { today } from '../lib/dates.js';

export const tasksRouter = Router();

const taskSchema = z.object({
  clientId: z.string().nullable().optional(),
  title: z.string().min(1, 'Titlul este obligatoriu'),
  details: z.string().default(''),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  done: z.boolean().default(false),
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
        include: { client: { select: { id: true, name: true, company: true, color: true } } },
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
