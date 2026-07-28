#!/usr/bin/env python3
"""Collecte automatiquement les faits chiffrés du dossier DWWM depuis l'état du
dépôt, au SHA courant. Aucun chiffre n'est codé en dur : chaque valeur est
dérivée d'une source vérifiable (migrations, YAML CI, git, rapports de test).

Le script ÉCHOUE (exit 1, exception explicite) dès qu'un fait ne peut pas être
établi automatiquement — jamais de valeur par défaut ou périmée silencieuse.

Les compteurs de tests proviennent de rapports JSON produits par les suites
réellement exécutées (Jest --json, Vitest --reporter=json, Playwright
--list --reporter=json), passés en argument. Le script refuse un rapport dont
`success` n'est pas vrai : on ne compte que des tests réellement passants.

Usage :
  # 1. produire les rapports (depuis backend/ et frontend/)
  cd backend  && npm test -- --selectProjects unit        --json --outputFile=/tmp/unit.json
  cd backend  && DATABASE_URL=... npm run test:integration -- --json --outputFile=/tmp/integ.json
  cd frontend && npx vitest run --reporter=json --outputFile=/tmp/front.json
  cd frontend && npx playwright test --reporter=json > /tmp/e2e.json
  # 2. collecter
  python3 scripts/collectDossierFacts.py \
      --unit-report /tmp/unit.json --integration-report /tmp/integ.json \
      --frontend-report /tmp/front.json --e2e-report /tmp/e2e.json

Sortie : un objet JSON sur stdout, prêt à alimenter le générateur du dossier.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class FactError(RuntimeError):
    """Un fait n'a pas pu être établi automatiquement."""


def run(cmd: list[str], *, cwd: Path = REPO_ROOT) -> str:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FactError(f"Commande échouée ({' '.join(cmd)}): {result.stderr.strip()}")
    return result.stdout.strip()


def collect_sha() -> str:
    sha = run(["git", "rev-parse", "HEAD"])
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise FactError(f"SHA git inattendu : {sha!r}")
    return sha


def collect_tracked_files() -> int:
    out = run(["git", "ls-files"])
    count = len([line for line in out.splitlines() if line])
    if count <= 0:
        raise FactError("git ls-files n'a renvoyé aucun fichier suivi.")
    return count


def collect_migrations() -> int:
    migrations_dir = REPO_ROOT / "backend" / "migrations"
    if not migrations_dir.is_dir():
        raise FactError(f"Dossier de migrations introuvable : {migrations_dir}")
    files = sorted(p.name for p in migrations_dir.glob("[0-9]*.sql"))
    if not files:
        raise FactError("Aucune migration SQL numérotée trouvée.")
    # Vérifie la séquence continue 001..NNN : une lacune signale un problème.
    numbers = [int(name.split("_", 1)[0]) for name in files]
    expected = list(range(1, len(numbers) + 1))
    if numbers != expected:
        raise FactError(f"Séquence de migrations non continue : {numbers}")
    return len(files)


def collect_tables() -> dict[str, object]:
    migrations_dir = REPO_ROOT / "backend" / "migrations"
    pattern = re.compile(r"CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)", re.IGNORECASE)
    tables: set[str] = set()
    for sql_file in migrations_dir.glob("[0-9]*.sql"):
        for match in pattern.finditer(sql_file.read_text(encoding="utf-8")):
            tables.add(match.group(1).lower())
    tables.discard("schema_migrations")  # créée par migrate.ts, pas par une migration
    if not tables:
        raise FactError("Aucune table applicative trouvée dans les migrations.")
    # schema_migrations est bien créée par le runner de migration.
    migrate_ts = REPO_ROOT / "backend" / "src" / "db" / "migrate.ts"
    if "CREATE TABLE IF NOT EXISTS schema_migrations" not in migrate_ts.read_text(encoding="utf-8"):
        raise FactError("schema_migrations non trouvée dans migrate.ts (table technique).")
    application = sorted(tables)
    return {
        "application": len(application),
        "technical": 1,
        "total": len(application) + 1,
        "names": application,
    }


