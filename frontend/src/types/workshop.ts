import type { Role } from './common';

export type IncidentState =
  | 'SKIPEE_PAR_MACHINE'
  | 'SKIPEE_PAR_CONDUCTEUR'
  | 'DEGRADEE'
  | 'INDISPONIBLE';
export type IncidentStatus = 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';

export interface WorkshopIncident {
  id: number;
  user_id: number;
  line_id: number;
  line_number: string;
  machine_id: string;
  machine_brand: string;
  robot_label: string;
  head_number: number;
  state: IncidentState;
  comment: string | null;
  current_product: string | null;
  is_taken: boolean;
  is_priority: boolean;
  status: IncidentStatus;
  diagnostic: string | null;
  intervention_note: string | null;
  responsible_comment: string | null;
  edit_request: Record<string, unknown> | null;
  cancel_request?: boolean;
  cancel_request_reason?: string | null;
  delete_request?: boolean;
  delete_request_reason?: string | null;
  taken_by_user_id: number | null;
  taken_at: string | null;
  taken_by_first_name: string | null;
  taken_by_last_name: string | null;
  taken_by_role: Role | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  is_followed?: boolean;
  followed_at?: string | null;
  arbitration?: {
    edit?: WorkshopArbitrationRequestState;
    cancel?: WorkshopArbitrationRequestState;
  } | null;
  first_name: string;
  last_name: string;
  badge_number: string | null;
  role: Role;
}

export interface WorkshopArbitrationRequestState {
  requestEventId: number;
  requestedAt: string;
  state: 'ACTIVE' | 'WAITING';
  consultedAt?: string | null;
  consultedByUserId?: number | null;
}

export interface WorkshopIncidentEvent {
  id: number;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  badge_number: string | null;
  role: Role | null;
}

export interface WorkshopHistoryEvent extends WorkshopIncidentEvent {
  incident_id: number;
  line_id: number;
  line_number: string;
  machine_id: string;
  robot_label: string;
  head_number: number;
  state: IncidentState;
  status: IncidentStatus;
}

export interface WorkshopIncidentMetrics {
  total: number;
  open: number;
  pending: number;
  priority: number;
  taken: number;
  not_taken: number;
  open_over_7d: number;
  closed_today: number;
  assigned_to_me?: number;
  followed?: number;
  followed_resolved?: number;
  arbitration_unread?: number;
}

export interface WorkshopBoardLine {
  id: number;
  line_number: string;
}

export interface WorkshopBoardIncident {
  id: number;
  line_id: number;
  line_number: string;
  machine_id: string;
  robot_label: string;
  head_number: number;
  state: IncidentState;
  current_product: string | null;
  is_taken: boolean;
  is_priority: boolean;
  responsible_comment: string | null;
  status: 'OPEN' | 'PENDING';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkshopBoardMetrics {
  total: number;
  open: number;
  pending: number;
  open_over_7d: number;
}

export interface WorkshopBoardData {
  lines: WorkshopBoardLine[];
  incidents: WorkshopBoardIncident[];
  metrics: WorkshopBoardMetrics;
}

export interface WorkshopAnalyticsBucket {
  label: string;
  count: number;
}

export interface WorkshopAnalytics {
  total: number;
  open: number;
  pending: number;
  closed: number;
  priority: number;
  active: number;
  not_taken: number;
  urgent_not_taken: number;
  taken: number;
  open_over_24h: number;
  open_over_7d: number;
  oldest_active_seconds: number | null;
  median_take_seconds: number | null;
  avg_take_seconds: number | null;
  median_close_seconds: number | null;
  avg_close_seconds: number | null;
  by_state: { state: string; count: number }[];
  by_line: { line_number: string; count: number }[];
  by_machine: { machine_id: string; count: number }[];
  trend: {
    day: string;
    created: number;
    closed: number;
    priority: number;
    median_take_seconds: number | null;
    median_close_seconds: number | null;
  }[];
}
