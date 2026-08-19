import { Router } from 'express';
import { getSettings, prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { syncBillingItems } from '../lib/billing-sync.js';
import { addDays, addMonths, endOfMonth, monthRange, startOfMonth, today } from '../lib/dates.js';
import { isCycle, monthlyEquivalent } from '../lib/cycles.js';
import { round2 } from '../lib/rates.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await syncBillingItems();
    const settings = await getSettings();
    const now = today();
    const horizon = addDays(now, 30);
    const sixMonthsAgo = startOfMonth(addMonths(now, -5));

    const [clients, subscriptions, billingItems, workLogs, tasks] = await Promise.all([
      prisma.client.findMany({ select: { id: true, name: true, company: true, color: true, status: true } }),
      prisma.subscription.findMany({
        include: { client: { select: { id: true, name: true, company: true, color: true } } },
      }),
      prisma.billingItem.findMany({
        include: {
          client: { select: { id: true, name: true, company: true, color: true } },
          subscription: { select: { label: true, cycle: true, product: true, kind: true } },
        },
      }),
      prisma.workLog.findMany({
        where: { date: { gte: sixMonthsAgo } },
        include: { client: { select: { id: true, name: true, company: true, color: true } } },
      }),
      prisma.task.findMany({
        where: { done: false },
        orderBy: [{ dueDate: 'asc' }],
        take: 8,
        include: { client: { select: { id: true, name: true, color: true } } },
      }),
    ]);

    const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');
    const mrr = round2(
      activeSubs.reduce(
        (sum, s) => sum + (isCycle(s.cycle) ? monthlyEquivalent(s.amountEur, s.cycle) : 0),
        0,
      ),
    );

    const pending = billingItems.filter((i) => i.status === 'PENDING');
    const overdue = pending.filter((i) => i.dueDate < now);
    const upcoming = pending
      .filter((i) => i.dueDate >= now && i.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const unbilledLogs = workLogs.filter((l) => l.status === 'PENDING' && l.billable);
    const monthStart = startOfMonth(now);
    const logsThisMonth = workLogs.filter((l) => l.date >= monthStart);

    // Serie pe ultimele 6 luni: recurent (dupa data scadentei) + ore (dupa data lucrarii)
    const months = monthRange(sixMonthsAgo, now);
    const series = months.map((month) => {
      const recurent = billingItems
        .filter((i) => i.dueDate.startsWith(month) && i.status !== 'SKIPPED')
        .reduce((sum, i) => sum + i.amountEur, 0);
      const ore = workLogs
        .filter((l) => l.date.startsWith(month) && l.billable)
        .reduce((sum, l) => sum + l.amountEur, 0);
      return { month, recurent: round2(recurent), ore: round2(ore), total: round2(recurent + ore) };
    });

    // Distributie pe tip de produs (valoare lunara echivalenta)
    const byProduct = new Map<string, number>();
    for (const s of activeSubs) {
      if (!isCycle(s.cycle)) continue;
      byProduct.set(s.product, (byProduct.get(s.product) ?? 0) + monthlyEquivalent(s.amountEur, s.cycle));
    }

    // Top clienti dupa valoare (recurent lunar + ore in ultimele 6 luni)
    const clientTotals = new Map<string, { client: (typeof clients)[number]; recurent: number; ore: number }>();
    for (const c of clients) clientTotals.set(c.id, { client: c, recurent: 0, ore: 0 });
    for (const s of activeSubs) {
      const entry = clientTotals.get(s.clientId);
      if (entry && isCycle(s.cycle)) entry.recurent += monthlyEquivalent(s.amountEur, s.cycle);
    }
    for (const l of workLogs) {
      const entry = clientTotals.get(l.clientId);
      if (entry && l.billable) entry.ore += l.amountEur;
    }

    res.json({
      settings,
      today: now,
      kpis: {
        mrr,
        arr: round2(mrr * 12),
        clientsActive: clients.filter((c) => c.status === 'ACTIVE').length,
        clientsTotal: clients.length,
        subscriptionsActive: activeSubs.length,
        pendingCount: pending.length,
        pendingAmount: round2(pending.reduce((s, i) => s + i.amountEur, 0)),
        overdueCount: overdue.length,
        overdueAmount: round2(overdue.reduce((s, i) => s + i.amountEur, 0)),
        unbilledHoursMinutes: unbilledLogs.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0),
        unbilledHoursAmount: round2(unbilledLogs.reduce((s, l) => s + l.amountEur, 0)),
        monthMinutes: logsThisMonth.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0),
        monthHoursAmount: round2(
          logsThisMonth.filter((l) => l.billable).reduce((s, l) => s + l.amountEur, 0),
        ),
      },
      upcoming: upcoming.slice(0, 8),
      overdue: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8),
      series,
      byProduct: [...byProduct.entries()]
        .map(([product, value]) => ({ product, value: round2(value) }))
        .sort((a, b) => b.value - a.value),
      topClients: [...clientTotals.values()]
        .map((e) => ({ ...e.client, recurent: round2(e.recurent), ore: round2(e.ore), total: round2(e.recurent + e.ore) }))
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
      tasks,
    });
  }),
);

