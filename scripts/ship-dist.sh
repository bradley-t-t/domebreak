#!/usr/bin/env bash
# Pipelined build + publish for a DomeBreak release.
#
# Where build-dist.sh builds all five installers and THEN a separate step
# uploads them one at a time, this script overlaps the two: every artifact is
# uploaded to the VPS the moment it finishes building, the mac and Windows
# builds run on their two machines concurrently, and the uploads run in
# parallel. Wall-clock collapses from "build-all + upload-all" to roughly
# "slowest single machine's build + its last upload".
#
# It also stages the match-server payload to the VPS in the background while the
# installers are still building, so the later server deploy (deploy-server.sh)
# is just an in-place swap + restart with nothing left to transfer.
#
# Usage:  scripts/ship-dist.sh <VERSION> [OUTPUT_DIR]
#   VERSION     release version WITHOUT the leading v (e.g. 1.11.2)
#   OUTPUT_DIR  where the built installers are collected (default ~/DomeBreak-dist)
#
# Exit 0 only when all five artifacts built, uploaded, and verified in the
# versioned dir AND the stable symlinks were repointed. Any miss leaves the
# stable symlinks untouched (players unaffected) and exits non-zero to stop the
# ship. Re-running for the same VERSION is safe and idempotent.
set -euo pipefail

V="${1:?usage: ship-dist.sh <VERSION> [OUTPUT_DIR]}"
V="${V#v}"
OUT="${2:-$HOME/DomeBreak-dist}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VPS="${GD_VPS:-root@144.202.78.170}"
VPS_KEY="${GD_VPS_KEY:-$HOME/.ssh/domebreak_vps}"
DL_ROOT="/srv/domebreak-downloads"
DL_BASE="https://download.domebreak.com"

WIN_HOST="${GD_WIN_HOST:-trent@192.168.1.85}"
WIN_KEY="${GD_WIN_KEY:-$HOME/.ssh/sunday_win}"
WIN_REPO='C:\Users\trent\domebreak'
WIN_ARCHES=(x64 arm64 ia32)

MAC_ARTIFACTS=(DomeBreak-mac-arm64.dmg DomeBreak-mac-x64.dmg)
WIN_ARTIFACTS=(DomeBreak-win-x64.exe DomeBreak-win-arm64.exe DomeBreak-win-ia32.exe)
ALL_ARTIFACTS=("${MAC_ARTIFACTS[@]}" "${WIN_ARTIFACTS[@]}")

K=(-i "$VPS_KEY" -o ConnectTimeout=15)
SCP_VPS=(scp -i "$VPS_KEY" -o ConnectTimeout=15)
WSSH=(ssh -i "$WIN_KEY" -o ConnectTimeout=15)
WSCP=(scp -i "$WIN_KEY" -o ConnectTimeout=15)
EB="$REPO/node_modules/.bin/electron-builder"

STATUS="$(mktemp -d -t gd-ship-status)"
LOGS="$(mktemp -d -t gd-ship-logs)"
trap 'rm -rf "$STATUS" "$LOGS"' EXIT

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }

