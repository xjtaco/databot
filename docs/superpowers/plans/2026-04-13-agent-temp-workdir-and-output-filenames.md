# Agent Temp Workdir And Output Filenames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `copilot`, `debug`, and `coreAgent` consistently use `wf_*` temp directories, explicitly tell the LLM which temp directory to use, keep generated files out of `/app/databot/workfolder` root, prevent degraded filenames like `_______output.csv`, and retain `wf_*` temp directories for 30 days before cleanup.

**Architecture:** Thread the current temp workdir into prompt builders so each agent tells the model the exact absolute directory it must use. Align runtime temp directory naming on the existing `wf_<id>` convention, then harden SQL/Web Search/Python executors with English fallback filenames so runtime output remains readable even when node names are Chinese. Finally, keep the existing workspace cleanup scheduler but change the default retention policy from 1 day to 30 days and cover it with tests.

**Tech Stack:** TypeScript, Vitest, Node.js fs/path APIs, existing workflow execution engine, existing agent prompt builders

---

## File Map

| File | Responsibility |
| --- | --- |
| `backend/src/copilot/copilotPrompt.ts` | Build copilot system prompt with explicit temp workdir and file naming rules |
| `backend/src/copilot/copilotAgent.ts` | Pass temp workdir context into copilot prompt builder |
| `backend/src/copilot/debugPrompt.ts` | Build debug prompt with explicit temp workdir and file naming rules |
| `backend/src/copilot/debugAgent.ts` | Supply debug temp workdir to prompt builder |
| `backend/src/copilot/workflowAccessor.ts` | Create debug execution temp dirs using `wf_` convention and expose them to debug prompt |
| `backend/src/agent/coreAgentSession.ts` | Create `wf_` temp dirs and strengthen core agent prompt wording |
| `backend/src/workflow/nodeExecutors/utils.ts` | Shared helper for choosing readable fallback output basenames |
| `backend/src/workflow/nodeExecutors/sqlNodeExecutor.ts` | Use fallback English CSV filename when sanitized node name is poor |
| `backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts` | Use fallback English Markdown filename when sanitized node name is poor |
| `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts` | Use fallback English artifact filenames for params/script/output |
| `backend/src/base/config.ts` | Change default cleanup retention from 1 day to 30 days |
| `backend/src/workflow/workspaceCleanup.ts` | Keep scheduler, update comments/logs, optionally export cleanup entrypoint for direct tests |
| `backend/tests/copilotPrompt.test.ts` | Prompt assertions for copilot temp workdir + naming rules |
| `backend/tests/copilot/debugPrompt.test.ts` | New debug prompt tests for temp workdir + naming rules |
| `backend/tests/services/agents/coreAgentSession.test.ts` | Assert `wf_` temp dir creation and strengthened prompt text |
| `backend/tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts` | New SQL executor tests for Chinese node names and fallback output filenames |
| `backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts` | Extend existing tests to assert fallback Markdown filename behavior |
| `backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts` | New Python executor tests for fallback params/script/output filenames |
| `backend/tests/workflow/workspaceCleanup.test.ts` | New cleanup retention tests for `wf_*` directories |

## Task 1: Thread Temp Workdir Into Agent Prompts

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/copilotAgent.ts`
- Modify: `backend/src/copilot/debugPrompt.ts`
- Modify: `backend/src/copilot/debugAgent.ts`
- Test: `backend/tests/copilotPrompt.test.ts`
- Test: `backend/tests/copilot/debugPrompt.test.ts`

- [ ] **Step 1: Write the failing copilot prompt tests**

Add cases to `backend/tests/copilotPrompt.test.ts` that call the new prompt signature and assert the explicit temp workdir and naming rules:

```ts
it('includes the current temp workdir and forbids workfolder root writes', () => {
  const prompt = buildSystemPrompt(ALL_CONFIGURED, '/app/databot/workfolder/wf_test123');
  expect(prompt).toContain('/app/databot/workfolder/wf_test123');
  expect(prompt).toContain('must be written under this directory');
  expect(prompt).toContain('Never write generated files directly under `/app/databot/workfolder`');
});

