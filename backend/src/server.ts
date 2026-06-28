import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import logger from './logger';
import { assertProductionConfig } from './config/production';
import pool from './db/pool';
import runMigrations from './db/migrate';
import seedAdminAccount from './db/seed';
import authRoutes from './modules/auth/auth.routes';
import passwordResetRoutes from './modules/passwordReset/passwordReset.routes';
import adminSecurityRoutes from './modules/adminSecurity/adminSecurity.routes';
import adminSettingsRoutes from './modules/adminSettings/adminSettings.routes';
import accountsRoutes from './modules/accounts/accounts.routes';
import linesRoutes from './modules/lines/lines.routes';
import workshopRoutes from './modules/workshop/workshop.routes';
import adminRoutes from './modules/admin/admin.routes';
import { adminRouter as adminSupportRoutes, workshopRouter as workshopSupportRoutes } from './modules/support/support.routes';
import { securityHeaders } from './middlewares/securityHeaders';
import { loginRateLimit, globalApiRateLimit } from './middlewares/loginRateLimit';
import { boardRouter } from './modules/board/board.auth';
import { FIELD_LIMITS } from './domain/constants';

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

app.use(
  pinoHttp({
    logger,
    // Log 5xx at error, 4xx at warn, everything else at info
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Redact sensitive fields from request logs
    redact: ['req.headers.cookie', 'req.headers.authorization'],
  })
);

app.use(securityHeaders);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use('/api', globalApiRateLimit);
app.use('/api/board/session', loginRateLimit);
app.use('/api/auth', authRoutes);
app.use('/api/auth/password-reset', passwordResetRoutes);
// Routes admin spécifiques montées avant le routeur générique /api/admin.
app.use('/api/admin/security', adminSecurityRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/accounts', accountsRoutes);
app.use('/api/admin/lines', linesRoutes);
app.use('/api/admin/support', adminSupportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/board', boardRouter);
app.use('/api/workshop/support', workshopSupportRoutes);
app.use('/api/workshop', workshopRoutes);

app.get('/api/config', (_req, res) => {
  res.json({ fieldLimits: FIELD_LIMITS });
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

async function start(): Promise<void> {
  try {
    await runMigrations();
    await seedAdminAccount();

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Sentinel backend listening');
    });

    function shutdown(signal: string): void {
      logger.info({ signal }, 'Shutting down gracefully');
      server.close(async () => {
        try {
          await pool.end();
          logger.info('Database pool closed');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error closing database pool');
          process.exit(1);
        }
      });
    }

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  } catch (err) {
    logger.error({ err }, 'Startup error');
    process.exit(1);
  }
}

void start();
