// Deprecated compatibility entrypoint. The only JWT signature/claims logic
// now lives in backend/access-jwt.mjs; this server module preserves the
// original {subject} return shape used by existing synthetic tests.
import { verifyAccessJWT as canonicalVerify } from '../backend/access-jwt.mjs';

export async function verifyAccessJWT(token, options) {
  const identity = await canonicalVerify(token, options);
  return Object.freeze({ subject: identity.subject });
}
