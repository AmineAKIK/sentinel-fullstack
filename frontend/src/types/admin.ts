import type { SentinelUser } from './common';

export interface ReferenceAuditEvent {
  id: number;
  scope: 'account' | 'line' | 'system';
  event_type: string;
  changes: Record<string, unknown> | null;
  created_at: string;
  actor_username: string | null;
  first_name: string | null;
  last_name: string | null;
  badge_number: string | null;
  line_number: string | null;
}

export interface ReferenceDashboard {
  users_total: number;
  users_active: number;
  users_inactive: number;
  users_without_password: number;
  lines_total: number;
  lines_active: number;
  lines_inactive: number;
  machines_total: number;
  active_lines_without_machines: number;
  recent_events: ReferenceAuditEvent[];
}

export interface ReferenceQuality {
  users_without_password: Array<Pick<SentinelUser, 'id' | 'first_name' | 'last_name' | 'badge_number' | 'role'>>;
  inactive_users: Array<Pick<SentinelUser, 'id' | 'first_name' | 'last_name' | 'badge_number' | 'role'>>;
  inactive_lines: Array<{ id: number; line_number: string; machine_count: number }>;
  malformed_machines: Array<{ line_id: number; line_number: string; machine_id: string; issue: string }>;
  duplicate_machines: Array<{ machine_id: string; line_numbers: string[] }>;
}
