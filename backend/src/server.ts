import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { assertProductionConfig } from './config/production';
import pool from './db/pool';
import runMigrations from './db/migrate';
import seedAdminAccount from './db/seed';
import adminAuthRoutes from './modules/adminAuth/adminAuth.routes';
import accountsRoutes from './modules/accounts/accounts.routes';
import linesRoutes from './modules/lines/lines.routes';
import workshopAuthRoutes from './modules/workshopAuth/workshopAuth.routes';
import workshopRoutes from './modules/workshop/workshop.routes';
import adminRoutes from './modules/admin/admin.routes';
import { adminRouter as adminSupportRoutes, workshopRouter as workshopSupportRoutes } from './modules/support/support.routes';
import { securityHeaders } from './middlewares/securityHeaders';
import { loginRateLimit } from './middlewares/loginRateLimit';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const TRUST_PROXY = process.env.TRUST_PROXY;

assertProductionConfig();

if (TRUST_PROXY) {
  app.set('trust proxy', TRUST_PROXY === 'true' ? 1 : TRUST_PROXY);
}

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(securityHeaders);
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use('/api/admin/auth/login', loginRateLimit);
app.use('/api/workshop/auth/login', loginRateLimit);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/accounts', accountsRoutes);
app.use('/api/admin/lines', linesRoutes);
app.use('/api/workshop/auth', workshopAuthRoutes);
app.use('/api/workshop', workshopRoutes);
app.use('/api/admin/support', adminSupportRoutes);
app.use('/api/workshop/support', workshopSupportRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start(): Promise<void> {
  try {
    await runMigrations();
    await seedAdminAccount();

    const server = app.listen(PORT, () => {
      console.log(`Sentinel backend listening on port ${PORT}`);
    });

    async function shutdown(signal: string): Promise<void> {
      console.log(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('Database pool closed');
          process.exit(0);
        } catch (err) {
          console.error('Error closing database pool:', err);
          process.exit(1);
        }
      });
    }

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();
