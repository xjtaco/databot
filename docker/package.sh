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
generate_install_script "$WORK_DIR/$PACKAGE_NAME/install.sh"

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