# ---- publish one artifact to the versioned dir and verify it ----------------
# Records OK / FAIL <reason> into $STATUS/<name>. Never aborts the caller: a
# failure is collected at the end so one bad arch cannot leave the release
# half-flipped. Intended to be backgrounded ( publish ... & ).
publish() {
  local src="$1" name="$2"
  local vurl="$DL_BASE/v$V/$name"
  local local_sz hdr remote_len
  {
    if [ ! -f "$src" ]; then echo "FAIL missing-local $src" >"$STATUS/$name"; return 0; fi
    local_sz=$(stat -f%z "$src")
    if ! "${SCP_VPS[@]}" "$src" "$VPS:$DL_ROOT/v$V/$name"; then
      echo "FAIL scp" >"$STATUS/$name"; return 0
    fi
    # Force world-readable: the Windows exes are pulled to the Mac as mode 700
    # (-rwx------), and scp can carry that through, leaving Caddy unable to read
    # the file (403). Never rely on the source mode for a served artifact.
    if ! ssh "${K[@]}" "$VPS" "chmod 644 $DL_ROOT/v$V/$name"; then
      echo "FAIL chmod" >"$STATUS/$name"; return 0
    fi
    hdr=$(curl -fsSI "$vurl" 2>/dev/null || true)
    if ! grep -qiE '^HTTP/.* 200' <<<"$hdr"; then
      echo "FAIL http $(grep -iE '^HTTP' <<<"$hdr" | head -1 | tr -d '\r')" >"$STATUS/$name"; return 0
    fi
    remote_len=$(grep -iE '^content-length' <<<"$hdr" | tr -dc '0-9')
    if [ "$remote_len" != "$local_sz" ]; then
      echo "FAIL size local=$local_sz remote=$remote_len" >"$STATUS/$name"; return 0
    fi
    case "$name" in
      *.exe)
        if [ "$(curl -fsS -r 0-1 "$vurl" | xxd -p 2>/dev/null)" != "4d5a" ]; then
          echo "FAIL pe-magic" >"$STATUS/$name"; return 0
        fi ;;
    esac
    echo OK >"$STATUS/$name"
    printf '\033[1;32m[up]  %s verified (%s bytes)\033[0m\n' "$name" "$local_sz"
  } >>"$LOGS/$name.log" 2>&1
}

# ---- mac dmg seal check (must be valid or macOS calls it "damaged") ----------
seal_ok() {
  local dmg="$1" mp rc=0
  mp=$(hdiutil attach "$dmg" -nobrowse -readonly 2>/dev/null | grep -o '/Volumes/.*' | head -1)
  [ -n "$mp" ] || return 1
  codesign --verify --deep --strict "$mp/DomeBreak.app" 2>/dev/null || rc=1
  hdiutil detach "$mp" -quiet 2>/dev/null || true
  return $rc
}

# ---- Windows phase: sync source, build each arch, upload as each finishes ----
win_phase() {
  set -euo pipefail
  log "Windows: syncing source to $WIN_HOST"
  local tar; tar="$(mktemp -t gddist).tgz"
  tar czf "$tar" -C "$REPO" src electron scripts build public/icons public/brand public/data \
      index.html package.json package-lock.json vite.config.js eslint.config.js
  "${WSCP[@]}" "$tar" "$WIN_HOST:_dist_src.tgz"
  rm -f "$tar"
  "${WSSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "cd '"$WIN_REPO"'; Remove-Item -Recurse -Force src,electron,scripts,build,public\icons,public\brand,public\data -ErrorAction SilentlyContinue; tar -xzf $env:USERPROFILE\_dist_src.tgz; Remove-Item $env:USERPROFILE\_dist_src.tgz"'

  log "Windows: installing deps + vite build (once)"
  "${WSSH[@]}" "$WIN_HOST" "cd /d $WIN_REPO && npm install --no-audit --no-fund && npm run build"

  local a exe
  for a in "${WIN_ARCHES[@]}"; do
    exe="DomeBreak-win-$a.exe"
    log "Windows: packaging $a"
    "${WSSH[@]}" "$WIN_HOST" "cd /d $WIN_REPO && npx --yes electron-builder --win --$a --publish never"
    "${WSSH[@]}" "$WIN_HOST" 'powershell -NoProfile -Command "Copy-Item '"$WIN_REPO"'\release\'"$exe"' $env:USERPROFILE\'"$exe"' -Force"'
    "${WSCP[@]}" "$WIN_HOST:$exe" "$OUT/$exe"
    # Upload this arch while the next one builds.
    publish "$OUT/$exe" "$exe" &
  done
  wait
}

# ---- mac phase: vite once, then package + upload each arch -------------------
mac_phase() {
  set -euo pipefail
  log "mac: vite build"
  ( cd "$REPO" && npm run build )

  # Stage the match-server payload to the VPS now, in the background, so the
  # later server deploy has nothing left to transfer (overlap the tail).
  stage_server_payload &

  local a dmg
  for a in arm64 x64; do
    dmg="DomeBreak-mac-$a.dmg"
    log "mac: packaging $a"
    ( cd "$REPO" && "$EB" --mac --"$a" --publish never )
    cp -f "$REPO/release/$dmg" "$OUT/$dmg"
    if seal_ok "$OUT/$dmg"; then
      publish "$OUT/$dmg" "$dmg" &     # upload arm64 while x64 builds
    else
      echo "FAIL seal-invalid" >"$STATUS/$dmg"
      warn "$dmg failed its codesign seal — will not publish"
    fi
  done
}

