/**
 * Site-uri: site-urile de pe CMS-ul Andaxi, pluginurile fiecaruia si licentele
 * semnate (licenta.json). Doar pentru contul de administrare (requireAuth in index.ts).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { CLIENT_REF } from '../lib/selects.js';
import { catalogCms, cheiCatalog } from '../lib/catalog-cms.js';
import { cheiePrivata, genereazaPereche, stareCheie } from '../lib/licenta-chei.js';
import {
  cheiePublicaBase64, cheiePublicaDinBase64, construiesteLicenta, semneazaLicenta, verificaSemnatura, SLUG_SITE, STARI,
  type StarePlugin,
} from '../lib/licenta.js';
import { pingSite } from '../lib/ping-site.js';
import { genereazaCheieSite, pluginuriCanonice } from '../lib/site-api.js';

export const sitesRouter = Router();

/**
 * Ca restul aplicatiei, ne bazam pe cookie-ul SameSite=Lax si pe CORS; aici in
 * plus cerem ca orice POST/PUT/PATCH sa fie JSON. Un formular de pe alt site nu
 * poate trimite application/json fara preflight, iar preflight-ul il opreste CORS-ul.
 */
function doarJson(req: Request, _res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    next(new HttpError(415, 'Cererea trebuie trimisa ca JSON'));
    return;
  }
  next();
}
sitesRouter.use(doarJson);

const stareSchema = z.enum(STARI);

/** Domeniul fara https://, fara cale si fara „/" la final */
function normalizeazaDomeniu(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

const siteSchema = z.object({
  name: z.string().trim().min(1, 'Numele este obligatoriu'),
  domain: z
    .string()
    .default('')
    .transform(normalizeazaDomeniu)
    .refine((d) => d === '' || /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d), 'Domeniu invalid (ex. biovitality.ro)'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_SITE, 'Slug-ul are doar litere mici, cifre si „-" (ex. biovitality)'),
  clientId: z.string().nullable().optional(),
  notes: z.string().default(''),
  plugins: z.record(stareSchema).default({}),
});

function verificaPluginuri(plugins: Record<string, StarePlugin>): Record<string, StarePlugin> {
  const cunoscute = new Set(cheiCatalog());
  const necunoscute = Object.keys(plugins).filter((k) => !cunoscute.has(k));
  if (necunoscute.length > 0) {
    throw new HttpError(400, `Pluginuri necunoscute in catalog: ${necunoscute.join(', ')}`);
  }
  // pastram doar ce nu e oprit; lipsa = oprit, ca in licenta
  return Object.fromEntries(Object.entries(plugins).filter(([, stare]) => stare !== 'oprit'));
}

function citestePluginuri(json: string): Record<string, StarePlugin> {
  try {
    const date = JSON.parse(json) as Record<string, StarePlugin>;
    return date && typeof date === 'object' ? date : {};
  } catch {
    return {};
  }
}

/** Ce vede interfata despre o licenta emisa (textul e public, nu e secret) */
function licentaDto(l: {
  id: string; version: number; issuedAt: string; issuedBy: string; plugins: string; publicKey: string; createdAt: Date;
}) {
  return {
    id: l.id,
    version: l.version,
    issuedAt: l.issuedAt,
    issuedBy: l.issuedBy,
    plugins: citestePluginuri(l.plugins),
    publicKey: l.publicKey,
    createdAt: l.createdAt,
  };
}

/* ------------------------------------------------------------- catalogul */

sitesRouter.get('/catalog', (_req, res) => {
  res.json(catalogCms());
});

/* ----------------------------------------------------------------- cheile */

sitesRouter.get(
  '/cheie',
  asyncHandler(async (_req, res) => {
    res.json(stareCheie());
  }),
);

const CONFIRMARE_ROTATIE = 'ROTESC CHEIA';

sitesRouter.post(
  '/cheie',
  asyncHandler(async (req, res) => {
    const { rotatie, confirmare, cheieActuala } = z
      .object({ rotatie: z.boolean().default(false), confirmare: z.string().default(''), cheieActuala: z.string().default('') })
      .parse(req.body);
    const exista = stareCheie().exista;
    if (exista && !(rotatie && confirmare.trim().toUpperCase() === CONFIRMARE_ROTATIE)) {
      throw new HttpError(
        409,
        `Exista deja o pereche de chei. Pentru o cheie noua scrie „${CONFIRMARE_ROTATIE}" in caseta de confirmare.`,
      );
    }
    // rotatia se face doar daca cheia de acum e cea vazuta in pagina (vezi genereazaPereche)
    const stare = genereazaPereche({ rotatie: exista, cheieAsteptata: cheieActuala });
    console.log(`[licente] ${exista ? 'rotatie: pereche noua de chei' : 'pereche de chei generata'} de ${req.user?.email}`);
    res.status(201).json(stare);
  }),
);

/* ---------------------------------------------------------- pingul site-urilor */

