import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/base/config', () => ({
  config: {
    bridge: { url: 'http://localhost:8080' },
    datasource: { defaultQueryTimeout: 120000 },
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { BridgeDatasource } from '../../../src/infrastructure/datasources/bridgeDatasource';
import type { DatasourceConfig } from '../../../src/infrastructure/datasources/types';

describe('BridgeDatasource', () => {
  let ds: BridgeDatasource;
  const dsConfig: DatasourceConfig = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'testdb',
    user: 'root',
    password: 'pass',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ds = new BridgeDatasource(dsConfig);
  });

  describe('connect', () => {
    it('should register connection with Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });

      await ds.connect();
      expect(ds.isConnected).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('disconnect', () => {
    it('should destroy connection in Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
      await ds.disconnect();

      expect(ds.isConnected).toBe(false);
    });
  });

  describe('getTables', () => {
    it('should return table names from Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tables: [
            { name: 'users', schema: null, type: 'TABLE' },
            { name: 'orders', schema: null, type: 'TABLE' },
          ],
        }),
      });

      const tables = await ds.getTables();
      expect(tables).toEqual(['users', 'orders']);
    });
  });

  describe('executeQuery', () => {
    it('should execute query and convert row format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: [
            { name: 'id', type: 'INT', nullable: false },
            { name: 'name', type: 'VARCHAR', nullable: true },
          ],
          rows: [
            [1, 'Alice'],
            [2, 'Bob'],
          ],
          rowCount: 2,
          truncated: false,
        }),
      });

      const result = await ds.executeQuery('SELECT id, name FROM users');
      expect(result.rowCount).toBe(2);
      expect(result.rows).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      expect(result.fields).toEqual([
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
      ]);
    });
  });
});
