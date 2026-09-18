import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Application-level encryption for secrets stored in the database
 * (taxpayer GSP password, WhiteBooks client secret). AES-256-GCM with a key
 * derived from ENCRYPTION_KEY.
 *
 * Format: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>". Values without that
 * prefix are treated as legacy plaintext and returned as-is, so existing rows
 * keep working and get encrypted the next time they are written.
 */
const log = new Logger('SecretCrypto');
const PREFIX = 'enc:v1:';
let warned = false;

function key(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept any passphrase; derive a stable 32-byte key.
  return createHash('sha256').update(raw).digest();
}

/** Encrypt a secret for storage. No-op (returns plaintext) when ENCRYPTION_KEY is unset — dev only. */
export function encryptSecret(plain: string | null | undefined): string {
  if (plain == null || plain === '') return plain ?? '';
  if (plain.startsWith(PREFIX)) return plain; // already encrypted
  const k = key();
  if (!k) {
    if (!warned) { log.warn('ENCRYPTION_KEY not set — secrets stored in plaintext (acceptable for local dev only).'); warned = true; }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a stored secret. Legacy plaintext (no prefix) is returned unchanged. */
export function decryptSecret(stored: string | null | undefined): string {
  if (stored == null || stored === '') return stored ?? '';
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const k = key();
  if (!k) throw new Error('ENCRYPTION_KEY is not set but an encrypted secret was found in storage');
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
