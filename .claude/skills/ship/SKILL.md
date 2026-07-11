---
name: ship
description: Release DomeBreak after /merge lands on main - resolve and tag the release version, build the mac/win installers, publish them to bradley-t-t/domebreak-dist, deploy the game server to the Pi, redeploy the website, and verify everything end to end. Use whenever the user runs /ship or asks to "ship the game", "release the game", "cut a release", "publish the new version", or "push the update to players".
argument-hint: [patch|minor|major|X.Y.Z]
---

# /ship — release DomeBreak

Full release pipeline, run AFTER /merge has promoted develop to main. One version
number — the repo-root `package.json` `version` — drives everything: the git tag,
the installer release, the match server's client gate, the website's download
page, and the `version.json` the game's update check polls.

The ORDER below is deliberate and must not be reshuffled:

1. Installers publish FIRST, so the site's `releases/latest/download` links and
   the update prompt never point at assets that do not exist.
2. The game server deploys SECOND — from the moment it restarts, outdated
   clients are refused at the hello with an update prompt, and the download
   they are sent to is already the new build.
3. The website deploys LAST, flipping `version.json` to the new version only
   once the release is fully real.

Fixed facts:

| Thing | Value |
|---|---|
| Primary checkout (build dir) | `/Users/trentontaylor/WebstormProjects/domebreak` |
| Installer output | `~/DomeBreak-dist` (from `scripts/build-dist.sh`) |
| Windows build box | `trent@192.168.1.85`, key `~/.ssh/sunday_win` (LAN only) |
| Installer host repo | `bradley-t-t/domebreak-dist` (public, assets only — exempt from the develop/main branching workflow) |
| Stable asset names | `DomeBreak-mac.dmg`, `DomeBreak-win.exe` |
| Game server host | The Pi (use the /ssh skill: probe `sunday-pi`, then `sunday`) |
| Server dir on Pi | `/home/sunday/goldendome` (`dist`, `server`, `src`, `public/data`, `package.json`; `.env` is machine-local — NEVER touch it) |
| Server service | `goldendome.service` (systemd, `sunday` has passwordless sudo) |
| Server port / health | `:8790`, `GET /health` returns `{ok, version, matches, ...}` |
| Site deploy | GitHub Actions `release.yml` (push to main + `workflow_dispatch`) → Vercel |
| Site URLs to verify | `https://domebreak.com/version.json`, `https://domebreak.com/download` |

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
- Verify in `~/DomeBreak-dist`: a `.dmg` whose filename contains `$V` and a
  fresh `DomeBreak-Setup.exe` (mtimes newer than when this ship started).
- Normalize to the stable asset names the website links to:

```bash
cp ~/DomeBreak-dist/DomeBreak-"$V"*.dmg ~/DomeBreak-dist/DomeBreak-mac.dmg
cp ~/DomeBreak-dist/DomeBreak-Setup.exe ~/DomeBreak-dist/DomeBreak-win.exe
```

- Side effect to reuse: `scripts/build-dist.sh` ran `vite build`, so `dist/` in
  the build dir is the fresh web client for step 4.

## 3. Publish the release on domebreak-dist

```bash
gh repo view bradley-t-t/domebreak-dist >/dev/null 2>&1 \
  || gh repo create bradley-t-t/domebreak-dist --public --description "DomeBreak release installers"
git log "$LAST..v$V" --pretty='- %s' > /tmp/relnotes.md   # omit if no prior tag
gh release create "v$V" -R bradley-t-t/domebreak-dist \
  --title "DomeBreak v$V" --notes-file /tmp/relnotes.md \
  ~/DomeBreak-dist/DomeBreak-mac.dmg ~/DomeBreak-dist/DomeBreak-win.exe
```

- Re-shipping the same version: `gh release upload "v$V" --clobber ...` instead.
- Verify the stable links resolve to this release:
  `curl -sIL -o /dev/null -w '%{http_code} %{url_effective}\n' https://github.com/bradley-t-t/domebreak-dist/releases/latest/download/DomeBreak-mac.dmg`
  must be `200` with `v$V` in the final URL (same for `DomeBreak-win.exe`).

## 4. Deploy the game server to the Pi

Use the /ssh skill to get a working alias (LAN `sunday-pi` first, Tailscale
`sunday` as fallback). Then:

1. Live-match check: `curl -s localhost:8790/health` on the Pi. If `matches`
   > 0, tell the user how many wars are live and get an explicit go-ahead
   before restarting — a restart kills in-flight matches.
2. Backup: on the Pi,
   `tar czf ~/goldendome-predeploy-$(date +%s).tgz -C ~ --exclude=goldendome/server/node_modules --exclude=goldendome/dist goldendome`.
3. Pack and push from the build dir (never include local node_modules):
   ```bash
   tar czf /tmp/gd-ship.tgz --exclude=server/node_modules dist server src public/data package.json
   scp /tmp/gd-ship.tgz <pi>:/home/sunday/gd-ship.tgz
   ```
4. Swap in place on the Pi (`.env` lives at `goldendome/.env` and is preserved):
   ```bash
   cd ~/goldendome && rm -rf dist server src public/data package.json
   tar xzf ~/gd-ship.tgz -C ~/goldendome && rm ~/gd-ship.tgz
   cd ~/goldendome/server && npm install --omit=dev --no-audit --no-fund
   sudo systemctl enable goldendome && sudo systemctl restart goldendome
   ```
5. Verify: `curl -s localhost:8790/health` returns `ok: true` and
   `version == $V`, and `journalctl -u goldendome -n 5` shows the boot line
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

- `curl -s https://domebreak.com/version.json` → `{"version":"$V"}`
- `https://domebreak.com/download` renders `v$V`.

## 6. Report

Summarize in one block: version and tag, the domebreak-dist release URL, Pi
health JSON (version + match capacity), the site's version.json, and the
workflow run URL. Mention explicitly that outdated clients are now locked out
of multiplayer and will be prompted to update.

## Failure handling

- Any verification miss is a stop-and-report, not a shrug: a half-shipped
  release (tag without installers, site ahead of server) is worse than no ship.
- Safe re-entry: every step is idempotent — re-running /ship for the same `$V`
  re-uses the existing tag, `--clobber`s the release assets, and redeploys
  server and site. When a step fails, fix and re-run from the top.
- Rollback of a bad release: `gh release delete` the new release on
  domebreak-dist (the `latest` links fall back to the previous release), then
  re-deploy the previous tag's `dist`/`server` to the Pi with steps 4's
  commands from a checkout of that tag, and re-run step 5 from a main that
  carries the previous version. Report what happened first — rollback is a
  user decision.
