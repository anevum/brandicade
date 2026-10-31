import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createAccessRoleAuthorizer } from '../server/access-roles.mjs';
import { verifyAccessJWTIdentity, verifyAccessJWT } from '../backend/access-jwt.mjs';
import { verifyAccessJWT as verifyShim } from '../server/access-jwt.mjs';
import { createLegacyReadOnlyAPI } from '../server/legacy-api-readonly.mjs';

const NOW = 1800000000;
const ISSUER = 'https://test-team.cloudflareaccess.com';
const AUD = 'synthetic-brandicade-audience';
const PLAYER = 'player@example.invalid';
const ADMIN = 'admin@example.invalid';
const b64 = value => Buffer.from(value instanceof ArrayBuffer || ArrayBuffer.isView(value)
  ? value : JSON.stringify(value)).toString('base64url');

async function signedFixture() {
  const pair = await webcrypto.subtle.generateKey({
    name:'RSASSA-PKCS1-v1_5', modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256',
  },true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
  jwk.kid='fixture-key';jwk.use='sig';
  const jwks={keys:[jwk]};
  const payload={iss:ISSUER,aud:[AUD],sub:'synthetic-subject',
    email:PLAYER,iat:NOW-30,nbf:NOW-60,exp:NOW+300};
  const sign=async(claims=payload,header={alg:'RS256',typ:'JWT',kid:'fixture-key'})=>{
    const body=b64(header)+'.'+b64(claims);
    const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,
      Buffer.from(body));
    return body+'.'+b64(sig);
  };
  const auth=(overrides={})=>createAccessRoleAuthorizer({
    issuer:ISSUER,audience:AUD,playerEmail:PLAYER,adminEmail:ADMIN,
    jwksProvider:async()=>jwks,now:()=>NOW,
    playerDisplayName:'Synthetic Player',adminDisplayName:'Synthetic Admin',
    ...overrides,
  });
  const req=token=>new Request('https://arcade.example.test/api/session',{
    headers:token?{'cf-access-jwt-assertion':token}:undefined,
  });
  return {sign,payload,jwks,auth,req};
}

test('valid signed player email grants player role with no private record key',async()=>{
  const f=await signedFixture();
  const token=await f.sign({...f.payload,email:'PLAYER@example.invalid'});
  const result=await f.auth()(f.req(token));
  assert.deepEqual(result,{subject:'synthetic-subject',role:'player',
    displayName:'Synthetic Player',expiresAt:NOW+300});
  assert.ok(!('playerRecordKey' in result));
});

test('valid signed administrator can view session but not player data',async()=>{
  const f=await signedFixture();
  const adminToken=await f.sign({...f.payload,email:ADMIN});
  const handler=createLegacyReadOnlyAPI({
    authorize:f.auth(),
    repository:{
      readSave:async()=>{throw Error('must not read admin saved data')},
      listBackups:async()=>{throw Error('must not read admin backups')},
    },
  });
  const session=await handler(new Request('https://arcade.example.test/api/session',{
    headers:{'cf-access-jwt-assertion':adminToken},
  }));
  assert.equal(session.status,200);
  assert.deepEqual(await session.json(),{role:'admin',
    displayName:'Synthetic Admin',cloudSaveEnabled:true});
  for(const path of ['/api/save','/api/backups']){
    const response=await handler(new Request('https://arcade.example.test'+path,{
      headers:{'cf-access-jwt-assertion':adminToken},
    }));
    assert.equal(response.status,403);
  }
});

test('verified signature supplies normalized allowlist email, not request headers',async()=>{
  const f=await signedFixture();
  const token=await f.sign(f.payload);
  assert.deepEqual(await verifyAccessJWTIdentity(token,{
    issuer:ISSUER,audience:AUD,jwks:f.jwks,now:NOW,
  }),{subject:'synthetic-subject',email:PLAYER,expiresAt:NOW+300});
  assert.deepEqual(await verifyAccessJWT(token,{
    issuer:ISSUER,audience:AUD,jwks:f.jwks,now:NOW,
  }),{subject:'synthetic-subject',expiresAt:NOW+300});
  assert.deepEqual(await verifyShim(token,{
    issuer:ISSUER,audience:AUD,jwks:f.jwks,now:NOW,
  }),{subject:'synthetic-subject'});
});

test('missing JWT is denied without fetching keys or calling database',async()=>{
  const f=await signedFixture();let jwksCalls=0;
  const authorize=f.auth({jwksProvider:async()=>{jwksCalls++;return f.jwks}});
  await assert.rejects(authorize(f.req()),/Access denied/);
  assert.equal(jwksCalls,0);
});

test('unlisted signed user cannot receive either role',async()=>{
  const f=await signedFixture();
  await assert.rejects(f.auth()(f.req(await f.sign({
    ...f.payload,email:'different@example.invalid',
  }))),/Access denied/);
});

test('tampered signature cannot forge player email',async()=>{
  const f=await signedFixture();
  const token=await f.sign({...f.payload,email:'outsider@example.invalid'});
  const parts=token.split('.');
  const replaced=Buffer.from(JSON.stringify({...f.payload,email:PLAYER})).toString('base64url');
  await assert.rejects(f.auth()(f.req([parts[0],replaced,parts[2]].join('.'))),/Access denied/);
});

test('wrong issuer, audience, expiration, nbf and future iat fail closed',async()=>{
  const f=await signedFixture();
  const variants=[
    {iss:'https://other.cloudflareaccess.com'},
    {aud:['another-app']},
    {exp:NOW-1},
    {nbf:NOW+1},
    {iat:NOW+120},
    {sub:''},
    {email:''},
    {email:'not-an-email'},
  ];
  for(const altered of variants){
    await assert.rejects(f.auth()(f.req(await f.sign({...f.payload,...altered}))),/Access denied/);
  }
});

test('unsupported algorithm, unknown key, missing JWKS and provider failure deny',async()=>{
  const f=await signedFixture();
  const badHeader=await f.sign(f.payload,{alg:'none',typ:'JWT',kid:'fixture-key'});
  await assert.rejects(f.auth()(f.req(badHeader)),/Access denied/);
  await assert.rejects(f.auth()(f.req(await f.sign(f.payload,{alg:'RS256',
    typ:'JWT',kid:'other'}))),/Access denied/);
  await assert.rejects(f.auth({jwksProvider:async()=>({keys:[]})})(
    f.req(await f.sign())),/Access denied/);
  await assert.rejects(f.auth({jwksProvider:async()=>{throw Error('network')}})(
    f.req(await f.sign())),/Access denied/);
});

test('rejects missing, untrusted or indistinguishable private allowlist configuration',async()=>{
  const f=await signedFixture();
  for(const bad of [
    {issuer:'http://test-team.cloudflareaccess.com'},
    {issuer:'https://test-team.cloudflareaccess.com.evil.invalid'},
    {audience:''},
    {jwksProvider:null},
    {playerEmail:ADMIN},
    {adminEmail:'ADMIN@example.invalid'},
    {playerEmail:'bad address'},
  ]){
    assert.throws(()=>f.auth(bad),/Trusted Access role configuration/);
  }
});

test('one canonical signature verifier backs the existing server shim',async()=>{
  const f=await signedFixture();
  const token=await f.sign();
  const options={issuer:ISSUER,audience:AUD,jwks:f.jwks,now:NOW};
  assert.equal((await verifyShim(token,options)).subject,
    (await verifyAccessJWT(token,options)).subject);
});
