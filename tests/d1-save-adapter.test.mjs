import test from 'node:test';
import assert from 'node:assert/strict';
import {newSave} from '../src/progression.mjs';
import {createSaveBoundary,SaveBoundaryError} from '../server/save-boundary.mjs';
import {createD1SaveRepository,D1_SQL} from '../server/d1-save-adapter.mjs';

function fakeD1() {
 const rows=new Map();
 return {prepare(sql) {
   if(!Object.values(D1_SQL).includes(sql)) throw Error('Unexpected query');
   return {bind(...args) {return {async first(){
     const [owner,revisionOrJson,possiblyJson]=args;
     const old=rows.get(owner);
     if(sql===D1_SQL.read) return old?{...old}:null;
     if(sql===D1_SQL.insert) {
       if(old)return null;
       rows.set(owner,{revision:1,json:revisionOrJson});
       return {revision:1};
     }
     if(!old||old.revision!==revisionOrJson)return null;
     const revision=old.revision+1;
     rows.set(owner,{revision,json:possiblyJson});
     return {revision};
   }}}};
 }};
}
const setup=()=>createSaveBoundary({repository:createD1SaveRepository(fakeD1()),authenticate:async token=>{
 if(token==='alice'||token==='bob')return {subject:token};
 throw Error('Unauthorized');
}});
test('D1 adapter isolates subjects and preserves revisions',async()=>{
 const api=setup(),a=newSave(),b=newSave();
 a.progression.petals=21;b.progression.petals=8;
 assert.deepEqual(await api.put('alice',a,0),{revision:1});
 assert.deepEqual(await api.put('bob',b,0),{revision:1});
 assert.equal((await api.get('alice')).save.progression.petals,21);
 assert.equal((await api.get('bob')).save.progression.petals,8);
 assert.deepEqual(await api.put('alice',a,1),{revision:2});
 await assert.rejects(api.put('alice',a,1),e=>e instanceof SaveBoundaryError&&e.code==='CONFLICT');
});
test('D1 adapter rejects unauthorized users and invalid data',async()=>{
 const api=setup();
 await assert.rejects(api.put('bad',newSave(),0),e=>e.code==='UNAUTHORIZED');
 await assert.rejects(api.put('alice',{...newSave(),owner:'bob'},0),e=>e.code==='INVALID_SAVE');
 const repo=createD1SaveRepository(fakeD1());
 await assert.rejects(repo.compareAndSwap('alice',0,'{bad'));
 await assert.rejects(repo.compareAndSwap('alice',0,JSON.stringify({schemaVersion:1,owner:'bob'})));
 await assert.rejects(repo.read('bad subject'));
});
test('D1 SQL is parameterized and uses atomic conflict predicates',()=>{
 assert.match(D1_SQL.read,/owner_subject = \?1/);
 assert.match(D1_SQL.insert,/ON CONFLICT\(owner_subject\) DO NOTHING RETURNING revision/);
 assert.match(D1_SQL.update,/WHERE owner_subject = \?1 AND revision = \?2 RETURNING revision/);
});
