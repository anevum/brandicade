import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyAccessJWT } from '../server/access-jwt.mjs';

const crypto = webcrypto;
const issuer = 'https://test-team.cloudflareaccess.com';
const audience = 'synthetic-audience';
const now = 1800000000;
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
async function fixture() {
 const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk = await crypto.subtle.exportKey('jwk',pair.publicKey);
 jwk.kid='synthetic-key'; jwk.use='sig';
 const keys={keys:[jwk]};
 async function sign(claims,header={alg:'RS256',typ:'JWT',kid:'synthetic-key'}) {
   const body=b64(header)+'.'+b64(claims);
   const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(body));
   return body+'.'+b64(Buffer.from(sig));
 }
 const claims={iss:issuer,aud:audience,sub:'test-user',iat:now-60,exp:now+300};
 return {keys,sign,claims};
}
test('accepts valid synthetic signature with strict claims',async()=>{
 const f=await fixture();
 assert.deepEqual(await verifyAccessJWT(await f.sign(f.claims),{issuer,audience,jwks:f.keys,now}),{subject:'test-user'});
});
test('rejects altered signatures, foreign issuer, audience, expired tokens and future issued claims',async()=>{
 const f=await fixture();
 const good=await f.sign(f.claims);
 const badSignature=good.slice(0,-1)+(good.endsWith('A')?'B':'A');
 await assert.rejects(verifyAccessJWT(badSignature,{issuer,audience,jwks:f.keys,now}));
 for(const overrides of [{iss:'https://other.invalid'},{aud:'other'},{exp:now-1},{iat:now+120},{nbf:now+120},{sub:''}]){
  await assert.rejects(verifyAccessJWT(await f.sign({...f.claims,...overrides}),{issuer,audience,jwks:f.keys,now}));
 }
});
test('rejects unsupported algorithms, unknown key ids and malformed tokens',async()=>{
 const f=await fixture();
 await assert.rejects(verifyAccessJWT(await f.sign(f.claims,{alg:'none',typ:'JWT',kid:'synthetic-key'}),{issuer,audience,jwks:f.keys,now}));
 await assert.rejects(verifyAccessJWT(await f.sign(f.claims,{alg:'RS256',typ:'JWT',kid:'unknown'}),{issuer,audience,jwks:f.keys,now}));
 await assert.rejects(verifyAccessJWT('not.a.jwt',{issuer,audience,jwks:f.keys,now}));
});
