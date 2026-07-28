import { describe, expect, it } from 'vitest';
// Vitest s'exécute sous Node, tandis que le bundle navigateur n'embarque pas
// ses déclarations de types. Ces imports servent uniquement à lire les vraies
// sources de production pendant ce test d'architecture.
// @ts-expect-error — module Node présent à l'exécution du test.
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error — module Node présent à l'exécution du test.
import { join, relative, resolve } from 'node:path';

type ProductionSource = {
  path: string;
  source: string;
};

const SOURCE_ROOT = resolve('src');

function collectProductionSources(directory = SOURCE_ROOT): ProductionSource[] {
  const sources: ProductionSource[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') {
        sources.push(...collectProductionSources(absolutePath));
      }
      continue;
    }
    if (
      !entry.isFile() ||
      !/\.(?:ts|tsx)$/.test(entry.name) ||
      /\.test\.(?:ts|tsx)$/.test(entry.name)
    ) {
      continue;
    }
    sources.push({
      path: relative(SOURCE_ROOT, absolutePath).replace(/\\/g, '/'),
      source: readFileSync(absolutePath, 'utf8'),
    });
  }

  return sources;
}

const productionSources = collectProductionSources();

function source(path: string): string {
  const match = productionSources.find((candidate) => candidate.path === path);
  if (!match) throw new Error(`Source de production introuvable : ${path}`);
  return match.source;
}

const atelierCorePaths = [
  'pages/WorkshopDashboardPage.tsx',
  'components/IncidentDetailPanel.tsx',
  'components/CreateIncidentModal.tsx',
  'hooks/useIncidentActions.ts',
] as const;

const atelierMutationPaths = [
  ...atelierCorePaths,
  'components/TextConfirmModal.tsx',
  'components/TakeChargeConfirmModal.tsx',
  'components/PendingConfirmModal.tsx',
  'components/ResumeIncidentConfirmModal.tsx',
  'components/CloseIncidentModal.tsx',
  'components/InvalidateIncidentModal.tsx',
  'components/DeleteRequestModal.tsx',
  'components/MaintenanceDeleteConfirmModal.tsx',
  'components/UnfollowIncidentConfirmModal.tsx',
  'components/DeleteResponsibleCommentConfirmModal.tsx',
  'components/ReviewIncidentRequestModal.tsx',
] as const;

const atelierCoreSource = atelierCorePaths.map(source).join('\n');
const atelierMutationSource = atelierMutationPaths.map(source).join('\n');

describe('architecture des mutations Atelier RC4', () => {
  it('exécute le runner partagé depuis au moins trois consommateurs Atelier de production', () => {
    const definition = 'components/ui/MutationFeedback.tsx';
    const atelierConsumers = productionSources
      .filter(({ path }) => path !== definition && !path.includes('__tests__'))
      .filter(({ path }) =>
        atelierMutationPaths.includes(path as (typeof atelierMutationPaths)[number])
      )
      .filter(({ source: candidateSource }) => /\buseMutationRunner\s*\(/.test(candidateSource))
      .map(({ path }) => path);

    expect(
      atelierConsumers.length,
      `Consommateurs Atelier réels de useMutationRunner : ${atelierConsumers.join(', ') || 'aucun'}`
    ).toBeGreaterThanOrEqual(3);
  });

  it.each([
    'runSimple',
    'runPanelAction',
    'simpleActionRef',
    'reviewActionRef',
    'pendingActionRef',
  ])('supprime la machine locale concurrente `%s` du cœur Atelier', (legacyMechanism) => {
    expect(
      new RegExp(`\\b${legacyMechanism}\\b`).test(atelierCoreSource),
      `${legacyMechanism} subsiste dans le cœur Atelier.`
    ).toBe(false);
  });

  it('ne conserve pas handleWithdrawCancelRequest comme branche déclarée mais jamais branchée', () => {
    const actionSource = source('hooks/useIncidentActions.ts');
    const otherAtelierSources = atelierMutationPaths
      .filter((path) => path !== 'hooks/useIncidentActions.ts')
      .map(source)
      .join('\n');
    const isDeclared = /\bfunction\s+handleWithdrawCancelRequest\b/.test(actionSource);
    const isConsumed = /\bhandleWithdrawCancelRequest\b/.test(otherAtelierSources);

    expect(
      isDeclared && !isConsumed,
      'handleWithdrawCancelRequest doit être réellement consommé ou supprimé.'
    ).toBe(false);
  });

  it('ne conserve pas maintenanceApprove comme branche déclarée mais impossible à ouvrir', () => {
    const occurrences = productionSources.filter(({ source: candidateSource }) =>
      /\bmaintenanceApprove\b/.test(candidateSource)
    );
    const hasRealOpener = productionSources.some(({ source: candidateSource }) =>
      /openModal\(\s*['"]maintenanceApprove['"]\s*\)/.test(candidateSource)
    );

    expect(
      occurrences.length > 0 && !hasRealOpener,
      'maintenanceApprove doit être réellement atteignable ou supprimé.'
    ).toBe(false);
  });

  it.each([
    ['demande de correction', 'Demande de correction envoyée.'],
    ['retrait de correction', 'Demande de correction retirée.'],
    ['retrait de consigne', 'Consigne retirée.'],
    ['consultation d’arbitrage', 'Dossier d’arbitrage consulté.'],
  ])('déclare le succès métier exact pour %s', (interaction, expectedMessage) => {
    expect(
      atelierMutationSource.includes(expectedMessage),
      `Succès absent pour ${interaction} : « ${expectedMessage} »`
    ).toBe(true);
  });

  it.each([
    ['clôture', 'components/CloseIncidentModal.tsx'],
    ['invalidation', 'components/InvalidateIncidentModal.tsx'],
    ['annulation directe', 'components/MaintenanceDeleteConfirmModal.tsx'],
    ['annulation arbitrée', 'pages/WorkshopDashboardPage.tsx'],
  ])('annonce le caractère définitif dans la confirmation de %s', (interaction, path) => {
    expect(
      /définitiv/i.test(source(path)),
      `La confirmation de ${interaction} n’annonce pas son caractère définitif.`
    ).toBe(true);
  });

  it('interdit tout rendu direct du message brut d’une erreur dans les sources Atelier', () => {
    const rawMessageUses = atelierMutationPaths.flatMap((path) => {
      const matches = source(path).match(/\b(?:error|err|requestError|_err)\s*\.\s*message\b/g);
      return (matches ?? []).map((match) => `${path}: ${match}`);
    });

    expect(rawMessageUses).toEqual([]);
  });
});
