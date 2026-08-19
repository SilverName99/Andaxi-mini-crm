import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { syncBillingItems } from '../lib/billing-sync.js';
import { isoDate } from '../lib/validation.js';
import { minutesToHhMm } from '../lib/dates.js';

export const calendarRouter = Router();

/**
 * Tot ce are o data intr-un interval, adunat intr-o singura lista:
 * scadentele din abonamente, interventiile lucrate si task-urile.
 * Front-end-ul le grupeaza pe zile.
 */
calendarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    await syncBillingItems();

    const [billing, workLogs, tasks] = await Promise.all([
      prisma.billingItem.findMany({
        where: { dueDate: { gte: from, lte: to } },
        include: {
          client: { select: { id: true, name: true, company: true, color: true } },
          subscription: { select: { label: true, product: true, cycle: true } },
        },
      }),
      prisma.workLog.findMany({
        where: { date: { gte: from, lte: to } },
        include: { client: { select: { id: true, name: true, company: true, color: true } } },
      }),
      prisma.task.findMany({
        where: { dueDate: { gte: from, lte: to } },
        include: { client: { select: { id: true, name: true, company: true, color: true } } },
      }),
    ]);

    const events = [
      ...billing.map((item) => ({
        id: `billing-${item.id}`,
        type: 'BILLING' as const,
        date: item.dueDate,
        title: item.client.company || item.client.name,
        subtitle: item.subscription?.label ?? 'Abonament',
        amountEur: item.amountEur,
        status: item.status,
        clientId: item.clientId,
        color: item.client.color,
      })),
      ...workLogs.map((log) => ({
        id: `work-${log.id}`,
        type: 'WORK' as const,
        date: log.date,
        title: log.client.company || log.client.name,
        subtitle: log.description || 'Intervenție',
        amountEur: log.billable ? log.amountEur : 0,
        status: log.status,
        clientId: log.clientId,
        color: log.client.color,
        timeLabel: `${minutesToHhMm(log.startMinutes)}–${minutesToHhMm(log.endMinutes)}`,
        minutes: log.standardMinutes + log.offHoursMinutes,
        category: log.category,
      })),
      ...tasks.map((task) => ({
        id: `task-${task.id}`,
        type: 'TASK' as const,
        date: task.dueDate!,
        title: task.title,
        subtitle: task.client ? task.client.company || task.client.name : task.details,
        status: task.done ? 'DONE' : 'OPEN',
        clientId: task.clientId ?? undefined,
        color: task.client?.color,
        priority: task.priority,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json({ from, to, events });
  }),
);
