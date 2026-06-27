import { findActiveUserByBadge, insertPasswordResetRequest } from './passwordReset.repository';
import { notifyAdminPasswordResetRequested } from '../notifications/notifications.service';

export async function requestPasswordResetService(badgeNumber: string): Promise<void> {
  const user = await findActiveUserByBadge(badgeNumber);

  // Réponse identique que le badge existe ou non — pas de fuite d'info.
  if (!user) return;

  await insertPasswordResetRequest(user.id, user.badge_number);

  notifyAdminPasswordResetRequested({
    firstName: user.first_name,
    lastName: user.last_name,
    badgeNumber: user.badge_number,
    requestedAt: new Date(),
  });
}
