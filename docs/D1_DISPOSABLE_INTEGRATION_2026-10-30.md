# Small Job 043 — Disposable Cloudflare D1 integration verification

**Status:** Verified against an actual isolated Cloudflare D1 database **and** a temporary Workers runtime; **not deployed to Brandicade production**. Date: October 30, 2026 (America/New_York) / October 31 UTC.

The purpose of this job was to test the exact existing-schema SQL templates in
[`server/legacy-d1-writer.mjs`](../server/legacy-d1-writer.mjs)
against real Cloudflare D1 behavior rather than relying only on SQLite
or fake D1 objects.

## Resource isolation and privacy

- Created a new temporary database named `brandicade_job043_synthetic_20261030`.
  It contained only test identities prefixed `synthetic-`, toy progress values,
  and the original *schema shape* (`saves` / `save_history`).
- Created a separate temporary Worker `brandicade-job043-d1-test` bound **only**
  to that disposable D1 database as `SYNTH_DB`.
- The test Worker was not bound to production `SAVES`, no production
  Cloudflare Access app/policy/route was modified, and no real saved-game
  rows or backup contents were queried.
- The test Worker's public `workers.dev` subdomain was initially disabled.
  It was enabled briefly only for its fixed synthetic-test endpoint, then
  **disabled with readback confirmation**.
- Following the tests, the temporary Worker was deleted first, then the
  disposable D1 database. Fresh Cloudflare list queries verified **both absent**.
  No temporary Worker, database, or publicly accessible test endpoint remains.

No database UUID, Cloudflare API credential, owner email, Access JWT or private
player record key is stored here. Resource names identify only deleted,
synthetic infrastructure.

## Actual Cloudflare D1 results

The D1 REST `/query` **batch** API ran the precise three SQL templates from
`LEGACY_WRITE_SQL` in the reviewed GitHub source. No alternative/upgraded
schema was used.

| Test case | Actual result | Outcome |
| --- | --- | --- |
| Initial save with empty history | `[1,1]` affected rows; revision 1 and history 1 | Pass |
| Duplicate/stale initial save | `[0,0]`; no change to revision or history | Pass |
| Update with expected revision 1 | `[1,1]`; revision and history both advance to 2 | Pass |
| Repeat outdated revision 1 update | `[0,0]`; revision remains 2 | Pass |
| Injected failing history `BEFORE INSERT` trigger | D1 rejected the batch; revision 2 and history count 2 preserved | Pass |
| Two simultaneous initial requests for one synthetic key | One `[1,1]`, one `[0,0]`; exactly one row and history entry | Pass |
| Previous `save_history` row intentionally removed | Next optimistic write `[0,0]`; refused to overwrite inconsistent record | Pass |
| History collision intentionally preseeded | D1 reported a uniqueness error and rolled back the candidate save | Pass |

All statements involved disposable synthetic rows. The race test covers a
concurrent pair submitted to the D1 REST API; it is not a general claim that
all possible distributed network or retry failures have been tested.

### Worker `env.SYNTH_DB.batch()` (separate verification)

A temporary, module-format Worker with the disposable database binding
invoked actual Worker runtime `D1Database.batch()`, using the same SQL
templates. Its test-only endpoint returned:

```json
{
  "pass": true,
  "source": "real Worker env.SYNTH_DB.batch",
  "counts": {
    "initial": [1, 1],
    "stale": [0, 0],
    "update": [1, 1]
  },
  "historyFailureRejected": true,
  "rollbackPreserved": true,
  "finalRevision": 2,
  "historyCount": 2
}
```

The access URL/nonce was a temporary synthetic-test mechanism and was
disabled after the single Worker execution. This result verifies the D1
binding's transactional behavior for these examples, **not** any production
identity, save validation, Access policy or rollout.

## Production readback — unchanged

The active `brandicade` Worker was still on deployment
`53bdf783-a472-486f-b06d-53551696018a`, version
`09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e`, with only its existing
`SAVES` D1 binding.

A metadata-only Access check found exactly one application named
`Brandicade — Private Arcade`, type `self_hosted`, with an application
audience configured, one policy, a 24-hour session duration and public/Worker
destination types. No allowed user identities or JWT values were retrieved
or printed. This metadata is **not** evidence that the reconstructed
`createAccessRoleAuthorizer` accepts real owner tokens or that the existing
policy grants intended access in a logged-in session.

## What was actually proven

- The current SQL templates execute on real D1 through both the REST
  `batch` API and an isolated Worker D1 binding.
- Their tested optimistic-concurrency behavior matches the previous
  synthetic SQLite assertions.
- The history-failure trigger caused a complete rollback on the disposable
  D1 database rather than leaving a newer save without a backup entry.
- The temporary infrastructure was removed, and production stayed unchanged.

## What is still **not** proven

1. Real, owner-authenticated Access JWT validation, protected player/admin
   allowlists and signing-key rotation in a staging identity flow.
2. Compatibility of the *entire* authenticated HTTP `PUT /api/save` path:
   current recovery `server/legacy-api-readonly.mjs` **still returns 405**
   for writes. The candidate writer is intentionally not wired to it.
3. Private encrypted backup and a full **restore rehearsal** for live
   Brandicade data, plus a reviewed legacy player identity strategy.
4. Existing licensing conflict (MIT static archive versus GPLv3 Worker
   notice), provenance and rights for all included source/assets.
5. Mobile/PWA acceptance, origin-specific Brandle progress handling, a
   single deployment owner and a verified live rollback.

These remain hard release blockers tracked in
[Brandicade issue #2](https://github.com/anevum/brandicade/issues/2).
The separate [draft static recovery PR #1](https://github.com/anevum/brandicade/pull/1)
must **remain unmerged** until those gates are independently satisfied.

## Reproduction guardrails

For a future re-test, create a **new**, uniquely named disposable D1 database
and isolated Worker; bind the Worker only to that database; run the committed
`LEGACY_WRITE_SQL` templates using synthetic keys; inspect revision and
history counts after each batch; deliberately fail a history insert;
verify rollback; disable the public endpoint and destroy only the
specifically created disposable Worker and database. Verify cleanup by
separately listing both resource types.

Never run this test against `brandicade-player-saves` or the production
Worker's `SAVES` binding. Never put real user records, Cloudflare tokens,
JWTs, Access policies or database identifiers in public Git history.

The security and CI checks in the repository are verification-only.
This document records **completed isolated integration tests**, not a
production feature release or a credentialed restore.
