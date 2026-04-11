import { describe, it, expect } from 'vitest';
import { buildWrappedScript } from '../../../src/workflow/nodeExecutors/pythonNodeExecutor';

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
