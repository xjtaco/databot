/**
 * Abstract base class for datasource implementations
 */

import logger from '../../utils/logger';
import { DatasourceConfig, QueryResult, Column, DatasourceType } from './types';
import { DatasourceConnectionError, DatasourceQueryError } from '../../errors/types';
import { config as appConfig } from '../../base/config';

/**
 * Abstract base class that defines the interface for all datasource implementations
 * Provides common functionality and enforces consistent API across different database types
 */
export abstract class Datasource {
  protected config: DatasourceConfig;
  protected connection: unknown;
  protected logger: typeof logger;
  public isConnected: boolean;
  public readonly type: DatasourceType;

  constructor(config: DatasourceConfig) {
    this.config = config;
    this.connection = null;
    this.logger = logger;
    this.isConnected = false;
    this.type = config.type;
  }

  /**
   * Establish connection to the datasource
   * @throws DatasourceConnectionError if connection fails
   */
  abstract connect(): Promise<void>;

  /**
   * Close connection to the datasource
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute a SQL query
   * @param query - SQL query string
   * @param params - Optional query parameters for parameterized queries
   * @returns QueryResult with rows, rowCount, and fields
   * @throws DatasourceQueryError if query execution fails
   */
  abstract executeQuery(query: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Get list of all table names in the database
   * @returns Array of table names
   * @throws DatasourceSchemaError if introspection fails
   */
  abstract getTables(): Promise<string[]>;

  /**
   * Get column information for a specific table
   * @param tableName - Name of the table
   * @returns Array of Column objects with metadata
   * @throws DatasourceSchemaError if introspection fails
   */
  abstract getColumns(tableName: string): Promise<Column[]>;

  /**
   * Map vendor-specific data type to normalized common type
   * @param vendorType - Vendor-specific type string
   * @returns Normalized ColumnType
   */
  protected abstract mapVendorTypeToCommon(vendorType: string): string;

  /**
   * Validate that the datasource is connected
   * @throws DatasourceConnectionError if not connected
   */
  protected validateConnected(): void {
    if (!this.isConnected) {
      throw new DatasourceConnectionError(`Datasource not connected. Please call connect() first.`);
    }
  }

  /**
   * Validate query string for potential SQL injection patterns
   * Only allows single SELECT queries (read-only operations)
   * @param query - SQL query string to validate
   * @throws DatasourceQueryError if suspicious patterns are detected
   */
  protected validateQuery(query: string): void {
    if (!query || typeof query !== 'string') {
      throw new DatasourceQueryError('Query must be a non-empty string');
    }

    const trimmedQuery = query.trim();

    // 1. Check for multiple statements (strictly reject)
    const statementCount = trimmedQuery.split(';').filter((s) => s.trim().length > 0).length;
    if (statementCount > 1) {
      throw new DatasourceQueryError(
        'Only single SQL statements are allowed. Multiple statements detected.',
        { query: trimmedQuery.substring(0, 100) }
      );
    }

    // 2. Ensure query starts with SELECT or WITH (CTE)
    // Allow leading comments and whitespace before SELECT/WITH
    const normalizedQuery = trimmedQuery
      .replace(/^\/\*[\s\S]*?\*\/\s*/g, '') // Remove block comments at start
      .replace(/^--.*$/gm, '') // Remove line comments
      .replace(/^\s+/g, ''); // Remove leading whitespace

    if (!/^(SELECT|WITH)\b/i.test(normalizedQuery)) {
      throw new DatasourceQueryError(
        'Only SELECT queries (including CTEs with WITH) are allowed. Read-only operations only.',
        { query: trimmedQuery.substring(0, 100) }
      );
    }
  }

  /**
   * Wrap a promise with timeout protection
   * @param promise - The promise to wrap
   * @param timeoutMs - Timeout in milliseconds
   * @param operation - Description of the operation for error messages
   * @returns The result of the promise or throws DatasourceQueryError on timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    operation: string
  ): Promise<T> {
    const effectiveTimeout = timeoutMs ?? appConfig.datasource.defaultQueryTimeout;
    if (!effectiveTimeout || effectiveTimeout <= 0) {
      return promise;
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new DatasourceQueryError(`Query timeout: ${operation} exceeded ${effectiveTimeout}ms`, {
            timeout: effectiveTimeout,
          })
        );
      }, effectiveTimeout);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Get the datasource type for logging/error purposes
   */
  protected getDatasourceType(): string {
    return this.config.type;
  }
}
