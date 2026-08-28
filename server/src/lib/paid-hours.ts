import { prisma } from '../prisma.js';
import { allocateTimeline, type SoldAbonament } from './hours.js';

/**
 * Cat a mai ramas din orele platite prin fiecare abonament al unui client.
 * Rezervoarele nu se reincarca, deci soldul se obtine parcurgand tot istoricul
 * de ore al clientului — exact ca la fisa lunara.
 */
export async function soldurileClientului(clientId: string): Promise<Map<string, SoldAbonament>> {
  const abonamente = await prisma.subscription.findMany({
    where: { clientId },
    include: { hourPackage: true },
  });
  if (!abonamente.some((sub) => sub.paidHours > 0)) return new Map();

  const logs = await prisma.workLog.findMany({
    where: { clientId },
    orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
  });

  const { paidPools } = allocateTimeline(logs, abonamente);
  return paidPools.get(clientId) ?? new Map();
}

/** Soldurile mai multor clienti deodata, pentru listele generale */
export async function soldurilePeClienti(clientIds: string[]): Promise<Map<string, Map<string, SoldAbonament>>> {
  if (clientIds.length === 0) return new Map();

  const abonamente = await prisma.subscription.findMany({
    where: { clientId: { in: clientIds } },
    include: { hourPackage: true },
  });
  if (!abonamente.some((sub) => sub.paidHours > 0)) return new Map();

  const logs = await prisma.workLog.findMany({
    where: { clientId: { in: clientIds } },
    orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
  });

  return allocateTimeline(logs, abonamente).paidPools;
}
