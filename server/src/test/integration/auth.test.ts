import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, createTestUser } from '../helpers';

let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

describe('POST /api/auth/signup', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'StrongPass123' });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('alice@test.com');
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.user.password).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Alice', email: 'dup@test.com', password: 'StrongPass123' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Alice2', email: 'dup@test.com', password: 'StrongPass123' });

    expect(res.status).toBe(409);
  });

  it('rejects a missing name field with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'noname@test.com', password: 'StrongPass123' });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Bad Email', email: 'not-an-email', password: 'StrongPass123' });

    expect(res.status).toBe(400);
  });

  it('rejects a password missing an uppercase letter', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Weak Pw', email: 'weakpw@test.com', password: 'lowercase123' });

    expect(res.status).toBe(400);
  });

  it('rejects a password under 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Short Pw', email: 'shortpw@test.com', password: 'Ab1' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Bob', email: 'bob@test.com', password: 'BobPass123' });

    const res = await request(app).post('/api/auth/login').send({ email: 'bob@test.com', password: 'BobPass123' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('bob@test.com');
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a wrong password with 401', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Carol', email: 'carol@test.com', password: 'CarolPass123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carol@test.com', password: 'WrongPassword1' });

    expect(res.status).toBe(401);
  });

  it('rejects a non-existent user with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'Whatever123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues new tokens with a valid refresh token', async () => {
    const user = await createTestUser();

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user).toBeUndefined();
  });

  it('rejects an invalid refresh token with 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('rejects an access token used as a refresh token', async () => {
    const user = await createTestUser();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: user.accessToken });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it("returns the caller's own profile", async () => {
    const user = await createTestUser({ name: 'Dave' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.name).toBe('Dave');
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'not-a-bearer-token');
    expect(res.status).toBe(401);
  });

  it('rejects an expired/invalid access token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('always succeeds (stateless JWTs — client just discards the token)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
