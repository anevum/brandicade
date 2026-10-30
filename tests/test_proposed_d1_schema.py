import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ProposedSaveSchemaTests(unittest.TestCase):
    def test_sqlite_enforces_owner_isolation_and_atomic_revision(self):
        db = sqlite3.connect(':memory:')
        db.executescript((ROOT / 'server/schema/proposed-saves-v1.sql').read_text())
        insert = 'INSERT INTO brandicade_saves_v1(owner_subject,revision,document_json) VALUES (?,1,?) ON CONFLICT(owner_subject) DO NOTHING RETURNING revision'
        update = 'UPDATE brandicade_saves_v1 SET revision=revision+1,document_json=? WHERE owner_subject=? AND revision=? RETURNING revision'
        self.assertEqual(db.execute(insert, ('alice','{"schemaVersion":1}')).fetchone(), (1,))
        self.assertEqual(db.execute(insert, ('bob','{"schemaVersion":1}')).fetchone(), (1,))
        self.assertIsNone(db.execute(insert, ('alice','{"schemaVersion":1}')).fetchone())
        self.assertEqual(db.execute(update, ('{"schemaVersion":1,"n":2}', 'alice',1)).fetchone(), (2,))
        self.assertIsNone(db.execute(update, ('{"schemaVersion":1,"n":3}', 'alice',1)).fetchone())
        self.assertEqual(db.execute('SELECT revision FROM brandicade_saves_v1 WHERE owner_subject=?',('bob',)).fetchone(),(1,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('INSERT INTO brandicade_saves_v1(owner_subject,revision,document_json) VALUES (?,?,?)',('broken',1,'not json'))
        db.close()

if __name__ == '__main__':
    unittest.main()
