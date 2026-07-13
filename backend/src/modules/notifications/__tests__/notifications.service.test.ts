jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../mailer', () => ({
  getAdminEmail: jest.fn(),
  getMailer: jest.fn(),
  getSenderAddress: jest.fn(),
}));

jest.mock('../../adminCredentials/adminCredentials.repository', () => ({
  getAdminNotifPref: jest.fn(),
}));

import pool from '../../../db/pool';
import logger from '../../../logger';
import { getAdminNotifPref } from '../../adminCredentials/adminCredentials.repository';
import * as mailer from '../mailer';
import { notifyResponsablesEditRequested } from '../notifications.service';

const mockedPool = jest.mocked(pool);
const mockedLogger = jest.mocked(logger);
const mockedGetAdminNotifPref = jest.mocked(getAdminNotifPref);
const mockedMailerModule = jest.mocked(mailer);
const sendMail = jest.fn();

function mockNotificationQueries(emails: string[]): void {
  mockedPool.query
    .mockResolvedValueOnce({ rows: emails.map((email) => ({ email })) } as never)
    .mockResolvedValueOnce({
      rows: [{ line_number: 'L01', machine_id: 'M01', user_id: 1, taken_by_user_id: null }],
    } as never)
    .mockResolvedValueOnce({ rows: [{ first_name: 'Léa', last_name: 'Martin' }] } as never);
}

describe('notifications service email privacy', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
    mockedLogger.error.mockReset();
    mockedGetAdminNotifPref.mockReset();
    mockedMailerModule.getMailer.mockReset();
    mockedMailerModule.getSenderAddress.mockReset();
    sendMail.mockReset();

    mockedGetAdminNotifPref.mockResolvedValue(true);
    mockedMailerModule.getMailer.mockReturnValue({ sendMail } as never);
    mockedMailerModule.getSenderAddress.mockReturnValue('Sentinel <noreply@sentinel.test>');
    sendMail.mockResolvedValue({});
  });

  it('envoie un message séparé par destinataire et déduplique les adresses', async () => {
    mockNotificationQueries([
      'responsable-a@example.test',
      'responsable-b@example.test',
      'responsable-a@example.test',
    ]);

    await notifyResponsablesEditRequested(42, 7, 'Correction demandée');

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map(([message]) => message.to)).toEqual([
      'responsable-a@example.test',
      'responsable-b@example.test',
    ]);

    for (const [message] of sendMail.mock.calls) {
      expect(message.to).not.toContain(',');
      expect(message.bcc).toBeUndefined();
    }
  });

  it("ne journalise ni le destinataire ni le message brut d'une erreur SMTP", async () => {
    mockNotificationQueries(['responsable-prive@example.test']);
    sendMail.mockRejectedValueOnce(
      new Error('SMTP rejected responsable-prive@example.test')
    );

    await notifyResponsablesEditRequested(42, 7, 'Correction demandée');
    await Promise.resolve();

    expect(mockedLogger.error).toHaveBeenCalledTimes(1);
    const loggedData = JSON.stringify(mockedLogger.error.mock.calls);
    expect(loggedData).not.toContain('responsable-prive@example.test');
    expect(loggedData).not.toContain('SMTP rejected');
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorName: 'Error' }),
      '[mailer] Failed to send email'
    );
  });
});
