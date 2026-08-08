import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from '../../utils/jwt';

describe('JWT access tokens', () => {
  it('generates a well-formed token', () => {
    const token = signAccessToken({ userId: 'user-123', email: 'test@test.com' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a token it signed and returns the original payload', () => {
    const token = signAccessToken({ userId: 'user-123', email: 'test@test.com' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('user-123');
    expect(payload.email).toBe('test@test.com');
  });

  it('throws on an expired token', () => {
    const token = jwt.sign({ userId: 'user-123', email: 'test@test.com' }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('throws on a token signed with the wrong secret', () => {
    const token = jwt.sign({ userId: 'user-123', email: 'test@test.com' }, 'wrong-secret');
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('throws on a malformed token', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });

  it('rejects a refresh token presented as an access token (different secret)', () => {
    const refreshToken = signRefreshToken({ userId: 'user-123' });
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});

describe('JWT refresh tokens', () => {
  it('generates and verifies a refresh token', () => {
    const token = signRefreshToken({ userId: 'user-123' });
    const payload = verifyRefreshToken(token);
    expect(payload.userId).toBe('user-123');
  });

  it('throws on an expired refresh token', () => {
    const token = jwt.sign({ userId: 'user-123' }, process.env.JWT_REFRESH_SECRET!, { expiresIn: -10 });
    expect(() => verifyRefreshToken(token)).toThrow();
  });
});

describe('decodeToken', () => {
  it('decodes payload without verifying signature', () => {
    const token = jwt.sign({ userId: 'user-123' }, 'any-secret-at-all');
    const payload = decodeToken<{ userId: string }>(token);
    expect(payload?.userId).toBe('user-123');
  });

  it('returns null for a non-JWT string', () => {
    expect(decodeToken('not-a-jwt')).toBeNull();
  });
});
