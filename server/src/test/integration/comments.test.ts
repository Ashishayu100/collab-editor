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
  doc = await createTestDocument(owner.id, { title: 'Comment Test Doc' });
});

describe('POST /api/documents/:id/comments', () => {
  it('creates a top-level comment', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'This is a test comment' });

    expect(res.status).toBe(201);
    expect(res.body.comment.content).toBe('This is a test comment');
    expect(res.body.comment.userId).toBe(owner.id);
    expect(res.body.comment.parentId).toBeNull();
    expect(res.body.comment.resolved).toBe(false);
  });

  it('stores anchor text and offset when provided', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Fix this typo', anchorText: 'teh', anchorOffset: 42 });

    expect(res.status).toBe(201);
    expect(res.body.comment.anchorText).toBe('teh');
    expect(res.body.comment.anchorOffset).toBe(42);
  });

  it('rejects a comment over the max length with 400', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
  });

  it('does not let a VIEWER create a comment', async () => {
    const viewer = await createTestUser({ email: 'viewer-c@test.com' });
    await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ content: 'Viewer comment' });

    expect(res.status).toBe(403);
  });

  it('lets an EDITOR create a comment', async () => {
    const editor = await createTestUser({ email: 'editor-c@test.com' });
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ content: 'Editor comment' });

    expect(res.status).toBe(201);
  });
});

describe('POST /api/documents/:id/comments/:commentId/reply', () => {
  it('replies to a root comment', async () => {
    const parent = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Original comment' });

    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments/${parent.body.comment.id}/reply`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Reply to comment' });

    expect(res.status).toBe(201);
    expect(res.body.comment.parentId).toBe(parent.body.comment.id);
  });

  it('rejects replying to a reply with 400', async () => {
    const parent = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Root' });

    const reply = await request(app)
      .post(`/api/documents/${doc.id}/comments/${parent.body.comment.id}/reply`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Reply' });

    const res = await request(app)
      .post(`/api/documents/${doc.id}/comments/${reply.body.comment.id}/reply`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Reply to reply' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/documents/:id/comments', () => {
  it('lists only root comments, each with nested replies', async () => {
    const parent = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Root comment' });

    await request(app)
      .post(`/api/documents/${doc.id}/comments/${parent.body.comment.id}/reply`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'A reply' });

    const res = await request(app)
      .get(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].replies).toHaveLength(1);
    expect(res.body.comments[0].replies[0].content).toBe('A reply');
  });

  it('a VIEWER can read comments even though they cannot create them', async () => {
    const viewer = await createTestUser({ email: 'viewer-list@test.com' });
    await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const res = await request(app)
      .get(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('filters by resolved status', async () => {
    const c1 = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Will resolve' });
    await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Stays open' });

    await request(app)
      .patch(`/api/documents/${doc.id}/comments/${c1.body.comment.id}/resolve`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    const resolved = await request(app)
      .get(`/api/documents/${doc.id}/comments?resolved=true`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(resolved.body.comments).toHaveLength(1);
    expect(resolved.body.comments[0].content).toBe('Will resolve');

    const open = await request(app)
      .get(`/api/documents/${doc.id}/comments?resolved=false`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(open.body.comments).toHaveLength(1);
    expect(open.body.comments[0].content).toBe('Stays open');
  });
});

describe('PATCH /api/documents/:id/comments/:commentId (edit)', () => {
  it('lets the author edit their own comment', async () => {
    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Original' });

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${created.body.comment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Edited' });

    expect(res.status).toBe(200);
    expect(res.body.comment.content).toBe('Edited');
  });

  it('rejects edits from someone other than the author, even the document OWNER', async () => {
    const editor = await createTestUser({ email: 'editor-edit@test.com' });
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ content: "Editor's comment" });

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${created.body.comment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Owner trying to edit' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/documents/:id/comments/:commentId', () => {
  it('lets the author delete their own comment (204, no body)', async () => {
    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Delete me' });

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/comments/${created.body.comment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('lets the document OWNER delete a comment authored by someone else', async () => {
    const editor = await createTestUser({ email: 'editor-del2@test.com' });
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .send({ content: "Editor's comment" });

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/comments/${created.body.comment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(204);
  });

  it('rejects deletion by a non-author, non-owner EDITOR', async () => {
    const author = await createTestUser({ email: 'author-del@test.com' });
    const otherEditor = await createTestUser({ email: 'other-editor-del@test.com' });
    await addCollaborator(doc.id, author.id, 'EDITOR');
    await addCollaborator(doc.id, otherEditor.id, 'EDITOR');

    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ content: "Author's comment" });

    const res = await request(app)
      .delete(`/api/documents/${doc.id}/comments/${created.body.comment.id}`)
      .set('Authorization', `Bearer ${otherEditor.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/documents/:id/comments/:commentId/resolve|unresolve', () => {
  it('resolves and then unresolves a comment', async () => {
    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'To resolve' });

    const resolve = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${created.body.comment.id}/resolve`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(resolve.status).toBe(200);
    expect(resolve.body.comment.resolved).toBe(true);
    expect(resolve.body.comment.resolvedById).toBe(owner.id);

    const unresolve = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${created.body.comment.id}/unresolve`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(unresolve.status).toBe(200);
    expect(unresolve.body.comment.resolved).toBe(false);
    expect(unresolve.body.comment.resolvedById).toBeNull();
  });

  it('rejects resolving a reply directly (must resolve the thread root)', async () => {
    const parent = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Root' });
    const reply = await request(app)
      .post(`/api/documents/${doc.id}/comments/${parent.body.comment.id}/reply`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'A reply' });

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${reply.body.comment.id}/resolve`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
  });

  it('does not let a VIEWER resolve a comment', async () => {
    const viewer = await createTestUser({ email: 'viewer-resolve@test.com' });
    await addCollaborator(doc.id, viewer.id, 'VIEWER');

    const created = await request(app)
      .post(`/api/documents/${doc.id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Owner comment' });

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/comments/${created.body.comment.id}/resolve`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(403);
  });
});
