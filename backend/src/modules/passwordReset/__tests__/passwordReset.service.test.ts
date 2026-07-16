jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((callback: (client: null) => Promise<unknown>) => callback(null)),
}));

jest.mock('../passwordReset.repository', () => ({
  findActiveUserByBadge: jest.fn(),
  insertPasswordResetRequest: jest.fn(),
}));

jest.mock('../../notifications/notificationOutbox.repository', () => ({
  enqueuePasswordResetNotification: jest.fn(),
}));

import * as resetRepository from '../passwordReset.repository';
import { enqueuePasswordResetNotification } from '../../notifications/notificationOutbox.repository';
import { requestPasswordResetService } from '../passwordReset.service';

describe('requestPasswordResetService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('garde une réponse neutre et ne crée rien pour un badge inconnu', async () => {
    jest.mocked(resetRepository.findActiveUserByBadge).mockResolvedValue(null);

    await expect(requestPasswordResetService('UNKNOWN')).resolves.toBeUndefined();

    expect(resetRepository.insertPasswordResetRequest).not.toHaveBeenCalled();
    expect(enqueuePasswordResetNotification).not.toHaveBeenCalled();
  });

  it('enregistre la demande et sa notification dans la même transaction', async () => {
    jest.mocked(resetRepository.findActiveUserByBadge).mockResolvedValue({
      id: 12,
      first_name: 'Léa',
      last_name: 'Martin',
      badge_number: 'B-12',
    });
    jest.mocked(resetRepository.insertPasswordResetRequest).mockResolvedValue(81);

    await requestPasswordResetService('b-12');

    expect(resetRepository.findActiveUserByBadge).toHaveBeenCalledWith('b-12', null, true);
    expect(resetRepository.insertPasswordResetRequest).toHaveBeenCalledWith(12, 'B-12', null);
    expect(enqueuePasswordResetNotification).toHaveBeenCalledWith(81, null);
  });
});