it('requires short English snake_case filenames', () => {
  const prompt = buildSystemPrompt(ALL_CONFIGURED, '/app/databot/workfolder/wf_test123');
  expect(prompt).toContain('short English `snake_case`');
  expect(prompt).toContain('query_result.csv');
});
```

- [ ] **Step 2: Add failing debug prompt tests**

Create `backend/tests/copilot/debugPrompt.test.ts` with focused coverage for the new debug prompt signature:

```ts
import { describe, expect, it } from 'vitest';
import { buildDebugSystemPrompt } from '../../src/copilot/debugPrompt';

const node = {
  id: 'node-1',
  name: '搜索结果',
  type: 'python',
  config: { nodeType: 'python', params: {}, script: 'result={}', outputVariable: 'out' },
} as any;

describe('buildDebugSystemPrompt', () => {
  it('includes the current debug temp workdir and file naming rules', () => {
    const prompt = buildDebugSystemPrompt(node, '/app/databot/workfolder/wf_debug123');
    expect(prompt).toContain('/app/databot/workfolder/wf_debug123');
    expect(prompt).toContain('Never write generated files directly under `/app/databot/workfolder`');
    expect(prompt).toContain('short English `snake_case`');
  });
});
```

- [ ] **Step 3: Run prompt tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/debugPrompt.test.ts`

Expected: FAIL because `buildSystemPrompt` and `buildDebugSystemPrompt` do not yet accept a temp workdir parameter.

- [ ] **Step 4: Update copilot prompt builder to accept temp workdir**

Refactor `backend/src/copilot/copilotPrompt.ts` so `buildSystemPrompt` accepts a second argument and renders a dedicated temp-directory section:

```ts
const buildWorkdirRules = (tempWorkdir: string) => `## Temp Workdir Rules

- Current temporary work directory: \`${tempWorkdir}\`
- Generated files must be written under this directory by default
- Never write generated files directly under \`${config.work_folder}\`
- Generated filenames must use short English \`snake_case\` such as \`query_result.csv\`, \`analysis_report.md\`, or \`chart_sales.json\`
- For Python nodes, \`WORKSPACE\` points to this run's temp directory and is the correct base path for file writes`;

export function buildSystemPrompt(
  configStatus: ConfigStatusResponse,
  tempWorkdir: string
): string {
  // existing nodeTypeSections logic
  return [
    ROLE,
    buildWorkdirRules(tempWorkdir),
    nodeTypeDescriptions,
    WORKFLOW_BUILD_GUIDELINES,
    buildToolUsageGuidelines(configStatus),
    AUTO_FIX_INSTRUCTIONS,
    NODE_DEBUGGING,
    COMMON_NODE_CHAINS,
    OUTPUT_FORMAT_RULES,
  ].join('\n\n');
}
```

- [ ] **Step 5: Pass temp workdir into `CopilotAgent`**

Update `backend/src/copilot/copilotAgent.ts` to build a stable prompt path under the real work folder root:

```ts
import { config as appConfig } from '../base/config';

function buildCopilotPromptWorkdir(workflowId: string): string {
  return `${appConfig.work_folder}/wf_${workflowId.slice(0, 12)}`;
}

