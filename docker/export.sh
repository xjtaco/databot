#!/usr/bin/env bash
#
# DataBot Export Script
# Exports Docker images, configuration, and optionally persistent data into a single archive.
# PostgreSQL data is copied with root privileges to preserve ownership/permissions.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yaml"
DATA_DIR="$(cd "$SCRIPT_DIR/../.data/databot" 2>/dev/null && pwd || echo "")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WITH_DATA=0
OUTPUT_DIR="."
EXPORT_NAME="databot-export-${TIMESTAMP}"
WORK_DIR=""

# All images referenced in docker-compose
IMAGES=(
  "postgres:13"
  "databot-bridge:1.0.0"
  "sandbox-worker:0.1.0"
  "databot-backend:0.1.0"
  "databot-nginx:0.1.0"
)

# Data sub-directories (relative to DATA_DIR)
DATA_DIRS=(logs workfolder dictionary knowledge uploads)

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./export.sh [-h] [--with-data] [output_dir]

Export DataBot Docker images, configuration, and optionally .data into one archive.

Options:
  -h, --help     打印使用说明
  --with-data    导出 .data/databot 数据（默认不导出 .data）

Arguments:
  output_dir     导出压缩包输出目录，默认为当前目录

Notes:
  - 导出时会自动在压缩包中生成 load.sh，用于目标环境导入
  - 如果导出 .data/databot/pg_data，需要 root/sudo 复制以保留权限
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

generate_load_script() {
  local target_path="$1"
  cat >"$target_path" <<'EOF'
#!/usr/bin/env bash
#
# DataBot Load Script
# Loads a DataBot export archive: restores Docker images, configuration, and optional persistent data.
# PostgreSQL data is restored with root privileges to preserve ownership/permissions.
#
set -euo pipefail

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }
WORK_DIR=""

usage() {
  cat <<'USAGE'
Usage: ./load.sh [-h] <archive.tar.gz> [install_dir]

Import DataBot Docker images, configuration, and optional .data from an export archive.

Options:
  -h, --help     打印使用说明

Arguments:
  archive        databot-export-*.tar.gz 压缩包路径
  install_dir    目标安装目录，默认为当前目录

Notes:
  - 如果压缩包内包含 data/ 且目标环境已存在 .data，将跳过数据恢复并打印告警
  - 恢复 pg_data 时需要 root/sudo 保留 PostgreSQL 文件权限
USAGE
}

cleanup() {
  if [ -z "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
    return
  fi
  echo "[*] Cleaning up temporary files..."

  if rm -rf "$WORK_DIR" 2>/dev/null; then
    return
  fi

  if [ "$(id -u)" -ne 0 ]; then
    sudo rm -rf "$WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
}

ARCHIVE=""
INSTALL_DIR="."

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      error "Unknown option: $1"
      ;;
    *)
      if [ -z "$ARCHIVE" ]; then
        ARCHIVE="$1"
      elif [ "$INSTALL_DIR" = "." ]; then
        INSTALL_DIR="$1"
      else
        error "Too many arguments"
      fi
      ;;
  esac
  shift
done

if [ -z "$ARCHIVE" ]; then
  usage
  exit 1
fi

if [ ! -f "$ARCHIVE" ]; then
  error "Archive not found: $ARCHIVE"
fi

WORK_DIR="$(mktemp -d)"
trap cleanup EXIT

# ---------- 1. Extract archive ----------
info "Extracting archive..."
if [ "$(id -u)" -eq 0 ]; then
  tar -xzf "$ARCHIVE" -C "$WORK_DIR"
else
  sudo tar -xzf "$ARCHIVE" -C "$WORK_DIR"
fi

EXPORT_DIR="$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d -name 'databot-export-*' | head -n 1)"
if [ -z "$EXPORT_DIR" ] || [ ! -d "$EXPORT_DIR" ]; then
  error "Invalid archive structure — expected databot-export-* directory inside"
fi
info "Extracted: $(basename "$EXPORT_DIR")"

# ---------- 2. Load Docker images ----------
if [ -f "$EXPORT_DIR/images.tar" ]; then
  info "Loading Docker images (this may take a while)..."
  docker load -i "$EXPORT_DIR/images.tar"
  info "Docker images loaded successfully"
else
  warn "No images.tar found, skipping image import"
fi

# ---------- 3. Restore configuration ----------
INSTALL_DIR="$(mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR" && pwd)"
DOCKER_DIR="$INSTALL_DIR/docker"
mkdir -p "$DOCKER_DIR"

