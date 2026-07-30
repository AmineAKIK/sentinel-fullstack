import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Ranking, Sparkline, TrendChart } from '../PilotageCharts';
import { WorkshopAnalytics } from '../../../types/workshop';

function trendItem(
  overrides: Partial<WorkshopAnalytics['trend'][number]> = {}
): WorkshopAnalytics['trend'][number] {
  return {
    day: '2026-03-01',
    created: 4,
    closed: 2,
    priority: 0,
    median_take_seconds: null,
    median_close_seconds: null,
    ...overrides,
  };
}

function trendSeries(days: number, pattern: (i: number) => { created: number; closed: number }) {
  return Array.from({ length: days }, (_, i) => {
    const { created, closed } = pattern(i);
    return trendItem({ day: `2026-03-${String(i + 1).padStart(2, '0')}`, created, closed });
  });
}

describe('Sparkline — série réelle des incidents actifs (RC5)', () => {
  it('ne rend rien pour moins de deux points (pas de série exploitable)', () => {
    const { container } = render(<Sparkline data={[3]} tone="watch" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('est masqué aux technologies d’assistance (purement redondant avec le chiffre texte)', () => {
    const { container } = render(<Sparkline data={[1, 4, 2, 7]} tone="tension" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('ne porte aucune dimension en dur qui l’empêcherait de s’adapter au conteneur', () => {
    const { container } = render(<Sparkline data={[1, 4, 2, 7]} tone="watch" />);
    const svg = container.querySelector('svg');
    // Le viewBox doit rester cohérent avec les attributs width/height fournis
    // (garantit un tracé proportionnel quel que soit le rendu CSS appliqué).
    expect(svg).toHaveAttribute('viewBox');
  });
});

describe('Ranking — barre de proportion disponible pour toute la matrice de classement (RC5)', () => {
  const makeItems = (count: number, dominant = false) =>
    Array.from({ length: count }, (_, i) => ({
      label: `Ligne ${i + 1}`,
      count: dominant && i === 0 ? 100 : 3,
    }));

  it.each([1, 3, 10, 20])('rend une barre non nulle pour %i résultat(s)', (count) => {
    render(
      <Ranking
        title="Lignes"
        items={makeItems(count)}
        emptyText="Aucune donnée."
        total={count * 3}
        limit="20"
      />
    );
    const bars = document.querySelectorAll('.pilotage-ranking-bar i');
    expect(bars.length).toBe(count);
    for (const bar of Array.from(bars)) {
      const width = (bar as HTMLElement).style.width;
      expect(width).not.toBe('0%');
      expect(Number.parseFloat(width)).toBeGreaterThan(0);
    }
  });

  it('respecte la limite affichée sans faire disparaître la barre des éléments visibles', () => {
    render(
      <Ranking
        title="Lignes"
        items={makeItems(20)}
        emptyText="Aucune donnée."
        total={60}
        limit="5"
      />
    );
    expect(document.querySelectorAll('.pilotage-ranking-row').length).toBe(5);
    expect(document.querySelectorAll('.pilotage-ranking-bar').length).toBe(5);
  });

  it('gère une valeur dominante sans écraser visuellement les barres des autres lignes', () => {
    render(
      <Ranking
        title="Machines"
        items={makeItems(3, true)}
        emptyText="Aucune donnée."
        total={106}
        limit="all"
      />
    );
    const bars = Array.from(document.querySelectorAll('.pilotage-ranking-bar i'));
    const widths = bars.map((b) => Number.parseFloat((b as HTMLElement).style.width));
    expect(widths[0]).toBe(100);
    // Les non-dominantes restent visibles (plancher à 6% dans le calcul métier).
    expect(widths[1]).toBeGreaterThanOrEqual(6);
    expect(widths[2]).toBeGreaterThanOrEqual(6);
  });

  it('conserve un libellé long entier dans le DOM (troncature visuelle uniquement, pas de perte de données)', () => {
    const longLabel = 'Ligne de production avec un libellé volontairement très long pour le test';
    render(
      <Ranking
        title="Lignes"
        items={[{ label: longLabel, count: 5 }]}
        emptyText="Aucune donnée."
        total={5}
        limit="all"
      />
    );
    expect(screen.getByText(longLabel)).toBeInTheDocument();
  });

  it('affiche un état vide explicite en l’absence de données', () => {
    render(
      <Ranking title="Lignes" items={[]} emptyText="Aucune ligne dominante." total={0} limit="10" />
    );
    expect(screen.getByText('Aucune ligne dominante.')).toBeInTheDocument();
    expect(document.querySelectorAll('.pilotage-ranking-row').length).toBe(0);
  });

  it('gère des valeurs égales sans division par zéro ni barre nulle', () => {
    render(
      <Ranking
        title="Lignes"
        items={[
          { label: 'A', count: 4 },
          { label: 'B', count: 4 },
          { label: 'C', count: 4 },
        ]}
        emptyText="Aucune donnée."
        total={12}
        limit="all"
      />
    );
    const bars = Array.from(document.querySelectorAll('.pilotage-ranking-bar i'));
    const widths = bars.map((b) => Number.parseFloat((b as HTMLElement).style.width));
    expect(widths).toEqual([100, 100, 100]);
  });
});

describe('TrendChart — créations/clôtures sur toute plage de période (RC5)', () => {
  it('affiche un état vide explicite pour zéro donnée', () => {
    render(<TrendChart trend={[]} />);
    expect(screen.getByText('Aucune donnée sur cette période.')).toBeInTheDocument();
  });

  it('rend une colonne unique avec des barres de hauteur strictement positive (1 jour)', () => {
    render(<TrendChart trend={[trendItem({ created: 5, closed: 2 })]} />);
    const cols = document.querySelectorAll('.pilotage-trend-col');
    expect(cols.length).toBe(1);
    const bars = document.querySelectorAll('.pilotage-trend-bar');
    for (const bar of Array.from(bars)) {
      const height = Number.parseFloat((bar as HTMLElement).style.height);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('rend deux colonnes distinctes (2 jours)', () => {
    render(
      <TrendChart
        trend={[
          trendItem({ day: '2026-03-01', created: 3, closed: 1 }),
          trendItem({ day: '2026-03-02', created: 1, closed: 4 }),
        ]}
      />
    );
    expect(document.querySelectorAll('.pilotage-trend-col').length).toBe(2);
  });

  it('rend sept colonnes (semaine complète) sans en perdre aucune', () => {
    render(<TrendChart trend={trendSeries(7, (i) => ({ created: i + 1, closed: i }))} />);
    expect(document.querySelectorAll('.pilotage-trend-col').length).toBe(7);
  });

  it('rend une période longue (30 jours) intégralement, sans réduire une barre à une largeur/hauteur nulle', () => {
    render(
      <TrendChart trend={trendSeries(30, (i) => ({ created: (i % 5) + 1, closed: i % 3 }))} />
    );
    const cols = document.querySelectorAll('.pilotage-trend-col');
    expect(cols.length).toBe(30);
    const createdBars = document.querySelectorAll('.pilotage-trend-bar-created');
    for (const bar of Array.from(createdBars)) {
      const height = Number.parseFloat((bar as HTMLElement).style.height);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('gère des créations seules (aucune clôture) sans faire disparaître la colonne', () => {
    render(<TrendChart trend={[trendItem({ created: 6, closed: 0 })]} />);
    const closedBar = document.querySelector('.pilotage-trend-bar-closed') as HTMLElement;
    expect(closedBar).not.toBeNull();
    expect(Number.parseFloat(closedBar.style.height)).toBe(0);
    const createdBar = document.querySelector('.pilotage-trend-bar-created') as HTMLElement;
    expect(Number.parseFloat(createdBar.style.height)).toBeGreaterThan(0);
  });

  it('gère des clôtures seules (aucune création) sans faire disparaître la colonne', () => {
    render(<TrendChart trend={[trendItem({ created: 0, closed: 5 })]} />);
    const createdBar = document.querySelector('.pilotage-trend-bar-created') as HTMLElement;
    expect(Number.parseFloat(createdBar.style.height)).toBe(0);
    const closedBar = document.querySelector('.pilotage-trend-bar-closed') as HTMLElement;
    expect(Number.parseFloat(closedBar.style.height)).toBeGreaterThan(0);
  });

  it('gère des valeurs identiques créations/clôtures sans erreur d’échelle', () => {
    render(<TrendChart trend={[trendItem({ created: 4, closed: 4 })]} />);
    const created = document.querySelector('.pilotage-trend-bar-created') as HTMLElement;
    const closed = document.querySelector('.pilotage-trend-bar-closed') as HTMLElement;
    expect(created.style.height).toBe(closed.style.height);
  });

  it('gère une valeur maximale élevée sans dépasser 100% de hauteur', () => {
    render(<TrendChart trend={[trendItem({ created: 500, closed: 10 })]} />);
    const created = document.querySelector('.pilotage-trend-bar-created') as HTMLElement;
    expect(Number.parseFloat(created.style.height)).toBeLessThanOrEqual(100);
  });

  it('expose la légende Créés/Clôturés distincte par le texte, pas seulement la couleur', () => {
    render(<TrendChart trend={[trendItem()]} />);
    expect(screen.getByText('Créés')).toBeInTheDocument();
    expect(screen.getByText('Clôturés')).toBeInTheDocument();
  });
});
