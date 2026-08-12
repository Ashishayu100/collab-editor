-- Runs once, only when the dev postgres container's data volume is first created (Postgres'
-- official image executes everything in /docker-entrypoint-initdb.d on an empty data dir).
-- server/src/test/setup.ts defaults TEST_DATABASE_URL to this same server on a "collab_test"
-- database — this is what makes `npm test` work immediately after `make dev-infra` on a fresh
-- machine, with no manual `createdb` step.
CREATE DATABASE collab_test;
