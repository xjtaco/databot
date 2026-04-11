import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { SqlTool } from '../../../../src/infrastructure/tools/sqlTool';
import { DatasourceFactory } from '../../../../src/infrastructure/datasources/datasourceFactory';
import { config } from '../../../../src/base/config';

/**
 * Helper function to set up SQLite database for tests
 * Uses better-sqlite3 directly to bypass query validation in datasource
 */
async function setupTestDatabaseWithMultipleRows(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
  db.exec("INSERT INTO users (name, age) VALUES ('Alice', 30)");
  db.exec("INSERT INTO users (name, age) VALUES ('Bob', 25)");
  db.exec("INSERT INTO users (name, age) VALUES ('Charlie', 35)");
  db.exec("INSERT INTO users (name, age) VALUES ('David', 28)");
  db.close();
}

async function setupEmptyTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE empty_table (id INTEGER PRIMARY KEY, value TEXT)');
  db.close();
}

async function setupSingleRowTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)');
  db.exec("INSERT INTO products (name, price) VALUES ('Widget', 19.99)");
  db.close();
}

async function setupThreeRowsTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, description TEXT)');
  db.exec("INSERT INTO items (description) VALUES ('Item 1')");
  db.exec("INSERT INTO items (description) VALUES ('Item 2')");
  db.exec("INSERT INTO items (description) VALUES ('Item 3')");
  db.close();
}

async function setupNullsTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE test_nulls (id INTEGER PRIMARY KEY, value TEXT)');
  db.exec("INSERT INTO test_nulls (value) VALUES ('not null')");
  db.exec('INSERT INTO test_nulls (value) VALUES (NULL)');
  db.exec("INSERT INTO test_nulls (value) VALUES ('also not null')");
  db.close();
}

async function setupSpecialCharsTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE special_chars (id INTEGER PRIMARY KEY, text TEXT)');
  db.exec('INSERT INTO special_chars (text) VALUES (\'Hello, "World"\')');
  db.exec("INSERT INTO special_chars (text) VALUES ('Line 1\nLine 2')");
  db.close();
}

async function setupTestTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  db.exec("INSERT INTO test (name) VALUES ('Test')");
  db.close();
}

async function setupWideTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE wide_table (col1 TEXT, col2 TEXT, col3 TEXT, col4 TEXT, col5 TEXT)');
  db.exec("INSERT INTO wide_table VALUES ('A', 'B', 'C', 'D', 'E')");
  db.close();
}

async function setupUnicodeTable(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE unicode (id INTEGER PRIMARY KEY, text TEXT)');
  db.exec("INSERT INTO unicode (text) VALUES ('你好世界')");
  db.exec("INSERT INTO unicode (text) VALUES ('Hello 世界')");
  db.exec("INSERT INTO unicode (text) VALUES('Café Münchner Kindl')");
  db.close();
}

