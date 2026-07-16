import { findActiveUserByBadge, insertPasswordResetRequest } from './passwordReset.repository';
import { withTransaction } from '../../db/transaction';
import { enqueuePasswordResetNotification } from '../notifications/notificationOutbox.repository';

export async function requestPasswordResetService(badgeNumber: string): Promise<void> {
  await withTransaction(async (client) => {
    const user = await findActiveUserByBadge(badgeNumber, client, true);

    // Réponse identique que le badge existe ou non — pas de fuite d'info.
    if (!user) return;

    const requestId = await insertPasswordResetRequest(user.id, user.badge_number, client);
    await enqueuePasswordResetNotification(requestId, client);
  });
}
