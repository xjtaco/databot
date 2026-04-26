#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_PACKAGE_SH="$ROOT_DIR/docker/package.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    fail "expected output to contain: $needle"
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    fail "expected output not to contain: $needle"
  fi
}

assert_file_exists() {
  local path="$1"
  [ -e "$path" ] || fail "expected file to exist: $path"
}

assert_dir_missing() {
  local path="$1"
  [ ! -d "$path" ] || fail "expected directory to be absent: $path"
}

make_stub_bin() {
  local stub_dir="$1"
  mkdir -p "$stub_dir"

  cat >"$stub_dir/docker" <<'STUB_EOF'
#!/usr/bin/env bash
set -euo pipefail
CALL_LOG_FILE="${CALL_LOG_FILE:-/tmp/docker-call-log}"
echo "$*" >> "$CALL_LOG_FILE"

cmd="${1:-}"
shift || true

if [ "$cmd" = "compose" ]; then
  # Skip flags and their values (e.g. -f <file>, --env-file <file>)
  while [ "${1:-}" != "" ]; do
    case "${1:-}" in
      -f|--env-file|--file) shift 2 ;;
      --*) shift ;;
      -*) shift 2 ;;            # short flags with values
      *) break ;;
    esac
  done
  sub="${1:-}"
  case "$sub" in
    build|up|down|ps)
      exit 0
      ;;
    *)
      echo "unsupported docker compose subcommand: $sub" >&2
      exit 1
      ;;
  esac
fi

if [ "$cmd" = "image" ]; then
  sub="${1:-}"
  shift || true
  case "$sub" in
    inspect)
      exit 0
      ;;
    *)
      echo "unsupported docker image subcommand: $sub" >&2
      exit 1
      ;;
  esac
fi

case "$cmd" in
  save)
    out=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-o" ]; then
        out="$2"
        shift 2
      else
        shift
      fi
    done
    [ -n "$out" ] || exit 1
    printf 'stub docker save\n' >"$out"
    ;;
  load)
    if [ "${1:-}" != "-i" ]; then
      echo "unsupported docker load args" >&2
      exit 1
    fi
    [ -f "${2:-}" ] || exit 1
    printf 'Loaded image: stub\n'
    ;;
  *)
    echo "unsupported docker command: $cmd" >&2
    exit 1
    ;;
esac
STUB_EOF
  chmod +x "$stub_dir/docker"

  cat >"$stub_dir/sudo" <<'STUB_EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -eq 0 ]; then
  exit 0
fi
case "$1" in
  chown)
    shift
    if [ "$#" -lt 2 ]; then
      exit 1
    fi
    exit 0
    ;;
  *)
    exec "$@"
    ;;
esac
STUB_EOF
  chmod +x "$stub_dir/sudo"
}

make_fixture() {
  local fixture_dir="$1"
  mkdir -p "$fixture_dir/docker" "$fixture_dir/backend" "$fixture_dir/.data/databot"
  cp "$SOURCE_PACKAGE_SH" "$fixture_dir/docker/package.sh"
  chmod +x "$fixture_dir/docker/package.sh"
  cat >"$fixture_dir/docker/docker-compose.yaml" <<'EOF'
name: databot

services:
  postgres:
    image: postgres:13
  bridge:
    build:
      context: ../bridge
    image: databot-bridge:1.0.0
  sandbox-worker:
    build:
      context: .
    image: sandbox-worker:0.1.0
  backend:
    build:
      context: ../backend
    image: databot-backend:0.1.0
  nginx:
    build:
      context: ../frontend
    image: databot-nginx:0.1.0
EOF
  cat >"$fixture_dir/docker/nginx.conf" <<'EOF'
worker_processes auto;
EOF
  echo "DOCKER_ENV=1" >"$fixture_dir/docker/.env"
  echo "BACKEND_ENV=1" >"$fixture_dir/backend/.env"

  mkdir -p \
    "$fixture_dir/.data/databot/logs" \
    "$fixture_dir/.data/databot/workfolder" \
    "$fixture_dir/.data/databot/dictionary" \
    "$fixture_dir/.data/databot/knowledge" \
    "$fixture_dir/.data/databot/uploads" \
    "$fixture_dir/.data/databot/pg_data"
  echo "hello" >"$fixture_dir/.data/databot/logs/app.log"
  echo "pg" >"$fixture_dir/.data/databot/pg_data/PG_VERSION"
}

extract_package_dir() {
  local archive="$1"
  local target_dir="$2"
  tar -xzf "$archive" -C "$target_dir"
  find "$target_dir" -mindepth 1 -maxdepth 1 -type d -name 'databot-package-*' | head -n 1
}

test_help_output() {
  local fixture="$1"
  local stub_bin="$2"
  local output
  output="$(PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" -h)"
  assert_contains "$output" "Usage:"
  assert_contains "$output" "--with-data"
  assert_contains "$output" "打包"
}

test_docker_compose_build_is_called() {
  local fixture="$1"
  local stub_bin="$2"
  local log_file
  log_file="$(mktemp)"
  CALL_LOG_FILE="$log_file"

  local output_dir="$fixture/out-build"
  mkdir -p "$output_dir"
  PATH="$stub_bin:$PATH" CALL_LOG_FILE="$log_file" "$fixture/docker/package.sh" "$output_dir" >/dev/null 2>&1

  assert_contains "$(cat "$log_file")" "compose"
  assert_contains "$(cat "$log_file")" "build"
  rm -f "$log_file"
}

test_default_package_without_data() {
  local fixture="$1"
  local stub_bin="$2"
  local output_dir="$fixture/out-default"
  mkdir -p "$output_dir"

  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" "$output_dir" >/tmp/package-default.log 2>&1

  local archive
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  assert_file_exists "$archive"

  local unpack_dir pkg_dir
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"
  assert_file_exists "$pkg_dir/install.sh"
  assert_file_exists "$pkg_dir/images.tar"
  assert_file_exists "$pkg_dir/config/docker-compose.yaml"
  assert_file_exists "$pkg_dir/config/nginx.conf"
  assert_dir_missing "$pkg_dir/data"
  rm -rf "$unpack_dir"
}

test_package_with_data() {
  local fixture="$1"
  local stub_bin="$2"
  local output_dir="$fixture/out-with-data"
  mkdir -p "$output_dir"

  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" --with-data "$output_dir" >/tmp/package-with-data.log 2>&1

  local archive
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  assert_file_exists "$archive"

  local unpack_dir pkg_dir
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"
  assert_file_exists "$pkg_dir/data/logs/app.log"
  assert_file_exists "$pkg_dir/data/pg_data/PG_VERSION"
  rm -rf "$unpack_dir"
}

main() {
  local stub_bin fixture
  TEST_TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEST_TEMP_DIR"' EXIT

  stub_bin="$TEST_TEMP_DIR/stub-bin"
  fixture="$TEST_TEMP_DIR/fixture"
  make_stub_bin "$stub_bin"
  make_fixture "$fixture"

  test_help_output "$fixture" "$stub_bin"
  test_docker_compose_build_is_called "$fixture" "$stub_bin"
  test_default_package_without_data "$fixture" "$stub_bin"
  test_package_with_data "$fixture" "$stub_bin"

  echo "PASS: package/install shell tests"
}

main "$@"
