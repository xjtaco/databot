# Docker Package & Install Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `docker/export.sh` with `docker/package.sh` that builds images, packages them with an `install.sh` into a tar.gz, supporting `--install-dir` and automatic upgrade detection.

**Architecture:** `package.sh` runs `docker compose build` then saves all service images. It generates an `install.sh` that handles both fresh installs and upgrades by detecting running containers. Files are installed preserving the project's original directory structure (`docker/`, `backend/`, `.data/`) so volume paths in `docker-compose.yaml` require no modification.

**Tech Stack:** Bash, Docker Compose, tar/gzip

---

## File Structure

| File | Responsibility |
|------|---------------|
| `docker/package.sh` | Build images, collect config + data, generate `install.sh`, create tar.gz |
| `docker/tests/package_install_test.sh` | Stub-based tests for both package.sh and install.sh |
| `docker/export.sh` | **Delete** — replaced by package.sh |
| `docker/tests/export_load_test.sh` | **Delete** — replaced by package_install_test.sh |

---

### Task 1: Write package.sh — scaffolding, argument parsing, docker compose build, and image export

**Files:**
- Create: `docker/package.sh`
- Test: `docker/tests/package_install_test.sh`

- [ ] **Step 1: Write the package.sh script with argument parsing, build, save, config collection, and tar.gz creation**

