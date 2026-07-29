import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { comparePassword, hashPassword } from '../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AuthResponse, PublicUser } from '../types';

const AVATAR_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function toPublicUser(user: { id: string; email: string; name: string; avatarColor: string }): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarColor: user.avatarColor,
  };
}

function issueTokens(userId: string, email: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken({ userId, email }),
    refreshToken: signRefreshToken({ userId }),
  };
}

export async function signup(email: string, name: string, password: string): Promise<AuthResponse> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      avatarColor: randomAvatarColor(),
    },
  });

  const tokens = issueTokens(user.id, user.email);

  return { user: toPublicUser(user), ...tokens };
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const isValid = await comparePassword(password, user.password);
  if (!isValid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const tokens = issueTokens(user.id, user.email);

  return { user: toPublicUser(user), ...tokens };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }

  return issueTokens(user.id, user.email);
}

export async function getCurrentUser(userId: string): Promise<PublicUser & { createdAt: Date }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return { ...toPublicUser(user), createdAt: user.createdAt };
}
