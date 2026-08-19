import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Setarile sunt un singur rand; il cream la prima cerere daca lipseste. */
export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 'singleton' } });
}