if [ -d "$EXPORT_DIR/config" ]; then
  info "Restoring configuration..."

  for f in docker-compose.yaml nginx.conf; do
    if [ -f "$EXPORT_DIR/config/$f" ]; then
      cp "$EXPORT_DIR/config/$f" "$DOCKER_DIR/$f"
      info "  Restored docker/$f"
    fi
  done

  if [ -f "$EXPORT_DIR/config/docker.env" ]; then
    cp "$EXPORT_DIR/config/docker.env" "$DOCKER_DIR/.env"
    info "  Restored docker/.env"
  fi
  if [ -f "$EXPORT_DIR/config/backend.env" ]; then
    BACKEND_DIR="$INSTALL_DIR/backend"
    mkdir -p "$BACKEND_DIR"
    cp "$EXPORT_DIR/config/backend.env" "$BACKEND_DIR/.env"
    info "  Restored backend/.env"
  fi
else
  warn "No config directory found, skipping config restore"
fi

# ---------- 4. Restore data ----------
DATA_DIR="$INSTALL_DIR/.data/databot"

if [ -d "$EXPORT_DIR/data" ]; then
  if [ -d "$INSTALL_DIR/.data" ]; then
    warn "检测到目标环境已存在 .data，跳过数据恢复"
  else
    info "Restoring application data..."
    mkdir -p "$DATA_DIR"

    for sub in logs workfolder dictionary knowledge uploads; do
      if [ -d "$EXPORT_DIR/data/$sub" ]; then
        cp -a "$EXPORT_DIR/data/$sub" "$DATA_DIR/$sub"
        info "  Restored $sub/"
      fi
    done

    if [ -d "$EXPORT_DIR/data/pg_data" ]; then
      info "Restoring PostgreSQL data (requires root)..."
      if [ "$(id -u)" -eq 0 ]; then
        cp -a "$EXPORT_DIR/data/pg_data" "$DATA_DIR/pg_data"
      else
        sudo cp -a "$EXPORT_DIR/data/pg_data" "$DATA_DIR/pg_data"
      fi
      info "  Restored pg_data/"
    fi
  fi
else
  warn "No data directory found, skipping data restore"
fi

# ---------- 5. Summary ----------
echo ""
info "Import complete!"
echo ""
echo "To start the services:"
echo "  cd $DOCKER_DIR"
echo "  docker compose up -d"
echo ""
echo "NOTE: Review backend/.env and docker/.env for environment-specific"
echo "      settings (LLM API keys, JWT secrets, etc.) before starting."
EOF

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

WORK_DIR="$(mktemp -d)"
mkdir -p "$WORK_DIR/$EXPORT_NAME"

# ---------- 1. Export Docker images ----------
info "Saving Docker images..."
EXISTING_IMAGES=()
for img in "${IMAGES[@]}"; do
  if docker image inspect "$img" &>/dev/null; then
    EXISTING_IMAGES+=("$img")
  else
    warn "Image $img not found locally, skipping"
  fi
done

if [ ${#EXISTING_IMAGES[@]} -gt 0 ]; then
  docker save "${EXISTING_IMAGES[@]}" -o "$WORK_DIR/$EXPORT_NAME/images.tar"
  info "Saved ${#EXISTING_IMAGES[@]} image(s) -> images.tar"
else
  warn "No images found, skipping image export"
fi

# ---------- 2. Export configuration ----------
info "Copying configuration files..."
CONFIG_DIR="$WORK_DIR/$EXPORT_NAME/config"
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

# ---------- 3. Generate import script ----------
info "Generating import script..."
generate_load_script "$WORK_DIR/$EXPORT_NAME/load.sh"

# ---------- 4. Export data ----------
if [ "$WITH_DATA" -eq 1 ]; then
  info "Copying application data..."
  APP_DATA_DIR="$WORK_DIR/$EXPORT_NAME/data"
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

# ---------- 5. Create archive ----------
info "Creating archive..."
mkdir -p "$OUTPUT_DIR"
ARCHIVE_PATH="$(cd "$OUTPUT_DIR" && pwd)/${EXPORT_NAME}.tar.gz"
if [ "$(id -u)" -eq 0 ]; then
  tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" "$EXPORT_NAME"
else
  sudo tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" "$EXPORT_NAME"
  sudo chown "$(id -u):$(id -g)" "$ARCHIVE_PATH"
fi

ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" | cut -f1)"
info "Export complete: $ARCHIVE_PATH ($ARCHIVE_SIZE)"
echo ""
echo "To import on another machine:"
echo "  1. Copy $(basename "$ARCHIVE_PATH") to the target host"
echo "  2. Extract or copy the archive, then run: ./load.sh $(basename "$ARCHIVE_PATH") [install_dir]"
