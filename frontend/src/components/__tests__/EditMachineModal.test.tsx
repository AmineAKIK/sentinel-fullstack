import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../api/lines', () => ({
  checkLineConflicts: vi.fn(),
  updateLine: vi.fn(),
}));

import * as linesApi from '../../api/lines';
import EditMachineModal from '../EditMachineModal';
import { LineMachine, ProductionLine } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function singleMachine(overrides: Partial<Extract<LineMachine, { hasDoubleRobot: false }>> = {}): LineMachine {
  return {
    machineId: 'MCH-1114',
    brand: 'Panasonic',
    hasDoubleRobot: false,
    robotNumber: '1',
    robotHeads: 16,
    ...overrides,
  };
}

function mockLine(overrides: Partial<ProductionLine> = {}): ProductionLine {
  return {
    id: 1,
    line_number: '114',
    machines: [singleMachine()],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderModal(line = mockLine(), onClose = vi.fn(), onSuccess = vi.fn()) {
  render(
    <EditMachineModal line={line} machineIndex={0} onClose={onClose} onSuccess={onSuccess} />
  );
  return { onClose, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(linesApi.checkLineConflicts).mockResolvedValue({ lineExists: false, machineConflicts: [] });
  vi.mocked(linesApi.updateLine).mockImplementation((_id, payload) =>
    Promise.resolve(mockLine(payload as Partial<ProductionLine>))
  );
});

// ─── aucun changement : ne jamais confirmer une non-action ─────────────────────

describe('EditMachineModal – aucun changement', () => {
  it('désactive le bouton Aperçu tant que rien n\'a changé', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /Aperçu/i })).toBeDisabled();
  });

  it('ne déclenche ni updateLine ni onSuccess si on tente de valider sans changement', async () => {
    const { onSuccess } = renderModal();
    // Le bouton est désactivé ; on force malgré tout l'événement pour couvrir le
    // filet de sécurité côté logique (équivalent à un déclenchement clavier).
    fireEvent.click(screen.getByRole('button', { name: /Aperçu/i }));
    await waitFor(() => {
      expect(linesApi.checkLineConflicts).not.toHaveBeenCalled();
    });
    expect(linesApi.updateLine).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

// ─── changement réel : aperçu avant/après puis confirmation ────────────────────

describe('EditMachineModal – modification réelle', () => {
  it('active l\'aperçu, montre le récap avant/après, puis confirme', async () => {
    const { onSuccess } = renderModal();

    // On modifie la marque.
    const brandInput = screen.getByLabelText(/Marque/i);
    fireEvent.change(brandInput, { target: { value: 'Fuji' } });

    const apercu = screen.getByRole('button', { name: /Aperçu/i });
    expect(apercu).not.toBeDisabled();
    fireEvent.click(apercu);

    // Le récap montre l'ancienne et la nouvelle valeur.
    await screen.findByText('Panasonic');
    expect(screen.getByText('Fuji')).toBeDefined();

    const confirmer = screen.getByRole('button', { name: /Confirmer/i });
    fireEvent.click(confirmer);

    await waitFor(() => {
      expect(linesApi.updateLine).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('redevient non modifié si on revient à la valeur d\'origine après un détour', () => {
    renderModal();
    const brandInput = screen.getByLabelText(/Marque/i);
    fireEvent.change(brandInput, { target: { value: 'Fuji' } });
    fireEvent.change(brandInput, { target: { value: 'Panasonic' } });
    expect(screen.getByRole('button', { name: /Aperçu/i })).toBeDisabled();
  });
});
