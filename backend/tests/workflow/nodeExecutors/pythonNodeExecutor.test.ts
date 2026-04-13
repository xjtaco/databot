import { promises as fs } from 'fs';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildWrappedScript,
  PythonNodeExecutor,
} from '../../../src/workflow/nodeExecutors/pythonNodeExecutor';
import type { PythonNodeConfig } from '../../../src/workflow/workflow.types';

const mockExecuteInContainer = vi.hoisted(() => vi.fn());

vi.mock('../../../src/infrastructure/sandbox/dockerExecutor', () => ({
  executeInContainer: mockExecuteInContainer,
}));

vi.mock('../../../src/base/config', () => ({
  config: {
    work_folder: '/workspace',
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
  workFolder = mkdtempSync(join(tmpdir(), 'wf-python-'));
});

afterEach(() => {
  rmSync(workFolder, { recursive: true, force: true });
});

function makeContext(nodeName: string, nodeId: string, folder = workFolder) {
  const config: PythonNodeConfig = {
    nodeType: 'python',
    params: { message: 'hello' },
    script: 'result = {"ok": True}',
    outputVariable: 'python_result',
  };

  return {
    workFolder: folder,
    nodeId,
    nodeName,
    resolvedConfig: config,
  };
}

describe('buildWrappedScript', () => {
  const script = buildWrappedScript('test_params.json', 'x = 1');

  it('defines WORKSPACE before user script', () => {
    const workspaceIdx = script.indexOf('WORKSPACE = os.path.dirname(os.path.abspath(__file__))');
    const userScriptIdx = script.indexOf('# === User Script Start ===');
    expect(workspaceIdx).toBeGreaterThan(-1);
    expect(workspaceIdx).toBeLessThan(userScriptIdx);
  });

  it('uses WORKSPACE to build _params_path', () => {
    expect(script).toContain('_params_path = os.path.join(WORKSPACE,');
  });

  it('does not duplicate os.path.dirname(os.path.abspath(__file__))', () => {
    const pattern = 'os.path.dirname(os.path.abspath(__file__))';
    const firstIdx = script.indexOf(pattern);
    const secondIdx = script.indexOf(pattern, firstIdx + 1);
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBe(-1);
  });

  it('includes the user script between markers', () => {
    expect(script).toContain('# === User Script Start ===\nx = 1\n# === User Script End ===');
  });

  it('includes sentinel markers for result output', () => {
    expect(script).toContain('__WORKFLOW_RESULT_START__');
    expect(script).toContain('__WORKFLOW_RESULT_END__');
  });
});

describe('PythonNodeExecutor', () => {
  const executor = new PythonNodeExecutor();

  beforeEach(() => {
    mockExecuteInContainer.mockReset();
    mockExecuteInContainer.mockImplementation(async ({ command }) => {
      const match = command.match(/^python\s+(python_script(?:_(.+))?\.py)$/);
      const suffix = match?.[2] ? `_${match[2]}` : '';
      await fs.writeFile(
        join(workFolder, `python_output${suffix}.csv`),
        'id,name\n1,Alice',
        'utf-8'
      );
      return {
        success: true,
        stdout: '__WORKFLOW_RESULT_START__\n{"ok":true}\n__WORKFLOW_RESULT_END__',
        stderr: '(empty)',
      };
    });
  });

  it('uses readable fallback filenames for Chinese node names', async () => {
    const result = await executor.execute(makeContext('脚本节点', 'n1'));

    expect(existsSync(join(workFolder, 'python_params_n1.json'))).toBe(true);
    expect(existsSync(join(workFolder, 'python_script_n1.py'))).toBe(true);
    expect(result.csvPath).toBe(join(workFolder, 'python_output_n1.csv'));
    expect(existsSync(result.csvPath!)).toBe(true);
    expect(result.result).toEqual({ ok: true });
  });

  it('uses fallback filenames for low-information sanitized node names', async () => {
    const result = await executor.execute(makeContext('__1', 'n1'));

    expect(existsSync(join(workFolder, 'python_params_n1.json'))).toBe(true);
    expect(existsSync(join(workFolder, 'python_script_n1.py'))).toBe(true);
    expect(result.csvPath).toBe(join(workFolder, 'python_output_n1.csv'));
    expect(existsSync(result.csvPath!)).toBe(true);
  });

  it('does not overwrite fallback output for two low-information nodes in one workFolder', async () => {
    const first = await executor.execute(makeContext('__1', 'n1'));
    const second = await executor.execute(makeContext('__2', 'n2'));

    expect(first.csvPath).toBe(join(workFolder, 'python_output_n1.csv'));
    expect(second.csvPath).toBe(join(workFolder, 'python_output_n2.csv'));
    expect(first.csvPath).not.toBe(second.csvPath);
    expect(existsSync(join(workFolder, 'python_params_n1.json'))).toBe(true);
    expect(existsSync(join(workFolder, 'python_params_n2.json'))).toBe(true);
    expect(existsSync(join(workFolder, 'python_script_n1.py'))).toBe(true);
    expect(existsSync(join(workFolder, 'python_script_n2.py'))).toBe(true);
    expect(existsSync(first.csvPath!)).toBe(true);
    expect(existsSync(second.csvPath!)).toBe(true);
  });
});
