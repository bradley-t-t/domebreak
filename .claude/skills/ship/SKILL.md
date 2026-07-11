---
name: ship
description: Release DomeBreak after /merge lands on main - resolve and tag the release version, build the mac/win installers, publish them to download.domebreak.com, deploy the match server to the VPS, redeploy the website, and verify everything end to end. Use whenever the user runs /ship or asks to "ship the game", "release the game", "cut a release", "publish the new version", or "push the update to players".
argument-hint: [patch|minor|major|X.Y.Z]
---

# /ship — release DomeBreak

Full release pipeline, run AFTER /merge has promoted develop to main. One version
number — the repo-root `package.json` `version` — drives everything: the git tag,
the published installers, the match server's client gate, the website's download
page, and the `version.json` the game's update check polls.

Everything self-hosts on one Vultr VPS: Caddy terminates TLS for both
`game.domebreak.com` (reverse proxy to the match server on :8790) and
`download.domebreak.com` (file server over `/srv/domebreak-downloads`). There
is no GitHub release step. The Raspberry Pi is RETIRED as a game host — never
deploy there.

The ORDER below is deliberate and must not be reshuffled:

1. Installers publish FIRST, so the site's download links and the update
   prompt never point at files that do not exist.
2. The match server deploys SECOND — from the moment it restarts, outdated
   clients are refused at the hello with an update prompt, and the download
   they are sent to is already the new build.
3. The website deploys LAST, flipping `version.json` to the new version only
   once the release is fully real.

Fixed facts:

| Thing | Value |
|---|---|
| Primary checkout (build dir) | `/Users/trentontaylor/WebstormProjects/domebreak` |
| Installer output | `~/DomeBreak-dist` (from `scripts/build-dist.sh`) |
| Windows build box | `trent@192.168.1.85`, key `~/.ssh/sunday_win`, repo at `C:\Users\trent\domebreak` (LAN only) |
| VPS (server + downloads) | Vultr, `root@144.202.78.170`, key `~/.ssh/domebreak_vps` (fallback root password in CryptoFort: `domebreak-vps-root-password`) |
| Match server on VPS | `/root/domebreak` (`dist`, `server`, `src`, `public/data`, `package.json`; `.env` is machine-local — NEVER touch it), systemd unit `domebreak.service` |
| Server health | `https://game.domebreak.com/health` (or `localhost:8790/health` on the VPS) returns `{ok, version, matches, ...}` |
| Downloads dir on VPS | `/srv/domebreak-downloads` — one dir per release (`v1.4.0/...`) plus stable root symlinks that the site links to |
| Release artifacts (5) | mac: `DomeBreak-mac-arm64.dmg` (Apple Silicon), `DomeBreak-mac-x64.dmg` (Intel). win: `DomeBreak-win-x64.exe`, `DomeBreak-win-arm64.exe`, `DomeBreak-win-ia32.exe`. These exact names are both the build output (`build/` artifactName templates) and the stable download names. |
| Download URLs | `https://download.domebreak.com/<artifact>` for each of the 5 names above; `https://download.domebreak.com/` browses all versions |
| Caddy config on VPS | `/etc/caddy/Caddyfile` (both site blocks already provisioned; TLS is automatic) |
| DNS | Vercel DNS, managed with the local `vercel` CLI (`vercel dns ls domebreak.com`); `game` and `download` A records point at the VPS |
| Site deploy | GitHub Actions `release.yml` (push to main + `workflow_dispatch`) → Vercel |
| Site URLs to verify | `https://domebreak.com/version.json`, `https://domebreak.com/#/download` (hash-routed SPA; bare `/download` 308s to the hash route) |

## 0. Preflight

- `gh auth status` must be logged in.
- `git fetch origin --tags` in the primary checkout.
- If `git rev-list --count origin/main..origin/develop` > 0, develop has work
  that was never promoted — run the /merge skill first and wait for it to land,
  then re-fetch. /ship releases exactly what is on main.
- The build must run in a checkout of `origin/main` that contains `.env.local`
  (the Supabase client env is baked into the installers at build time).
  Default: the primary checkout — `git status --porcelain` must be clean; then
  `git switch main && git pull --ff-only`. If the primary checkout is dirty or
  mid-work, clone a scratch copy of main instead and copy `.env` / `.env.local`
  into it from the primary checkout before building. Never commit anything to
  main locally.

