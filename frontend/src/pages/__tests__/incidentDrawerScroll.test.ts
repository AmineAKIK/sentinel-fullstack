import { describe, expect, it } from 'vitest';
// Vitest s'exécute sous Node : `node:fs`/`node:path` sont disponibles à
// l'exécution. Le frontend n'embarque pas @types/node (bundle navigateur), d'où
// ces deux échappatoires locales et documentées — préférables à l'ajout d'une
// dépendance de types ou à l'élargissement du tsconfig pour un seul test-outil.
// @ts-expect-error — module Node non typé côté frontend, présent à l'exécution.
import { readFileSync } from 'node:fs';
// @ts-expect-error — module Node non typé côté frontend, présent à l'exécution.
import { resolve } from 'node:path';

/**
 * Lot 8 (cartes et panneau — scroll desktop). Le drawer de détail est
 * `position: sticky` et masque son débordement (`overflow: hidden`). Sans
 * borne de hauteur ni région défilante interne, un dossier plus haut que la
 * fenêtre voit ses actions de bas de panneau (Suspendre, Annuler…) coupées et
 * inatteignables au bureau. Ce test verrouille le contrat CSS ; le comportement
 * de défilement réel est vérifié en navigateur au lot 10 (E2E).
 *
 * La feuille est lue sur le disque (et non via `?raw`) : dans la configuration
 * Vitest du projet, `import '...css?raw'` renvoie une chaîne vide, ce qui
 * rendrait toute assertion faussement satisfaite.
 */
const workshopStyles: string = readFileSync(resolve('src/styles/pages/workshop.css'), 'utf8');

// Extrait le corps de la règle TOP-LEVEL `selector { ... }` (colonne 0, donc
// précédée d'un saut de ligne) — et non d'une surcharge indentée dans un
// media-query. Pas de règles imbriquées dans ces sélecteurs plats, le premier
// `}` clôt donc bien la règle.
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf('\n' + selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return '';
  return css.slice(open + 1, close);
}

describe('drawer de détail — scroll desktop (lot 8)', () => {
  it('lit réellement la feuille de style (garde-fou anti-chaîne-vide)', () => {
    expect(workshopStyles.length).toBeGreaterThan(1000);
    expect(workshopStyles).toContain('.incident-detail-drawer {');
  });

  it('borne la hauteur du drawer collant à la fenêtre', () => {
    const drawer = ruleBody(workshopStyles, '.incident-detail-drawer {');
    expect(drawer).toContain('position: sticky');
    // Une borne de hauteur relative à la fenêtre est indispensable pour qu'un
    // drawer collant qui masque son débordement reste entièrement navigable.
    expect(drawer).toMatch(/max-height:\s*calc\(100vh/);
  });

  it('fait défiler le corps du panneau à l’intérieur du drawer', () => {
    const content = ruleBody(workshopStyles, '.incident-detail-content {');
    // Le corps devient la région défilante (et non plus un bloc à débordement
    // visible clippé par le drawer).
    expect(content).toMatch(/overflow-y:\s*auto/);
    // Il doit pouvoir occuper la hauteur restante puis défiler : flex + min-height:0.
    expect(content).toMatch(/min-height:\s*0/);
    expect(content).not.toMatch(/overflow-y:\s*visible/);
  });
});
