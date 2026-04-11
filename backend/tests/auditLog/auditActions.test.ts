import { describe, it, expect } from 'vitest';
import { AuditAction, AuditCategory, ACTION_CATEGORY_MAP } from '../../src/auditLog/auditActions';

describe('auditActions', () => {
  it('should have unique action values', () => {
    const values = Object.values(AuditAction);
    expect(new Set(values).size).toBe(values.length);
  });

  it('should map every action to a category', () => {
    for (const action of Object.values(AuditAction)) {
      expect(ACTION_CATEGORY_MAP[action]).toBeDefined();
      expect(Object.values(AuditCategory)).toContain(ACTION_CATEGORY_MAP[action]);
    }
  });
});
