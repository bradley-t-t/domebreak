#!/usr/bin/env bash
# Deploy the DomeBreak match server to the VPS and verify it.
#
# If ship-dist.sh already staged the payload (/root/gd-ship.tgz on the VPS,
# with /root/gd-ship.version matching), this is a pure in-place swap + restart
# with nothing left to transfer. Otherwise it packs and uploads dist/server/
# src/public/data/package.json itself, so the script also works standalone.
#
# Usage:  scripts/deploy-server.sh <VERSION>
#   Set GD_FORCE=1 to restart even while matches are live (kills them).
set -euo pipefail

V="${1:?usage: deploy-server.sh <VERSION>}"
V="${V#v}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Deploy targets are machine-specific and kept out of the repo. Set them in the
# environment or in scripts/deploy.local.env (gitignored).
[ -f "$REPO/scripts/deploy.local.env" ] && . "$REPO/scripts/deploy.local.env"
VPS="${GD_VPS:?set GD_VPS (e.g. root@your-vps) in the environment or scripts/deploy.local.env}"
VPS_KEY="${GD_VPS_KEY:-$HOME/.ssh/id_ed25519}"
K=(-i "$VPS_KEY" -o ConnectTimeout=15)
SCP=(scp -i "$VPS_KEY" -o ConnectTimeout=15)
HEALTH="https://game.domebreak.com/health"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---- live-match guard -------------------------------------------------------
matches=$(curl -fsS "$HEALTH" 2>/dev/null | node -pe 'JSON.parse(require("fs").readFileSync(0)).matches ?? 0' 2>/dev/null || echo 0)
if [ "${matches:-0}" -gt 0 ] && [ "${GD_FORCE:-0}" != 1 ]; then
  echo "There are $matches live match(es). Restarting kills them." >&2
  echo "Re-run with GD_FORCE=1 once you have the go-ahead." >&2
  exit 2
fi

# ---- ensure a payload is on the VPS -----------------------------------------
staged=$(ssh "${K[@]}" "$VPS" "cat /root/gd-ship.version 2>/dev/null || true" | tr -d '[:space:]')
if [ "$staged" = "$V" ] && ssh "${K[@]}" "$VPS" "test -f /root/gd-ship.tgz"; then
  log "Using payload staged by ship-dist.sh (v$V)"
else
  log "Packing + uploading match-server payload (v$V)"
  tgz="$(mktemp -t gd-server).tgz"
  tar czf "$tgz" -C "$REPO" --exclude=server/node_modules dist server src public/data package.json
  "${SCP[@]}" "$tgz" "$VPS:/root/gd-ship.tgz"
  rm -f "$tgz"
fi

# ---- backup, swap in place, restart -----------------------------------------
log "Backing up current deploy on the VPS"
ssh "${K[@]}" "$VPS" "tar czf /root/domebreak-predeploy-\$(date +%s).tgz -C /root --exclude=domebreak/node_modules --exclude=domebreak/server/node_modules --exclude=domebreak/dist domebreak"

log "Swapping in the new build and restarting"
ssh "${K[@]}" "$VPS" '
  set -e
  cd /root/domebreak
  rm -rf dist server src public/data package.json
  tar xzf /root/gd-ship.tgz -C /root/domebreak
  rm -f /root/gd-ship.tgz /root/gd-ship.version
  cd /root/domebreak/server && npm install --omit=dev --no-audit --no-fund
  systemctl restart domebreak
'

# ---- verify -----------------------------------------------------------------
log "Verifying health"
sleep 2
health=$(curl -fsS "$HEALTH" || true)
echo "$health"
got=$(node -pe 'try{JSON.parse(process.argv[1]).version}catch(e){""}' "$health" 2>/dev/null || echo "")
if [ "$got" != "$V" ]; then
  echo "Health version is '$got', expected '$V'. A null/mismatched version disables the client gate." >&2
  exit 1
fi
ssh "${K[@]}" "$VPS" "journalctl -u domebreak -n 5 --no-pager"
log "Match server live on v$V"
