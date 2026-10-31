// Clean-room, non-deployed candidate for the existing Brandicade D1 schema.
// DO NOT enable on production until signed Access role wiring, D1 batch
// behavior, private backups and an authorized recovery drill are verified.
// Only server configuration may supply the fixed legacy player record key.
export const LEGACY_WRITE_SQL = Object.freeze({
  initial: `INSERT INTO saves(player_id,revision,data,updated_at)
    VALUES(?1,1,?2,CURRENT_TIMESTAMP)
    ON CONFLICT(player_id) DO UPDATE SET
      revision=1, data=excluded.data, updated_at=CURRENT_TIMESTAMP
    WHERE saves.revision=0
      AND NOT EXISTS(SELECT 1 FROM save_history h WHERE h.player_id=saves.player_id)`,
  update: `UPDATE saves
    SET revision=revision+1, data=?2, updated_at=CURRENT_TIMESTAMP
    WHERE player_id=?1 AND revision=?3
      AND EXISTS(SELECT 1 FROM save_history h
        WHERE h.player_id=saves.player_id AND h.revision=saves.revision
          AND h.data=saves.data)`,
  history: `INSERT INTO save_history(player_id,revision,data)
    SELECT ?1,?2,?3 WHERE changes()=1
      AND EXISTS(SELECT 1 FROM saves
        WHERE player_id=?1 AND revision=?2 AND data=?3)`,
});

const MAX_REVISION = 2147483647;
const MAX_SAVE_BYTES = 500000;
const utf8 = new TextEncoder();

export class LegacyWriteError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LegacyWriteError';
    this.code = code;
  }
}

function validateRecordKey(value) {
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(value)) {
    throw new TypeError('Trusted legacy record key required');
  }
  return value;
}
function validateName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80
      || /[\x00-\x1f\x7f]/.test(value)) {
    throw new TypeError('Privately configured player display name required');
  }
  return value;
}
function validateSave(value, expectedProfileName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 1 || value.profile?.name !== expectedProfileName
      || ['owner','subject','userId','accountId','identity'].some(k=>Object.hasOwn(value,k))) {
    throw new LegacyWriteError('INVALID_SAVE');
  }
  let json;
  try { json = JSON.stringify(value); }
  catch { throw new LegacyWriteError('INVALID_SAVE'); }
  if (typeof json !== 'string' || utf8.encode(json).byteLength > MAX_SAVE_BYTES) {
    throw new LegacyWriteError('INVALID_SAVE');
  }
  return json;
}

export function createLegacyD1Writer(db, { playerRecordKey, expectedProfileName } = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new TypeError('D1 prepared batch support required');
  }
  const playerKey=validateRecordKey(playerRecordKey);
  const playerName=validateName(expectedProfileName);
  return Object.freeze({
    async compareAndSave(document, expectedRevision) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
          || expectedRevision >= MAX_REVISION) {
        throw new LegacyWriteError('INVALID_REVISION');
      }
      const json=validateSave(document,playerName),next=expectedRevision+1;
      const saveSQL=expectedRevision===0?LEGACY_WRITE_SQL.initial:LEGACY_WRITE_SQL.update;
      let results;
      try {
        const saveArgs=expectedRevision===0
          ? [playerKey,json] : [playerKey,json,expectedRevision];
        // D1 batch is a transaction: a failing history INSERT must roll
        // back the save update. changes() records the first write result.
        results=await db.batch([
          db.prepare(saveSQL).bind(...saveArgs),
          db.prepare(LEGACY_WRITE_SQL.history).bind(playerKey,next,json),
        ]);
      } catch {
        // A failed or interrupted D1 request may have unknown completion
        // semantics. Do not automatically retry an ambiguous write.
        throw new LegacyWriteError('WRITE_OUTCOME_UNKNOWN');
      }
      if (!Array.isArray(results) || results.length!==2
          || results.some(r=>r?.success!==true
            || !Number.isSafeInteger(r?.meta?.changes))) {
        throw new LegacyWriteError('WRITE_OUTCOME_UNKNOWN');
      }
      const changes=results.map(r=>r.meta.changes);
      if (changes[0]===0 && changes[1]===0) return null;
      if (changes[0]===1 && changes[1]===1) return next;
      // Defensive: never report a successful save if history is missing.
      throw new LegacyWriteError('WRITE_OUTCOME_UNKNOWN');
    },
  });
}
