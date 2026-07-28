import { SentinelUser, SortOrder } from '../types';
import { formatRoleLabel } from './labels';

export type UserSortField = 'name' | 'badge' | 'role' | 'status' | 'created_at';

export function userName(user: SentinelUser): string {
  return `${user.last_name} ${user.first_name}`.trim();
}

export function compareUsers(
  a: SentinelUser,
  b: SentinelUser,
  field: UserSortField,
  order: SortOrder
): number {
  const direction = order === 'asc' ? 1 : -1;
  let result = 0;

  if (field === 'name') {
    result = userName(a).localeCompare(userName(b), 'fr', { sensitivity: 'base' });
  } else if (field === 'badge') {
    result = a.badge_number.localeCompare(b.badge_number, 'fr', {
      numeric: true,
      sensitivity: 'base',
    });
  } else if (field === 'role') {
    result = formatRoleLabel(a.role).localeCompare(formatRoleLabel(b.role), 'fr', {
      sensitivity: 'base',
    });
  } else if (field === 'status') {
    result = Number(b.is_active) - Number(a.is_active);
  } else {
    result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }

  if (result === 0) {
    result = userName(a).localeCompare(userName(b), 'fr', { sensitivity: 'base' });
  }
  return result * direction;
}
