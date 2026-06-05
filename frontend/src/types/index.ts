export type Role = 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE';

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
  badge_number: string;
}

export interface WorkshopPasswordRequired {
  requiresPassword: true;
  badge_number: string;
}

export interface SentinelUser {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: Role;
  is_active: boolean;
  has_password: boolean;
  has_password_setup_code: boolean;
  password_setup_expires_at: string | null;
  password_setup_code?: string;
  created_at: string;
  updated_at: string;
}

export interface SingleRobotMachine {
  machineId: string;
  brand: string;
  hasDoubleRobot: false;
  robotNumber: string;
  robotHeads: number;
}

export interface DoubleRobotMachine {
  machineId: string;
  brand: string;
  hasDoubleRobot: true;
  leftRobotNumber: string;
  leftRobotHeads: number;
  rightRobotNumber: string;
  rightRobotHeads: number;
}

export type LineMachine = SingleRobotMachine | DoubleRobotMachine;

export interface ProductionLine {
  id: number;
  line_number: string;
  machines: LineMachine[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type IncidentShift = 'MATIN' | 'APRES_MIDI' | 'NUIT' | 'WEEKEND';
export type IncidentState =
  | 'SKIPEE_PAR_MACHINE'
  | 'SKIPEE_PAR_CONDUCTEUR'
  | 'DEGRADEE'
  | 'INDISPONIBLE';
export type IncidentStatus = 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';

export interface WorkshopIncident {
  id: number;
  user_id: number;
  shift: IncidentShift;
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
  first_name: string;
  last_name: string;
  badge_number?: string | null;
  role: Role;
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
  assigned_to_me?: number;
  followed?: number;
  followed_resolved?: number;
}

export interface WorkshopBoardLine {
  id: number;
  line_number: string;
}

export interface WorkshopBoardIncident {
  id: number;
  shift: IncidentShift;
  line_id: number;
  line_number: string;
  machine_id: string;
  robot_label: string;
  head_number: number;
  state: IncidentState;
  current_product: string | null;
  is_taken: boolean;
  is_priority: boolean;
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

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export type SortField = 'alphabetical' | 'created_at';
export type SortOrder = 'asc' | 'desc';

export interface ReferenceAuditEvent {
  id: number;
  scope: 'account' | 'line';
  event_type: string;
  changes: Record<string, unknown> | null;
  created_at: string;
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