// inside first-message initialization
const systemPrompt = buildSystemPrompt(configStatus, buildCopilotPromptWorkdir(this.workflowId));
```

Use a helper rather than inlining the string so tests and future callers can share the same logic.

- [ ] **Step 6: Update debug prompt builder and caller**

Refactor `backend/src/copilot/debugPrompt.ts` and `backend/src/copilot/debugAgent.ts` so debug prompt construction includes the actual debug temp workdir:

```ts
export function buildDebugSystemPrompt(node: WorkflowNodeInfo, tempWorkdir: string): string {
  const workdirRules = `## Temp Workdir Rules

- Current temporary work directory: ${tempWorkdir}
- Generated files must stay inside this directory
- Never write generated files directly under ${config.work_folder}
- Generated filenames must use short English snake_case`;

  return [role, currentNode, workdirRules, nodeTypeRef, toolsList, dataContext, debugWorkflow, mockInputsGuidance, outputFormat].join('\n\n');
}
```

```ts
if (this.context.getTotalTokens() === 0) {
  const systemPrompt = buildDebugSystemPrompt(this.node, this.accessor.getCurrentTempWorkdir());
  this.context.addSystemMessage(systemPrompt);
}
```

If `WorkflowAccessor` does not currently expose the temp workdir, add a small accessor method on `InMemoryWorkflowAccessor` and thread it through only where needed.

- [ ] **Step 7: Run prompt tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/debugPrompt.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/copilotAgent.ts backend/src/copilot/debugPrompt.ts backend/src/copilot/debugAgent.ts backend/tests/copilotPrompt.test.ts backend/tests/copilot/debugPrompt.test.ts
git commit -m "feat(copilot): add explicit temp workdir rules to agent prompts"
```

## Task 2: Align Runtime Temp Directory Naming On `wf_*`

**Files:**
- Modify: `backend/src/copilot/workflowAccessor.ts`
- Modify: `backend/src/agent/coreAgentSession.ts`
- Test: `backend/tests/services/agents/coreAgentSession.test.ts`

- [ ] **Step 1: Write the failing core agent session tests**

Extend `backend/tests/services/agents/coreAgentSession.test.ts` with assertions for the new directory pattern and prompt wording:

```ts
it('creates a wf_-prefixed temp directory', () => {
  const workFolder = (session as any).workFolder as string;
  expect(path.basename(workFolder)).toMatch(/^wf_/);
});

it('injects the exact temp directory into the system prompt', () => {
  const context = (session as any).context;
  const history = context.validHistory();
  const workFolder = (session as any).workFolder as string;
  expect(history[0].content).toContain(workFolder);
  expect(history[0].content).toContain('Never write generated files directly under');
});
```

- [ ] **Step 2: Run the core agent tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/services/agents/coreAgentSession.test.ts`

Expected: FAIL because the directory name is currently a bare short id and the prompt does not contain the stronger root-directory restriction.

- [ ] **Step 3: Update `CoreAgentSession` workdir naming and prompt wording**

Modify `backend/src/agent/coreAgentSession.ts` so the constructor creates `wf_<id>` directories and the core prompt includes explicit filename constraints:

```ts
const shortId = shortUuid.generate();
this.workFolder = path.join(config.work_folder, `wf_${shortId}`);
```

Add lines to `CORE_PROMPT`:

```ts
- **Working Directory:** The current temporary working directory is `#WORK_FOLDER#`. When generating files, save them inside this directory by default.
- **Forbidden Output Location:** Never write generated files directly under `${config.work_folder}` root; always write inside `#WORK_FOLDER#` or its children.
- **Filename Convention:** Generated filenames must use short English `snake_case` such as `query_result.csv`, `analysis_report.md`, or `chart_sales.json`.
```

- [ ] **Step 4: Update debug temp directory naming**

Modify `backend/src/copilot/workflowAccessor.ts` so `InMemoryWorkflowAccessor.executeNode()` creates debug temp directories using the same convention:

```ts
const workFolder = join(appConfig.work_folder, `wf_${generateShortId()}`);
await mkdir(workFolder, { recursive: true });
this.tempDirs.push(workFolder);
this.currentTempWorkdir = workFolder;
```

Add a small getter on the class if Task 1 used one:

```ts
getCurrentTempWorkdir(): string {
  return this.currentTempWorkdir ?? join(appConfig.work_folder, 'wf_pending');
}
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/services/agents/coreAgentSession.test.ts tests/copilot/debugPrompt.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/coreAgentSession.ts backend/src/copilot/workflowAccessor.ts backend/tests/services/agents/coreAgentSession.test.ts
git commit -m "feat(agent): align temp work directories on wf prefix"
```

## Task 3: Add Runtime Fallback Output Filenames For Poor Sanitization

**Files:**
- Modify: `backend/src/workflow/nodeExecutors/utils.ts`
- Modify: `backend/src/workflow/nodeExecutors/sqlNodeExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts`
- Create: `backend/tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts`
- Modify: `backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts`
- Create: `backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`

- [ ] **Step 1: Write the failing Web Search executor test**

Extend `backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts` with a Chinese node name case:

```ts
it('uses an English fallback filename when the node name sanitizes poorly', async () => {
  const output = await executor.execute({
    nodeId: 'node-1',
    nodeName: '搜索结果',
    workFolder: tempDir,
    resolvedConfig: { nodeType: 'web_search', params: {}, keywords: 'sales', outputVariable: 'search_out' },
  } as any);

  expect(path.basename(output.markdownPath)).toBe('web_search_results.md');
  expect(output.markdownPath.startsWith(tempDir)).toBe(true);
});
```

- [ ] **Step 2: Add failing SQL and Python executor tests**

Create focused tests for low-information filenames:

```ts
it('uses sql_output.csv for a Chinese SQL node name', async () => {
  const output = await executor.execute({
    nodeId: 'sql-node',
    nodeName: '中文节点',
    workFolder: tempDir,
    resolvedConfig: { nodeType: 'sql', datasourceId: datasourceId, sql: 'select 1 as v', outputVariable: 'query1' },
  } as any);

  expect(path.basename(output.csvPath)).toBe('sql_output.csv');
});
```

```ts
it('uses python fallback artifact names for a Chinese node name', async () => {
  await executor.execute({
    nodeId: 'py-node',
    nodeName: '中文分析',
    workFolder: tempDir,
    resolvedConfig: { nodeType: 'python', params: {}, script: 'import os\nopen(os.path.join(WORKSPACE, \"python_output.csv\"), \"w\").write(\"a\\n1\\n\")\nresult={}', outputVariable: 'py1' },
  } as any);

  expect(existsSync(path.join(tempDir, 'python_params.json'))).toBe(true);
  expect(existsSync(path.join(tempDir, 'python_script.py'))).toBe(true);
});
```

- [ ] **Step 3: Run the executor tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`

