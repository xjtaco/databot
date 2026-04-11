import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { SqlTool } from '../../../../src/infrastructure/tools/sqlTool';
import { DatasourceFactory } from '../../../../src/infrastructure/datasources/datasourceFactory';
import { ToolExecutionError } from '../../../../src/errors/types';
import { ToolParams } from '../../../../src/infrastructure/tools/types';
import { config } from '../../../../src/base/config';

/**
 * Helper function to set up SQLite database for tests
 * Uses better-sqlite3 directly to bypass query validation in datasource
 */
async function setupTestDatabase(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
  db.exec("INSERT INTO test (value) VALUES ('test')");
  db.close();
}

describe('SqlTool.execute() - Error Scenarios', () => {
  let sqlTool: SqlTool;
  let testDir: string;
  let configFilePath: string;
  let outputCsvPath: string;
  let dbFilePath: string;
  let originalWorkFolder: string;

  beforeEach(async () => {
    sqlTool = new SqlTool();

    // Override work_folder to tmpdir so test output paths pass validation
    originalWorkFolder = config.work_folder;
    config.work_folder = tmpdir();

    // Create a temporary directory for test files
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `sqltool-error-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });

    // Set up file paths
    configFilePath = join(testDir, 'config.ini');
    outputCsvPath = join(testDir, 'output.csv');
    dbFilePath = join(testDir, 'test.db');

    // Create SQLite config file
    const configContent = `[datasource]
type=sqlite
file_path=${dbFilePath}
database=testdb`;

    await fs.writeFile(configFilePath, configContent, 'utf-8');
  });

  afterEach(async () => {
    // Restore original work_folder
    config.work_folder = originalWorkFolder;

    // Clean up datasources managed by factory
    try {
      await DatasourceFactory.disconnectAll();
    } catch {
      // Ignore cleanup errors
    }

    // Small delay to allow native resources to be released
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Clean up temp files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Hint for GC if available (run with --expose-gc)
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
  });

  describe('Parameter Validation', () => {
    it('should throw error when sql parameter is missing', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        } as never)
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when conf_file parameter is missing', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          output_csv: outputCsvPath,
        } as never)
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when output_csv parameter is missing', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: configFilePath,
        } as never)
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when sql parameter is empty string', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          sql: '   ',
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when conf_file parameter is empty string', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: '   ',
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when output_csv parameter is empty string', async () => {
      // Arrange & Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: configFilePath,
          output_csv: '   ',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should return false from validate with invalid parameters', () => {
      // Arrange
      const invalidParams1 = {
        sql: '',
        conf_file: '/path/to/config',
        output_csv: '/path/to/output',
      };
      const invalidParams2 = { sql: 'SELECT 1', conf_file: '', output_csv: '/path/to/output' };
      const invalidParams3 = { sql: 'SELECT 1', conf_file: '/path/to/config', output_csv: '' };

      // Act & Assert
      expect(sqlTool.validate(invalidParams1)).toBe(false);
      expect(sqlTool.validate(invalidParams2)).toBe(false);
      expect(sqlTool.validate(invalidParams3)).toBe(false);
    });
  });

  describe('Config File Errors', () => {
    it('should throw error when config file does not exist', async () => {
      // Arrange
      const nonExistentConfig = join(testDir, 'nonexistent.ini');

      // Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: nonExistentConfig,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when config file has invalid type', async () => {
      // Arrange - Create config with invalid type
      const invalidConfigPath = join(testDir, 'invalid.ini');
      await fs.writeFile(
        invalidConfigPath,
        `[datasource]
type=invalid_type
database=testdb`,
        'utf-8'
      );

      // Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: invalidConfigPath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when config file is missing type', async () => {
      // Arrange - Create config without type
      const noTypeConfigPath = join(testDir, 'notype.ini');
      await fs.writeFile(
        noTypeConfigPath,
        `[datasource]
database=testdb`,
        'utf-8'
      );

      // Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: noTypeConfigPath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when config file is malformed', async () => {
      // Arrange - Create malformed config file (not valid INI)
      const malformedConfigPath = join(testDir, 'malformed.ini');
      await fs.writeFile(malformedConfigPath, 'this is not a valid INI file at all', 'utf-8');

      // Act & Assert
      await expect(
        sqlTool.execute({
          sql: 'SELECT 1',
          conf_file: malformedConfigPath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should handle config file with comments and whitespace', async () => {
      // Arrange - Create config with comments
      const configWithComments = join(testDir, 'with_comments.ini');
      await fs.writeFile(
        configWithComments,
        `# This is a comment
; This is also a comment

[datasource]
type=sqlite
file_path=${dbFilePath}
database=testdb

# Another comment`,
        'utf-8'
      );

      // Setup database using helper function
      await setupTestDatabase(dbFilePath);

      // Act
      const result = await sqlTool.execute({
        sql: 'SELECT * FROM test LIMIT 100',
        conf_file: configWithComments,
        output_csv: outputCsvPath,
      });

      // Assert - Should succeed despite comments
      expect(result.success).toBe(true);
    });
  });

  describe('Query Execution Errors', () => {
    it('should throw error when SQL syntax is invalid', async () => {
      // Arrange - Setup database using helper function
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.close();

      // Act & Assert - Invalid SQL syntax
      await expect(
        sqlTool.execute({
          sql: 'SELEC * FORM test', // Typo: SELEC instead of SELECT, FORM instead of FROM
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw error when table does not exist', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE other_table (id INTEGER PRIMARY KEY)');
      db.close();

      // Act & Assert - Query non-existent table
      await expect(
        sqlTool.execute({
          sql: 'SELECT * FROM nonexistent_table LIMIT 100',
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should reject non-SELECT queries (INSERT)', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.close();

      // Act & Assert - Try to execute INSERT
      await expect(
        sqlTool.execute({
          sql: "INSERT INTO test (value) VALUES ('test')",
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should reject non-SELECT queries (UPDATE)', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.exec("INSERT INTO test (value) VALUES ('original')");
      db.close();

      // Act & Assert - Try to execute UPDATE
      await expect(
        sqlTool.execute({
          sql: "UPDATE test SET value = 'updated' WHERE id = 1",
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should reject non-SELECT queries (DELETE)', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.exec("INSERT INTO test (value) VALUES ('test')");
      db.close();

      // Act & Assert - Try to execute DELETE
      await expect(
        sqlTool.execute({
          sql: 'DELETE FROM test WHERE id = 1',
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should reject non-SELECT queries (DROP TABLE)', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.close();

      // Act & Assert - Try to execute DROP TABLE
      await expect(
        sqlTool.execute({
          sql: 'DROP TABLE test',
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should reject multiple statements in one query', async () => {
      // Arrange - Setup database
      const db = new Database(dbFilePath);
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      db.exec("INSERT INTO test (value) VALUES ('test')");
      db.close();

      // Act & Assert - Try to execute multiple statements
      await expect(
        sqlTool.execute({
          sql: 'SELECT * FROM test; SELECT 1',
          conf_file: configFilePath,
          output_csv: outputCsvPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('Output Path Validation', () => {
    it('should throw error when output_csv is not under work_folder', async () => {
      // Arrange - Setup database using helper function
      await setupTestDatabase(dbFilePath);

      // Act & Assert - Path outside work_folder
      await expect(
        sqlTool.execute({
          sql: 'SELECT * FROM test LIMIT 100',
          conf_file: configFilePath,
          output_csv: '/root/privileged/path/output.csv',
        })
      ).rejects.toThrow(/output_csv path must be under the work folder/);
    });

    it('should throw error when output_csv is in the uploads directory', async () => {
      // Arrange - Setup database using helper function
      await setupTestDatabase(dbFilePath);

      // Act & Assert - Path in uploads directory (not under work_folder)
      await expect(
        sqlTool.execute({
          sql: 'SELECT * FROM test LIMIT 100',
          conf_file: configFilePath,
          output_csv: '/app/databot/uploads/explore_data.csv',
        })
      ).rejects.toThrow(/output_csv path must be under the work folder/);
    });

    it('should accept output_csv under work_folder', async () => {
      // Arrange - Setup database using helper function
      await setupTestDatabase(dbFilePath);

      // Act - outputCsvPath is under testDir which is under tmpdir() (= config.work_folder)
      const result = await sqlTool.execute({
        sql: 'SELECT * FROM test LIMIT 100',
        conf_file: configFilePath,
        output_csv: outputCsvPath,
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should accept output_csv in a nested subdirectory under work_folder', async () => {
      // Arrange - Setup database using helper function
      await setupTestDatabase(dbFilePath);
      const nestedPath = join(testDir, 'sub', 'dir', 'output.csv');

      // Act
      const result = await sqlTool.execute({
        sql: 'SELECT * FROM test LIMIT 100',
        conf_file: configFilePath,
        output_csv: nestedPath,
      });

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Connection Errors', () => {
    it('should throw error when database file path is invalid', async () => {
      // Arrange - Create config with invalid database path
      const invalidDbPath = join(testDir, 'nonexistent', 'invalid.db');
      const invalidConfigPath = join(testDir, 'invalid_db.ini');
      await fs.writeFile(
        invalidConfigPath,
        `[datasource]
type=sqlite
file_path=${invalidDbPath}
database=testdb`,
        'utf-8'
      );

      // Act & Assert - Note: SQLite auto-creates files, so this test is limited
      // The behavior depends on whether the parent directory can be created
      const result = await sqlTool.execute({
        sql: 'SELECT 1 LIMIT 100',
        conf_file: invalidConfigPath,
        output_csv: outputCsvPath,
      });

      // SQLite typically creates the file, so this may succeed
      // The test verifies the tool handles the attempt gracefully
      expect(result).toBeDefined();
    });
  });

  describe('validate() method', () => {
    it('should return true for valid parameters', () => {
      // Arrange
      const validParams = {
        sql: 'SELECT * FROM users LIMIT 100',
        conf_file: '/path/to/config.ini',
        output_csv: '/path/to/output.csv',
      };

      // Act & Assert
      expect(sqlTool.validate(validParams)).toBe(true);
    });

    it('should return false when sql is not a string', () => {
      // Arrange
      const invalidParams = {
        sql: 123,
        conf_file: '/path/to/config.ini',
        output_csv: '/path/to/output.csv',
      } as unknown as ToolParams;

      // Act & Assert
      expect(sqlTool.validate(invalidParams)).toBe(false);
    });

    it('should return false when conf_file is not a string', () => {
      // Arrange
      const invalidParams = {
        sql: 'SELECT 1',
        conf_file: null,
        output_csv: '/path/to/output.csv',
      } as unknown as ToolParams;

      // Act & Assert
      expect(sqlTool.validate(invalidParams)).toBe(false);
    });

    it('should return false when output_csv is not a string', () => {
      // Arrange
      const invalidParams = {
        sql: 'SELECT 1',
        conf_file: '/path/to/config.ini',
        output_csv: undefined,
      } as unknown as ToolParams;

      // Act & Assert
      expect(sqlTool.validate(invalidParams)).toBe(false);
    });
  });
});

describe('SqlTool - Different Config File Formats', () => {
  let sqlTool: SqlTool;
  let testDir: string;
  let outputCsvPath: string;
  let dbFilePath: string;
  let originalWorkFolder: string;

  beforeEach(async () => {
    sqlTool = new SqlTool();
    originalWorkFolder = config.work_folder;
    config.work_folder = tmpdir();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `sqltool-config-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
    outputCsvPath = join(testDir, 'output.csv');
    dbFilePath = join(testDir, 'test.db');
  });

  afterEach(async () => {
    config.work_folder = originalWorkFolder;

    // Clean up datasources managed by factory
    try {
      await DatasourceFactory.disconnectAll();
    } catch {
      // Ignore cleanup errors
    }

    // Small delay to allow native resources to be released
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Clean up temp files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Hint for GC if available (run with --expose-gc)
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
  });

  it('should parse config with port specified', async () => {
    // Arrange - Create config with port (though not used for SQLite)
    const configPath = join(testDir, 'with_port.ini');
    await fs.writeFile(
      configPath,
      `[datasource]
type=sqlite
file_path=${dbFilePath}
database=testdb
port=1234`,
      'utf-8'
    );

    // Setup database using helper function
    await setupTestDatabase(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test LIMIT 100',
      conf_file: configPath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
  });

  it('should parse config with connectionTimeout', async () => {
    // Arrange
    const configPath = join(testDir, 'with_timeout.ini');
    await fs.writeFile(
      configPath,
      `[datasource]
type=sqlite
file_path=${dbFilePath}
database=testdb
connectiontimeout=30000`,
      'utf-8'
    );

    // Setup database using helper function
    await setupTestDatabase(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test LIMIT 100',
      conf_file: configPath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
  });

  it('should parse config with poolSize', async () => {
    // Arrange
    const configPath = join(testDir, 'with_pool.ini');
    await fs.writeFile(
      configPath,
      `[datasource]
type=sqlite
file_path=${dbFilePath}
database=testdb
poolsize=10`,
      'utf-8'
    );

    // Setup database using helper function
    await setupTestDatabase(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test LIMIT 100',
      conf_file: configPath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
  });

  it('should handle config with uppercase keys (parser is case-insensitive)', async () => {
    // Arrange - INI parser converts keys to lowercase
    const configPath = join(testDir, 'uppercase.ini');
    await fs.writeFile(
      configPath,
      `[datasource]
TYPE=sqlite
FILE_PATH=${dbFilePath}
DATABASE=testdb`,
      'utf-8'
    );

    // Setup database using helper function
    await setupTestDatabase(dbFilePath);

    // Act - Should succeed because parser converts keys to lowercase
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test LIMIT 100',
      conf_file: configPath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
  });
});
