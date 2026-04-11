import crypto from 'crypto';
import { config } from '../base/config';
import logger from './logger';

/**
 * Password mask used in API responses and to detect unchanged password during updates
 */
export const PASSWORD_MASK = '******';

/**
 * Encryption prefix to identify encrypted strings
 */
const ENCRYPTION_PREFIX = 'ENC:';

/**
 * Algorithm used for encryption
 */
const ALGORITHM = 'aes-256-gcm';

/**
 * IV length for AES-GCM (96 bits = 12 bytes is recommended)
 */
const IV_LENGTH = 12;

/**
 * Auth tag length for AES-GCM (128 bits = 16 bytes)
 */
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from config, validating its length
 * @returns Buffer containing the 32-byte encryption key
 * @throws Error if encryption key is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = config.encryption.key;

  if (!keyHex) {
    throw new Error('Encryption key is not configured. Set ENCRYPTION_KEY environment variable.');
  }

  // Key should be 32 bytes (256 bits) for AES-256, which is 64 hex characters
  if (keyHex.length !== 64) {
    throw new Error(
      `Encryption key must be 64 hex characters (256 bits). Got ${keyHex.length} characters.`
    );
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('Encryption key must be a valid hexadecimal string.');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a password using AES-256-GCM
 * @param plaintext - The password to encrypt
 * @returns Encrypted string in format: ENC:{iv_base64}:{authTag_base64}:{ciphertext_base64}
 * @throws Error if encryption fails or key is not configured
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: ENC:{iv_base64}:{authTag_base64}:{ciphertext_base64}
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a password encrypted with AES-256-GCM
 * @param ciphertext - The encrypted string in format: ENC:{iv_base64}:{authTag_base64}:{ciphertext_base64}
 * @returns Decrypted plaintext password
 * @throws Error if decryption fails or format is invalid
 */
export function decryptPassword(ciphertext: string): string {
  if (!ciphertext) {
    return ciphertext;
  }

  // Handle backward compatibility: if not encrypted, return as-is with warning
  if (!isEncrypted(ciphertext)) {
    logger.warn('Password is not encrypted (legacy data). Consider re-encrypting.');
    return ciphertext;
  }

  const key = getEncryptionKey();

  // Remove prefix and split parts
  const withoutPrefix = ciphertext.substring(ENCRYPTION_PREFIX.length);
  const parts = withoutPrefix.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format. Expected ENC:{iv}:{authTag}:{ciphertext}');
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Check if a password string is encrypted (has the ENC: prefix)
 * @param password - The password string to check
 * @returns true if the password is encrypted, false otherwise
 */
export function isEncrypted(password: string): boolean {
  return !!password && password.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Check if a password string is the mask value (******)
 * @param password - The password string to check
 * @returns true if the password is the mask, false otherwise
 */
export function isPasswordMask(password: string): boolean {
  return password === PASSWORD_MASK;
}
