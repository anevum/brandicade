# Brandicade signed-role and atomic-save candidate — Small Job 042

Status: **ISOLATED SOURCE / NOT RELEASED**. Nothing in this module set is bundled by
`build_worker.py` or configured in the production Worker. This is a reviewable
reconstruction using synthetic identities, D1-like fakes, disposable SQLite and isolated real Cloudflare D1/Worker tests completed in Small Job 043,
not a migration of Brandi's existing saves.

## Trust boundary: Cloudflare Access

The branch previously contained two independent RS256 verification algorithms.
`backend/access-jwt.mjs` is now the single verification implementation;
`server/access-jwt.mjs` preserves the older public `{subject}` API by
delegating to it.

`server/access-roles.mjs` maps **signature-verified Access JWT email claims**
to `player` or `admin` using privately supplied, distinct email allowlist
entries. The authorizer verifies the caller-provided JWT from
`cf-access-jwt-assertion`, against the configured Cloudflare team issuer,
application AUD, signature key in a trusted JWKS provider, `iat`/`nbf`/
`exp`, and a nonempty `sub`. Identity and role are never accepted from
a request JSON property, URL or unsigned HTTP header.

Production provisioning must use a verified `https://<team>.cloudflareaccess.com`
issuer, its own `/cdn-cgi/access/certs` key endpoint, current application
AUD, a bounded/cached JWKS retrieval strategy with key rotation, and
**private** player/admin addresses. This staged authorizer accepts a
`jwksProvider` dependency but does **not** fetch production keys or
include emails/AUD/secrets in source. If it cannot verify identity, it denies.
Real Cloudflare Access owner sign-in is not yet tested.

[Cloudflare's Access JWT validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
distinguishes checking a presented header from cryptographically verifying
it. The mere presence of a JWT is never authorization.

## Data boundary: original `saves` and `save_history`

`server/legacy-d1-writer.mjs` stages an **isolated**, optimistic-revision
write method for the *existing* D1 tables. It requires a hardcoded-at-deploy
server-owned legacy player record key and configured expected profile name.
Neither is pulled from a request or Access token.

A write calls **one** D1 `batch([save-write,history-insert])`. The initial
write inserts revision 1 or replaces a legitimate revision-0 placeholder.
An update requires the exact previously observed revision and a matching
previous history snapshot. The immediately following history statement is
guarded by SQLite `changes() = 1` and the saved revision and JSON; it
does not record a history entry for a failed stale write. Both steps use
bound parameters, not string interpolation.

The candidate distinguishes:

- `(1 save change, 1 history change)`: returned new revision.
- `(0,0)`: ordinary optimistic-lock conflict, no write.
- Any database exception, interrupted batch, invalid result or
  unexpected partial change count: **WRITE_OUTCOME_UNKNOWN**, no automatic
  retry, pending reconciliation/restore procedure.

Cloudflare documents that D1 `batch()` executes statements as a
transaction and rolls back the entire sequence if a statement fails:
[official D1 API documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/).
Synthetic SQLite tests exercise SQL under transaction/savepoint semantics.
**Small Job 043 independently verified the same committed SQL on an actual
isolated Cloudflare D1 database, through both D1 REST batches and a temporary
Worker `env.SYNTH_DB.batch()` binding**, including stale writes, concurrent
conflicts, missing history, unique history collisions and rollback on an
injected history failure. The temporary database and Worker were deleted.
See [D1 disposable integration evidence](D1_DISPOSABLE_INTEGRATION_2026-10-30.md).
**The candidate remains NOT production-ready:** actual owner Access acceptance,
production HTTP wiring, backup/restore, rights and rollback are missing.

No schema changes are performed or proposed in this job. The separate
`brandicade_saves_v1` identity migration remains out of scope. The
existing legacy fixed record is left untouched. The candidate does not
wire `PUT /api/save` into the HTTP router: the read-only recovery API
continues refusing all writes.

## Verification

`tests/access-roles.test.mjs` exercises real synthetic RSA signatures,
the player/admin split, forged role/email, wrong issuer/AUD, expiration,
unknown signing key, and unauthorized failure. Never use real owner tokens.

`tests/legacy-d1-writer.test.mjs` checks D1 batch preparation and counts,
client schema/name constraints, server-owned player key, unknown-result
handling and no retry or migration.

`tests/test_legacy_atomic_write.py` executes the **actual JavaScript SQL
strings** in disposable SQLite: initial update, stale write, concurrent
optimistic conflict, missing/corrupt history, rollback upon an injected
history-trigger failure, collision handling, independent player records and
no new tables. All fixtures contain synthetic data.

Run through the PR-only `verify` GitHub Actions workflow:

```sh
node --test tests/access-jwt.test.mjs tests/access-roles.test.mjs tests/legacy-d1-writer.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 build_worker.py
```

The static build remains deliberately independent of the new backend code.

## Remaining before safe production use

1. Validate Access issuer/AUD/JWKS fetch/rotation and configured email
   roles privately, using an authorized owner session and authenticated
   negative-path tests. Do not publish Access identity details.
2. Job 043 verified isolated D1 batches and rollback. Next verify the
   complete signed HTTP save path and database-unavailable behavior under
   authorized staging identities; never bind to production D1.
3. Verify a private encrypted D1 backup and real disposable restore. Confirm
   current legacy saved record/history consistency without exposing records
   or modifying the live table.
4. Resolve MIT/GPLv3 provenance and fully recover runtime source/asset
   lineage. Establish one deploy owner, artifact pinning and a rollback.
5. Only with authorization and verified parity, stage a production-equivalent
   release for the newly reconstructed API/Worker. Do not merge the static
   source over the existing Worker or silently migrate save keys/origins.

This report does not assert that the previous deployed write path is broken,
that any player data was lost, or that these synthetic tests constitute a
validated restoration.

[Brandicade issue #2](https://github.com/anevum/brandicade/issues/2) |
[Draft main recovery PR #1](https://github.com/anevum/brandicade/pull/1) |
[Read-only recovery](LEGACY_API_READ_RECOVERY.md)
