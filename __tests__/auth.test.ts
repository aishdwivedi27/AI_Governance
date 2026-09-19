// __tests__/auth.test.ts
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../lib/auth';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-please-ignore';
});

describe('hashPassword / verifyPassword', () => {
  it('produces a hash different from the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips the userId', () => {
    const token = createSessionToken('user-123');
    expect(verifySessionToken(token)).toEqual({ userId: 'user-123' });
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken('user-123');
    const [payload, signature] = token.split('.');
    const tampered = `${payload}x.${signature}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = createSessionToken('user-123');
    const [payload, signature] = token.split('.');
    const flipped = signature.slice(0, -1) + (signature.slice(-1) === 'a' ? 'b' : 'a');
    expect(verifySessionToken(`${payload}.${flipped}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createSessionToken('user-123', -1000);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifySessionToken('not-a-real-token')).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
  });
});

describe('cookie builders', () => {
  it('buildSessionCookie sets HttpOnly and SameSite=Lax', () => {
    const cookie = buildSessionCookie(createSessionToken('user-123'));
    expect(cookie).toContain('session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('buildClearSessionCookie expires immediately', () => {
    const cookie = buildClearSessionCookie();
    expect(cookie).toContain('Max-Age=0');
  });
});
