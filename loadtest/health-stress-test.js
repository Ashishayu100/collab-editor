/**
 * Health-endpoint stress test — the cheapest way to find the raw request ceiling of the box.
 *
 * `/api/health` is the one route exempted from the general rate limiter (see server/src/app.ts),
 * so this script runs against an ordinary deployment with no LOAD_TEST_MODE needed. It is not a
 * trivial ping either: each call issues a `SELECT 1` against Postgres and a Redis health check,
 * so sustained load here exercises both connection pools.
 *
 * The endpoint answers 200 when both are reachable and 503 `{ status: 'degraded' }` when either
 * is not, which is why `http_req_failed` is the meaningful failure signal below.
 *
 *   k6 run loadtest/health-stress-test.js
 *   k6 run -e BASE_URL=http://13.127.254.142 loadtest/health-stress-test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './lib/api.js';
import { renderSummary } from './lib/summary.js';

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 100 },
    { duration: '30s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, { tags: { name: 'GET /api/health' } });

  check(res, {
    'health returns 200': (r) => r.status === 200,
    'health reports healthy': (r) => {
      try {
        return r.json('status') === 'healthy';
      } catch (_) {
        return false;
      }
    },
    'database is connected': (r) => {
      try {
        return r.json('database') === 'connected';
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.1);
}

export function handleSummary(data) {
  return renderSummary(data, 'CollabEdit — Health Endpoint Stress Test', 'loadtest/results/health-results.json');
}
