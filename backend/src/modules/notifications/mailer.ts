import nodemailer, { Transporter } from 'nodemailer';
import logger from '../../logger';

let transporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.ADMIN_EMAIL);
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

export function getAdminEmail(): string | null {
  return process.env.ADMIN_EMAIL || null;
}

export function getSenderAddress(): string {
  return process.env.SMTP_FROM || 'Sentinel <noreply@sentinel.local>';
}
