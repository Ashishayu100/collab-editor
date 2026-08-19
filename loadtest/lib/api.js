/**
 * Shared helpers for the k6 scripts in this directory.
 *
 * The response shapes asserted here mirror the real controllers — see
 * server/src/controllers/*.controller.ts. Notably the API wraps its resources
 * (`{ document: {...} }`, `{ comment: {...} }`, `{ documents: [...] }`) rather than returning
 * them bare, and DELETE /api/documents/:id answers 200 `{ success: true }`, not 204.
 */
import http from 'k6/http';

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
export const WS_URL = (__ENV.WS_URL || BASE_URL.replace(/^http/, 'ws')).replace(/\/$/, '');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Unique per virtual user *and* per iteration, so no two signups ever collide on email. */
export function uniqueId() {
  return `${__VU}-${__ITER}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export function jsonAuthHeaders(token) {
  return { ...JSON_HEADERS, ...authHeaders(token) };
}

/** POST /api/auth/signup — 201 `{ user, accessToken, refreshToken }`. */
export function signup(id, prefix) {
  const user = {
    name: `${prefix} ${id}`,
    email: `${prefix.toLowerCase().replace(/\s+/g, '-')}-${id}@loadtest.invalid`,
    password: 'LoadTest123!',
  };

  const res = http.post(`${BASE_URL}/api/auth/signup`, JSON.stringify(user), {
    headers: JSON_HEADERS,
    tags: { name: 'POST /api/auth/signup' },
  });

  return { res, user, accessToken: readJson(res, 'accessToken') };
}

/** POST /api/documents — 201 `{ document: { id, ... } }`. */
export function createDocument(token, title) {
  const res = http.post(`${BASE_URL}/api/documents`, JSON.stringify({ title }), {
    headers: jsonAuthHeaders(token),
    tags: { name: 'POST /api/documents' },
  });

  return { res, documentId: readJson(res, 'document', 'id') };
}

/** DELETE /api/documents/:id — 200 `{ success: true }`. Best-effort cleanup; failures are ignored. */
export function deleteDocument(token, documentId) {
  return http.del(`${BASE_URL}/api/documents/${documentId}`, null, {
    headers: authHeaders(token),
    tags: { name: 'DELETE /api/documents/:id' },
  });
}

/**
 * Safely walks a JSON response body. Returns undefined rather than throwing when the body is
 * absent or unparseable — which is exactly what happens on a 429/500 under load, and a thrown
 * exception there would abort the whole iteration and skew the results.
 */
export function readJson(res, ...path) {
  let value;
  try {
    value = res.json();
  } catch (_) {
    return undefined;
  }
  for (const key of path) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }
  return value;
}
