// Independent, offline-testable Access token verifier.
// Clean-room implementation: not extracted from the production Worker.
// This module is NOT imported by the current static Worker build.

const fail = () => { throw new Error('Access authentication failed'); };
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

function decodeBase64url(segment, limit = 12000) {
  if (typeof segment !== 'string' || !segment.length || segment.length > limit
      || !/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) fail();
  try {
    const raw = atob(segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4));
    return Uint8Array.from(raw, ch => ch.charCodeAt(0));
  } catch { fail(); }
}

function parseJSON(bytes) {
  try {
    const parsed = JSON.parse(decoder.decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail();
    return parsed;
  } catch { fail(); }
}

async function verifyVerifiedClaims(token, { issuer, audience, jwks, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof issuer !== 'string' || !issuer.startsWith('https://')
      || typeof audience !== 'string' || !audience
      || !Number.isSafeInteger(now) || !Array.isArray(jwks?.keys)) fail();
  if (typeof token !== 'string' || token.length > 16000) fail();
  const parts = token.split('.');
  if (parts.length !== 3) fail();
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = parseJSON(decodeBase64url(encodedHeader));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string'
      || !header.kid || header.kid.length > 128
      || (header.typ !== undefined && header.typ !== 'JWT')) fail();
  const matchedKeys = jwks.keys.filter(key => key && key.kid === header.kid
      && key.kty === 'RSA' && typeof key.n === 'string' && typeof key.e === 'string'
      && (key.use === undefined || key.use === 'sig')
      && (key.alg === undefined || key.alg === 'RS256')
      && (key.key_ops === undefined || Array.isArray(key.key_ops) && key.key_ops.includes('verify')));
  if (matchedKeys.length !== 1) fail();
  const signature = decodeBase64url(encodedSignature);
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', matchedKeys[0],
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature,
      encoder.encode(encodedHeader + '.' + encodedClaims));
  } catch { fail(); }
  if (!valid) fail();
  const claims = parseJSON(decodeBase64url(encodedClaims));
  if (claims.iss !== issuer
      || !(claims.aud === audience || Array.isArray(claims.aud) && claims.aud.includes(audience))
      || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256
      || !Number.isSafeInteger(claims.exp) || claims.exp <= now
      || claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)
      || !Number.isSafeInteger(claims.iat) || claims.iat <= 0 || claims.iat > now + 60) fail();
  return Object.freeze({ subject: claims.sub, expiresAt: claims.exp, email: claims.email });
}

/** Preserve the existing minimal verified identity interface. */
export async function verifyAccessJWT(token, options) {
  const claims = await verifyVerifiedClaims(token, options);
  return Object.freeze({ subject: claims.subject, expiresAt: claims.expiresAt });
}

/** The signed Access email claim is used only for a private server-side allowlist. */
export async function verifyAccessJWTIdentity(token, options) {
  const claims = await verifyVerifiedClaims(token, options);
  if (typeof claims.email !== 'string' || claims.email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
      || /[\x00-\x1f\x7f]/.test(claims.email)) fail();
  return Object.freeze({
    subject: claims.subject,
    expiresAt: claims.expiresAt,
    email: claims.email.toLowerCase(),
  });
}

export async function verifyAccessRequest(request, options) {
  const token = request?.headers?.get?.('cf-access-jwt-assertion');
  if (!token) fail();
  return verifyAccessJWT(token, options);
}
