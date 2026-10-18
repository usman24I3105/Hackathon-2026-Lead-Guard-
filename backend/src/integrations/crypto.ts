import crypto from 'crypto';
import { config } from '../config';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const HKDF_HASH = 'sha256';
const HKDF_INFO = Buffer.from('leadguard-integration-key');

/**
 * SEC-4: Derive AES-256 key using HKDF-SHA256.
 * Salt = workspaceId:provider to make the key unique per scope.
 * Key version is embedded in the blob so rotation works.
 */
function deriveKey(workspaceId: string, provider: string, keyVersion: number): Buffer {
  const secretVersion = keyVersion === config.APP_SECRET_KEY_VERSION
    ? config.APP_SECRET
    : config.APP_SECRET_PREVIOUS;
  if (!secretVersion) throw new Error(`No secret for key version ${keyVersion}`);

  const ikm = Buffer.from(secretVersion, 'utf-8');
  const salt = Buffer.from(`${workspaceId}:${provider}`, 'utf-8');
  // Node 16+ crypto.hkdfSync
  return Buffer.from(
    crypto.hkdfSync(HKDF_HASH, ikm, salt, HKDF_INFO, KEY_LEN),
  );
}

/**
 * Encrypt plaintext.
 * Blob format: v<keyVersion>.<iv_hex>.<tag_hex>.<ciphertext_hex>
 * AAD = workspaceId:provider (so copying blob to another scope fails)
 */
export async function encrypt(
  plaintext: string,
  workspaceId: string,
  provider: string,
): Promise<string> {
  const keyVersion = config.APP_SECRET_KEY_VERSION;
  const key = deriveKey(workspaceId, provider, keyVersion);
  const iv = crypto.randomBytes(IV_LEN);
  const aad = Buffer.from(`${workspaceId}:${provider}`, 'utf-8');

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  cipher.setAAD(aad, { plaintextLength: Buffer.byteLength(plaintext) });

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v${keyVersion}.${iv.toString('hex')}.${tag.toString('hex')}.${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a blob produced by `encrypt`.
 * Tries the current key first, then the previous key if available.
 */
export async function decrypt(
  blob: string,
  workspaceId: string,
  provider: string,
): Promise<string> {
  const parts = blob.split('.');
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Invalid encrypted blob format');
  }

  const keyVersion = parseInt(parts[0].slice(1), 10);
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const ciphertext = Buffer.from(parts[3], 'hex');
  const aad = Buffer.from(`${workspaceId}:${provider}`, 'utf-8');

  const key = deriveKey(workspaceId, provider, keyVersion);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf-8');
}