/** Raport pe interval: totaluri per client si per luna */
dashboardRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    await syncBillingItems();
    const now = today();
    const { from = startOfMonth(addMonths(now, -5)), to = endOfMonth(now) } = req.query as Record<string, string>;
    const settings = await getSettings();

    const [items, logs, clients] = await Promise.all([
      prisma.billingItem.findMany({ where: { dueDate: { gte: from, lte: to } } }),
      prisma.workLog.findMany({ where: { date: { gte: from, lte: to } } }),
      prisma.client.findMany({ select: { id: true, name: true, company: true, color: true } }),
    ]);

    const rows = clients
      .map((c) => {
        const clientItems = items.filter((i) => i.clientId === c.id && i.status !== 'SKIPPED');
        const clientLogs = logs.filter((l) => l.clientId === c.id && l.billable);
        const minutes = clientLogs.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0);
        const recurent = round2(clientItems.reduce((s, i) => s + i.amountEur, 0));
        const ore = round2(clientLogs.reduce((s, l) => s + l.amountEur, 0));
        return {
          ...c,
          recurent,
          ore,
          minutes,
          total: round2(recurent + ore),
          incasat: round2(
            clientItems.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amountEur, 0) +
              clientLogs.filter((l) => l.status === 'PAID').reduce((s, l) => s + l.amountEur, 0),
          ),
          deFacturat: round2(
            clientItems.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.amountEur, 0) +
              clientLogs.filter((l) => l.status === 'PENDING').reduce((s, l) => s + l.amountEur, 0),
          ),
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    const months = monthRange(from, to).map((month) => {
      const recurent = items
        .filter((i) => i.dueDate.startsWith(month) && i.status !== 'SKIPPED')
        .reduce((s, i) => s + i.amountEur, 0);
      const ore = logs
        .filter((l) => l.date.startsWith(month) && l.billable)
        .reduce((s, l) => s + l.amountEur, 0);
      return { month, recurent: round2(recurent), ore: round2(ore), total: round2(recurent + ore) };
    });

    const standardMinutes = logs.filter((l) => l.billable).reduce((s, l) => s + l.standardMinutes, 0);
    const offHoursMinutes = logs.filter((l) => l.billable).reduce((s, l) => s + l.offHoursMinutes, 0);

    res.json({
      from,
      to,
      settings,
      rows,
      months,
      totals: {
        recurent: round2(rows.reduce((s, r) => s + r.recurent, 0)),
        ore: round2(rows.reduce((s, r) => s + r.ore, 0)),
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
        incasat: round2(rows.reduce((s, r) => s + r.incasat, 0)),
        deFacturat: round2(rows.reduce((s, r) => s + r.deFacturat, 0)),
        standardMinutes,
        offHoursMinutes,
      },
    });
  }),
);
