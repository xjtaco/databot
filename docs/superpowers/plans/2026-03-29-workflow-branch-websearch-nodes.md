# Workflow Branch & Web Search Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Branch (conditional) and Web Search node types to the workflow system, including execution engine branching support, frontend editor UI, and Copilot adaptation.

**Architecture:** Two new node executors following existing patterns. Execution engine adds edge-blocking logic for branch skip/execute decisions. Frontend adds source handle mechanism for branch nodes with two output ports. Web search reuses existing provider infrastructure with a new structured result method.

**Tech Stack:** Vue 3, TypeScript, @vue-flow/core, Element Plus, Prisma, Express.js, vitest

**Spec:** `docs/superpowers/specs/2026-03-29-workflow-branch-websearch-nodes-design.md`

---

### Task 1: Prisma Schema Migration — Add sourceHandle to WorkflowEdge

**Files:**
- Modify: `backend/prisma/schema.prisma:169-183`

- [ ] **Step 1: Add sourceHandle field to WorkflowEdge model**

In `backend/prisma/schema.prisma`, add `sourceHandle` to the `WorkflowEdge` model:

```prisma
model WorkflowEdge {
  id           String   @id @default(uuid()) @db.Uuid
  workflowId   String   @map("workflow_id") @db.Uuid
  sourceNodeId String   @map("source_node_id") @db.Uuid
  targetNodeId String   @map("target_node_id") @db.Uuid
  sourceHandle String?  @map("source_handle") @db.VarChar(50)
  createdAt    DateTime @default(now()) @map("created_at")

  workflow   Workflow     @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  sourceNode WorkflowNode @relation("SourceNode", fields: [sourceNodeId], references: [id], onDelete: Cascade)
  targetNode WorkflowNode @relation("TargetNode", fields: [targetNodeId], references: [id], onDelete: Cascade)

  @@unique([sourceNodeId, targetNodeId])
  @@index([workflowId])
  @@map("workflow_edges")
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd backend && pnpm prisma migrate dev --name add-source-handle-to-edge
```

Expected: Migration creates `source_handle` nullable varchar column on `workflow_edges` table.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/ && git commit -m "feat(workflow): add sourceHandle column to workflow_edges table"
```

---

### Task 2: Backend Types — New Node Types, Configs, Outputs, and DTO Updates

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts`

- [ ] **Step 1: Add new node types to WorkflowNodeType constant (line 2-7)**

```typescript
export const WorkflowNodeType = {
  Sql: 'sql',
  Python: 'python',
  Llm: 'llm',
  Email: 'email',
  Branch: 'branch',
  WebSearch: 'web_search',
} as const;
```

- [ ] **Step 2: Add BranchNodeConfig and WebSearchNodeConfig interfaces (after EmailNodeConfig, ~line 114)**

```typescript
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string; // Template variable, e.g. "{{sqlNode.totalRows}}"
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty';
  value: string;
  outputVariable: string;
}

export interface WebSearchNodeConfig {
  nodeType: 'web_search';
  keywords: string; // Supports {{}} template variables
  outputVariable: string;
}
```

- [ ] **Step 3: Update NodeConfig union type (line 116)**

```typescript
export type NodeConfig =
  | SqlNodeConfig
  | PythonNodeConfig
  | LlmNodeConfig
  | EmailNodeConfig
  | BranchNodeConfig
  | WebSearchNodeConfig;
```

- [ ] **Step 4: Add BranchNodeOutput and WebSearchNodeOutput interfaces (after EmailNodeOutput, ~line 141)**

```typescript
export interface BranchNodeOutput {
  result: boolean;
}

export interface WebSearchNodeOutput {
  markdownPath: string;
  totalResults: number;
}
```

- [ ] **Step 5: Update NodeOutput union type (line 143)**

```typescript
export type NodeOutput =
  | SqlNodeOutput
  | PythonNodeOutput
  | LlmNodeOutput
  | EmailNodeOutput
  | BranchNodeOutput
  | WebSearchNodeOutput;
```

- [ ] **Step 6: Add sourceHandle to edge DTOs**

Update `ExportedWorkflowEdge` (~line 166):
```typescript
export interface ExportedWorkflowEdge {
  sourceNodeName: string;
  targetNodeName: string;
  sourceHandle?: string;
}
```

Update `WorkflowEdgeInfo` (~line 189):
```typescript
export interface WorkflowEdgeInfo {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}
```

Update `SaveWorkflowEdgeInput` (~line 243):
```typescript
export interface SaveWorkflowEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}
```

- [ ] **Step 7: Verify build**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/workflow/workflow.types.ts && git commit -m "feat(workflow): add branch and web_search node type definitions"
```

---

### Task 3: Backend Repository — Handle sourceHandle in Edge Save/Load/Export

**Files:**
- Modify: `backend/src/workflow/workflow.repository.ts:55-62,250-257,338-344`

- [ ] **Step 1: Update mapEdgeInfo to include sourceHandle (line 55-62)**

```typescript
function mapEdgeInfo(edge: PrismaWorkflowEdge): WorkflowEdgeInfo {
  return {
    id: edge.id,
    workflowId: edge.workflowId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourceHandle: edge.sourceHandle ?? undefined,
  };
}
```

- [ ] **Step 2: Update exportWorkflow to include sourceHandle in edges (line 250-257)**

```typescript
  const edges: ExportedWorkflowEdge[] = wf.edges
    .map((e) => {
      const sourceName = nodeNameMap.get(e.sourceNodeId);
      const targetName = nodeNameMap.get(e.targetNodeId);
      if (!sourceName || !targetName) return null;
      return {
        sourceNodeName: sourceName,
        targetNodeName: targetName,
        sourceHandle: e.sourceHandle ?? undefined,
      };
    })
    .filter((e): e is ExportedWorkflowEdge => e !== null);
```

- [ ] **Step 3: Update edge creation in saveWorkflow to include sourceHandle (line 338-344)**

```typescript
    for (const edge of input.edges) {
      const sourceId = resolveNodeId(edge.sourceNodeId, tempIdMap);
      const targetId = resolveNodeId(edge.targetNodeId, tempIdMap);
      await tx.workflowEdge.create({
        data: {
          workflowId: id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceHandle: edge.sourceHandle ?? null,
        },
      });
    }
