#!/usr/bin/env bash
#
# DataBot Export Script
# Exports Docker images, persistent data, and configuration into a single archive.
# PostgreSQL data is copied with root privileges to preserve ownership/permissions.
#
# Usage: ./export.sh [output_dir]
#   output_dir  Directory to write the archive (default: current directory)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yaml"
DATA_DIR="$(cd "$SCRIPT_DIR/../.data/databot" 2>/dev/null && pwd || echo "")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${1:-.}"
EXPORT_NAME="databot-export-${TIMESTAMP}"
WORK_DIR="$(mktemp -d)"

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

cleanup() {
  echo "[*] Cleaning up temporary files..."
  # pg_data inside WORK_DIR is owned by postgres uid, needs root to remove
  if [ "$(id -u)" -eq 0 ]; then
    rm -rf "$WORK_DIR"
  else
    sudo rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }

# ---------- preflight checks ----------
if [ ! -f "$COMPOSE_FILE" ]; then
  error "docker-compose.yaml not found at $COMPOSE_FILE"
fi
if [ -z "$DATA_DIR" ] || [ ! -d "$DATA_DIR" ]; then
  warn "Data directory .data/databot not found — only images and config will be exported"
  DATA_DIR=""
fi

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

# Copy .env files if they exist (docker level and backend level)
for env_file in "$SCRIPT_DIR/.env" "$SCRIPT_DIR/../backend/.env"; do
  if [ -f "$env_file" ]; then
    base="$(basename "$(dirname "$env_file")")"
    cp "$env_file" "$CONFIG_DIR/${base}.env"
    info "  Copied $(basename "$env_file") from $base/"
  fi
done

# ---------- 3. Export data ----------
if [ -n "$DATA_DIR" ]; then
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

  # PostgreSQL data requires root to preserve file ownership (postgres uid)
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

# ---------- 4. Create archive ----------
info "Creating archive..."
mkdir -p "$OUTPUT_DIR"
ARCHIVE_PATH="$(cd "$OUTPUT_DIR" && pwd)/${EXPORT_NAME}.tar.gz"
# Use sudo tar because pg_data is owned by the postgres uid and not readable by normal users
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
echo "  1. Copy $EXPORT_NAME.tar.gz to the target host"
echo "  2. Run: ./load.sh $EXPORT_NAME.tar.gz [install_dir]"
