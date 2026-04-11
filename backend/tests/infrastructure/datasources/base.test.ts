import { describe, it, expect, beforeEach } from 'vitest';
import { DatasourceQueryError } from '../../../src/errors/types';
import { Datasource } from '../../../src/infrastructure/datasources/base';
import { DatasourceConfig, DatasourceType } from '../../../src/infrastructure/datasources/types';

// Create a minimal concrete implementation of Datasource for testing
class TestDatasource extends Datasource {
  async connect(): Promise<void> {
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async executeQuery(query: string, _params?: unknown[]): Promise<any> {
    this.validateConnected();
    this.validateQuery(query);
    return { rows: [], rowCount: 0, fields: [] };
  }

  async getTables(): Promise<string[]> {
    return [];
  }

  async getColumns(_tableName: string): Promise<any[]> {
    return [];
  }

  protected mapVendorTypeToCommon(_vendorType: string): string {
    return 'STRING';
  }

  // Expose protected method for testing
  public testValidateQuery(query: string): void {
    this.validateQuery(query);
  }
}

describe('Datasource.validateQuery', () => {
  let datasource: TestDatasource;
  const config: DatasourceConfig = {
    type: 'sqlite' as DatasourceType,
    database: 'test',
  };

  beforeEach(() => {
    datasource = new TestDatasource(config);
    datasource.isConnected = true;
  });

  describe('valid queries', () => {
    it('should allow simple SELECT query', () => {
      expect(() => datasource.testValidateQuery('SELECT * FROM users')).not.toThrow();
    });

    it('should allow SELECT with WHERE clause', () => {
      expect(() => datasource.testValidateQuery('SELECT * FROM users WHERE id = 1')).not.toThrow();
    });

    it('should allow SELECT with JOIN', () => {
      expect(() =>
        datasource.testValidateQuery('SELECT * FROM users u JOIN orders o ON u.id = o.user_id')
      ).not.toThrow();
    });

    it('should allow SELECT with GROUP BY and HAVING', () => {
      expect(() =>
        datasource.testValidateQuery(
          'SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) > 5'
        )
      ).not.toThrow();
    });

    it('should allow SELECT with ORDER BY and LIMIT', () => {
      expect(() =>
        datasource.testValidateQuery('SELECT * FROM users ORDER BY created_at DESC LIMIT 10')
      ).not.toThrow();
    });

    it('should allow SELECT with subquery', () => {
      expect(() =>
        datasource.testValidateQuery('SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)')
      ).not.toThrow();
    });

    it('should allow CTE (WITH clause)', () => {
      expect(() =>
        datasource.testValidateQuery(
          'WITH user_counts AS (SELECT user_id, COUNT(*) FROM orders GROUP BY user_id) SELECT * FROM user_counts'
        )
      ).not.toThrow();
    });

    it('should allow SELECT with leading block comment', () => {
      expect(() =>
        datasource.testValidateQuery('/* This is a comment */ SELECT * FROM users')
      ).not.toThrow();
    });

    it('should allow SELECT with leading line comment', () => {
      expect(() =>
        datasource.testValidateQuery('-- This is a comment\nSELECT * FROM users')
      ).not.toThrow();
    });

    it('should allow SELECT with UNION', () => {
      expect(() =>
        datasource.testValidateQuery('SELECT name FROM users UNION SELECT name FROM admins')
      ).not.toThrow();
    });
  });

  describe('invalid queries - multiple statements', () => {
    it('should reject multiple statements separated by semicolon', () => {
      expect(() =>
        datasource.testValidateQuery('SELECT * FROM users; SELECT * FROM orders')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject INSERT followed by SELECT', () => {
      expect(() =>
        datasource.testValidateQuery(
          'INSERT INTO users (name) VALUES ("test"); SELECT * FROM users'
        )
      ).toThrow(DatasourceQueryError);
    });

    it('should reject DROP followed by SELECT', () => {
      expect(() => datasource.testValidateQuery('DROP TABLE users; SELECT * FROM users')).toThrow(
        DatasourceQueryError
      );
    });
  });

  describe('invalid queries - data modification operations', () => {
    it('should reject INSERT query', () => {
      expect(() =>
        datasource.testValidateQuery('INSERT INTO users (name) VALUES ("John")')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject UPDATE query', () => {
      expect(() =>
        datasource.testValidateQuery('UPDATE users SET name = "Jane" WHERE id = 1')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject DELETE query', () => {
      expect(() => datasource.testValidateQuery('DELETE FROM users WHERE id = 1')).toThrow(
        DatasourceQueryError
      );
    });

    it('should reject TRUNCATE query', () => {
      expect(() => datasource.testValidateQuery('TRUNCATE TABLE users')).toThrow(
        DatasourceQueryError
      );
    });

    it('should reject REPLACE query', () => {
      expect(() =>
        datasource.testValidateQuery('REPLACE INTO users (id, name) VALUES (1, "John")')
      ).toThrow(DatasourceQueryError);
    });
  });

  describe('invalid queries - DDL operations', () => {
    it('should reject CREATE TABLE', () => {
      expect(() =>
        datasource.testValidateQuery('CREATE TABLE users (id INT, name VARCHAR(50))')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject ALTER TABLE', () => {
      expect(() =>
        datasource.testValidateQuery('ALTER TABLE users ADD COLUMN email VARCHAR(100)')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject DROP TABLE', () => {
      expect(() => datasource.testValidateQuery('DROP TABLE users')).toThrow(DatasourceQueryError);
    });

    it('should reject CREATE INDEX', () => {
      expect(() =>
        datasource.testValidateQuery('CREATE INDEX idx_users_name ON users(name)')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject CREATE VIEW', () => {
      expect(() =>
        datasource.testValidateQuery('CREATE VIEW user_view AS SELECT * FROM users')
      ).toThrow(DatasourceQueryError);
    });
  });

  describe('invalid queries - transaction control', () => {
    it('should reject BEGIN TRANSACTION', () => {
      expect(() => datasource.testValidateQuery('BEGIN TRANSACTION')).toThrow(DatasourceQueryError);
    });

    it('should reject COMMIT', () => {
      expect(() => datasource.testValidateQuery('COMMIT')).toThrow(DatasourceQueryError);
    });

    it('should reject ROLLBACK', () => {
      expect(() => datasource.testValidateQuery('ROLLBACK')).toThrow(DatasourceQueryError);
    });
  });

  describe('invalid queries - administrative operations', () => {
    it('should reject GRANT', () => {
      expect(() => datasource.testValidateQuery('GRANT ALL PRIVILEGES ON users TO admin')).toThrow(
        DatasourceQueryError
      );
    });

    it('should reject REVOKE', () => {
      expect(() =>
        datasource.testValidateQuery('REVOKE ALL PRIVILEGES ON users FROM admin')
      ).toThrow(DatasourceQueryError);
    });

    it('should reject EXECUTE', () => {
      expect(() => datasource.testValidateQuery('EXECUTE immediate "DROP TABLE users"')).toThrow(
        DatasourceQueryError
      );
    });

    it('should reject CALL', () => {
      expect(() => datasource.testValidateQuery('CALL stored_procedure()')).toThrow(
        DatasourceQueryError
      );
    });

    it('should reject SHUTDOWN', () => {
      expect(() => datasource.testValidateQuery('SHUTDOWN')).toThrow(DatasourceQueryError);
    });
  });

  describe('invalid queries - non-SELECT statements', () => {
    it('should reject SHOW query', () => {
      expect(() => datasource.testValidateQuery('SHOW TABLES')).toThrow(DatasourceQueryError);
    });

    it('should reject DESCRIBE query', () => {
      expect(() => datasource.testValidateQuery('DESCRIBE users')).toThrow(DatasourceQueryError);
    });

    it('should reject EXPLAIN query', () => {
      expect(() => datasource.testValidateQuery('EXPLAIN SELECT * FROM users')).toThrow(
        DatasourceQueryError
      );
    });
  });

  describe('invalid queries - empty or invalid input', () => {
    it('should reject empty string', () => {
      expect(() => datasource.testValidateQuery('')).toThrow(DatasourceQueryError);
    });

    it('should reject whitespace only', () => {
      expect(() => datasource.testValidateQuery('   ')).toThrow(DatasourceQueryError);
    });

    it('should reject non-string input', () => {
      expect(() => datasource.testValidateQuery(null as any)).toThrow(DatasourceQueryError);
    });

    it('should reject undefined input', () => {
      expect(() => datasource.testValidateQuery(undefined as any)).toThrow(DatasourceQueryError);
    });
  });
});
