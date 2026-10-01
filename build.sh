#!/usr/bin/env bash
# Build the .vsix package from the current sources.
# Usage: ./build.sh [--install]   (--install also installs it into VS Code)
set -euo pipefail

cd "$(dirname "$0")"

# Install dependencies (includes @vscode/vsce) if missing.
if [ ! -d node_modules ]; then
    npm ci
fi

# Remove previous packages so only the latest one remains.
rm -f ./*.vsix

# vsce runs "vscode:prepublish" (tsc compile) before packaging.
npx vsce package

VSIX="$(ls ./*.vsix)"
echo "Built: $VSIX"

if [ "${1:-}" = "--install" ]; then
    code --install-extension "$VSIX" --force
fi
