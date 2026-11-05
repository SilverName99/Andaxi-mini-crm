/**
 * Perechea de chei Ed25519 a CRM-ului, cu care se semneaza licentele site-urilor.
 *
 * Cheia privata sta intr-un singur fisier PEM (PKCS#8), in afara codului si a
 * git-ului (implicit data/licenta/cheie-privata.pem, sau LICENTA_CHEIE_PRIVATA),
 * cu drepturi 0600. Nu iese niciodata din acest modul: nu se trimite in raspunsuri,
 * nu se scrie in jurnal, nu se poate descarca. Spre exterior pleaca doar cheia
 * publica, in forma base64 pe care o asteapta CMS-ul (LICENTA_CHEIE_PUBLICA).
 *
 * La o rotatie, cheia veche nu se sterge: se redenumeste in
 * `cheie-privata.<data>.pem.veche` (tot 0600), ca sa poata fi recuperata.
 */
import crypto, { type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { HttpError } from '../middleware/errors.js';
import { cheiePublicaBase64 } from './licenta.js';

export interface StareCheie {
  exista: boolean;
  /** base64, 32 de octeti: valoarea pentru LICENTA_CHEIE_PUBLICA / --cheie-licenta= */
  cheiePublica: string | null;
  creataLa: string | null;
  /** Unde e fisierul pe server (calea, nu continutul), pentru backup */
  fisier: string;
  /** Cheile publice ale perechilor retrase la o rotatie, cele mai noi primele */
  cheiVechi: { cheiePublica: string; retrasaLa: string }[];
}

function fisierCheie(): string {
  return path.resolve(env.licentaCheiePrivata);
}

/** Citeste cheia privata; repara drepturile daca fisierul a ajuns mai larg de 0600. */
function citesteCheie(fisier: string): KeyObject {
  const stat = fs.statSync(fisier);
  if ((stat.mode & 0o077) !== 0) {
    try {
      fs.chmodSync(fisier, 0o600);
    } catch {
      /* fisierul ramane cum e; nu e o eroare care sa opreasca semnarea */
    }
  }
  const cheie = crypto.createPrivateKey(fs.readFileSync(fisier));
  if (cheie.asymmetricKeyType !== 'ed25519') {
    throw new HttpError(500, 'Fisierul cheii private nu contine o cheie Ed25519.');
  }
  return cheie;
}

export function stareCheie(): StareCheie {
  const fisier = fisierCheie();
  const cheiVechi: StareCheie['cheiVechi'] = [];
  const dosar = path.dirname(fisier);
  const baza = path.basename(fisier, '.pem');
  if (fs.existsSync(dosar)) {
    for (const nume of fs.readdirSync(dosar)) {
      if (!nume.startsWith(`${baza}.`) || !nume.endsWith('.pem.veche')) continue;
      try {
        const cale = path.join(dosar, nume);
        cheiVechi.push({
          cheiePublica: cheiePublicaBase64(citesteCheie(cale)),
          retrasaLa: fs.statSync(cale).mtime.toISOString(),
        });
      } catch {
        /* un fisier stricat nu ascunde restul */
      }
    }
  }
  cheiVechi.sort((a, b) => b.retrasaLa.localeCompare(a.retrasaLa));

  if (!fs.existsSync(fisier)) {
    return { exista: false, cheiePublica: null, creataLa: null, fisier, cheiVechi };
  }
  return {
    exista: true,
    cheiePublica: cheiePublicaBase64(citesteCheie(fisier)),
    creataLa: fs.statSync(fisier).mtime.toISOString(),
    fisier,
    cheiVechi,
  };
}

/** Cheia privata pentru semnare; 409 daca perechea nu a fost generata inca. */
export function cheiePrivata(): KeyObject {
  const fisier = fisierCheie();
  if (!fs.existsSync(fisier)) {
    throw new HttpError(409, 'Nu exista inca perechea de chei. Apasa intai „Genereaza perechea de chei".');
  }
  return citesteCheie(fisier);
}

/** Lacatul rotatiei: in proces si, pentru un al doilea proces, un fisier facut cu „wx" */
let ocupat = false;
const LACAT_VECHI_MS = 10 * 60_000;

function cuLacat<T>(dosar: string, fn: () => T): T {
  if (ocupat) throw new HttpError(409, 'Se genereaza deja o pereche de chei. Incearca din nou peste cateva secunde.');
  const lacat = path.join(dosar, '.chei.lock');
  try {
    // un lacat ramas de la un proces oprit brusc nu blocheaza pentru totdeauna
    if (Date.now() - fs.statSync(lacat).mtimeMs > LACAT_VECHI_MS) fs.unlinkSync(lacat);
  } catch {
    /* nu exista lacat */
  }
  let fd: number;
  try {
    fd = fs.openSync(lacat, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new HttpError(409, 'Se genereaza deja o pereche de chei. Incearca din nou peste cateva secunde.');
    }
    throw error;
  }
  ocupat = true;
  try {
    return fn();
  } finally {
    ocupat = false;
    fs.closeSync(fd);
    fs.rmSync(lacat, { force: true });
  }
}

/** Scrie cheia intr-un fisier temporar 0600, complet si sincronizat pe disc */
function scrieTemporar(dosar: string, pem: string): string {
  const temporar = path.join(dosar, `.cheie-noua.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const fd = fs.openSync(temporar, 'wx', 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeSync(fd, pem);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return temporar;
}

/**
 * Face perechea de chei. Refuza daca exista deja una, in afara de o rotatie
 * confirmata explicit (atunci cheia veche se pastreaza ca `.pem.veche`).
 *
 * Rotatia e serializata (lacatul de mai sus) si conditionata: se face doar daca
 * cheia de acum e chiar `cheieAsteptata` (cea pe care omul a vazut-o in pagina).
 * Asa doua apasari deodata, sau doua ferestre, nu rotesc de doua ori. Cheia noua
 * se scrie intai complet intr-un fisier temporar si apoi se leaga sub numele final
 * (link: esueaza daca numele e luat), deci nu ramane niciodata o cheie pe jumatate.
 */
export function genereazaPereche(opt: { rotatie: boolean; cheieAsteptata?: string }): StareCheie {
  const fisier = fisierCheie();
  const dosar = path.dirname(fisier);
  fs.mkdirSync(dosar, { recursive: true, mode: 0o700 });

  return cuLacat(dosar, () => {
    const exista = fs.existsSync(fisier);
    if (exista && !opt.rotatie) {
      throw new HttpError(409, 'Exista deja o pereche de chei. O a doua se face doar printr-o rotatie confirmata.');
    }
    if (!exista && opt.rotatie) {
      throw new HttpError(409, 'Nu exista o pereche de chei de rotit. Reincarca pagina.');
    }
    if (exista && cheiePublicaBase64(citesteCheie(fisier)) !== (opt.cheieAsteptata ?? '').trim()) {
      throw new HttpError(409, 'Cheia a fost schimbata intre timp. Reincarca pagina si verifica cheia publica de acum.');
    }

    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const temporar = scrieTemporar(dosar, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
    let vechi: string | null = null;
    try {
      if (exista) {
        const marcaj = new Date().toISOString().replace(/[:.]/g, '-');
        vechi = fisier.replace(/\.pem$/, '') + `.${marcaj}.pem.veche`;
        fs.renameSync(fisier, vechi);
        fs.chmodSync(vechi, 0o600);
        // data fisierului = momentul retragerii (asa o arata interfata)
        const acum = new Date();
        fs.utimesSync(vechi, acum, acum);
      }
      try {
        fs.linkSync(temporar, fisier);
      } catch (error) {
        // nu lasam site-urile fara cheie: cea veche se pune la loc
        if (vechi && !fs.existsSync(fisier)) fs.renameSync(vechi, fisier);
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new HttpError(409, 'Exista deja o pereche de chei (tocmai a fost generata).');
        }
        throw error;
      }
    } finally {
      fs.rmSync(temporar, { force: true });
    }
    return stareCheie();
  });
}
