import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { SqlNodeExecutor } from '../../../src/workflow/nodeExecutors/sqlNodeExecutor';
import type { SqlNodeConfig } from '../../../src/workflow/workflow.types';

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockGetOrCreateDatasource = vi.hoisted(() => vi.fn());
const mockExecuteQuery = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());

vi.mock('../../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    datasource: {
      findUnique: mockFindUnique,
    },
  }),
}));

vi.mock('../../../src/infrastructure/datasources/datasourceFactory', () => ({
  DatasourceFactory: {
    getOrCreateDatasource: mockGetOrCreateDatasource,
  },
}));

vi.mock('../../../src/utils/encryption', () => ({
  decryptPassword: vi.fn((value: string) => value),
}));

vi.mock('../../../src/base/config', () => ({
  config: {
    upload: {
      directory: '/uploads',
    },
    sandbox: {
      defaultWorkDir: '/workspace',
      containerName: 'test-container',
      user: 'test-user',
    },
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

let workFolder: string;

beforeEach(() => {
  workFolder = mkdtempSync(join(tmpdir(), 'wf-sql-'));
});

afterEach(() => {
  rmSync(workFolder, { recursive: true, force: true });
});

function makeContext(nodeName: string, nodeId: string, folder = workFolder) {
  const config: SqlNodeConfig = {
    nodeType: 'sql',
    datasourceId: 'ds-1',
    params: {},
    sql: 'SELECT 1 AS id, "Alice" AS name',
    outputVariable: 'sql_result',
  };

  return {
    workFolder: folder,
    nodeId,
    nodeName,
    resolvedConfig: config,
  };
}

describe('SqlNodeExecutor', () => {
  const executor = new SqlNodeExecutor();

  beforeEach(() => {
    mockFindUnique.mockReset();
    mockGetOrCreateDatasource.mockReset();
    mockExecuteQuery.mockReset();
    mockConnect.mockReset();

    mockFindUnique.mockResolvedValue({
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'test-user',
      password: undefined,
      filePath: undefined,
      schema: undefined,
      properties: undefined,
    });

    mockExecuteQuery.mockResolvedValue({
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'text' },
      ],
    });

    mockGetOrCreateDatasource.mockReturnValue({
      isConnected: true,
      connect: mockConnect,
      executeQuery: mockExecuteQuery,
    });
  });

  it('uses a readable fallback filename for Chinese node names', async () => {
    const result = await executor.execute(makeContext('查询节点', 'n1'));

    expect(result.csvPath).toBe(join(workFolder, 'sql_output_n1.csv'));
    expect(basename(result.csvPath)).toBe('sql_output_n1.csv');
    expect(result.csvPath.startsWith(workFolder)).toBe(true);
    expect(existsSync(result.csvPath)).toBe(true);
    expect(readFileSync(result.csvPath, 'utf-8')).toContain('id,name');
  });

  it('uses the fallback filename for low-information sanitized node names', async () => {
    const result = await executor.execute(makeContext('__1', 'n1'));

    expect(result.csvPath).toBe(join(workFolder, 'sql_output_n1.csv'));
    expect(existsSync(result.csvPath)).toBe(true);
  });

  it('does not overwrite fallback output for two low-information nodes in one workFolder', async () => {
    const first = await executor.execute(makeContext('__1', 'n1'));
    const second = await executor.execute(makeContext('__2', 'n2'));

    expect(first.csvPath).toBe(join(workFolder, 'sql_output_n1.csv'));
    expect(second.csvPath).toBe(join(workFolder, 'sql_output_n2.csv'));
    expect(first.csvPath).not.toBe(second.csvPath);
    expect(existsSync(first.csvPath)).toBe(true);
    expect(existsSync(second.csvPath)).toBe(true);
    expect(readFileSync(first.csvPath, 'utf-8')).toContain('Alice');
    expect(readFileSync(second.csvPath, 'utf-8')).toContain('Alice');
  });
});
