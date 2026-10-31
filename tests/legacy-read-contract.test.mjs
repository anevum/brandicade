import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLegacyD1Reader, LEGACY_READ_SQL } from '../server/legacy-d1-readonly.mjs';
import { createLegacyReadOnlyAPI } from '../server/legacy-api-readonly.mjs';

function fixtureDB({
  rows = new Map([['synthetic-player', {
    revision: 7,
    data: JSON.stringify({ schemaVersion: 1, profile: { name: 'Synthetic Player' } }),
    updated_at: '2026-01-01 00:00:00',
  }]]),
  backups = new Map([['synthetic-player', [
    { revision: 7, updated_at: '2026-01-01 00:00:00' },
    { revision: 6, updated_at: '2025-12-31 00:00:00' },
  ]]]),
} = {}) {
  const queries = [];
  const db = {
    prepare(sql) {
      assert.ok(Object.values(LEGACY_READ_SQL).includes(sql), 'unexpected SQL');
      return {
        bind(key) {
          queries.push({ sql, key });
          return {
            async first() {
              if (sql !== LEGACY_READ_SQL.save) throw Error('unexpected first');
              return rows.get(key) ?? null;
            },
            async all() {
              if (sql !== LEGACY_READ_SQL.backups) throw Error('unexpected all');
              return { results: backups.get(key) ?? [] };
            },
            run() { throw Error('A read-only adapter must never write to D1'); },
          };
        },
      };
    },
  };
  return { db, queries };
}

const authorize = async request => {
  // Synthetic principal fixture: actual production integration MUST use a
  // signature-verified Cloudflare Access issuer/audience + email allowlist.
  const value = request.headers.get('x-synthetic-identity');
  if (value === 'player') return { role: 'player', displayName: 'Synthetic Player' };
  if (value === 'admin') return { role: 'admin', displayName: 'Synthetic Admin' };
  throw Error('No synthetic identity');
};
const request = (path, role = 'player', method = 'GET') => new Request(
  'https://arcade.example.test' + path,
  { method, headers: { 'x-synthetic-identity': role } },
);
const setup = (options) => {
  const { db, queries } = fixtureDB(options);
  const repository = createLegacyD1Reader(db, { playerRecordKey: 'synthetic-player' });
  return { api: createLegacyReadOnlyAPI({ authorize, repository }), queries };
};

test('uses exact existing D1 table names and parameterized record lookup', () => {
  assert.match(LEGACY_READ_SQL.save, /FROM saves WHERE player_id = \?1/);
  assert.match(LEGACY_READ_SQL.backups, /FROM save_history WHERE player_id = \?1/);
  assert.match(LEGACY_READ_SQL.backups, /ORDER BY revision DESC LIMIT 30/);
  assert.ok(Object.keys(LEGACY_READ_SQL).length === 2);
});

test('rejects missing or untrusted player record key', () => {
  const { db } = fixtureDB();
  for (const key of [undefined, '', 'bad key', "' OR 1=1 --", '../../test']) {
    assert.throws(() => createLegacyD1Reader(db, { playerRecordKey: key }));
  }
});

test('returns existing save revision and JSON without rewriting schema', async () => {
  const { api, queries } = setup();
  const res = await api(request('/api/save'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    revision: 7,
    save: { schemaVersion: 1, profile: { name: 'Synthetic Player' } },
    updatedAt: '2026-01-01 00:00:00',
  });
  assert.deepEqual(queries, [{ sql: LEGACY_READ_SQL.save, key: 'synthetic-player' }]);
});

test('missing player record remains a zero-revision empty cloud save', async () => {
  const { api } = setup({ rows: new Map() });
  assert.deepEqual(await (await api(request('/api/save'))).json(), {
    revision: 0, save: null, updatedAt: null,
  });
});

