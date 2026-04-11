/**
 * Factory for creating datasource instances
 */

import { Datasource } from './base';
import { DatasourceConfig } from './types';
import { BridgeDatasource } from './bridgeDatasource';
import { SqliteDatasource } from './sqliteDatasource';
import logger from '../../utils/logger';

/**
 * Generate a unique key for a datasource based on its configuration
 * @param config - Datasource configuration
 * @returns Unique key for the datasource
 */
function generateDatasourceKey(config: DatasourceConfig): string {
  if (config.type === 'sqlite') {
    // For SQLite, use type + filepath
    const filepath = config.filepath || ':memory:';
    return `${config.type}:${filepath}`;
  } else {
    // For MySQL and PostgreSQL, use type + host + port + database + username
    const host = config.host || 'localhost';
    const port = config.port || 0;
    const user = config.user || 'default';
    return `${config.type}:${host}:${port}:${config.database}:${user}`;
  }
}

/**
 * Factory class for creating and managing datasource instances
 * Implements singleton pattern per datasource configuration
 */
class DatasourceFactoryClass {
  private datasources: Map<string, Datasource> = new Map();

  /**
   * Create a new datasource instance based on configuration
   * @param config - Datasource configuration
   * @returns Datasource instance
   * @throws Error if datasource type is unknown or not implemented
   */
  createDatasource(config: DatasourceConfig): Datasource {
    switch (config.type) {
      case 'sqlite':
        return new SqliteDatasource(config);
      default:
        return new BridgeDatasource(config);
    }
  }

  /**
   * Get or create a datasource instance based on configuration
   * Implements singleton pattern - caches datasource instances per unique configuration
   * @param config - Datasource configuration
   * @returns Datasource instance (cached or newly created)
   */
  getOrCreateDatasource(config: DatasourceConfig): Datasource {
    const key = generateDatasourceKey(config);

    if (!this.datasources.has(key)) {
      const datasource = this.createDatasource(config);
      this.datasources.set(key, datasource);
      logger.debug(`Created new datasource instance: ${key} (${config.type})`);
    }

    return this.datasources.get(key)!;
  }

  /**
   * Get an existing datasource instance by configuration
   * @param config - Datasource configuration
   * @returns Datasource instance or undefined if not found
   */
  getDatasource(config: DatasourceConfig): Datasource | undefined {
    const key = generateDatasourceKey(config);
    return this.datasources.get(key);
  }

  /**
   * Disconnect all cached datasource instances and clear the cache
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const [key, datasource] of this.datasources.entries()) {
      logger.debug(`Disconnecting datasource: ${key}`);
      disconnectPromises.push(datasource.disconnect());
    }

    await Promise.all(disconnectPromises);

    this.datasources.clear();
    logger.debug('All datasources disconnected and cache cleared');
  }

  /**
   * Check if a datasource with the given configuration is cached
   * @param config - Datasource configuration
   * @returns true if datasource is cached
   */
  hasCachedDatasource(config: DatasourceConfig): boolean {
    const key = generateDatasourceKey(config);
    return this.datasources.has(key);
  }

  /**
   * Clear all cached datasource instances without disconnecting
   * Useful for testing or manual connection management
   */
  clearCache(): void {
    this.datasources.clear();
    logger.debug('Datasource cache cleared');
  }
}

// Export singleton instance
export const DatasourceFactory = new DatasourceFactoryClass();
