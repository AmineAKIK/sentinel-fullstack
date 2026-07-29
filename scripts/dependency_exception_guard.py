#!/usr/bin/env python3
"""Fail-closed guard for Sentinel's two temporary RC5 dependency exceptions."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Any


SCRIPT_ROOT = Path(__file__).resolve().parents[1]
POLICY_ID = "sentinel-rc5-bounded-dependency-exceptions"
EXPECTED_OWNER = "repository-owner:AmineAKIK"
MAX_EXPIRY = date(2026, 8, 31)
EXPECTED_LOCKFILES = {
    "backend/package-lock.json",
    "frontend/package-lock.json",
}
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
}
EXPECTED_EXCEPTIONS = {
    "GHSA-mh99-v99m-4gvg": {
        "package": "brace-expansion",
        "affected_range": "<=5.0.7",
        "classification": "upstream-dev-only",
        "required_scopes": {"backend-full", "frontend-full"},
        "forbidden_scopes": {"backend-runtime", "frontend-runtime"},
    },
    "GHSA-qwww-vcr4-c8h2": {
        "package": "react-router",
        "affected_range": ">=7.12.0 <8.3.0",
        "classification": "not-applicable",
        "required_scopes": {"frontend-full", "frontend-runtime"},
        "forbidden_scopes": {"backend-full", "backend-runtime"},
    },
}
EXPECTED_BRACE_RUNTIME_PACKAGES = {
    "brace-expansion",
    "glob",
    "minimatch",
}
SOURCE_SUFFIXES = {".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"}
GHSA_PATTERN = re.compile(r"GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}")
RSC_IMPORT_FRAGMENTS = {
    "react-router/internal/react-server",
    "react-router/internal/react-server-client",
}


class GuardError(RuntimeError):
    """An invariant protected by the policy has changed."""


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


def parse_iso_date(raw_value: Any, field: str) -> date:
    require(isinstance(raw_value, str), f"{field} must be an ISO date")
    try:
        return date.fromisoformat(raw_value)
    except ValueError as error:
        raise GuardError(f"{field} must be an ISO date") from error


def validate_policy(policy: dict[str, Any], today: date) -> dict[str, dict[str, Any]]:
    require(policy.get("schema_version") == 1, "unsupported policy schema_version")
    require(policy.get("policy_id") == POLICY_ID, "unexpected policy_id")
    require(
        policy.get("risk_owner") == EXPECTED_OWNER,
        f"risk_owner must be explicit and equal to {EXPECTED_OWNER}",
    )
    require(policy.get("severity_floor") == "high", "severity_floor must remain high")

    expiry = parse_iso_date(policy.get("expires_on"), "expires_on")
    require(expiry == MAX_EXPIRY, "policy expiration must remain 2026-08-31")
    require(today <= expiry, f"dependency exception policy expired on {expiry}")

    lockfiles = policy.get("lockfiles")
    require(isinstance(lockfiles, dict), "lockfiles must be an object")
    require(
        set(lockfiles) == EXPECTED_LOCKFILES,
        "policy must cover exactly both reviewed package-lock.json files",
    )
    for relative_path, record in lockfiles.items():
        require(isinstance(record, dict), f"invalid lock record for {relative_path}")
        digest = record.get("sha256")
        require(
            isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) is not None,
            f"invalid SHA-256 for {relative_path}",
        )

    require(
        policy.get("router_contract") == EXPECTED_ROUTER_CONTRACT,
        "Router contract must remain React 18 / Router 7.18.2 / Declarative Mode",
    )

    brace_contract = policy.get("brace_contract")
    require(isinstance(brace_contract, dict), "missing brace_contract")
    runtime_packages = brace_contract.get("forbidden_runtime_packages")
    require(
        isinstance(runtime_packages, list)
        and set(runtime_packages) == EXPECTED_BRACE_RUNTIME_PACKAGES,
        "Brace runtime package deny-list must remain closed",
    )
    require(
        isinstance(brace_contract.get("installations"), dict),
        "brace_contract.installations must be an object",
    )
    require(
        isinstance(brace_contract.get("exception_chains"), dict),
        "brace_contract.exception_chains must be an object",
    )

    raw_exceptions = policy.get("exceptions")
    require(
        isinstance(raw_exceptions, list) and len(raw_exceptions) == 2,
        "policy must contain exactly the two approved dependency exceptions",
    )
    exceptions: dict[str, dict[str, Any]] = {}
    for exception in raw_exceptions:
        require(isinstance(exception, dict), "each exception must be an object")
        advisory = exception.get("advisory")
        require(
            isinstance(advisory, str) and advisory in EXPECTED_EXCEPTIONS,
            "policy must contain exactly the two approved GHSA identifiers",
        )
        require(advisory not in exceptions, f"duplicate exception {advisory}")
        expected = EXPECTED_EXCEPTIONS[advisory]
        for key in ("package", "affected_range", "classification"):
            require(
                exception.get(key) == expected[key],
                f"{advisory} {key} differs from the approved exception",
            )
        require(
            exception.get("risk_owner") == EXPECTED_OWNER,
            f"{advisory} risk_owner must be explicit",
        )
        exception_expiry = parse_iso_date(
            exception.get("expires_on"), f"{advisory}.expires_on"
        )
        require(
            exception_expiry == MAX_EXPIRY,
            f"{advisory} expiration must remain 2026-08-31",
        )
        require(
            isinstance(exception.get("rationale"), str)
            and bool(exception["rationale"].strip()),
            f"{advisory} rationale must be explicit",
        )
        require(
            set(exception.get("required_scopes", [])) == expected["required_scopes"],
            f"{advisory} required scopes differ from the approved exception",
        )
        require(
            set(exception.get("forbidden_scopes", []))
            == expected["forbidden_scopes"],
            f"{advisory} forbidden scopes differ from the approved exception",
        )
        exceptions[advisory] = exception
    require(
        set(exceptions) == set(EXPECTED_EXCEPTIONS),
        "policy must contain exactly the two approved dependency exceptions",
    )
    return exceptions


def package_name_from_path(package_path: str, entry: dict[str, Any]) -> str:
    explicit = entry.get("name")
    if isinstance(explicit, str):
        return explicit
    require(package_path != "", "root lock package must declare its name")
    marker = "node_modules/"
    require(marker in package_path, f"cannot derive package name from {package_path}")
    return package_path.rsplit(marker, 1)[1]


def resolve_lock_dependency(
    packages: dict[str, Any],
    parent_path: str,
    dependency_name: str,
) -> str | None:
    prefix = parent_path
    tried: set[str] = set()
    while True:
        candidate = (
            f"{prefix}/node_modules/{dependency_name}"
            if prefix
            else f"node_modules/{dependency_name}"
        )
        if candidate not in tried:
            tried.add(candidate)
            if candidate in packages:
                return candidate
        nested_marker = "/node_modules/"
        nested_index = prefix.rfind(nested_marker)
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
            resolved = resolve_lock_dependency(
                packages, package_path, dependency_name
            )
            require(
                resolved is not None,
                f"unresolved runtime dependency {dependency_name} from {package_path}",
            )
            pending.append(resolved)
        for dependency_name in entry.get("optionalDependencies", {}):
            resolved = resolve_lock_dependency(
                packages, package_path, dependency_name
            )
            if resolved is not None:
                pending.append(resolved)
    return visited


def validate_exception_chain(
    workspace: str,
    packages: dict[str, Any],
    chain: Any,
) -> None:
    require(
        isinstance(chain, list) and len(chain) >= 2,
        f"invalid {workspace} Brace exception chain",
    )
    for index, expected_node in enumerate(chain):
        require(
            isinstance(expected_node, dict),
            f"invalid {workspace} Brace exception chain node",
        )
        path = expected_node.get("path")
        require(isinstance(path, str), "Brace chain path must be a string")
        entry = packages.get(path)
        require(
            isinstance(entry, dict),
            f"Brace exception chain path is missing: {workspace}/{path}",
        )
        actual_name = package_name_from_path(path, entry)
        require(
            actual_name == expected_node.get("name"),
            f"Brace exception chain package changed at {workspace}/{path}",
        )
        require(
            entry.get("version") == expected_node.get("version"),
            f"Brace exception chain version changed at {workspace}/{path}",
        )
        if index == 0:
            require(path == "", "Brace exception chain must start at lock root")
            require(
                expected_node.get("dependency_scope") == "devDependencies",
                "Brace exception chain must be rooted in devDependencies",
            )
            continue

        parent_expected = chain[index - 1]
        parent_path = parent_expected["path"]
        parent_entry = packages[parent_path]
        child_name = expected_node["name"]
        scopes = (
            ["devDependencies"]
            if index == 1
            else ["dependencies", "optionalDependencies", "peerDependencies"]
        )
        require(
            any(child_name in parent_entry.get(scope, {}) for scope in scopes),
            (
                f"Brace exception chain edge changed: {workspace}/"
                f"{parent_expected['name']} -> {child_name}"
            ),
        )
        resolved = resolve_lock_dependency(packages, parent_path, child_name)
        require(
            resolved == path,
            (
                f"Brace exception transitive path changed: {workspace}/"
                f"{parent_expected['name']} -> {child_name}"
            ),
        )


def validate_lockfile(
    repo_root: Path,
    workspace: str,
    policy: dict[str, Any],
) -> dict[str, Any]:
    relative_path = f"{workspace}/package-lock.json"
    lock_path = repo_root / relative_path
    expected_digest = policy["lockfiles"][relative_path]["sha256"]
    actual_digest = file_sha256(lock_path)
    require(
        actual_digest == expected_digest,
        (
            f"{relative_path} changed: D2 re-evaluation required "
            f"(expected {expected_digest}, got {actual_digest})"
        ),
    )
    lock = read_json(lock_path)
    packages = lock.get("packages")
    require(isinstance(packages, dict), f"{relative_path} has no packages map")

    expected_installations = policy["brace_contract"]["installations"].get(workspace)
    require(
        isinstance(expected_installations, dict),
        f"missing Brace installations for {workspace}",
    )
    actual_installations: dict[str, str] = {}
    for package_path, raw_entry in packages.items():
        if not isinstance(raw_entry, dict) or package_path == "":
            continue
        if package_name_from_path(package_path, raw_entry) == "brace-expansion":
            version = raw_entry.get("version")
            require(
                isinstance(version, str),
                f"Brace installation has no version: {workspace}/{package_path}",
            )
            actual_installations[package_path] = version
    expected_paths = set(expected_installations)
    require(
        set(actual_installations) == expected_paths,
        (
            f"Brace installation graph changed in {workspace}: "
            f"expected {sorted(expected_paths)}, got {sorted(actual_installations)}"
        ),
    )
    for package_path, record in expected_installations.items():
        require(
            isinstance(record, dict)
            and record.get("classification") in {"exception-dev", "patched-dev"},
            f"invalid Brace installation classification at {workspace}/{package_path}",
        )
        require(
            actual_installations[package_path] == record.get("version"),
            f"Brace installation graph version changed at {workspace}/{package_path}",
        )

    raw_chains = policy["brace_contract"]["exception_chains"].get(workspace)
    require(isinstance(raw_chains, list), f"missing Brace chains for {workspace}")
    for chain in raw_chains:
        validate_exception_chain(workspace, packages, chain)
    chain_terminals = {
        chain[-1]["path"] for chain in raw_chains if isinstance(chain, list) and chain
    }
    exception_paths = {
        path
        for path, record in expected_installations.items()
        if record.get("classification") == "exception-dev"
    }
    require(
        chain_terminals == exception_paths,
        f"Brace exception chains do not exactly cover {workspace} exception installs",
    )

    for package_path in production_closure(packages):
        entry = packages[package_path]
        package_name = package_name_from_path(package_path, entry)
        require(
            package_name not in EXPECTED_BRACE_RUNTIME_PACKAGES,
            (
                f"Brace runtime contract violated: {package_name} is reachable "
                f"at {workspace}/{package_path}"
            ),
        )
    return lock


def production_source_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for relative_root in ("backend/src", "frontend/src"):
        source_root = repo_root / relative_root
        if not source_root.exists():
            continue
        for path in source_root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            relative_parts = path.relative_to(source_root).parts
            if any(part in {"__tests__", "test", "tests"} for part in relative_parts):
                continue
            if ".test." in path.name or ".spec." in path.name:
                continue
            files.append(path)
    return files


def all_source_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for relative_root in ("backend/src", "frontend/src"):
        source_root = repo_root / relative_root
        if not source_root.exists():
            continue
        files.extend(
            path
            for path in source_root.rglob("*")
            if path.is_file() and path.suffix in SOURCE_SUFFIXES
        )
    return files


def validate_router_and_source_contracts(
    repo_root: Path,
    policy: dict[str, Any],
    frontend_lock: dict[str, Any],
    backend_lock: dict[str, Any],
) -> None:
    frontend_package = read_json(repo_root / "frontend/package.json")
    dependencies = frontend_package.get("dependencies")
    require(isinstance(dependencies, dict), "frontend dependencies are missing")
    require(
        dependencies.get("react-router-dom") == "7.18.2",
        "declared router version must remain exactly react-router-dom 7.18.2",
    )
    require(
        dependencies.get("react") == "^18.2.0"
        and dependencies.get("react-dom") == "^18.2.0",
        "declared React major must remain 18",
    )

    lock_root = frontend_lock["packages"].get("")
    require(isinstance(lock_root, dict), "frontend lock root is missing")
    require(
        lock_root.get("dependencies", {}).get("react-router-dom") == "7.18.2",
        "lock root router version must remain exactly 7.18.2",
    )
    for package_name, expected_version in EXPECTED_ROUTER_CONTRACT[
        "resolved_packages"
    ].items():
        package_path = f"node_modules/{package_name}"
        entry = frontend_lock["packages"].get(package_path)
        require(
            isinstance(entry, dict)
            and entry.get("version") == expected_version,
            (
                "React major changed"
                if package_name in {"react", "react-dom"}
                else "resolved router version changed"
            ),
        )

    forbidden_rsc_packages = set(
        policy["router_contract"]["forbidden_rsc_packages"]
    )
    for workspace, lock in (("frontend", frontend_lock), ("backend", backend_lock)):
        packages = lock["packages"]
        for package_path, entry in packages.items():
            if not isinstance(entry, dict):
                continue
            if package_path:
                package_name = package_name_from_path(package_path, entry)
                require(
                    package_name not in forbidden_rsc_packages,
                    f"RSC dependency is forbidden: {workspace}/{package_name}",
                )
            for scope in (
                "dependencies",
                "devDependencies",
                "optionalDependencies",
                "peerDependencies",
            ):
                declared = entry.get(scope, {})
                if not isinstance(declared, dict):
                    continue
                for dependency_name in declared:
                    require(
                        dependency_name not in forbidden_rsc_packages,
                        (
                            f"RSC dependency is forbidden: "
                            f"{workspace}/{dependency_name}"
                        ),
                    )

    entrypoint = repo_root / policy["router_contract"]["production_entrypoint"]
    try:
        entrypoint_text = entrypoint.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise GuardError(f"missing Router production entrypoint: {entrypoint}") from error
    required_symbol = policy["router_contract"]["required_entrypoint_symbol"]
    require(
        required_symbol in entrypoint_text,
        f"Router must remain in Declarative Mode with {required_symbol}",
    )

    forbidden_mode_symbols = set(
        policy["router_contract"]["forbidden_data_router_symbols"]
    )
    forbidden_rsc_symbols = set(policy["router_contract"]["forbidden_rsc_symbols"])
    quoted_pattern = re.compile(
        r"['\"](?:brace-expansion|glob|minimatch)(?:/[^'\"]*)?['\"]"
    )
    for source_path in all_source_files(repo_root):
        try:
            source = source_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise GuardError(f"non-UTF-8 source file: {source_path}") from error
        for symbol in forbidden_rsc_symbols:
            require(
                symbol not in source,
                f"RSC API is forbidden: {symbol} in {source_path.relative_to(repo_root)}",
            )
        require(
            '"use server"' not in source and "'use server'" not in source,
            f"RSC API directive is forbidden in {source_path.relative_to(repo_root)}",
        )
        for fragment in RSC_IMPORT_FRAGMENTS:
            require(
                fragment not in source,
                f"RSC API import is forbidden in {source_path.relative_to(repo_root)}",
            )

    for source_path in production_source_files(repo_root):
        try:
            source = source_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise GuardError(f"non-UTF-8 source file: {source_path}") from error
        for symbol in forbidden_mode_symbols:
            require(
                symbol not in source,
                (
                    "Router must remain in Declarative Mode; "
                    f"found {symbol} in {source_path.relative_to(repo_root)}"
                ),
            )
        match = quoted_pattern.search(source)
        require(
            match is None,
            (
                "attacker-controlled application pattern guard: "
                f"runtime source references {match.group(0) if match else ''} in "
                f"{source_path.relative_to(repo_root)}"
            ),
        )

    framework_configs = list((repo_root / "frontend").glob("react-router.config.*"))
    require(
        not framework_configs,
        "Router must remain in Declarative Mode; framework config detected",
    )


def validate_repository(
    repo_root: Path,
    policy: dict[str, Any],
    today: date,
) -> dict[str, dict[str, Any]]:
    exceptions = validate_policy(policy, today)
    backend_lock = validate_lockfile(repo_root, "backend", policy)
    frontend_lock = validate_lockfile(repo_root, "frontend", policy)
    validate_router_and_source_contracts(
        repo_root, policy, frontend_lock, backend_lock
    )
    return exceptions


def advisory_ids_from_object(value: dict[str, Any]) -> set[str]:
    haystacks = [
        value.get("url"),
        value.get("title"),
        value.get("name"),
    ]
    found: set[str] = set()
    for haystack in haystacks:
        if isinstance(haystack, str):
            found.update(GHSA_PATTERN.findall(haystack))
    return found


def resolve_vulnerability_advisories(
    name: str,
    vulnerabilities: dict[str, Any],
    memo: dict[str, set[str]],
    stack: set[str],
) -> set[str]:
    if name in memo:
        return memo[name]
    require(name not in stack, f"cycle in npm audit vulnerability graph at {name}")
    vulnerability = vulnerabilities.get(name)
    require(
        isinstance(vulnerability, dict),
        f"npm audit references unknown vulnerability node {name}",
    )
    via = vulnerability.get("via")
    require(isinstance(via, list), f"npm audit node {name} has invalid via data")
    stack.add(name)
    advisories: set[str] = set()
    for item in via:
        if isinstance(item, str):
            advisories.update(
                resolve_vulnerability_advisories(
                    item, vulnerabilities, memo, stack
                )
            )
        elif isinstance(item, dict):
            direct_ids = advisory_ids_from_object(item)
            require(
                direct_ids,
                f"unapproved advisory without a GHSA identifier in npm audit node {name}",
            )
            advisories.update(direct_ids)
        else:
            raise GuardError(f"npm audit node {name} has unsupported via data")
    stack.remove(name)
    require(
        advisories,
        f"high/critical npm audit node {name} does not resolve to an advisory",
    )
    memo[name] = advisories
    return advisories


def expected_direct_nodes(
    policy: dict[str, Any],
    workspace: str,
    advisory: str,
) -> set[str]:
    if advisory == "GHSA-qwww-vcr4-c8h2":
        return {"node_modules/react-router"}
    installations = policy["brace_contract"]["installations"][workspace]
    return {
        path
        for path, record in installations.items()
        if record.get("classification") == "exception-dev"
    }


def validate_audit(
    policy: dict[str, Any],
    exceptions: dict[str, dict[str, Any]],
    workspace: str,
    audit_kind: str,
    audit_path: Path,
) -> None:
    scope = f"{workspace}-{audit_kind}"
    audit = read_json(audit_path)
    vulnerabilities = audit.get("vulnerabilities")
    require(isinstance(vulnerabilities, dict), "npm audit JSON has no vulnerabilities")

    required_advisories = {
        advisory
        for advisory, exception in exceptions.items()
        if scope in exception["required_scopes"]
    }
    forbidden_advisories = {
        advisory
        for advisory, exception in exceptions.items()
        if scope in exception["forbidden_scopes"]
    }
    require(
        required_advisories | forbidden_advisories == set(EXPECTED_EXCEPTIONS),
        f"scope classification is incomplete for {scope}",
    )

    memo: dict[str, set[str]] = {}
    observed: set[str] = set()
    for name, vulnerability in vulnerabilities.items():
        require(isinstance(vulnerability, dict), f"invalid npm audit node {name}")
        severity = vulnerability.get("severity")
        if severity not in {"high", "critical"}:
            continue
        advisories = resolve_vulnerability_advisories(
            name, vulnerabilities, memo, set()
        )
        unknown = advisories - set(EXPECTED_EXCEPTIONS)
        require(
            not unknown,
            f"unapproved advisory detected in {scope}: {sorted(unknown)}",
        )
        forbidden = advisories & forbidden_advisories
        require(
            not forbidden,
            f"{sorted(forbidden)} is forbidden in {scope}",
        )
        observed.update(advisories)

    for vulnerability_name, vulnerability in vulnerabilities.items():
        if not isinstance(vulnerability, dict):
            continue
        via = vulnerability.get("via")
        if not isinstance(via, list):
            continue
        for direct in via:
            if not isinstance(direct, dict):
                continue
            direct_ids = advisory_ids_from_object(direct)
            for advisory in direct_ids:
                require(
                    advisory in EXPECTED_EXCEPTIONS,
                    f"unapproved advisory detected in {scope}: {advisory}",
                )
                expected = EXPECTED_EXCEPTIONS[advisory]
                require(
                    vulnerability_name == expected["package"],
                    (
                        f"{advisory} direct advisory package changed: "
                        f"{vulnerability_name}"
                    ),
                )
                require(
                    direct.get("range") == expected["affected_range"],
                    f"{advisory} affected range changed",
                )
                require(
                    direct.get("severity") == "high",
                    f"{advisory} severity changed",
                )
                actual_nodes = vulnerability.get("nodes")
                require(
                    isinstance(actual_nodes, list)
                    and set(actual_nodes)
                    == expected_direct_nodes(policy, workspace, advisory),
                    f"{advisory} direct advisory node paths changed",
                )

    require(
        observed == required_advisories,
        (
            f"{scope} required exception set differs: "
            f"expected {sorted(required_advisories)}, got {sorted(observed)}"
        ),
    )


def validate_images(backend_image: str, frontend_image: str) -> None:
    application_roots = (
        (backend_image, "/app/node_modules"),
        (frontend_image, "/usr/share/nginx/html"),
    )
    for image, application_root in application_roots:
        command = [
            "docker",
            "run",
            "--rm",
            "--entrypoint",
            "find",
            image,
            application_root,
            "-path",
            "*/node_modules/brace-expansion/package.json",
            "-print",
        ]
        try:
            result = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
        except FileNotFoundError as error:
            raise GuardError("docker is required for the release image guard") from error
        require(
            result.returncode == 0,
            f"could not inspect release image {image}: {result.stdout.strip()}",
        )
        paths = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        require(
            not paths,
            f"Brace reappeared in release image {image}: {paths}",
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Enforce Sentinel's bounded RC5 dependency exceptions."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=SCRIPT_ROOT,
        help="repository root (defaults to the script's parent repository)",
    )
    parser.add_argument(
        "--policy",
        type=Path,
        default=SCRIPT_ROOT / "security/dependency-exceptions.json",
        help="machine-readable exception policy",
    )
    parser.add_argument(
        "--today",
        type=date.fromisoformat,
        default=None,
        help=argparse.SUPPRESS,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("repository", help="validate lockfiles and source contracts")

    audit = subparsers.add_parser("audit", help="validate an npm audit JSON document")
    audit.add_argument("--workspace", choices=("backend", "frontend"), required=True)
    audit.add_argument("--audit-kind", choices=("runtime", "full"), required=True)
    audit.add_argument("--audit-json", type=Path, required=True)

    images = subparsers.add_parser(
        "images", help="ensure release images contain no Brace runtime"
    )
    images.add_argument("--backend-image", required=True)
    images.add_argument("--frontend-image", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo_root = args.repo_root.resolve()
    policy_path = args.policy.resolve()
    today = args.today or datetime.now(timezone.utc).date()
    try:
        policy = read_json(policy_path)
        exceptions = validate_repository(repo_root, policy, today)
        if args.command == "repository":
            print(
                "repository policy: PASS "
                "(Router 7.18.2 Declarative / React 18 / RSC absent / "
                "Brace dev paths exact / runtime closure clean)"
            )
        elif args.command == "audit":
            validate_audit(
                policy,
                exceptions,
                args.workspace,
                args.audit_kind,
                args.audit_json.resolve(),
            )
            print(
                f"audit policy: PASS ({args.workspace}-{args.audit_kind}; "
                "only exact required GHSA exceptions observed)"
            )
        elif args.command == "images":
            validate_images(args.backend_image, args.frontend_image)
            print("release image policy: PASS (Brace absent from both images)")
        else:
            raise GuardError(f"unsupported command: {args.command}")
    except GuardError as error:
        print(f"dependency exception policy: FAIL: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
