#!/usr/bin/env bash
#
# DataBot Load Script
# Loads a DataBot export archive: restores Docker images, persistent data, and configuration.
# PostgreSQL data is restored with root privileges to preserve ownership/permissions.
#
# Usage: ./load.sh <archive.tar.gz> [install_dir]
#   archive      Path to the databot-export-*.tar.gz file
#   install_dir  Directory to install into (default: current directory)
#
set -euo pipefail

info()  { echo -e "\033[32m[+]\033[0m $*"; }
warn()  { echo -e "\033[33m[!]\033[0m $*"; }
error() { echo -e "\033[31m[-]\033[0m $*"; exit 1; }

if [ $# -lt 1 ]; then
  echo "Usage: $0 <archive.tar.gz> [install_dir]"
  echo ""
  echo "  archive      Path to the databot-export-*.tar.gz file"
  echo "  install_dir  Directory to install into (default: current directory)"
  exit 1
fi

ARCHIVE="$1"
INSTALL_DIR="${2:-.}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  echo "[*] Cleaning up temporary files..."
  # Archive may contain pg_data owned by postgres uid, needs root to remove
  if [ "$(id -u)" -eq 0 ]; then
    rm -rf "$WORK_DIR"
  else
    sudo rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

if [ ! -f "$ARCHIVE" ]; then
  error "Archive not found: $ARCHIVE"
fi

# ---------- 1. Extract archive ----------
info "Extracting archive..."
# Use sudo tar because the archive contains pg_data owned by postgres uid
if [ "$(id -u)" -eq 0 ]; then
  tar -xzf "$ARCHIVE" -C "$WORK_DIR"
else
  sudo tar -xzf "$ARCHIVE" -C "$WORK_DIR"
fi

# Find the extracted top-level directory
EXPORT_DIR="$(ls -d "$WORK_DIR"/databot-export-* 2>/dev/null | head -1)"
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

  # docker-compose.yaml and nginx.conf go to docker/
  for f in docker-compose.yaml nginx.conf; do
    if [ -f "$EXPORT_DIR/config/$f" ]; then
      cp "$EXPORT_DIR/config/$f" "$DOCKER_DIR/$f"
      info "  Restored docker/$f"
    fi
  done

  # Restore .env files to their original locations
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
  info "Restoring application data..."
  mkdir -p "$DATA_DIR"

  # Application data directories (non-pg)
  for sub in logs workfolder dictionary knowledge uploads; do
    if [ -d "$EXPORT_DIR/data/$sub" ]; then
      if [ -d "$DATA_DIR/$sub" ]; then
        warn "  $sub/ already exists, merging..."
      fi
      cp -a "$EXPORT_DIR/data/$sub" "$DATA_DIR/$sub"
      info "  Restored $sub/"
    fi
  done

  # PostgreSQL data requires root to preserve ownership
  if [ -d "$EXPORT_DIR/data/pg_data" ]; then
    info "Restoring PostgreSQL data (requires root)..."
    if [ -d "$DATA_DIR/pg_data" ]; then
      warn "  pg_data/ already exists — backing up to pg_data.bak"
      if [ "$(id -u)" -eq 0 ]; then
        mv "$DATA_DIR/pg_data" "$DATA_DIR/pg_data.bak.$(date +%s)"
      else
        sudo mv "$DATA_DIR/pg_data" "$DATA_DIR/pg_data.bak.$(date +%s)"
      fi
    fi
    if [ "$(id -u)" -eq 0 ]; then
      cp -a "$EXPORT_DIR/data/pg_data" "$DATA_DIR/pg_data"
    else
      sudo cp -a "$EXPORT_DIR/data/pg_data" "$DATA_DIR/pg_data"
    fi
    info "  Restored pg_data/"
  fi
else
  warn "No data directory found, skipping data restore"
fi

# ---------- 5. Summary ----------
echo ""
info "Import complete!"
echo ""
echo "Restored layout:"
echo "  $INSTALL_DIR/"
echo "  ├── docker/"
echo "  │   ├── docker-compose.yaml"
echo "  │   └── nginx.conf"
echo "  ├── backend/"
echo "  │   └── .env  (if exported)"
echo "  └── .data/databot/"
echo "      ├── pg_data/"
echo "      ├── logs/"
echo "      ├── workfolder/"
echo "      ├── dictionary/"
echo "      ├── knowledge/"
echo "      └── uploads/"
echo ""
echo "To start the services:"
echo "  cd $DOCKER_DIR"
echo "  docker compose up -d"
echo ""
echo "NOTE: Review backend/.env and docker/.env for environment-specific"
echo "      settings (LLM API keys, JWT secrets, etc.) before starting."
