// BRANDICADE isolated save boundary. Not wired to the live Worker or D1.
// "authenticate" MUST verify a real Access JWT before returning { subject }.
// Production adapters/migrations remain unimplemented and require separate review.
import { sanitizeSave } from '../src/progression.mjs';

export const MAX_SAVE_BYTES = 512000;
const encoder = new TextEncoder();

export class SaveBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SaveBoundaryError';
    this.code = code;
  }
}

async function ownerFor(token, authenticate) {
  let principal;
  try {
    if (typeof token !== 'string' || token.length === 0) throw new Error('missing token');
    principal = await authenticate(token);
  } catch {
    throw new SaveBoundaryError('UNAUTHORIZED', 'Authentication required');
  }
  const owner = principal?.subject;
  if (typeof owner !== 'string' || owner.length === 0 || owner.length > 256 ||
      !/^[\x21-\x7e]+$/.test(owner)) {
    throw new SaveBoundaryError('UNAUTHORIZED', 'Authentication required');
  }
  return owner;
}

function canonicalSave(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new SaveBoundaryError('INVALID_SAVE', 'Save must be an object');
  }
  // The owner comes exclusively from verified authentication, never a save.
  for (const field of ['owner', 'subject', 'userId', 'accountId', 'identity']) {
    if (Object.hasOwn(document, field)) {
      throw new SaveBoundaryError('INVALID_SAVE', 'Identity fields are not allowed');
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(document);
    if (typeof serialized !== 'string' || encoder.encode(serialized).byteLength > MAX_SAVE_BYTES) {
      throw new Error('invalid size');
    }
    const validated = sanitizeSave(document);
    serialized = JSON.stringify(validated);
    if (encoder.encode(serialized).byteLength > MAX_SAVE_BYTES) throw new Error('invalid size');
  } catch {
    throw new SaveBoundaryError('INVALID_SAVE', 'Invalid or oversized save');
  }
  return serialized;
}

export function createSaveBoundary({ repository, authenticate } = {}) {
  if (!repository || typeof repository.read !== 'function' ||
      typeof repository.compareAndSwap !== 'function' ||
      typeof authenticate !== 'function') {
    throw new Error('Save boundary requires a scoped repository and JWT authenticator');
  }

  return Object.freeze({
    async get(token) {
      const owner = await ownerFor(token, authenticate);
      const row = await repository.read(owner);
      if (row === null) return { revision: 0, save: null };
      if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
          typeof row.json !== 'string') throw new Error('Stored save is invalid');
      // Parse into a fresh object: callers cannot mutate persisted data by aliasing.
      const save = JSON.parse(row.json);
      if (!save || save.schemaVersion !== 1) throw new Error('Stored save schema is invalid');
      return { revision: row.revision, save };
    },

    async put(token, document, expectedRevision) {
      const owner = await ownerFor(token, authenticate);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new SaveBoundaryError('INVALID_REVISION', 'Expected revision required');
      }
      const json = canonicalSave(document);
      const next = await repository.compareAndSwap(owner, expectedRevision, json);
      if (next === null) throw new SaveBoundaryError('CONFLICT', 'Save changed on another device');
      if (!Number.isSafeInteger(next) || next !== expectedRevision + 1) {
        throw new Error('Repository revision contract violated');
      }
      return { revision: next };
    }
  });
}

// Synthetic test adapter only. Never use as a deployed persistence backend.
export function createInMemoryTestRepository() {
  const data = new Map();
  return Object.freeze({
    async read(owner) {
      const row = data.get(owner);
      return row ? { revision: row.revision, json: row.json } : null;
    },
    async compareAndSwap(owner, expectedRevision, json) {
      const existing = data.get(owner);
      if ((existing?.revision ?? 0) !== expectedRevision) return null;
      const revision = expectedRevision + 1;
      data.set(owner, { revision, json });
      return revision;
    }
  });
}