# ---- background: stage server payload to VPS (used by deploy-server.sh) ------
stage_server_payload() {
  {
    local tgz; tgz="$(mktemp -t gd-server).tgz"
    tar czf "$tgz" -C "$REPO" --exclude=server/node_modules dist server src public/data package.json
    if "${SCP_VPS[@]}" "$tgz" "$VPS:/root/gd-ship.tgz"; then
      ssh "${K[@]}" "$VPS" "echo $V > /root/gd-ship.version" || true
    fi
    rm -f "$tgz"
    printf '\033[1;32m[stage] match-server payload staged on VPS (/root/gd-ship.tgz)\033[0m\n'
  } >>"$LOGS/server-stage.log" 2>&1
}

mkdir -p "$OUT"
log "Preflight: VPS reachable + versioned dir"
ssh "${K[@]}" "$VPS" "mkdir -p $DL_ROOT/v$V"

# Kick both machines off concurrently. Windows is the long pole, so start it
# first and let mac run alongside it.
win_phase & WIN_PID=$!
mac_phase

log "Waiting for all builds + uploads to finish"
wait "$WIN_PID" || true
wait   # any remaining background publishes / staging

# ---- gate: every artifact must have verified OK -----------------------------
FAILED=0
for name in "${ALL_ARTIFACTS[@]}"; do
  st="$(cat "$STATUS/$name" 2>/dev/null || echo 'FAIL no-status')"
  if [ "$st" = OK ]; then
    printf '  \033[1;32mOK\033[0m   %s\n' "$name"
  else
    printf '  \033[1;31mFAIL\033[0m %s — %s\n' "$name" "$st"
    if [ -s "$LOGS/$name.log" ]; then sed 's/^/       | /' "$LOGS/$name.log"; fi
    FAILED=1
  fi
done
if [ "$FAILED" -ne 0 ]; then
  echo
  echo "One or more artifacts failed to build/upload/verify. Stable download" >&2
  echo "links were NOT repointed — players are unaffected. Fix and re-run." >&2
  exit 1
fi

# ---- flip stable symlinks atomically, then verify from the outside ----------
log "Repointing stable symlinks -> v$V"
FLIP=""
for name in "${ALL_ARTIFACTS[@]}"; do FLIP+="ln -sfn v$V/$name $DL_ROOT/$name; "; done
ssh "${K[@]}" "$VPS" "$FLIP"

log "Verifying stable download URLs"
for name in "${ALL_ARTIFACTS[@]}"; do
  code=$(curl -fsS -o /dev/null -w '%{http_code}' -I "$DL_BASE/$name" || echo 000)
  if [ "$code" = 200 ]; then printf '  \033[1;32m200\033[0m  %s/%s\n' "$DL_BASE" "$name"
  else printf '  \033[1;31m%s\033[0m  %s/%s\n' "$code" "$DL_BASE" "$name"; FAILED=1; fi
done
[ "$FAILED" -eq 0 ] || { echo "Stable URL verification failed after symlink flip." >&2; exit 1; }

# ---- release notes + keep-last-3 hygiene ------------------------------------
LAST=$(git -C "$REPO" tag -l 'v*' --sort=-v:refname | grep -vxF "v$V" | head -1 || true)
if [ -n "$LAST" ]; then
  git -C "$REPO" log "$LAST..v$V" --pretty='- %s' 2>/dev/null \
    | ssh "${K[@]}" "$VPS" "cat > $DL_ROOT/v$V/RELEASE_NOTES.txt" || true
fi
ssh "${K[@]}" "$VPS" "ls -d $DL_ROOT/v* | sort -V | head -n -3 | xargs -r rm -rf" || true

log "Installers published and verified for v$V"
echo "  versioned: $DL_BASE/v$V/"
for name in "${ALL_ARTIFACTS[@]}"; do echo "  stable:    $DL_BASE/$name"; done
