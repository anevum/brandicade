# Brandicade legacy API and D1 read-contract recovery — Small Job 041

Status: **clean-room read-only staging code; not connected to any Worker.**
Owning issue: [Brandicade #2](https://github.com/anevum/brandicade/issues/2).

## Evidence checked on October 30, 2026

The live Worker named `brandicade` has the D1 binding `SAVES` and was still on deployment
`53bdf783-a472-486f-b06d-53551696018a` / version
`09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e` when inspected. D1 inspection
used **only** `PRAGMA table_info` and `PRAGMA index_list` to validate the existing
`saves` and `save_history` structure. It did not select, export, or modify
any production player records. Database identifiers, access identities and
credentials are deliberately omitted.

The following public-safe contract was reconstructed from live Worker control
flow and existing schema metadata, not copied as a deployable server bundle.

| Route | Production access | Response contract | This job |
| --- | --- | --- | --- |
| `GET /api/session` | Signed Access JWT, player or admin | `{role,displayName,cloudSaveEnabled}` | Synthetic handler implemented |
| `GET /api/save` | Signed Access JWT, **player only** | `{revision,save,updatedAt}` | Read-only adapter implemented |
| `PUT /api/save` | Signed Access JWT, player only | optimistic-revision write / conflict | **Not implemented; returns 405 in candidate** |
| `GET /api/backups` | Signed Access JWT, player only | `{backups:[{revision,updated_at}]}` | Metadata-only adapter implemented |

The current live Worker validates a Cloudflare Access JWT before authorizing
requests and distinguishes an administrator from the designated player using
an allowlist. The new `createLegacyReadOnlyAPI` intentionally accepts only
an injected, trusted `authorize(request)` function. Its tests use synthetic
identities; **they do not constitute production JWT integration**. The real
authorizer must validate signature, Access issuer/audience, expiration and
the privately held player/admin allowlist before passing the role.

The D1 adapter requires a trusted, server-side `playerRecordKey`, which must
be established explicitly and cannot come from a URL, query parameter, token
subject or request JSON. This preserves the live fixed-record strategy during
read-contract testing. A future identity migration cannot silently re-key
the existing saved record to an Access JWT subject.

## Existing schema — structural metadata only

`saves`: `player_id TEXT PRIMARY KEY`, `revision INTEGER NOT NULL DEFAULT 0`,
`data TEXT NOT NULL DEFAULT '{}'`, `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

`save_history`: `player_id TEXT NOT NULL`, `revision INTEGER NOT NULL`,
`data TEXT NOT NULL`, `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
composite primary key `(player_id,revision)`.

The new read adapter uses parameterized selects against those exact tables
and returns backup **metadata only**. It has no database mutation method.

## Production writer concerns requiring a separate job

The existing live save implementation performs a conditional upsert, a
follow-up revision update and then a history insert as distinct statements.
This sequence needs a controlled concurrency/atomicity test: a history-write
failure could occur after the current save changes, and a conflict must never
silently overwrite another device's revision. These are potential failure
modes, not evidence that Brandi's saved data has already been damaged.

Do **not** wire the draft `server/d1-save-adapter.mjs` into production: it
targets a new table `brandicade_saves_v1` that does not exist in live D1,
uses JWT subjects rather than the established record key, and does not retain
the existing backup-history contract. Do not run schema-changing migrations
or rotate the player key during this source recovery task.

## Files and verification

- `server/legacy-d1-readonly.mjs`: clean-room D1 read adapter with fixed,
  trusted record key; no SQL interpolation or writes.
- `server/legacy-api-readonly.mjs`: fail-closed read-only API dispatcher
  matching the observed safe response shapes; method restrictions and roles.
- `tests/legacy-read-contract.test.mjs`: synthetic data/role tests. Uses no
  production credentials, subjects, emails, database IDs or records.
- Run `node --test tests/legacy-read-contract.test.mjs`; also run the existing
  recovered-source verification suite.
- These files are **not imported** by `build_worker.py` and must remain
  non-deploying until an entirely separate audited Worker entrypoint and
  release owner are established.

## Next bounded jobs

1. Reconcile the duplicated candidate JWT verifiers into one tested
   issuer/audience/email-allowlist integration without publishing the
   actual owner identity configuration.
2. Reconstruct the legacy `PUT /api/save` and `save_history` transaction
   semantics using a disposable SQLite/D1 database and adversarial
   concurrency/error fixtures. Require a reversible migration strategy.
3. Verify privately held encrypted D1 backups and an actual disposable
   restore; do not export private rows to a public repository or logs.
4. Finish licensing/provenance reconciliation (the static archive says MIT
   while its built Worker notice says GPLv3), then complete authenticated
   device tests and production parity before any cutover.
5. Only after a safe release path is proven, verify the Brandle launchers
   from the authenticated Brandicade interface. The launcher PR is not live.

The static recovery branch and live production Worker intentionally remain
independent. A passing read-contract test does not certify full recovery or
authorize a deployment.
