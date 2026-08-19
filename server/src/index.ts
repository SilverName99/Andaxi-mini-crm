import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express, { type Request } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { billingRouter } from './routes/billing.js';
import { workLogsRouter } from './routes/worklogs.js';
import { tasksRouter } from './routes/tasks.js';
import { settingsRouter } from './routes/settings.js';
import { dashboardRouter } from './routes/dashboard.js';

const app = express();

/**
 * In productie frontend-ul e servit de acelasi proces, deci Origin-ul cererilor
 * este chiar host-ul aplicatiei; il acceptam mereu. In rest permitem doar
 * originile din CORS_ORIGINS (serverul de dezvoltare Vite, de exemplu).
 */
const corsDelegate: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin;
  if (!origin) return callback(null, { origin: true, credentials: true });

  const host = req.headers.host;
  const sameOrigin = host ? origin === `http://${host}` || origin === `https://${host}` : false;
  if (sameOrigin || env.corsOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  callback(null, { origin: false });
};

app.use(cors(corsDelegate));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'andaxi-mini-crm' }));

app.use('/api/auth', authRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/subscriptions', requireAuth, subscriptionsRouter);
app.use('/api/billing', requireAuth, billingRouter);
app.use('/api/worklogs', requireAuth, workLogsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

// In productie servim si build-ul de frontend din acelasi proces (un singur port de expus)
const webDist = path.resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[andaxi-mini-crm] API pornit pe http://localhost:${env.port}`);
});
