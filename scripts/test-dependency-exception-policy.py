#!/usr/bin/env python3
"""Regression tests for Sentinel's reviewed dependency policy."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / "scripts" / "dependency_exception_guard.py"
POLICY = ROOT / "security" / "dependency-exceptions.json"
TODAY = "2026-09-16"


def audit_document(
    vulnerabilities: dict[str, object] | None = None,
) -> dict[str, object]:
    return {"auditReportVersion": 2, "vulnerabilities": vulnerabilities or {}}


def direct_high(advisory: str, package: str) -> dict[str, object]:
    return {
        "name": package,
        "severity": "high",
        "isDirect": True,
        "via": [
            {
                "source": 1,
                "name": package,
                "dependency": package,
                "title": "fixture",
                "url": f"https://github.com/advisories/{advisory}",
                "severity": "high",
                "range": "*",
            }
        ],
        "effects": [],
        "range": "*",
        "nodes": [f"node_modules/{package}"],
        "fixAvailable": False,
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class DependencyPolicyTests(unittest.TestCase):
    maxDiff = None

    def run_guard(
        self,
        *args: str,
        repo_root: Path = ROOT,
        policy: Path = POLICY,
        today: str = TODAY,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "python3",
                str(GUARD),
                "--repo-root",
                str(repo_root),
                "--policy",
                str(policy),
                "--today",
                today,
                *args,
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )

    def assert_passes(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertEqual(result.returncode, 0, result.stdout)

    def assert_fails(
        self,
        result: subprocess.CompletedProcess[str],
        text: str,
    ) -> None:
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(text, result.stdout)

    def write_audit(
        self,
        directory: Path,
        name: str,
        document: dict[str, object],
    ) -> Path:
        path = directory / name
        path.write_text(json.dumps(document), encoding="utf-8")
        return path

    def policy_fixture(
        self,
        directory: Path,
    ) -> tuple[Path, dict[str, object]]:
        document = json.loads(POLICY.read_text(encoding="utf-8"))
        path = directory / "policy.json"
        path.write_text(
            json.dumps(document, indent=2) + "\n",
            encoding="utf-8",
        )
        return path, document

    def add_exception(
        self,
        document: dict[str, object],
        *,
        expires_on: str = "2026-09-30",
    ) -> None:
        document["exceptions"] = [
            {
                "advisory": "GHSA-1111-2222-3333",
                "package": "fixture-package",
                "risk_owner": "repository-owner:AmineAKIK",
                "expires_on": expires_on,
                "rationale": "Regression fixture for a bounded temporary exception.",
                "required_scopes": ["frontend-full"],
                "forbidden_scopes": [
                    "backend-runtime",
                    "backend-full",
                    "frontend-runtime",
                ],
            }
        ]

    def test_reviewed_repository_and_zero_exception_audits_pass(self) -> None:
        self.assert_passes(self.run_guard("repository"))
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            audit = self.write_audit(
                directory,
                "empty.json",
                audit_document(),
            )
            for workspace in ("backend", "frontend"):
                for audit_kind in ("runtime", "full"):
                    with self.subTest(
                        workspace=workspace,
                        audit_kind=audit_kind,
                    ):
                        self.assert_passes(
                            self.run_guard(
                                "audit",
                                "--workspace",
                                workspace,
                                "--audit-kind",
                                audit_kind,
                                "--audit-json",
                                str(audit),
                            )
                        )

    def test_unknown_high_advisory_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            audit = self.write_audit(
                directory,
                "unknown.json",
                audit_document(
                    {
                        "fixture-package": direct_high(
                            "GHSA-aaaa-bbbb-cccc",
                            "fixture-package",
                        )
                    }
                ),
            )
            result = self.run_guard(
                "audit",
                "--workspace",
                "frontend",
                "--audit-kind",
                "full",
                "--audit-json",
                str(audit),
            )
            self.assert_fails(result, "unapproved advisory")

    def test_declared_exception_must_be_observed_in_its_required_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            policy_path, document = self.policy_fixture(directory)
            self.add_exception(document)
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )
            self.assert_passes(
                self.run_guard("repository", policy=policy_path)
            )
            audit = self.write_audit(
                directory,
                "empty.json",
                audit_document(),
            )
            result = self.run_guard(
                "audit",
                "--workspace",
                "frontend",
                "--audit-kind",
                "full",
                "--audit-json",
                str(audit),
                policy=policy_path,
            )
            self.assert_fails(result, "exception set differs")

    def test_expired_exception_fails_every_guard_command_at_policy_validation(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            policy_path, document = self.policy_fixture(directory)
            self.add_exception(document, expires_on="2026-09-16")
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.run_guard(
                "repository",
                policy=policy_path,
                today="2026-09-17",
            )
            self.assert_fails(result, "expired on 2026-09-16")

    def test_forbidden_scope_rejects_a_declared_advisory(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            policy_path, document = self.policy_fixture(directory)
            self.add_exception(document)
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )
            audit = self.write_audit(
                directory,
                "forbidden.json",
                audit_document(
                    {
                        "fixture-package": direct_high(
                            "GHSA-1111-2222-3333",
                            "fixture-package",
                        )
                    }
                ),
            )
            result = self.run_guard(
                "audit",
                "--workspace",
                "backend",
                "--audit-kind",
                "runtime",
                "--audit-json",
                str(audit),
                policy=policy_path,
            )
            self.assert_fails(result, "forbidden")

    def test_lockfile_drift_forces_dependency_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            root = Path(directory_name)
            for relative in (
                "backend/package-lock.json",
                "frontend/package-lock.json",
            ):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, target)
            backend_lock = root / "backend/package-lock.json"
            backend_lock.write_bytes(backend_lock.read_bytes() + b"\n")
            self.assert_fails(
                self.run_guard("repository", repo_root=root),
                "dependency review required",
            )

    def test_runtime_closure_cannot_be_bypassed_by_updating_lock_hashes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            root = Path(directory_name) / "repo"
            policy_dir = Path(directory_name) / "policy"
            policy_dir.mkdir(parents=True)
            for relative in (
                "backend/package-lock.json",
                "frontend/package-lock.json",
            ):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, target)

            frontend_lock_path = root / "frontend/package-lock.json"
            frontend_lock = json.loads(
                frontend_lock_path.read_text(encoding="utf-8")
            )
            root_record = frontend_lock["packages"][""]
            dependencies = dict(root_record.get("dependencies", {}))
            dependencies["brace-expansion"] = "1.1.18"
            root_record["dependencies"] = dependencies
            frontend_lock_path.write_text(
                json.dumps(frontend_lock, indent=2) + "\n",
                encoding="utf-8",
            )

            policy_path, document = self.policy_fixture(policy_dir)
            document["lockfiles"]["backend/package-lock.json"]["sha256"] = sha256(
                root / "backend/package-lock.json"
            )
            document["lockfiles"]["frontend/package-lock.json"]["sha256"] = sha256(
                frontend_lock_path
            )
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )

            result = self.run_guard(
                "repository",
                repo_root=root,
                policy=policy_path,
            )
            self.assert_fails(result, "runtime contract violated")

    def test_router_contract_is_not_policy_editable(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            policy_path, document = self.policy_fixture(directory)
            document["router_contract"]["declared_version"] = "7.18.3"
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.run_guard(
                "repository",
                policy=policy_path,
            )
            self.assert_fails(result, "Router/React contract")

    def test_policy_owner_schema_and_scope_partition_are_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            for mutation, expected in (
                (lambda p: p.update({"risk_owner": ""}), "risk_owner"),
                (lambda p: p.update({"schema_version": 1}), "schema_version"),
            ):
                policy_path, document = self.policy_fixture(directory)
                mutation(document)
                policy_path.write_text(
                    json.dumps(document, indent=2) + "\n",
                    encoding="utf-8",
                )
                self.assert_fails(
                    self.run_guard("repository", policy=policy_path),
                    expected,
                )

            policy_path, document = self.policy_fixture(directory)
            self.add_exception(document)
            document["exceptions"][0]["forbidden_scopes"] = [
                "backend-runtime"
            ]
            policy_path.write_text(
                json.dumps(document, indent=2) + "\n",
                encoding="utf-8",
            )
            self.assert_fails(
                self.run_guard("repository", policy=policy_path),
                "classify all audit scopes",
            )


if __name__ == "__main__":
    unittest.main()