```

- [ ] **Step 4: Update cloneWorkflow edge cloning to include sourceHandle**

Find the edge cloning section in `cloneWorkflow()` (~line 197-209) and include `sourceHandle`:

```typescript
      sourceHandle: edge.sourceHandle ?? null,
```

- [ ] **Step 5: Verify build**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/workflow.repository.ts && git commit -m "feat(workflow): persist sourceHandle in edge save/load/export/clone"
```

---

### Task 4: Web Search Structured Results — Add searchStructured Method

**Files:**
- Modify: `backend/src/infrastructure/tools/webSearch.ts`

- [ ] **Step 1: Add WebSearchResult interface and abstract method (after line 55)**

```typescript
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

Add abstract method to `WebSearchProvider` class:
```typescript
  abstract searchStructured(query: string): Promise<WebSearchResult[]>;
```

- [ ] **Step 2: Implement searchStructured in AliUnifySearchProvider**

Add method to `AliUnifySearchProvider` (after the existing `search` method, ~line 130):

```typescript
  async searchStructured(query: string): Promise<WebSearchResult[]> {
    const payload = { query, numResults: this.numResults };
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(AliUnifySearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP status error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as AliSearchResponse;
      if (result?.pageItems && Array.isArray(result.pageItems)) {
        return result.pageItems.map((item) => ({
          title: item.title ?? item.hostname,
          url: item.url ?? '',
          snippet: item.summary,
        }));
      }
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Search request timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }
```

- [ ] **Step 3: Implement searchStructured in BaiduSearchProvider**

Add method to `BaiduSearchProvider` (after the existing `search` method, ~line 208):

```typescript
  async searchStructured(query: string): Promise<WebSearchResult[]> {
    const payload = {
      messages: [{ content: query, role: 'user' }],
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: this.numResults }],
    };
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(BaiduSearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Baidu search HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as BaiduSearchResponse;
      if (result?.references && Array.isArray(result.references)) {
        return result.references.map((ref) => ({
          title: ref.title,
          url: ref.url,
          snippet: ref.content,
        }));
      }
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Baidu search timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }
```

- [ ] **Step 4: Export WebSearchResult and createWebSearchProviderFromConfig**

Ensure `WebSearchResult` is exported, and `createWebSearchProviderFromConfig` return type is accessible. The executor will call `provider.searchStructured(keywords)`.

- [ ] **Step 5: Verify build**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/webSearch.ts && git commit -m "feat(webSearch): add searchStructured method returning title/url/snippet"
```

---

### Task 5: Branch Node Executor — Test and Implementation

**Files:**
- Create: `backend/tests/workflow/nodeExecutors/branchNodeExecutor.test.ts`
- Create: `backend/src/workflow/nodeExecutors/branchNodeExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/index.ts:15-18`

- [ ] **Step 1: Write branch executor tests**

Create `backend/tests/workflow/nodeExecutors/branchNodeExecutor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BranchNodeExecutor } from '../../../src/workflow/nodeExecutors/branchNodeExecutor';
import type { BranchNodeConfig } from '../../../src/workflow/workflow.types';

function makeContext(field: string, operator: BranchNodeConfig['operator'], value: string) {
  const config: BranchNodeConfig = {
    nodeType: 'branch',
    field,
    operator,
    value,
    outputVariable: 'branch_result',
  };
  return { workFolder: '/tmp/test', nodeId: 'n1', nodeName: 'branch1', resolvedConfig: config };
}

describe('BranchNodeExecutor', () => {
  const executor = new BranchNodeExecutor();

  it('should have type "branch"', () => {
    expect(executor.type).toBe('branch');
  });

  // String equality
  it('eq: returns true when field equals value', async () => {
    const result = await executor.execute(makeContext('hello', 'eq', 'hello'));
    expect(result.result).toBe(true);
  });

  it('eq: returns false when field does not equal value', async () => {
    const result = await executor.execute(makeContext('hello', 'eq', 'world'));
    expect(result.result).toBe(false);
  });

  it('neq: returns true when field differs from value', async () => {
    const result = await executor.execute(makeContext('hello', 'neq', 'world'));
    expect(result.result).toBe(true);
  });

  // Numeric comparisons
  it('gt: returns true when field > value', async () => {
    const result = await executor.execute(makeContext('10', 'gt', '5'));
    expect(result.result).toBe(true);
  });

  it('gt: returns false when field <= value', async () => {
    const result = await executor.execute(makeContext('3', 'gt', '5'));
    expect(result.result).toBe(false);
  });

  it('lt: returns true when field < value', async () => {
    const result = await executor.execute(makeContext('3', 'lt', '5'));
    expect(result.result).toBe(true);
  });

  it('gte: returns true when field equals value', async () => {
    const result = await executor.execute(makeContext('5', 'gte', '5'));
    expect(result.result).toBe(true);
  });

  it('lte: returns true when field equals value', async () => {
    const result = await executor.execute(makeContext('5', 'lte', '5'));
    expect(result.result).toBe(true);
  });

  // Contains
  it('contains: returns true when field contains value', async () => {
    const result = await executor.execute(makeContext('hello world', 'contains', 'world'));
    expect(result.result).toBe(true);
  });

  it('not_contains: returns true when field does not contain value', async () => {
    const result = await executor.execute(makeContext('hello', 'not_contains', 'world'));
    expect(result.result).toBe(true);
  });

  // Empty checks
  it('is_empty: returns true for empty string', async () => {
    const result = await executor.execute(makeContext('', 'is_empty', ''));
    expect(result.result).toBe(true);
  });

  it('is_not_empty: returns true for non-empty string', async () => {
    const result = await executor.execute(makeContext('data', 'is_not_empty', ''));
    expect(result.result).toBe(true);
  });

  // Numeric conversion failure
  it('gt: throws when field is not a number', async () => {
    await expect(executor.execute(makeContext('abc', 'gt', '5'))).rejects.toThrow();
  });

  it('gt: throws when value is not a number', async () => {
    await expect(executor.execute(makeContext('10', 'gt', 'xyz'))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run tests/workflow/nodeExecutors/branchNodeExecutor.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BranchNodeExecutor**

Create `backend/src/workflow/nodeExecutors/branchNodeExecutor.ts`:

```typescript
import type { BranchNodeConfig, BranchNodeOutput } from '../workflow.types';
import type { NodeExecutionContext, NodeExecutor } from './types';
import { WorkflowExecutionError } from '../../errors/types';

