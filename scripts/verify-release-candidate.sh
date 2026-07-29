#!/usr/bin/env bash
# Collect live GitHub/Git evidence, then delegate every policy decision to the
# deterministic release_policy.py engine. This script never authenticates to a
# registry and never creates, moves or deletes a tag or release.

set -Eeuo pipefail

: "${TAG_NAME:?TAG_NAME is required}"
: "${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required}"
: "${GITHUB_REF:?GITHUB_REF is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

policy_mode="${RELEASE_POLICY_MODE:-validate}"
case "$policy_mode" in
  validate)
    : "${GH_TOKEN:?GH_TOKEN is required for read-only GitHub evidence}"
    ;;
  dry-run)
    # Permanent tests provide local command doubles and deliberately no token.
    # This mode still executes the complete collector and policy engine, but the
    # engine can only emit a publication plan.
    ;;
  *)
    echo "Release policy refused: RELEASE_POLICY_MODE must be validate or dry-run." >&2
    exit 2
    ;;
esac

if [[ "$GITHUB_EVENT_NAME" != "workflow_dispatch" ]]; then
  echo "Release policy refused: event must be an explicit workflow dispatch." >&2
  exit 1
fi

classification_file="$(mktemp)"
runs_file="$(mktemp)"
ci_file="$(mktemp)"
jobs_file="$(mktemp)"
environment_file="$(mktemp)"
environment_policies_file="$(mktemp)"
release_file="$(mktemp)"
release_error_file="$(mktemp)"
cleanup() {
  rm -f -- \
    "$classification_file" \
    "$runs_file" \
    "$ci_file" \
    "$jobs_file" \
    "$environment_file" \
    "$environment_policies_file" \
    "$release_file" \
    "$release_error_file"
}
trap cleanup EXIT

# Classify before interpolating TAG_NAME into any Git ref or API path.
python3 scripts/release_policy.py classify --tag "$TAG_NAME" >"$classification_file"

if [[ "$GITHUB_REF" != "refs/heads/main" ]]; then
  echo "Release policy refused: the publication workflow must run from main." >&2
  exit 1
fi
environment="$(
  python3 -c \
    'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["environment"])' \
    "$classification_file"
)"

# A fresh hosted runner is expected. Without a force refspec, an unexpected
# moved tag or rewritten main causes fetch to fail closed.
git fetch --no-tags origin "refs/heads/main:refs/remotes/origin/main"
git fetch --no-tags origin "refs/tags/$TAG_NAME:refs/tags/$TAG_NAME"

tag_sha="$(git rev-parse "refs/tags/$TAG_NAME^{commit}")"
main_sha="$(git rev-parse "refs/remotes/origin/main^{commit}")"
head_sha="$(git rev-parse "HEAD^{commit}")"

if [[ "$head_sha" != "$main_sha" ]]; then
  echo "Release policy refused: dispatched checkout HEAD differs from origin/main." >&2
  exit 1
fi

if ! gh api "repos/$GITHUB_REPOSITORY/environments/$environment" \
  >"$environment_file"; then
  echo "Release policy refused: protected environment is absent or unreadable: $environment." >&2
  exit 1
fi
if ! gh api \
  "repos/$GITHUB_REPOSITORY/environments/$environment/deployment-branch-policies?per_page=100" \
  >"$environment_policies_file"; then
  echo "Release policy refused: protected environment branch policies are unreadable: $environment." >&2
  exit 1
fi

set +e
gh api "repos/$GITHUB_REPOSITORY/releases/tags/$TAG_NAME" \
  >"$release_file" 2>"$release_error_file"
release_query_status=$?
set -e

if ((release_query_status == 0)); then
  release_state="present"
elif grep -Eq 'HTTP 404|"status"[[:space:]]*:[[:space:]]*"404"' \
  "$release_file" "$release_error_file"; then
  release_state="absent"
else
  echo "Release policy refused: GitHub release lookup did not return 200 or 404." >&2
  sed -n '1,20p' "$release_error_file" >&2
  exit 1
fi

gh api \
  "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=$tag_sha&per_page=100" \
  >"$runs_file"

ci_run_id="$(
  python3 scripts/release_policy.py select-run \
    --tag-sha "$tag_sha" \
    --runs-file "$runs_file"
)"

gh api "repos/$GITHUB_REPOSITORY/actions/runs/$ci_run_id" \
  >"$ci_file"
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$ci_run_id/jobs?filter=latest&per_page=100" \
  >"$jobs_file"

policy_arguments=(
  "$policy_mode"
  --tag "$TAG_NAME"
  --tag-sha "$tag_sha"
  --main-sha "$main_sha"
  --ci-file "$ci_file"
  --jobs-file "$jobs_file"
  --environment-file "$environment_file"
  --environment-policies-file "$environment_policies_file"
  --release-state "$release_state"
  --repository "$GITHUB_REPOSITORY"
)
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  policy_arguments+=(--github-output "$GITHUB_OUTPUT")
fi

python3 scripts/release_policy.py "${policy_arguments[@]}"
