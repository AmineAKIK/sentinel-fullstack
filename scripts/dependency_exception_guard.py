#!/usr/bin/env python3
"""Fail-closed dependency policy guard for Sentinel release candidates."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
POLICY_ID = "sentinel-rc9-dependency-policy"
EXPECTED_OWNER = "repository-owner:AmineAKIK"
EXPECTED_LOCKFILES = {"backend/package-lock.json", "frontend/package-lock.json"}
VALID_SCOPES = {"backend-runtime", "backend-full", "frontend-runtime", "frontend-full"}
SEVERITY_RANK = {"info": 0, "low": 1, "moderate": 2, "high": 3, "critical": 4}
GHSA_PATTERN = re.compile(r"GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}")
SOURCE_SUFFIXES = {".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"}
RSC_IMPORT_FRAGMENTS = {
    "react-router/internal/react-server",
    "react-router/internal/react-server-client",
}
EXPECTED_RUNTIME_FORBIDDEN_PACKAGES = {"brace-expansion", "glob", "minimatch"}
EXPECTED_ROUTER_CONTRACT = {
    "declared_package": "react-router-dom",
    "declared_version": "7.18.2",
    "resolved_packages": {
        "react": "18.3.1",
        "react-dom": "18.3.1",
        "react-router": "7.18.2",
        "react-router-dom": "7.18.2",
    },
    "react_major": 18,
    "mode": "declarative",
    "production_entrypoint": "frontend/src/main.tsx",
    "required_entrypoint_symbol": "BrowserRouter",
    "forbidden_data_router_symbols": [
        "createBrowserRouter",
        "createHashRouter",
        "HydratedRouter",
        "RouterProvider",
    ],
    "forbidden_rsc_packages": [
        "@react-router/dev",
        "@react-router/node",
        "@react-router/serve",
        "@vitejs/plugin-rsc",
        "react-server-dom-parcel",
        "react-server-dom-vite",
        "react-server-dom-webpack",
    ],
    "forbidden_rsc_symbols": [
        "unstable_RSCHydratedRouter",
        "unstable_RSCRouteConfig",
        "unstable_RSCStaticRouter",
        "unstable_createCallServer",
        "unstable_getRequest",
        "unstable_getRSCStream",
        "unstable_matchRSCServerRequest",
        "unstable_routeRSCServerRequest",
    ],
    "reviewed_advisory": {
        "id": "GHSA-qwww-vcr4-c8h2",
        "affected_ranges": [">=7.12.0 <7.18.2", ">=8.0.0 <8.3.0"],
        "patched_versions": ["7.18.2", "8.3.0"],
        "checked_on": "2026-09-16",
    },
}


class GuardError(RuntimeError):
    """A dependency policy invariant is not satisfied."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GuardError(message)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise GuardError(f"missing required file: {path}") from error
    except json.JSONDecodeError as error:
        raise GuardError(f"invalid JSON in {path}: {error}") from error
    require(isinstance(value, dict), f"expected a JSON object in {path}")
    return value


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
    except FileNotFoundError as error:
        raise GuardError(f"missing reviewed lockfile: {path}") from error
    return digest.hexdigest()


def parse_iso_date(raw: Any, field: str) -> date:
    require(isinstance(raw, str), f"{field} must be an ISO date")
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise GuardError(f"{field} must be an ISO date") from error


