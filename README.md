# Brandicade

Brandicade is an independent personal game collection under development. This repository is the intended source home for its game interface, shared progression, tests, and release documentation.

## Recovery status

**Not yet a complete standalone deployment.** [Draft PR #1](https://github.com/anevum/brandicade/pull/1) recovers a V1.0.1 static application checkpoint and CI-only verification. Its 14 static assets matched the corresponding assets embedded in the observed deployed Worker, but the running Worker's cloud-save and access layer are missing from the recovered archive. Main still contains only this project README.

The archive's MIT license and a GPLv3 notice emitted by its build script conflict. Do not merge or deploy the recovery branch as authoritative until source provenance, redistribution rights, and the resulting license notices are reviewed. Do not silently replace or strip notices.

## Release gates

- Recover and inspect the complete public-safe server source, with credentials, private user records, and live saves excluded.
- Confirm authorization, account isolation, backup and restoration, and access controls.
- Resolve license/attribution provenance, run unit/build/browser tests, and verify mobile playability.
- Establish exactly one deployment owner and a rollback path before cutting over.

Until then, preserve the existing live Worker and original source history. This repository is not a substitute for the running application.

Project index: [anevum/anevum](https://github.com/anevum/anevum) · Organization handoff: [GitHub reorganization](https://github.com/anevum/anevum/blob/main/handoffs/ANEVUM.OPS.PACKAGE.2026-10-30.002.md)