```bash
#!/usr/bin/env bash
#
# DataBot Package Script
# Builds Docker images, then packages images, configuration, and optionally
# persistent data into a single archive with an embedded install.sh.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yaml"
DATA_DIR="$(cd "$SCRIPT_DIR/../.data/databot" 2>/dev/null && pwd || echo "")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WITH_DATA=0
OUTPUT_DIR="."
PACKAGE_NAME="databot-package-${TIMESTAMP}"
WORK_DIR=""

# Data sub-directories (relative to DATA_DIR)
DATA_DIRS=(logs workfolder dictionary knowledge uploads)

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./package.sh [-h] [--with-data] [output_dir]

Build Docker images and package them with configuration into a deployable archive.

Options:
  -h, --help     打印使用说明
  --with-data    打包 .data/databot 数据（默认不打包 .data）

Arguments:
  output_dir     压缩包输出目录，默认为当前目录
EOF
}

cleanup() {
  if [ -z "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
    return
  fi
  echo "[*] Cleaning up temporary files..."

  if rm -rf "$WORK_DIR" 2>/dev/null; then
    return
  fi

  # pg_data inside WORK_DIR may be owned by postgres uid, needs root to remove
  if [ "$(id -u)" -ne 0 ]; then
    sudo rm -rf "$WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

# Parse image names from docker-compose.yaml
parse_images() {
  local compose_file="$1"
  grep -E '^\s+image:' "$compose_file" \
    | sed -E 's/^\s+image:\s*//' \
    | tr -d '"' \
    | tr -d "'" \
    | sort -u
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --with-data)
      WITH_DATA=1
      ;;
    -*)
      error "Unknown option: $1"
      ;;
    *)
      if [ "$OUTPUT_DIR" = "." ]; then
        OUTPUT_DIR="$1"
      else
        error "Too many arguments"
      fi
      ;;
  esac
  shift
done

# ---------- preflight checks ----------
if [ ! -f "$COMPOSE_FILE" ]; then
  error "docker-compose.yaml not found at $COMPOSE_FILE"
fi
if [ "$WITH_DATA" -eq 1 ]; then
  if [ -z "$DATA_DIR" ] || [ ! -d "$DATA_DIR" ]; then
    warn "Data directory .data/databot not found — data export will be skipped"
    WITH_DATA=0
  fi
fi

# ---------- 1. Build Docker images ----------
info "Building Docker images..."
docker compose -f "$COMPOSE_FILE" build
info "Build complete"

# ---------- 2. Save Docker images ----------
WORK_DIR="$(mktemp -d)"
mkdir -p "$WORK_DIR/$PACKAGE_NAME"

info "Saving Docker images..."
mapfile -t IMAGES < <(parse_images "$COMPOSE_FILE")
EXISTING_IMAGES=()
for img in "${IMAGES[@]}"; do
  if docker image inspect "$img" &>/dev/null; then
    EXISTING_IMAGES+=("$img")
  else
    warn "Image $img not found locally, skipping"
  fi
done

if [ ${#EXISTING_IMAGES[@]} -gt 0 ]; then
  docker save "${EXISTING_IMAGES[@]}" -o "$WORK_DIR/$PACKAGE_NAME/images.tar"
  info "Saved ${#EXISTING_IMAGES[@]} image(s) -> images.tar"
else
  warn "No images found, skipping image export"
fi

# ---------- 3. Collect configuration ----------
info "Copying configuration files..."
CONFIG_DIR="$WORK_DIR/$PACKAGE_NAME/config"
mkdir -p "$CONFIG_DIR"
cp "$COMPOSE_FILE" "$CONFIG_DIR/docker-compose.yaml"
cp "$SCRIPT_DIR/nginx.conf" "$CONFIG_DIR/nginx.conf"

for env_file in "$SCRIPT_DIR/.env" "$SCRIPT_DIR/../backend/.env"; do
  if [ -f "$env_file" ]; then
    base="$(basename "$(dirname "$env_file")")"
    cp "$env_file" "$CONFIG_DIR/${base}.env"
    info "  Copied $(basename "$env_file") from $base/"
  fi
done

# ---------- 4. Generate install script ----------
info "Generating install script..."
# (install.sh content generated by generate_install_script function — see Task 2)

# ---------- 5. Export data (optional) ----------
if [ "$WITH_DATA" -eq 1 ]; then
  info "Copying application data..."
  APP_DATA_DIR="$WORK_DIR/$PACKAGE_NAME/data"
  mkdir -p "$APP_DATA_DIR"

  for sub in "${DATA_DIRS[@]}"; do
    if [ -d "$DATA_DIR/$sub" ]; then
      cp -a "$DATA_DIR/$sub" "$APP_DATA_DIR/$sub"
      info "  Copied $sub/"
    else
      warn "  $sub/ not found, skipping"
    fi
  done

  if [ -d "$DATA_DIR/pg_data" ]; then
    info "Copying PostgreSQL data (requires root)..."
    if [ "$(id -u)" -eq 0 ]; then
      cp -a "$DATA_DIR/pg_data" "$APP_DATA_DIR/pg_data"
    else
      sudo cp -a "$DATA_DIR/pg_data" "$APP_DATA_DIR/pg_data"
    fi
    info "  Copied pg_data/"
  else
    warn "  pg_data/ not found, skipping"
  fi
fi

# ---------- 6. Create archive ----------
info "Creating archive..."
mkdir -p "$OUTPUT_DIR"
ARCHIVE_PATH="$(cd "$OUTPUT_DIR" && pwd)/${PACKAGE_NAME}.tar.gz"
if [ "$(id -u)" -eq 0 ]; then
  tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" "$PACKAGE_NAME"
else
  sudo tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" "$PACKAGE_NAME"
  sudo chown "$(id -u):$(id -g)" "$ARCHIVE_PATH"
fi

ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" | cut -f1)"
info "Package complete: $ARCHIVE_PATH ($ARCHIVE_SIZE)"
echo ""
echo "To install on another machine:"
echo "  1. Copy $(basename "$ARCHIVE_PATH") to the target host"
echo "  2. Run: tar -xzf $(basename "$ARCHIVE_PATH")"
echo "  3. Run: ./databot-package-*/install.sh --install-dir /opt/databot"
```

- [ ] **Step 2: Write the initial test file with stub infrastructure and help/build/save tests**

```bash
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
  sub="${1:-}"
  shift || true
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

  assert_contains "$(cat "$log_file")" "compose build"
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
```

- [ ] **Step 3: Run the tests to see them fail (install.sh generation is not yet wired up)**