def validate_policy(policy: dict[str, Any], today: date) -> dict[str, dict[str, Any]]:
    require(policy.get("schema_version") == 2, "unsupported policy schema_version")
    require(policy.get("policy_id") == POLICY_ID, "unexpected policy_id")
    require(policy.get("risk_owner") == EXPECTED_OWNER, f"risk_owner must equal {EXPECTED_OWNER}")
    require(policy.get("severity_floor") == "high", "severity_floor must remain high")
    reviewed_on = parse_iso_date(policy.get("reviewed_on"), "reviewed_on")
    require(reviewed_on <= today, "reviewed_on cannot be in the future")

    lockfiles = policy.get("lockfiles")
    require(isinstance(lockfiles, dict), "lockfiles must be an object")
    require(set(lockfiles) == EXPECTED_LOCKFILES, "policy must cover exactly both package-lock.json files")
    for relative_path, record in lockfiles.items():
        require(isinstance(record, dict), f"invalid lock record for {relative_path}")
        digest = record.get("sha256")
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) is not None, f"invalid SHA-256 for {relative_path}")

    require(policy.get("router_contract") == EXPECTED_ROUTER_CONTRACT, "Router/React contract must remain React 18 / Router 7.18.2 / Declarative Mode")

    runtime_contract = policy.get("runtime_contract")
    require(isinstance(runtime_contract, dict), "runtime_contract must be an object")
    forbidden_runtime = runtime_contract.get("forbidden_packages")
    require(isinstance(forbidden_runtime, list) and set(forbidden_runtime) == EXPECTED_RUNTIME_FORBIDDEN_PACKAGES, "runtime forbidden package set must remain closed")

    image_contract = policy.get("image_contract")
    require(isinstance(image_contract, dict), "image_contract must be an object")
    exact = image_contract.get("backend_exact_versions")
    forbidden = image_contract.get("backend_forbidden_packages")
    frontend_paths = image_contract.get("frontend_forbidden_paths")
    require(isinstance(exact, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in exact.items()), "invalid backend_exact_versions")
    require(isinstance(forbidden, list) and set(forbidden) == EXPECTED_RUNTIME_FORBIDDEN_PACKAGES, "backend image forbidden package set must match runtime contract")
    require(isinstance(frontend_paths, list) and all(isinstance(v, str) and v.startswith("/") for v in frontend_paths), "invalid frontend_forbidden_paths")

    raw_exceptions = policy.get("exceptions")
    require(isinstance(raw_exceptions, list), "exceptions must be an array")
    exceptions: dict[str, dict[str, Any]] = {}
    for exception in raw_exceptions:
        require(isinstance(exception, dict), "each exception must be an object")
        advisory = exception.get("advisory")
        require(isinstance(advisory, str) and GHSA_PATTERN.fullmatch(advisory) is not None, "exception advisory must be a GHSA identifier")
        require(advisory not in exceptions, f"duplicate exception {advisory}")
        require(isinstance(exception.get("package"), str) and exception["package"], f"{advisory} package must be explicit")
        require(exception.get("risk_owner") == EXPECTED_OWNER, f"{advisory} risk_owner must be explicit")
        expiry = parse_iso_date(exception.get("expires_on"), f"{advisory}.expires_on")
        require(expiry >= reviewed_on, f"{advisory} expires before policy review date")
        require(today <= expiry, f"dependency exception {advisory} expired on {expiry}")
        require(isinstance(exception.get("rationale"), str) and exception["rationale"].strip(), f"{advisory} rationale must be explicit")
        required_scopes = set(exception.get("required_scopes", []))
        forbidden_scopes = set(exception.get("forbidden_scopes", []))
        require(required_scopes and required_scopes <= VALID_SCOPES, f"{advisory} required_scopes are invalid")
        require(forbidden_scopes <= VALID_SCOPES, f"{advisory} forbidden_scopes are invalid")
        require(not (required_scopes & forbidden_scopes), f"{advisory} scope sets overlap")
        require(required_scopes | forbidden_scopes == VALID_SCOPES, f"{advisory} must classify all audit scopes")
        exceptions[advisory] = exception
    return exceptions


def package_name_from_path(package_path: str, entry: dict[str, Any]) -> str:
    explicit = entry.get("name")
    if isinstance(explicit, str):
        return explicit
    require(package_path != "", "root lock package must declare its name")
    marker = "node_modules/"
    require(marker in package_path, f"cannot derive package name from {package_path}")
    return package_path.rsplit(marker, 1)[1]


def resolve_lock_dependency(packages: dict[str, Any], parent_path: str, dependency_name: str) -> str | None:
    prefix = parent_path
    tried: set[str] = set()
    while True:
        candidate = f"{prefix}/node_modules/{dependency_name}" if prefix else f"node_modules/{dependency_name}"
        if candidate not in tried:
            tried.add(candidate)
            if candidate in packages:
                return candidate
        nested_index = prefix.rfind("/node_modules/")
        if nested_index >= 0:
            prefix = prefix[:nested_index]
            continue
        if prefix.startswith("node_modules/"):
            prefix = ""
            continue
        return None