def collect_ci_jobs() -> int:
    ci_yml = REPO_ROOT / ".github" / "workflows" / "ci.yml"
    try:
        import yaml  # type: ignore
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise FactError("PyYAML requis pour parser ci.yml (pip install pyyaml).") from exc
    data = yaml.safe_load(ci_yml.read_text(encoding="utf-8"))
    jobs = data.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        raise FactError("Aucun job trouvé dans ci.yml.")
    return len(jobs)


def collect_e2e_files() -> int:
    e2e_dir = REPO_ROOT / "frontend" / "e2e"
    specs = sorted(p.name for p in e2e_dir.glob("*.spec.ts"))
    if not specs:
        raise FactError("Aucun fichier .spec.ts trouvé dans frontend/e2e.")
    return len(specs)


def read_jest_report(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("success", False):
        raise FactError(f"Rapport de test non vert : {path}")
    total = data.get("numTotalTests")
    passed = data.get("numPassedTests")
    if total is None or total != passed:
        raise FactError(f"Rapport incohérent (total={total}, passed={passed}) : {path}")
    if total <= 0:
        raise FactError(f"Rapport sans test : {path}")
    return int(total)


def read_playwright_report(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    stats = data.get("stats")
    if not isinstance(stats, dict):
        raise FactError(f"Statistiques Playwright absentes : {path}")
    expected = stats.get("expected")
    skipped = stats.get("skipped")
    unexpected = stats.get("unexpected")
    flaky = stats.get("flaky")
    if not all(isinstance(value, int) for value in (expected, skipped, unexpected, flaky)):
        raise FactError(f"Statistiques Playwright incohérentes : {path}")
    if expected <= 0:
        raise FactError(f"Rapport Playwright sans test passant : {path}")
    if skipped != 0 or unexpected != 0 or flaky != 0:
        raise FactError(
            "Rapport Playwright non entièrement vert "
            f"(passed={expected}, skipped={skipped}, unexpected={unexpected}, flaky={flaky}) : {path}"
        )
    return int(expected)


def main() -> int:
    parser = argparse.ArgumentParser(description="Collecte les faits chiffrés du dossier DWWM.")
    parser.add_argument("--unit-report", type=Path, required=True)
    parser.add_argument("--integration-report", type=Path, required=True)
    parser.add_argument("--frontend-report", type=Path, required=True)
    parser.add_argument("--e2e-report", type=Path, required=True)
    args = parser.parse_args()

    for label, path in [
        ("unit", args.unit_report),
        ("integration", args.integration_report),
        ("frontend", args.frontend_report),
        ("e2e", args.e2e_report),
    ]:
        if not path.is_file():
            raise FactError(f"Rapport {label} introuvable : {path}")

    unit = read_jest_report(args.unit_report)
    integration = read_jest_report(args.integration_report)
    frontend = read_jest_report(args.frontend_report)
    e2e = read_playwright_report(args.e2e_report)

    tables = collect_tables()
    facts = {
        "sha": collect_sha(),
        "tracked_files": collect_tracked_files(),
        "migrations": collect_migrations(),
        "tables": tables,
        "ci_jobs": collect_ci_jobs(),
        "e2e_files": collect_e2e_files(),
        "tests": {
            "backend_unit": unit,
            "backend_integration": integration,
            "frontend": frontend,
            "e2e": e2e,
            "total": unit + integration + frontend + e2e,
        },
    }

    # Cohérence croisée : le nombre de scénarios E2E comptés doit correspondre
    # au nombre de fichiers de specs au minimum (un fichier = au moins un test).
    if e2e < facts["e2e_files"]:
        raise FactError(
            f"Incohérence E2E : {e2e} tests pour {facts['e2e_files']} fichiers de specs."
        )

    print(json.dumps(facts, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FactError as error:
        print(f"[collectDossierFacts] ÉCHEC : {error}", file=sys.stderr)
        sys.exit(1)