Run: `bash docker/tests/package_install_test.sh`
Expected: Tests fail because `generate_install_script` function is not yet implemented in `package.sh`

- [ ] **Step 4: Wire up a minimal `generate_install_script` function placeholder in package.sh**

Add this function to `package.sh` before the `# ---------- 4. Generate install script ----------` section, and replace the comment with a call to it:

```bash
generate_install_script() {
  local target_path="$1"
  cat >"$target_path" <<'INSTALL_EOF'
#!/usr/bin/env bash
# DataBot Install Script (placeholder — full implementation in Task 2)
set -euo pipefail
echo "Install script placeholder"
INSTALL_EOF
  chmod +x "$target_path"
}
```

And in the `# ---------- 4.` section, replace the comment with:

```bash
generate_install_script "$WORK_DIR/$PACKAGE_NAME/install.sh"
```

- [ ] **Step 5: Run tests again to verify the basic package flow passes**

Run: `bash docker/tests/package_install_test.sh`
Expected: All 4 tests pass (help, build called, default package, package with data)

- [ ] **Step 6: Commit**

```bash
git add docker/package.sh docker/tests/package_install_test.sh
git commit -m "feat(docker): add package.sh with build, save, and config packaging"
```

---

### Task 2: Implement the full install.sh generated by package.sh

**Files:**
- Modify: `docker/package.sh` — replace `generate_install_script` placeholder with full implementation
- Test: `docker/tests/package_install_test.sh` — add install.sh tests

- [ ] **Step 1: Add install.sh test cases to the test file**

Add these test functions before the `main()` function in `docker/tests/package_install_test.sh`:

