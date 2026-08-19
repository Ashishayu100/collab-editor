/**
 * REST API load test — walks one virtual user through the full document lifecycle:
 * signup → login → create → list → read → comment → search → delete.
 *
 * Requires the target server to run with LOAD_TEST_MODE=true; otherwise the auth limiter
 * (10 attempts / 15 min per IP) rejects nearly every signup and the run measures the rate
 * limiter instead of the app. See loadtest/README.md.
 *
 *   k6 run loadtest/api-load-test.js
 *   k6 run -e BASE_URL=http://13.127.254.142 loadtest/api-load-test.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  authHeaders,
  createDocument,
  deleteDocument,
  jsonAuthHeaders,
  signup,
  uniqueId,
} from './lib/api.js';
import { renderSummary } from './lib/summary.js';

const errorRate = new Rate('errors');
const signupDuration = new Trend('signup_duration', true);
const loginDuration = new Trend('login_duration', true);
const createDocDuration = new Trend('create_doc_duration', true);
const listDocsDuration = new Trend('list_docs_duration', true);
const successfulRequests = new Counter('successful_requests');

// Thresholds are calibrated for a server on localhost or the same LAN/VPC as the load
// generator. Running against AWS from a laptop adds one internet round trip (typically
// 30–150ms) to every single request — raise these with -e or expect p95 breaches that say more
// about your ISP than about the server.
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 25 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.1'],
    // Signup is deliberately the loosest: bcrypt hashing dominates it by design.
    signup_duration: ['p(95)<1500'],
    login_duration: ['p(95)<1000'],
    create_doc_duration: ['p(95)<500'],
    list_docs_duration: ['p(95)<300'],
  },
};

/** Records a check result against both the error rate and the success counter. */
function track(passed) {
  errorRate.add(!passed);
  if (passed) successfulRequests.add(1);
  return passed;
}

export default function () {
  const id = uniqueId();
  let accessToken = '';
  let documentId = '';
  let user;

  group('Auth - Signup', () => {
    const started = Date.now();
    const result = signup(id, 'LoadTest User');
    signupDuration.add(Date.now() - started);

    user = result.user;
    accessToken = result.accessToken || '';

    track(
      check(result.res, {
        'signup returns 201': (r) => r.status === 201,
        'signup returns an access token': () => Boolean(result.accessToken),
      })
    );
  });

  // Nothing downstream is reachable without a token — bail out rather than generating a wall of
  // 401s that would drown out the real latency signal.
  if (!accessToken) return;

  sleep(0.5);

  group('Auth - Login', () => {
    const started = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /api/auth/login' } }
    );
    loginDuration.add(Date.now() - started);

    track(check(res, { 'login returns 200': (r) => r.status === 200 }));
  });

  sleep(0.5);

  group('Documents - Create', () => {
    const started = Date.now();
    const result = createDocument(accessToken, `Load Test Doc ${id}`);
    createDocDuration.add(Date.now() - started);

    documentId = result.documentId || '';

    track(
      check(result.res, {
        'create doc returns 201': (r) => r.status === 201,
        'create doc returns a document id': () => Boolean(result.documentId),
      })
    );
  });

  sleep(0.5);

  group('Documents - List', () => {
    const started = Date.now();
    const res = http.get(`${BASE_URL}/api/documents`, {
      headers: authHeaders(accessToken),
      tags: { name: 'GET /api/documents' },
    });
    listDocsDuration.add(Date.now() - started);

    track(check(res, { 'list docs returns 200': (r) => r.status === 200 }));
  });

  sleep(0.5);

  if (!documentId) return;

  group('Documents - Get', () => {
    const res = http.get(`${BASE_URL}/api/documents/${documentId}`, {
      headers: authHeaders(accessToken),
      tags: { name: 'GET /api/documents/:id' },
    });
    track(check(res, { 'get doc returns 200': (r) => r.status === 200 }));
  });

  sleep(0.3);

  group('Comments - Create', () => {
    const res = http.post(
      `${BASE_URL}/api/documents/${documentId}/comments`,
      JSON.stringify({ content: `Load test comment ${id}` }),
      { headers: jsonAuthHeaders(accessToken), tags: { name: 'POST /api/documents/:id/comments' } }
    );
    track(check(res, { 'create comment returns 201': (r) => r.status === 201 }));
  });

  sleep(0.3);

  group('Documents - Search', () => {
    const res = http.get(`${BASE_URL}/api/documents/search?q=Load`, {
      headers: authHeaders(accessToken),
      tags: { name: 'GET /api/documents/search' },
    });
    track(check(res, { 'search returns 200': (r) => r.status === 200 }));
  });

  sleep(0.3);

  group('Documents - Delete', () => {
    // The API answers 200 `{ success: true }` here — not 204.
    const res = deleteDocument(accessToken, documentId);
    track(check(res, { 'delete doc returns 200': (r) => r.status === 200 }));
  });

  sleep(1);
}

export function handleSummary(data) {
  return renderSummary(data, 'CollabEdit — REST API Load Test', 'loadtest/results/api-results.json', [
    ['successful_requests', 'Successful checks'],
    ['signup_duration', 'Signup'],
    ['login_duration', 'Login'],
    ['create_doc_duration', 'Create document'],
    ['list_docs_duration', 'List documents'],
  ]);
}
