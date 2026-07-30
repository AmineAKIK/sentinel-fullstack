#!/usr/bin/env python3
"""Static security contract for GitHub Actions release publication."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = REPOSITORY_ROOT / ".github" / "workflows"
RELEASE = (WORKFLOWS / "release.yml").read_text()
CI = (WORKFLOWS / "ci.yml").read_text()
GATE = (REPOSITORY_ROOT / "scripts" / "verify-release-candidate.sh").read_text()
SHA256 = r"sha256:[0-9a-f]{64}"


class ReleaseWorkflowTests(unittest.TestCase):
    maxDiff = None

    def test_all_actions_are_pinned_to_full_commit_shas(self) -> None:
        violations: list[str] = []
        for workflow_path in sorted(WORKFLOWS.glob("*.yml")):
            for line_number, line in enumerate(workflow_path.read_text().splitlines(), start=1):
                match = re.search(r"\buses:\s*([^\s#]+)", line)
                if not match:
                    continue
                reference = match.group(1)
                if reference.startswith("./"):
                    continue
                _, separator, revision = reference.rpartition("@")
                if separator != "@" or not re.fullmatch(r"[0-9a-f]{40}", revision):
                    violations.append(f"{workflow_path.name}:{line_number}:{reference}")
        self.assertEqual(violations, [])

    def test_release_is_split_between_read_only_validation_and_protected_publish(self) -> None:
        self.assertIn("permissions: {}", RELEASE)
        self.assertRegex(RELEASE, r"(?m)^  validate:\n")
        self.assertRegex(RELEASE, r"(?m)^  publish:\n")
        validate, publish = RELEASE.split("\n  publish:\n", maxsplit=1)

        self.assertIn("actions: read", validate)
        self.assertIn("contents: read", validate)
        self.assertNotIn(": write", validate)
        self.assertNotIn("secrets.", validate)
        self.assertIn("needs: validate", publish)
        self.assertIn("environment: ${{ needs.validate.outputs.environment }}", publish)
        self.assertIn("actions: read", publish)
        self.assertIn("contents: write", publish)
        self.assertIn("packages: write", publish)
        self.assertIn("id-token: write", publish)
        self.assertIn("attestations: write", publish)
        self.assertNotIn("secrets.", publish)
        self.assertEqual(RELEASE.count("scripts/verify-release-candidate.sh"), 2)
        ordered_fragments = (
            "Revalidate the candidate inside the protected release environment",
            'docker create --entrypoint /buildx "$BUILDX_IMAGE" version',
            "docker buildx create",
            "docker buildx inspect --bootstrap",
            "Reserve the release before registry authentication and publication",
            "docker/login-action@",
            "Build and push backend with maximal provenance",
            "gh release upload",
            "--draft=false",
        )
        positions = [publish.index(fragment) for fragment in ordered_fragments]
        self.assertEqual(positions, sorted(positions))

    def test_dispatch_runs_only_from_main_then_strictly_classifies_the_tag(self) -> None:
        self.assertIn("workflow_dispatch:", RELEASE)
        self.assertRegex(RELEASE, r"(?ms)inputs:\s*\n\s+tag:")
        self.assertNotRegex(RELEASE, r"(?m)^\s+tags:\s*$")
        self.assertIn("scripts/release_policy.py classify", GATE)
        self.assertIn("refs/remotes/origin/main", GATE)
        self.assertIn('GITHUB_REF" != "refs/heads/main', GATE)
        self.assertIn('GITHUB_EVENT_NAME" != "workflow_dispatch', GATE)
        self.assertIn("actions/workflows/ci.yml/runs", GATE)
        self.assertIn("head_sha=$tag_sha", GATE)
        self.assertNotIn("gh run list", GATE)

    def test_publications_are_serialized_without_cancellation(self) -> None:
        self.assertIn("group: release-publish-${{ github.repository }}", RELEASE)
        self.assertIn("cancel-in-progress: false", RELEASE)

    def test_provenance_sbom_attestations_and_immutable_notes_are_required(self) -> None:
        self.assertGreaterEqual(RELEASE.count("provenance: mode=max"), 2)
        self.assertNotIn("sbom: true", RELEASE)
        self.assertEqual(RELEASE.count("anchore/syft:v1.33.0@sha256:"), 2)
        self.assertGreaterEqual(RELEASE.count("actions/attest@"), 4)
        self.assertEqual(RELEASE.count("create-storage-record: false"), 4)
        self.assertIn("sentinel-backend.spdx.json", RELEASE)
        self.assertIn("sentinel-frontend.spdx.json", RELEASE)
        self.assertIn("attestation-url", RELEASE)
        self.assertIn("--draft", RELEASE)
        self.assertIn("--verify-tag", RELEASE)
        self.assertEqual(RELEASE.count("gh release create"), 1)
        self.assertEqual(RELEASE.count("gh release upload"), 1)
        self.assertNotIn("--clobber", RELEASE)
        self.assertIn("--draft=false", RELEASE)

    def test_workflow_never_moves_or_creates_a_git_tag(self) -> None:
        forbidden = (
            "git tag ",
            "git push ",
            "git update-ref ",
            "gh api --method PATCH /git/refs/",
        )
        for fragment in forbidden:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, RELEASE)

    def test_release_and_ci_container_inputs_are_digest_pinned(self) -> None:
        expected_references = (
            (
                REPOSITORY_ROOT / "backend" / "Dockerfile",
                "node:24.18.0-alpine3.23@sha256:",
            ),
            (
                REPOSITORY_ROOT / "frontend" / "Dockerfile",
                "node:24.18.0-alpine3.23@sha256:",
            ),
            (
                REPOSITORY_ROOT / "frontend" / "Dockerfile",
                "nginx:1.30.4-alpine3.24@sha256:",
            ),
            (REPOSITORY_ROOT / "docker-compose.yml", "postgres:15.18-alpine3.23@sha256:"),
            (REPOSITORY_ROOT / "docker-compose.yml", "caddy:2.11.4-alpine@sha256:"),
            (WORKFLOWS / "ci.yml", "postgres:15.18-alpine3.23@sha256:"),
            (WORKFLOWS / "ci.yml", "nginx:1.18.0@sha256:"),
            (WORKFLOWS / "ci.yml", "koalaman/shellcheck-alpine:v0.10.0@sha256:"),
            (WORKFLOWS / "ci.yml", "rhysd/actionlint:1.7.12@sha256:"),
            (
                REPOSITORY_ROOT / "backend" / "scripts" / "with-disposable-postgres.sh",
                "postgres:15.18-alpine3.23@sha256:",
            ),
            (
                REPOSITORY_ROOT / "scripts" / "test-backup-restore.sh",
                "postgres:15.18-alpine3.23@sha256:",
            ),
            (
                REPOSITORY_ROOT / "scripts" / "test-env-parsing.sh",
                "alpine:3.23@sha256:",
            ),
            (
                REPOSITORY_ROOT / "scripts" / "test-preflight.sh",
                "registry:2.8.3@sha256:",
            ),
            (WORKFLOWS / "release.yml", "docker/buildx-bin:0.35.0@sha256:"),
            (WORKFLOWS / "release.yml", "moby/buildkit:buildx-stable-1@sha256:"),
            (WORKFLOWS / "release.yml", "anchore/syft:v1.33.0@sha256:"),
        )

        for path, prefix in expected_references:
            with self.subTest(path=str(path), prefix=prefix):
                content = path.read_text()
                self.assertRegex(content, re.escape(prefix) + r"[0-9a-f]{64}")

        dockerfiles = [
            REPOSITORY_ROOT / "backend" / "Dockerfile",
            REPOSITORY_ROOT / "frontend" / "Dockerfile",
        ]
        for dockerfile in dockerfiles:
            for line in dockerfile.read_text().splitlines():
                if line.startswith("FROM "):
                    self.assertRegex(line, rf"@{SHA256}(?:\s+AS\s+\w+)?$")

        self.assertNotIn("docker/setup-buildx-action@", RELEASE)
        self.assertEqual(
            RELEASE.count(
                'docker create --entrypoint /buildx "$BUILDX_IMAGE" version'
            ),
            1,
        )
        self.assertNotIn('docker create "$BUILDX_IMAGE"', RELEASE)
        self.assertIn("docker buildx create", RELEASE)
        self.assertIn(
            "github.com/docker/buildx v0.35.0 "
            "a319e5b15052cf6557ceb666eb8ff6e32380b782",
            RELEASE,
        )

    def test_digest_pinned_buildx_and_buildkit_execute_for_real(self) -> None:
        buildx_images = re.findall(
            r"(?m)^\s*BUILDX_IMAGE:\s*"
            r"(docker/buildx-bin:[^@\s]+@sha256:[0-9a-f]{64})\s*$",
            RELEASE,
        )
        buildkit_images = re.findall(
            r"--driver-opt\s+image="
            r"(moby/buildkit:[^@\s]+@sha256:[0-9a-f]{64})",
            RELEASE,
        )
        expected_versions = re.findall(
            r"(?m)^\s*\|\s*grep\s+-F\s+'"
            r"(github\.com/docker/buildx v[0-9]+\.[0-9]+\.[0-9]+ [0-9a-f]{40})"
            r"'\s*$",
            RELEASE,
        )
        self.assertEqual(len(buildx_images), 1)
        self.assertEqual(len(buildkit_images), 1)
        self.assertEqual(len(expected_versions), 1)

        buildx_image = buildx_images[0]
        buildkit_image = buildkit_images[0]
        expected_version = expected_versions[0]
        buildx_tag = buildx_image.split(":", maxsplit=1)[1].split("@", maxsplit=1)[0]
        self.assertIn(f" v{buildx_tag} ", expected_version)

        def run(
            command: list[str], *, environment: dict[str, str] | None = None
        ) -> subprocess.CompletedProcess[str]:
            result = subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                "Command failed:\n"
                f"  {' '.join(command)}\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}",
            )
            return result

        builder_name = f"sentinel-buildx-proof-{uuid.uuid4().hex[:12]}"
        buildx_container = ""
        with tempfile.TemporaryDirectory(prefix="sentinel-buildx-proof-") as temp:
            docker_config = Path(temp) / "docker-config"
            plugin = docker_config / "cli-plugins" / "docker-buildx"
            plugin.parent.mkdir(parents=True)
            environment = os.environ.copy()
            environment["DOCKER_CONFIG"] = str(docker_config)

            try:
                created = run(
                    [
                        "docker",
                        "create",
                        "--entrypoint",
                        "/buildx",
                        buildx_image,
                        "version",
                    ]
                )
                buildx_container = created.stdout.strip()
                self.assertRegex(buildx_container, r"^[0-9a-f]{64}$")
                run(["docker", "cp", f"{buildx_container}:/buildx", str(plugin)])
                plugin.chmod(0o755)

                version = run(
                    ["docker", "buildx", "version"], environment=environment
                )
                self.assertEqual(version.stdout.strip(), expected_version)

                run(
                    [
                        "docker",
                        "buildx",
                        "create",
                        "--name",
                        builder_name,
                        "--driver",
                        "docker-container",
                        "--driver-opt",
                        f"image={buildkit_image}",
                        "--use",
                    ],
                    environment=environment,
                )
                run(
                    ["docker", "buildx", "inspect", builder_name, "--bootstrap"],
                    environment=environment,
                )
            finally:
                subprocess.run(
                    ["docker", "buildx", "rm", builder_name],
                    cwd=REPOSITORY_ROOT,
                    env=environment,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                if buildx_container:
                    subprocess.run(
                        ["docker", "rm", "-f", buildx_container],
                        cwd=REPOSITORY_ROOT,
                        text=True,
                        capture_output=True,
                        check=False,
                    )

    def test_policy_tests_and_secretless_dry_run_are_part_of_ci(self) -> None:
        self.assertIn("python3 scripts/test-release-policy.py", CI)
        self.assertIn("python3 scripts/test-release-gate.py", CI)
        self.assertIn("python3 scripts/test-release-workflow.py", CI)
        self.assertIn("dry-run", CI)


if __name__ == "__main__":
    unittest.main(verbosity=2)
