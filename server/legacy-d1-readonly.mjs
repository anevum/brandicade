// Clean-room, read-only compatibility adapter for the CURRENT Brandicade D1
// tables. Synthetic fixtures only. NOT a deployable save writer or migration.
// A verified, allowlisted player record key must be injected by the server.
// Never accept the key from an HTTP request or unverified Access JWT claim.
export const LEGACY_READ_SQL = Object.freeze({
  save: 'SELECT revision, data, updated_at FROM saves WHERE player_id = ?1',
  backups: 'SELECT revision, updated_at FROM save_history WHERE player_id = ?1 ORDER BY revision DESC LIMIT 30',
});

const MAX_SAVE_BYTES = 524288;
const utf8 = new TextEncoder();

function checkedRecordKey(key) {
  if (typeof key !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(key)) {
    throw new TypeError('Trusted legacy player record key required');
  }
  return key;
}

function statement(db, sql, key, operation) {
  const prepared = db.prepare(sql);
  if (!prepared || typeof prepared.bind !== 'function') throw new Error('Invalid D1 binding');
  const bound = prepared.bind(key);
  if (!bound || typeof bound[operation] !== 'function') throw new Error('Invalid D1 read statement');
  return bound[operation]();
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
}

export function createLegacyD1Reader(db, { playerRecordKey } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('D1 binding required');
  const key = checkedRecordKey(playerRecordKey);
  return Object.freeze({
    async readSave() {
      const row = await statement(db, LEGACY_READ_SQL.save, key, 'first');
      if (row == null) return { revision: 0, save: null, updatedAt: null };
      if (!validRevision(row.revision) || typeof row.data !== 'string'
          || utf8.encode(row.data).length > MAX_SAVE_BYTES
          || (row.updated_at !== null && typeof row.updated_at !== 'string')) {
        throw new Error('Invalid legacy save row');
      }
      let save;
      try { save = JSON.parse(row.data); } catch { throw new Error('Corrupt legacy save JSON'); }
      if (save === null || typeof save !== 'object' || Array.isArray(save)) {
        throw new Error('Invalid legacy save document');
      }
      return { revision: row.revision, save, updatedAt: row.updated_at };
    },
    async listBackups() {
      const result = await statement(db, LEGACY_READ_SQL.backups, key, 'all');
      const rows = result?.results;
      if (!Array.isArray(rows) || rows.length > 30) throw new Error('Invalid legacy backup results');
      return rows.map(row => {
        if (!row || !validRevision(row.revision)
            || typeof row.updated_at !== 'string') throw new Error('Invalid legacy backup entry');
        return { revision: row.revision, updated_at: row.updated_at };
      });
    },
  });
}
