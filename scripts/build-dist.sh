#!/usr/bin/env bash
# Build every distributable DomeBreak installer and collect them in one dir on
# the Mac.
#
#   • macOS (.dmg)  — Apple Silicon (arm64) and Intel (x64), built locally with
#                     electron-builder. artifactName -> DomeBreak-mac-<arch>.dmg.
#   • Windows (.exe)— x64, ARM64, and 32-bit (ia32), built NATIVELY on the
#                     Windows PC over SSH (no Wine), one electron-builder run per
#                     arch so each yields its own installer. artifactName ->
#                     DomeBreak-win-<arch>.exe. The PC's repo is refreshed from
#                     this source first so every installer comes from identical
#                     code.
#
# Usage:  scripts/build-dist.sh [OUTPUT_DIR]
#   OUTPUT_DIR defaults to ~/DomeBreak-dist
#
# Requirements: SSH access to the Windows box (host/key via GD_WIN_HOST /
# GD_WIN_KEY), Node on both machines. The Windows repo keeps its own
# .env/.env.local (Supabase creds);
# this script never touches them.
set -euo pipefail

OUT="${1:-$HOME/DomeBreak-dist}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Deploy targets are machine-specific and kept out of the repo. Set them in the
# environment or in scripts/deploy.local.env (gitignored).
[ -f "$REPO/scripts/deploy.local.env" ] && . "$REPO/scripts/deploy.local.env"
WIN_HOST="${GD_WIN_HOST:?set GD_WIN_HOST (e.g. user@build-box) in the environment or scripts/deploy.local.env}"
WIN_KEY="${GD_WIN_KEY:-$HOME/.ssh/id_ed25519}"
WIN_REPO="${GD_WIN_REPO:?set GD_WIN_REPO (the repo path on the Windows build box)}"
WIN_ARCHES=(x64 arm64 ia32)
SSH=(ssh -i "$WIN_KEY" -o ConnectTimeout=12)
SCP=(scp -i "$WIN_KEY" -o ConnectTimeout=12)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

mkdir -p "$OUT"
cd "$REPO"

# ---- 1. macOS builds (arm64 + x64) ----------------------------------------
log "Building macOS installers (.dmg) locally — Apple Silicon + Intel"
npm run electron:build:mac
cp -f release/DomeBreak-mac-*.dmg "$OUT"/
log "macOS installers copied to $OUT"

# ---- 2. Refresh Windows PC with current source ----------------------------
log "Syncing current source to Windows ($WIN_HOST)"
TAR="$(mktemp -t gddist).tgz"
# scripts/ runs npm's postinstall (dev-brand-electron.cjs); build/ holds the
# electron-builder resources — icons AND the afterPack signing hook, which
# electron-builder loads on every platform (it early-returns off darwin).
tar czf "$TAR" src electron scripts build public/icons public/brand public/data \
    index.html package.json package-lock.json vite.config.js eslint.config.js
"${SCP[@]}" "$TAR" "$WIN_HOST:_dist_src.tgz"
rm -f "$TAR"
# Replace code dirs (honors deletions); keep node_modules, public/assets, .env*.
"${SSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "cd '"$WIN_REPO"'; Remove-Item -Recurse -Force src,electron,scripts,build,public\icons,public\brand,public\data -ErrorAction SilentlyContinue; tar -xzf $env:USERPROFILE\_dist_src.tgz; Remove-Item $env:USERPROFILE\_dist_src.tgz"'

# ---- 3. Windows builds (native, one installer per arch) --------------------
# vite build once, then package each arch separately — a single multi-arch NSIS
# run collapses into one combined installer, but we want a distinct download per
# arch. --publish=never keeps electron-builder from trying to upload anywhere.
log "Building Windows installers (.exe) on the PC — ${WIN_ARCHES[*]}"
WIN_BUILD="cd /d $WIN_REPO && npm install --no-audit --no-fund && npm run build"
for a in "${WIN_ARCHES[@]}"; do
    WIN_BUILD="$WIN_BUILD && npx --yes electron-builder --win --$a --publish never"
done
"${SSH[@]}" "$WIN_HOST" "$WIN_BUILD"

# ---- 4. Pull the Windows installers back ----------------------------------
# Stage each build into the home dir first so scp fetches by a simple
# home-relative name (Windows OpenSSH scp is unreliable with absolute paths).
log "Collecting Windows installers"
for a in "${WIN_ARCHES[@]}"; do
    "${SSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "Copy-Item '"$WIN_REPO"'\release\DomeBreak-win-'"$a"'.exe $env:USERPROFILE\DomeBreak-win-'"$a"'.exe -Force"'
    "${SCP[@]}" "$WIN_HOST:DomeBreak-win-$a.exe" "$OUT/DomeBreak-win-$a.exe"
done

log "Done. Distributables in $OUT:"
ls -lh "$OUT" | grep -iE 'DomeBreak-(mac|win)-' || true