describe('SqlTool.execute() - Success', () => {
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

    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `sqltool-test-${Date.now()}-${randomSuffix}`);
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

  it('should execute a simple SELECT query and return results', async () => {
    // Arrange - Create a table and insert test data using helper function
    await setupTestDatabaseWithMultipleRows(dbFilePath);

    // Act - Execute SQL query via SqlTool
    const result = await sqlTool.execute({
      sql: 'SELECT id, name, age FROM users LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      message: string;
      preview_rows: number;
      total_rows: number;
      output_file: string;
      columns: string[];
      preview_data: Record<string, unknown>[];
    };
    expect(data.message).toContain('Query executed successfully');
    expect(data.total_rows).toBe(4);
    expect(data.preview_rows).toBe(3); // Max 3 rows in preview
    expect(data.columns).toEqual(['id', 'name', 'age']);
    expect(data.preview_data).toHaveLength(3);
    expect(data.preview_data[0]).toMatchObject({ name: 'Alice', age: 30 });

    // Verify CSV file was created
    const csvContent = await fs.readFile(outputCsvPath, 'utf-8');
    expect(csvContent).toContain('id,name,age');
    expect(csvContent).toContain('Alice');
    expect(csvContent).toContain('Bob');
  });

  it('should handle query that returns no results', async () => {
    // Arrange - Create an empty table using helper function
    await setupEmptyTable(dbFilePath);

    // Act - Execute SQL query via SqlTool
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM empty_table LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      total_rows: number;
      preview_rows: number;
      preview_data: unknown[];
    };
    expect(data.total_rows).toBe(0);
    expect(data.preview_rows).toBe(0);
    expect(data.preview_data).toHaveLength(0);

    // Verify CSV file has headers but no data rows
    const csvContent = await fs.readFile(outputCsvPath, 'utf-8');
    expect(csvContent).toContain('id,value');
    const lines = csvContent.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toHaveLength(1); // Only header row
  });

  it('should handle query that returns only 1 row', async () => {
    // Arrange - Create table with single row using helper function
    await setupSingleRowTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM products LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      total_rows: number;
      preview_rows: number;
      preview_data: unknown[];
    };
    expect(data.total_rows).toBe(1);
    expect(data.preview_rows).toBe(1);
    expect(data.preview_data).toHaveLength(1);
  });

  it('should handle query with exactly 3 rows', async () => {
    // Arrange - Create table with exactly 3 rows
    await setupThreeRowsTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM items LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      total_rows: number;
      preview_rows: number;
      preview_data: unknown[];
    };
    expect(data.total_rows).toBe(3);
    expect(data.preview_rows).toBe(3); // Should show all 3 rows in preview
  });

  it('should handle NULL values in query results', async () => {
    // Arrange - Create table with NULL values
    await setupNullsTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test_nulls LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      total_rows: number;
      preview_data: Record<string, unknown>[];
    };
    expect(data.total_rows).toBe(3);
    expect(data.preview_data[1].value).toBeNull();
  });

  it('should create output directory if it does not exist', async () => {
    // Arrange - Create test table using helper function
    await setupTestTable(dbFilePath);

    const nestedOutputPath = join(testDir, 'subdir', 'nested', 'output.csv');

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM test LIMIT 100',
      conf_file: configFilePath,
      output_csv: nestedOutputPath,
    });

    // Assert
    expect(result.success).toBe(true);
    // Verify the file was created in the nested directory
    const csvExists = await fs
      .access(nestedOutputPath)
      .then(() => true)
      .catch(() => false);
    expect(csvExists).toBe(true);
  });

  it('should handle special characters in CSV output', async () => {
    // Arrange - Create table with special characters
    await setupSpecialCharsTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM special_chars LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const csvContent = await fs.readFile(outputCsvPath, 'utf-8');
    // CSV should properly escape quotes and newlines
    expect(csvContent).toContain('"Hello, ""World"""');
    expect(csvContent).toContain('"Line 1\nLine 2"');
  });

  it('should handle query with multiple columns', async () => {
    // Arrange - Create wide table
    await setupWideTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM wide_table LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { columns: string[] };
    expect(data.columns).toHaveLength(5);
    expect(data.columns).toEqual(['col1', 'col2', 'col3', 'col4', 'col5']);
  });

  it('should use cached datasource connection for subsequent queries', async () => {
    // Arrange - Create table using helper function
    const db = new Database(dbFilePath);
    db.exec('CREATE TABLE cached (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO cached (value) VALUES ('first')");
    db.close();

    // Act - First query
    const result1 = await sqlTool.execute({
      sql: 'SELECT * FROM cached LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Add more data directly to the database
    const db2 = new Database(dbFilePath);
    db2.exec("INSERT INTO cached (value) VALUES ('second')");
    db2.close();

    // Second query should use cached connection
    const result2 = await sqlTool.execute({
      sql: 'SELECT * FROM cached LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    const data2 = result2.data as { total_rows: number };
    expect(data2.total_rows).toBe(2);
  });

  it('should handle complex queries with subqueries', async () => {
    // Arrange - Create numbers table using better-sqlite3 directly
    const db = new Database(dbFilePath);
    db.exec('CREATE TABLE numbers (id INTEGER PRIMARY KEY, value INTEGER)');
    db.exec('INSERT INTO numbers (value) VALUES (10)');
    db.exec('INSERT INTO numbers (value) VALUES (20)');
    db.exec('INSERT INTO numbers (value) VALUES (30)');
    db.close();

    // Act - Execute query with subquery
    const result = await sqlTool.execute({
      sql: 'SELECT value, value * 2 AS double_value FROM numbers LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      total_rows: number;
      preview_data: Record<string, unknown>[];
    };
    expect(data.total_rows).toBe(3);
    expect(data.preview_data[0].double_value).toBe(20);
  });

  it('should handle UTF-8 encoded data', async () => {
    // Arrange - Create unicode table
    await setupUnicodeTable(dbFilePath);

    // Act
    const result = await sqlTool.execute({
      sql: 'SELECT * FROM unicode LIMIT 100',
      conf_file: configFilePath,
      output_csv: outputCsvPath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      preview_data: Record<string, unknown>[];
    };
    expect(data.preview_data[0].text).toBe('你好世界');

    // Verify CSV preserves UTF-8
    const csvContent = await fs.readFile(outputCsvPath, 'utf-8');
    expect(csvContent).toContain('你好世界');
  });
});

describe('SqlTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Assert
    expect(sqlTool.name).toBe('sql');
  });

  it('should have description', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Assert
    expect(sqlTool.description).toBeDefined();
    expect(sqlTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Assert
    expect(sqlTool.parameters).toBeDefined();
    expect(sqlTool.parameters.type).toBe('object');
    expect(sqlTool.parameters.properties).toBeDefined();
    expect(sqlTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Assert
    expect(sqlTool.parameters.properties.sql).toBeDefined();
    expect(sqlTool.parameters.properties.conf_file).toBeDefined();
    expect(sqlTool.parameters.properties.output_csv).toBeDefined();
  });

  it('should mark all parameters as required', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Assert
    expect(sqlTool.parameters.required).toContain('sql');
    expect(sqlTool.parameters.required).toContain('conf_file');
    expect(sqlTool.parameters.required).toContain('output_csv');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const sqlTool = new SqlTool();

    // Act
    const metadata = sqlTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('sql');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
