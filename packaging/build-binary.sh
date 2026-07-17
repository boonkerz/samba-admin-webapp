#!/usr/bin/env bash
# Builds a single self-contained executable for the backend (Node "Single
# Executable Application" feature) so the target server needs no Node.js/npm
# install and no internet access to fetch node_modules — only the resulting
# tarball (this binary + frontend/dist + a few helper scripts) is copied over.
#
# Run this on a BUILD machine (this dev checkout), never on the target server.
# packaging/install.sh is what runs on the target and expects this tarball's
# contents already extracted.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$REPO_DIR/packaging/build"
NODE_VERSION="${NODE_VERSION:-v26.4.0}"
NODE_ARCH="linux-x64"
BINARY_NAME="samba-admin-webapp"

# `node --experimental-sea-config` resolves the config's "main"/"output"
# fields relative to the CURRENT WORKING DIRECTORY, not the config file's own
# location — sea-config.json uses paths relative to the repo root, so this
# script must always run from there regardless of the caller's cwd.
cd "$REPO_DIR"

echo "==> Building shared/backend/frontend (tsc + vite)..."
npm run build

mkdir -p "$BUILD_DIR"

echo "==> Bundling backend into a single CommonJS file with esbuild..."
"$REPO_DIR/node_modules/.bin/esbuild" "$REPO_DIR/backend/dist/index.js" \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile="$BUILD_DIR/bundle.cjs"

NODE_BASE_DIR="$BUILD_DIR/node-base"
NODE_TARBALL="node-$NODE_VERSION-$NODE_ARCH.tar.xz"
if [[ ! -x "$NODE_BASE_DIR/node-$NODE_VERSION-$NODE_ARCH/bin/node" ]]; then
  echo "==> Fetching official Node.js $NODE_VERSION ($NODE_ARCH) static binary..."
  mkdir -p "$NODE_BASE_DIR"
  curl -fLo "$NODE_BASE_DIR/$NODE_TARBALL" "https://nodejs.org/dist/$NODE_VERSION/$NODE_TARBALL"
  tar -xJf "$NODE_BASE_DIR/$NODE_TARBALL" -C "$NODE_BASE_DIR"
else
  echo "==> Reusing cached Node.js $NODE_VERSION base binary."
fi

echo "==> Copying base Node binary as the SEA target..."
cp "$NODE_BASE_DIR/node-$NODE_VERSION-$NODE_ARCH/bin/node" "$BUILD_DIR/$BINARY_NAME"
chmod u+w "$BUILD_DIR/$BINARY_NAME"

echo "==> Generating SEA blob..."
node --experimental-sea-config "$REPO_DIR/packaging/sea-config.json"

echo "==> Injecting blob into the binary (postject)..."
"$REPO_DIR/node_modules/.bin/postject" "$BUILD_DIR/$BINARY_NAME" NODE_SEA_BLOB "$BUILD_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite

chmod +x "$BUILD_DIR/$BINARY_NAME"
rm -f "$BUILD_DIR/sea-prep.blob"

echo "==> Assembling distributable tarball..."
DIST_DIR="$REPO_DIR/dist"
mkdir -p "$DIST_DIR"
STAGE_DIR="$BUILD_DIR/stage"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/frontend" "$STAGE_DIR/scripts" "$STAGE_DIR/packaging"

cp "$BUILD_DIR/$BINARY_NAME" "$STAGE_DIR/$BINARY_NAME"
cp -r "$REPO_DIR/frontend/dist" "$STAGE_DIR/frontend/dist"
cp "$REPO_DIR/backend/scripts/"*.py "$STAGE_DIR/scripts/"
# build-admx-cache.py must be reachable at RUNTIME (not just during install.sh)
# — the running app re-invokes it after an admin imports a third-party ADMX
# bundle (Chrome, Adobe, ...), so it needs to live under scriptsDir, not just
# the transient install staging area under packaging/.
cp "$REPO_DIR/packaging/build-admx-cache.py" "$STAGE_DIR/scripts/"
cp "$REPO_DIR/packaging/install.sh" "$STAGE_DIR/packaging/"
cp "$REPO_DIR/packaging/samba-admin-webapp.service" "$STAGE_DIR/packaging/"
cp "$REPO_DIR/packaging/"*.py "$STAGE_DIR/packaging/" 2>/dev/null || true
cp "$REPO_DIR/packaging/"*.sh "$STAGE_DIR/packaging/" 2>/dev/null || true
# Microsoft's own ADMX/ADML installer (not ours to redistribute) — only
# bundled if the person building it dropped a copy in packaging/ themselves,
# see docs/install.md. install.sh's MSI extraction step is best-effort and
# skips cleanly if it's absent.
cp "$REPO_DIR/packaging/"*.msi "$STAGE_DIR/packaging/" 2>/dev/null || true

VERSION=$(node -p "require('$REPO_DIR/package.json').version" 2>/dev/null || echo "0.0.0")
TARBALL="$DIST_DIR/samba-admin-webapp-$VERSION-linux-x64.tar.gz"
tar -czf "$TARBALL" -C "$STAGE_DIR" .

echo "==> Done: $TARBALL"
echo "    Extract on the target and run packaging/install.sh from within it."
