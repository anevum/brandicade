import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave } from '../src/progression.mjs';
import { createSaveBoundary, createInMemoryTestRepository, SaveBoundaryError } from '../server/save-boundary.mjs';

const setup = () => {
 const repository = createInMemoryTestRepository();
 const authenticate = async token => {
   if (token === 'alice-token') return {subject:'alice'};
   if (token === 'bob-token') return {subject:'bob'};
   throw new Error('unauthorized');
 };
 return createSaveBoundary({repository,authenticate});
};
const rejects = (code) => error => error instanceof SaveBoundaryError && error.code === code;

test('two verified principals cannot read or overwrite each other',async()=>{
 const api=setup(), save=newSave();
 save.progression.petals=42;
 assert.deepEqual(await api.get('alice-token'),{revision:0,save:null});
 assert.deepEqual(await api.get('bob-token'),{revision:0,save:null});
 assert.deepEqual(await api.put('alice-token',save,0),{revision:1});
 assert.equal((await api.get('alice-token')).save.progression.petals,42);
 assert.deepEqual(await api.get('bob-token'),{revision:0,save:null});
 const other=newSave();other.progression.petals=9;
 assert.deepEqual(await api.put('bob-token',other,0),{revision:1});
 assert.equal((await api.get('bob-token')).save.progression.petals,9);
 assert.equal((await api.get('alice-token')).save.progression.petals,42);
});

test('missing, invalid and spoofed identity are rejected before writes',async()=>{
 const api=setup();
 await assert.rejects(api.get(''),rejects('UNAUTHORIZED'));
 await assert.rejects(api.put('invalid-token',newSave(),0),rejects('UNAUTHORIZED'));
 await assert.rejects(api.put('alice-token',{...newSave(),owner:'bob'},0),rejects('INVALID_SAVE'));
 await assert.rejects(api.put('alice-token',{...newSave(),userId:'bob'},0),rejects('INVALID_SAVE'));
 assert.deepEqual(await api.get('alice-token'),{revision:0,save:null});
});

test('optimistic concurrency prevents stale overwrites',async()=>{
 const api=setup(), save=newSave();
 await api.put('alice-token',save,0);
 await assert.rejects(api.put('alice-token',save,0),rejects('CONFLICT'));
 await assert.rejects(api.put('alice-token',save,-1),rejects('INVALID_REVISION'));
 assert.deepEqual(await api.put('alice-token',save,1),{revision:2});
});

test('invalid versions, non-objects and excessive sizes are rejected',async()=>{
 const api=setup();
 await assert.rejects(api.put('alice-token',{schemaVersion:999},0),rejects('INVALID_SAVE'));
 await assert.rejects(api.put('alice-token','bad',0),rejects('INVALID_SAVE'));
 await assert.rejects(api.put('alice-token',{...newSave(),padding:'x'.repeat(512001)},0),rejects('INVALID_SAVE'));
 assert.deepEqual(await api.get('alice-token'),{revision:0,save:null});
});

test('read returns a detached snapshot',async()=>{
 const api=setup();
 await api.put('alice-token',newSave(),0);
 const a=await api.get('alice-token');
 a.save.progression.petals=999;
 const b=await api.get('alice-token');
 assert.equal(b.save.progression.petals,0);
});
