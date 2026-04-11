# Python Node WORKSPACE Variable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a `WORKSPACE` variable into Python node script wrappers so LLM-generated code uses it instead of hardcoding workfolder paths.

**Architecture:** Two-point change — runtime injection in the script wrapper (`buildWrappedScript`) and prompt guidance in the copilot system prompt. No new files, no DB changes.

**Tech Stack:** TypeScript (backend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-28-python-workspace-variable-design.md`

---

## File Map

- Modify: `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts:19-38` — `buildWrappedScript` function
- Modify: `backend/src/copilot/copilotPrompt.ts:39` — Python node 使用建议
- Create: `backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts` — unit tests for wrapper output
- Modify: `backend/tests/copilotPrompt.test.ts` — add assertion for WORKSPACE guidance

---

### Task 1: Test and implement WORKSPACE injection in buildWrappedScript

**Files:**
- Create: `backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`
- Modify: `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts:19-38`

- [ ] **Step 1: Export `buildWrappedScript` for testability**

In `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts`, change line 19 from:

```typescript
function buildWrappedScript(paramsFileName: string, userScript: string): string {
```

to:

```typescript
export function buildWrappedScript(paramsFileName: string, userScript: string): string {
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWrappedScript } from '@/workflow/nodeExecutors/pythonNodeExecutor';

describe('buildWrappedScript', () => {
  const script = buildWrappedScript('test_params.json', 'x = 1');

  it('defines WORKSPACE before user script', () => {
    const workspaceIdx = script.indexOf('WORKSPACE = os.path.dirname(os.path.abspath(__file__))');
    const userScriptIdx = script.indexOf('# === User Script Start ===');
    expect(workspaceIdx).toBeGreaterThan(-1);
    expect(workspaceIdx).toBeLessThan(userScriptIdx);
  });

  it('uses WORKSPACE to build _params_path', () => {
    expect(script).toContain("_params_path = os.path.join(WORKSPACE,");
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`

Expected: Tests fail — `WORKSPACE` not found in output, `_params_path` still uses inline `os.path.dirname`.

- [ ] **Step 4: Implement the wrapper change**

In `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts`, replace the `buildWrappedScript` function body (lines 19-38) with:

```typescript
export function buildWrappedScript(paramsFileName: string, userScript: string): string {
  return `import json, sys, os

# Workspace directory for file output
WORKSPACE = os.path.dirname(os.path.abspath(__file__))

# Parameters from upstream nodes (loaded from JSON file)
_params_path = os.path.join(WORKSPACE, ${JSON.stringify(paramsFileName)})
with open(_params_path, 'r', encoding='utf-8') as _f:
    params = json.load(_f)

# Initialize result
result = {}

# === User Script Start ===
${userScript}
# === User Script End ===

# Output result as JSON with sentinel marker
print('__WORKFLOW_RESULT_START__')
print(json.dumps(result))
print('__WORKFLOW_RESULT_END__')
`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts
git commit -m "feat(workflow): inject WORKSPACE variable into Python node script wrapper"
```

---

### Task 2: Test and update copilot prompt with WORKSPACE guidance

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts:39`
- Modify: `backend/tests/copilotPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

In `backend/tests/copilotPrompt.test.ts`, add inside the existing `describe('buildSystemPrompt', ...)` block:

```typescript
  it('includes WORKSPACE variable guidance for Python nodes', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('os.path.join(WORKSPACE');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`

Expected: New test fails — `WORKSPACE` not found in prompt.

- [ ] **Step 3: Update the copilot prompt**

In `backend/src/copilot/copilotPrompt.ts`, find the Python node 使用建议 line (line 39):

```
- **使用建议**：通过 params 字典访问输入；result 必须是 JSON 可序列化的 dict；可用 pandas 处理 CSV
```

Replace with:

```
- **使用建议**：通过 params 字典访问输入；result 必须是 JSON 可序列化的 dict；可用 pandas 处理 CSV；脚本中预定义了 \`WORKSPACE\` 变量，指向当前运行的工作目录，生成文件时必须使用 \`os.path.join(WORKSPACE, 'filename')\` 构建路径，禁止硬编码绝对路径
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`

Expected: All tests PASS (including new one).

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/tests/copilotPrompt.test.ts
git commit -m "feat(copilot): add WORKSPACE variable guidance to Python node prompt"
```

---

### Task 3: Run full preflight check

- [ ] **Step 1: Run backend preflight**

Run: `cd backend && pnpm run preflight`

Expected: ESLint, TypeScript, Prettier, and all tests pass.

- [ ] **Step 2: Fix any issues found**

If preflight fails, fix the issues and re-run.

- [ ] **Step 3: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address preflight issues"
```
