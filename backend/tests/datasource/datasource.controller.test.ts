import { describe, it, expect } from 'vitest';
import { validateConnectionConfig } from '../../src/datasource/datasource.controller';
import { ValidationError } from '../../src/errors/types';

describe('validateConnectionConfig', () => {
  const validConfig = {
    dbType: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'mydb',
    user: 'root',
    password: 'pass',
  };

  it('should pass valid config', () => {
    expect(() => validateConnectionConfig(validConfig)).not.toThrow();
  });

  it('should reject invalid dbType', () => {
    expect(() => validateConnectionConfig({ ...validConfig, dbType: 'invalid' })).toThrow(
      ValidationError
    );
  });

  it('should reject missing host', () => {
    expect(() => validateConnectionConfig({ ...validConfig, host: '' })).toThrow(ValidationError);
  });

  it('should reject invalid port', () => {
    expect(() => validateConnectionConfig({ ...validConfig, port: 0 })).toThrow(ValidationError);
  });

  it('should reject password mask on create', () => {
    expect(() => validateConnectionConfig({ ...validConfig, password: '******' })).toThrow(
      ValidationError
    );
  });

  it('should allow password mask on update', () => {
    expect(() =>
      validateConnectionConfig({ ...validConfig, password: '******' }, true)
    ).not.toThrow();
  });

  it('should include schema when provided', () => {
    const result = validateConnectionConfig({ ...validConfig, schema: 'public' });
    expect(result.schema).toBe('public');
  });

  it('should include properties when provided', () => {
    const result = validateConnectionConfig({
      ...validConfig,
      properties: { key: 'value' },
    });
    expect(result.properties).toEqual({ key: 'value' });
  });
});
