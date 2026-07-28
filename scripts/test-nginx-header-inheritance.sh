#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --nginx-bin <chemin-nginx>" >&2
}

if [[ ${1:-} != "--nginx-bin" || $# -ne 2 ]]; then
  usage
  exit 2
fi

nginx_bin=$2
if [[ ! -x $nginx_bin ]]; then
  echo "Binaire Nginx introuvable ou non exécutable : $nginx_bin" >&2
  exit 2
fi

nginx_version=$("$nginx_bin" -v 2>&1)
if [[ $nginx_version != *"nginx/1.18.0"* ]]; then
  echo "Ce test exige Nginx 1.18.0 ; version reçue : $nginx_version" >&2
  exit 2
fi

for command_name in curl grep mktemp openssl sed; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise absente : $command_name" >&2
    exit 2
  fi
done

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
host_model="$repository_root/deploy/nginx/sentinel.conf.example"
public_verifier="$repository_root/scripts/verify-public-headers.sh"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/sentinel-nginx-1.18.XXXXXX")
mkdir -p \
  "$work_dir/client_temp" \
  "$work_dir/proxy_temp" \
  "$work_dir/fastcgi_temp" \
  "$work_dir/uwsgi_temp" \
  "$work_dir/scgi_temp"
base_port=$((20000 + $$ % 20000))
probe_port=$base_port
frontend_port=$((base_port + 1))
backend_port=$((base_port + 2))
public_port=$((base_port + 3))
model_http_port=$((base_port + 4))
model_https_port=$((base_port + 5))
nginx_pid=""

cleanup_nginx() {
  if [[ -n $nginx_pid ]] && kill -0 "$nginx_pid" 2>/dev/null; then
    kill "$nginx_pid"
    wait "$nginx_pid" 2>/dev/null || true
  fi
  nginx_pid=""
}

cleanup() {
  cleanup_nginx
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

wait_until_ready() {
  local url=$1
  local _
  for _ in {1..100}; do
    if curl --silent --output /dev/null --max-time 1 "$url"; then
      return 0
    fi
    sleep 0.05
  done
  echo "Nginx local n'est pas devenu disponible : $url" >&2
  return 1
}

start_nginx() {
  local config_file=$1
  "$nginx_bin" -p "$work_dir/" -c "$config_file" -t
  "$nginx_bin" -p "$work_dir/" -c "$config_file" &
  nginx_pid=$!
}

header_count() {
  local file=$1
  local header_name=$2
  awk -v wanted="$header_name" '
    BEGIN { IGNORECASE = 1 }
    {
      sub(/\r$/, "")
      separator = index($0, ":")
      if (separator == 0) next
      name = substr($0, 1, separator - 1)
      if (tolower(name) == tolower(wanted)) count += 1
    }
    END { print count + 0 }
  ' "$file"
}

write_probe_config() {
  local config_file=$1
  local barrier=$2
  cat >"$config_file" <<EOF
worker_processes 1;
daemon off;
pid $work_dir/probe.pid;
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    client_body_temp_path $work_dir/client_temp;
    proxy_temp_path $work_dir/proxy_temp;
    fastcgi_temp_path $work_dir/fastcgi_temp;
    uwsgi_temp_path $work_dir/uwsgi_temp;
    scgi_temp_path $work_dir/scgi_temp;
    add_header X-Sentinel-Global-Probe "inherited" always;
    server {
        listen 127.0.0.1:$probe_port;
        $barrier
        return 200 "probe";
    }
}
EOF
}

without_barrier="$work_dir/probe-without-barrier.conf"
with_barrier="$work_dir/probe-with-barrier.conf"
write_probe_config "$without_barrier" ""
write_probe_config "$with_barrier" 'add_header X-Sentinel-Inheritance-Barrier "";'

start_nginx "$without_barrier"
wait_until_ready "http://127.0.0.1:$probe_port/"
curl --silent --show-error --dump-header "$work_dir/without.headers" --output /dev/null \
  "http://127.0.0.1:$probe_port/"
if [[ $(header_count "$work_dir/without.headers" "X-Sentinel-Global-Probe") -ne 1 ]]; then
  echo "Le contrôle négatif n'a pas reproduit l'héritage global sans barrière." >&2
  exit 1
fi
cleanup_nginx

start_nginx "$with_barrier"
wait_until_ready "http://127.0.0.1:$probe_port/"
curl --silent --show-error --dump-header "$work_dir/with.headers" --output /dev/null \
  "http://127.0.0.1:$probe_port/"
if [[ $(header_count "$work_dir/with.headers" "X-Sentinel-Global-Probe") -ne 0 ]]; then
  echo "La barrière n'a pas bloqué l'héritage global." >&2
  exit 1
fi
if [[ $(header_count "$work_dir/with.headers" "X-Sentinel-Inheritance-Barrier") -ne 0 ]]; then
  echo "La barrière vide est devenue un en-tête public." >&2
  exit 1
fi
cleanup_nginx

cat >"$work_dir/public.conf" <<EOF
worker_processes 1;
daemon off;
pid $work_dir/public.pid;
error_log stderr notice;
events { worker_connections 64; }
http {
    access_log off;
    client_body_temp_path $work_dir/client_temp;
    proxy_temp_path $work_dir/proxy_temp;
    fastcgi_temp_path $work_dir/fastcgi_temp;
    uwsgi_temp_path $work_dir/uwsgi_temp;
    scgi_temp_path $work_dir/scgi_temp;
    server {
        listen 127.0.0.1:$frontend_port;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';" always;
        add_header Strict-Transport-Security "upstream-static-must-be-hidden" always;
        add_header Cache-Control "no-cache" always;
        location / { return 200 "frontend"; }
    }
    server {
        listen 127.0.0.1:$backend_port;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';" always;
        add_header Strict-Transport-Security "upstream-api-must-be-hidden" always;
        location / { return 200 '{"status":"ok"}'; }
    }
    add_header X-Sentinel-Global-Probe "must-not-leak" always;
    server {
        listen 127.0.0.1:$public_port;
        add_header X-Sentinel-Inheritance-Barrier "";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        location /api/ {
            proxy_pass http://127.0.0.1:$backend_port;
            proxy_hide_header Strict-Transport-Security;
        }
        location / {
            proxy_pass http://127.0.0.1:$frontend_port;
            proxy_hide_header Strict-Transport-Security;
        }
    }
}
EOF

start_nginx "$work_dir/public.conf"
wait_until_ready "http://127.0.0.1:$public_port/login"
"$public_verifier" --allow-http-local "http://127.0.0.1:$public_port"
for surface in login api/health; do
  curl --silent --show-error --dump-header "$work_dir/${surface//\//-}.headers" --output /dev/null \
    "http://127.0.0.1:$public_port/$surface"
  if [[ $(header_count "$work_dir/${surface//\//-}.headers" "X-Sentinel-Global-Probe") -ne 0 ]]; then
    echo "Un add_header global a fui sur /$surface." >&2
    exit 1
  fi
done
cleanup_nginx

barrier_count=$(grep -F -c 'add_header X-Sentinel-Inheritance-Barrier "";' "$host_model" || true)
if [[ $barrier_count -ne 1 ]]; then
  echo "Le modèle hôte doit contenir exactement une barrière d'héritage." >&2
  exit 1
fi
if grep -Eq '^[[:space:]]*http2[[:space:]]+on[[:space:]]*;' "$host_model"; then
  echo "La directive « http2 on » n'est pas compatible avec Nginx 1.18.0." >&2
  exit 1
fi
grep -Fq 'listen 443 ssl http2;' "$host_model"
grep -Fq 'listen [::]:443 ssl http2;' "$host_model"

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=sentinel.test' \
  -keyout "$work_dir/privkey.pem" \
  -out "$work_dir/fullchain.pem" \
  >/dev/null 2>&1
sed \
  -e "s#/etc/letsencrypt/live/sentinel.akiksystems.fr/fullchain.pem#$work_dir/fullchain.pem#" \
  -e "s#/etc/letsencrypt/live/sentinel.akiksystems.fr/privkey.pem#$work_dir/privkey.pem#" \
  -e "s#listen 80;#listen 127.0.0.1:$model_http_port;#" \
  -e "s#listen \\[::\\]:80;##" \
  -e "s#listen 443 ssl http2;#listen 127.0.0.1:$model_https_port ssl http2;#" \
  -e "s#listen \\[::\\]:443 ssl http2;##" \
  "$host_model" >"$work_dir/host-model.conf"
cat >"$work_dir/host-model-main.conf" <<EOF
worker_processes 1;
pid $work_dir/model.pid;
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    client_body_temp_path $work_dir/client_temp;
    proxy_temp_path $work_dir/proxy_temp;
    fastcgi_temp_path $work_dir/fastcgi_temp;
    uwsgi_temp_path $work_dir/uwsgi_temp;
    scgi_temp_path $work_dir/scgi_temp;
    include $work_dir/host-model.conf;
}
EOF
"$nginx_bin" -p "$work_dir/" -c "$work_dir/host-model-main.conf" -t

echo "Nginx 1.18.0 : héritage, valeurs publiques et modèle hôte conformes."
