# Brandle inside Brandicade — recovery and integration boundary

Status: **one-tap launcher staged in draft recovery PR #1; no production deployment or source ownership cutover.**

## Observed on October 30, 2026

The original Brandle word game is live at
[BRANDLE — The Glimmer Grove](https://brandle-glimmer-grove.devonakins.workers.dev/).
An unauthenticated browser-rendered load produced its 6×5 board and 28-key
keyboard. The existing Cloudflare Worker for Brandicade is protected by Access,
so a guest browser cannot inspect Brandi's authenticated arcade experience.

Read-only inspection of the currently deployed `brandicade` Worker decoded the
embedded `/index.html` and `/src/app.mjs` **without reading D1 records or
private saves**. It confirmed two Brandle cards (home and library), with the
original implementation opening a modal followed by a link to Brandle's
separate origin. That is *discovery*, not an in-app playable integration.
The recovered V1.0.1 static source remains in draft PR #1; `main` has only
README content and is not a deployable representation of the live Worker.

## Safe incremental restoration

The recovery branch now uses native, keyboard-accessible links in **both**
existing Brandle game cards:

- One tap/click opens the **existing** game on its unchanged origin, in a new
  tab, without requiring Brandicade's JavaScript event handler or modal.
- `rel="noopener noreferrer"` isolates the external window.
- No iframe is used: Brandle's existing Worker deliberately sends
  `X-Frame-Options: DENY`. An iframe would not be a working implementation.
- No silent origin switch or progress import is attempted. Existing Brandle
  `localStorage` data stays at the current domain, and Brandicade does not
  fabricate cross-game achievements.
- The old modal handler is retained for older cached Brandicade HTML.
- Dedicated `node --test tests/brandle-link.test.mjs` checks both launchers,
  the exact URL, isolation attributes and truthful progress boundary.

**This is a branch-only improvement.** It is not yet visible to the
authenticated production user, because deploying the recovered static Worker
would replace the running Access/D1 save layer.

## What a genuinely integrated game requires

1. Restore Brandicade's authoritative, public-safe server source from the
   existing live Worker, without exporting player records or credentials.
   Reconcile Access JWT verification, `/api/session`, `/api/save` and
   `/api/backups`, the existing `saves`/`save_history` D1 schema, and the
   hardcoded legacy player identifier before a cutover.
2. Resolve the original static archive's **MIT versus GPLv3 provenance**.
   Preserve both existing notices until rights are established.
3. Decide between keeping Brandle an independent origin (preserving its
   local-only progress and release owner) or publishing a separate same-origin
   game route under Brandicade. The latter cannot automatically read existing
   Brandle localStorage; explicit portable export/import with consent and
   conflict-safe validation is required.
4. If same-origin, give Brandle its own scoped service worker, cache and
   resource paths, and test reload, offline, web-app mode and browser back
   navigation. Do not change the original Brandle production deployer during
   migration.
5. Verify on Brandi's actual authenticated iPhone/PWA session that both game
   launchers work, saves survive reload and cross-device backups are
   recoverable. Validate authenticated server and D1 restore before enabling a
   single controlled production deployment owner.

## Acceptance criteria before marking restored

- Home and Games library both expose Brandle with a reliable play action.
- Brandle actually plays on the intended device without frame, navigation,
  popup, CSP or offline-cache failures.
- Previously saved daily/endless stats remain unchanged unless the player
  explicitly imports them, with a verified backup.
- Cloud-save and Access in Brandicade still function after release.
- The complete public-safe source, tests, license notices, deployment owner,
  current version, backup and rollback are documented in the owning repo.

Related: [Brandicade recovery PR #1](https://github.com/anevum/brandicade/pull/1),
[Brandle repository](https://github.com/anevum/brandle),
[GitHub portfolio backlog](https://github.com/anevum/anevum/blob/main/CLOSEOUT_BACKLOG_2026-10-30.md).
