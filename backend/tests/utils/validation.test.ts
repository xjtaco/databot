import { describe, it, expect } from 'vitest';
import { isValidUuid } from '../../src/utils/validation';

describe('validation', () => {
  describe('isValidUuid()', () => {
    it('should accept valid lowercase UUID', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should accept valid uppercase UUID', () => {
      expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should accept valid mixed-case UUID', () => {
      expect(isValidUuid('550e8400-E29B-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidUuid('')).toBe(false);
    });

    it('should reject UUID without hyphens', () => {
      expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('should reject UUID with extra characters', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
    });

    it('should reject UUID with invalid characters', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    });

    it('should reject UUID with wrong segment lengths', () => {
      expect(isValidUuid('550e840-0e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('should reject random strings', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('hello world')).toBe(false);
    });
  });
});
