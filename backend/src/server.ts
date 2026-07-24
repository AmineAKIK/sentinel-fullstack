import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import logger from './logger';
import { httpLoggingOptions } from './httpLogging';
import { assertProductionConfig, parsePort, parseTrustProxy } from './config/production';
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
import {
  adminRouter as adminSupportRoutes,
  workshopRouter as workshopSupportRoutes,
} from './modules/support/support.routes';
import { securityHeaders } from './middlewares/securityHeaders';
import { loginRateLimit, globalApiRateLimit } from './middlewares/loginRateLimit';
import { boardRouter } from './modules/board/board.auth';
import { FIELD_LIMITS } from './domain/constants';
import { startNotificationOutboxWorker } from './modules/notifications/notificationOutbox.worker';
import { apiErrorHandler, apiNotFoundHandler } from './middlewares/apiErrors';

const app = express();
app.disable('x-powered-by');
const PORT = parsePort(process.env.PORT, 'PORT', 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

assertProductionConfig();

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== false) {
  app.set('trust proxy', trustProxy);
}

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(pinoHttp(httpLoggingOptions(logger)));

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
    res.json({
      status: 'ok',
      db: 'ok',
      version: process.env.BUILD_SHA || 'development',
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'unreachable',
      version: process.env.BUILD_SHA || 'development',
    });
  }
});

app.use('/api', apiNotFoundHandler);
app.use(apiErrorHandler);

async function start(): Promise<void> {
  try {
    await runMigrations();
    await seedAdminAccount();

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Sentinel backend listening');
    });
    const notificationWorker = startNotificationOutboxWorker();
    let shuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down gracefully');
      const closeServer = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      const forceCloseTimer = setTimeout(() => {
        logger.warn('HTTP shutdown deadline reached; closing remaining connections');
        server.closeAllConnections();
      }, 10_000);
      forceCloseTimer.unref();

      try {
        await Promise.all([notificationWorker.stop(), closeServer]);
        clearTimeout(forceCloseTimer);
        await pool.end();
        logger.info('Database pool closed');
        process.exit(0);
      } catch (err) {
        clearTimeout(forceCloseTimer);
        logger.error({ err }, 'Graceful shutdown failed');
        process.exit(1);
      }
    }

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (err) {
    logger.error({ err }, 'Startup error');
    process.exit(1);
  }
}

void start();
