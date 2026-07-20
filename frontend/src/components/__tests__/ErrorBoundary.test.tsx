import { errorBoundaryMessage, PRODUCTION_ERROR_MESSAGE } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  const sensitiveError = new Error('relation admin_accounts does not exist');

  it('masque le détail technique en production', () => {
    const message = errorBoundaryMessage(sensitiveError, true);

    expect(message).toBe(PRODUCTION_ERROR_MESSAGE);
    expect(message).not.toContain('admin_accounts');
  });

  it('conserve le détail utile au développement', () => {
    expect(errorBoundaryMessage(sensitiveError, false)).toBe(sensitiveError.message);
  });
});
