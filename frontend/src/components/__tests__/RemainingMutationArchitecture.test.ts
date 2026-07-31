import { describe, expect, it } from 'vitest';
// @ts-expect-error — imports Node réservés à ce test d'architecture.
import { readFileSync } from 'node:fs';
// @ts-expect-error — imports Node réservés à ce test d'architecture.
import { resolve } from 'node:path';

// Les types Node ne font volontairement pas partie du bundle navigateur.
// eslint-disable-next-line @typescript-eslint/no-unsafe-return
const source = (path: string): string => readFileSync(resolve('src', path), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-unsafe-return
const documentation = (path: string): string => readFileSync(resolve('..', 'docs', path), 'utf8');

const mutationSurfaces = [
  'components/CreateUserModal.tsx',
  'components/EditSummaryModal.tsx',
  'components/ResetPasswordConfirmModal.tsx',
  'components/DeleteConfirmModal.tsx',
  'components/CreateLineModal.tsx',
  'components/EditLineSummaryModal.tsx',
  'components/EditMachineModal.tsx',
  'components/LinePlanModal.tsx',
  'components/ArchiveLineConfirmModal.tsx',
  'components/AdminPasswordConfirmModal.tsx',
  'components/PendingTasksWidget.tsx',
  'components/SupportChat.tsx',
  'pages/AdminSettingsPage.tsx',
  'pages/AdminLoginPage.tsx',
  'pages/WorkshopLoginPage.tsx',
  'pages/BoardAccessPage.tsx',
  'pages/WorkshopBoardPage.tsx',
  'routes/AppAuthContext.tsx',
] as const;

describe('architecture des mutations hors Atelier RC4', () => {
  it.each(mutationSurfaces)('%s consomme le contrat partagé', (path) => {
    expect(
      source(path),
      `${path} doit appeler useMutationRunner pour ses mutations explicites.`
    ).toMatch(/\buseMutationRunner\s*\(/);
  });

  it('supprime la branche de confirmation transitoire du lot 4', () => {
    const confirm = source('components/ConfirmModal.tsx');
    expect(confirm).not.toContain('LegacyConfirmModal');
    expect(confirm).not.toContain('submittingRef');
  });

  it.each([
    'Utilisateur créé.',
    'Utilisateur mis à jour.',
    'Compte activé.',
    'Compte désactivé.',
    'Code temporaire généré.',
    'Utilisateur supprimé.',
    'Ligne créée.',
    'Ligne modifiée.',
    'Ligne archivée.',
    'Préférence de notification enregistrée.',
    'Code Board mis à jour. Sessions Board révoquées.',
    'Paramètres enregistrés.',
    'Adresse email mise à jour.',
    'Demande marquée comme traitée.',
    'Message envoyé.',
  ])('déclare le succès métier exact « %s »', (message) => {
    const allSources = mutationSurfaces.map(source).join('\n');
    expect(allSources).toContain(message);
  });

  it('confirme les mutations qui déconnectent des utilisateurs avant leur exécution', () => {
    const settings = source('pages/AdminSettingsPage.tsx');
    expect(settings).toMatch(/Confirmer le changement du code Board/);
    expect(settings).toMatch(/déconnectées|déconnectés/);
    expect(settings).toMatch(/Révoquer les sessions/);
  });

  it('ne vide la saisie Support qu’après le succès', () => {
    const support = source('components/SupportChat.tsx');
    const call = support.indexOf('onSend(message');
    const clear = support.indexOf("setInput('')");
    expect(call).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(call);
  });

  it.each([
    'pages/UserListPage.tsx',
    'pages/UserDetailPage.tsx',
    'pages/LinesPage.tsx',
    'components/LineDetailView.tsx',
  ])('%s ne maintient plus de bannière de succès temporisée concurrente', (path) => {
    expect(source(path)).not.toContain('SuccessBanner');
    expect(source(path)).not.toContain('successTimerRef');
    expect(source(path)).not.toContain('showSuccess');
  });

  it('réserve les succès locaux aux sorties persistantes contenant un secret à usage unique', () => {
    expect(source('components/CreateUserModal.tsx')).toContain('password_setup_code');
    expect(source('components/CreateUserModal.tsx')).toContain('SuccessBanner');
    expect(source('components/ResetPasswordConfirmModal.tsx')).toContain('password_setup_code');
    expect(source('components/ResetPasswordConfirmModal.tsx')).toContain('SuccessBanner');
  });

  it('rattache le rendu partagé aux 61 interactions déjà auditées', () => {
    const inventoryTable = documentation('archive-rc/rc4-mutation-inventory.md').split(
      '## Synthèse'
    )[0];
    expect(inventoryTable.match(/\| `COVERED` \|/g) ?? []).toHaveLength(59);
    expect(inventoryTable.match(/\| `EXCEPTION_PROVEN` \|/g) ?? []).toHaveLength(2);
  });
});
