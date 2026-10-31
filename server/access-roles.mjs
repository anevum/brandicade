// Clean-room Cloudflare Access role mapping. No production deployment.
// Inject known team issuer, app audience, trusted JWKS provider, and private
// player/admin allowlist. Request-supplied role, email, subject and saves
// are NEVER trusted. The live Worker remains the authoritative deployed code.
import { verifyAccessJWTIdentity } from '../backend/access-jwt.mjs';

function invalidConfig() { throw new TypeError('Trusted Access role configuration required'); }
function safeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || value !== value.trim()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      || /[\x00-\x1f\x7f]/.test(value)) invalidConfig();
  return value.toLowerCase();
}

export function createAccessRoleAuthorizer({
  issuer, audience, jwksProvider, playerEmail, adminEmail,
  playerDisplayName = 'Player', adminDisplayName = 'Administrator',
  now = () => Math.floor(Date.now() / 1000),
} = {}) {
  // This prevents constructing a JWK fetch URL from an unverified JWT issuer.
  if (typeof issuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)
      || typeof audience !== 'string' || audience.length < 1 || audience.length > 256
      || typeof jwksProvider !== 'function' || typeof now !== 'function') invalidConfig();
  const player = safeEmail(playerEmail), admin = safeEmail(adminEmail);
  if (player === admin) invalidConfig();
  for (const name of [playerDisplayName, adminDisplayName]) {
    if (typeof name !== 'string' || !name.trim() || name.length > 80
        || /[\x00-\x1f\x7f]/.test(name)) invalidConfig();
  }

  return async function authorize(request) {
    const token = request?.headers?.get?.('cf-access-jwt-assertion');
    if (typeof token !== 'string' || !token) throw new Error('Access denied');
    let verified;
    try {
      const keys = await jwksProvider();
      verified = await verifyAccessJWTIdentity(token, {
        issuer, audience, jwks: keys, now: now(),
      });
    } catch {
      throw new Error('Access denied');
    }
    if (verified.email === player) {
      return Object.freeze({ subject: verified.subject, role: 'player',
        displayName: playerDisplayName, expiresAt: verified.expiresAt });
    }
    if (verified.email === admin) {
      return Object.freeze({ subject: verified.subject, role: 'admin',
        displayName: adminDisplayName, expiresAt: verified.expiresAt });
    }
    throw new Error('Access denied');
  };
}
