import sqlite3
import unittest
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LEGACY="""CREATE TABLE saves(player_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE save_history(player_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(player_id,revision));"""

def fixture():
    db=sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript(LEGACY)
    db.execute('INSERT INTO saves(player_id,revision,data) VALUES(?,?,?)',('synthetic-player',3,json.dumps({'schemaVersion':1,'progression':{'petals':42}})))
    for rev,petals in [(1,3),(2,21),(3,42)]:
        db.execute('INSERT INTO save_history(player_id,revision,data) VALUES(?,?,?)',
                   ('synthetic-player',rev,json.dumps({'schemaVersion':1,'progression':{'petals':petals}})))
    return db

def migrate_synthetic(db,mapping):
    if not isinstance(mapping,dict) or len(mapping)!=1 or mapping.get('synthetic-player')!='synthetic-subject':
        raise ValueError('Explicit reviewed synthetic owner mapping required')
    # Test-only migration: one transaction, preserve all historical versions, refuse collisions.
    db.execute('SAVEPOINT synthetic_copy')
    try:
        db.executescript((ROOT/'server/schema/proposed-saves-v1.sql').read_text().replace('CREATE TABLE IF NOT EXISTS','CREATE TABLE IF NOT EXISTS'))
        db.executescript((ROOT/'server/schema/proposed-save-history-v1.sql').read_text())
        old=db.execute('SELECT revision,data FROM saves WHERE player_id=?',('synthetic-player',)).fetchone()
        if old is None or old[0]<1: raise ValueError('Missing valid source')
        history=db.execute('SELECT revision,data FROM save_history WHERE player_id=? ORDER BY revision',('synthetic-player',)).fetchall()
        if [rev for rev,_ in history]!=list(range(1,old[0]+1)) or history[-1][1]!=old[1]:
            raise ValueError('Missing or inconsistent revision history')
        db.execute('INSERT INTO brandicade_saves_v1(owner_subject,revision,document_json) VALUES(?,?,?)',('synthetic-subject',*old))
        db.executemany('INSERT INTO brandicade_save_history_v1(owner_subject,revision,document_json) VALUES(?,?,?)',
                       [('synthetic-subject',rev,data) for rev,data in history])
        db.execute('RELEASE SAVEPOINT synthetic_copy')
    except Exception:
        db.execute('ROLLBACK TO SAVEPOINT synthetic_copy')
        db.execute('RELEASE SAVEPOINT synthetic_copy')
        raise

class SyntheticCompatibilityTests(unittest.TestCase):
    def test_revision_history_preserved_and_legacy_unmodified(self):
        db=fixture()
        before=db.execute('SELECT * FROM saves').fetchall(),db.execute('SELECT * FROM save_history ORDER BY revision').fetchall()
        migrate_synthetic(db,{'synthetic-player':'synthetic-subject'})
        current=db.execute('SELECT revision,document_json FROM brandicade_saves_v1').fetchone()
        history=db.execute('SELECT revision,document_json FROM brandicade_save_history_v1 ORDER BY revision').fetchall()
        self.assertEqual(current[0],3)
        self.assertEqual([x[0] for x in history],[1,2,3])
        self.assertEqual(json.loads(current[1])['progression']['petals'],42)
        self.assertEqual(history[-1],current)
        self.assertEqual(before,(db.execute('SELECT * FROM saves').fetchall(),db.execute('SELECT * FROM save_history ORDER BY revision').fetchall()))
        db.close()

    def test_incorrect_identity_mapping_fails_closed(self):
        db=fixture()
        with self.assertRaises(ValueError):migrate_synthetic(db,{'synthetic-player':'other'})
        self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE name='brandicade_saves_v1'").fetchone(),None)

    def test_missing_history_cannot_be_migrated(self):
        db=fixture()
        db.execute('DELETE FROM save_history WHERE revision=2')
        with self.assertRaises(ValueError):migrate_synthetic(db,{'synthetic-player':'synthetic-subject'})
        self.assertEqual(db.execute("SELECT COUNT(*) FROM brandicade_saves_v1").fetchone()[0],0)

    def test_existing_target_collision_rolls_back(self):
        db=fixture()
        migrate_synthetic(db,{'synthetic-player':'synthetic-subject'})
        with self.assertRaises(sqlite3.IntegrityError):migrate_synthetic(db,{'synthetic-player':'synthetic-subject'})
        self.assertEqual(db.execute('SELECT COUNT(*) FROM brandicade_save_history_v1').fetchone()[0],3)

if __name__=='__main__':unittest.main()