## 1. Resolve and tag the release version

```bash
V=$(node -p "require('./package.json').version")        # on origin/main
LAST=$(git tag -l 'v*' --sort=-v:refname | head -1)
```

- If tag `v$V` does NOT exist: this is the release version. Tag main and push
  the tag (tags are not blocked by branch protection):
  `git tag "v$V" "$(git rev-parse origin/main)" && git push origin "v$V"`.
- If tag `v$V` ALREADY exists: the version was never bumped since the last
  ship, so bump it now via the normal PR flow (never a direct push):
  1. Pick the next version from the skill argument — `patch` (default),
     `minor`, `major`, or an explicit `X.Y.Z`.
  2. Branch off `origin/develop` (e.g. `release/vNEXT`), run
     `npm version NEXT --no-git-tag-version`, commit `Bump version to NEXT`,
     push, open a PR against develop, enable auto-merge
     (`gh pr merge --auto --squash`), and wait for it to land.
  3. Run the /merge skill to promote develop to main and wait.
  4. Re-fetch, set `V=NEXT`, and tag as above.
- Sanity: `v$V` must now be a tag pointing at `origin/main`'s history.

## 2. Build the installers

From the build dir on main:

```bash
npm ci
scripts/build-dist.sh          # mac .dmg locally, win .exe natively over SSH
```

- The Windows box is LAN-only. If unreachable, stop and report — do not ship a
  mac-only release without being asked to.