test('backups return only historical metadata without private snapshot documents', async () => {
  const { api, queries } = setup();
  const res = await api(request('/api/backups'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { backups: [
    { revision: 7, updated_at: '2026-01-01 00:00:00' },
    { revision: 6, updated_at: '2025-12-31 00:00:00' },
  ] });
  assert.equal(queries[0].sql, LEGACY_READ_SQL.backups);
  assert.ok(!res.headers.get('access-control-allow-origin'));
});

test('invalid, oversized and corrupt synthetic stored records fail closed', async () => {
  for (const row of [
    { revision: -1, data: '{}', updated_at: '2026-01-01' },
    { revision: 5, data: '{not-json', updated_at: '2026-01-01' },
    { revision: 5, data: '"string"', updated_at: '2026-01-01' },
    { revision: 5, data: 'x'.repeat(524289), updated_at: '2026-01-01' },
  ]) {
    const { api } = setup({ rows: new Map([['synthetic-player', row]]) });
    const res = await api(request('/api/save'));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Cloud storage unavailable.' });
  }
});

test('malformed backup list never exposes raw D1 errors', async () => {
  const { api } = setup({ backups: new Map([['synthetic-player',
    [{ revision: -1, updated_at: 'bad' }]]]) });
  const res = await api(request('/api/backups'));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'Cloud storage unavailable.');
});

test('unauthorized or spoofed player role cannot access any save route', async () => {
  const { api, queries } = setup();
  for (const path of ['/api/session', '/api/save', '/api/backups']) {
    const res = await api(request(path, 'fake-player'));
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal(queries.length, 0);
});

test('admin can view session status but never player save or backup contents', async () => {
  const { api, queries } = setup();
  assert.deepEqual(await (await api(request('/api/session', 'admin'))).json(), {
    role: 'admin', displayName: 'Synthetic Admin', cloudSaveEnabled: true,
  });
  assert.equal((await api(request('/api/save', 'admin'))).status, 403);
  assert.equal((await api(request('/api/backups', 'admin'))).status, 403);
  assert.equal(queries.length, 0);
});

test('player session matches the legacy API shape and has no cache', async () => {
  const { api } = setup();
  const r = await api(request('/api/session'));
  assert.deepEqual(await r.json(), {
    role: 'player', displayName: 'Synthetic Player', cloudSaveEnabled: true,
  });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-type'), /application\/json/);
});

test('no D1 binding reports unavailable cloud storage', async () => {
  const api = createLegacyReadOnlyAPI({ authorize });
  assert.equal((await (await api(request('/api/session'))).json()).cloudSaveEnabled, false);
  assert.equal((await api(request('/api/save'))).status, 503);
  assert.equal((await api(request('/api/backups'))).status, 503);
});

test('all write verbs are denied before touching D1', async () => {
  const { api, queries } = setup();
  for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
    const res = await api(request('/api/save', 'player', method));
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
  }
  assert.equal(queries.length, 0);
});

test('unknown API paths are not mistaken for save endpoints', async () => {
  const { api, queries } = setup();
  assert.equal((await api(request('/api/saves'))).status, 404);
  assert.equal((await api(request('/api/backups/7'))).status, 404);
  assert.equal(queries.length, 0);
});

test('requires external verified JWT authorizer rather than trusting headers', () => {
  assert.throws(() => createLegacyReadOnlyAPI(), /authorizer required/);
  assert.throws(() => createLegacyReadOnlyAPI({ authorize, repository: {} }), /Read-only D1/);
  assert.deepEqual(Object.keys(createLegacyD1Reader(fixtureDB().db,
    { playerRecordKey: 'synthetic-player' })).sort(), ['listBackups', 'readSave']);
});

test('new read-only modules are deliberately absent from deployed static Worker builder', () => {
  const build = readFileSync(new URL('../build_worker.py', import.meta.url), 'utf8');
  assert.ok(!build.includes('legacy-d1-readonly.mjs'));
  assert.ok(!build.includes('legacy-api-readonly.mjs'));
  assert.ok(!build.includes('brandicade_saves_v1'));
});
