import 'dotenv/config';
import { fileURLToPath } from 'node:url';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variabila de mediu ${name} lipseste. Copiaza .env.example in .env si completeaz-o.`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'file:./dev.db'),
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-secret-schimba-ma'),
  /** Origini permise pentru CORS, separate prin virgula */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  /** Durata token-ului de sesiune */
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  /** Unde se salveaza fisierele incarcate (sigla). Trebuie sa fie in afara codului,
   *  ca actualizarile aplicatiei sa nu le stearga. */
  uploadDir: process.env.UPLOAD_DIR ?? fileURLToPath(new URL('../../data/uploads', import.meta.url)),
};