Expected: FAIL because executors still build filenames directly from `sanitizeNodeName(...)`.

- [ ] **Step 4: Add a shared fallback basename helper**

Create a helper in `backend/src/workflow/nodeExecutors/utils.ts` so all executors share the same decision rule:

```ts
export function chooseOutputBaseName(
  nodeName: string,
  fallbackBaseName: string
): string {
  const safeName = sanitizeNodeName(nodeName);
  if (!safeName) return fallbackBaseName;
  if (/^_+$/.test(safeName)) return fallbackBaseName;
  return safeName;
}
```

If tests reveal other degenerate forms, expand the predicate there instead of duplicating it per executor.

- [ ] **Step 5: Update SQL and Web Search executors**

Replace direct `sanitizeNodeName` usage with the new helper:

```ts
const baseName = chooseOutputBaseName(context.nodeName, 'sql');
const csvFileName = `${baseName}_output.csv`;
```

```ts
const baseName = chooseOutputBaseName(context.nodeName, 'web_search_results');
const filePath = join(context.workFolder, `${baseName}.md`);
```

For Web Search, prefer the exact final filename `web_search_results.md` to match the spec and tests.

- [ ] **Step 6: Update Python executor artifact names**

Use stable English fallbacks for params/script/output:

```ts
const baseName = chooseOutputBaseName(context.nodeName, 'python');
const paramsFileName = baseName === 'python' ? 'python_params.json' : `${baseName}_params.json`;
const scriptFileName = baseName === 'python' ? 'python_script.py' : `${baseName}.py`;
const csvPath = join(workFolder, baseName === 'python' ? 'python_output.csv' : `${baseName}_output.csv`);
```

Keep the rest of the Python execution flow unchanged.

