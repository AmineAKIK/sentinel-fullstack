#!/usr/bin/env python3
"""Permanent regression tests for the bounded RC5 dependency exceptions."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / "scripts" / "dependency_exception_guard.py"
POLICY = ROOT / "security" / "dependency-exceptions.json"
TODAY = "2026-07-30"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def direct_advisory(
    advisory: str,
    package: str,
    affected_range: str,
    node: str,
) -> dict[str, object]:
    return {
        "name": package,
        "severity": "high",
        "isDirect": package == "react-router",
        "via": [
            {
                "source": 1234567,
                "name": package,
                "dependency": package,
                "title": "fixture",
                "url": f"https://github.com/advisories/{advisory}",
                "severity": "high",
                "cwe": ["CWE-400"],
                "cvss": {"score": 7.5, "vectorString": "fixture"},
                "range": affected_range,
            }
        ],
        "effects": [],
        "range": affected_range,
        "nodes": [node],
        "fixAvailable": False,
    }


def wrapper_vulnerability(name: str, via: list[object], node: str) -> dict[str, object]:
    return {
        "name": name,
        "severity": "high",
        "isDirect": False,
        "via": via,
        "effects": [],
        "range": "*",
        "nodes": [node],
        "fixAvailable": False,
    }


def audit_document(vulnerabilities: dict[str, object]) -> dict[str, object]:
    high = sum(
        1
        for value in vulnerabilities.values()
        if isinstance(value, dict) and value.get("severity") == "high"
    )
    return {
        "auditReportVersion": 2,
        "vulnerabilities": vulnerabilities,
        "metadata": {
            "vulnerabilities": {
                "info": 0,
                "low": 0,
                "moderate": 0,
                "high": high,
                "critical": 0,
                "total": high,
            }
        },
    }


def frontend_runtime_audit() -> dict[str, object]:
    return audit_document(
        {
            "react-router": direct_advisory(
                "GHSA-qwww-vcr4-c8h2",
                "react-router",
                ">=7.12.0 <8.3.0",
                "node_modules/react-router",
            ),
            "react-router-dom": wrapper_vulnerability(
                "react-router-dom",
                ["react-router"],
                "node_modules/react-router-dom",
            ),
        }
    )


def frontend_full_audit() -> dict[str, object]:
    document = frontend_runtime_audit()
    vulnerabilities = document["vulnerabilities"]
    assert isinstance(vulnerabilities, dict)
    vulnerabilities.update(
        {
            "brace-expansion": direct_advisory(
                "GHSA-mh99-v99m-4gvg",
                "brace-expansion",
                "<=5.0.7",
                "node_modules/brace-expansion",
            ),
            "minimatch": wrapper_vulnerability(
                "minimatch", ["brace-expansion"], "node_modules/minimatch"
            ),
            "eslint-plugin-jsx-a11y": wrapper_vulnerability(
                "eslint-plugin-jsx-a11y",
                ["minimatch"],
                "node_modules/eslint-plugin-jsx-a11y",
            ),
        }
    )
    document["metadata"]["vulnerabilities"]["high"] = len(vulnerabilities)
    document["metadata"]["vulnerabilities"]["total"] = len(vulnerabilities)
    return document


def backend_full_audit() -> dict[str, object]:
    return audit_document(
        {
            "brace-expansion": {
                **direct_advisory(
                    "GHSA-mh99-v99m-4gvg",
                    "brace-expansion",
                    "<=5.0.7",
                    "node_modules/glob/node_modules/brace-expansion",
                ),
                "nodes": [
                    "node_modules/glob/node_modules/brace-expansion",
                    "node_modules/test-exclude/node_modules/brace-expansion",
                ],
            },
            "minimatch": wrapper_vulnerability(
                "minimatch",
                ["brace-expansion"],
                "node_modules/glob/node_modules/minimatch",
            ),
            "glob": wrapper_vulnerability(
                "glob", ["minimatch"], "node_modules/glob"
            ),
            "jest": wrapper_vulnerability("jest", ["@jest/core"], "node_modules/jest"),
            "@jest/core": wrapper_vulnerability(
                "@jest/core", ["@jest/reporters"], "node_modules/@jest/core"
            ),
            "@jest/reporters": wrapper_vulnerability(
                "@jest/reporters", ["glob"], "node_modules/@jest/reporters"
            ),
        }
    )


class DependencyExceptionPolicyTests(unittest.TestCase):
    maxDiff = None

    def run_guard(
        self,
        *arguments: str,
        repo_root: Path = ROOT,
        policy: Path = POLICY,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            "python3",
            str(GUARD),
            "--repo-root",
            str(repo_root),
            "--policy",
            str(policy),
            "--today",
            TODAY,
            *arguments,
        ]
        return subprocess.run(
            command,
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )

    def assert_guard_fails(
        self,
        result: subprocess.CompletedProcess[str],
        expected: str,
    ) -> None:
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected, result.stdout)

    def fixture(self) -> tuple[tempfile.TemporaryDirectory[str], Path, Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        for relative in (
            "backend/package.json",
            "backend/package-lock.json",
            "frontend/package.json",
            "frontend/package-lock.json",
            "frontend/src/main.tsx",
        ):
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        backend_source = root / "backend" / "src" / "server.ts"
        backend_source.parent.mkdir(parents=True, exist_ok=True)
        backend_source.write_text("export const sentinel = true;\n", encoding="utf-8")
        policy = root / "security" / "dependency-exceptions.json"
        policy.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(POLICY, policy)
        return temporary, root, policy

    def rewrite_policy_hash(self, root: Path, policy_path: Path, lockfile: str) -> None:
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        policy["lockfiles"][lockfile]["sha256"] = sha256(root / lockfile)
        policy_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")

    def write_audit(self, root: Path, name: str, document: dict[str, object]) -> Path:
        path = root / name
        path.write_text(json.dumps(document), encoding="utf-8")
        return path

    def test_repository_contract_accepts_the_reviewed_tree(self) -> None:
        result = self.run_guard("repository")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("repository policy: PASS", result.stdout)

    def test_expected_audits_are_accepted_and_no_other_scope_is_masked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = (
                ("frontend", "runtime", frontend_runtime_audit()),
                ("frontend", "full", frontend_full_audit()),
                ("backend", "runtime", audit_document({})),
                ("backend", "full", backend_full_audit()),
            )
            for workspace, audit_kind, document in cases:
                with self.subTest(workspace=workspace, audit_kind=audit_kind):
                    path = self.write_audit(
                        root, f"{workspace}-{audit_kind}.json", document
                    )
                    result = self.run_guard(
                        "audit",
                        "--workspace",
                        workspace,
                        "--audit-kind",
                        audit_kind,
                        "--audit-json",
                        str(path),
                    )
                    self.assertEqual(result.returncode, 0, result.stdout)
                    self.assertIn("audit policy: PASS", result.stdout)

    def test_expired_policy_is_rejected(self) -> None:
        result = subprocess.run(
            [
                "python3",
                str(GUARD),
                "--repo-root",
                str(ROOT),
                "--policy",
                str(POLICY),
                "--today",
                "2026-09-01",
                "repository",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        self.assert_guard_fails(result, "expired")

    def test_policy_owner_and_exact_exception_set_are_closed(self) -> None:
        for mutation, expected in (
            (lambda policy: policy.update({"risk_owner": ""}), "risk_owner"),
            (
                lambda policy: policy["exceptions"].append(
                    {
                        "advisory": "GHSA-xxxx-yyyy-zzzz",
                        "package": "surprise",
                        "affected_range": "*",
                        "classification": "not-applicable",
                        "risk_owner": "repository-owner:AmineAKIK",
                        "expires_on": "2026-08-31",
                        "required_scopes": [],
                        "forbidden_scopes": [],
                    }
                ),
                "exactly",
            ),
        ):
            with self.subTest(expected=expected):
                temporary, root, policy_path = self.fixture()
                with temporary:
                    policy = json.loads(policy_path.read_text(encoding="utf-8"))
                    mutation(policy)
                    policy_path.write_text(
                        json.dumps(policy, indent=2) + "\n", encoding="utf-8"
                    )
                    result = self.run_guard(
                        "repository", repo_root=root, policy=policy_path
                    )
                    self.assert_guard_fails(result, expected)

    def test_any_lockfile_change_forces_d2_re_evaluation(self) -> None:
        temporary, root, policy_path = self.fixture()
        with temporary:
            lockfile = root / "backend" / "package-lock.json"
            lockfile.write_bytes(lockfile.read_bytes() + b"\n")
            result = self.run_guard("repository", repo_root=root, policy=policy_path)
            self.assert_guard_fails(result, "D2 re-evaluation required")

    def test_router_version_mode_and_react_major_are_closed(self) -> None:
        mutations = (
            ("package-version", "router version", "frontend/package-lock.json"),
            ("resolved-version", "router version", "frontend/package-lock.json"),
            ("mode", "Declarative Mode", None),
            ("react-major", "React major", "frontend/package-lock.json"),
        )
        for mutation, expected, changed_lock in mutations:
            with self.subTest(mutation=mutation):
                temporary, root, policy_path = self.fixture()
                with temporary:
                    if mutation == "package-version":
                        package = json.loads(
                            (root / "frontend/package.json").read_text(encoding="utf-8")
                        )
                        package["dependencies"]["react-router-dom"] = "8.3.0"
                        (root / "frontend/package.json").write_text(
                            json.dumps(package), encoding="utf-8"
                        )
                    elif mutation in {"resolved-version", "react-major"}:
                        lock_path = root / "frontend/package-lock.json"
                        lock = json.loads(lock_path.read_text(encoding="utf-8"))
                        if mutation == "resolved-version":
                            lock["packages"]["node_modules/react-router"]["version"] = (
                                "8.3.0"
                            )
                        else:
                            lock["packages"]["node_modules/react"]["version"] = "19.1.0"
                        lock_path.write_text(json.dumps(lock), encoding="utf-8")
                    else:
                        entrypoint = root / "frontend/src/main.tsx"
                        entrypoint.write_text(
                            entrypoint.read_text(encoding="utf-8").replace(
                                "BrowserRouter", "RouterProvider"
                            ),
                            encoding="utf-8",
                        )
                    if changed_lock:
                        self.rewrite_policy_hash(root, policy_path, changed_lock)
                    result = self.run_guard(
                        "repository", repo_root=root, policy=policy_path
                    )
                    self.assert_guard_fails(result, expected)

    def test_rsc_dependency_and_api_are_rejected(self) -> None:
        for mutation, expected in (
            ("dependency", "RSC dependency"),
            ("api", "RSC API"),
            ("test-api", "RSC API"),
        ):
            with self.subTest(mutation=mutation):
                temporary, root, policy_path = self.fixture()
                with temporary:
                    if mutation == "dependency":
                        lock_path = root / "frontend/package-lock.json"
                        lock = json.loads(lock_path.read_text(encoding="utf-8"))
                        lock["packages"][""]["dependencies"][
                            "react-server-dom-webpack"
                        ] = "19.1.0"
                        lock["packages"][
                            "node_modules/react-server-dom-webpack"
                        ] = {"version": "19.1.0"}
                        lock_path.write_text(json.dumps(lock), encoding="utf-8")
                        self.rewrite_policy_hash(
                            root, policy_path, "frontend/package-lock.json"
                        )
                    elif mutation == "api":
                        entrypoint = root / "frontend/src/main.tsx"
                        entrypoint.write_text(
                            entrypoint.read_text(encoding="utf-8")
                            + "\nconst forbidden = unstable_RSCHydratedRouter;\n",
                            encoding="utf-8",
                        )
                    else:
                        test_source = (
                            root / "frontend/src/__tests__/rsc-policy.test.tsx"
                        )
                        test_source.parent.mkdir(parents=True, exist_ok=True)
                        test_source.write_text(
                            "const forbidden = unstable_getRSCStream;\n",
                            encoding="utf-8",
                        )
                    result = self.run_guard(
                        "repository", repo_root=root, policy=policy_path
                    )
                    self.assert_guard_fails(result, expected)

    def test_attacker_controlled_brace_glob_or_minimatch_pattern_is_rejected(self) -> None:
        temporary, root, policy_path = self.fixture()
        with temporary:
            source = root / "backend/src/server.ts"
            source.write_text(
                "import minimatch from 'minimatch';\n"
                "export const matches = (userPattern: string) => "
                "minimatch('/srv/data', userPattern);\n",
                encoding="utf-8",
            )
            result = self.run_guard("repository", repo_root=root, policy=policy_path)
            self.assert_guard_fails(result, "application pattern")

    def test_brace_installation_or_transitive_path_drift_is_rejected(self) -> None:
        temporary, root, policy_path = self.fixture()
        with temporary:
            lock_path = root / "backend/package-lock.json"
            lock = json.loads(lock_path.read_text(encoding="utf-8"))
            value = lock["packages"].pop(
                "node_modules/glob/node_modules/brace-expansion"
            )
            lock["packages"][
                "node_modules/glob/node_modules/minimatch/node_modules/brace-expansion"
            ] = value
            lock_path.write_text(json.dumps(lock), encoding="utf-8")
            self.rewrite_policy_hash(root, policy_path, "backend/package-lock.json")
            result = self.run_guard("repository", repo_root=root, policy=policy_path)
            self.assert_guard_fails(result, "Brace installation graph")

    def test_brace_advisory_is_forbidden_in_runtime_audit(self) -> None:
        document = frontend_runtime_audit()
        vulnerabilities = document["vulnerabilities"]
        assert isinstance(vulnerabilities, dict)
        vulnerabilities["brace-expansion"] = direct_advisory(
            "GHSA-mh99-v99m-4gvg",
            "brace-expansion",
            "<=5.0.7",
            "node_modules/brace-expansion",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_audit(Path(directory), "audit.json", document)
            result = self.run_guard(
                "audit",
                "--workspace",
                "frontend",
                "--audit-kind",
                "runtime",
                "--audit-json",
                str(path),
            )
        self.assert_guard_fails(result, "forbidden in frontend-runtime")

    def test_unknown_or_hidden_ghsa_is_never_masked(self) -> None:
        for hidden in (False, True):
            with self.subTest(hidden=hidden):
                document = frontend_runtime_audit()
                vulnerabilities = document["vulnerabilities"]
                assert isinstance(vulnerabilities, dict)
                unknown = direct_advisory(
                    "GHSA-xxxx-yyyy-zzzz",
                    "surprise",
                    "*",
                    "node_modules/surprise",
                )
                if hidden:
                    router = vulnerabilities["react-router"]
                    assert isinstance(router, dict)
                    via = router["via"]
                    assert isinstance(via, list)
                    via.extend(unknown["via"])
                else:
                    vulnerabilities["surprise"] = unknown
                with tempfile.TemporaryDirectory() as directory:
                    path = self.write_audit(Path(directory), "audit.json", document)
                    result = self.run_guard(
                        "audit",
                        "--workspace",
                        "frontend",
                        "--audit-kind",
                        "runtime",
                        "--audit-json",
                        str(path),
                    )
                self.assert_guard_fails(result, "unapproved advisory")

    def test_advisory_range_and_direct_node_paths_are_exact(self) -> None:
        for mutation, expected in (
            ("range", "affected range"),
            ("node", "direct advisory node"),
        ):
            with self.subTest(mutation=mutation):
                document = frontend_runtime_audit()
                router = document["vulnerabilities"]["react-router"]
                assert isinstance(router, dict)
                if mutation == "range":
                    via = router["via"]
                    assert isinstance(via, list)
                    via[0]["range"] = ">=7.0.0"
                else:
                    router["nodes"] = ["node_modules/other-react-router"]
                with tempfile.TemporaryDirectory() as directory:
                    path = self.write_audit(Path(directory), "audit.json", document)
                    result = self.run_guard(
                        "audit",
                        "--workspace",
                        "frontend",
                        "--audit-kind",
                        "runtime",
                        "--audit-json",
                        str(path),
                    )
                self.assert_guard_fails(result, expected)

    def test_required_exception_cannot_silently_disappear_from_a_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_audit(
                Path(directory), "audit.json", audit_document({})
            )
            result = self.run_guard(
                "audit",
                "--workspace",
                "frontend",
                "--audit-kind",
                "runtime",
                "--audit-json",
                str(path),
            )
        self.assert_guard_fails(result, "required exception")

    def test_release_images_must_not_contain_brace_expansion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docker = root / "docker"
            docker.write_text(
                "#!/bin/sh\nprintf '%s' \"${FAKE_DOCKER_OUTPUT:-}\"\n",
                encoding="utf-8",
            )
            docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
            base_env = os.environ.copy()
            base_env["PATH"] = f"{root}:{base_env['PATH']}"

            clean = self.run_guard(
                "images",
                "--backend-image",
                "sentinel-backend:test",
                "--frontend-image",
                "sentinel-frontend:test",
                env={**base_env, "FAKE_DOCKER_OUTPUT": ""},
            )
            self.assertEqual(clean.returncode, 0, clean.stdout)

            contaminated = self.run_guard(
                "images",
                "--backend-image",
                "sentinel-backend:test",
                "--frontend-image",
                "sentinel-frontend:test",
                env={
                    **base_env,
                    "FAKE_DOCKER_OUTPUT": (
                        "/app/node_modules/brace-expansion/package.json\n"
                    ),
                },
            )
            self.assert_guard_fails(contaminated, "release image")

    def test_ci_enforces_repository_full_runtime_and_image_guards(self) -> None:
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertGreaterEqual(
            workflow.count("dependency_exception_guard.py repository"), 2
        )
        self.assertIn("--audit-kind runtime", workflow)
        self.assertIn("--audit-kind full", workflow)
        self.assertIn("dependency_exception_guard.py images", workflow)
        self.assertIn("sentinel-backend:ci", workflow)
        self.assertIn("sentinel-frontend:ci", workflow)


if __name__ == "__main__":
    unittest.main(verbosity=2)
