import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import SelectField from '../SelectField';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

/**
 * Simule la géométrie du déclencheur et la hauteur de la fenêtre, puis ouvre le
 * champ. `triggerRect` contrôle `getBoundingClientRect()` du bouton
 * `role="combobox"` ; `innerHeight` simule un petit viewport (zoom élevé,
 * mobile paysage) sans dépendre d'un vrai redimensionnement navigateur.
 */
function openWithGeometry(triggerRect: Partial<DOMRect>, innerHeight: number) {
  const originalInnerHeight = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });

  const onChange = vi.fn();
  render(<SelectField value="a" options={OPTIONS} onChange={onChange} ariaLabel="Test select" />);
  const combobox = screen.getByRole('combobox', { name: 'Test select' });
  combobox.getBoundingClientRect = (): DOMRect => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 200,
    width: 200,
    height: 32,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...triggerRect,
  });

  fireEvent.click(combobox);
  const menu = screen.getByRole('listbox');
  return {
    combobox,
    menu,
    onChange,
    restore: () => {
      Object.defineProperty(window, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
    },
  };
}

describe('SelectField — géométrie du menu (anti-débordement viewport)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ouvre vers le BAS quand l’espace en dessous suffit', () => {
    // Déclencheur en haut d'un grand viewport : large espace en dessous.
    const { menu, restore } = openWithGeometry({ top: 40, bottom: 72 }, 900);
    expect(menu.style.top).toBe('76px'); // bottom(72) + gap(4)
    expect(menu.style.bottom).toBe('');
    restore();
  });

  it('ouvre vers le HAUT quand l’espace en dessous ne suffit pas', () => {
    // Déclencheur près du bas d'un viewport de 500px : peu de place en dessous,
    // beaucoup au-dessus.
    const { menu, restore } = openWithGeometry({ top: 460, bottom: 492 }, 500);
    expect(menu.style.bottom).not.toBe('');
    expect(menu.style.top).toBe('');
    restore();
  });

  it('maxHeight ne dépasse JAMAIS l’espace réellement disponible, même sur un viewport très court', () => {
    // Viewport de 160px, déclencheur au milieu : ~60px de chaque côté.
    // L'ancien calcul (Math.max(120, …)) aurait forcé 120px et débordé.
    const { menu, restore } = openWithGeometry({ top: 78, bottom: 82 }, 160);
    const maxHeight = Number.parseFloat(menu.style.maxHeight);
    const viewportMargin = 8;
    const gap = 4;
    // Espace réel du côté choisi (haut ou bas), marge de bord comprise.
    const spaceBelow = 160 - 82 - gap - viewportMargin;
    const spaceAbove = 78 - gap - viewportMargin;
    const chosenSpace = menu.style.bottom !== '' ? spaceAbove : spaceBelow;
    expect(maxHeight).toBeLessThanOrEqual(chosenSpace + 0.01);
    expect(maxHeight).toBeGreaterThanOrEqual(0);
    restore();
  });

  it('le menu reste défilable (overflow-y: auto) quand les options ne tiennent pas', () => {
    const manyOptions = Array.from({ length: 20 }, (_, i) => ({
      value: `v${i}`,
      label: `Option ${i}`,
    }));
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
    render(
      <SelectField value="v0" options={manyOptions} onChange={vi.fn()} ariaLabel="Long select" />
    );
    const combobox = screen.getByRole('combobox', { name: 'Long select' });
    combobox.getBoundingClientRect = (): DOMRect => ({
      top: 140,
      bottom: 172,
      left: 0,
      right: 200,
      width: 200,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(combobox);
    const menu = screen.getByRole('listbox');
    expect(menu.style.overflowY).toBe('auto');
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThan(20 * 40 + 8);
  });

  it('recalcule la position sur scroll ou resize plutôt que de garder des coordonnées obsolètes', () => {
    const { combobox, menu, restore } = openWithGeometry({ top: 40, bottom: 72 }, 900);
    // Position initiale : ouverture vers le bas, ancrée à bottom(72) + gap(4).
    expect(menu.style.top).toBe('76px');
    expect(combobox.getAttribute('aria-expanded')).toBe('true');

    // Le déclencheur se déplace (l'utilisateur a fait défiler la page) : le
    // menu reste OUVERT et se recalcule sur la nouvelle géométrie, sans jamais
    // garder des coordonnées obsolètes.
    combobox.getBoundingClientRect = (): DOMRect => ({
      top: 400,
      bottom: 432,
      left: 0,
      right: 200,
      width: 200,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.scroll(window);
    expect(combobox.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(menu.style.top).toBe('436px'); // bottom(432) + gap(4), recalculé

    fireEvent.resize(window);
    expect(combobox.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    restore();
  });

  it('la sélection au clavier et la fermeture fonctionnent toujours (ARIA inchangé)', () => {
    const onChange = vi.fn();
    render(<SelectField value="a" options={OPTIONS} onChange={onChange} ariaLabel="Clavier" />);
    const combobox = screen.getByRole('combobox', { name: 'Clavier' });
    expect(combobox.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
    expect(combobox.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(combobox.getAttribute('aria-expanded')).toBe('false');
  });
});
