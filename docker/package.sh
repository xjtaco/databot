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
        shift
      else
        error "Too many arguments"
      fi
      ;;
  esac
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
        if [ "$(id -u)" -eq 0 ]; then
          cp -a "$PKG_DIR/data/$sub" "$DATA_DIR/$sub"
        else
          sudo cp -a "$PKG_DIR/data/$sub" "$DATA_DIR/$sub"
        fi
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
      if [ "$(id -u)" -eq 0 ]; then
        cp -a "$DATA_DIR/$sub" "$APP_DATA_DIR/$sub"
      else
        sudo cp -a "$DATA_DIR/$sub" "$APP_DATA_DIR/$sub"
      fi
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
