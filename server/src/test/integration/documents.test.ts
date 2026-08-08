import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, createTestUser, TestUser } from '../helpers';

let app: Express;
let user: TestUser;

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(async () => {
  user = await createTestUser();
});

describe('POST /api/documents', () => {
  it('creates a document owned by the caller', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'My Test Document' });

    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('My Test Document');
    expect(res.body.document.ownerId).toBe(user.id);
  });

  it('defaults the title when none is given', async () => {
    const res = await request(app).post('/api/documents').set('Authorization', `Bearer ${user.accessToken}`).send({});

    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('Untitled Document');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/documents').send({ title: 'Unauthorized Doc' });
    expect(res.status).toBe(401);
  });

  it('rejects a title exceeding the max length with 400', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'a'.repeat(201) });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/documents', () => {
  it('lists the caller\'s documents', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ title: `Doc ${i}` });
    }

    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(3);
    expect(res.body.documents[0].role).toBe('OWNER');
  });

  it("does not return another user's documents", async () => {
    const otherUser = await createTestUser({ email: 'other@test.com' });

    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .send({ title: "Other User's Doc" });

    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(0);
  });

  it('includes documents shared with the caller as a collaborator', async () => {
    const owner = await createTestUser({ email: 'owner2@test.com' });
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Shared Doc' });

    await request(app)
      .post(`/api/documents/${created.body.document.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: user.email, role: 'EDITOR' });

    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].role).toBe('EDITOR');
  });

  it('respects the limit query param', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ title: `Doc ${i}` });
    }

    const res = await request(app)
      .get('/api/documents?limit=2')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(2);
  });
});

describe('GET /api/documents/search', () => {
  it('finds documents by a case-insensitive title match', async () => {
    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Quarterly Report 2026' });
    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Meeting Notes' });

    const res = await request(app)
      .get('/api/documents/search?q=quarterly')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].title).toContain('Quarterly');
  });

  it('returns an empty array for a blank query without erroring', async () => {
    const res = await request(app).get('/api/documents/search?q=').set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });

  it('returns an empty array when nothing matches', async () => {
    const res = await request(app)
      .get('/api/documents/search?q=nonexistent-xyz')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });
});

describe('GET /api/documents/:id', () => {
  it("returns the document's content and role for someone with access", async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Readable Doc' });

    const res = await request(app)
      .get(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe('Readable Doc');
    expect(res.body.document.role).toBe('OWNER');
    expect(res.body.document.content).toBeDefined();
  });

  it('returns 404 for a nonexistent document', async () => {
    const res = await request(app)
      .get('/api/documents/does-not-exist')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/documents/:id', () => {
  it('renames a document', async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Old Title' });

    const res = await request(app)
      .patch(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe('New Title');
  });

  it('rejects an empty title with 400', async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Has A Title' });

    const res = await request(app)
      .patch(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/documents/:id/star', () => {
  it('toggles the star on and off', async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Star Me' });
    const id = created.body.document.id;

    const star = await request(app).patch(`/api/documents/${id}/star`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(star.status).toBe(200);
    expect(star.body.starred).toBe(true);

    const unstar = await request(app)
      .patch(`/api/documents/${id}/star`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(unstar.status).toBe(200);
    expect(unstar.body.starred).toBe(false);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('deletes a document owned by the caller', async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'To Delete' });

    const res = await request(app)
      .delete(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const getRes = await request(app)
      .get(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(getRes.status).toBe(404);
  });

  it('rejects a non-owner (even an EDITOR collaborator) with 403', async () => {
    const created = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Protected Doc' });

    const editor = await createTestUser({ email: 'editor-del@test.com' });
    await request(app)
      .post(`/api/documents/${created.body.document.id}/collaborators`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ email: editor.email, role: 'EDITOR' });

    const res = await request(app)
      .delete(`/api/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`);

    expect(res.status).toBe(403);
  });
});
