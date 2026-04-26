# Agent Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce copilot and core agent API cost by ~50% through tool call limits, earlier context compression, and fewer wasted tool calls.

**Architecture:** Five independent tasks targeting specific files: copilot types, copilot agent, context compression, bash tool, copilot tools, and openai provider. Each task is self-contained with its own tests.

**Tech Stack:** TypeScript, Vitest, OpenAI streaming API

---

### Task 1: Copilot tool call limit

**Files:**
- Modify: `backend/src/copilot/copilot.types.ts:142`
- Test: `backend/tests/copilotAgent.test.ts`

- [ ] **Step 1: Change the limit constant**

In `backend/src/copilot/copilot.types.ts`, change line 142:

```typescript
export const COPILOT_MAX_TOOL_CALLS_PER_TURN = 80;
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts`
Expected: All tests pass. The copilot agent's `handleUserMessage` loop already handles limit-reached gracefully (lines 144-156 of `copilotAgent.ts`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/copilot/copilot.types.ts
git commit -m "feat(copilot): set tool call limit to 80 per turn"
```

---

### Task 2: Earlier context compression

**Files:**
- Modify: `backend/src/agent/context.ts:130`
- Modify: `backend/src/copilot/copilotAgent.ts:317-330`
- Modify: `backend/src/agent/coreAgentSession.ts:441-445`
- Test: `backend/tests/services/agents/context.test.ts`

- [ ] **Step 1: Lower compression temperature in context.ts**

In `backend/src/agent/context.ts`, change line 130 from `temperature: 0.9` to `temperature: 0.2`:

```typescript
const response = await this.llm.chat(messages, { temperature: 0.2 });
```

- [ ] **Step 2: Update copilot agent compression threshold**

In `backend/src/copilot/copilotAgent.ts`, change the `maybeCompressContext` method (lines 317-330). Update the default from 90000 to 60000:

```typescript
private async maybeCompressContext(totalTokens: number | undefined): Promise<boolean> {
    if (!totalTokens) return false;
    const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 60000;
    if (totalTokens > compressLimit) {
```

- [ ] **Step 3: Update core agent compression threshold**

In `backend/src/agent/coreAgentSession.ts`, find the compression check (around line 441-445). It uses the same pattern:

```typescript
const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 90000;
```

Change the fallback from `90000` to `60000`:

```typescript
const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 60000;
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pnpm vitest run tests/services/agents/context.test.ts`
Expected: All tests pass. If any test hardcodes the 90000 value, update it to 60000.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/context.ts backend/src/copilot/copilotAgent.ts backend/src/agent/coreAgentSession.ts
git commit -m "perf: lower context compression threshold to 60K and temperature to 0.2"
```

---

### Task 3: Workflow snapshot caching

**Files:**
- Modify: `backend/src/copilot/copilotAgent.ts`

- [ ] **Step 1: Add snapshot cache and stale tracking**

In `backend/src/copilot/copilotAgent.ts`, add two new instance variables to the class (after line 41, alongside other private vars):

```typescript
private workflowSnapshotCache: WorkflowDetail | null | undefined = undefined;
```

Note: `undefined` means "not yet loaded", `null` means "loaded but not found", and a `WorkflowDetail` value means "loaded and cached".

- [ ] **Step 2: Update getWorkflowSnapshot to use cache**

Replace the `getWorkflowSnapshot` method (lines 425-436):

```typescript
private async getWorkflowSnapshot(): Promise<WorkflowDetail | null> {
    if (this.workflowSnapshotCache !== undefined) {
      return this.workflowSnapshotCache;
    }
    try {
      const workflow = await workflowService.getWorkflow(this.workflowId);
      this.workflowSnapshotCache = workflow;
      return workflow;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Copilot layout ownership detection failed', {
        workflowId: this.workflowId,
        error: message,
      });
      return null;
    }
  }
```

- [ ] **Step 3: Invalidate cache on structural mutations**

Add a new helper method after `getWorkflowSnapshot`:

```typescript
private invalidateWorkflowSnapshot(): void {
    this.workflowSnapshotCache = undefined;
  }
```

Then in `maybeReflowRound` (lines 503-528), call `this.invalidateWorkflowSnapshot()` at the end, after `reflowWorkflowLayout` succeeds:

```typescript
try {
      await workflowService.reflowWorkflowLayout(this.workflowId);
      this.invalidateWorkflowSnapshot();
      this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated' });
    }
```

Also invalidate in `recordRoundMutation` when a structural mutation is recorded. Add after `summary.addedNodes += 1;` and similar lines — actually simpler: invalidate inside `emitWorkflowChanged` for mutating tools. At the start of `emitWorkflowChanged` (line 531), add:

```typescript
private emitWorkflowChanged(toolName: string, result: { success: boolean; data: unknown }): void {
    if (!result.success) return;
    this.invalidateWorkflowSnapshot();
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotAgent.ts
git commit -m "perf(copilot): cache workflow snapshot between rounds"
```

---

### Task 4: Bash tool error information enrichment

**Files:**
- Modify: `backend/src/infrastructure/tools/bashTool.ts:138-148`
- Test: `backend/tests/infrastructure/tools/bashTool/sandbox-execution.test.ts`

- [ ] **Step 1: Enhance failure result data**

In `backend/src/infrastructure/tools/bashTool.ts`, the failure path is at lines 138-148. Currently when `result.success` is false, the data is still returned but the error info may be sparse. The `BashResultData` already contains `stderr`, `exitCode`, and `command` fields.

The issue is that when the tool result is serialized to the LLM, only `success: false` and a generic error may be visible. We need to ensure the `error` field contains a descriptive summary. After line 140 (where `resultData.error = result.error` is set), add a fallback that constructs a useful error message:

```typescript
if (result.error) {
        resultData.error = result.error;
      }

      if (!result.success) {
        const stderrPreview = result.stderr
          ? result.stderr.slice(0, 500)
          : '(no stderr)';
        resultData.error = `Exit code ${String(result.exitCode ?? 'unknown')}: ${stderrPreview}`;
      }
```

This ensures when `success: false`, the error always includes the exit code and stderr preview.

- [ ] **Step 2: Run tests**

Run: `cd backend && pnpm vitest run tests/infrastructure/tools/bashTool/`
Expected: All tests pass. Check that no test depends on the old error message format.

- [ ] **Step 3: Commit**

```bash
git add backend/src/infrastructure/tools/bashTool.ts
git commit -m "fix(bash): include exit code and stderr preview in failure results"
```

---

### Task 5: wf_add_node error message improvement

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts` (WfAddNodeTool.execute)
- Test: `backend/tests/copilotTools.test.ts`

- [ ] **Step 1: Improve type validation error**

In `backend/src/copilot/copilotTools.ts`, find the WfAddNodeTool `execute` method. The type validation is around lines 292-297:

```typescript
if (!type || !this.allowedTypes.includes(type)) {
        return {
          success: false,
          data: null,
          error: `type must be one of: ${this.allowedTypes.join(', ')}`,
        };
      }
```

Replace with a more helpful error that includes the current workflow's node names:

```typescript
if (!type || !this.allowedTypes.includes(type)) {
        return {
          success: false,
          data: null,
          error: `type must be one of: ${this.allowedTypes.join(', ')}. Received: "${String(type ?? '(missing)')}"`,
        };
      }
```

- [ ] **Step 2: Improve name conflict error**

Further down in the same method, find the name uniqueness check. When a duplicate name is detected, include existing names in the error. Find where the duplicate name error is returned and update it to include existing names. The current pattern checks names against the workflow's existing nodes. After loading the workflow, gather existing names and include them in the error:

Find the block that validates the name (should check against existing workflow node names). Update the error message to:

```typescript
error: `Node name "${name}" already exists in this workflow. Existing names: ${workflow.nodes.map((n) => n.name).join(', ') || '(none)'}`,
```

- [ ] **Step 3: Run tests**

Run: `cd backend && pnpm vitest run tests/copilotTools.test.ts`
Expected: All tests pass. If any test asserts on exact error messages, update those assertions.

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilotTools.ts
git commit -m "fix(copilot): improve wf_add_node validation error messages"
```

---

### Task 6: Single-node failure count tracking

**Files:**
- Modify: `backend/src/copilot/copilotAgent.ts`
- Modify: `backend/src/copilot/copilotTools.ts` (WfExecuteNodeTool)

- [ ] **Step 1: Add failure counter to CopilotAgent**

In `backend/src/copilot/copilotAgent.ts`, add an instance variable to track per-node failures:

```typescript
private nodeFailureCounts: Map<string, number> = new Map();
```

Initialize it at the start of `handleUserMessage` (after `this.aborted = false;` around line 117):

```typescript
this.nodeFailureCounts = new Map();
```

- [ ] **Step 2: Track failures in onToolCallComplete callback**

In the `onToolCallComplete` callback (around lines 187-240), after the existing failure handling, add failure tracking for `wf_execute_node`. Find the section where `result.metadata?.status` is checked. After the `isSuccess` assignment, add:

```typescript
// Track node execution failures
            if (tc.function.name === 'wf_execute_node' && !isSuccess) {
              try {
                const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                const nodeId = args.nodeId as string | undefined;
                if (nodeId) {
                  const count = (this.nodeFailureCounts.get(nodeId) ?? 0) + 1;
                  this.nodeFailureCounts.set(nodeId, count);
                }
              } catch {
                // ignore parse errors
              }
            }
```

- [ ] **Step 3: Inject failure count hint into tool result**

After tracking the failure, when a node has failed multiple times, append a hint to the tool result content. In the same `onToolCallComplete` callback, after the failure tracking block above, add:

```typescript
// Inject failure hint for repeated failures
            if (tc.function.name === 'wf_execute_node' && !isSuccess) {
              try {
                const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                const nodeId = args.nodeId as string | undefined;
                if (nodeId) {
                  const failCount = this.nodeFailureCounts.get(nodeId) ?? 0;
                  if (failCount >= 2) {
                    result.content += `\n\n[Hint: This node has failed ${String(failCount)} time(s). Consider reviewing the root cause, checking upstream data, or asking the user for guidance before retrying.]`;
                  }
                }
              } catch {
                // ignore parse errors
              }
            }
```

Note: `result.content` is the tool result content string. This hint gets appended to it, so the LLM sees the failure count context.

- [ ] **Step 4: Run tests**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotAgent.ts
git commit -m "feat(copilot): track node execution failures and hint after repeated failures"
```

---

### Task 7: Core agent LLM call recording fix

**Files:**
- Modify: `backend/src/infrastructure/llm/openai.ts:148-155`
- Test: `backend/tests/services/agents/coreAgentSession.test.ts`

- [ ] **Step 1: Add stream_options to request streaming usage**

In `backend/src/infrastructure/llm/openai.ts`, find the `streamChat` method. Around lines 148-155, the request body is constructed. Add `stream_options` to request usage data:

```typescript
const body: Record<string, unknown> = {
    model: this.model,
    messages: formattedMessages,
    stream: true,
    stream_options: { include_usage: true },
    ...options,
  };
```

The exact location is in the `streamChat` async generator method, where `body` is constructed before calling `this.client.chat.completions.create`.

- [ ] **Step 2: Verify the 'done' event handler receives usage**

In `backend/src/agent/coreAgentSession.ts` line 353, the handler already guards on `event.usage`:

```typescript
if (event.usage) {
  lastUsage = event.usage;
  runRecorder.recordLlmCall(event.usage);
```

With `stream_options: { include_usage: true }`, OpenAI will now include usage data in the final streaming chunk, so this guard will pass and `recordLlmCall` will be called.

- [ ] **Step 3: Run tests**

Run: `cd backend && pnpm vitest run tests/services/agents/coreAgentSession.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/infrastructure/llm/openai.ts
git commit -m "fix(core): request streaming usage data for accurate LLM call tracking"
```

---

### Final step: Run full preflight

- [ ] **Run all backend checks**

Run: `cd backend && pnpm run preflight`
Expected: ESLint, TSC, Prettier, and all tests pass.

- [ ] **Commit any remaining fixes if needed**
