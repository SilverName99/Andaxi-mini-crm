import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';

export const hourPackagesRouter = Router();

const packageSchema = z.object({
  name: z.string().min(1, 'Denumirea este obligatorie').max(60),
  hoursPerMonth: z.coerce.number().positive('Numarul de ore trebuie sa fie mai mare ca 0'),
  standardRate: z.coerce.number().nonnegative(),
  offHoursRate: z.coerce.number().nonnegative(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

hourPackagesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.hourPackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { hoursPerMonth: 'asc' }] }));
  }),
);

hourPackagesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.hourPackage.create({ data: packageSchema.parse(req.body) }));
  }),
);

hourPackagesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.hourPackage.update({ where: { id: req.params.id }, data: packageSchema.partial().parse(req.body) }),
    );
  }),
);

hourPackagesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    // pachetele deja cumparate de un client nu se sterg, ca sa nu ramana abonamente
    // fara tarife; le dezactivam, ca sa nu mai apara la selectie
    const folosit = await prisma.subscription.count({ where: { hourPackageId: req.params.id } });
    if (folosit > 0) {
      res.json(await prisma.hourPackage.update({ where: { id: req.params.id }, data: { active: false } }));
      return;
    }
    await prisma.hourPackage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
