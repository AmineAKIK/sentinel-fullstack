#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--allow-http-local] <base-url>" >&2
}

allow_http_local=false
if [[ ${1:-} == "--allow-http-local" ]]; then
  allow_http_local=true
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

base_url=${1%/}
if [[ $base_url != https://* ]]; then
  if [[ $allow_http_local != true || ! $base_url =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
    echo "Refus d'une URL non HTTPS hors simulation locale." >&2
    exit 2
  fi
fi

for command_name in curl awk mktemp tr; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise absente : $command_name" >&2
    exit 2
  fi
done

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/sentinel-public-headers.XXXXXX")
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

fetch_headers() {
  local path=$1
  local output=$2
  curl \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --output /dev/null \
    --dump-header "$output" \
    "${base_url}${path}"
}

header_values() {
  local file=$1
  local header_name=$2
  awk -v wanted="$header_name" '
    BEGIN { IGNORECASE = 1 }
    {
      sub(/\r$/, "")
      separator = index($0, ":")
      if (separator == 0) next
      name = substr($0, 1, separator - 1)
      if (tolower(name) == tolower(wanted)) {
        value = substr($0, separator + 1)
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]]+$/, "", value)
        print value
      }
    }
  ' "$file"
}

assert_exactly_one() {
  local file=$1
  local header_name=$2
  local expected_value=$3
  local values
  local count

  values=$(header_values "$file" "$header_name")
  count=$(printf '%s\n' "$values" | awk 'NF { count += 1 } END { print count + 0 }')
  if [[ $count -ne 1 || $values != "$expected_value" ]]; then
    echo "Écart ${header_name} : attendu une occurrence exacte, reçu ${count}." >&2
    exit 1
  fi
}

assert_absent() {
  local file=$1
  local header_name=$2
  local count
  count=$(header_values "$file" "$header_name" | awk 'NF { count += 1 } END { print count + 0 }')
  if [[ $count -ne 0 ]]; then
    echo "En-tête interdit ou inattendu : ${header_name} (${count} occurrence(s))." >&2
    exit 1
  fi
}

login_headers="$work_dir/login.headers"
health_headers="$work_dir/health.headers"
fetch_headers "/login" "$login_headers"
fetch_headers "/api/health" "$health_headers"

hsts_value="max-age=31536000; includeSubDomains"
csp_value="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
permissions_value="camera=(), microphone=(), geolocation=()"

for header_file in "$login_headers" "$health_headers"; do
  assert_exactly_one "$header_file" "Strict-Transport-Security" "$hsts_value"
  assert_exactly_one "$header_file" "Content-Security-Policy" "$csp_value"
  assert_exactly_one "$header_file" "X-Content-Type-Options" "nosniff"
  assert_exactly_one "$header_file" "X-Frame-Options" "DENY"
  assert_exactly_one "$header_file" "Referrer-Policy" "no-referrer"
  assert_exactly_one "$header_file" "Permissions-Policy" "$permissions_value"
  assert_absent "$header_file" "X-Sentinel-Inheritance-Barrier"
done

assert_exactly_one "$login_headers" "Cache-Control" "no-cache"
assert_absent "$health_headers" "Cache-Control"

echo "En-têtes publics conformes sur /login et /api/health."
