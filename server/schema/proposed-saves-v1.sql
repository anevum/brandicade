-- Proposed Brandicade standalone D1 schema for synthetic testing only.
-- NOT APPLIED to production. Live D1 migration ancestry is not verified.
CREATE TABLE IF NOT EXISTS brandicade_saves_v1 (
  owner_subject TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1 AND revision <= 2147483647),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  CHECK (length(owner_subject) BETWEEN 1 AND 256)
);
