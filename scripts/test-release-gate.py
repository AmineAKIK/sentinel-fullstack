#!/usr/bin/env python3
"""Offline end-to-end dry-run of the release evidence collector.

The real shell collector and policy engine execute with local ``git``/``gh``
command doubles. No token, network request, registry login or publication
command is possible in this test.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
GATE = REPOSITORY_ROOT / "scripts" / "verify-release-candidate.sh"
TAG_SHA = "a" * 40
REQUIRED_CHECKS = (
    "Backend / Quality",
    "Frontend / Quality",
    "Backend / PostgreSQL integration",
    "Browser / Critical journeys",
    "Containers / Production contract",
    "Ops / Backup and restore drill",
)


class ReleaseGateDryRunTests(unittest.TestCase):
    maxDiff = None

    def test_complete_collector_dry_run_has_no_token_or_publication_command(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            fake_bin = temporary / "bin"
            fake_bin.mkdir()
            command_log = temporary / "commands.log"

            fake_git = fake_bin / "git"
            fake_git.write_text(
                textwrap.dedent(
                    """\
                    #!/usr/bin/env bash
                    set -euo pipefail
                    printf 'git' >>"$RELEASE_TEST_COMMAND_LOG"
                    printf ' %q' "$@" >>"$RELEASE_TEST_COMMAND_LOG"
                    printf '\\n' >>"$RELEASE_TEST_COMMAND_LOG"
                    case "${1:-}" in
                      fetch)
                        exit 0
                        ;;
                      rev-parse)
                        case "${2:-}" in
                          refs/tags/*)
                            printf '%s\\n' "$RELEASE_TEST_TAG_SHA"
                            ;;
                          refs/remotes/origin/main*)
                            printf '%s\\n' "$RELEASE_TEST_MAIN_SHA"
                            ;;
                          HEAD*)
                            printf '%s\\n' "$RELEASE_TEST_HEAD_SHA"
                            ;;
                          *)
                            echo "unexpected rev-parse ref: ${2:-}" >&2
                            exit 91
                            ;;
                        esac
                        ;;
                      *)
                        echo "unexpected git command: $*" >&2
                        exit 90
                        ;;
                    esac
                    """
                )
            )
            fake_git.chmod(0o755)

            fake_gh = fake_bin / "gh"
            fake_gh.write_text(
                textwrap.dedent(
                    f"""\
                    #!/usr/bin/env python3
                    import json
                    import os
                    import sys

                    with open(os.environ["RELEASE_TEST_COMMAND_LOG"], "a", encoding="utf-8") as log:
                        log.write("gh " + " ".join(sys.argv[1:]) + "\\n")

                    if len(sys.argv) != 3 or sys.argv[1] != "api":
                        raise SystemExit("only read-only gh api calls are allowed")
                    endpoint = sys.argv[2]
                    sha = os.environ["RELEASE_TEST_TAG_SHA"]
                    scenario = os.environ["RELEASE_TEST_SCENARIO"]
                    checks = {list(REQUIRED_CHECKS)!r}

                    if "/releases/tags/" in endpoint:
                        print("gh: Not Found (HTTP 404)", file=sys.stderr)
                        raise SystemExit(1)
                    if endpoint.endswith("/deployment-branch-policies?per_page=100"):
                        print(json.dumps({{
                            "total_count": 1,
                            "branch_policies": [{{"name": "main", "type": "branch"}}]
                        }}))
                    elif endpoint.endswith("/environments/prerelease"):
                        if scenario == "environment-absent":
                            print("gh: Not Found (HTTP 404)", file=sys.stderr)
                            raise SystemExit(1)
                        print(json.dumps({{
                            "name": "prerelease",
                            "protection_rules": [
                                {{
                                    "type": "required_reviewers",
                                    "prevent_self_review": True,
                                    "reviewers": [
                                        {{
                                            "type": "User",
                                            "reviewer": {{"login": "independent-reviewer"}}
                                        }}
                                    ]
                                }},
                                {{"type": "branch_policy"}}
                            ],
                            "deployment_branch_policy": {{
                                "protected_branches": False,
                                "custom_branch_policies": True
                            }}
                        }}))
                    elif "/actions/workflows/ci.yml/runs?" in endpoint:
                        if scenario == "ci-absent":
                            print(json.dumps({{"total_count": 0, "workflow_runs": []}}))
                            raise SystemExit(0)
                        if scenario == "runs-truncated":
                            total_count = 2
                        else:
                            total_count = 1
                        print(json.dumps({{
                            "total_count": total_count,
                            "workflow_runs": [{{
                                "id": 123456,
                                "name": "CI",
                                "event": "push",
                                "head_branch": "main",
                                "head_sha": sha,
                                "status": "completed",
                                "conclusion": "success",
                                "created_at": "2026-07-29T00:00:00Z"
                            }}]
                        }}))
                    elif endpoint.endswith("/actions/runs/123456/jobs?filter=latest&per_page=100"):
                        if scenario == "missing-check":
                            checks = checks[:-1]
                        print(json.dumps({{
                            "total_count": len(checks),
                            "jobs": [
                                {{"name": name, "status": "completed", "conclusion": "success"}}
                                for name in checks
                            ]
                        }}))
                    elif endpoint.endswith("/actions/runs/123456"):
                        print(json.dumps({{
                            "id": 123456,
                            "name": "CI",
                            "event": "push",
                            "head_branch": "main",
                            "head_sha": sha,
                            "status": "completed",
                            "conclusion": "success"
                        }}))
                    else:
                        raise SystemExit(f"unexpected GitHub endpoint: {{endpoint}}")
                    """
                )
            )
            fake_gh.chmod(0o755)

            base_environment = dict(os.environ)
            base_environment.pop("GH_TOKEN", None)
            base_environment.update(
                {
                    "PATH": f"{fake_bin}:{base_environment['PATH']}",
                    "GITHUB_EVENT_NAME": "workflow_dispatch",
                    "GITHUB_REF": "refs/heads/main",
                    "GITHUB_REPOSITORY": "AmineAKIK/sentinel-fullstack",
                    "RELEASE_POLICY_MODE": "dry-run",
                    "RELEASE_TEST_COMMAND_LOG": str(command_log),
                    "RELEASE_TEST_HEAD_SHA": TAG_SHA,
                    "RELEASE_TEST_MAIN_SHA": TAG_SHA,
                    "RELEASE_TEST_SCENARIO": "success",
                    "RELEASE_TEST_TAG_SHA": TAG_SHA,
                    "TAG_NAME": "v1.0.0-rc.5",
                }
            )

            def execute(**overrides: str) -> tuple[subprocess.CompletedProcess[str], list[str]]:
                command_log.write_text("")
                environment = {**base_environment, **overrides}
                result = subprocess.run(
                    ["bash", str(GATE)],
                    cwd=REPOSITORY_ROOT,
                    env=environment,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                commands = command_log.read_text().splitlines()
                self.assertTrue(commands)
                self.assertTrue(
                    all(line.startswith(("git ", "gh api ")) for line in commands)
                )
                self.assertFalse(any("login" in line for line in commands))
                self.assertFalse(any("release create" in line for line in commands))
                self.assertFalse(any("docker" in line for line in commands))
                self.assertFalse(any(line.startswith("git push") for line in commands))
                self.assertFalse(any(line.startswith("git tag") for line in commands))
                return result, commands

            result, commands = execute()
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["mode"], "dry-run")
            self.assertFalse(payload["registry_authentication"])
            self.assertFalse(payload["publication"])
            self.assertFalse(payload["uses_secrets"])
            self.assertEqual(payload["tag_sha"], TAG_SHA)

            self.assertIn(
                "gh api repos/AmineAKIK/sentinel-fullstack/environments/prerelease",
                commands,
            )
            self.assertIn(
                "gh api "
                "repos/AmineAKIK/sentinel-fullstack/environments/prerelease/"
                "deployment-branch-policies?per_page=100",
                commands,
            )

            failure_cases = (
                (
                    "environment absent",
                    {"RELEASE_TEST_SCENARIO": "environment-absent"},
                    "protected environment is absent or unreadable",
                ),
                (
                    "tag on an old main commit",
                    {
                        "RELEASE_TEST_TAG_SHA": "b" * 40,
                        "RELEASE_TEST_SCENARIO": "success",
                    },
                    "TAG_SHA must equal the exact origin/main head",
                ),
                (
                    "CI run absent",
                    {"RELEASE_TEST_SCENARIO": "ci-absent"},
                    "CI run is absent for the exact TAG_SHA",
                ),
                (
                    "CI run list truncated",
                    {"RELEASE_TEST_SCENARIO": "runs-truncated"},
                    "CI run-list evidence is incomplete or truncated",
                ),
                (
                    "required check absent",
                    {"RELEASE_TEST_SCENARIO": "missing-check"},
                    "missing required check",
                ),
            )
            for label, overrides, expected_error in failure_cases:
                with self.subTest(case=label):
                    failed, _ = execute(**overrides)
                    self.assertNotEqual(failed.returncode, 0, failed.stdout)
                    self.assertIn(expected_error, failed.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
