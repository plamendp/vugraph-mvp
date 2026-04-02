#!/usr/bin/env bash
#
# Copies shared packages into the target app/service so Docker can build
# with the app directory as its own context (no repo-root context needed).
#
# Usage:
#   ./scripts/prepare-build.sh operator    # prepares apps/operator/
#   ./scripts/prepare-build.sh spectator   # prepares apps/spectator/
#   ./scripts/prepare-build.sh api         # prepares api/
#
# What it does:
#   - Frontend apps: copies packages/ui + packages/types → apps/<app>/_shared/
#   - Backend (api): copies packages/types → api/_shared/
#
# Clean up:
#   rm -rf <target>/_shared

set -euo pipefail

APP_NAME="${1:?Usage: prepare-build.sh <operator|spectator|api>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

if [ "$APP_NAME" = "api" ]; then
  APP_DIR="$REPO_ROOT/api"
else
  APP_DIR="$REPO_ROOT/apps/$APP_NAME"
fi

if [ ! -d "$APP_DIR/src" ]; then
  echo "Error: $APP_DIR/src does not exist" >&2
  exit 1
fi

# Clean previous
rm -rf "$APP_DIR/_shared"

# Copy packages/types (needed by all targets)
SHARED_TYPES_DIR="$APP_DIR/_shared/types"
mkdir -p "$SHARED_TYPES_DIR"
cp -r "$REPO_ROOT/packages/types/src" "$SHARED_TYPES_DIR/src"
cp "$REPO_ROOT/packages/types/package.json" "$SHARED_TYPES_DIR/package.json"

# Copy packages/ui (frontend apps only)
if [ "$APP_NAME" != "api" ]; then
  SHARED_UI_DIR="$APP_DIR/_shared/ui"
  mkdir -p "$SHARED_UI_DIR"
  cp -r "$REPO_ROOT/packages/ui/src" "$SHARED_UI_DIR/src"
  cp "$REPO_ROOT/packages/ui/package.json" "$SHARED_UI_DIR/package.json"
fi

echo "Prepared $APP_NAME build: shared code copied to $APP_DIR/_shared/"
if [ "$APP_NAME" = "api" ]; then
  echo "Build with: docker build -f api/Dockerfile.deploy api/"
else
  echo "Build with: docker build -f apps/$APP_NAME/Dockerfile.deploy apps/$APP_NAME/"
fi
