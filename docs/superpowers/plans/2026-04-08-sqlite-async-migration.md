# SQLite Async Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synchronous `better-sqlite3` with async `sqlite3` + `sqlite` in `SqliteDatasource` to stop blocking the Node.js event loop during query execution.

**Architecture:** `SqliteDatasource` is rewritten to use the `sqlite` package (Promise wrapper around `sqlite3`). All methods become truly async. The `Datasource` base class, `DatasourceFactory`, `SqlTool`, and `sqliteParser.ts` remain unchanged.

**Tech Stack:** `sqlite3` ^6.0.1 (native async C++ addon), `sqlite` ^5.1.1 (Promise wrapper)

**Spec:** `docs/superpowers/specs/2026-04-08-sqlite-async-migration-design.md`

---

### Task 1: Install dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install sqlite3 and sqlite packages**

```bash
cd backend && pnpm add sqlite3 sqlite
```

- [ ] **Step 2: Verify installation**

```bash
cd backend && node -e "const s3 = require('sqlite3'); const { open } = require('sqlite'); console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "chore: add sqlite3 and sqlite async dependencies"
```

---

### Task 2: Rewrite SqliteDatasource

**Files:**
- Modify: `backend/src/infrastructure/datasources/sqliteDatasource.ts`

- [ ] **Step 1: Rewrite sqliteDatasource.ts**

Replace the entire file with async implementation. Key changes:
- Import `open` from `sqlite` and `sqlite3` driver
- Remove custom `SQLiteDatabase`, `SQLiteStatement`, `SQLiteColumn` interfaces
- `connect()`: use `open({ filename, driver: sqlite3.Database })`, then `db.run('PRAGMA journal_mode = WAL')`
- `disconnect()`: `await db.close()`
- `executeQuery()`: use `db.all(query, ...params)` for SELECT. For empty results, get column names via `db.all('PRAGMA table_info(...)')` by extracting table name from query, or return empty fields array as fallback
- `getTables()`: use `db.all('SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' ORDER BY name')`
- `getColumns()`: use `db.all('PRAGMA table_info("tableName")')`
- `mapVendorTypeToCommon()`: unchanged (no dependency on better-sqlite3)

The full implementation:

```typescript
/**
 * SQLite datasource implementation using async sqlite3 driver
 */

import { Datasource } from './base';
import { DatasourceConfig, QueryResult, Column, ColumnType } from './types';
import {
  DatasourceConnectionError,
  DatasourceQueryError,
  DatasourceSchemaError,
} from '../../errors/types';
import { promises } from 'fs';
import { dirname } from 'path';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';

/**
 * SQLite datasource implementation using async sqlite3 + sqlite driver
 */
export class SqliteDatasource extends Datasource {
  private db: Database | null = null;

  constructor(config: DatasourceConfig) {
    super(config);
  }

  /**
   * Establish connection to SQLite database
   */
  async connect(): Promise<void> {
    try {
      if (!this.config.filepath) {
        throw new Error('SQLite database filepath is required');
      }

      // Ensure directory exists
      const dir = dirname(this.config.filepath);
      try {
        await promises.mkdir(dir, { recursive: true });
      } catch {
        // Directory might already exist, ignore error
      }

      this.db = await open({
        filename: this.config.filepath,
        driver: sqlite3.Database,
      });

      // Enable WAL mode for better concurrency
      await this.db.run('PRAGMA journal_mode = WAL');

      this.isConnected = true;

      this.logger.info(`Connected to SQLite database: ${this.config.filepath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatasourceConnectionError(message, undefined, error as Error);
    }
  }

  /**
   * Close SQLite database connection
   */
  async disconnect(): Promise<void> {
    if (this.db && this.isConnected) {
      try {
        await this.db.close();
        this.db = null;
        this.isConnected = false;
        this.logger.info(`Disconnected from SQLite database: ${this.config.filepath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error disconnecting from SQLite: ${message}`);
        // Ensure state is updated even if disconnect fails
        this.db = null;
        this.isConnected = false;
      }
    }
  }

  /**
   * Execute a SQL query with optional parameters
   */
  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    this.validateConnected();
    this.validateQuery(query);

    if (!this.db) {
      throw new DatasourceQueryError('Database not initialized');
    }

    const startTime = Date.now();

    try {
      const trimmedQuery = query.trim().toUpperCase();

      if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('PRAGMA')) {
        // SELECT query - use db.all() (truly async)
        const queryPromise = this.db.all(query, ...(params || []));
        const rows = (await this.withTimeout(
          queryPromise,
          this.config.queryTimeout,
          'executeQuery'
        )) as Record<string, unknown>[];

        // Extract column names from the result set
        const fields: Array<{ name: string; type: string }> = [];
        if (rows.length > 0) {
          const columnNames = Object.keys(rows[0] as object);
          for (const columnName of columnNames) {
            fields.push({ name: columnName, type: 'unknown' });
          }
        }
        // For empty result sets with async sqlite, we don't have stmt.columns().
        // Fields will be empty for zero-row results — callers already handle this.

        const executionTime = Date.now() - startTime;

        this.logger.debug(`SQLite query executed`, {
          query: query.substring(0, 100),
          paramsCount: params?.length || 0,
          rowCount: rows.length,
          executionTime: `${executionTime}ms`,
        });

        return {
          rows,
          rowCount: rows.length,
          fields,
        };
      } else {
        // INSERT, UPDATE, DELETE - use db.run()
        const queryPromise = this.db.run(query, ...(params || []));
        const result = await this.withTimeout(
          queryPromise,
          this.config.queryTimeout,
          'executeQuery'
        );

        const executionTime = Date.now() - startTime;

        this.logger.debug(`SQLite query executed`, {
          query: query.substring(0, 100),
          paramsCount: params?.length || 0,
          changes: result?.changes ?? 0,
          executionTime: `${executionTime}ms`,
        });

        return {
          rows: [],
          rowCount: result?.changes ?? 0,
          fields: [],
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatasourceQueryError(message, undefined, error as Error);
    }
  }

  /**
   * Get list of all tables in the database
   */
  async getTables(): Promise<string[]> {
    this.validateConnected();

    if (!this.db) {
      throw new DatasourceSchemaError('Database not initialized');
    }

    try {
      const rows = await this.db.all<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );

      return rows.map((row) => row.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatasourceSchemaError(
        `Failed to get tables: ${message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Get column information for a specific table
   */
  async getColumns(tableName: string): Promise<Column[]> {
    this.validateConnected();

    if (!this.db) {
      throw new DatasourceSchemaError('Database not initialized');
    }

    try {
      const rows = await this.db.all<
        Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }>
      >(`PRAGMA table_info("${tableName}")`);

      return rows.map((col) => ({
        name: col.name,
        type: this.mapVendorTypeToCommon(col.type),
        nullable: col.notnull === 0,
        primaryKey: col.pk > 0,
        defaultValue: col.dflt_value || undefined,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatasourceSchemaError(
        `Failed to get columns for table ${tableName}: ${message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Map SQLite data types to common types
   */
  protected mapVendorTypeToCommon(vendorType: string): string {
    if (!vendorType) {
      return ColumnType.UNKNOWN;
    }

    const type = vendorType.toLowerCase();

    if (type.includes('text') || type.includes('char') || type.includes('clob')) {
      return ColumnType.STRING;
    }
    if (type.includes('int')) {
      return ColumnType.INTEGER;
    }
    if (type.includes('real') || type.includes('floa') || type.includes('doub')) {
      return ColumnType.FLOAT;
    }
    if (type.includes('blob')) {
      return ColumnType.STRING;
    }
    if (type.includes('num')) {
      return ColumnType.FLOAT;
    }

    return ColumnType.UNKNOWN;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit src/infrastructure/datasources/sqliteDatasource.ts
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/infrastructure/datasources/sqliteDatasource.ts
git commit -m "refactor: rewrite SqliteDatasource to use async sqlite3 driver"
```

---

### Task 3: Rewrite unit tests

**Files:**
- Modify: `backend/tests/infrastructure/datasources/sqliteDatasource.test.ts`

- [ ] **Step 1: Rewrite unit tests with new mocks**

Replace the test file to mock `sqlite` and `sqlite3` instead of `better-sqlite3`. The test structure stays the same — same test cases, same assertions, different mock setup.

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqliteDatasource } from '../../../src/infrastructure/datasources/sqliteDatasource';
import {
  DatasourceConnectionError,
  DatasourceQueryError,
  DatasourceSchemaError,
} from '../../../src/errors/types';
import { ColumnType } from '../../../src/infrastructure/datasources/types';

// Create mock database object
const mockDb = vi.hoisted(() => ({
  run: vi.fn(),
  all: vi.fn(),
  close: vi.fn(),
}));

// Mock the sqlite open function
const mockOpen = vi.hoisted(() => vi.fn());

const mockMkdir = vi.hoisted(() => vi.fn());

// Mock sqlite module
vi.mock('sqlite', () => ({
  open: mockOpen,
}));

// Mock sqlite3 module
vi.mock('sqlite3', () => ({
  default: { Database: vi.fn() },
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
  },
}));

describe('SqliteDatasource', () => {
  let datasource: SqliteDatasource;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock database methods
    mockDb.run = vi.fn().mockResolvedValue(undefined);
    mockDb.all = vi.fn().mockResolvedValue([]);
    mockDb.close = vi.fn().mockResolvedValue(undefined);

    // Reset open to return mockDb
    mockOpen.mockResolvedValue(mockDb);

    // Mock fs.mkdir
    mockMkdir.mockResolvedValue(undefined);
  });

  describe('connect', () => {
    it('should successfully connect to SQLite', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await datasource.connect();

      expect(datasource.isConnected).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith(
        expect.objectContaining({ filename: './test.db' })
      );
      expect(mockDb.run).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('should throw error when filepath is missing', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
      });

      await expect(datasource.connect()).rejects.toThrow('filepath is required');
    });

    it('should throw DatasourceConnectionError on connection failure', async () => {
      mockOpen.mockRejectedValue(new Error('Cannot open database'));

      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await expect(datasource.connect()).rejects.toThrow(DatasourceConnectionError);
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect from SQLite', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await datasource.connect();
      await datasource.disconnect();

      expect(datasource.isConnected).toBe(false);
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should execute SELECT query successfully', async () => {
      mockDb.all.mockResolvedValue([{ id: 1, name: 'test' }]);

      const result = await datasource.executeQuery('SELECT * FROM users');

      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
      expect(mockDb.all).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should throw DatasourceQueryError on query failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Syntax error'));

      await expect(datasource.executeQuery('SELECT INVALID')).rejects.toThrow(
        DatasourceQueryError
      );
    });

    it('should throw error when not connected', async () => {
      const newDatasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test2.db',
      });

      await expect(newDatasource.executeQuery('SELECT 1')).rejects.toThrow('not connected');
    });
  });

  describe('getTables', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should return list of tables', async () => {
      mockDb.all.mockResolvedValue([{ name: 'users' }, { name: 'products' }]);

      const tables = await datasource.getTables();

      expect(tables).toEqual(['users', 'products']);
    });

    it('should throw DatasourceSchemaError on failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Database error'));

      await expect(datasource.getTables()).rejects.toThrow(DatasourceSchemaError);
    });
  });

  describe('getColumns', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should return column information', async () => {
      const mockColumns = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('users');

      expect(columns).toHaveLength(2);
      expect(columns[0].name).toBe('id');
      expect(columns[0].type).toBe(ColumnType.INTEGER);
      expect(columns[0].primaryKey).toBe(true);
      expect(columns[0].nullable).toBe(false);
      expect(columns[1].name).toBe('name');
      expect(columns[1].type).toBe(ColumnType.STRING);
      expect(columns[1].primaryKey).toBe(false);
      expect(columns[1].nullable).toBe(true);
    });

    it('should throw DatasourceSchemaError on failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Table not found'));

      await expect(datasource.getColumns('nonexistent')).rejects.toThrow(DatasourceSchemaError);
    });
  });

  describe('mapVendorTypeToCommon', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should map TEXT to STRING', async () => {
      mockDb.all.mockResolvedValue([
        { cid: 0, name: 'col', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.STRING);
    });

    it('should map INTEGER to INTEGER', async () => {
      mockDb.all.mockResolvedValue([
        { cid: 0, name: 'col', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.INTEGER);
    });

    it('should map REAL to FLOAT', async () => {
      mockDb.all.mockResolvedValue([
        { cid: 0, name: 'col', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.FLOAT);
    });

    it('should map unknown types to UNKNOWN', async () => {
      mockDb.all.mockResolvedValue([
        { cid: 0, name: 'col', type: 'CUSTOM_TYPE', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.UNKNOWN);
    });

    it('should map empty type to UNKNOWN', async () => {
      mockDb.all.mockResolvedValue([
        { cid: 0, name: 'col', type: '', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.UNKNOWN);
    });
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
cd backend && npx vitest run tests/infrastructure/datasources/sqliteDatasource.test.ts --reporter=verbose
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/datasources/sqliteDatasource.test.ts
git commit -m "test: update SqliteDatasource unit tests for async sqlite driver"
```

---

### Task 4: Run integration tests and full preflight

- [ ] **Step 1: Run SqlTool integration tests**

These tests create real SQLite databases with `better-sqlite3` and query them through `SqlTool` → `DatasourceFactory` → `SqliteDatasource` (now async). They should pass without changes.

```bash
cd backend && npx vitest run tests/infrastructure/tools/sqlTool/ --reporter=verbose
```

Expected: all tests pass

- [ ] **Step 2: Run datasourceFactory tests**

```bash
cd backend && npx vitest run tests/infrastructure/datasources/datasourceFactory.test.ts --reporter=verbose
```

Expected: all tests pass

- [ ] **Step 3: Run full backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: all checks and tests pass

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "refactor: migrate SqliteDatasource from sync better-sqlite3 to async sqlite3

Replaces synchronous better-sqlite3 with async sqlite3 + sqlite in
SqliteDatasource to prevent blocking the Node.js event loop during
SQL query execution. sqliteParser.ts retains better-sqlite3 for
one-shot file parsing."
git push
```