sitesRouter.get(
  '/stare',
  asyncHandler(async (_req, res) => {
    const sites = await prisma.cmsSite.findMany({ where: { domain: { not: '' } }, select: { id: true, domain: true } });
    const stari = await Promise.all(sites.map(async (s) => [s.id, await pingSite(s.domain)] as const));
    res.json(Object.fromEntries(stari));
  }),
);

/* ---------------------------------------------------------------- site-urile */

const SITE_INCLUDE = {
  client: { select: CLIENT_REF },
  licenses: { orderBy: { version: 'desc' as const } },
};

type SiteCuLicente = Awaited<ReturnType<typeof gasesteSite>>;

async function gasesteSite(id: string) {
  return prisma.cmsSite.findUniqueOrThrow({ where: { id }, include: SITE_INCLUDE });
}

function siteDto(site: SiteCuLicente) {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    slug: site.slug,
    clientId: site.clientId,
    client: site.client,
    notes: site.notes,
    plugins: citestePluginuri(site.plugins),
    licenses: site.licenses.map(licentaDto),
    /** Cheia de preluare: doar daca exista si de cand (cheia insasi nu se mai arata) */
    cheieSite: { exista: site.fetchKeyHash !== '', creataLa: site.fetchKeyCreatedAt },
    /** Ultima preluare a licentei de catre site (GET /api/site/licenta) */
    ultimaPreluare: site.lastFetchAt
      ? { la: site.lastFetchAt, versiune: site.lastFetchVersion, ip: site.lastFetchIp }
      : null,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

sitesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const sites = await prisma.cmsSite.findMany({ orderBy: { name: 'asc' }, include: SITE_INCLUDE });
    res.json(sites.map(siteDto));
  }),
);

sitesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(siteDto(await gasesteSite(req.params.id)));
  }),
);

sitesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = siteSchema.parse(req.body);
    const site = await prisma.cmsSite.create({
      data: { ...data, clientId: data.clientId || null, plugins: JSON.stringify(verificaPluginuri(data.plugins)) },
    });
    res.status(201).json(siteDto(await gasesteSite(site.id)));
  }),
);

/**
 * Salvarea unui site. Cand lista de pluginuri difera de cea din ultima licenta
 * emisa, CRM-ul semneaza singur o licenta noua (versiunea urmatoare), in aceeasi
 * tranzactie: site-ul o ia la urmatoarea preluare (GET /api/site/licenta, la cel
 * mult 5 minute). Fara pereche de chei se salveaza doar lista, ca pana acum.
 */
sitesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = siteSchema.partial().parse(req.body);
    const existent = await gasesteSite(req.params.id);
    if (data.slug && data.slug !== existent.slug && existent.licenses.length > 0) {
      // o licenta emisa e legata de slug: schimbarea lui ar face istoricul sa minta
      throw new HttpError(400, 'Slug-ul nu se mai poate schimba dupa prima licenta emisa. Fa un site nou.');
    }
    const plugins = data.plugins ? verificaPluginuri(data.plugins) : null;
    const cheie = plugins && stareCheie().exista ? cheiePrivata() : null;
    const user = req.user!;

    const licentaNoua = await cuReincercare(() =>
      prisma.$transaction(async (tx) => {
        const site = await tx.cmsSite.update({
          where: { id: req.params.id },
          data: {
            ...data,
            ...(data.clientId !== undefined ? { clientId: data.clientId || null } : {}),
            ...(plugins ? { plugins: JSON.stringify(plugins) } : {}),
          },
        });
        if (!plugins || !cheie) return null;
        const ultima = await tx.cmsLicense.findFirst({ where: { siteId: site.id }, orderBy: { version: 'desc' } });
        if (ultima && pluginuriCanonice(citestePluginuri(ultima.plugins)) === pluginuriCanonice(plugins)) return null;
        if (!ultima && Object.keys(plugins).length === 0) return null;
        return emiteLicenta(tx, { site, ultimaVersiune: ultima?.version ?? 0, cheie, emisaDe: `${user.name} <${user.email}> (automat la salvare)` });
      }),
    );
    if (licentaNoua) console.log(`[licente] ${existent.slug} v${licentaNoua.version} emisa automat la salvare de ${user.email}`);
    res.json({ ...siteDto(await gasesteSite(req.params.id)), licentaNoua: licentaNoua ? licentaDto(licentaNoua) : null });
  }),
);

