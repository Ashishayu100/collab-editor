import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../config/database';
import { buildTestApp, createTestUser, createTestDocument, addCollaborator, TestUser } from '../helpers';

let app: Express;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let doc: { id: string };

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(async () => {
  owner = await createTestUser({ email: 'ac-owner@test.com' });
  editor = await createTestUser({ email: 'ac-editor@test.com' });
  viewer = await createTestUser({ email: 'ac-viewer@test.com' });
  stranger = await createTestUser({ email: 'ac-stranger@test.com' });

  doc = await createTestDocument(owner.id, { title: 'ACL Test Doc' });
  await addCollaborator(doc.id, editor.id, 'EDITOR');
  await addCollaborator(doc.id, viewer.id, 'VIEWER');
});

describe('Read access (requireDocumentAccess VIEWER)', () => {
  it('owner, editor, and viewer can all read the document', async () => {
    for (const u of [owner, editor, viewer]) {
      const res = await request(app).get(`/api/documents/${doc.id}`).set('Authorization', `Bearer ${u.accessToken}`);
      expect(res.status).toBe(200);
    }
  });

  it('a stranger with no relationship to the document gets 403', async () => {
    const res = await request(app).get(`/api/documents/${doc.id}`).set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('a stranger gets implicit VIEWER access once the document is made public', async () => {
    await prisma.document.update({ where: { id: doc.id }, data: { isPublic: true } });

    const res = await request(app).get(`/api/documents/${doc.id}`).set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.document.role).toBe('VIEWER');
  });
});

describe('Write access (requireDocumentAccess EDITOR)', () => {
  it('owner and editor can rename the document', async () => {
    for (const u of [owner, editor]) {
      const res = await request(app)
        .patch(`/api/documents/${doc.id}`)
        .set('Authorization', `Bearer ${u.accessToken}`)
        .send({ title: `Renamed by ${u.name}` });
      expect(res.status).toBe(200);
    }
  });

  it('a VIEWER cannot rename the document', async () => {
    const res = await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ title: 'Viewer Rename Attempt' });
    expect(res.status).toBe(403);
  });

  it('a VIEWER cannot push document content updates', async () => {
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/content`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ content: Buffer.from('fake').toString('base64') });
    expect(res.status).toBe(403);
  });
});

describe('Owner-only access (requireDocumentAccess OWNER)', () => {
  it('only the owner can delete the document', async () => {
    const editorAttempt = await request(app)
      .delete(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${editor.accessToken}`);
    expect(editorAttempt.status).toBe(403);

    const viewerAttempt = await request(app)
      .delete(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);
    expect(viewerAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .delete(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(ownerAttempt.status).toBe(200);
  });

  it('only the owner can move the document into a folder', async () => {
    const folder = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'ACL Folder' });

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/move`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ folderId: folder.body.folder.id });

    expect(res.status).toBe(403);
  });

  it('only the owner can manage collaborators', async () => {
    const newUser = await createTestUser({ email: 'ac-new@test.com' });

    const editorAttempt = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ email: newUser.email, role: 'VIEWER' });
    expect(editorAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: newUser.email, role: 'VIEWER' });
    expect(ownerAttempt.status).toBe(201);
  });
});

describe('Unauthenticated access', () => {
  it('every document route rejects a missing token with 401, not 403 or 500', async () => {
    expect((await request(app).get(`/api/documents/${doc.id}`)).status).toBe(401);
    expect((await request(app).patch(`/api/documents/${doc.id}`).send({ title: 'x' })).status).toBe(401);
    expect((await request(app).delete(`/api/documents/${doc.id}`)).status).toBe(401);
    expect((await request(app).get(`/api/documents/${doc.id}/comments`)).status).toBe(401);
    expect((await request(app).get(`/api/documents/${doc.id}/collaborators`)).status).toBe(401);
  });
});

describe('Comment permissions across roles', () => {
  it('editor can create and resolve comments; viewer can read but not create', async () => {
    const comment = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ content: 'Editor comment' });
    expect(comment.status).toBe(201);

    const resolve = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${comment.body.comment.id}/resolve`)
      .set('Authorization', `Bearer ${editor.accessToken}`);
    expect(resolve.status).toBe(200);

    const readAsViewer = await request(app)
      .get(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);
    expect(readAsViewer.status).toBe(200);

    const createAsViewer = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ content: 'Viewer comment' });
    expect(createAsViewer.status).toBe(403);
  });
});
