import { prisma } from '../prisma.js';
import { addDays, today } from './dates.js';
import { isCycle, nextDue, periodEnd, type Cycle } from './cycles.js';

/** Cate zile in avans generam pozitiile de facturat */
export const HORIZON_DAYS = 60;
const MAX_ITERATIONS = 600;

/**
 * Genereaza pozitiile de facturat pentru toate abonamentele active, pana la
 * `HORIZON_DAYS` in viitor. Operatia e idempotenta: pozitiile existente nu se
 * dubleaza (constrangere unica pe subscriptionId + periodStart), deci poate fi
 * apelata la fiecare cerere fara efecte secundare.
 *
 * @returns numarul de pozitii nou create
 */
export async function syncBillingItems(now: string = today()): Promise<number> {
  const horizon = addDays(now, HORIZON_DAYS);
  const subscriptions = await prisma.subscription.findMany({ where: { status: 'ACTIVE' } });
  let created = 0;

  for (const sub of subscriptions) {
    if (!isCycle(sub.cycle)) continue;
    const cycle: Cycle = sub.cycle;
    let due = sub.nextDueDate;
    let iterations = 0;

    while (due <= horizon && iterations < MAX_ITERATIONS) {
      if (sub.endDate && due > sub.endDate) break;
      iterations += 1;

      const existing = await prisma.billingItem.findUnique({
        where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: due } },
      });
      if (!existing) {
        await prisma.billingItem.create({
          data: {
            subscriptionId: sub.id,
            clientId: sub.clientId,
            periodStart: due,
            periodEnd: periodEnd(due, cycle),
            dueDate: due,
            amountEur: sub.amountEur,
          },
        });
        created += 1;
      }
      due = nextDue(due, cycle);
    }

    if (due !== sub.nextDueDate) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { nextDueDate: due } });
    }
  }

  return created;
}
