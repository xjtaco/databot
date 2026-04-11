import { describe, it, expect } from 'vitest';
import { mapVendorType } from '../../src/datasource/typeMapper';

describe('mapVendorType', () => {
  it('should map MySQL integer types', () => {
    expect(mapVendorType('mysql', 'INT')).toBe('number');
    expect(mapVendorType('mysql', 'BIGINT')).toBe('number');
    expect(mapVendorType('mysql', 'TINYINT')).toBe('number');
  });

  it('should map MySQL string types', () => {
    expect(mapVendorType('mysql', 'VARCHAR')).toBe('string');
    expect(mapVendorType('mysql', 'TEXT')).toBe('string');
  });

  it('should map MySQL datetime types', () => {
    expect(mapVendorType('mysql', 'DATETIME')).toBe('datetime');
    expect(mapVendorType('mysql', 'TIMESTAMP')).toBe('datetime');
    expect(mapVendorType('mysql', 'DATE')).toBe('datetime');
  });

  it('should map PostgreSQL types', () => {
    expect(mapVendorType('postgresql', 'integer')).toBe('number');
    expect(mapVendorType('postgresql', 'character varying')).toBe('string');
    expect(mapVendorType('postgresql', 'boolean')).toBe('boolean');
    expect(mapVendorType('postgresql', 'timestamp without time zone')).toBe('datetime');
    expect(mapVendorType('postgresql', 'jsonb')).toBe('string');
  });

  it('should map SQL Server types', () => {
    expect(mapVendorType('sqlserver', 'int')).toBe('number');
    expect(mapVendorType('sqlserver', 'nvarchar')).toBe('string');
    expect(mapVendorType('sqlserver', 'datetime2')).toBe('datetime');
    expect(mapVendorType('sqlserver', 'bit')).toBe('boolean');
  });

  it('should map Oracle types', () => {
    expect(mapVendorType('oracle', 'NUMBER')).toBe('number');
    expect(mapVendorType('oracle', 'VARCHAR2')).toBe('string');
    expect(mapVendorType('oracle', 'DATE')).toBe('datetime');
  });

  it('should map date to datetime for all databases', () => {
    expect(mapVendorType('mysql', 'DATE')).toBe('datetime');
    expect(mapVendorType('postgresql', 'date')).toBe('datetime');
    expect(mapVendorType('sqlserver', 'date')).toBe('datetime');
  });

  it('should return string for unknown types', () => {
    expect(mapVendorType('mysql', 'SOME_UNKNOWN_TYPE')).toBe('string');
  });

  it('should handle case insensitively', () => {
    expect(mapVendorType('mysql', 'varchar')).toBe('string');
    expect(mapVendorType('mysql', 'VARCHAR')).toBe('string');
    expect(mapVendorType('mysql', 'Varchar')).toBe('string');
  });
});
