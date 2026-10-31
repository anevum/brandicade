// Read-only, clean-room route contract based on current Brandicade API shape.
// NOT wired to the static or production Worker. PUT is deliberately refused.
// authorize(request) MUST verify a signed Cloudflare Access token, audience,
// issuer, expiration and an owner-managed allowlist before supplying a role.
function jsonResponse(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function validIdentity(identity) {
  return identity
    && (identity.role === 'player' || identity.role === 'admin')
    && typeof identity.displayName === 'string'
    && identity.displayName.length >= 1 && identity.displayName.length <= 80
    && !/[\x00-\x1f\x7f]/.test(identity.displayName);
}

export function createLegacyReadOnlyAPI({ authorize, repository = null } = {}) {
  if (typeof authorize !== 'function') {
    throw new TypeError('Verified Cloudflare Access authorizer required');
  }
  if (repository !== null
      && (typeof repository.readSave !== 'function'
          || typeof repository.listBackups !== 'function')) {
    throw new TypeError('Read-only D1 repository contract required');
  }

  return async function handleLegacyAPI(request) {
    if (!request || typeof request.url !== 'string'
        || typeof request.method !== 'string') {
      return jsonResponse({ error: 'Invalid request.' }, 400);
    }

    let identity;
    try { identity = await authorize(request); } catch { /* deny without leaking claims */ }
    if (!validIdentity(identity)) return jsonResponse({ error: 'Forbidden' }, 403);

    let path;
    try { path = new URL(request.url).pathname; } catch {
      return jsonResponse({ error: 'Invalid request.' }, 400);
    }

    if (path !== '/api/session' && identity.role !== 'player') {
      return jsonResponse({ error: 'Only the player may retrieve progress.' }, 403);
    }
    if (request.method !== 'GET') {
      // Deliberately no PUT/POST/DELETE: the legacy write and revision-history
      // semantics have not been reconstructed or verified for release.
      return jsonResponse({ error: 'Read-only recovery candidate.' }, 405, { Allow: 'GET' });
    }

    if (path === '/api/session') {
      return jsonResponse({
        role: identity.role,
        displayName: identity.displayName,
        cloudSaveEnabled: repository !== null,
      });
    }
    if (path !== '/api/save' && path !== '/api/backups') {
      return jsonResponse({ error: 'Not found.' }, 404);
    }
    if (repository === null) {
      return jsonResponse({ error: 'Cloud storage unavailable.' }, 503);
    }

    try {
      if (path === '/api/save') {
        const value = await repository.readSave();
        return jsonResponse(value);
      }
      const backups = await repository.listBackups();
      return jsonResponse({ backups });
    } catch {
      // Never include database errors, SQL, player IDs, or saved data in logs.
      return jsonResponse({ error: 'Cloud storage unavailable.' }, 503);
    }
  };
}
