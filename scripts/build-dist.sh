#!/usr/bin/env bash
# Build distributable GoldenDome installers for macOS and Windows and collect
# them into one directory on the Mac.
#
#   • macOS (.dmg)  — built locally with electron-builder.
#   • Windows (.exe)— built NATIVELY on the Windows PC over SSH (no Wine), then
#                     pulled back. The PC's repo is refreshed from this source
#                     first so both installers come from identical code.
#
# Usage:  scripts/build-dist.sh [OUTPUT_DIR]
#   OUTPUT_DIR defaults to ~/GoldenDome-dist
#
# Requirements: SSH access to the Windows box (key ~/.ssh/sunday_win), Node on
# both machines. The Windows repo keeps its own .env/.env.local (Supabase creds);
# this script never touches them.
set -euo pipefail

OUT="${1:-$HOME/GoldenDome-dist}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WIN_HOST="${GD_WIN_HOST:-trent@192.168.1.85}"
WIN_KEY="${GD_WIN_KEY:-$HOME/.ssh/sunday_win}"
WIN_REPO='C:\Users\trent\goldendome'
SSH=(ssh -i "$WIN_KEY" -o ConnectTimeout=12)
SCP=(scp -i "$WIN_KEY" -o ConnectTimeout=12)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

mkdir -p "$OUT"
cd "$REPO"

# ---- 1. macOS build -------------------------------------------------------
log "Building macOS installer (.dmg) locally"
npm run electron:build:mac
cp -f release/*.dmg "$OUT"/
log "macOS installer copied to $OUT"

# ---- 2. Refresh Windows PC with current source ----------------------------
log "Syncing current source to Windows ($WIN_HOST)"
TAR="$(mktemp -t gddist).tgz"
tar czf "$TAR" src electron public/icons public/brand public/data \
    index.html package.json package-lock.json vite.config.js eslint.config.js
"${SCP[@]}" "$TAR" "$WIN_HOST:_dist_src.tgz"
rm -f "$TAR"
# Replace code dirs (honors deletions); keep node_modules, public/assets, .env*.
"${SSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "cd '"$WIN_REPO"'; Remove-Item -Recurse -Force src,electron,public\icons,public\brand,public\data -ErrorAction SilentlyContinue; tar -xzf $env:USERPROFILE\_dist_src.tgz; Remove-Item $env:USERPROFILE\_dist_src.tgz"'

# ---- 3. Windows build (native) --------------------------------------------
log "Building Windows installer (.exe) on the PC (native, no Wine)"
"${SSH[@]}" "$WIN_HOST" "cd /d $WIN_REPO && npm install --no-audit --no-fund && npm run electron:build:win"

# ---- 4. Pull the Windows installer back -----------------------------------
log "Collecting Windows installer"
# Copy the freshest release\*.exe to a space-free name, then pull it.
"${SSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "cd '"$WIN_REPO"'; $e = Get-ChildItem release\*.exe | Sort-Object LastWriteTime | Select-Object -Last 1; Copy-Item $e.FullName $env:USERPROFILE\GoldenDome-Setup.exe -Force; Write-Output $e.Name"'
"${SCP[@]}" "$WIN_HOST:GoldenDome-Setup.exe" "$OUT/GoldenDome-Setup.exe"

log "Done. Distributables in $OUT:"
ls -lh "$OUT" | grep -iE 'dmg|exe' || true