```bash
test_fresh_install_from_extracted_dir() {
  local fixture="$1"
  local stub_bin="$2"
  local log_file
  log_file="$(mktemp)"
  CALL_LOG_FILE="$log_file"

  # Package first
  local output_dir="$fixture/out-fresh"
  mkdir -p "$output_dir"
  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" "$output_dir" >/dev/null 2>&1

  # Extract
  local archive unpack_dir pkg_dir
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"

  # Install
  local install_dir="$fixture/install-fresh"
  mkdir -p "$install_dir"
  PATH="$stub_bin:$PATH" CALL_LOG_FILE="$log_file" "$pkg_dir/install.sh" --install-dir "$install_dir" >/tmp/install-fresh.log 2>&1

  # Files should be in project structure: docker/ and backend/
  assert_file_exists "$install_dir/docker/docker-compose.yaml"
  assert_file_exists "$install_dir/docker/nginx.conf"
  assert_file_exists "$install_dir/docker/.env"
  assert_file_exists "$install_dir/docker/images.tar"
  assert_file_exists "$install_dir/backend/.env"
  assert_file_exists "$install_dir/install.sh"

  local calls
  calls="$(cat "$log_file")"
  assert_contains "$calls" "compose up"
  # Fresh install should NOT call compose down
  assert_not_contains "$calls" "compose down"

  rm -rf "$unpack_dir" "$log_file"
}

test_upgrade_install() {
  local fixture="$1"
  local stub_bin="$2"
  local log_file
  log_file="$(mktemp)"
  CALL_LOG_FILE="$log_file"

  # Package first
  local output_dir="$fixture/out-upgrade"
  mkdir -p "$output_dir"
  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" "$output_dir" >/dev/null 2>&1

  # Extract
  local archive unpack_dir pkg_dir
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"

  # Pre-install (simulate existing installation)
  local install_dir="$fixture/install-upgrade"
  mkdir -p "$install_dir/docker"
  cp "$fixture/docker/docker-compose.yaml" "$install_dir/docker/docker-compose.yaml"

  # Make docker compose ps return running container
  cat >"$stub_bin/docker" <<'STUB_EOF'
#!/usr/bin/env bash
set -euo pipefail
CALL_LOG_FILE="${CALL_LOG_FILE:-/tmp/docker-call-log}"
echo "$*" >> "$CALL_LOG_FILE"

cmd="${1:-}"
shift || true

if [ "$cmd" = "compose" ]; then
  sub="${1:-}"
  shift || true
  case "$sub" in
    build)
      exit 0
      ;;
    ps)
      echo "databot-backend   running"
      exit 0
      ;;
    up|down)
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
  chmod +x "$stub_bin/docker"

  # Install (should detect upgrade)
  > "$log_file"
  PATH="$stub_bin:$PATH" CALL_LOG_FILE="$log_file" "$pkg_dir/install.sh" --install-dir "$install_dir" >/tmp/install-upgrade.log 2>&1

  local calls
  calls="$(cat "$log_file")"
  assert_contains "$calls" "compose down"
  assert_contains "$calls" "compose up"

  rm -rf "$unpack_dir" "$log_file"
}

test_data_skip_on_upgrade() {
  local fixture="$1"
  local stub_bin="$2"
  local log_file
  log_file="$(mktemp)"
  CALL_LOG_FILE="$log_file"

  # Package with data
  local output_dir="$fixture/out-data-skip"
  mkdir -p "$output_dir"
  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" --with-data "$output_dir" >/dev/null 2>&1

  # Extract
  local archive unpack_dir pkg_dir
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"

  # Pre-install with existing .data
  local install_dir="$fixture/install-data-skip"
  mkdir -p "$install_dir/docker" "$install_dir/.data/databot/existing"
  cp "$fixture/docker/docker-compose.yaml" "$install_dir/docker/docker-compose.yaml"

  # Use upgrade stub
  cat >"$stub_bin/docker" <<'STUB_EOF'
#!/usr/bin/env bash
set -euo pipefail
CALL_LOG_FILE="${CALL_LOG_FILE:-/tmp/docker-call-log}"
echo "$*" >> "$CALL_LOG_FILE"

cmd="${1:-}"
shift || true

if [ "$cmd" = "compose" ]; then
  sub="${1:-}"
  shift || true
  case "$sub" in
    build)
      exit 0
      ;;
    ps)
      echo "databot-backend   running"
      exit 0
      ;;
    up|down)
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
  chmod +x "$stub_bin/docker"

  # Install
  > "$log_file"
  PATH="$stub_bin:$PATH" CALL_LOG_FILE="$log_file" "$pkg_dir/install.sh" --install-dir "$install_dir" >/tmp/install-data-skip.log 2>&1

  # Existing data should still exist, package data should NOT be restored
  assert_file_exists "$install_dir/.data/databot/existing"
  [ ! -f "$install_dir/.data/databot/logs/app.log" ] || fail "expected data not to be restored during upgrade"

  rm -rf "$unpack_dir" "$log_file"
}

test_install_requires_install_dir() {
  local fixture="$1"
  local stub_bin="$2"

  local output_dir="$fixture/out-no-dir"
  mkdir -p "$output_dir"
  PATH="$stub_bin:$PATH" "$fixture/docker/package.sh" "$output_dir" >/dev/null 2>&1

  local archive unpack_dir pkg_dir
  archive="$(find "$output_dir" -maxdepth 1 -type f -name 'databot-package-*.tar.gz' | head -n 1)"
  unpack_dir="$(mktemp -d)"
  pkg_dir="$(extract_package_dir "$archive" "$unpack_dir")"

  # Run without --install-dir — should fail
  local rc=0
  PATH="$stub_bin:$PATH" "$pkg_dir/install.sh" >/tmp/install-no-dir.log 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fail "expected install.sh to fail without --install-dir"

  rm -rf "$unpack_dir"
}
```

Add these calls to `main()`:

```bash
  test_fresh_install_from_extracted_dir "$fixture" "$stub_bin"
  test_upgrade_install "$fixture" "$stub_bin"
  test_data_skip_on_upgrade "$fixture" "$stub_bin"
  test_install_requires_install_dir "$fixture" "$stub_bin"
```

- [ ] **Step 2: Run tests to verify they fail (install.sh is still a placeholder)**

