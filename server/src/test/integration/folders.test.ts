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

describe('POST /api/folders', () => {
  it('creates a root folder', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'My Folder' });

    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('My Folder');
    expect(res.body.folder.parentId).toBeNull();
  });

  it('creates a nested folder', async () => {
    const parent = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Parent' });

    const child = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Child', parentId: parent.body.folder.id });

    expect(child.status).toBe(201);
    expect(child.body.folder.parentId).toBe(parent.body.folder.id);
  });

  it('rejects a duplicate name in the same parent with 409', async () => {
    await request(app).post('/api/folders').set('Authorization', `Bearer ${user.accessToken}`).send({ name: 'Unique' });

    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Unique' });

    expect(res.status).toBe(409);
  });

  it('allows the same name in two different parents', async () => {
    const parentA = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Parent A' });
    const parentB = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Parent B' });

    const childA = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Shared Name', parentId: parentA.body.folder.id });
    const childB = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Shared Name', parentId: parentB.body.folder.id });

    expect(childA.status).toBe(201);
    expect(childB.status).toBe(201);
  });
});

describe('GET /api/folders', () => {
  it('returns folders as a nested tree', async () => {
    const parent = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Parent' });
    await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Child', parentId: parent.body.folder.id });

    const res = await request(app).get('/api/folders').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.folders).toHaveLength(1);
    expect(res.body.folders[0].name).toBe('Parent');
    expect(res.body.folders[0].children).toHaveLength(1);
    expect(res.body.folders[0].children[0].name).toBe('Child');
  });
});

describe('PATCH /api/folders/:id', () => {
  it('renames a folder', async () => {
    const created = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Old Name' });

    const res = await request(app)
      .patch(`/api/folders/${created.body.folder.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('New Name');
  });

  it('rejects renaming to a name already used by a sibling', async () => {
    await request(app).post('/api/folders').set('Authorization', `Bearer ${user.accessToken}`).send({ name: 'Taken' });
    const other = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Renamable' });

    const res = await request(app)
      .patch(`/api/folders/${other.body.folder.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Taken' });

    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/folders/:id', () => {
  it('deletes a folder (204, no body)', async () => {
    const created = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'To Delete' });

    const res = await request(app)
      .delete(`/api/folders/${created.body.folder.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(204);
  });

  it('moving a document into a folder, then deleting the folder, leaves the document intact with no folder', async () => {
    const folder = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Work' });
    const doc = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Work Doc' });

    const move = await request(app)
      .patch(`/api/documents/${doc.body.document.id}/move`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ folderId: folder.body.folder.id });
    expect(move.status).toBe(200);
    expect(move.body.document.folderId).toBe(folder.body.folder.id);

    await request(app).delete(`/api/folders/${folder.body.folder.id}`).set('Authorization', `Bearer ${user.accessToken}`);

    const getDoc = await request(app)
      .get(`/api/documents/${doc.body.document.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(getDoc.status).toBe(200);
  });
});

describe('PATCH /api/documents/:id/move', () => {
  it("rejects moving into another user's folder", async () => {
    const stranger = await createTestUser({ email: 'folder-stranger@test.com' });
    const strangerFolder = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ name: "Stranger's Folder" });

    const doc = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'My Doc' });

    const res = await request(app)
      .patch(`/api/documents/${doc.body.document.id}/move`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ folderId: strangerFolder.body.folder.id });

    expect(res.status).toBe(404);
  });

  it('moves a document back to root with folderId: null', async () => {
    const folder = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Temp' });
    const doc = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Doc' });

    await request(app)
      .patch(`/api/documents/${doc.body.document.id}/move`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ folderId: folder.body.folder.id });

    const res = await request(app)
      .patch(`/api/documents/${doc.body.document.id}/move`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ folderId: null });

    expect(res.status).toBe(200);
    expect(res.body.document.folderId).toBeNull();
  });
});
