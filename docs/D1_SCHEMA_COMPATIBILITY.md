# Production D1 schema compatibility audit — 2026-10-30

**Read-only inspection. No game-save records were accessed. No migrations or database writes occurred.**

## Observed live database structure

The Worker `brandicade` binds `SAVES` to a D1 database named `brandicade-player-saves`. Queries were restricted to `sqlite_master`, `PRAGMA table_info`, and `PRAGMA index_list` — structural metadata only.

| Table | Columns | Key |
| --- | --- | --- |
| `saves` | `player_id TEXT`, `revision INTEGER NOT NULL DEFAULT 0`, `data TEXT NOT NULL DEFAULT '{}'`, `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` | `player_id` |
| `save_history` | `player_id TEXT NOT NULL`, `revision INTEGER NOT NULL`, `data TEXT NOT NULL`, `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` | composite `(player_id,revision)` |

The production Worker script was inspected for SQL operation patterns without exporting saved data. It references both tables and conditional revision updates. The observed save SQL includes a hard-coded `player_id='brandi'`, whereas the new draft boundary uses the authenticated JWT subject. This is a **material incompatibility**; do not substitute the new adapter without an explicitly reviewed identity/record migration.

## Differences against draft candidate

- `server/d1-save-adapter.mjs` targets a **new and nonexistent production table** called `brandicade_saves_v1`, with columns `owner_subject`, `revision`, `document_json`. Its SQL cannot operate against the live table as-is.
- The candidate uses `owner_subject` from verified Access JWT identity, while the observed production Worker uses a fixed application player identifier. Do not assume the Access subject is a safe backward-compatible row key.
- Production retains `save_history`; the candidate adapter does not currently preserve historical revisions or provide backup APIs. Replacing it would risk eliminating existing backup behavior.
- Production write logic uses UPSERT plus conditional revision handling; the candidate uses `RETURNING` with `INSERT ON CONFLICT DO NOTHING` and conditional `UPDATE`. Equivalence has **not** been demonstrated.
- Production `data` JSON shape, D1 backup/restore and live account isolation **were not verified**, because reading private saved records was out of scope.

## Decision and next safe implementation

**Do not deploy the new D1 adapter, apply the proposed schema, or merge the recovered static-source draft as a production replacement.**

Before cutover, implement and test a versioned compatibility strategy with synthetic fixtures that preserve `saves` and `save_history`, validate all existing revision and backup semantics, and explicitly resolve the fixed player identifier versus authenticated subject. A migration must include a privately verified backup and reversible procedure. Full Access JWKS integration, rights review and real-device acceptance remain outstanding.

Evidence is a read-only Cloudflare Worker metadata and schema inspection on October 30, 2026; exact Worker deployment and schema should be reconfirmed at any later release.
