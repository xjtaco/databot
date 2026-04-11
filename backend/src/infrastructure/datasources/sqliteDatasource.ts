/**
 * SQLite datasource implementation using async sqlite/sqlite3 driver
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
 * SQLite datasource implementation using async sqlite/sqlite3 driver
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

      // Verify connection and enable WAL mode
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
      // Determine if this is a SELECT query or other type
      const trimmedQuery = query.trim().toUpperCase();

      if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('PRAGMA')) {
        // SELECT query - use all()
        const queryPromise = this.db.all<Record<string, unknown>[]>(query, ...(params || []));
        const rows = await this.withTimeout(queryPromise, this.config.queryTimeout, 'executeQuery');

        // Extract column names from the result set
        const fields: Array<{ name: string; type: string }> = [];
        if (rows.length > 0) {
          const columnNames = Object.keys(rows[0] as object);
          for (const columnName of columnNames) {
            fields.push({ name: columnName, type: 'unknown' });
          }
        } else {
          // For empty result sets, try to get columns via PRAGMA table_info
          const tableName = this.extractTableName(query);
          if (tableName && this.db) {
            try {
              const cols = await this.db.all<Array<{ name: string; type: string }>>(
                `PRAGMA table_info("${tableName}")`
              );
              for (const col of cols) {
                fields.push({ name: col.name, type: col.type || 'unknown' });
              }
            } catch {
              // Best-effort — return empty fields if PRAGMA fails
            }
          }
        }

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
        // INSERT, UPDATE, DELETE - use run()
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
          changes: result.changes,
          executionTime: `${executionTime}ms`,
        });

        return {
          rows: [],
          rowCount: result.changes ?? 0,
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
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
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
   * Extract the primary table name from a SELECT query's FROM clause.
   * Returns null if parsing fails — callers should treat this as best-effort.
   */
  private extractTableName(query: string): string | null {
    const match = /\bFROM\s+["']?(\w+)["']?/i.exec(query);
    return match ? match[1] : null;
  }

  /**
   * Map SQLite data types to common types
   * SQLite uses type affinity, so this is a best-effort mapping
   */
  protected mapVendorTypeToCommon(vendorType: string): string {
    if (!vendorType) {
      return ColumnType.UNKNOWN;
    }

    const type = vendorType.toLowerCase();

    // TEXT affinity
    if (type.includes('text') || type.includes('char') || type.includes('clob')) {
      return ColumnType.STRING;
    }

    // INTEGER affinity
    if (type.includes('int')) {
      return ColumnType.INTEGER;
    }

    // REAL affinity
    if (type.includes('real') || type.includes('floa') || type.includes('doub')) {
      return ColumnType.FLOAT;
    }

    // BLOB affinity
    if (type.includes('blob')) {
      return ColumnType.STRING;
    }

    // Numeric type - default to FLOAT
    if (type.includes('num')) {
      return ColumnType.FLOAT;
    }

    return ColumnType.UNKNOWN;
  }
}
