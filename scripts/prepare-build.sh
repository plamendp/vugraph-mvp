#!/usr/bin/env bash
#
# Copies packages/ui into the target app so Docker can build
# with the app directory as its own context (no repo-root context needed).
#
# Usage:
#   ./scripts/prepare-build.sh operator    # prepares apps/operator/
#   ./scripts/prepare-build.sh spectator   # prepares apps/spectator/
#
# What it does:
#   1. Copies packages/ui/src → apps/<app>/_shared/ui/src
#   2. Generates apps/<app>/vite.config.deploy.ts with local alias
#   3. Docker build uses: docker build -f Dockerfile.deploy apps/<app>/
#
# Clean up:
#   rm -rf apps/<app>/_shared

set -euo pipefail

APP_NAME="${1:?Usage: prepare-build.sh <operator|spectator>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$REPO_ROOT/apps/$APP_NAME"
SHARED_DIR="$APP_DIR/_shared/ui"

if [ ! -d "$APP_DIR/src" ]; then
  echo "Error: $APP_DIR/src does not exist" >&2
  exit 1
fi

# Clean previous
rm -rf "$APP_DIR/_shared"

# Copy shared package
mkdir -p "$SHARED_DIR"
cp -r "$REPO_ROOT/packages/ui/src" "$SHARED_DIR/src"
cp "$REPO_ROOT/packages/ui/package.json" "$SHARED_DIR/package.json"

echo "Prepared $APP_NAME build: shared code copied to $SHARED_DIR"
echo "Build with: docker build -f apps/$APP_NAME/Dockerfile.deploy apps/$APP_NAME/"
