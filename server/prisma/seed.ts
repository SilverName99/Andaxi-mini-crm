import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { addDays, addMonths, startOfMonth, today } from '../src/lib/dates.js';
import { splitWorkInterval } from '../src/lib/rates.js';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_EMAIL ?? 'admin@andaxi.ro').toLowerCase();
  const password = process.env.SEED_PASSWORD ?? 'schimba-parola';
  const name = process.env.SEED_NAME ?? 'Administrator';

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`✔ Cont: ${user.email}`);

  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', companyName: 'Andaxi', companyEmail: email },
  });
  console.log('✔ Setari initializate (45 €/h standard, 90 €/h in afara programului, curs EUR/RON)');

  if (process.env.SEED_DEMO !== 'true') {
    console.log('ℹ Date demo sarite (seteaza SEED_DEMO=true daca le vrei).');
    return;
  }

  if ((await prisma.client.count()) > 0) {
    console.log('ℹ Exista deja clienti — nu adaug date demo.');
    return;
  }

  const now = today();
  const demo = [
    {
      client: {
        name: 'Mihai Popescu', company: 'Terra Construct SRL', cui: 'RO12345678', city: 'Cluj-Napoca',
        email: 'contact@terraconstruct.ro', phone: '0740 111 222', color: 'violet', contact: 'Mihai Popescu',
      },
      subs: [
        { label: 'Gazduire + mentenanta site prezentare', kind: 'HOSTING_MENTENANTA', product: 'PREZENTARE', amountEur: 45, cycle: 'MONTHLY', startDate: addMonths(startOfMonth(now), -4) },
      ],
    },
    {
      client: {
        name: 'Ana Ionescu', company: 'BioShop Online SRL', cui: 'RO87654321', city: 'Bucuresti',
        email: 'ana@bioshop.ro', phone: '0722 333 444', color: 'emerald', contact: 'Ana Ionescu',
      },
      subs: [
        { label: 'Gazduire magazin online', kind: 'HOSTING', product: 'ECOMMERCE', amountEur: 120, cycle: 'MONTHLY', startDate: addMonths(startOfMonth(now), -6) },
        { label: 'Mentenanta CRM intern', kind: 'MENTENANTA', product: 'CRM', amountEur: 480, cycle: 'SEMIANNUAL', startDate: addMonths(startOfMonth(now), -3) },
      ],
    },
    {
      client: {
        name: 'Radu Marin', company: 'Alpin Logistics SA', cui: 'RO11223344', city: 'Brasov',
        email: 'office@alpinlogistics.ro', phone: '0733 555 666', color: 'amber', contact: 'Radu Marin',
      },
      subs: [
        { label: 'Mentenanta ERP', kind: 'MENTENANTA', product: 'ERP', amountEur: 1800, cycle: 'ANNUAL', startDate: addMonths(startOfMonth(now), -8) },
      ],
    },
    {
      client: {
        name: 'Elena Dumitru', company: 'Studio Nova', city: 'Timisoara', email: 'elena@studionova.ro',
        phone: '0755 777 888', color: 'rose', status: 'PROSPECT', contact: 'Elena Dumitru',
        notes: 'Vrea landing page + gazduire, de revenit cu oferta.',
      },
      subs: [],
    },
  ];

  for (const entry of demo) {
    const client = await prisma.client.create({ data: entry.client });
    for (const s of entry.subs) {
      await prisma.subscription.create({
        data: { ...s, clientId: client.id, nextDueDate: s.startDate },
      });
    }
  }

  const clients = await prisma.client.findMany({ where: { status: 'ACTIVE' } });
  const rateConfig = {
    standardRate: settings.standardRate,
    offHoursRate: settings.offHoursRate,
    standardStart: settings.standardStart,
    standardEnd: settings.standardEnd,
    weekendOffHours: settings.weekendOffHours,
  };

  const logs = [
    { offset: -2, start: 10 * 60, end: 12 * 60 + 30, category: 'SUPORT', description: 'Actualizare plugin-uri si verificare backup' },
    { offset: -5, start: 21 * 60, end: 23 * 60, category: 'INTERVENTIE', description: 'Interventie urgenta: site cazut dupa update PHP' },
    { offset: -9, start: 14 * 60, end: 17 * 60, category: 'DEZVOLTARE', description: 'Modul nou de raportare in CRM' },
    { offset: -14, start: 9 * 60, end: 11 * 60, category: 'CONSULTANTA', description: 'Sedinta de analiza flux comenzi' },
    { offset: -20, start: 18 * 60, end: 20 * 60 + 30, category: 'INTERVENTIE', description: 'Migrare DNS si certificat SSL' },
  ];

  for (const [index, log] of logs.entries()) {
    const client = clients[index % clients.length];
    const date = addDays(now, log.offset);
    const split = splitWorkInterval(date, log.start, log.end, rateConfig);
    await prisma.workLog.create({
      data: {
        clientId: client.id,
        date,
        startMinutes: log.start,
        endMinutes: log.end,
        description: log.description,
        category: log.category,
        standardMinutes: split.standardMinutes,
        offHoursMinutes: split.offHoursMinutes,
        standardRate: rateConfig.standardRate,
        offHoursRate: rateConfig.offHoursRate,
        amountEur: split.amountEur,
      },
    });
  }

  await prisma.task.createMany({
    data: [
      { title: 'De trimis oferta pentru landing page', details: 'Studio Nova — landing page + gazduire', dueDate: addDays(now, 3), priority: 'HIGH' },
      { title: 'Reinnoire certificat SSL', details: 'Expira luna viitoare', dueDate: addDays(now, 12), priority: 'MEDIUM' },
      { title: 'Backup lunar bazele de date', dueDate: addDays(now, 1), priority: 'MEDIUM' },
    ],
  });

  console.log(`✔ Date demo: ${demo.length} clienti, abonamente, ${logs.length} interventii, 3 task-uri`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
