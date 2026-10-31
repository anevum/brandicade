-- SYNTHETIC-ONLY proposal: preserve history alongside brandicade_saves_v1.
-- Never apply to live D1. Live uses save_history(player_id,revision,data,updated_at).
-- Identity mapping and rollback are NOT implemented or approved.
CREATE TABLE IF NOT EXISTS brandicade_save_history_v1 (
  owner_subject TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1 AND revision <= 2147483647),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_subject, revision),
  FOREIGN KEY (owner_subject) REFERENCES brandicade_saves_v1(owner_subject) ON DELETE RESTRICT
);