/** Cheia de preluare a site-ului: se arata o singura data; una noua o inlocuieste pe cea veche */
sitesRouter.post(
  '/:id/cheie-site',
  asyncHandler(async (req, res) => {
    const { rotatie } = z.object({ rotatie: z.boolean().default(false) }).parse(req.body);
    const site = await prisma.cmsSite.findUniqueOrThrow({ where: { id: req.params.id } });
    if (site.fetchKeyHash !== '' && !rotatie) {
      throw new HttpError(409, 'Site-ul are deja o cheie. Una noua o inlocuieste pe cea veche (site-ul trebuie sa primeasca noua cheie in .env).');
    }
    const { cheie, hash } = genereazaCheieSite(site.id);
    // conditionat de hash-ul vazut acum: doua apasari deodata nu lasa doua chei „valabile" in doua ferestre
    const schimbate = await prisma.cmsSite.updateMany({
      where: { id: site.id, fetchKeyHash: site.fetchKeyHash },
      data: { fetchKeyHash: hash, fetchKeyCreatedAt: new Date() },
    });
    if (schimbate.count !== 1) throw new HttpError(409, 'Cheia a fost schimbata intre timp. Reincarca pagina.');
    console.log(`[licente] ${site.slug}: ${site.fetchKeyHash ? 'cheie de preluare noua (rotatie)' : 'cheie de preluare generata'} de ${req.user?.email}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ cheie });
  }),
);

sitesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    // istoricul licentelor nu se sterge: un site cu licente emise ramane (si baza il apara, onDelete: Restrict)
    const licente = await prisma.cmsLicense.count({ where: { siteId: req.params.id } });
    if (licente > 0) {
      throw new HttpError(
        409,
        `Site-ul are ${licente} ${licente === 1 ? 'licenta emisa' : 'licente emise'}; nu se sterge, ca sa ramana istoricul.`,
      );
    }
    await prisma.cmsSite.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

/* ---------------------------------------------------------------- licentele */

type Tranzactie = Prisma.TransactionClient;

/**
 * Semneaza lista de pluginuri a site-ului si o salveaza ca licenta noua (cea
 * curenta: versiunea cea mai mare). Versiunea creste mereu; site-ul refuza una mai mica.
 */
async function emiteLicenta(
  tx: Tranzactie,
  input: { site: { id: string; slug: string; plugins: string }; ultimaVersiune: number; cheie: ReturnType<typeof cheiePrivata>; emisaDe: string; versiune?: number },
) {
  const continut = construiesteLicenta({
    site: input.site.slug,
    versiune: input.versiune ?? input.ultimaVersiune + 1,
    emisaLa: new Date(),
    stari: verificaPluginuri(citestePluginuri(input.site.plugins)),
    ordine: cheiCatalog(),
  });
  const text = semneazaLicenta(continut, input.cheie);
  const cheiePublica = cheiePublicaBase64(input.cheie);
  // plasa de siguranta: nu salvam o licenta pe care n-am putea-o verifica noi insine
  if (!verificaSemnatura(text, cheiePublicaDinBase64(cheiePublica))) {
    throw new HttpError(500, 'Licenta semnata nu se verifica. Nu a fost salvata.');
  }
  return tx.cmsLicense.create({
    data: {
      siteId: input.site.id,
      version: continut.versiune,
      issuedAt: continut.emisa_la,
      issuedBy: input.emisaDe,
      plugins: JSON.stringify(continut.pluginuri),
      content: text,
      publicKey: cheiePublica,
    },
  });
}

/** Doua salvari deodata pot lua aceeasi versiune (unica pe site): a doua se reia o data */
async function cuReincercare<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fn();
    throw error;
  }
}

/** Emiterea de mana: o versiune aleasa, sau re-semnarea listei salvate (de exemplu dupa o rotatie a cheii) */
sitesRouter.post(
  '/:id/licente',
  asyncHandler(async (req, res) => {
    const { versiune } = z.object({ versiune: z.number().int().min(1).max(2_000_000_000).optional() }).parse(req.body);
    const cheie = cheiePrivata();
    const user = req.user!;
    const licenta = await cuReincercare(() =>
      prisma.$transaction(async (tx) => {
        const site = await tx.cmsSite.findUniqueOrThrow({ where: { id: req.params.id } });
        const ultima = (await tx.cmsLicense.findFirst({ where: { siteId: site.id }, orderBy: { version: 'desc' } }))?.version ?? 0;
        if (versiune !== undefined && versiune <= ultima) {
          throw new HttpError(400, `Versiunea trebuie sa fie mai mare decat ultima emisa (${ultima}).`);
        }
        return emiteLicenta(tx, { site, ultimaVersiune: ultima, cheie, emisaDe: `${user.name} <${user.email}>`, versiune });
      }),
    );
    const site = await prisma.cmsSite.findUniqueOrThrow({ where: { id: req.params.id }, select: { slug: true } });
    console.log(`[licente] ${site.slug} v${licenta.version} emisa de ${user.email}`);
    res.status(201).json(licentaDto(licenta));
  }),
);

sitesRouter.get(
  '/:id/licente/:licentaId/licenta.json',
  asyncHandler(async (req, res) => {
    const licenta = await prisma.cmsLicense.findFirstOrThrow({
      where: { id: req.params.licentaId, siteId: req.params.id },
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="licenta.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(licenta.content);
  }),
);