def production_closure(packages: dict[str, Any]) -> set[str]:
    root = packages.get("")
    require(isinstance(root, dict), "lockfile is missing packages['']")
    pending: list[str] = []
    for dependency_name in root.get("dependencies", {}):
        resolved = resolve_lock_dependency(packages, "", dependency_name)
        require(resolved is not None, f"unresolved runtime dependency {dependency_name}")
        pending.append(resolved)
    for dependency_name in root.get("optionalDependencies", {}):
        resolved = resolve_lock_dependency(packages, "", dependency_name)
        if resolved is not None:
            pending.append(resolved)

    visited: set[str] = set()
    while pending:
        package_path = pending.pop()
        if package_path in visited:
            continue
        visited.add(package_path)
        entry = packages.get(package_path)
        require(isinstance(entry, dict), f"invalid lock entry {package_path}")
        for dependency_name in entry.get("dependencies", {}):
            resolved = resolve_lock_dependency(packages, package_path, dependency_name)
            require(resolved is not None, f"unresolved runtime dependency {dependency_name} from {package_path}")
            pending.append(resolved)
        for dependency_name in entry.get("optionalDependencies", {}):
            resolved = resolve_lock_dependency(packages, package_path, dependency_name)
            if resolved is not None:
                pending.append(resolved)
    return visited


def read_reviewed_locks(repo_root: Path, policy: dict[str, Any]) -> dict[str, dict[str, Any]]:
    locks: dict[str, dict[str, Any]] = {}
    for workspace in ("backend", "frontend"):
        relative_path = f"{workspace}/package-lock.json"
        expected = policy["lockfiles"][relative_path]["sha256"]
        actual = file_sha256(repo_root / relative_path)
        require(actual == expected, f"{relative_path} changed: dependency review required (expected {expected}, got {actual})")
        lock = read_json(repo_root / relative_path)
        require(isinstance(lock.get("packages"), dict), f"{relative_path} has no packages map")
        locks[workspace] = lock
    return locks


def validate_runtime_closure(policy: dict[str, Any], locks: dict[str, dict[str, Any]]) -> None:
    forbidden = set(policy["runtime_contract"]["forbidden_packages"])
    for workspace, lock in locks.items():
        packages = lock["packages"]
        for package_path in production_closure(packages):
            entry = packages[package_path]
            package_name = package_name_from_path(package_path, entry)
            require(package_name not in forbidden, f"runtime contract violated: {package_name} is reachable at {workspace}/{package_path}")


def production_source_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for relative_root in ("backend/src", "frontend/src"):
        source_root = repo_root / relative_root
        if not source_root.exists():
            continue
        for path in source_root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            parts = path.relative_to(source_root).parts
            if any(part in {"__tests__", "test", "tests"} for part in parts) or ".test." in path.name or ".spec." in path.name:
                continue
            files.append(path)
    return files


def all_source_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for relative_root in ("backend/src", "frontend/src"):
        source_root = repo_root / relative_root
        if source_root.exists():
            files.extend(path for path in source_root.rglob("*") if path.is_file() and path.suffix in SOURCE_SUFFIXES)
    return files


