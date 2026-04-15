#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_EXPORT_SH="$ROOT_DIR/docker/export.sh"

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

  cat >"$stub_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd="${1:-}"
shift || true
case "$cmd" in
  image)
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
    ;;
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
EOF
  chmod +x "$stub_dir/docker"

  cat >"$stub_dir/sudo" <<'EOF'
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
EOF
  chmod +x "$stub_dir/sudo"
}

make_fixture() {
  local fixture_dir="$1"
  mkdir -p "$fixture_dir/docker" "$fixture_dir/backend" "$fixture_dir/.data/databot"
  cp "$SOURCE_EXPORT_SH" "$fixture_dir/docker/export.sh"
  chmod +x "$fixture_dir/docker/export.sh"
  cat >"$fixture_dir/docker/docker-compose.yaml" <<'EOF'
services: {}
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

extract_export_dir() {
  local archive="$1"
  local target_dir="$2"
  tar -xzf "$archive" -C "$target_dir"
  find "$target_dir" -mindepth 1 -maxdepth 1 -type d -name 'databot-export-*' | head -n 1
}

test_help_output() {
  local fixture="$1"
  local stub_bin="$2"
  local output
  output="$(PATH="$stub_bin:$PATH" "$fixture/docker/export.sh" -h)"
  assert_contains "$output" "Usage:"
  assert_contains "$output" "--with-data"
  assert_contains "$output" "默认不导出 .data"
}

test_default_export_without_data() {
  local fixture="$1"
  local stub_bin="$2"
  local output_dir="$fixture/out-default"
  mkdir -p "$output_dir"

  PATH="$stub_bin:$PATH" "$fixture/docker/export.sh" "$output_dir" >/tmp/export-default.log 2>&1

  local archive
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-export-*.tar.gz' | head -n 1)"
  assert_file_exists "$archive"

  local unpack_dir export_dir
  unpack_dir="$(mktemp -d)"
  export_dir="$(extract_export_dir "$archive" "$unpack_dir")"
  assert_file_exists "$export_dir/load.sh"
  assert_dir_missing "$export_dir/data"
  rm -rf "$unpack_dir"
}

test_export_with_data_and_skip_restore_when_target_has_data() {
  local fixture="$1"
  local stub_bin="$2"
  local output_dir="$fixture/out-with-data"
  mkdir -p "$output_dir"

  PATH="$stub_bin:$PATH" "$fixture/docker/export.sh" --with-data "$output_dir" >/tmp/export-with-data.log 2>&1

  local archive
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-export-*.tar.gz' | head -n 1)"
  assert_file_exists "$archive"

  local unpack_dir export_dir
  unpack_dir="$(mktemp -d)"
  export_dir="$(extract_export_dir "$archive" "$unpack_dir")"
  assert_file_exists "$export_dir/load.sh"
  assert_file_exists "$export_dir/data/logs/app.log"
  assert_file_exists "$export_dir/data/pg_data/PG_VERSION"

  local install_dir="$fixture/install-target"
  mkdir -p "$install_dir/.data/databot/existing"
  local load_output
  load_output="$(PATH="$stub_bin:$PATH" "$export_dir/load.sh" "$archive" "$install_dir" 2>&1)"
  assert_contains "$load_output" "检测到目标环境已存在 .data"
  assert_contains "$load_output" "跳过数据恢复"
  assert_dir_missing "$install_dir/.data/databot/logs"

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
  test_default_export_without_data "$fixture" "$stub_bin"
  test_export_with_data_and_skip_restore_when_target_has_data "$fixture" "$stub_bin"

  echo "PASS: export/load shell tests"
}

main "$@"
