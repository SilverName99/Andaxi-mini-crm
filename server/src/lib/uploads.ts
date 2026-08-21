import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

/** Tipurile acceptate pentru siglă, cu extensia folosita la salvare */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** Limita pentru siglă (dupa decodare), in bytes */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** Tipurile acceptate ca atasament la o interventie */
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Limita pentru atasamente */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function ensureUploadDir(): string {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  return env.uploadDir;
}

/**
 * Salveaza o imagine trimisa ca base64 si returneaza calea publica.
 * Numele contine un timestamp, ca browserul sa nu serveasca versiunea veche
 * din cache dupa inlocuirea siglei.
 */
export function saveImage(base64: string, mimeType: string, prefix: string, stamp: number): string {
  const extension = ALLOWED_IMAGE_TYPES[mimeType];
  if (!extension) throw new Error(`Tip de fisier neacceptat: ${mimeType}`);

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Fisierul depaseste 1 MB');
  }

  const dir = ensureUploadDir();
  const fileName = `${prefix}-${stamp}.${extension}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/${fileName}`;
}

/** Sterge un fisier incarcat anterior; ignora lipsa lui */
export function deleteUpload(publicPath: string): void {
  if (!publicPath.startsWith('/uploads/')) return;
  // numele e generat de noi, dar il curatam oricum de orice incercare de iesire din folder
  const fileName = path.basename(publicPath);
  fs.rmSync(path.join(env.uploadDir, fileName), { force: true });
}

/**
 * Salveaza un atasament si returneaza calea relativa la folderul de upload.
 * Numele de pe disc e generat de noi; numele original se pastreaza doar in baza
 * de date, ca sa nu ajunga continut controlat de utilizator in cai de fisiere.
 */
export function saveAttachment(buffer: Buffer, mimeType: string, stamp: number, index: number): { path: string; size: number } {
  const extension = ALLOWED_DOC_TYPES[mimeType];
  if (!extension) throw new Error('Tip de fisier neacceptat');
  if (!buffer.byteLength) throw new Error('Fisierul este gol');
  if (buffer.byteLength > MAX_DOC_BYTES) throw new Error('Fisierul depaseste 10 MB');

  const dir = path.join(ensureUploadDir(), 'interventii');
  fs.mkdirSync(dir, { recursive: true });

  const relative = `interventii/${stamp}-${index}.${extension}`;
  fs.writeFileSync(path.join(env.uploadDir, relative), buffer);
  return { path: relative, size: buffer.byteLength };
}

/** Calea absoluta a unui fisier salvat; refuza orice iesire din folderul de upload */
export function resolveUploadPath(relative: string): string {
  const absolut = path.resolve(env.uploadDir, relative);
  const radacina = path.resolve(env.uploadDir);
  if (!absolut.startsWith(radacina + path.sep)) throw new Error('Cale invalida');
  return absolut;
}

export function deleteAttachment(relative: string): void {
  try {
    fs.rmSync(resolveUploadPath(relative), { force: true });
  } catch {
    /* fisier deja disparut — nu e nimic de facut */
  }
}
