import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/base/config', () => ({
  config: { bridge: { url: 'http://localhost:8080' } },
}));

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { BridgeClient } from '../../src/datasource/bridgeClient';

describe('BridgeClient', () => {
  const client = new BridgeClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should call POST /connections/test', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Connection successful' }),
      });

      const result = await client.testConnection({
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: 'pass',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections/test',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw on connection failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'CONNECTION_FAILED', message: 'refused' }),
      });

      await expect(
        client.testConnection({
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          database: 'test',
          user: 'root',
          password: 'pass',
        })
      ).rejects.toThrow();
    });
  });

  describe('registerConnection', () => {
    it('should call POST /connections', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'abc', status: 'registered' }),
      });

      await client.registerConnection('abc', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        user: 'user',
        password: 'pass',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('executeQuery with retry on eviction', () => {
    it('should retry once on CONNECTION_NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'CONNECTION_NOT_FOUND', message: 'not found' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'abc', status: 'registered' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ columns: [], rows: [], rowCount: 0, truncated: false }),
      });

      const config = {
        dbType: 'mysql' as const,
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: 'pass',
      };
      const result = await client.executeQuery('abc', 'SELECT 1', config);

      expect(result.rowCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('destroyConnection', () => {
    it('should call DELETE /connections/{id}', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await client.destroyConnection('abc');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections/abc',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
