import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { CLIENT_STATUSES, COLORS } from '../lib/validation.js';

export const clientsRouter = Router();

const clientSchema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu'),
  company: z.string().default(''),
  cui: z.string().default(''),
  regCom: z.string().default(''),
  email: z.string().email('Email invalid').or(z.literal('')).default(''),
  phone: z.string().default(''),
  contact: z.string().default(''),
  website: z.string().default(''),
  address: z.string().default(''),
  city: z.string().default(''),
  county: z.string().default(''),
  country: z.string().default('Romania'),
  status: z.enum(CLIENT_STATUSES).default('ACTIVE'),
  color: z.enum(COLORS).default('violet'),
  notes: z.string().default(''),
});

clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, q } = req.query as { status?: string; q?: string };
    const clients = await prisma.client.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { company: { contains: q } },
                { email: { contains: q } },
                { cui: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        subscriptions: { where: { status: 'ACTIVE' }, select: { id: true, amountEur: true, cycle: true } },
        _count: { select: { workLogs: true, subscriptions: true } },
      },
    });
    res.json(clients);
  }),
);

clientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        subscriptions: { orderBy: { createdAt: 'desc' } },
        workLogs: {
          orderBy: [{ date: 'desc' }, { startMinutes: 'desc' }],
          take: 100,
          include: { attachments: { orderBy: { createdAt: 'asc' } } },
        },
        billingItems: { orderBy: { dueDate: 'desc' }, take: 100, include: { subscription: true } },
        tasks: { orderBy: [{ done: 'asc' }, { dueDate: 'asc' }] },
      },
    });
    res.json(client);
  }),
);

clientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = clientSchema.parse(req.body);
    res.status(201).json(await prisma.client.create({ data }));
  }),
);

clientsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = clientSchema.partial().parse(req.body);
    res.json(await prisma.client.update({ where: { id: req.params.id }, data }));
  }),
);

clientsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
