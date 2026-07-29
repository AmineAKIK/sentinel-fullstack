#!/usr/bin/env python3
"""Permanent behavioral tests for the main-only release policy."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
POLICY = REPOSITORY_ROOT / "scripts" / "release_policy.py"
TAG_SHA = "a" * 40
OTHER_SHA = "b" * 40

REQUIRED_CHECKS = (
    "Backend / Quality",
    "Frontend / Quality",
    "Backend / PostgreSQL integration",
    "Browser / Critical journeys",
    "Containers / Production contract",
    "Ops / Backup and restore drill",
)
UNSET = object()


def successful_ci() -> dict[str, object]:
    return {
        "databaseId": 123456,
        "workflowName": "CI",
        "event": "push",
        "headBranch": "main",
        "headSha": TAG_SHA,
        "status": "completed",
        "conclusion": "success",
        "jobs": [
            {
                "name": name,
                "status": "completed",
                "conclusion": "success",
            }
            for name in REQUIRED_CHECKS
        ],
    }


def protected_environment(name: str) -> dict[str, object]:
    return {
        "name": name,
        "protection_rules": [
            {
                "type": "required_reviewers",
                "prevent_self_review": True,
                "reviewers": [
                    {
                        "type": "User",
                        "reviewer": {"login": "independent-reviewer"},
                    }
                ],
            },
            {"type": "branch_policy"},
        ],
        "deployment_branch_policy": {
            "protected_branches": False,
            "custom_branch_policies": True,
        },
    }


def protected_environment_policies(name: str) -> dict[str, object]:
    del name
    return {
        "total_count": 1,
        "branch_policies": [
            {
                "name": "main",
                "type": "branch",
            }
        ]
    }


class ReleasePolicyTests(unittest.TestCase):
    maxDiff = None

    def run_policy(
        self,
        *,
        tag: str = "v1.0.0-rc.5",
        tag_sha: str = TAG_SHA,
        main_sha: str = TAG_SHA,
        ci: dict[str, object] | None = None,
        release_state: str = "absent",
        dry_run: bool = False,
        separate_jobs_file: bool = False,
        jobs_total_count: int | None = None,
        environment: object = UNSET,
        environment_policies: object = UNSET,
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            ci_path = Path(temporary_directory) / "ci.json"
            jobs_path = Path(temporary_directory) / "jobs.json"
            environment_path = Path(temporary_directory) / "environment.json"
            environment_policies_path = (
                Path(temporary_directory) / "environment-policies.json"
            )
            ci_evidence = dict(ci if ci is not None else successful_ci())
            if separate_jobs_file:
                jobs = ci_evidence.pop("jobs", None)
                jobs_path.write_text(
                    json.dumps(
                        {
                            "total_count": (
                                len(jobs)
                                if jobs_total_count is None and isinstance(jobs, list)
                                else jobs_total_count
                            ),
                            "jobs": jobs,
                        }
                    )
                )
            ci_path.write_text(json.dumps(ci_evidence))
            environment_name = "prerelease" if "-rc." in tag else "production"
            environment_path.write_text(
                json.dumps(
                    protected_environment(environment_name)
                    if environment is UNSET
                    else environment
                )
            )
            environment_policies_path.write_text(
                json.dumps(
                    protected_environment_policies(environment_name)
                    if environment_policies is UNSET
                    else environment_policies
                )
            )
            command = [
                "python3",
                str(POLICY),
                "dry-run" if dry_run else "validate",
                "--tag",
                tag,
                "--tag-sha",
                tag_sha,
                "--main-sha",
                main_sha,
                "--ci-file",
                str(ci_path),
                "--environment-file",
                str(environment_path),
                "--environment-policies-file",
                str(environment_policies_path),
                "--release-state",
                release_state,
                "--repository",
                "AmineAKIK/sentinel-fullstack",
            ]
            if separate_jobs_file:
                command.extend(("--jobs-file", str(jobs_path)))
            return subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )

    def assert_refused(self, result: subprocess.CompletedProcess[str], fragment: str) -> None:
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(fragment, result.stderr)

    def test_accepts_only_documented_rc_and_stable_tags(self) -> None:
        expectations = {
            "v1.0.0-rc.5": ("rc", "prerelease"),
            "v10.20.30-rc.42": ("rc", "prerelease"),
            "v1.0.0": ("stable", "production"),
            "v10.20.30": ("stable", "production"),
        }

        for tag, (kind, environment) in expectations.items():
            with self.subTest(tag=tag):
                result = self.run_policy(tag=tag)
                self.assertEqual(result.returncode, 0, result.stderr)
                payload = json.loads(result.stdout)
                self.assertEqual(payload["kind"], kind)
                self.assertEqual(payload["environment"], environment)

    def test_rejects_invalid_tags_before_release_planning(self) -> None:
        invalid_tags = (
            "v1",
            "v1.0",
            "v01.0.0",
            "v1.00.0",
            "v1.0.00",
            "v1.0.0-rc.0",
            "v1.0.0-rc.01",
            "v1.0.0-beta.1",
            "v1.0.0-rc.1-extra",
            "release/v1.0.0-rc5",
            "v1.0.0\n",
        )

        for tag in invalid_tags:
            with self.subTest(tag=repr(tag)):
                self.assert_refused(self.run_policy(tag=tag), "invalid release tag")

    def test_rejects_release_branch_head_and_old_main_commit(self) -> None:
        self.assert_refused(
            self.run_policy(tag_sha=OTHER_SHA, main_sha=TAG_SHA),
            "TAG_SHA must equal the exact origin/main head",
        )
        self.assert_refused(
            self.run_policy(tag_sha=TAG_SHA, main_sha=OTHER_SHA),
            "TAG_SHA must equal the exact origin/main head",
        )

    def test_requires_the_main_push_ci_run_on_the_exact_tag_sha(self) -> None:
        mutations = {
            "wrong SHA": {"headSha": OTHER_SHA},
            "wrong branch": {"headBranch": "release/v1.0.0-rc5"},
            "wrong event": {"event": "pull_request"},
            "run queued": {"status": "queued"},
            "run neutral": {"conclusion": "neutral"},
            "run skipped": {"conclusion": "skipped"},
            "run cancelled": {"conclusion": "cancelled"},
            "run failed": {"conclusion": "failure"},
        }

        for label, mutation in mutations.items():
            with self.subTest(case=label):
                ci = successful_ci()
                ci.update(mutation)
                self.assert_refused(self.run_policy(ci=ci), "CI run")

    def test_accepts_the_raw_github_rest_run_and_separate_jobs_shapes(self) -> None:
        ci = successful_ci()
        ci["id"] = ci.pop("databaseId")
        ci["name"] = ci.pop("workflowName")
        ci["head_branch"] = ci.pop("headBranch")
        ci["head_sha"] = ci.pop("headSha")

        result = self.run_policy(ci=ci, separate_jobs_file=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_or_non_successful_required_checks(self) -> None:
        ci = successful_ci()
        ci["jobs"] = list(ci["jobs"])[:-1]
        self.assert_refused(self.run_policy(ci=ci), "missing required check")

        for conclusion in ("neutral", "skipped", "cancelled", "failure"):
            with self.subTest(conclusion=conclusion):
                ci = successful_ci()
                jobs = list(ci["jobs"])
                jobs[0] = {
                    "name": REQUIRED_CHECKS[0],
                    "status": "completed",
                    "conclusion": conclusion,
                }
                ci["jobs"] = jobs
                self.assert_refused(self.run_policy(ci=ci), "required check")

        ci = successful_ci()
        jobs = list(ci["jobs"])
        jobs[0] = {
            "name": REQUIRED_CHECKS[0],
            "status": "in_progress",
            "conclusion": None,
        }
        ci["jobs"] = jobs
        self.assert_refused(self.run_policy(ci=ci), "required check")

    def test_rejects_an_existing_release_to_prevent_tag_reuse(self) -> None:
        self.assert_refused(
            self.run_policy(release_state="present"),
            "release tag already has a GitHub release",
        )

    def test_refuses_absent_or_unprotected_release_environments(self) -> None:
        self.assert_refused(
            self.run_policy(environment=None),
            "protected environment is absent",
        )

        environment = protected_environment("prerelease")
        environment["protection_rules"] = []
        self.assert_refused(
            self.run_policy(environment=environment),
            "required_reviewers",
        )

        environment = protected_environment("prerelease")
        reviewer_rule = environment["protection_rules"][0]
        reviewer_rule["prevent_self_review"] = False
        self.assert_refused(
            self.run_policy(environment=environment),
            "prevent self-review",
        )

        self.assert_refused(
            self.run_policy(
                environment_policies={
                    "total_count": 1,
                    "branch_policies": [{"name": "release/*", "type": "branch"}]
                }
            ),
            "expected main branch policy",
        )

        self.assert_refused(
            self.run_policy(
                environment_policies={
                    "total_count": 2,
                    "branch_policies": [{"name": "main", "type": "branch"}],
                }
            ),
            "incomplete or truncated",
        )

    def test_refuses_truncated_ci_job_evidence(self) -> None:
        self.assert_refused(
            self.run_policy(separate_jobs_file=True, jobs_total_count=7),
            "CI jobs evidence is incomplete or truncated",
        )

    def test_full_dry_run_needs_no_secret_and_has_no_side_effect(self) -> None:
        result = self.run_policy(dry_run=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)

        self.assertEqual(payload["mode"], "dry-run")
        self.assertFalse(payload["registry_authentication"])
        self.assertFalse(payload["publication"])
        self.assertFalse(payload["uses_secrets"])
        self.assertEqual(payload["tag_sha"], TAG_SHA)
        self.assertEqual(payload["environment"], "prerelease")
        self.assertEqual(
            payload["images"],
            {
                "backend": "ghcr.io/amineakik/sentinel-fullstack/backend",
                "frontend": "ghcr.io/amineakik/sentinel-fullstack/frontend",
            },
        )
        self.assertEqual(
            payload["planned_evidence"],
            [
                "main head equality",
                "six successful checks on TAG_SHA",
                "protected environment with reviewer and exact main branch policy",
                "backend and frontend immutable digests",
                "SPDX SBOMs",
                "image provenance attestations",
                "release notes with SHA, digests, SBOMs and attestations",
            ],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
