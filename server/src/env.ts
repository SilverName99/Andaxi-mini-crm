import 'dotenv/config';

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
};
