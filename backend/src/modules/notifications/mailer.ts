import nodemailer, { Transporter } from 'nodemailer';
import logger from '../../logger';
import pool from '../../db/pool';

let transporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function getMailer(): Transporter | null {
  if (!isSmtpConfigured()) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
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