def validate_router_and_source_contracts(repo_root: Path, policy: dict[str, Any], frontend_lock: dict[str, Any], backend_lock: dict[str, Any]) -> None:
    contract = policy["router_contract"]
    frontend_package = read_json(repo_root / "frontend/package.json")
    dependencies = frontend_package.get("dependencies")
    require(isinstance(dependencies, dict), "frontend dependencies are missing")
    require(dependencies.get(contract["declared_package"]) == contract["declared_version"], "declared router version changed")
    require(dependencies.get("react") == "^18.2.0" and dependencies.get("react-dom") == "^18.2.0", "declared React major must remain 18")

    lock_root = frontend_lock["packages"].get("")
    require(isinstance(lock_root, dict), "frontend lock root is missing")
    require(lock_root.get("dependencies", {}).get(contract["declared_package"]) == contract["declared_version"], "lock root router version changed")
    for package_name, expected_version in contract["resolved_packages"].items():
        entry = frontend_lock["packages"].get(f"node_modules/{package_name}")
        require(isinstance(entry, dict) and entry.get("version") == expected_version, "resolved React/Router version changed")

    forbidden_rsc_packages = set(contract["forbidden_rsc_packages"])
    for workspace, lock in (("frontend", frontend_lock), ("backend", backend_lock)):
        for package_path, entry in lock["packages"].items():
            if not isinstance(entry, dict):
                continue
            if package_path:
                package_name = package_name_from_path(package_path, entry)
                require(package_name not in forbidden_rsc_packages, f"RSC dependency is forbidden: {workspace}/{package_name}")
            for scope in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
                declared = entry.get(scope, {})
                if isinstance(declared, dict):
                    for dependency_name in declared:
                        require(dependency_name not in forbidden_rsc_packages, f"RSC dependency is forbidden: {workspace}/{dependency_name}")

    entrypoint = repo_root / contract["production_entrypoint"]
    try:
        entrypoint_text = entrypoint.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise GuardError(f"missing Router production entrypoint: {entrypoint}") from error
    required_symbol = contract["required_entrypoint_symbol"]
    require(required_symbol in entrypoint_text, f"Router must remain in Declarative Mode with {required_symbol}")

    forbidden_mode_symbols = set(contract["forbidden_data_router_symbols"])
    forbidden_rsc_symbols = set(contract["forbidden_rsc_symbols"])
    runtime_names = "|".join(re.escape(name) for name in sorted(policy["runtime_contract"]["forbidden_packages"]))
    quoted_runtime_pattern = re.compile(r"['\"](?:" + runtime_names + r")(?:/[^'\"]*)?['\"]")

    for source_path in all_source_files(repo_root):
        try:
            source = source_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise GuardError(f"non-UTF-8 source file: {source_path}") from error
        for symbol in forbidden_rsc_symbols:
            require(symbol not in source, f"RSC API is forbidden: {symbol} in {source_path.relative_to(repo_root)}")
        require('"use server"' not in source and "'use server'" not in source, f"RSC API directive is forbidden in {source_path.relative_to(repo_root)}")
        for fragment in RSC_IMPORT_FRAGMENTS:
            require(fragment not in source, f"RSC API import is forbidden in {source_path.relative_to(repo_root)}")

    for source_path in production_source_files(repo_root):
        try:
            source = source_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise GuardError(f"non-UTF-8 source file: {source_path}") from error
        for symbol in forbidden_mode_symbols:
            require(symbol not in source, f"Router must remain in Declarative Mode; found {symbol} in {source_path.relative_to(repo_root)}")
        match = quoted_runtime_pattern.search(source)
        require(match is None, f"runtime source references a forbidden dependency {match.group(0) if match else ''} in {source_path.relative_to(repo_root)}")

    require(not list((repo_root / "frontend").glob("react-router.config.*")), "Router must remain in Declarative Mode; framework config detected")


def validate_repository(repo_root: Path, policy: dict[str, Any], today: date) -> dict[str, dict[str, Any]]:
    exceptions = validate_policy(policy, today)
    locks = read_reviewed_locks(repo_root, policy)
    validate_runtime_closure(policy, locks)
    validate_router_and_source_contracts(repo_root, policy, locks["frontend"], locks["backend"])
    return exceptions


def advisory_ids_from_object(value: dict[str, Any]) -> set[str]:
    found: set[str] = set()
    for field in ("url", "title", "name"):
        raw = value.get(field)
        if isinstance(raw, str):
            found.update(GHSA_PATTERN.findall(raw))
    return found


def resolve_advisories(name: str, vulnerabilities: dict[str, Any], memo: dict[str, set[str]], stack: set[str]) -> set[str]:
    if name in memo:
        return memo[name]
    require(name not in stack, f"cycle in npm audit vulnerability graph at {name}")
    node = vulnerabilities.get(name)
    require(isinstance(node, dict), f"npm audit references unknown vulnerability node {name}")
    via = node.get("via")
    require(isinstance(via, list), f"npm audit node {name} has invalid via data")
    stack.add(name)
    result: set[str] = set()
    for item in via:
        if isinstance(item, str):
            result.update(resolve_advisories(item, vulnerabilities, memo, stack))
        elif isinstance(item, dict):
            ids = advisory_ids_from_object(item)
            require(ids, f"high/critical advisory in {name} has no GHSA identifier")
            result.update(ids)
        else:
            raise GuardError(f"npm audit node {name} has unsupported via data")
    stack.remove(name)
    require(result, f"high/critical npm audit node {name} does not resolve to a GHSA advisory")
    memo[name] = result
    return result