export class BranchNodeExecutor implements NodeExecutor {
  readonly type = 'branch';

  async execute(context: NodeExecutionContext): Promise<BranchNodeOutput> {
    const config = context.resolvedConfig as BranchNodeConfig;
    const { field, operator, value } = config;

    const result = this.evaluate(field, operator, value);
    return { result };
  }

  private evaluate(
    field: string,
    operator: BranchNodeConfig['operator'],
    value: string
  ): boolean {
    switch (operator) {
      case 'eq':
        return String(field) === String(value);
      case 'neq':
        return String(field) !== String(value);
      case 'gt':
        return this.compareNumbers(field, value, (a, b) => a > b);
      case 'lt':
        return this.compareNumbers(field, value, (a, b) => a < b);
      case 'gte':
        return this.compareNumbers(field, value, (a, b) => a >= b);
      case 'lte':
        return this.compareNumbers(field, value, (a, b) => a <= b);
      case 'contains':
        return String(field).includes(String(value));
      case 'not_contains':
        return !String(field).includes(String(value));
      case 'is_empty':
        return field === '' || field === null || field === undefined;
      case 'is_not_empty':
        return field !== '' && field !== null && field !== undefined;
    }
  }

  private compareNumbers(
    fieldStr: string,
    valueStr: string,
    comparator: (a: number, b: number) => boolean
  ): boolean {
    const a = Number(fieldStr);
    const b = Number(valueStr);
    if (isNaN(a)) {
      throw new WorkflowExecutionError(`Branch condition: field value "${fieldStr}" is not a number`);
    }
    if (isNaN(b)) {
      throw new WorkflowExecutionError(`Branch condition: comparison value "${valueStr}" is not a number`);
    }
    return comparator(a, b);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run tests/workflow/nodeExecutors/branchNodeExecutor.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Register executor in index.ts (line 15-18)**

Add to `backend/src/workflow/nodeExecutors/index.ts`:

```typescript
import { BranchNodeExecutor } from './branchNodeExecutor';

// In the registration block:
registerExecutor(new BranchNodeExecutor());
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/nodeExecutors/branchNodeExecutor.ts backend/tests/workflow/nodeExecutors/branchNodeExecutor.test.ts backend/src/workflow/nodeExecutors/index.ts && git commit -m "feat(workflow): add branch node executor with condition evaluation"
```

---

### Task 6: Web Search Node Executor — Test and Implementation

**Files:**
- Create: `backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts`
- Create: `backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/index.ts`

- [ ] **Step 1: Write web search executor tests**

Create `backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchNodeExecutor } from '../../../src/workflow/nodeExecutors/webSearchNodeExecutor';
import type { WebSearchNodeConfig } from '../../../src/workflow/workflow.types';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock globalConfig and webSearch
vi.mock('../../../src/globalConfig/globalConfig.service', () => ({
  getWebSearchConfig: vi.fn(),
}));

vi.mock('../../../src/infrastructure/tools/webSearch', () => ({
  createWebSearchProviderFromConfig: vi.fn(),
}));

import { getWebSearchConfig } from '../../../src/globalConfig/globalConfig.service';
import { createWebSearchProviderFromConfig } from '../../../src/infrastructure/tools/webSearch';

const mockGetConfig = vi.mocked(getWebSearchConfig);
const mockCreateProvider = vi.mocked(createWebSearchProviderFromConfig);

function makeContext(keywords: string, workFolder: string) {
  const config: WebSearchNodeConfig = {
    nodeType: 'web_search',
    keywords,
    outputVariable: 'search_result',
  };
  return { workFolder, nodeId: 'n1', nodeName: 'web_search_1', resolvedConfig: config };
}

describe('WebSearchNodeExecutor', () => {
  const executor = new WebSearchNodeExecutor();
  let workFolder: string;

  beforeEach(() => {
    workFolder = mkdtempSync(join(tmpdir(), 'wf-test-'));
    vi.clearAllMocks();
  });

  it('should have type "web_search"', () => {
    expect(executor.type).toBe('web_search');
  });

  it('should search and write markdown file', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockResolvedValue([
        { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
        { title: 'Result 2', url: 'https://example.com/2', snippet: 'Second result' },
      ]),
    } as never);

    const result = await executor.execute(makeContext('test query', workFolder));

    expect(result.totalResults).toBe(2);
    expect(result.markdownPath).toContain('web_search_1_search.md');
    expect(existsSync(result.markdownPath)).toBe(true);

    const content = readFileSync(result.markdownPath, 'utf-8');
    expect(content).toContain('test query');
    expect(content).toContain('Result 1');
    expect(content).toContain('https://example.com/1');
  });

  it('should handle empty results', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockResolvedValue([]),
    } as never);

    const result = await executor.execute(makeContext('no results query', workFolder));

    expect(result.totalResults).toBe(0);
    expect(existsSync(result.markdownPath)).toBe(true);
  });

  it('should throw on empty keywords', async () => {
    await expect(executor.execute(makeContext('', workFolder))).rejects.toThrow();
  });

  it('should throw when search API fails', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockRejectedValue(new Error('API error')),
    } as never);

    await expect(executor.execute(makeContext('fail query', workFolder))).rejects.toThrow(
      'API error'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement WebSearchNodeExecutor**

Create `backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts`:

```typescript
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { WebSearchNodeConfig, WebSearchNodeOutput } from '../workflow.types';
import type { NodeExecutionContext, NodeExecutor } from './types';
import { WorkflowExecutionError } from '../../errors/types';
import { getWebSearchConfig } from '../../globalConfig/globalConfig.service';
import {
  createWebSearchProviderFromConfig,
  type WebSearchResult,
} from '../../infrastructure/tools/webSearch';
import { sanitizeNodeName } from './utils';
import logger from '../../utils/logger';

export class WebSearchNodeExecutor implements NodeExecutor {
  readonly type = 'web_search';

  async execute(context: NodeExecutionContext): Promise<WebSearchNodeOutput> {
    const config = context.resolvedConfig as WebSearchNodeConfig;
    const { keywords } = config;

    if (!keywords.trim()) {
      throw new WorkflowExecutionError('Web search keywords cannot be empty');
    }

    logger.info(`Web search node "${context.nodeName}" searching: "${keywords}"`);

    const wsConfig = await getWebSearchConfig();
    const provider = createWebSearchProviderFromConfig(wsConfig);
    const results = await provider.searchStructured(keywords);

    const markdown = this.formatMarkdown(keywords, results);
    const safeName = sanitizeNodeName(context.nodeName);
    const filePath = join(context.workFolder, `${safeName}_search.md`);
    writeFileSync(filePath, markdown, 'utf-8');

    logger.info(`Web search saved ${results.length} results to ${filePath}`);

    return {
      markdownPath: filePath,
      totalResults: results.length,
    };
  }

  private formatMarkdown(keywords: string, results: WebSearchResult[]): string {
    const lines: string[] = [`# 搜索结果: ${keywords}`, ''];

    if (results.length === 0) {
      lines.push('无搜索结果。');
      return lines.join('\n');
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`## ${i + 1}. ${r.title}`);
      lines.push(`- **来源**: ${r.url}`);
      lines.push('');
      lines.push(r.snippet);
      lines.push('');
      if (i < results.length - 1) {
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Register executor in index.ts**

Add to `backend/src/workflow/nodeExecutors/index.ts`:

```typescript
import { WebSearchNodeExecutor } from './webSearchNodeExecutor';

// In the registration block:
registerExecutor(new WebSearchNodeExecutor());
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts backend/tests/workflow/nodeExecutors/webSearchNodeExecutor.test.ts backend/src/workflow/nodeExecutors/index.ts && git commit -m "feat(workflow): add web search node executor"
```

---

### Task 7: Execution Engine — Branch Skip Logic, Config Resolution, Preview

**Files:**
- Modify: `backend/src/workflow/executionEngine.ts`

This is the most critical task. Four changes needed: (1) resolveNodeConfig cases, (2) collectResolvedStrings cases, (3) annotateOutputTypes for web_search, (4) buildPreview disambiguation, (5) branch skip logic in main loop.

- [ ] **Step 1: Add resolveNodeConfig cases (after email case, ~line 515)**

```typescript
    case 'branch': {
      const branchConfig = config as BranchNodeConfig;
      return {
        ...branchConfig,
        field: resolveTemplate(branchConfig.field, nodeOutputs),
      };
    }
    case 'web_search': {
      const wsConfig = config as WebSearchNodeConfig;
      return {
        ...wsConfig,
        keywords: resolveTemplate(wsConfig.keywords, nodeOutputs),
      };
    }
```

Add imports at top: `BranchNodeConfig`, `WebSearchNodeConfig`.

- [ ] **Step 2: Add collectResolvedStrings cases (after email case, ~line 545)**

```typescript
    case 'branch':
      return [(config as BranchNodeConfig).field];
    case 'web_search':
      return [(config as WebSearchNodeConfig).keywords];
```

- [ ] **Step 3: Update annotateOutputTypes for web_search (in fileFieldMap, ~line 110)**

```typescript
  const fileFieldMap: Record<string, Record<string, OutputValueType>> = {
    sql: { csvPath: 'csvFile' },
    python: { csvPath: 'csvFile' },
    web_search: { markdownPath: 'markdownFile' },
  };
```

- [ ] **Step 4: Update buildPreview to use nodeType parameter**

Change `buildPreview` signature and body (~line 605):

```typescript
function buildPreview(
  nodeType: string,
  output: NodeOutput
): Record<string, unknown> | null {
  switch (nodeType) {
    case 'sql':
      if ('previewData' in output) {
        return {
          type: 'sql',
          columns: output.columns,
          previewData: output.previewData,
          totalRows: output.totalRows,
        };
      }
      return null;
    case 'python':
      if ('result' in output && 'stderr' in output) {
        return { type: 'python', result: output.result, stderr: output.stderr };
      }
      return null;
    case 'llm':
      if ('result' in output && 'rawResponse' in output) {
        return { type: 'llm', result: output.result };
      }
      return null;
    case 'email':
      if ('success' in output && 'messageId' in output) {
        return { type: 'email', success: output.success, recipients: output.recipients };
      }
      return null;
    case 'branch':
      return { type: 'branch', result: (output as BranchNodeOutput).result };
    case 'web_search':
      return {
        type: 'web_search',
        totalResults: (output as WebSearchNodeOutput).totalResults,
      };
    default:
      return null;
  }
}
```

Update the call site (~line 392):
```typescript
      const preview = buildPreview(node.type, output);
```

- [ ] **Step 5: Add branch skip logic to executeNodes main loop**

This is the core change. The current loop at line 337-430 uses a simple `failed` boolean flag. We need to add `blockedEdgeIds` set and edge-checking logic.

Add before the main loop (after line 335):

```typescript
  // Track blocked edges for branch skip logic
  const blockedEdgeIds = new Set<string>();
```

Replace the current skip-on-failure logic (lines 342-352) with:

```typescript
    // Check if node should be skipped (branch logic)
    const inEdges = workflow.edges.filter((e) => e.targetNodeId === nodeId);
    if (inEdges.length > 0 && inEdges.every((e) => blockedEdgeIds.has(e.id))) {
      // All incoming edges are blocked — skip this node
      await repository.updateNodeRun(nodeRunId, { status: RunStatus.Skipped });
      sendProgress(run.id, {
        type: 'node_skipped',
        runId: run.id,
        nodeId,
        nodeName: node.name,
      });
      // Propagate: block all outgoing edges
      for (const outEdge of workflow.edges.filter((e) => e.sourceNodeId === nodeId)) {
        blockedEdgeIds.add(outEdge.id);
      }
      continue;
    }

    if (failed) {
      // Skip downstream nodes after failure
      await repository.updateNodeRun(nodeRunId, { status: RunStatus.Skipped });
      sendProgress(run.id, {
        type: 'node_skipped',
        runId: run.id,
        nodeId,
        nodeName: node.name,
      });
      continue;
    }
```

After a branch node executes successfully (after output is stored, ~line 389), add:

```typescript
      // Branch node: block edges for the inactive branch
      if (node.type === 'branch' && 'result' in output) {
        const branchResult = (output as BranchNodeOutput).result;
        const outEdges = workflow.edges.filter((e) => e.sourceNodeId === nodeId);
        for (const edge of outEdges) {
          // Block edges whose sourceHandle doesn't match the branch result
          if (edge.sourceHandle === 'true' && !branchResult) {
            blockedEdgeIds.add(edge.id);
          } else if (edge.sourceHandle === 'false' && branchResult) {
            blockedEdgeIds.add(edge.id);
          }
        }
      }
```

- [ ] **Step 6: Add necessary imports**

At the top of `executionEngine.ts`, add `BranchNodeOutput`, `WebSearchNodeOutput`, `BranchNodeConfig`, `WebSearchNodeConfig` to imports from `workflow.types`.

- [ ] **Step 7: Verify build**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/workflow/executionEngine.ts && git commit -m "feat(workflow): add branch skip logic and new node type support to execution engine"
```

---

### Task 8: Execution Engine Branch Logic — Tests

**Files:**
- Create or modify: `backend/tests/workflow/executionEngine.branch.test.ts`

- [ ] **Step 1: Write execution engine branch tests**

Create `backend/tests/workflow/executionEngine.branch.test.ts` with tests covering:

1. **Branch true path**: Branch evaluates true → true-handle downstream executes, false-handle downstream skipped
2. **Branch false path**: Branch evaluates false → false-handle downstream executes, true-handle downstream skipped
3. **Diamond merge**: Node reachable from both branches → runs if at least one path is active
4. **Single-sided branch**: Only true branch has downstream → false branch silently ends
5. **Nested branches**: Branch within a branch path

These tests should mock the repository, node executors, and progress callbacks. Follow the test patterns from existing `executionEngine` tests.

- [ ] **Step 2: Run tests**

```bash
cd backend && npx vitest run tests/workflow/executionEngine.branch.test.ts
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/workflow/executionEngine.branch.test.ts && git commit -m "test(workflow): add execution engine branch skip logic tests"
```

---

### Task 9: Frontend Types and Constants

**Files:**
- Modify: `frontend/src/types/workflow.ts`
- Modify: `frontend/src/constants/workflow.ts`

- [ ] **Step 1: Update WorkflowNodeType union (line 1)**

```typescript
export type WorkflowNodeType = 'sql' | 'python' | 'llm' | 'email' | 'branch' | 'web_search';
```

- [ ] **Step 2: Add BranchNodeConfig and WebSearchNodeConfig (after EmailNodeConfig, ~line 124)**

```typescript
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty';
  value: string;
  outputVariable: string;
}

export interface WebSearchNodeConfig {
  nodeType: 'web_search';
  keywords: string;
  outputVariable: string;
}
```

- [ ] **Step 3: Update NodeConfig union type (line 126)**

```typescript
export type NodeConfig =
  | SqlNodeConfig
  | PythonNodeConfig
  | LlmNodeConfig
  | EmailNodeConfig
  | BranchNodeConfig
  | WebSearchNodeConfig;
```

- [ ] **Step 4: Add sourceHandle to edge types**

Update `ExportedWorkflowEdge` (~line 31):
```typescript
export interface ExportedWorkflowEdge {
  sourceNodeName: string;
  targetNodeName: string;
  sourceHandle?: string;
}
```

Update `WorkflowEdgeInfo` (~line 54):
```typescript
export interface WorkflowEdgeInfo {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}
```

Update `SaveWorkflowInput` edges array type (~line 164, inside the interface):
```typescript
  edges: { sourceNodeId: string; targetNodeId: string; sourceHandle?: string }[];
```

- [ ] **Step 5: Update NODE_COLORS in constants/workflow.ts (line 2-8)**

```typescript
const NODE_COLORS: Record<WorkflowNodeType, string> = {
  sql: '#3B82F6',
  python: '#22C55E',
  llm: '#A855F7',
  email: '#EC4899',
  branch: '#F59E0B',
  web_search: '#06B6D4',
};
```

- [ ] **Step 6: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/workflow.ts frontend/src/constants/workflow.ts && git commit -m "feat(workflow): add branch and web_search frontend types and colors"
```

---

### Task 10: Frontend Store — Default Configs and Edge sourceHandle

**Files:**
- Modify: `frontend/src/stores/workflowStore.ts`

- [ ] **Step 1: Add default configs for branch and web_search (in getDefaultConfig, ~line 487-522)**

Add cases before the closing `}`:

```typescript
    case 'branch':
      return {
        nodeType: 'branch',
        field: '',
        operator: 'eq',
        value: '',
        outputVariable: 'branch_result',
      };
    case 'web_search':
      return {
        nodeType: 'web_search',
        keywords: '',
        outputVariable: 'search_result',
      };
```

- [ ] **Step 2: Update addEdge to accept and store sourceHandle (line 205)**

```typescript
  function addEdge(
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle?: string | null
  ): string | null {
```

Update the `newEdge` object (~line 214):
```typescript
    const newEdge: WorkflowEdgeInfo = {
      id: edgeId,
      workflowId: editorWorkflow.value.id,
      sourceNodeId,
      targetNodeId,
      sourceHandle: sourceHandle ?? undefined,
    };
```

- [ ] **Step 3: Update saveWorkflow to include sourceHandle in edges (line 269-272)**

```typescript
      edges: wf.edges.map((e) => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle,
      })),
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/workflowStore.ts && git commit -m "feat(workflow): add branch/web_search default configs and edge sourceHandle support"
```

---

### Task 11: Frontend Canvas — Branch Node Handles and Edge sourceHandle

**Files:**
- Modify: `frontend/src/components/workflow/WfCanvasNode.vue`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`

- [ ] **Step 1: Update WfCanvasNode to render dual handles for branch nodes**

In `WfCanvasNode.vue` template, replace the single output Handle (~line 39) with conditional rendering:

```vue
    <!-- Output handles -->
    <template v-if="data.nodeType === 'branch'">
      <Handle
        id="true"
        type="source"
        :position="Position.Bottom"
        :style="{ left: '30%', background: '#22C55E' }"
      />
      <Handle
        id="false"
        type="source"
        :position="Position.Bottom"
        :style="{ left: '70%', background: '#EF4444' }"
      />
      <div class="wf-canvas-node__branch-labels">
        <span class="branch-label branch-label--true">{{ t('workflow.branch.yes') }}</span>
        <span class="branch-label branch-label--false">{{ t('workflow.branch.no') }}</span>
      </div>
    </template>
    <Handle v-else type="source" :position="Position.Bottom" />
```

Add CSS for branch labels:

```scss
.wf-canvas-node__branch-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}
```

Also add the node type icon mapping — in the header icon section (~line 18-24), add:

```vue
    <GitBranch v-else-if="data.nodeType === 'branch'" :size="14" />
    <Search v-else-if="data.nodeType === 'web_search'" :size="14" />
```

Import `GitBranch` and `Search` from `lucide-vue-next`.

- [ ] **Step 2: Update WfEditorCanvas edge mapping to include sourceHandle (~line 96-131)**

In the `flowEdges` mapping, add `sourceHandle`:

```typescript
      return {
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? undefined,
        type: 'smoothstep',
        // ... rest stays the same
      };
```

- [ ] **Step 3: Update handleConnect to pass sourceHandle (~line 182-191)**

```typescript
function handleConnect(connection: Connection): void {
  if (connection.source && connection.target) {
    if (connection.source === connection.target) return;
    if (wouldCreateCycle(connection.source, connection.target)) {
      ElMessage.warning(t('workflow.validation.cyclicEdge'));
      return;
    }
    store.addEdge(connection.source, connection.target, connection.sourceHandle);
  }
}
```

- [ ] **Step 4: Update getContentPreview for new node types (~line 136-149)**

Add cases:

```typescript
    case 'branch': {
      const bc = config as BranchNodeConfig;
      const opLabel = bc.operator || '';
      return `${bc.field} ${opLabel} ${bc.value}`.substring(0, 50);
    }
    case 'web_search':
      return ((config as WebSearchNodeConfig).keywords || '').substring(0, 50);
```

Import `BranchNodeConfig`, `WebSearchNodeConfig` from types.

- [ ] **Step 5: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workflow/WfCanvasNode.vue frontend/src/components/workflow/WfEditorCanvas.vue && git commit -m "feat(workflow): add branch dual handles and edge sourceHandle in canvas"
```

---

### Task 12: Frontend Node Palette — Add Branch and Web Search

**Files:**
- Modify: `frontend/src/components/workflow/WfNodePalette.vue:9-31`

- [ ] **Step 1: Add branch and web_search palette items**

After the email palette item (~line 31), add:

```vue
        <WfPaletteItem type="branch" :label="t('workflow.nodeTypes.branch')" :color="NODE_COLORS.branch">
          <template #icon><GitBranch :size="16" /></template>
        </WfPaletteItem>
        <WfPaletteItem type="web_search" :label="t('workflow.nodeTypes.web_search')" :color="NODE_COLORS.web_search">
          <template #icon><Search :size="16" /></template>
        </WfPaletteItem>
```

Import `GitBranch`, `Search` from `lucide-vue-next`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/workflow/WfNodePalette.vue && git commit -m "feat(workflow): add branch and web_search to node palette"
```

---

### Task 13: Frontend Config Panel — WfConfigBranch

**Files:**
- Create: `frontend/src/components/workflow/config/WfConfigBranch.vue`

- [ ] **Step 1: Create WfConfigBranch.vue**

Follow the pattern from `WfConfigEmail.vue`. The component should have:

- **Node name** input
- **Field** input — text input for the template variable (e.g. `{{sqlNode.totalRows}}`), with a hint showing available upstream variables
- **Operator** selector — el-select with options: eq, neq, gt, lt, gte, lte, contains, not_contains, is_empty, is_not_empty (labels from i18n)
- **Value** input — text input, hidden when operator is `is_empty` or `is_not_empty`
- **Output variable** input

Props: `{ node: WorkflowNodeInfo }`. Updates via `store.updateNodeConfig()`.

Watch `props.node.id` to reset refs when switching nodes.

- [ ] **Step 2: Integrate in WorkflowPage.vue**

Add to the desktop config drawer switch (~line 27-64 in WorkflowPage.vue):
```vue
<WfConfigBranch v-else-if="store.selectedNode?.type === 'branch'" :node="store.selectedNode" />
```

Import the component.

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/config/WfConfigBranch.vue frontend/src/components/workflow/WorkflowPage.vue && git commit -m "feat(workflow): add branch node config panel"
```

---

### Task 14: Frontend Config Panel — WfConfigWebSearch

**Files:**
- Create: `frontend/src/components/workflow/config/WfConfigWebSearch.vue`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`

- [ ] **Step 1: Create WfConfigWebSearch.vue**

The component should have:

- **Node name** input
- **Keywords** input — text input with placeholder showing `{{}}` template syntax
- **Search engine info** — read-only display showing the current global search config type (tip text guiding to settings)
- **Output variable** input

Props: `{ node: WorkflowNodeInfo }`. Updates via `store.updateNodeConfig()`.

- [ ] **Step 2: Integrate in WorkflowPage.vue**

Add to the desktop config drawer:
```vue
<WfConfigWebSearch v-else-if="store.selectedNode?.type === 'web_search'" :node="store.selectedNode" />
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/config/WfConfigWebSearch.vue frontend/src/components/workflow/WorkflowPage.vue && git commit -m "feat(workflow): add web search node config panel"
```

---

### Task 15: Frontend Node Preview — Branch and Web Search

**Files:**
- Modify: `frontend/src/components/workflow/WfNodePreview.vue`

- [ ] **Step 1: Add branch preview section (after email preview, ~line 79)**

```vue
      <!-- Branch preview -->
      <div v-else-if="nodeType === 'branch' && nodeRun.outputs" class="preview-section">
        <div class="preview-label">{{ t('workflow.preview.branchResult') }}</div>
        <el-tag :type="nodeRun.outputs.result ? 'success' : 'danger'">
          {{ nodeRun.outputs.result ? t('workflow.branch.yes') : t('workflow.branch.no') }}
        </el-tag>
      </div>
```

- [ ] **Step 2: Add web_search preview section**

```vue
      <!-- Web Search preview -->
      <div v-else-if="nodeType === 'web_search' && nodeRun.outputs" class="preview-section">
        <div class="preview-label">{{ t('workflow.preview.webSearchOutput') }}</div>
        <div>{{ t('workflow.preview.totalResults', { n: nodeRun.outputs.totalResults ?? 0 }) }}</div>
      </div>
```

The existing typed file output section will automatically pick up `markdownPath` since it's wrapped as a `TypedOutputValue`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfNodePreview.vue && git commit -m "feat(workflow): add branch and web_search node previews"
```

---

### Task 16: Frontend i18n — Chinese and English

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add zh-CN translations**

In the `workflow` section of `zh-CN.ts`:

Under `nodeTypes` (~line 350-355):
```typescript
  branch: '分支判断',
  web_search: '网页搜索',
```

Add new config keys:
```typescript
  // Branch config
  'config.branchField': '判断变量',
  'config.branchFieldPlaceholder': '例如 {{sqlNode.totalRows}}',
  'config.branchOperator': '运算符',
  'config.branchValue': '比较值',
  'config.branchValuePlaceholder': '输入比较值',

  // Branch operators
  'operator.eq': '等于',
  'operator.neq': '不等于',
  'operator.gt': '大于',
  'operator.lt': '小于',
  'operator.gte': '大于等于',
  'operator.lte': '小于等于',
  'operator.contains': '包含',
  'operator.not_contains': '不包含',
  'operator.is_empty': '为空',
  'operator.is_not_empty': '不为空',

  // Branch labels
  'branch.yes': '是',
  'branch.no': '否',

  // Web Search config
  'config.searchKeywords': '搜索关键词',
  'config.searchKeywordsPlaceholder': '输入关键词，支持 {{}} 变量引用',
  'config.searchEngineInfo': '搜索引擎配置请在全局设置中管理',

  // Preview
  'preview.branchResult': '判断结果',
  'preview.webSearchOutput': '搜索结果',
  'preview.totalResults': '共 {n} 条结果',
```

- [ ] **Step 2: Add en-US translations**

Mirror the above in `en-US.ts`:

```typescript
  branch: 'Branch',
  web_search: 'Web Search',

  'config.branchField': 'Condition Field',
  'config.branchFieldPlaceholder': 'e.g. {{sqlNode.totalRows}}',
  'config.branchOperator': 'Operator',
  'config.branchValue': 'Compare Value',
  'config.branchValuePlaceholder': 'Enter comparison value',

  'operator.eq': 'Equals',
  'operator.neq': 'Not Equals',
  'operator.gt': 'Greater Than',
  'operator.lt': 'Less Than',
  'operator.gte': 'Greater or Equal',
  'operator.lte': 'Less or Equal',
  'operator.contains': 'Contains',
  'operator.not_contains': 'Not Contains',
  'operator.is_empty': 'Is Empty',
  'operator.is_not_empty': 'Is Not Empty',

  'branch.yes': 'Yes',
  'branch.no': 'No',

  'config.searchKeywords': 'Search Keywords',
  'config.searchKeywordsPlaceholder': 'Enter keywords, supports {{}} variable references',
  'config.searchEngineInfo': 'Search engine is configured in global settings',

  'preview.branchResult': 'Branch Result',
  'preview.webSearchOutput': 'Search Results',
  'preview.totalResults': '{n} results found',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/ && git commit -m "feat(workflow): add branch and web_search i18n translations"
```

---

### Task 17: Copilot — System Prompt and Tools

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/copilotTools.ts`

- [ ] **Step 1: Add node descriptions to NODE_TYPE_DESCRIPTIONS (~line 7-90 in copilotPrompt.ts)**

Add after the email node description:

```typescript
### Branch (branch)
条件判断节点，根据上游输出字段进行条件比较，控制工作流分支走向。

**Config:**
- \`field\`: string — 判断的变量，使用模板语法如 \`{{sqlNode.totalRows}}\`
- \`operator\`: string — 比较运算符，可选值: eq, neq, gt, lt, gte, lte, contains, not_contains, is_empty, is_not_empty
- \`value\`: string — 比较值（is_empty/is_not_empty 时忽略）
- \`outputVariable\`: string — 输出变量名

**Output:**
- \`result\`: boolean — 条件判断结果

**Tips:**
- 连接下游节点时，必须通过 wf_connect_nodes 工具的 sourceHandle 参数指定 "true" 或 "false"
- sourceHandle="true" 表示条件满足时走的分支
- sourceHandle="false" 表示条件不满足时走的分支
- 下游节点可以直接通过 {{}} 引用任意上游节点的输出，分支节点不做数据透传

### Web Search (web_search)
网页搜索节点，调用全局配置的搜索引擎搜索关键词，结果保存为 Markdown 文件。

**Config:**
- \`keywords\`: string — 搜索关键词，支持 \`{{}}\` 模板变量
- \`outputVariable\`: string — 输出变量名

**Output:**
- \`markdownPath\`: string — 搜索结果 Markdown 文件路径
- \`totalResults\`: number — 搜索结果数量

**Tips:**
- 搜索引擎类型和参数在全局设置中配置，节点本身不需要配置搜索引擎
- 输出的 Markdown 文件可以通过 {{webSearchNode.markdownPath}} 传递给下游 LLM 节点
```

- [ ] **Step 2: Add default configs to buildDefaultConfig in copilotTools.ts (~line 95-106)**

```typescript
    case 'branch':
      return {
        nodeType: 'branch',
        field: '',
        operator: 'eq',
        value: '',
        outputVariable: 'branch_result',
      } as NodeConfig;
    case 'web_search':
      return {
        nodeType: 'web_search',
        keywords: '',
        outputVariable: 'search_result',
      } as NodeConfig;
```

- [ ] **Step 3: Add sourceHandle parameter to wf_connect_nodes tool (~line 626-633)**

Update the parameters schema:

```typescript
  parameters: {
    type: 'object',
    properties: {
      sourceNodeId: { type: 'string', description: 'Source node ID' },
      targetNodeId: { type: 'string', description: 'Target node ID' },
      sourceHandle: {
        type: 'string',
        description:
          'Source handle identifier. Required when source is a branch node: "true" for condition-met path, "false" for condition-not-met path.',
      },
    },
    required: ['sourceNodeId', 'targetNodeId'],
  },
```

Update the execute method (~line 664) to include sourceHandle:

```typescript
      input.edges.push({
        sourceNodeId,
        targetNodeId,
        sourceHandle: params.sourceHandle as string | undefined,
      });
```

- [ ] **Step 4: Verify build**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/copilotTools.ts && git commit -m "feat(copilot): add branch and web_search node support to copilot"
```

---

### Task 18: Copilot Frontend — Node Card

**Files:**
- Modify: `frontend/src/components/workflow/copilot/CopilotNodeCard.vue`

- [ ] **Step 1: Add branch and web_search icons in header (~line 3-18)**

Add icon cases:

```vue
      <GitBranch v-else-if="nodeType === 'branch'" :size="16" />
      <Search v-else-if="nodeType === 'web_search'" :size="16" />
```

Import `GitBranch`, `Search` from `lucide-vue-next`.

- [ ] **Step 2: Add config summary cases in configSummary computed (~line 68-81)**

```typescript
      case 'branch': {
        const bc = props.config as BranchNodeConfig;
        return `${bc.field} ${bc.operator} ${bc.value}`.substring(0, 50);
      }
      case 'web_search':
        return ((props.config as WebSearchNodeConfig).keywords || '').substring(0, 50);
```

- [ ] **Step 3: Add expanded config panel rendering (~line 26-31)**

```vue
        <WfConfigBranch v-else-if="nodeType === 'branch'" :node="nodeObj" />
        <WfConfigWebSearch v-else-if="nodeType === 'web_search'" :node="nodeObj" />
```

Import the components.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/copilot/CopilotNodeCard.vue && git commit -m "feat(copilot): add branch and web_search node card support"
```

---

### Task 19: Mobile Support

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowPage.vue` (mobile section)

- [ ] **Step 1: Update mobile add menu (~line 115-135)**

Add branch and web_search buttons to the mobile add menu drawer. Follow the existing pattern of 3 buttons (sql/python/llm), add 2 more:

```vue
          <el-button @click="addMobileNode('branch')">
            <GitBranch :size="18" />
            {{ t('workflow.nodeTypes.branch') }}
          </el-button>
          <el-button @click="addMobileNode('web_search')">
            <Search :size="18" />
            {{ t('workflow.nodeTypes.web_search') }}
          </el-button>
```

- [ ] **Step 2: Update WfMobileNodeConfigSheet.vue to handle new node types**

Modify `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue`. This file has explicit `v-else-if` chains per node type. Add:

```vue
<WfConfigBranch v-else-if="node.type === 'branch'" :node="node" />
<WfConfigWebSearch v-else-if="node.type === 'web_search'" :node="node" />
```

Import `WfConfigBranch` and `WfConfigWebSearch` components.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WorkflowPage.vue frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue && git commit -m "feat(workflow): add branch and web_search to mobile workflow editor"
```

---

### Task 20: Frontend Config Panel Tests

**Files:**
- Create: `frontend/tests/components/workflow/config/WfConfigBranch.test.ts`
- Create: `frontend/tests/components/workflow/config/WfConfigWebSearch.test.ts`

- [ ] **Step 1: Write WfConfigBranch tests**

Create `frontend/tests/components/workflow/config/WfConfigBranch.test.ts`. Test cases:

1. Renders operator selector with all operator options
2. Hides value input when operator is `is_empty` or `is_not_empty`
3. Shows value input for other operators (eq, gt, etc.)
4. Calls store.updateNodeConfig when field/operator/value changes

Follow the mount pattern from existing `CopilotNodeCard.test.ts`: create i18n, Pinia store, Element Plus plugins.

- [ ] **Step 2: Write WfConfigWebSearch tests**

Create `frontend/tests/components/workflow/config/WfConfigWebSearch.test.ts`. Test cases:

1. Renders keywords input field
2. Renders output variable input
3. Calls store.updateNodeConfig when keywords change

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run tests/components/workflow/config/
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/components/workflow/config/ && git commit -m "test(workflow): add branch and web_search config panel tests"
```

---

### Task 21: Copilot Tests

**Files:**
- Modify: `backend/tests/copilotTools.test.ts`
- Modify: `backend/tests/copilotPrompt.test.ts`

- [ ] **Step 1: Add copilot tools tests for new node types**

In `backend/tests/copilotTools.test.ts`, add test cases:

1. `wf_add_node` creates branch node with default config (field='', operator='eq', value='')
2. `wf_add_node` creates web_search node with default config (keywords='')
3. `wf_connect_nodes` passes sourceHandle to edge when provided

- [ ] **Step 2: Add copilot prompt tests for new node descriptions**

In `backend/tests/copilotPrompt.test.ts`, add test cases:

1. System prompt contains "branch" node description
2. System prompt contains "web_search" node description
3. System prompt mentions sourceHandle for branch connections

- [ ] **Step 3: Run tests**

```bash
cd backend && npx vitest run tests/copilotTools.test.ts tests/copilotPrompt.test.ts
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/copilotTools.test.ts backend/tests/copilotPrompt.test.ts && git commit -m "test(copilot): add branch and web_search node tests for copilot"
```

---

### Task 22: Run Preflight Checks

- [ ] **Step 1: Backend preflight**

```bash
cd backend && pnpm run preflight
```

Fix any TypeScript, ESLint, or Prettier issues.

- [ ] **Step 2: Frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Fix any TypeScript, ESLint, or Prettier issues.

- [ ] **Step 3: Run all tests**

```bash
cd backend && pnpm test
cd frontend && pnpm test
```

Fix any test failures.

- [ ] **Step 4: Final commit (if fixes needed)**

```bash
git add -A && git commit -m "fix: resolve preflight issues for branch and web_search nodes"
```
