/**
 * Bridge datasource implementation
 * Delegates all database operations to the JDBC Bridge REST API
 */

import { Datasource } from './base';
import { bridgeClient } from '../../datasource/bridgeClient';
import { mapVendorType } from '../../datasource/typeMapper';
import type { DatasourceConfig, Column, QueryResult } from './types';
import type { DatabaseType } from '../../datasource/datasource.types';
import logger from '../../utils/logger';
import { config as appConfig } from '../../base/config';

export class BridgeDatasource extends Datasource {
  private connectionId: string;

  constructor(config: DatasourceConfig) {
    super(config);
    this.connectionId = `${config.type}:${config.host}:${config.port}:${config.database}:${config.user}`;
  }

  async connect(): Promise<void> {
    await bridgeClient.registerConnection(this.connectionId, {
      dbType: this.config.type as DatabaseType,
      host: this.config.host || 'localhost',
      port: this.config.port || 0,
      database: this.config.database,
      user: this.config.user || '',
      password: this.config.password || '',
      schema: this.config.schema,
      properties: this.config.properties,
    });
    this.isConnected = true;
    logger.info(`Bridge datasource connected: ${this.connectionId}`);
  }

  async disconnect(): Promise<void> {
    try {
      await bridgeClient.destroyConnection(this.connectionId);
    } catch (err) {
      logger.warn(
        `Failed to destroy bridge connection ${this.connectionId}: ${(err as Error).message}`
      );
    }
    this.isConnected = false;
    logger.info(`Bridge datasource disconnected: ${this.connectionId}`);
  }

  async executeQuery(query: string, _params?: unknown[]): Promise<QueryResult> {
    this.validateConnected();
    this.validateQuery(query);

    const bridgeConfig = {
      dbType: this.config.type as DatabaseType,
      host: this.config.host || 'localhost',
      port: this.config.port || 0,
      database: this.config.database,
      user: this.config.user || '',
      password: this.config.password || '',
      schema: this.config.schema,
      properties: this.config.properties,
    };

    const result = await bridgeClient.executeQuery(this.connectionId, query, bridgeConfig, {
      timeoutMs: this.config.queryTimeout ?? appConfig.datasource.defaultQueryTimeout,
    });

    // Convert Bridge rows (unknown[][]) to QueryResult rows (Record<string, unknown>[])
    const rows = result.rows.map((row) => {
      const record: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        record[col.name] = row[i];
      });
      return record;
    });

    return {
      rows,
      rowCount: result.rowCount,
      fields: result.columns.map((col) => ({
        name: col.name,
        type: this.mapVendorTypeToCommon(col.type),
      })),
    };
  }

  async getTables(): Promise<string[]> {
    this.validateConnected();
    const tables = await bridgeClient.getTables(this.connectionId);
    return tables.map((t) => t.name);
  }

  async getColumns(tableName: string): Promise<Column[]> {
    this.validateConnected();
    const columns = await bridgeClient.getColumns(this.connectionId, tableName);
    return columns.map((col) => ({
      name: col.name,
      type: this.mapVendorTypeToCommon(col.type),
      nullable: col.nullable,
      primaryKey: col.isPrimaryKey,
      defaultValue: col.defaultValue ?? undefined,
    }));
  }

  protected mapVendorTypeToCommon(vendorType: string): string {
    return mapVendorType(this.config.type as DatabaseType, vendorType);
  }
}
