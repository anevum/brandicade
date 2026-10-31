import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLegacyD1Writer, LEGACY_WRITE_SQL, LegacyWriteError,
} from '../server/legacy-d1-writer.mjs';

const save=()=>({schemaVersion:1,profile:{name:'Synthetic Player'},
  progression:{petals:42},stats:{played:3}});
function mockD1(outcomes=[1,1], fail=false) {
  const calls=[];
  const db={
    prepare(sql) {
      assert.ok(Object.values(LEGACY_WRITE_SQL).includes(sql), 'Unexpected SQL path');
      return {bind(...args){return {sql,args}}};
    },
    async batch(stmts) {
      calls.push(stmts);
      if(fail)throw Error('D1 request failed');
      return outcomes.map(changes=>({success:true,meta:{changes},results:[]}));
    },
  };
  return {db,calls};
}
const error=code=>e=>e instanceof LegacyWriteError&&e.code===code;
const make=(mock=mockD1())=>({
  mock,writer:createLegacyD1Writer(mock.db,{
    playerRecordKey:'synthetic-player',expectedProfileName:'Synthetic Player',
  }),
});

test('new save batches initial insert and matching history in one D1 call',async()=>{
  const {mock,writer}=make();
  assert.equal(await writer.compareAndSave(save(),0),1);
  assert.equal(mock.calls.length,1);
  const [initial,history]=mock.calls[0];
  assert.equal(initial.sql,LEGACY_WRITE_SQL.initial);
  assert.deepEqual(initial.args,['synthetic-player',JSON.stringify(save())]);
  assert.equal(history.sql,LEGACY_WRITE_SQL.history);
  assert.deepEqual(history.args,['synthetic-player',1,JSON.stringify(save())]);
});

test('existing save uses revision-predicate update and preserves history',async()=>{
  const {mock,writer}=make();
  assert.equal(await writer.compareAndSave(save(),12),13);
  assert.equal(mock.calls[0][0].sql,LEGACY_WRITE_SQL.update);
  assert.deepEqual(mock.calls[0][0].args,['synthetic-player',JSON.stringify(save()),12]);
  assert.deepEqual(mock.calls[0][1].args,['synthetic-player',13,JSON.stringify(save())]);
});

test('stale revision means no saved changes or fabricated history',async()=>{
  const {writer}=make(mockD1([0,0]));
  assert.equal(await writer.compareAndSave(save(),3),null);
});

test('unexpected partial save and history counts never return success',async()=>{
  for(const counts of [[1,0],[0,1],[2,1],[-1,1]]) {
    const {writer}=make(mockD1(counts));
    await assert.rejects(writer.compareAndSave(save(),1),error('WRITE_OUTCOME_UNKNOWN'));
  }
});

test('D1 failure must not be retried without checking current revision',async()=>{
  const mock=mockD1([1,1],true),{writer}=make(mock);
  await assert.rejects(writer.compareAndSave(save(),1),error('WRITE_OUTCOME_UNKNOWN'));
  assert.equal(mock.calls.length,1);
});

test('missing D1 transaction API and private owner config are rejected',()=>{
  assert.throws(()=>createLegacyD1Writer({prepare(){}}),/D1 prepared batch/);
  const mock=mockD1();
  for(const key of [undefined,'',"' OR 1=1 --",'../../bad']) {
    assert.throws(()=>createLegacyD1Writer(mock.db,{
      playerRecordKey:key,expectedProfileName:'Synthetic Player',
    }),/Trusted legacy record key/);
  }
  assert.throws(()=>createLegacyD1Writer(mock.db,{
    playerRecordKey:'synthetic-player',
  }),/Privately configured player display name/);
});

test('invalid, forged or oversized save data cannot reach D1',async()=>{
  const mock=mockD1(),{writer}=make(mock);
  const invalid=[null,[],{schemaVersion:9,profile:{name:'Synthetic Player'}},
    {...save(),profile:{name:'Another Player'}},
    {...save(),owner:'synthetic-other'},
    {...save(),identity:'synthetic-other'},
    {...save(),padding:'x'.repeat(500000)}];
  for(const item of invalid) {
    await assert.rejects(writer.compareAndSave(item,0),error('INVALID_SAVE'));
  }
  assert.equal(mock.calls.length,0);
});

test('invalid revisions cannot write or overflow revision limit',async()=>{
  const mock=mockD1(),{writer}=make(mock);
  for(const value of [-1,2.3,Number.NaN,2147483647,'1',null]) {
    await assert.rejects(writer.compareAndSave(save(),value),error('INVALID_REVISION'));
  }
  assert.equal(mock.calls.length,0);
});

test('same table names and changes guard are embedded in the prepared SQL',()=>{
  assert.match(LEGACY_WRITE_SQL.initial,/INSERT INTO saves\(/);
  assert.match(LEGACY_WRITE_SQL.update,/UPDATE saves/);
  assert.match(LEGACY_WRITE_SQL.update,/EXISTS\(SELECT 1 FROM save_history/);
  assert.match(LEGACY_WRITE_SQL.history,/INSERT INTO save_history\(/);
  assert.match(LEGACY_WRITE_SQL.history,/changes\(\)=1/);
  assert.match(LEGACY_WRITE_SQL.history,/revision=\?2 AND data=\?3/);
});

test('writer API has no user-controlled record selection or DELETE route',()=>{
  const mock=mockD1(),{writer}=make(mock);
  assert.deepEqual(Object.keys(writer),['compareAndSave']);
  assert.ok(!('readSave' in writer));
  assert.ok(!('delete' in writer));
  assert.equal(Object.keys(LEGACY_WRITE_SQL).length,3);
});

test('invalid D1 result schema cannot authorize a reported write',async()=>{
  const mock=mockD1(),{writer}=make(mock);
  mock.db.batch=async()=>[{meta:{changes:1}},{success:true,meta:{changes:1}}];
  await assert.rejects(writer.compareAndSave(save(),1),error('WRITE_OUTCOME_UNKNOWN'));
});

test('batch collision that rolls back must not be called successful',async()=>{
  const mock=mockD1(),{writer}=make(mock);
  mock.db.batch=async()=>{throw Error('UNIQUE constraint failed: save_history')};
  await assert.rejects(writer.compareAndSave(save(),1),error('WRITE_OUTCOME_UNKNOWN'));
});
