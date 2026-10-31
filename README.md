# BRANDICADE — The Living Arcade

> **Recovery snapshot, not a production deployment source.** The static V1.0.1 archive matches the 14 static assets embedded in the current Worker. The deployed cloud-save and Access layer is not included here. Do not deploy this static build over the existing Worker: doing so could break cloud saves or access.
>
> The archive's LICENSE is MIT, but its Worker build script emits a GPLv3 source notice. That discrepancy needs provenance review before asserting a definitive license for every component. The original notices are preserved.


An original, offline-first, private-personal arcade made for Brandi. The source is open; the profile and game data stay in the browser.

## Current vertical slice
- Responsive cinematic atrium, Games, Glimmer Pop, Brandi Profile, Treasures, Together preview.
- Glimmer Pop: original 7x7 match-three engine, swipe/tap swaps, cascades, special 4+/5+ clears, collectible objectives, 3-star results, 12 named stages with further numbered levels, restart, hints, level map.
- Persistent device-local progression: XP, titles, frames, three avatars, 10 event-driven achievements, statistics, stars, and local backup export/import.
- PWA app shell with offline caching; reduced motion, high contrast, color-assist labels, optional synthesized sound.
- Brandle has two **one-tap launchers** (home and Games library) to its original, working website; its saved progress remains on the original origin. Full in-arcade hosting and shared progression are not yet implemented. See [the Brandle restoration boundary](docs/BRANDLE_RESTORATION.md).

## Local development
Serve the folder at its root (not via `file://`) using a static web server:

```sh
python3 -m http.server 8788
node --test tests/logic.test.mjs
```

This recovered static snapshot has no runtime dependencies, trackers, ads, payment services, third-party libraries or server database. The live application has a separate cloud-save layer not present in this deployable snapshot. The branch also includes **non-deploying** read-only API/D1 adapters and new candidate signed Access-role and transactional save/history modules, tested only with synthetic identities and disposable SQLite. None is connected to the live Worker or its D1 database; authenticated owner acceptance, actual D1 batch tests, encrypted backup/restore, licensing and a safe release remain incomplete. See [read-contract notes](docs/LEGACY_API_READ_RECOVERY.md) and [signed-role/write staging](docs/ACCESS_ATOMIC_WRITE_RECOVERY.md). Uses native ES modules. The game and progress engines are deliberately pure/testable.

## Important boundaries
- This is a **device-local profile**, not a secure cross-device login. Export backups before clearing Safari data or changing phones.
- Brandle runs on its original Cloudflare worker. It retains its own localStorage and statistics; no false shared awards are generated.
- Never edit or deploy the ANEVUM apex worker, the original Brandle worker, or clinical business infrastructure.
- The current design is a working vertical slice, not a finished commercial-scale AAA mobile game. Real-device testing, performance profiling, art/audio refinement, secure authentication if desired, and deeper level balancing remain open.
- Personal content is not included in the repository. Do not place private letters, photos, credentials, or Brandi's saves in public code.

## Files
- `index.html`, `src/styles.css`, `src/app.mjs`: UI and interactions
- `src/engine.mjs`: pure match-three engine
- `src/progression.mjs`: local profile, achievements, backup validation
- `assets/`: original BRANDICADE art
- `sw.js`, `manifest.webmanifest`: installable PWA shell
- `tests/`: engine and browser checks

## Next release gates
1. Real iPhone Safari playthrough and PWA install, including reload and airplane mode.
2. Automated complete win/loss test, multiple device sizes, save backup/restore and storage denial.
3. Add a versioned Brandle export/import path without touching its existing local saves.
4. Polish piece-by-piece swap/cascade animation and match-three difficulty curve, audio and performance.
5. Recover and verify the existing cloud-save and access implementation, resolve source and licensing provenance, and verify backups and rollback before any deployment handover.

## Repository ownership and recovery

This repository is the intended independent source home for BRANDICADE, including its game interface, shared progression, tests and release documentation. The original recovery archive was imported into [draft PR #1](https://github.com/anevum/brandicade/pull/1); the default branch remains a recovery placeholder until the draft has been reviewed and merged.

This branch is **not** an authoritative replacement for the running application. The deployed Worker has separate cloud-save and access logic that is absent from this static archive. Verify authenticated account isolation, source provenance, backups/restoration and release ownership before any production deployment. Preserve existing live game progress. Resolve the original MIT/GPLv3 licensing notices without silently stripping or rewriting them.

Project index: [anevum/anevum](https://github.com/anevum/anevum) · [GitHub reorganization handoff](https://github.com/anevum/anevum/blob/main/handoffs/ANEVUM.OPS.PACKAGE.2026-10-30.002.md)
