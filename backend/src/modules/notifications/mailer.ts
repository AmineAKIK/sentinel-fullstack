import nodemailer, { Transporter } from 'nodemailer';
import logger from '../../logger';
import pool from '../../db/pool';
import { parseBooleanEnv, parsePort } from '../../config/production';

let transporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function getMailer(): Transporter | null {
  if (!isSmtpConfigured()) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parsePort(process.env.SMTP_PORT, 'SMTP_PORT', 587),
      secure: parseBooleanEnv(process.env.SMTP_SECURE, 'SMTP_SECURE', false),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    logger.info({ host: process.env.SMTP_HOST }, '[mailer] SMTP transporter initialized');
  }

  return transporter;
}

// Priorité : colonne email en base (modifiable via UI) → fallback .env (bootstrap)
export async function getAdminEmail(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ email: string | null }>(
      'SELECT email FROM admin_accounts LIMIT 1'
    );
    const dbEmail = rows[0]?.email ?? null;
    if (dbEmail) return dbEmail;
  } catch {
    // base indisponible au démarrage — fallback env
  }
  return process.env.ADMIN_EMAIL || null;
}

export function getSenderAddress(): string {
  return process.env.SMTP_FROM || 'Sentinel <noreply@sentinel.local>';
}
