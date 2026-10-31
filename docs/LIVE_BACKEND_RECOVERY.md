# BRANDICADE live backend recovery inventory — 2026-10-30

**Status: investigation only. Never deploy the static recovery build to the live Worker.**

## Verified observations

- The running Cloudflare Worker script is `brandicade`. At inspection its newest listed deployment was `53bdf783-a472-486f-b06d-53551696018a`, 100% assigned to version `09c8dcb9-3db4-47c4-b7be-b9a218a7ba1e` (2026-10-30 02:53 UTC). Reconfirm before any action.
- The Worker settings have a D1 binding named `SAVES`; the static archive has no equivalent deployed D1/Access backend. Do not publish the database identifier, schema rows, or access configuration.
- Read-only inspection of the Worker script showed embedded static assets **and** server logic referencing `cf-access-jwt-assertion`, `env.SAVES`, and routes `/api/session`, `/api/save`, and `/api/backups`. The save route distinguishes GET and PUT, and backups include GET. Observed SQL operations include SELECT, INSERT and UPDATE.
- There are three retained deployment versions in the Cloudflare version listing, but no rollback rehearsal has been performed.
- GitHub `anevum/brandicade` has only `main` and draft `recovery/static-v101-20261030`; the draft contains 14 static assets and tests. GitHub default-branch code search did not locate this server source. No original editable backend repository or complete server commit lineage has been identified.
- The static archive LICENSE is MIT, but its `build_worker.py` emits a GPLv3 notice. Rights/provenance remain unresolved.

## Source-recovery boundaries

Treat the live Worker as *evidence* to reconstruct a clean, reviewable module, **not** as approved public source to copy wholesale. The retrieved bundled code may contain deployment-specific identifiers, Access policy hints, private backend assumptions and generated static assets.

Before proposing a public backend patch:

1. Identify and verify original editable backend sources and commit ancestry, if available; otherwise explicitly label any reconstruction as new code.
2. Document a route contract including authentication requirements, request validation, response formats, allowed HTTP methods and D1 migration lineage **without** copying private identifiers, tokens, personal data or production records.
3. Test signature, issuer, audience and expiration validation for Access JWTs; verify missing/invalid credentials are rejected, and user A cannot access user B's saves. Observing a JWT header is not proof of correct authorization.
4. Recover a sanitized D1 schema/migration plus backup and restoration tests, using entirely synthetic fixture data. Never read or export Brandi's live saves into the public repo.
5. Reconcile MIT/GPLv3 provenance and include any legally required attribution; do not silently rewrite historical notices.
6. Add isolated tests and CI in the draft before considering a **separate** release-owner cutover. Preserve the current deployment and rollback capability until verified.

## Implementation status

A clean-room **read-only** D1/API contract has been imported on the draft recovery branch through [Small Job 041 PR #3](https://github.com/anevum/brandicade/pull/3), with synthetic role and response tests documented in [LEGACY_API_READ_RECOVERY.md](LEGACY_API_READ_RECOVERY.md). It is **not wired** into any Worker. A [Small Job 042 signed-role and save/history transaction candidate](ACCESS_ATOMIC_WRITE_RECOVERY.md) now exists on the same draft recovery branch, with a single RS256 verifier, private-configured allowlist interface and SQLite-tested optimistic concurrency/rollback. Job 043 verified the same transaction SQL on a **separate synthetic-only D1 and temporary Worker**, both deleted afterward; see [D1 integration evidence](D1_DISPOSABLE_INTEGRATION_2026-10-30.md). Its integration with **production Cloudflare Access/D1, encrypted historical backup restore and live deployment remains unimplemented**. No production player rows were queried and no live Worker, Access policy, route, secret or deployment was changed. The static-source recovery PR remains draft and must not be deployed as a replacement.
