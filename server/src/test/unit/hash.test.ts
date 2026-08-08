import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../utils/hash';

describe('Password hashing', () => {
  it('produces a bcrypt hash different from the plaintext', async () => {
    const hash = await hashPassword('MyPassword123!');
    expect(hash).not.toBe('MyPassword123!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces a different hash each time (random salt)', async () => {
    const hash1 = await hashPassword('SamePassword123!');
    const hash2 = await hashPassword('SamePassword123!');
    expect(hash1).not.toBe(hash2);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('CorrectPassword123!');
    expect(await comparePassword('CorrectPassword123!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('CorrectPassword123!');
    expect(await comparePassword('WrongPassword123!', hash)).toBe(false);
  });

  it('is case-sensitive', async () => {
    const hash = await hashPassword('CaseSensitive123!');
    expect(await comparePassword('casesensitive123!', hash)).toBe(false);
  });
});
