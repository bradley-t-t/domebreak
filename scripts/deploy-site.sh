#!/usr/bin/env bash
# Deploy the DomeBreak website (Vercel via GitHub Actions) and verify prod.
# Run LAST — this flips version.json to the new version, which is the signal
# clients treat as "the release is fully live".
#
# Usage:  scripts/deploy-site.sh <VERSION>
set -euo pipefail

V="${1:?usage: deploy-site.sh <VERSION>}"
V="${V#v}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "Triggering release.yml on main"
gh workflow run release.yml --ref main
# Give GitHub a moment to register the run, then grab its id.
for _ in 1 2 3 4 5; do
  RID=$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
  [ -n "${RID:-}" ] && break
  sleep 2
done
[ -n "${RID:-}" ] || { echo "Could not find the workflow run id." >&2; exit 1; }
log "Watching run $RID"
gh run watch "$RID" --exit-status

log "Verifying production"
vj=$(curl -fsS "https://domebreak.com/version.json" || true)
echo "version.json: $vj"
got=$(node -pe 'try{JSON.parse(process.argv[1]).version}catch(e){""}' "$vj" 2>/dev/null || echo "")
if [ "$got" != "$V" ]; then
  echo "version.json is '$got', expected '$V'." >&2
  exit 1
fi
# The apex must answer version.json directly (200, CORS *) — a redirect breaks
# the game's cross-origin update check.
hdr=$(curl -fsSI "https://domebreak.com/version.json" || true)
grep -qiE '^HTTP/.* 200' <<<"$hdr" || { echo "version.json is not a direct 200:" >&2; echo "$hdr" >&2; exit 1; }
grep -qiE '^access-control-allow-origin: \*' <<<"$hdr" || echo "[warn] missing CORS * on version.json"

log "Website live on v$V"