Run: `bash docker/tests/package_install_test.sh`
Expected: Fresh install and upgrade tests fail because install.sh is a placeholder

- [ ] **Step 3: Implement the full `generate_install_script` function in package.sh**

Replace the placeholder `generate_install_script` function in `docker/package.sh` with:

```bash
generate_install_script() {
  local target_path="$1"
  cat >"$target_path" <<'INSTALL_EOF'
#!/usr/bin/env bash
#
# DataBot Install Script
# Installs or upgrades DataBot from a package archive or extracted directory.
# Preserves project directory structure (docker/, backend/, .data/).
#
set -euo pipefail

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }
WORK_DIR=""

usage() {
  cat <<'USAGE'
Usage: ./install.sh --install-dir <dir> [archive.tar.gz]

Install or upgrade DataBot from a package archive.

Options:
  -h, --help            打印使用说明
  --install-dir <dir>   目标安装目录（必填）

Arguments:
  archive               databot-package-*.tar.gz 压缩包路径（可选）
                        如不提供，则从当前已解压的包目录安装

Notes:
  - 如果目标环境已有运行中的服务，将执行升级操作（停止 → 更新 → 重启）
  - 升级时数据目录不会被覆盖
USAGE
}

cleanup() {
  if [ -z "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
    return
  fi
  echo "[*] Cleaning up temporary files..."
  rm -rf "$WORK_DIR" 2>/dev/null || true
}

detect_running_services() {
  local compose_file="$1"
  if docker compose -f "$compose_file" ps --services --filter "status=running" 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

INSTALL_DIR=""
ARCHIVE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --install-dir)
      if [ -z "${2:-}" ]; then
        error "--install-dir requires a directory argument"
      fi
      INSTALL_DIR="$2"
      shift 2
      ;;
    -*)
      error "Unknown option: $1"
      ;;
    *)
      if [ -z "$ARCHIVE" ]; then
        ARCHIVE="$1"
      else
        error "Too many arguments"
      fi
      ;;
  esac
  shift
done

if [ -z "$INSTALL_DIR" ]; then
  error "Missing required option: --install-dir"
fi

# ---------- Determine source directory ----------
PKG_DIR=""

if [ -n "$ARCHIVE" ]; then
  if [ ! -f "$ARCHIVE" ]; then
    error "Archive not found: $ARCHIVE"
  fi

  WORK_DIR="$(mktemp -d)"
  trap cleanup EXIT

  info "Extracting archive..."
  tar -xzf "$ARCHIVE" -C "$WORK_DIR"
  PKG_DIR="$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d -name 'databot-package-*' | head -n 1)"
  if [ -z "$PKG_DIR" ] || [ ! -d "$PKG_DIR" ]; then
    error "Invalid archive structure — expected databot-package-* directory inside"
  fi
  info "Extracted: $(basename "$PKG_DIR")"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PKG_DIR="$SCRIPT_DIR"
fi

# ---------- Prepare install directory ----------
INSTALL_DIR="$(mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR" && pwd)"
DOCKER_DIR="$INSTALL_DIR/docker"
BACKEND_DIR="$INSTALL_DIR/backend"
mkdir -p "$DOCKER_DIR" "$BACKEND_DIR"

# ---------- Check for existing installation ----------
COMPOSE_FILE="$DOCKER_DIR/docker-compose.yaml"
IS_UPGRADE=0
if [ -f "$COMPOSE_FILE" ] && detect_running_services "$COMPOSE_FILE"; then
  IS_UPGRADE=1
  info "Detected existing running installation — performing upgrade"
fi

# ---------- Load Docker images ----------
if [ -f "$PKG_DIR/images.tar" ]; then
  info "Loading Docker images..."
  docker load -i "$PKG_DIR/images.tar"
  info "Docker images loaded"
else
  warn "No images.tar found, skipping image import"
fi

# ---------- Stop existing services (upgrade only) ----------
if [ "$IS_UPGRADE" -eq 1 ]; then
  info "Stopping existing services..."
  docker compose -f "$COMPOSE_FILE" down
fi

# ---------- Write configuration files ----------
info "Writing configuration files..."

if [ -f "$PKG_DIR/config/docker-compose.yaml" ]; then
  cp "$PKG_DIR/config/docker-compose.yaml" "$DOCKER_DIR/docker-compose.yaml"
  info "  Written docker/docker-compose.yaml"
fi

if [ -f "$PKG_DIR/config/nginx.conf" ]; then
  cp "$PKG_DIR/config/nginx.conf" "$DOCKER_DIR/nginx.conf"
  info "  Written docker/nginx.conf"
fi

if [ -f "$PKG_DIR/config/docker.env" ]; then
  cp "$PKG_DIR/config/docker.env" "$DOCKER_DIR/.env"
  info "  Written docker/.env"
fi

if [ -f "$PKG_DIR/config/backend.env" ]; then
  cp "$PKG_DIR/config/backend.env" "$BACKEND_DIR/.env"
  info "  Written backend/.env"
fi

# ---------- Copy images.tar to docker/ ----------
if [ -f "$PKG_DIR/images.tar" ]; then
  cp "$PKG_DIR/images.tar" "$DOCKER_DIR/images.tar"
fi

# ---------- Copy install.sh to install dir ----------
cp "$PKG_DIR/install.sh" "$INSTALL_DIR/install.sh"
chmod +x "$INSTALL_DIR/install.sh"

# ---------- Restore data (fresh install only) ----------
if [ "$IS_UPGRADE" -eq 0 ] && [ -d "$PKG_DIR/data" ]; then
  DATA_DIR="$INSTALL_DIR/.data/databot"
  if [ -d "$INSTALL_DIR/.data" ]; then
    warn "Detected existing .data directory, skipping data restore"
  else
    info "Restoring application data..."
    mkdir -p "$DATA_DIR"

    for sub in logs workfolder dictionary knowledge uploads; do
      if [ -d "$PKG_DIR/data/$sub" ]; then
        cp -a "$PKG_DIR/data/$sub" "$DATA_DIR/$sub"
        info "  Restored $sub/"
      fi
    done

    if [ -d "$PKG_DIR/data/pg_data" ]; then
      info "Restoring PostgreSQL data (requires root)..."
      if [ "$(id -u)" -eq 0 ]; then
        cp -a "$PKG_DIR/data/pg_data" "$DATA_DIR/pg_data"
      else
        sudo cp -a "$PKG_DIR/data/pg_data" "$DATA_DIR/pg_data"
      fi
      info "  Restored pg_data/"
    fi
  fi
fi

# ---------- Start services ----------
info "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# ---------- Summary ----------
echo ""
if [ "$IS_UPGRADE" -eq 1 ]; then
  info "Upgrade complete!"
else
  info "Installation complete!"
fi
echo ""
echo "Services are running at: $INSTALL_DIR"
echo ""
if [ "$IS_UPGRADE" -eq 0 ]; then
  echo "NOTE: Review docker/.env and backend/.env for environment-specific"
  echo "      settings (LLM API keys, JWT secrets, etc.)"
fi
INSTALL_EOF

  chmod +x "$target_path"
}
```

- [ ] **Step 4: Run all tests**

Run: `bash docker/tests/package_install_test.sh`
Expected: All 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add docker/package.sh docker/tests/package_install_test.sh
git commit -m "feat(docker): implement full install.sh with fresh install and upgrade support"
```

---

### Task 3: Delete old export.sh and export_load_test.sh

**Files:**
- Delete: `docker/export.sh`
- Delete: `docker/tests/export_load_test.sh`

- [ ] **Step 1: Delete old files**

```bash
git rm docker/export.sh docker/tests/export_load_test.sh
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

Run: `bash docker/tests/package_install_test.sh`
Expected: All 8 tests pass

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(docker): remove old export.sh and export_load_test.sh"
```