- The five artifacts land in `~/DomeBreak-dist` already named for distribution
  (`ARTIFACTS` below) — no renaming step. Confirm all five exist and are newer
  than when this ship started; a missing arch means a build failed (Electron
  can't fetch that arch, etc.) — stop and fix, don't publish a partial matrix.
  ```bash
  ARTIFACTS=(DomeBreak-mac-arm64.dmg DomeBreak-mac-x64.dmg DomeBreak-win-x64.exe DomeBreak-win-arm64.exe DomeBreak-win-ia32.exe)
  for f in "${ARTIFACTS[@]}"; do ls -lh ~/DomeBreak-dist/"$f"; done
  ```
- Side effect to reuse: `scripts/build-dist.sh` ran `vite build`, so `dist/` in
  the build dir is the fresh web client for step 4.
- Signing sanity (mac): each dmg's app is ad-hoc signed by `build/afterPack.cjs`,
  not Developer-ID signed, so a downloaded copy needs a one-time Gatekeeper
  approval — but the seal must be VALID or macOS reports it "damaged" and it
  won't open at all. Verify BOTH mac dmgs before publishing:
  ```bash
  for f in DomeBreak-mac-arm64.dmg DomeBreak-mac-x64.dmg; do
    MP=$(hdiutil attach ~/DomeBreak-dist/"$f" -nobrowse -readonly | grep -o '/Volumes/.*' | head -1)
    codesign --verify --deep --strict "$MP/DomeBreak.app" && echo "$f seal OK"
    hdiutil detach "$MP" -quiet
  done
  ```
  A failure here (`code has no resources...`) means the afterPack hook didn't
  run — stop and fix, do not ship it. Removing the one-time approval entirely
  needs a paid Apple Developer ID + notarization (not configured).

## 3. Publish the installers to download.domebreak.com

Upload all five into a versioned dir, then atomically repoint every stable
symlink — downloads in flight keep working and the stable names never dangle:

```bash
VPS="root@144.202.78.170"
K=(-i ~/.ssh/domebreak_vps)
ARTIFACTS=(DomeBreak-mac-arm64.dmg DomeBreak-mac-x64.dmg DomeBreak-win-x64.exe DomeBreak-win-arm64.exe DomeBreak-win-ia32.exe)
ssh "${K[@]}" "$VPS" "mkdir -p /srv/domebreak-downloads/v$V"
for f in "${ARTIFACTS[@]}"; do scp "${K[@]}" ~/DomeBreak-dist/"$f" "$VPS:/srv/domebreak-downloads/v$V/"; done
git log "$LAST..v$V" --pretty='- %s' | ssh "${K[@]}" "$VPS" "cat > /srv/domebreak-downloads/v$V/RELEASE_NOTES.txt"
for f in "${ARTIFACTS[@]}"; do ssh "${K[@]}" "$VPS" "ln -sfn v$V/$f /srv/domebreak-downloads/$f"; done
```

Verify EACH download from the outside — the user asked that every download
actually work, so check all five: HTTP 200, Content-Length matching the local
file, and the right magic bytes (`MZ` for the Windows PEs; the mac dmgs were
seal-checked in step 2). Any miss is a stop-and-fix.

```bash
for f in "${ARTIFACTS[@]}"; do
  echo "== $f"
  curl -sI "https://download.domebreak.com/$f" | grep -iE '^HTTP|content-length'
  echo "local: $(stat -f%z ~/DomeBreak-dist/"$f")"
  case "$f" in *.exe) [ "$(curl -s -r 0-1 "https://download.domebreak.com/$f" | xxd -p)" = "4d5a" ] && echo "PE magic OK" || echo "BAD PE";; esac
done
```

Disk hygiene: keep the last three release dirs, delete older ones
(`ls -d /srv/domebreak-downloads/v* | sort -V | head -n -3 | xargs rm -rf`).

## 4. Deploy the match server to the VPS

1. Live-match check: `curl -s https://game.domebreak.com/health`. If `matches`
   > 0, tell the user how many wars are live and get an explicit go-ahead
   before restarting — a restart kills in-flight matches.
2. Backup on the VPS:
   `ssh -i ~/.ssh/domebreak_vps root@144.202.78.170 "tar czf /root/domebreak-predeploy-\$(date +%s).tgz -C /root --exclude=domebreak/node_modules --exclude=domebreak/server/node_modules --exclude=domebreak/dist domebreak"`.
3. Pack and push from the build dir (never include local node_modules):
   ```bash
   tar czf /tmp/gd-ship.tgz --exclude=server/node_modules dist server src public/data package.json
   scp -i ~/.ssh/domebreak_vps /tmp/gd-ship.tgz root@144.202.78.170:/root/gd-ship.tgz
   ```
4. Swap in place on the VPS (`.env` lives at `/root/domebreak/.env` and is
   preserved; its `GD_TICK_MS`/`GD_SNAPSHOT_MS` are tuned down for the small
   vCPU — never overwrite it):
   ```bash
   cd /root/domebreak && rm -rf dist server src public/data package.json
   tar xzf /root/gd-ship.tgz -C /root/domebreak && rm /root/gd-ship.tgz
   cd /root/domebreak/server && npm install --omit=dev --no-audit --no-fund
   systemctl restart domebreak
   ```
5. Verify: `curl -s https://game.domebreak.com/health` returns `ok: true` and
   `version == $V`, and `journalctl -u domebreak -n 5` shows the boot line
   `domebreak server v$V ... (clients must match v$V)`. If the version is null,
   the shipped `package.json` is missing its version — fix before moving on,
   because a null version disables the client gate.

## 5. Deploy the website

```bash
gh workflow run release.yml --ref main
gh run list --workflow=release.yml --limit 1   # grab the new run id
gh run watch <id> --exit-status
```

Then verify production:

- `curl -s https://domebreak.com/version.json` → `{"version":"$V"}` — must be a
  direct 200 with `access-control-allow-origin: *` (the apex is the primary
  domain; a redirect here would break the game's cross-origin update check).
- `https://domebreak.com/#/download` renders `v$V` and links to
  `download.domebreak.com`; bare `/download` 308s to the hash route.

## 6. Report

Summarize in one block: version and tag, the download URLs, VPS health JSON
(version + match capacity), the site's version.json, and the workflow run URL.
Mention explicitly that outdated clients are now locked out of multiplayer and
will be prompted to update.

## Failure handling

- Any verification miss is a stop-and-report, not a shrug: a half-shipped
  release (tag without installers, site ahead of server) is worse than no ship.
- Safe re-entry: every step is idempotent — re-running /ship for the same `$V`
  re-uses the existing tag, re-uploads into the same `v$V` dir, repoints the
  same symlinks, and redeploys server and site. When a step fails, fix and
  re-run from the top.
- Rollback of a bad release: repoint all five stable symlinks at the previous
  version dir (`for f in "${ARTIFACTS[@]}"; do ln -sfn vPREV/$f /srv/domebreak-downloads/$f; done`),
  redeploy the previous tag's `dist`/`server` to the VPS with step 4's commands
  from a checkout of that tag, and re-run step 5 from a main that carries the
  previous version. Report what happened first — rollback is a user decision.
