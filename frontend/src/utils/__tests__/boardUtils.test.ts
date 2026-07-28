import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatTime,
  formatClock,
  statusLabel,
  isOpenOverSevenDays,
  paginate,
  normalizeScreenId,
  getOrCreateSessionScreenId,
  BOARD_SESSION_SCREEN_KEY,
} from '../boardUtils';
import type { WorkshopBoardIncident } from '../../types';

function incident(overrides: Partial<WorkshopBoardIncident> = {}): WorkshopBoardIncident {
  return {
    id: 1,
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M1',
    robot_label: 'R1',
    head_number: 1,
    state: 'DEGRADEE',
    status: 'OPEN',
    is_taken: false,
    is_priority: false,
    responsible_comment: null,
    waiting_reason: null,
    display_order: 0,
    current_product: null,
    created_at: new Date(Date.now() - 1000 * 3600).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('formatTime', () => {
  it('formate une ISO en HH:MM', () => {
    const result = formatTime('2024-01-15T08:30:00Z');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatClock', () => {
  it('retourne une chaîne non vide avec des chiffres', () => {
    const result = formatClock(new Date('2024-06-15T10:00:00Z'));
    expect(result.length).toBeGreaterThan(5);
    expect(result).toMatch(/\d/);
  });
});

describe('statusLabel', () => {
  it('PENDING → "En attente"', () => {
    expect(statusLabel(incident({ status: 'PENDING' }))).toBe('En attente');
  });

  it('OPEN + non pris → "Non pris"', () => {
    expect(statusLabel(incident({ status: 'OPEN', is_taken: false }))).toBe('Non pris');
  });

  it('OPEN + pris → "Pris en charge"', () => {
    expect(statusLabel(incident({ status: 'OPEN', is_taken: true }))).toBe('Pris en charge');
  });
});

describe('isOpenOverSevenDays', () => {
  it('retourne false si < 7 jours', () => {
    const recent = new Date(Date.now() - 1000 * 3600 * 24 * 3).toISOString();
    expect(isOpenOverSevenDays(incident({ status: 'OPEN', created_at: recent }))).toBe(false);
  });

  it('retourne true si OPEN depuis > 7 jours', () => {
    const old = new Date(Date.now() - 1000 * 3600 * 24 * 8).toISOString();
    expect(isOpenOverSevenDays(incident({ status: 'OPEN', created_at: old }))).toBe(true);
  });

  it('retourne false si PENDING même si ancien', () => {
    const old = new Date(Date.now() - 1000 * 3600 * 24 * 10).toISOString();
    expect(isOpenOverSevenDays(incident({ status: 'PENDING', created_at: old }))).toBe(false);
  });
});

describe('paginate', () => {
  it('tableau vide → [[]]', () => {
    expect(paginate([], 3)).toEqual([[]]);
  });

  it('divise en pages de taille correcte', () => {
    const result = paginate([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('tout tient dans une page', () => {
    expect(paginate([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('neutralise une taille nulle ou non finie issue du stockage local', () => {
    expect(paginate([1, 2], 0)).toEqual([[1], [2]]);
    expect(paginate([1, 2], Number.NaN)).toEqual([[1], [2]]);
  });
});

describe('normalizeScreenId', () => {
  it('null → "default"', () => {
    expect(normalizeScreenId(null)).toBe('default');
  });

  it('chaîne vide → "default"', () => {
    expect(normalizeScreenId('')).toBe('default');
  });

  it('majuscules et espaces normalisés', () => {
    expect(normalizeScreenId('Ecran A')).toBe('ecran-a');
  });

  it('caractères spéciaux remplacés par tirets', () => {
    expect(normalizeScreenId('écran@1!')).toBe('-cran-1-');
  });

  it('borne la longueur utilisée dans les clés de stockage', () => {
    expect(normalizeScreenId('a'.repeat(100))).toHaveLength(64);
  });
});

describe('getOrCreateSessionScreenId', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('génère un ID la première fois', () => {
    const id = getOrCreateSessionScreenId();
    expect(id).toMatch(/^ecran-/);
  });

  it('retourne le même ID au second appel', () => {
    const first = getOrCreateSessionScreenId();
    const second = getOrCreateSessionScreenId();
    expect(first).toBe(second);
  });

  it('utilise la valeur existante en sessionStorage', () => {
    sessionStorage.setItem(BOARD_SESSION_SCREEN_KEY, 'ecran-custom');
    expect(getOrCreateSessionScreenId()).toBe('ecran-custom');
  });
});
