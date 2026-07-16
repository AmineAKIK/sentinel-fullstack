export type Role = 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE';
export type SortField = 'alphabetical' | 'created_at';
export type SortOrder = 'asc' | 'desc';

export interface AdminInfo {
  id: number;
  username: string;
}

export interface WorkshopUser {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: Role;
}

export interface WorkshopPasswordSetupRequired {
  requiresPasswordSetup: true;
  badge_number?: string;
}

export interface WorkshopPasswordRequired {
  requiresPassword: true;
  badge_number?: string;
}

export interface SentinelUser {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: Role;
  is_active: boolean;
  email?: string | null;
  has_password: boolean;
  has_password_setup_code: boolean;
  password_setup_expires_at: string | null;
  password_setup_code?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
