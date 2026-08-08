import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, createTestUser, createTestDocument, addCollaborator, TestUser } from '../helpers';

let app: Express;
let owner: TestUser;
let doc: { id: string };

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(async () => {
  owner = await createTestUser();
  doc = await createTestDocument(owner.id, { title: 'Sharing Test Doc' });
});

describe('POST /api/documents/:id/collaborators', () => {
  it('adds a collaborator by email', async () => {
    const invitee = await createTestUser({ email: 'invitee@test.com' });

    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'EDITOR' });

    expect(res.status).toBe(201);
    expect(res.body.collaborator.userId).toBe(invitee.id);
    expect(res.body.collaborator.role).toBe('EDITOR');
  });

  it('returns 404 for an email with no matching account', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'ghost@test.com', role: 'VIEWER' });

    expect(res.status).toBe(404);
  });

  it('rejects adding the owner as their own collaborator', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: owner.email, role: 'EDITOR' });

    expect(res.status).toBe(400);
  });

  it('rejects adding someone who already has access', async () => {
    const invitee = await createTestUser({ email: 'twice@test.com' });
    await addCollaborator(doc.id, invitee.id, 'VIEWER');

    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'EDITOR' });

    expect(res.status).toBe(409);
  });

  it('rejects a non-owner (EDITOR) trying to add a collaborator', async () => {
    const editor = await createTestUser({ email: 'editor-share@test.com' });
    await addCollaborator(doc.id, editor.id, 'EDITOR');
    const invitee = await createTestUser({ email: 'invitee2@test.com' });

    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ email: invitee.email, role: 'VIEWER' });

    expect(res.status).toBe(403);
  });

  it('rejects role: OWNER at the validation layer', async () => {
    const invitee = await createTestUser({ email: 'invitee3@test.com' });
    const res = await request(app)
      .post(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'OWNER' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/documents/:id/collaborators', () => {
  it('lists collaborators with the owner first', async () => {
    const viewer = await createTestUser({ email: 'list-viewer@test.com' });
    await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .get(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.collaborators[0].isOwner).toBe(true);
    expect(res.body.collaborators.some((c: { userId: string }) => c.userId === viewer.id)).toBe(true);
  });
});

describe('PATCH /api/documents/:id/collaborators/:collaboratorId', () => {
  it("changes a collaborator's role", async () => {
    const viewer = await createTestUser({ email: 'promote@test.com' });
    const collab = await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/collaborators/${collab.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'EDITOR' });

    expect(res.status).toBe(200);
    expect(res.body.collaborator.role).toBe('EDITOR');
  });

  it("rejects changing the owner's own collaborator row", async () => {
    const ownerCollab = await request(app)
      .get(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const ownerRow = ownerCollab.body.collaborators.find((c: { isOwner: boolean }) => c.isOwner);

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/collaborators/${ownerRow.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'VIEWER' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/documents/:id/collaborators/:collaboratorId', () => {
  it('lets the OWNER remove any collaborator', async () => {
    const viewer = await createTestUser({ email: 'removable@test.com' });
    const collab = await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/collaborators/${collab.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('lets a collaborator remove themselves ("leave")', async () => {
    const viewer = await createTestUser({ email: 'leaving@test.com' });
    const collab = await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/collaborators/${collab.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects one collaborator removing a different collaborator', async () => {
    const viewerA = await createTestUser({ email: 'a@test.com' });
    const viewerB = await createTestUser({ email: 'b@test.com' });
    await addCollaborator(doc.id, viewerA.id, 'VIEWER');
    const collabB = await addCollaborator(doc.id, viewerB.id, 'VIEWER');

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/collaborators/${collabB.id}`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects removing the owner', async () => {
    const ownerCollab = await request(app)
      .get(`/api/documents/${doc.id}/collaborators`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const ownerRow = ownerCollab.body.collaborators.find((c: { isOwner: boolean }) => c.isOwner);

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/collaborators/${ownerRow.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
  });
});

describe('Share links', () => {
  it('reports disabled by default', async () => {
    const res = await request(app)
      .get(`/api/documents/${doc.id}/share-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('generates a share link with a role and URL', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/share-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'EDITOR' });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.role).toBe('EDITOR');
    expect(res.body.url).toContain(res.body.token);
  });

  it('lets a new user accept the link and become a collaborator with the configured role', async () => {
    const generated = await request(app)
      .post(`/api/documents/${doc.id}/share-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'VIEWER' });

    const joiner = await createTestUser({ email: 'joiner@test.com' });
    const res = await request(app)
      .post(`/api/share/accept/${generated.body.token}`)
      .set('Authorization', `Bearer ${joiner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documentId).toBe(doc.id);
    expect(res.body.role).toBe('VIEWER');

    const getDoc = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${joiner.accessToken}`);
    expect(getDoc.status).toBe(200);
    expect(getDoc.body.document.role).toBe('VIEWER');
  });

  it('rejects an invalid share token with 404', async () => {
    const someone = await createTestUser({ email: 'someone@test.com' });
    const res = await request(app)
      .post('/api/share/accept/not-a-real-token')
      .set('Authorization', `Bearer ${someone.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('disabling the link makes it unusable', async () => {
    const generated = await request(app)
      .post(`/api/documents/${doc.id}/share-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'VIEWER' });

    await request(app).delete(`/api/documents/${doc.id}/share-link`).set('Authorization', `Bearer ${owner.accessToken}`);

    const joiner = await createTestUser({ email: 'late-joiner@test.com' });
    const res = await request(app)
      .post(`/api/share/accept/${generated.body.token}`)
      .set('Authorization', `Bearer ${joiner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('rejects a non-owner generating a share link', async () => {
    const editor = await createTestUser({ email: 'editor-sharelink@test.com' });
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const res = await request(app)
      .post(`/api/documents/${doc.id}/share-link`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ role: 'VIEWER' });

    expect(res.status).toBe(403);
  });
});
