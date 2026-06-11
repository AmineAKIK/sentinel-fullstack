import { AccountDto } from './accounts.repository';

export interface AccountRow extends AccountDto {
  password_hash?: string | null;
  password_setup_token_hash?: string | null;
}

export function toPublicAccount(row: AccountRow): AccountDto {
  const hasPassword = typeof row.has_password === 'boolean'
    ? row.has_password
    : row.password_hash !== undefined && row.password_hash !== null;
  const hasPasswordSetupCode = typeof row.has_password_setup_code === 'boolean'
    ? row.has_password_setup_code
    : Boolean(
        !hasPassword &&
        row.password_setup_token_hash &&
        row.password_setup_expires_at &&
        new Date(row.password_setup_expires_at).getTime() > Date.now()
      );

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    badge_number: row.badge_number,
    role: row.role,
    is_active: row.is_active,
    has_password: hasPassword,
    has_password_setup_code: hasPasswordSetupCode,
    password_setup_expires_at: row.password_setup_expires_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
