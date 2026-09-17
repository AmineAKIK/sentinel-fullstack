// @ts-expect-error — modules Node réservés au test statique.
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error — modules Node réservés au test statique.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type E2ESpec = { file: string; source: string };

const e2eDirectory = resolve('e2e');
const e2eFiles = readdirSync(e2eDirectory) as string[];
const e2eSpecs: E2ESpec[] = e2eFiles
  .filter((file: string) => file.endsWith('.spec.ts'))
  .map((file: string) => ({
    file,
    source: readFileSync(resolve(e2eDirectory, file), 'utf8') as string,
  }));

function matchingLines(source: string, pattern: RegExp): number[] {
  return source.split('\n').flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

describe('contrat d’exécution E2E', () => {
  it('n’autorise aucun test.skip à masquer une précondition de données', () => {
    const offenders = e2eSpecs.flatMap(({ file, source }) =>
      matchingLines(source, /\btest\.skip\s*\(/).map((line) => `${file}:${line}`)
    );

    expect(offenders).toEqual([]);
  });

  it('exécute chaque test une seule fois en CI et conserve la trace du premier échec', () => {
    const config = readFileSync(resolve('playwright.config.ts'), 'utf8');

    expect(config).toMatch(/\bretries:\s*0\b/);
    expect(config).not.toMatch(/\bretries:\s*process\.env\.CI/);
    expect(config).toMatch(/\btrace:\s*['"]retain-on-failure['"]/);
  });

  it('attend des signaux fonctionnels sans pause temporelle arbitraire', () => {
    const offenders = e2eSpecs.flatMap(({ file, source }) =>
      matchingLines(source, /\.waitForTimeout\s*\(/).map((line) => `${file}:${line}`)
    );

    expect(offenders).toEqual([]);
  });

  it('configure les serveurs sans affectations shell incompatibles avec Windows', () => {
    const config = readFileSync(resolve('playwright.config.ts'), 'utf8');

    expect(config).not.toMatch(/command:\s*['"][A-Z_]+=/);
    expect(config).toContain("env: { PORT: '3100', CLIENT_ORIGIN: 'http://127.0.0.1:5174' }");
    expect(config).toContain("env: { VITE_API_URL: 'http://127.0.0.1:3100' }");
    expect(config.match(/reuseExistingServer:\s*false/g)).toHaveLength(3);
  });
});
