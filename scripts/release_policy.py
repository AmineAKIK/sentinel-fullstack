#!/usr/bin/env python3
"""Fail-closed policy engine for Sentinel releases.

The module is deliberately limited to pure validation. Network and Git evidence
are collected by ``verify-release-candidate.sh`` and injected as JSON, which
makes every refusal path testable without credentials or publication rights.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, NoReturn


RC_PATTERN = re.compile(
    r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.([1-9][0-9]*)\Z",
    re.ASCII,
)
STABLE_PATTERN = re.compile(
    r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z",
    re.ASCII,
)
SHA_PATTERN = re.compile(r"[0-9a-f]{40}\Z", re.ASCII)
REPOSITORY_PATTERN = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z", re.ASCII)

REQUIRED_CHECKS = (
    "Backend / Quality",
    "Frontend / Quality",
    "Backend / PostgreSQL integration",
    "Browser / Critical journeys",
    "Containers / Production contract",
    "Ops / Backup and restore drill",
)


class PolicyError(ValueError):
    """A release candidate violates the fail-closed policy."""


def refuse(message: str) -> NoReturn:
    raise PolicyError(message)


def classify_tag(tag: str) -> dict[str, Any]:
    if RC_PATTERN.fullmatch(tag):
        return {
            "tag": tag,
            "kind": "rc",
            "environment": "prerelease",
            "prerelease": True,
        }
    if STABLE_PATTERN.fullmatch(tag):
        return {
            "tag": tag,
            "kind": "stable",
            "environment": "production",
            "prerelease": False,
        }
    refuse(
        "invalid release tag: expected "
        "vMAJOR.MINOR.PATCH-rc.N (N >= 1) or vMAJOR.MINOR.PATCH without leading zeroes"
    )


def require_sha(value: str, label: str) -> None:
    if not SHA_PATTERN.fullmatch(value):
        refuse(f"{label} must be a lowercase 40-character Git SHA")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        refuse(f"cannot read trusted JSON evidence {path}: {error}")


def normalized_repository(repository: str) -> str:
    if not REPOSITORY_PATTERN.fullmatch(repository):
        refuse("repository must use the exact OWNER/NAME form")
    return repository.lower()


def first_present(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping:
            return mapping[key]
    return None


def validate_ci_run(ci: Any, tag_sha: str) -> int:
    if not isinstance(ci, dict):
        refuse("CI run evidence must be a JSON object")

    expected_run = {
        "workflowName": "CI",
        "event": "push",
        "headBranch": "main",
        "headSha": tag_sha,
        "status": "completed",
        "conclusion": "success",
    }
    actual_run = {
        "workflowName": first_present(ci, "workflowName", "name"),
        "event": ci.get("event"),
        "headBranch": first_present(ci, "headBranch", "head_branch"),
        "headSha": first_present(ci, "headSha", "head_sha"),
        "status": ci.get("status"),
        "conclusion": ci.get("conclusion"),
    }
    divergences = [
        f"{key}={actual_run[key]!r}, expected {expected!r}"
        for key, expected in expected_run.items()
        if actual_run[key] != expected
    ]
    if divergences:
        refuse("CI run is not the successful main push on TAG_SHA: " + "; ".join(divergences))

    run_id = first_present(ci, "databaseId", "id")
    if not isinstance(run_id, int) or run_id <= 0:
        refuse("CI run databaseId must be a positive integer")

    jobs = ci.get("jobs")
    if not isinstance(jobs, list):
        refuse("CI run jobs must be a JSON array")

    by_name: dict[str, list[dict[str, Any]]] = {}
    for job in jobs:
        if isinstance(job, dict) and isinstance(job.get("name"), str):
            by_name.setdefault(job["name"], []).append(job)

    for required_name in REQUIRED_CHECKS:
        matches = by_name.get(required_name, [])
        if not matches:
            refuse(f"missing required check: {required_name}")
        if len(matches) != 1:
            refuse(f"required check is ambiguous ({len(matches)} instances): {required_name}")
        job = matches[0]
        if job.get("status") != "completed" or job.get("conclusion") != "success":
            refuse(
                "required check is not completed/success: "
                f"{required_name} status={job.get('status')!r} "
                f"conclusion={job.get('conclusion')!r}"
            )

    return run_id


def validate_environment(
    environment: Any,
    deployment_policies: Any,
    expected_name: str,
) -> None:
    if not isinstance(environment, dict):
        refuse(f"protected environment is absent: {expected_name}")
    if environment.get("name") != expected_name:
        refuse(
            "protected environment name differs from the classified release: "
            f"{environment.get('name')!r}, expected {expected_name!r}"
        )

    protection_rules = environment.get("protection_rules")
    if not isinstance(protection_rules, list):
        refuse(f"protected environment has no protection rules: {expected_name}")

    reviewer_rules = [
        rule
        for rule in protection_rules
        if isinstance(rule, dict) and rule.get("type") == "required_reviewers"
    ]
    if len(reviewer_rules) != 1:
        refuse(
            "protected environment must have exactly one required_reviewers rule: "
            f"{expected_name}"
        )
    reviewer_rule = reviewer_rules[0]
    reviewers = reviewer_rule.get("reviewers")
    if not isinstance(reviewers, list) or not reviewers:
        refuse(f"protected environment must require at least one reviewer: {expected_name}")
    if reviewer_rule.get("prevent_self_review") is not True:
        refuse(f"protected environment must prevent self-review: {expected_name}")

    branch_rules = [
        rule
        for rule in protection_rules
        if isinstance(rule, dict) and rule.get("type") == "branch_policy"
    ]
    if len(branch_rules) != 1:
        refuse(
            "protected environment must have exactly one branch_policy rule: "
            f"{expected_name}"
        )
    branch_policy = environment.get("deployment_branch_policy")
    if not isinstance(branch_policy, dict):
        refuse(f"protected environment deployment policy is absent: {expected_name}")
    if branch_policy.get("protected_branches") is not False:
        refuse(f"protected environment must not inherit broad branch protection: {expected_name}")
    if branch_policy.get("custom_branch_policies") is not True:
        refuse(f"protected environment must use a custom main branch policy: {expected_name}")

    if isinstance(deployment_policies, dict):
        policies = deployment_policies.get("branch_policies")
        total_count = deployment_policies.get("total_count")
        if (
            not isinstance(policies, list)
            or not isinstance(total_count, int)
            or total_count != len(policies)
        ):
            refuse(
                "protected environment branch-policy evidence is incomplete or truncated: "
                f"total_count={total_count!r}, received="
                f"{len(policies) if isinstance(policies, list) else 'invalid'}"
            )
        deployment_policies = policies
    if not isinstance(deployment_policies, list):
        refuse(f"protected environment branch-policy evidence is absent: {expected_name}")

    # workflow_dispatch is accepted only from refs/heads/main. Environment
    # deployment policies are evaluated against that run ref, not against the
    # tag supplied as an input; both environments must therefore authorize the
    # single branch `main`. Tag syntax and RC/stable routing remain policy-engine
    # decisions.
    expected_pattern = "main"
    normalized_policies = [
        (policy.get("name"), policy.get("type"))
        for policy in deployment_policies
        if isinstance(policy, dict)
    ]
    if normalized_policies != [(expected_pattern, "branch")]:
        refuse(
            "protected environment must have exactly the expected main branch policy "
            f"{expected_pattern!r}: got {normalized_policies!r}"
        )


def validate_candidate(
    *,
    tag: str,
    tag_sha: str,
    main_sha: str,
    ci: Any,
    release_state: str,
    repository: str,
    environment: Any,
    deployment_policies: Any,
) -> dict[str, Any]:
    classification = classify_tag(tag)
    require_sha(tag_sha, "TAG_SHA")
    require_sha(main_sha, "origin/main SHA")

    if tag_sha != main_sha:
        refuse(
            "TAG_SHA must equal the exact origin/main head "
            f"(TAG_SHA={tag_sha}, origin/main={main_sha})"
        )
    if release_state != "absent":
        if release_state == "present":
            refuse("release tag already has a GitHub release and must never be reused")
        refuse(f"release state is unknown: {release_state!r}")

    run_id = validate_ci_run(ci, tag_sha)
    validate_environment(
        environment,
        deployment_policies,
        classification["environment"],
    )
    repository_slug = normalized_repository(repository)
    image_base = f"ghcr.io/{repository_slug}"

    return {
        **classification,
        "tag_sha": tag_sha,
        "main_sha": main_sha,
        "ci_run_id": run_id,
        "images": {
            "backend": f"{image_base}/backend",
            "frontend": f"{image_base}/frontend",
        },
    }


def choose_run(runs: Any, tag_sha: str) -> int:
    require_sha(tag_sha, "TAG_SHA")
    if isinstance(runs, dict):
        workflow_runs = runs.get("workflow_runs")
        total_count = runs.get("total_count")
        if (
            not isinstance(workflow_runs, list)
            or not isinstance(total_count, int)
            or total_count != len(workflow_runs)
        ):
            refuse(
                "CI run-list evidence is incomplete or truncated: "
                f"total_count={total_count!r}, received="
                f"{len(workflow_runs) if isinstance(workflow_runs, list) else 'invalid'}"
            )
        runs = workflow_runs
    if not isinstance(runs, list):
        refuse("CI run list evidence must be a JSON array")

    candidates = [
        run
        for run in runs
        if isinstance(run, dict)
        and first_present(run, "workflowName", "name") == "CI"
        and run.get("event") == "push"
        and first_present(run, "headBranch", "head_branch") == "main"
        and first_present(run, "headSha", "head_sha") == tag_sha
    ]
    if not candidates:
        refuse("CI run is absent for the exact TAG_SHA on a main push")

    candidates.sort(
        key=lambda run: (
            str(first_present(run, "createdAt", "created_at") or ""),
            int(first_present(run, "databaseId", "id") or 0),
        ),
        reverse=True,
    )
    run_id = first_present(candidates[0], "databaseId", "id")
    if not isinstance(run_id, int) or run_id <= 0:
        refuse("CI run databaseId must be a positive integer")
    return run_id


def append_github_outputs(path: Path, payload: dict[str, Any]) -> None:
    lines = {
        "tag": payload["tag"],
        "tag_sha": payload["tag_sha"],
        "kind": payload["kind"],
        "environment": payload["environment"],
        "prerelease": str(payload["prerelease"]).lower(),
        "ci_run_id": str(payload["ci_run_id"]),
        "backend_image": payload["images"]["backend"],
        "frontend_image": payload["images"]["frontend"],
    }
    with path.open("a", encoding="utf-8") as output:
        for key, value in lines.items():
            output.write(f"{key}={value}\n")


def candidate_from_arguments(arguments: argparse.Namespace) -> dict[str, Any]:
    ci = load_json(arguments.ci_file)
    if arguments.jobs_file:
        jobs_evidence = load_json(arguments.jobs_file)
        if isinstance(jobs_evidence, dict):
            jobs = jobs_evidence.get("jobs")
            total_count = jobs_evidence.get("total_count")
            if (
                not isinstance(jobs, list)
                or not isinstance(total_count, int)
                or total_count != len(jobs)
            ):
                refuse(
                    "CI jobs evidence is incomplete or truncated: "
                    f"total_count={total_count!r}, received="
                    f"{len(jobs) if isinstance(jobs, list) else 'invalid'}"
                )
            jobs_evidence = jobs
        if not isinstance(ci, dict):
            refuse("CI run evidence must be a JSON object")
        ci = {**ci, "jobs": jobs_evidence}
    environment = load_json(arguments.environment_file)
    deployment_policies = load_json(arguments.environment_policies_file)
    return validate_candidate(
        tag=arguments.tag,
        tag_sha=arguments.tag_sha,
        main_sha=arguments.main_sha,
        ci=ci,
        release_state=arguments.release_state,
        repository=arguments.repository,
        environment=environment,
        deployment_policies=deployment_policies,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    classify = commands.add_parser("classify", help="validate and classify one tag")
    classify.add_argument("--tag", required=True)

    select_run = commands.add_parser("select-run", help="select the exact main CI run")
    select_run.add_argument("--tag-sha", required=True)
    select_run.add_argument("--runs-file", required=True, type=Path)

    for command in ("validate", "dry-run"):
        candidate = commands.add_parser(command, help=f"{command} one release candidate")
        candidate.add_argument("--tag", required=True)
        candidate.add_argument("--tag-sha", required=True)
        candidate.add_argument("--main-sha", required=True)
        candidate.add_argument("--ci-file", required=True, type=Path)
        candidate.add_argument("--jobs-file", type=Path)
        candidate.add_argument("--environment-file", required=True, type=Path)
        candidate.add_argument("--environment-policies-file", required=True, type=Path)
        candidate.add_argument("--release-state", required=True, choices=("absent", "present"))
        candidate.add_argument("--repository", required=True)
        candidate.add_argument("--github-output", type=Path)

    return parser


def run(arguments: argparse.Namespace) -> dict[str, Any] | int:
    if arguments.command == "classify":
        return classify_tag(arguments.tag)
    if arguments.command == "select-run":
        return choose_run(load_json(arguments.runs_file), arguments.tag_sha)

    payload = candidate_from_arguments(arguments)
    if arguments.github_output:
        append_github_outputs(arguments.github_output, payload)

    if arguments.command == "dry-run":
        return {
            **payload,
            "mode": "dry-run",
            "registry_authentication": False,
            "publication": False,
            "uses_secrets": False,
            "planned_evidence": [
                "main head equality",
                "six successful checks on TAG_SHA",
                "protected environment with reviewer and exact main branch policy",
                "backend and frontend immutable digests",
                "SPDX SBOMs",
                "image provenance attestations",
                "release notes with SHA, digests, SBOMs and attestations",
            ],
        }
    return payload


def main() -> int:
    try:
        result = run(build_parser().parse_args())
    except PolicyError as error:
        print(f"release policy refused: {error}", file=sys.stderr)
        return 1

    if isinstance(result, int):
        print(result)
    else:
        print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
