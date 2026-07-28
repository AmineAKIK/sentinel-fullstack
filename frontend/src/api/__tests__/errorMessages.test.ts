import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../client';
import {
  apiErrorMessage,
  translateApiError,
  fieldInError,
  GENERIC_ERROR_MESSAGE,
} from '../errorMessages';

describe('translateApiError — traduction métier (lot 2 RC3)', () => {
  it('traduit une durée Board hors bornes en français avec les bornes', () => {
    const err = new ApiResponseError('VALIDATION_ERROR', 'Une valeur est invalide.', 400, {
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
      min: 1,
      max: 168,
    });
    const text = translateApiError(err);
    expect(text).toContain('1');
    expect(text).toContain('168');
    expect(text.toLowerCase()).toContain('durée');
    // Jamais d'identifiant interne ni de reason brute.
    expect(text).not.toMatch(/_/);
    expect(text).not.toContain('boardSessionDuration');
    expect(text).not.toContain('OUT_OF_RANGE');
  });

  it('couvre les codes réseau, timeout, no-changes, arbitrage et session révoquée', () => {
    const cases: Array<[ApiResponseError, RegExp]> = [
      [new ApiResponseError('NETWORK_ERROR', 'x', 0), /connexion|réseau/i],
      [new ApiResponseError('REQUEST_TIMEOUT', 'x', 0), /délai|expiré|trop long/i],
      [new ApiResponseError('NO_CHANGES', 'x', 400), /aucune|modification/i],
      [new ApiResponseError('ARBITRATION_ALREADY_PENDING', 'x', 409), /arbitr|attente/i],
      [new ApiResponseError('SESSION_REVOKED', 'x', 401), /session|reconnect/i],
    ];
    for (const [err, pattern] of cases) {
      expect(translateApiError(err)).toMatch(pattern);
    }
  });

  it('retombe sur un message générique sûr pour un code ou un field inconnu', () => {
    const unknownCode = new ApiResponseError('SOMETHING_NEW', 'brut interne', 400);
    expect(translateApiError(unknownCode)).toBe(GENERIC_ERROR_MESSAGE);

    const unknownField = new ApiResponseError('VALIDATION_ERROR', 'brut', 400, {
      field: 'totallyUnknownField',
      reason: 'OUT_OF_RANGE',
    });
    // Un field inconnu ne fait jamais fuiter sa valeur : message générique ou
    // formulation neutre, mais jamais le nom du field.
    const text = translateApiError(unknownField);
    expect(text).not.toContain('totallyUnknownField');
  });

  it('NÉGATIF : n’affiche jamais error.message brut du backend', () => {
    const err = new ApiResponseError(
      'VALIDATION_ERROR',
      'board_session_ttl_hours doit être un entier entre 1 et 168.',
      400,
      { field: 'boardSessionDuration', reason: 'OUT_OF_RANGE', min: 1, max: 168 }
    );
    const text = translateApiError(err);
    expect(text).not.toContain('board_session_ttl_hours');
    expect(text).not.toContain(err.message);
  });

  it('translate accepte aussi une erreur inconnue (non-ApiResponseError)', () => {
    expect(translateApiError(new Error('boom'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(translateApiError('nope')).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('couvre chaque raison de validation avec un libellé de champ connu', () => {
    const req = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardLabel',
      reason: 'REQUIRED',
    });
    expect(translateApiError(req)).toMatch(/obligatoire/i);

    const tooLong = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardLabel',
      reason: 'TOO_LONG',
      max: 64,
    });
    expect(translateApiError(tooLong)).toMatch(/64/);

    const tooLongNoMax = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardLabel',
      reason: 'TOO_LONG',
    });
    expect(translateApiError(tooLongNoMax)).toMatch(/trop long/i);

    const badFormat = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardLabel',
      reason: 'INVALID_FORMAT',
    });
    expect(translateApiError(badFormat)).toMatch(/format/i);

    const noChanges = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      reason: 'NO_CHANGES',
    });
    expect(translateApiError(noChanges)).toMatch(/aucune/i);

    const outOfRangeNoBounds = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
    });
    expect(translateApiError(outOfRangeNoBounds)).toMatch(/autorisées/i);
  });

  it('validation sans field connu ou sans details → générique sûr', () => {
    // reason connue mais field absent (donc label absent) → générique.
    const noField = new ApiResponseError('VALIDATION_ERROR', 'x', 400, { reason: 'REQUIRED' });
    expect(translateApiError(noField)).toBe(GENERIC_ERROR_MESSAGE);
    // validation sans details du tout → générique.
    const noDetails = new ApiResponseError('VALIDATION_ERROR', 'brut interne', 400);
    expect(translateApiError(noDetails)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('fieldInError ne renvoie que des champs publics connus', () => {
    expect(
      fieldInError(
        new ApiResponseError('VALIDATION_ERROR', 'x', 400, { field: 'boardSessionDuration' })
      )
    ).toBe('boardSessionDuration');
    expect(
      fieldInError(new ApiResponseError('VALIDATION_ERROR', 'x', 400, { field: 'inconnu' }))
    ).toBeNull();
    expect(fieldInError(new Error('boom'))).toBeNull();
  });
});

describe('apiErrorMessage — abstraction sûre (C-03)', () => {
  it('NÉGATIF : ne laisse jamais fuiter le message brut ni le snake_case d’une erreur API', () => {
    const err = new ApiResponseError(
      'VALIDATION_ERROR',
      'board_session_ttl_hours internal_failure',
      400,
      { field: 'boardSessionDuration', reason: 'OUT_OF_RANGE', min: 1, max: 168 }
    );
    const text = apiErrorMessage(err, 'Repli métier.');
    // Ni le message brut, ni le nom SQL, ni aucun identifiant snake_case.
    expect(text).not.toContain('board_session_ttl_hours');
    expect(text).not.toContain('internal_failure');
    expect(text).not.toMatch(/[a-z]+_[a-z]+/);
    // …et un libellé français utile apparaît bien (traduction du field public).
    expect(text).toMatch(/durée de session Board/i);
    expect(text).toMatch(/1 et 168/);
  });

  it('n’expose jamais details.field / details.reason bruts', () => {
    const err = new ApiResponseError('VALIDATION_ERROR', 'x', 400, {
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
      min: 1,
      max: 168,
    });
    const text = apiErrorMessage(err, 'Repli.');
    expect(text).not.toContain('boardSessionDuration');
    expect(text).not.toContain('OUT_OF_RANGE');
  });

  it('code API inconnu → générique sûr, jamais le message brut', () => {
    const err = new ApiResponseError('SOME_UNKNOWN_CODE', 'raw backend detail xyz', 400);
    expect(apiErrorMessage(err, 'Repli.')).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('erreur NON API → repli français fourni (jamais error.message)', () => {
    expect(apiErrorMessage(new Error('stack trace interne'), 'Impossible de charger.')).toBe(
      'Impossible de charger.'
    );
    expect(apiErrorMessage('boom', 'Impossible de charger.')).toBe('Impossible de charger.');
  });

  it('RESOURCE_IN_USE (ligne verrouillée) : message précis reconstruit depuis details.count', () => {
    const err = new ApiResponseError('RESOURCE_IN_USE', 'raw server text — do not show', 409, {
      reason: 'LINE_STRUCTURE_LOCKED',
      count: 3,
    });
    const text = translateApiError(err);
    expect(text).toBe(
      'Impossible de modifier la structure de cette ligne : 3 incidents actifs y sont encore liés.'
    );
    expect(text).not.toContain('raw server text');
  });

  it('RESOURCE_IN_USE (technicien) : message précis depuis details.count', () => {
    const err = new ApiResponseError('RESOURCE_IN_USE', 'raw', 409, {
      reason: 'USER_HAS_ACTIVE_INCIDENTS',
      count: 2,
    });
    expect(translateApiError(err)).toContain('2 incidents actifs en cours');
  });
});