def validate_audit(policy: dict[str, Any], exceptions: dict[str, dict[str, Any]], workspace: str, audit_kind: str, audit_path: Path) -> None:
    scope = f"{workspace}-{audit_kind}"
    audit = read_json(audit_path)
    vulnerabilities = audit.get("vulnerabilities")
    require(isinstance(vulnerabilities, dict), "npm audit JSON has no vulnerabilities object")
    threshold = SEVERITY_RANK[policy["severity_floor"]]
    required = {a for a, e in exceptions.items() if scope in set(e["required_scopes"])}
    forbidden = {a for a, e in exceptions.items() if scope in set(e["forbidden_scopes"])}
    memo: dict[str, set[str]] = {}
    observed: set[str] = set()

    for name, node in vulnerabilities.items():
        require(isinstance(node, dict), f"invalid npm audit node {name}")
        severity = node.get("severity")
        if not isinstance(severity, str) or SEVERITY_RANK.get(severity, -1) < threshold:
            continue
        advisories = resolve_advisories(name, vulnerabilities, memo, set())
        unknown = advisories - set(exceptions)
        require(not unknown, f"unapproved advisory detected in {scope}: {sorted(unknown)}")
        blocked = advisories & forbidden
        require(not blocked, f"exception advisory forbidden in {scope}: {sorted(blocked)}")
        observed.update(advisories)
        for direct in node.get("via", []):
            if not isinstance(direct, dict):
                continue
            for advisory in advisory_ids_from_object(direct):
                if advisory in exceptions:
                    require(name == exceptions[advisory]["package"], f"{advisory} direct package changed: {name}")

    require(observed == required, f"{scope} exception set differs: expected {sorted(required)}, got {sorted(observed)}")


def docker_output(command: list[str], label: str) -> str:
    try:
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    except FileNotFoundError as error:
        raise GuardError("docker is required for the release image guard") from error
    require(result.returncode == 0, f"{label}: {result.stdout.strip()}")
    return result.stdout


def validate_images(policy: dict[str, Any], backend_image: str) -> None:
    contract = policy["image_contract"]
    for package in contract["backend_forbidden_packages"]:
        output = docker_output(
            ["docker", "run", "--rm", "--entrypoint", "find", backend_image, "/app/node_modules", "-path", f"*/node_modules/{package}/package.json", "-print"],
            f"could not inspect backend image for {package}",
        )
        require(not [line for line in output.splitlines() if line.strip()], f"forbidden runtime package {package} found in backend image")

    for package, expected_version in contract["backend_exact_versions"].items():
        raw = docker_output(
            ["docker", "run", "--rm", "--entrypoint", "cat", backend_image, f"/app/node_modules/{package}/package.json"],
            f"could not read {package} metadata from backend image",
        )
        try:
            metadata = json.loads(raw)
        except json.JSONDecodeError as error:
            raise GuardError(f"invalid {package} package metadata in backend image") from error
        require(metadata.get("version") == expected_version, f"backend image {package} version changed: expected {expected_version}, got {metadata.get('version')}")


def validate_frontend_paths(policy: dict[str, Any], frontend_image: str) -> None:
    for forbidden_path in policy["image_contract"]["frontend_forbidden_paths"]:
        output = docker_output(
            ["docker", "run", "--rm", "--entrypoint", "sh", frontend_image, "-c", f"if [ -e '{forbidden_path}' ]; then echo present; fi"],
            f"could not inspect frontend image path {forbidden_path}",
        )
        require(not output.strip(), f"forbidden path present in frontend image: {forbidden_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Enforce Sentinel's reviewed dependency policy.")
    parser.add_argument("--repo-root", type=Path, default=SCRIPT_ROOT)
    parser.add_argument("--policy", type=Path, default=SCRIPT_ROOT / "security/dependency-exceptions.json")
    parser.add_argument("--today", type=date.fromisoformat, default=None, help=argparse.SUPPRESS)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("repository")
    audit = subparsers.add_parser("audit")
    audit.add_argument("--workspace", choices=("backend", "frontend"), required=True)
    audit.add_argument("--audit-kind", choices=("runtime", "full"), required=True)
    audit.add_argument("--audit-json", type=Path, required=True)
    images = subparsers.add_parser("images")
    images.add_argument("--backend-image", required=True)
    images.add_argument("--frontend-image", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    today = args.today or datetime.now(timezone.utc).date()
    try:
        policy = read_json(args.policy.resolve())
        exceptions = validate_repository(args.repo_root.resolve(), policy, today)
        if args.command == "repository":
            print(f"repository dependency policy: PASS ({len(exceptions)} active declaration(s); reviewed contracts exact)")
        elif args.command == "audit":
            validate_audit(policy, exceptions, args.workspace, args.audit_kind, args.audit_json.resolve())
            print(f"audit dependency policy: PASS ({args.workspace}-{args.audit_kind})")
        elif args.command == "images":
            validate_images(policy, args.backend_image)
            validate_frontend_paths(policy, args.frontend_image)
            print("release image dependency policy: PASS")
        else:
            raise GuardError(f"unsupported command: {args.command}")
    except GuardError as error:
        print(f"dependency policy: FAIL: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
