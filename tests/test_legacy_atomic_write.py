"""SQLite transaction-contract tests for BRANDICADE, using only synthetic data.
Reads the SQL template strings directly from the JavaScript candidate module.
Never calls the live D1 API, reads player records, or runs a migration.
"""
import json
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "server/legacy-d1-writer.mjs").read_text()


def js_sql(key):
    match = re.search(r"\b" + re.escape(key) + r": `([^`]+)`", SOURCE)
    if not match:
        raise AssertionError("Missing SQL template: " + key)
    return match.group(1)


SCHEMA = """
CREATE TABLE saves (
    player_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE save_history (
    player_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(player_id, revision)
);
"""


def fixture():
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.executescript(SCHEMA)
    return db


def snapshot(db):
    return (
        db.execute("SELECT player_id, revision, data FROM saves ORDER BY player_id").fetchall(),
        db.execute("SELECT player_id, revision, data FROM save_history "
                   "ORDER BY player_id, revision").fetchall(),
    )


def save(key="synthetic-player", revision=0, petals=7):
    return key, revision, json.dumps({"schemaVersion": 1,
        "profile": {"name": "Synthetic Player"},
        "progression": {"petals": petals}}, separators=(",", ":"))


def transaction(db, record):
    key, expected, document = record
    db.execute("SAVEPOINT synthetic_write")
    try:
        command = js_sql("initial") if expected == 0 else js_sql("update")
        values = (key, document) if expected == 0 else (key, document, expected)
        changed = db.execute(command, values).rowcount
        history_changed = db.execute(
            js_sql("history"), (key, expected + 1, document)
        ).rowcount
        db.execute("RELEASE SAVEPOINT synthetic_write")
        return changed, history_changed
    except Exception:
        db.execute("ROLLBACK TO SAVEPOINT synthetic_write")
        db.execute("RELEASE SAVEPOINT synthetic_write")
        raise


class LegacyAtomicSaveTests(unittest.TestCase):
    def test_zero_revision_insert_and_history_are_consistent(self):
        db = fixture()
        self.assertEqual(transaction(db, save()), (1, 1))
        current, history = snapshot(db)
        self.assertEqual(current[0][1], 1)
        self.assertEqual(history[0][1], 1)
        self.assertEqual(history[0][2], current[0][2])

    def test_initial_revision_zero_existing_row_without_history(self):
        db = fixture()
        db.execute("INSERT INTO saves(player_id, revision, data) VALUES(?,0,'{}')",
                   ("synthetic-player",))
        self.assertEqual(transaction(db, save()), (1, 1))
        self.assertEqual(snapshot(db)[0][0][1], 1)

    def test_conflict_does_not_change_save_or_history(self):
        db = fixture()
        transaction(db, save())
        before = snapshot(db)
        self.assertEqual(transaction(db, save(petals=9)), (0, 0))
        self.assertEqual(snapshot(db), before)

    def test_revision_updates_preserve_exact_historical_content(self):
        db = fixture()
        transaction(db, save())
        transaction(db, save(revision=1, petals=22))
        transaction(db, save(revision=2, petals=42))
        rows, history = snapshot(db)
        self.assertEqual(rows[0][1], 3)
        self.assertEqual([x[1] for x in history], [1, 2, 3])
        self.assertEqual(json.loads(history[-1][2])["progression"]["petals"], 42)
        self.assertEqual(history[-1][2], rows[0][2])

    def test_missing_latest_history_refuses_update(self):
        db = fixture()
        transaction(db, save())
        transaction(db, save(revision=1))
        db.execute("DELETE FROM save_history WHERE player_id=? AND revision=2",
                   ("synthetic-player",))
        before = snapshot(db)
        self.assertEqual(transaction(db, save(revision=2, petals=77)), (0, 0))
        self.assertEqual(snapshot(db), before)

    def test_history_mismatch_refuses_update(self):
        db = fixture()
        transaction(db, save())
        db.execute("UPDATE save_history SET data='{}' WHERE revision=1")
        before = snapshot(db)
        self.assertEqual(transaction(db, save(revision=1)), (0, 0))
        self.assertEqual(snapshot(db), before)

    def test_missing_row_with_positive_revision_cannot_create_new_player(self):
        db = fixture()
        self.assertEqual(transaction(db, save(revision=5)), (0, 0))
        self.assertEqual(snapshot(db), ([], []))

    def test_existing_revision_one_prevents_reinitialization(self):
        db = fixture()
        transaction(db, save())
        before = snapshot(db)
        self.assertEqual(transaction(db, save(revision=0, petals=8)), (0, 0))
        self.assertEqual(snapshot(db), before)

    def test_history_insert_failure_rolls_back_current_save(self):
        db = fixture()
        transaction(db, save())
        before = snapshot(db)
        db.execute("""CREATE TRIGGER abort_history BEFORE INSERT ON save_history
                    BEGIN SELECT RAISE(ABORT,'synthetic interruption'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            transaction(db, save(revision=1, petals=88))
        self.assertEqual(snapshot(db), before)

    def test_duplicate_history_collision_rolls_back_new_save(self):
        db = fixture()
        db.execute("INSERT INTO save_history(player_id,revision,data) VALUES(?,?,?)",
                   ("synthetic-player", 1, "{}"))
        before = snapshot(db)
        with self.assertRaises(sqlite3.IntegrityError):
            transaction(db, save())
        self.assertEqual(snapshot(db), before)

    def test_players_are_disjoint_without_a_global_update(self):
        db = fixture()
        transaction(db, save(key="synthetic-player"))
        transaction(db, save(key="synthetic-other", petals=99))
        before = db.execute(
            "SELECT data FROM saves WHERE player_id='synthetic-other'"
        ).fetchone()[0]
        transaction(db, save(revision=1, petals=23))
        self.assertEqual(db.execute(
            "SELECT data FROM saves WHERE player_id='synthetic-other'"
        ).fetchone()[0], before)

    def test_concurrent_optimistic_writers_serialize_and_loser_conflicts(self):
        db = fixture()
        transaction(db, save())
        # Consecutive transaction batches model two requests that both
        # observed revision 1 before attempting their writes.
        self.assertEqual(transaction(db, save(revision=1, petals=20)), (1, 1))
        self.assertEqual(transaction(db, save(revision=1, petals=40)), (0, 0))
        row, history = snapshot(db)
        self.assertEqual(row[0][1], 2)
        self.assertEqual(len(history), 2)
        self.assertEqual(json.loads(row[0][2])["progression"]["petals"], 20)

    def test_only_existing_production_schema_tables_are_written(self):
        db = fixture()
        transaction(db, save())
        tables = [x[0] for x in db.execute("SELECT name FROM sqlite_master "
            "WHERE type='table' ORDER BY name").fetchall()]
        self.assertEqual(tables, ["save_history", "saves"])


if __name__ == "__main__":
    unittest.main()