- [ ] **Step 7: Run executor tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/workflow/nodeExecutors/utils.ts backend/src/workflow/nodeExecutors/sqlNodeExecutor.ts backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts backend/tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts backend/tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts
git commit -m "fix(workflow): add English fallback output filenames"
```

## Task 4: Retain `wf_*` Temp Directories For 30 Days

**Files:**
- Modify: `backend/src/base/config.ts`
- Modify: `backend/src/workflow/workspaceCleanup.ts`
- Create: `backend/tests/workflow/workspaceCleanup.test.ts`

- [ ] **Step 1: Write the failing cleanup retention tests**

Create `backend/tests/workflow/workspaceCleanup.test.ts` with explicit old/new directory cases. Export the cleanup function from the implementation file if direct invocation is needed.

```ts
it('deletes wf_ directories older than 30 days', async () => {
  await runWorkspaceCleanup();
  expect(existsSync(oldWfDir)).toBe(false);
});

it('keeps wf_ directories newer than 30 days', async () => {
  await runWorkspaceCleanup();
  expect(existsSync(newWfDir)).toBe(true);
});

it('ignores non-wf sibling directories', async () => {
  await runWorkspaceCleanup();
  expect(existsSync(nonWorkflowDir)).toBe(true);
});
```

Use `fs.utimes` or mocked `stat.mtimeMs` so one fixture is older than `30 * 24 * 60 * 60 * 1000`.

- [ ] **Step 2: Run the cleanup tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/workflow/workspaceCleanup.test.ts`

Expected: FAIL because the default config still retains workspaces for only 1 day and the cleanup entrypoint is not yet test-friendly.

- [ ] **Step 3: Update cleanup defaults and make cleanup directly testable**

In `backend/src/base/config.ts`, change:

```ts
workspaceCleanup: {
  intervalMs: parseInt(process.env.WORKSPACE_CLEANUP_INTERVAL_MS || '21600000', 10), // 6 hours
  maxAgeMs: parseInt(process.env.WORKSPACE_CLEANUP_MAX_AGE_MS || '2592000000', 10), // 30 days
},
```

In `backend/src/workflow/workspaceCleanup.ts`, export the cleanup function and align comments/logging:

```ts
export async function runWorkspaceCleanup(): Promise<void> {
  // existing cleanupWorkspaces body
}

export function startWorkspaceCleanup(): void {
  cleanupTimeout = setTimeout(() => {
    runWorkspaceCleanup().catch((err) => {
      logger.error('Initial workspace cleanup failed', { error: String(err) });
    });
  }, 5000);
}
```

Update top-level comments from “older than 1 day” to “older than 30 days by default”.

- [ ] **Step 4: Run the cleanup tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/workflow/workspaceCleanup.test.ts`

Expected: PASS

- [ ] **Step 5: Run the full targeted regression suite**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/debugPrompt.test.ts tests/services/agents/coreAgentSession.test.ts tests/workflow/nodeExecutors/sqlNodeExecutor.test.ts tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts tests/workflow/nodeExecutors/pythonNodeExecutor.test.ts tests/workflow/workspaceCleanup.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/base/config.ts backend/src/workflow/workspaceCleanup.ts backend/tests/workflow/workspaceCleanup.test.ts
git commit -m "fix(workflow): retain wf temp directories for 30 days"
```

## Self-Review

### Spec coverage

- Prompt-level temp workdir + English filename rules: Task 1
- `wf_*` naming for `coreAgent` and debug temp dirs: Task 2
- Runtime fallback filenames for SQL/Web Search/Python: Task 3
- Periodic cleanup of `wf_*` dirs older than 30 days: Task 4

No uncovered spec requirement remains.

### Placeholder scan

- No `TBD`, `TODO`, or “similar to above” shortcuts remain.
- Each code-changing step includes concrete code or exact assertions.
- Each verification step includes an exact Vitest command and expected outcome.

### Type consistency

- `buildSystemPrompt(configStatus, tempWorkdir)` is used consistently in tests and implementation steps.
- `buildDebugSystemPrompt(node, tempWorkdir)` is used consistently in tests and implementation steps.
- `runWorkspaceCleanup()` is the single exported cleanup entrypoint referenced by tests and scheduler changes.

