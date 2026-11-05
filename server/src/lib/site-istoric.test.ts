/**
 * Istoricul licentelor nu se poate sterge odata cu site-ul (onDelete: Restrict),
 * pe o baza SQLite temporara facuta cu `prisma db push`, ca la deploy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const dosar = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-istoric-'));
const url = `file:${path.join(dosar, 'test.db')}`;
const serverDir = fileURLToPath(new URL('../..', import.meta.url));

test('un site cu licente emise nu se sterge; unul fara licente da', async () => {
  const push = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  assert.equal(push.status, 0, push.stderr);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const cuLicenta = await prisma.cmsSite.create({ data: { name: 'Biovitality', slug: 'biovitality' } });
    await prisma.cmsLicense.create({
      data: {
        siteId: cuLicenta.id, version: 1, issuedAt: '2026-11-05T21:00:00Z', issuedBy: 'Test <t@t.ro>',
        plugins: '{}', content: '{}', publicKey: 'x',
      },
    });
    await assert.rejects(prisma.cmsSite.delete({ where: { id: cuLicenta.id } }), (e: { code?: string }) => e.code === 'P2003');
    assert.equal(await prisma.cmsLicense.count({ where: { siteId: cuLicenta.id } }), 1);

    const fara = await prisma.cmsSite.create({ data: { name: 'Gol', slug: 'gol' } });
    await prisma.cmsSite.delete({ where: { id: fara.id } });
    assert.equal(await prisma.cmsSite.count(), 1);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dosar, { recursive: true, force: true });
  }
});
