import { Role } from '@prisma/client';
import './setup';
import { prisma } from '../config/database';
import { hashPassword } from '../utils/hash';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { createApp } from '../app';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

let seq = 0;

/** Builds the Express app for supertest — no Redis/WebSocket, rate limiters mocked (see setup.ts). */
export function buildTestApp() {
  return createApp();
}

/** Create a test user and return their info + real JWTs, signed the same way the auth service does. */
export async function createTestUser(
  overrides: Partial<{ name: string; email: string; password: string }> = {}
): Promise<TestUser> {
  seq += 1;
  const name = overrides.name || `TestUser${seq}`;
  const email = overrides.email || `testuser${seq}@test.com`;
  const password = overrides.password || 'TestPassword123!';

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = signRefreshToken({ userId: user.id });

  return { id: user.id, name, email, accessToken, refreshToken };
}

/** Create a test document owned by the given user (also creates their OWNER Collaborator row, matching createDocument). */
export async function createTestDocument(userId: string, overrides: Partial<{ title: string }> = {}) {
  return prisma.document.create({
    data: {
      title: overrides.title || `Test Doc ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerId: userId,
      collaborators: { create: { userId, role: 'OWNER' } },
    },
  });
}

/** Add a collaborator to a document. */
export async function addCollaborator(documentId: string, userId: string, role: Extract<Role, 'EDITOR' | 'VIEWER'>) {
  return prisma.collaborator.create({
    data: { documentId, userId, role },
  });
}

export function authHeader(user: TestUser): string {
  return `Bearer ${user.accessToken}`;
}
