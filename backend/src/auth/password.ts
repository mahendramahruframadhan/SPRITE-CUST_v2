import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const PASSWORD_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKey(password: string, salt: string, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = await deriveKey(password, salt, KEY_BYTES);
  return `${PASSWORD_PREFIX}$${salt}$${key.toString('hex')}`;
}

export function isLegacyPassword(stored: unknown): boolean {
  return typeof stored === 'string' && stored.length > 0 && !stored.startsWith(`${PASSWORD_PREFIX}$`);
}

export async function verifyPassword(password: string, stored: unknown): Promise<boolean> {
  const value = String(stored || '');
  if (isLegacyPassword(value)) return false;
  const [prefix, salt, encodedKey] = value.split('$');
  if (prefix !== PASSWORD_PREFIX || !/^[0-9a-f]{32}$/i.test(salt || '') || !/^[0-9a-f]{128}$/i.test(encodedKey || '')) {
    return false;
  }
  const expected = Buffer.from(encodedKey, 'hex');
  const actual = await deriveKey(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
