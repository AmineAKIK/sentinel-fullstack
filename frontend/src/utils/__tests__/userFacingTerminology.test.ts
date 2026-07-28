import { describe, expect, it } from 'vitest';
// @ts-expect-error — modules Node réservés au test statique.
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error — modules Node réservés au test statique.
import { join, relative, resolve } from 'node:path';
import { ApiResponseError } from '../../api/client';
import { translateApiError } from '../../api/errorMessages';
import type { WorkshopIncidentEvent } from '../../types';
import { formatEventActor } from '../workshopHistory';

type Source = { path: string; text: string };

function collect(root: string, directory = root): Source[] {
  const result: Source[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'integration') {
        result.push(...collect(root, absolute));
      }
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      result.push({
        path: relative(root, absolute).replace(/\\/g, '/'),
        text: readFileSync(absolute, 'utf8'),
      });
    }
  }
  return result;
}

const productionSources = [
  ...collect(resolve('src')).map((item) => ({ ...item, path: `frontend/${item.path}` })),
  ...collect(resolve('../backend/src')).map((item) => ({ ...item, path: `backend/${item.path}` })),
];

describe('terminologie visible RC4', () => {
  it.each([
    [0, 'Ce technicien a 0 incident actif en cours.'],
    [1, 'Ce technicien a 1 incident actif en cours.'],
    [2, 'Ce technicien a 2 incidents actifs en cours.'],
  ])('accorde naturellement les incidents actifs pour %i', (count, expectedStart) => {
    const error = new ApiResponseError('RESOURCE_IN_USE', 'brut', 409, {
      reason: 'USER_HAS_ACTIVE_INCIDENTS',
      count,
    });
    expect(translateApiError(error)).toContain(expectedStart);
  });

  it.each([
    ['OPERATOR', 'Opérateur'],
    ['MAINTENANCE', 'Technicien'],
    ['RESPONSABLE', 'Responsable'],
    ['ADMIN', 'Administrateur'],
    ['SYSTEM', 'Système'],
  ])('traduit le rôle %s dans le journal', (role, label) => {
    const event = {
      first_name: role === 'SYSTEM' ? null : 'Alice',
      last_name: role === 'SYSTEM' ? null : 'Martin',
      role,
    } as WorkshopIncidentEvent;
    expect(formatEventActor(event)).toContain(label);
  });

  it('bannit les pseudo-pluralisations des sources de production', () => {
    const forbidden =
      /\b(?:incident|actif|signalé|annulé|machine|utilisateur|ligne|fiche|action|événement|clôturé)\((?:s|e|es)\)/i;
    const leaks = productionSources.flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, index) => ({ path, line, index: index + 1 }))
        .filter(({ line }) => forbidden.test(line))
        .map(({ path: file, line, index }) => `${file}:${index}: ${line.trim()}`)
    );
    expect(leaks).toEqual([]);
  });

  it('applique le glossaire aux libellés visibles de production', () => {
    const forbidden = /Narratif atelier|Consigne responsable|label="Signalement"/;
    const leaks = productionSources.flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, index) => ({ path, line, index: index + 1 }))
        .filter(({ line }) => forbidden.test(line))
        .map(({ path: file, line, index }) => `${file}:${index}: ${line.trim()}`)
    );
    expect(leaks).toEqual([]);
  });

  it('bannit les fallbacks qui restituent une enum brute', () => {
    const forbidden =
      /(?:ROLE|STATE|STATUS|WORKSHOP_EVENT|ADMIN_EVENT|EVENT)_LABELS\[[^\]]+\]\s*(?:\|\||\?\?)\s*(?!['"])[\w.]+/;
    const leaks = productionSources.flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, index) => ({ path, line, index: index + 1 }))
        .filter(({ line }) => forbidden.test(line))
        .map(({ path: file, line, index }) => `${file}:${index}: ${line.trim()}`)
    );
    expect(leaks).toEqual([]);
  });
});
