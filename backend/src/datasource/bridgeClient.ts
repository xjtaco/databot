import { config } from '../base/config';
import { DatasourceConnectionError, DatasourceQueryError } from '../errors/types';
import logger from '../utils/logger';
import type {
  DatabaseConnectionConfig,
  BridgeTestResult,
  BridgeQueryResult,
  BridgeTableInfo,
  BridgeColumnInfo,
  BridgeErrorResponse,
} from './datasource.types';

export class BridgeClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.bridge.url;
  }

  async testConnection(connectionConfig: DatabaseConnectionConfig): Promise<BridgeTestResult> {
    const response = await this.post('/connections/test', connectionConfig);
    return response as BridgeTestResult;
  }

  async registerConnection(id: string, connectionConfig: DatabaseConnectionConfig): Promise<void> {
    await this.post('/connections', { ...connectionConfig, id });
  }

  async destroyConnection(id: string): Promise<void> {
    await this.request('DELETE', `/connections/${id}`);
  }

  async getDatabases(id: string): Promise<string[]> {
    const result = await this.get(`/connections/${id}/databases`);
    return (result as { databases: string[] }).databases;
  }

  async getSchemas(id: string): Promise<Array<{ schema: string; catalog: string | null }>> {
    const result = await this.get(`/connections/${id}/schemas`);
    return (result as { schemas: Array<{ schema: string; catalog: string | null }> }).schemas;
  }

  async getTables(id: string, schema?: string): Promise<BridgeTableInfo[]> {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    const result = await this.get(`/connections/${id}/tables${query}`);
    return (result as { tables: BridgeTableInfo[] }).tables;
  }

  async getColumns(id: string, table: string, schema?: string): Promise<BridgeColumnInfo[]> {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    const result = await this.get(
      `/connections/${id}/tables/${encodeURIComponent(table)}/columns${query}`
    );
    return (result as { columns: BridgeColumnInfo[] }).columns;
  }

  async executeQuery(
    id: string,
    sql: string,
    connectionConfig?: DatabaseConnectionConfig,
    options?: { maxRows?: number; timeoutMs?: number }
  ): Promise<BridgeQueryResult> {
    const body = { sql, maxRows: options?.maxRows, timeoutMs: options?.timeoutMs };

    try {
      return (await this.post(`/connections/${id}/query`, body)) as BridgeQueryResult;
    } catch (err) {
      if (
        connectionConfig &&
        err instanceof DatasourceConnectionError &&
        err.message.includes('CONNECTION_NOT_FOUND')
      ) {
        logger.info(`Connection ${id} was evicted, re-registering and retrying`);
        await this.registerConnection(id, connectionConfig);
        return (await this.post(`/connections/${id}/query`, body)) as BridgeQueryResult;
      }
      throw err;
    }
  }

  private async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      throw new DatasourceConnectionError(`Bridge request failed: ${(err as Error).message}`);
    }

    if (method === 'DELETE' && response.status === 204) {
      return undefined;
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorBody = json as unknown as BridgeErrorResponse;
      const errorMessage = errorBody.message || `Bridge returned ${String(response.status)}`;

      if (errorBody.error === 'CONNECTION_NOT_FOUND') {
        throw new DatasourceConnectionError(`CONNECTION_NOT_FOUND: ${errorMessage}`);
      }
      if (errorBody.error === 'TIMEOUT') {
        throw new DatasourceQueryError(`Query timeout: ${errorMessage}`);
      }
      if (errorBody.error === 'QUERY_ERROR') {
        throw new DatasourceQueryError(errorMessage);
      }
      throw new DatasourceConnectionError(errorMessage);
    }

    return json;
  }
}

export const bridgeClient = new BridgeClient();
