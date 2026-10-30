// Draft-only D1 save repository. No production binding or migration is configured.
// Caller MUST use createSaveBoundary with a verified Access JWT subject.
// The SQL schema is a synthetic candidate, not a migration for existing live D1.
export const D1_SQL = Object.freeze({
  read: 'SELECT revision, document_json AS json FROM brandicade_saves_v1 WHERE owner_subject = ?1',
  insert: 'INSERT INTO brandicade_saves_v1 (owner_subject, revision, document_json) VALUES (?1, 1, ?2) ON CONFLICT(owner_subject) DO NOTHING RETURNING revision',
  update: 'UPDATE brandicade_saves_v1 SET revision = revision + 1, document_json = ?3 WHERE owner_subject = ?1 AND revision = ?2 RETURNING revision'
});

const MAX_SAVE_BYTES = 512000;
const MAX_REVISION = 2147483647;
const encoder = new TextEncoder();

function validateSubject(subject) {
  if (typeof subject !== 'string' || subject.length < 1 ||
      subject.length > 256 || !/^[\x21-\x7e]+$/.test(subject)) {
    throw new TypeError('Verified subject is required');
  }
}

function validateDocument(json) {
  if (typeof json !== 'string' || encoder.encode(json).byteLength > MAX_SAVE_BYTES) {
    throw new TypeError('Save JSON is invalid or too large');
  }
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new TypeError('Save JSON is invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      parsed.schemaVersion !== 1 ||
      ['owner', 'subject', 'userId', 'accountId', 'identity'].some(k => Object.hasOwn(parsed, k))) {
    throw new TypeError('Save document schema or ownership is invalid');
  }
}

// This adapter contains only parameterized, single-statement database operations.
// Conflict detection is atomic: a stale revision cannot overwrite another writer.
export function createD1SaveRepository(db) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('D1 database binding required');
  const query = (sql, parameters) => {
    const statement = db.prepare(sql);
    if (!statement || typeof statement.bind !== 'function') throw new TypeError('Invalid D1 statement');
    const bound = statement.bind(...parameters);
    if (!bound || typeof bound.first !== 'function') throw new TypeError('Invalid D1 statement');
    return bound.first();
  };
  return Object.freeze({
    async read(subject) {
      validateSubject(subject);
      const row = await query(D1_SQL.read, [subject]);
      if (row === null) return null;
      if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
          row.revision > MAX_REVISION || typeof row.json !== 'string') {
        throw new Error('Stored row does not match the save repository contract');
      }
      return {revision: row.revision, json: row.json};
    },
    async compareAndSwap(subject, expectedRevision, json) {
      validateSubject(subject);
      if (!Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 0 || expectedRevision >= MAX_REVISION) {
        throw new TypeError('Expected revision is out of bounds');
      }
      validateDocument(json);
      const row = expectedRevision === 0
        ? await query(D1_SQL.insert, [subject, json])
        : await query(D1_SQL.update, [subject, expectedRevision, json]);
      if (row === null) return null;
      if (!row || row.revision !== expectedRevision + 1) {
        throw new Error('Unexpected D1 revision returned');
      }
      return row.revision;
    }
  });
}
