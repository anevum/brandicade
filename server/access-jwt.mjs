// Isolated BRANDICADE Access authentication prototype. No production integration.
const decoder = new TextDecoder('utf-8', { fatal: true });
function decode(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length > 8192) throw new Error('Invalid token encoding');
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
function json(segment) { return JSON.parse(decoder.decode(decode(segment))); }
export async function verifyAccessJWT(token, { issuer, audience, jwks, now = Math.floor(Date.now()/1000) }) {
  if (typeof token !== 'string' || token.length > 12000 || token.split('.').length !== 3) throw new Error('Invalid token');
  if (!issuer || !audience || !Array.isArray(jwks?.keys)) throw new Error('Verifier not configured');
  const [h,p,s] = token.split('.');
  const header = json(h), payload = json(p);
  if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') throw new Error('Unsupported token');
  const jwk = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use !== 'enc' && (!k.alg || k.alg === 'RS256'));
  if (!jwk) throw new Error('Untrusted signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(s), new TextEncoder().encode(h+'.'+p));
  if (!valid) throw new Error('Invalid signature');
  const accepted = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !accepted.includes(audience) ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= now ||
      !Number.isSafeInteger(payload.iat) || payload.iat > now + 60 ||
      (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) ||
      typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 256) throw new Error('Invalid token claims');
  return Object.freeze({ subject: payload.sub });
}
