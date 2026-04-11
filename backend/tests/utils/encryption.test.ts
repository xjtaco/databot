import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config module before importing encryption module
// Static test key - 64 hex characters = 32 bytes (256 bits)
vi.mock('../../src/base/config', () => ({
  config: {
    encryption: {
      key: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    },
  },
}));

// Mock logger to avoid side effects
vi.mock('../../src/utils/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocking
import {
  encryptPassword,
  decryptPassword,
  isEncrypted,
  isPasswordMask,
  PASSWORD_MASK,
} from '../../src/utils/encryption';
import logger from '../../src/utils/logger';

describe('encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PASSWORD_MASK', () => {
    it('should be the expected mask value', () => {
      expect(PASSWORD_MASK).toBe('******');
    });
  });

  describe('isPasswordMask()', () => {
    it('should return true for password mask', () => {
      expect(isPasswordMask('******')).toBe(true);
    });

    it('should return false for other strings', () => {
      expect(isPasswordMask('')).toBe(false);
      expect(isPasswordMask('password123')).toBe(false);
      expect(isPasswordMask('*****')).toBe(false);
      expect(isPasswordMask('*******')).toBe(false);
      expect(isPasswordMask('ENC:test')).toBe(false);
    });
  });

  describe('isEncrypted()', () => {
    it('should return true for encrypted strings with ENC: prefix', () => {
      expect(isEncrypted('ENC:abc:def:ghi')).toBe(true);
      expect(isEncrypted('ENC:')).toBe(true);
    });

    it('should return false for non-encrypted strings', () => {
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('password123')).toBe(false);
      expect(isEncrypted('enc:test')).toBe(false); // lowercase
      expect(isEncrypted('ENCRYPTED:test')).toBe(false);
    });

    it('should return false for empty or null-like values', () => {
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('encryptPassword()', () => {
    it('should encrypt a password and return ENC: prefixed string', () => {
      const password = 'mySecretPassword123';
      const encrypted = encryptPassword(password);

      expect(encrypted.startsWith('ENC:')).toBe(true);
      expect(encrypted).not.toContain(password);
    });

    it('should return different ciphertexts for same password (due to random IV)', () => {
      const password = 'testPassword';
      const encrypted1 = encryptPassword(password);
      const encrypted2 = encryptPassword(password);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should return empty string for empty input', () => {
      expect(encryptPassword('')).toBe('');
    });

    it('should handle special characters in password', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`中文密码';
      const encrypted = encryptPassword(password);

      expect(encrypted.startsWith('ENC:')).toBe(true);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should produce encrypted string with correct format (3 base64 parts)', () => {
      const password = 'testPassword';
      const encrypted = encryptPassword(password);

      // Format: ENC:{iv_base64}:{authTag_base64}:{ciphertext_base64}
      const parts = encrypted.substring(4).split(':'); // Remove 'ENC:' prefix
      expect(parts.length).toBe(3);

      // Each part should be valid base64
      parts.forEach((part) => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });
  });

  describe('decryptPassword()', () => {
    it('should decrypt an encrypted password correctly', () => {
      const password = 'mySecretPassword123';
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should handle special characters', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`中文密码';
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should return empty string for empty input', () => {
      expect(decryptPassword('')).toBe('');
    });

    it('should return plaintext password for legacy data (backward compatibility)', () => {
      const legacyPassword = 'plainTextPassword';
      const result = decryptPassword(legacyPassword);

      expect(result).toBe(legacyPassword);
      expect(logger.warn).toHaveBeenCalledWith(
        'Password is not encrypted (legacy data). Consider re-encrypting.'
      );
    });

    it('should throw error for invalid encrypted format', () => {
      expect(() => decryptPassword('ENC:invalid')).toThrow(
        'Invalid encrypted password format. Expected ENC:{iv}:{authTag}:{ciphertext}'
      );

      expect(() => decryptPassword('ENC:a:b')).toThrow(
        'Invalid encrypted password format. Expected ENC:{iv}:{authTag}:{ciphertext}'
      );
    });

    it('should throw error for tampered ciphertext', () => {
      const password = 'testPassword';
      const encrypted = encryptPassword(password);

      // Tamper with the ciphertext
      const parts = encrypted.split(':');
      parts[3] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');

      expect(() => decryptPassword(tampered)).toThrow();
    });

    it('should throw error for tampered auth tag', () => {
      const password = 'testPassword';
      const encrypted = encryptPassword(password);

      // Tamper with the auth tag
      const parts = encrypted.split(':');
      parts[2] = Buffer.from('0'.repeat(16)).toString('base64');
      const tampered = parts.join(':');

      expect(() => decryptPassword(tampered)).toThrow();
    });
  });

  describe('encryption key validation', () => {
    it('should work with valid 64-character hex key', () => {
      // The mocked config already has a valid key
      const password = 'testPassword';
      expect(() => encryptPassword(password)).not.toThrow();
    });
  });

  describe('round-trip encryption/decryption', () => {
    const testCases = [
      'simplePassword',
      'password with spaces',
      '12345678',
      'P@$$w0rd!',
      'unicode: 密码测试 🔐',
      'very-long-password-'.repeat(10),
      'a', // single character
    ];

    testCases.forEach((password) => {
      it(`should correctly encrypt and decrypt: "${password.substring(0, 30)}..."`, () => {
        const encrypted = encryptPassword(password);
        const decrypted = decryptPassword(encrypted);

        expect(decrypted).toBe(password);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle password mask correctly in isPasswordMask', () => {
      expect(isPasswordMask(PASSWORD_MASK)).toBe(true);

      // Encrypted password should not be treated as mask
      const encrypted = encryptPassword('testPassword');
      expect(isPasswordMask(encrypted)).toBe(false);
    });

    it('should correctly identify encrypted vs plaintext', () => {
      const plaintext = 'myPassword';
      const encrypted = encryptPassword(plaintext);

      expect(isEncrypted(plaintext)).toBe(false);
      expect(isEncrypted(encrypted)).toBe(true);
    });
  });
});

describe('encryption with missing key', () => {
  beforeEach(() => {
    // Reset modules to apply new mock
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should throw error when encryption key is not configured', async () => {
    // Mock config with empty key
    vi.doMock('../../src/base/config', () => ({
      config: {
        encryption: {
          key: '',
        },
      },
    }));

    // Re-import with new mock
    const { encryptPassword: encryptWithNoKey } = await import('../../src/utils/encryption');

    expect(() => encryptWithNoKey('testPassword')).toThrow(
      'Encryption key is not configured. Set ENCRYPTION_KEY environment variable.'
    );
  });

  it('should throw error when encryption key has invalid length', async () => {
    // Mock config with short key
    vi.doMock('../../src/base/config', () => ({
      config: {
        encryption: {
          key: 'shortkey',
        },
      },
    }));

    // Re-import with new mock
    const { encryptPassword: encryptWithShortKey } = await import('../../src/utils/encryption');

    expect(() => encryptWithShortKey('testPassword')).toThrow(
      'Encryption key must be 64 hex characters (256 bits)'
    );
  });

  it('should throw error when encryption key has invalid hex characters', async () => {
    // Mock config with invalid hex key
    vi.doMock('../../src/base/config', () => ({
      config: {
        encryption: {
          key: 'g'.repeat(64), // 'g' is not a valid hex character
        },
      },
    }));

    // Re-import with new mock
    const { encryptPassword: encryptWithInvalidKey } = await import('../../src/utils/encryption');

    expect(() => encryptWithInvalidKey('testPassword')).toThrow(
      'Encryption key must be a valid hexadecimal string.'
    );
  });
});
