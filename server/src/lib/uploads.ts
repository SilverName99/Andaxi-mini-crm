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

/** Limita de marime a fisierului incarcat (dupa decodare), in bytes */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

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
