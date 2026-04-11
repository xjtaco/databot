# Workflow Import/Export Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zip-based batch export and JSON/zip import to the workflow list, with auto-rename on conflict and result summary dialog.

**Architecture:** Backend gains a single `POST /workflows/import` endpoint that accepts an `ExportedWorkflow` JSON and returns the created workflow ID with rename status. Frontend handles all zip packing/unpacking via JSZip. Import results are shown in a summary dialog.

**Tech Stack:** Vue 3, TypeScript, Element Plus, JSZip (new), Express.js v5, Prisma v7, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/src/workflow/workflow.types.ts` | Add `ImportWorkflowResult` type |
| Modify | `backend/src/workflow/workflow.service.ts` | Add `importWorkflow` function |
| Modify | `backend/src/workflow/workflow.controller.ts` | Add `importWorkflowHandler` |
| Modify | `backend/src/workflow/workflow.routes.ts` | Register `POST /import` route |
| Create | `backend/tests/workflow/workflow.import.test.ts` | Backend import tests |
| Modify | `frontend/src/types/workflow.ts` | Add `ImportWorkflowResult` and `ImportResultItem` types |
| Modify | `frontend/src/api/workflow.ts` | Add `importWorkflow` API function |
| Modify | `frontend/src/stores/workflowStore.ts` | Add `batchExportWorkflows` and `handleImportFile` |
| Modify | `frontend/src/locales/zh-CN.ts` | Add import i18n keys |
| Modify | `frontend/src/locales/en-US.ts` | Add import i18n keys |
| Create | `frontend/src/components/workflow/ImportResultDialog.vue` | Import result summary dialog |
| Modify | `frontend/src/components/workflow/WfListView.vue` | Add import button, refactor export |
| Create | `frontend/tests/stores/workflowStore-import-export.test.ts` | Frontend import/export tests |

---

### Task 1: Backend — Add `ImportWorkflowResult` type

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts:212` (after `ExportedWorkflow` interface)
- Modify: `frontend/src/types/workflow.ts:42` (after `ExportedWorkflow` interface)

- [ ] **Step 1: Add type to backend**

In `backend/src/workflow/workflow.types.ts`, add after the `ExportedWorkflow` interface (line 212):

```typescript
export interface ImportWorkflowResult {
  id: string;
  name: string;
  renamed: boolean;
}
```

- [ ] **Step 2: Add types to frontend**

In `frontend/src/types/workflow.ts`, add after the `ExportedWorkflow` interface (line 42):

```typescript
export interface ImportWorkflowResult {
  id: string;
  name: string;
  renamed: boolean;
}

export interface ImportResultItem {
  originalName: string;
  result?: ImportWorkflowResult;
  error?: string;
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/backend && npx tsc --noEmit`
Expected: no errors

Run: `cd /data/code/bot-fix-bugs/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/workflow/workflow.types.ts frontend/src/types/workflow.ts
git commit -m "feat(workflow): add ImportWorkflowResult type to backend and frontend"
```

---

### Task 2: Backend — Implement `importWorkflow` service function

**Files:**
- Modify: `backend/src/workflow/workflow.service.ts:6-18` (add import of new type, add repository import for `findAllWorkflowNames`)
- Modify: `backend/src/workflow/workflow.repository.ts` (add `findAllWorkflowNames` function)
- Create: `backend/tests/workflow/workflow.import.test.ts`

- [ ] **Step 1: Add `findAllWorkflowNames` to repository**

In `backend/src/workflow/workflow.repository.ts`, add after the `findAllWorkflows` function (around line 167):

```typescript
export async function findAllWorkflowNames(): Promise<string[]> {
  const prisma = getPrismaClient();
  const workflows = await prisma.workflow.findMany({
    select: { name: true },
  });
  return workflows.map((w) => w.name);
}
```

- [ ] **Step 2: Write failing tests for importWorkflow**

Create `backend/tests/workflow/workflow.import.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockValidateDag = vi.fn();
vi.mock('../../src/workflow/dagValidator', () => ({
  validateDag: (...args: unknown[]) => mockValidateDag(...args),
}));

const mockCreateWorkflow = vi.fn();
const mockFindAllWorkflowNames = vi.fn();
const mockFindWorkflowById = vi.fn();
const mockSaveWorkflow = vi.fn();

vi.mock('../../src/workflow/workflow.repository', () => ({
  createWorkflow: (...args: unknown[]) => mockCreateWorkflow(...args),
  findAllWorkflowNames: (...args: unknown[]) => mockFindAllWorkflowNames(...args),
  findWorkflowById: (...args: unknown[]) => mockFindWorkflowById(...args),
  saveWorkflow: (...args: unknown[]) => mockSaveWorkflow(...args),
  findAllWorkflows: vi.fn(),
  deleteWorkflow: vi.fn(),
  cloneWorkflow: vi.fn(),
  exportWorkflow: vi.fn(),
  findRunsByWorkflowId: vi.fn(),
  findRunById: vi.fn(),
}));

import { importWorkflow } from '../../src/workflow/workflow.service';
import { WorkflowValidationError } from '../../src/errors/types';
import type {
  ExportedWorkflow,
  WorkflowDetail,
  SqlNodeConfig,
  PythonNodeConfig,
} from '../../src/workflow/workflow.types';

function makeSqlConfig(): SqlNodeConfig {
  return { nodeType: 'sql', datasourceId: 'ds-1', sql: 'SELECT 1', outputVariable: 'result' };
}

function makePythonConfig(): PythonNodeConfig {
  return { nodeType: 'python', params: {}, script: 'result = {}', outputVariable: 'result' };
}

const now = new Date('2026-04-02T00:00:00Z');

function makeWorkflowDetail(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    id: 'wf-new',
    name: 'Imported',
    description: null,
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('importWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAllWorkflowNames.mockResolvedValue([]);
  });

  it('should import a workflow without rename when no conflict', async () => {
    const exported: ExportedWorkflow = {
      name: 'My Workflow',
      description: 'desc',
      nodes: [
        { name: 'sql_1', description: null, type: 'sql', config: makeSqlConfig(), positionX: 0, positionY: 0 },
      ],
      edges: [],
    };

    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'My Workflow' });
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    const result = await importWorkflow(exported);
    expect(result).toEqual({ id: 'wf-new', name: 'My Workflow', renamed: false });
  });

  it('should auto-rename when name conflicts', async () => {
    mockFindAllWorkflowNames.mockResolvedValue(['My Workflow']);

    const exported: ExportedWorkflow = {
      name: 'My Workflow',
      description: null,
      nodes: [
        { name: 'sql_1', description: null, type: 'sql', config: makeSqlConfig(), positionX: 0, positionY: 0 },
      ],
      edges: [],
    };

    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'My Workflow(1)' });
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    const result = await importWorkflow(exported);
    expect(result).toEqual({ id: 'wf-new', name: 'My Workflow(1)', renamed: true });
    expect(mockCreateWorkflow).toHaveBeenCalledWith('My Workflow(1)', null);
  });

  it('should increment suffix until unique name found', async () => {
    mockFindAllWorkflowNames.mockResolvedValue(['Test', 'Test(1)', 'Test(2)']);

    const exported: ExportedWorkflow = {
      name: 'Test',
      description: null,
      nodes: [],
      edges: [],
    };

    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'Test(3)' });
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    const result = await importWorkflow(exported);
    expect(result.name).toBe('Test(3)');
    expect(result.renamed).toBe(true);
  });

  it('should convert edge node names to temp IDs for saveWorkflow', async () => {
    const exported: ExportedWorkflow = {
      name: 'Pipeline',
      description: null,
      nodes: [
        { name: 'sql_1', description: null, type: 'sql', config: makeSqlConfig(), positionX: 0, positionY: 0 },
        { name: 'python_1', description: null, type: 'python', config: makePythonConfig(), positionX: 200, positionY: 0 },
      ],
      edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'python_1' }],
    };

    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'Pipeline' });
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    await importWorkflow(exported);

    // Verify saveWorkflow was called with edge referencing tempIds (node names used as tempIds)
    const saveCall = mockSaveWorkflow.mock.calls[0];
    const input = saveCall[1];
    expect(input.edges[0].sourceNodeId).toBe('sql_1');
    expect(input.edges[0].targetNodeId).toBe('python_1');
    expect(input.nodes[0].tempId).toBe('sql_1');
    expect(input.nodes[1].tempId).toBe('python_1');
  });

  it('should throw WorkflowValidationError for edge referencing non-existent node name', async () => {
    const exported: ExportedWorkflow = {
      name: 'Bad',
      description: null,
      nodes: [
        { name: 'sql_1', description: null, type: 'sql', config: makeSqlConfig(), positionX: 0, positionY: 0 },
      ],
      edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'missing_node' }],
    };

    await expect(importWorkflow(exported)).rejects.toThrow(WorkflowValidationError);
  });

  it('should throw WorkflowValidationError when name is empty', async () => {
    const exported: ExportedWorkflow = {
      name: '',
      description: null,
      nodes: [],
      edges: [],
    };

    await expect(importWorkflow(exported)).rejects.toThrow(WorkflowValidationError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /data/code/bot-fix-bugs/backend && npx vitest run tests/workflow/workflow.import.test.ts`
Expected: FAIL — `importWorkflow` is not exported

- [ ] **Step 4: Implement `importWorkflow` in service**

In `backend/src/workflow/workflow.service.ts`, add import for `ImportWorkflowResult` at line 14 and add the function after `exportWorkflow`:

```typescript
export async function importWorkflow(input: ExportedWorkflow): Promise<ImportWorkflowResult> {
  // Validate name
  if (!input.name || input.name.trim().length === 0) {
    throw new WorkflowValidationError('Workflow name must not be empty');
  }

  // Validate edge references
  const nodeNames = new Set(input.nodes.map((n) => n.name));
  for (const edge of input.edges) {
    if (!nodeNames.has(edge.sourceNodeName)) {
      throw new WorkflowValidationError(`Edge references non-existent source node: ${edge.sourceNodeName}`);
    }
    if (!nodeNames.has(edge.targetNodeName)) {
      throw new WorkflowValidationError(`Edge references non-existent target node: ${edge.targetNodeName}`);
    }
  }

  // Resolve name conflicts
  const existingNames = new Set(await repository.findAllWorkflowNames());
  let finalName = input.name.trim();
  let renamed = false;
  if (existingNames.has(finalName)) {
    renamed = true;
    let suffix = 1;
    while (existingNames.has(`${input.name.trim()}(${suffix})`)) {
      suffix++;
    }
    finalName = `${input.name.trim()}(${suffix})`;
  }

  // Create empty workflow
  const created = await repository.createWorkflow(finalName, input.description ?? undefined);

  // Convert ExportedWorkflow to SaveWorkflowInput
  // Use node names as tempIds so edges can reference them
  const saveInput: SaveWorkflowInput = {
    name: finalName,
    description: input.description ?? undefined,
    nodes: input.nodes.map((n) => ({
      tempId: n.name,
      name: n.name,
      description: n.description ?? undefined,
      type: n.type,
      config: n.config,
      positionX: n.positionX,
      positionY: n.positionY,
    })),
    edges: input.edges.map((e) => ({
      sourceNodeId: e.sourceNodeName,
      targetNodeId: e.targetNodeName,
      sourceHandle: e.sourceHandle,
    })),
  };

  // saveWorkflow validates node types, unique names, DAG, and edge references
  await saveWorkflow(created.id, saveInput);

  logger.info('Imported workflow', { workflowId: created.id, name: finalName, renamed });
  return { id: created.id, name: finalName, renamed };
}
```

Update the import at the top to include `ImportWorkflowResult`:

```typescript
import {
  // ... existing imports ...
  ExportedWorkflow,
  ImportWorkflowResult,
  // ...
} from './workflow.types';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /data/code/bot-fix-bugs/backend && npx vitest run tests/workflow/workflow.import.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 6: Run full backend check**

Run: `cd /data/code/bot-fix-bugs/backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/workflow/workflow.service.ts backend/src/workflow/workflow.repository.ts backend/tests/workflow/workflow.import.test.ts
git commit -m "feat(workflow): implement importWorkflow service with auto-rename"
```

---

### Task 3: Backend — Add controller handler and route

**Files:**
- Modify: `backend/src/workflow/workflow.controller.ts:10` (add import)
- Modify: `backend/src/workflow/workflow.routes.ts:3,27` (add import and route)

- [ ] **Step 1: Add `importWorkflowHandler` to controller**

Note: The controller uses `ValidationError` for basic structural checks (name, nodes, edges presence) — consistent with existing handlers like `saveWorkflowHandler`. The service uses `WorkflowValidationError` (E00028) for business logic validation (edge references, DAG, node types).

In `backend/src/workflow/workflow.controller.ts`, add import for `ExportedWorkflow` at line 10:

```typescript
import { SaveWorkflowInput, RunWorkflowInput, RunStatus, RunStatusValue, ExportedWorkflow } from './workflow.types';
```

Then add after `exportWorkflowHandler` (line 68):

```typescript
export async function importWorkflowHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ExportedWorkflow;
  if (!body.name || typeof body.name !== 'string') {
    throw new ValidationError('Name is required');
  }
  if (!Array.isArray(body.nodes)) {
    throw new ValidationError('Nodes array is required');
  }
  if (!Array.isArray(body.edges)) {
    throw new ValidationError('Edges array is required');
  }
  const result = await workflowService.importWorkflow(body);
  res.status(HttpStatusCode.CREATED).json({ result });
}
```

- [ ] **Step 2: Register route**

In `backend/src/workflow/workflow.routes.ts`, add imports:

```typescript
import express from 'express';
```

And add `importWorkflowHandler` to the import block (line 3-19).

Add the route **before** the `/:id` routes (before line 28), after the static routes. Use a route-specific body parser with a 1MB limit to handle large workflow JSONs:

```typescript
router.post('/import', express.json({ limit: '1mb' }), importWorkflowHandler);
```

The route section should look like:

```typescript
router.post('/', createWorkflowHandler);
router.get('/', listWorkflowsHandler);
router.get('/file-preview', filePreviewHandler);
router.get('/file-raw', fileRawHandler);
router.use('/schedules', scheduleRoutes);
router.post('/import', express.json({ limit: '1mb' }), importWorkflowHandler);  // <-- new, before /:id
router.get('/:id', getWorkflowHandler);
```

- [ ] **Step 3: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run existing tests**

Run: `cd /data/code/bot-fix-bugs/backend && npx vitest run tests/workflow/`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/workflow/workflow.controller.ts backend/src/workflow/workflow.routes.ts
git commit -m "feat(workflow): add POST /workflows/import route and handler"
```

---

### Task 4: Frontend — Add API function and i18n keys

**Files:**
- Modify: `frontend/src/api/workflow.ts:11,71` (add import, add function)
- Modify: `frontend/src/locales/zh-CN.ts:450-468`
- Modify: `frontend/src/locales/en-US.ts:457-475`

- [ ] **Step 1: Add `importWorkflow` API function**

In `frontend/src/api/workflow.ts`, add `ImportWorkflowResult` to the type import (line 11):

```typescript
import type {
  // ... existing ...
  ExportedWorkflow,
  ImportWorkflowResult,
  // ...
} from '@/types/workflow';
```

Add response interface and function after `exportWorkflow` (line 71):

```typescript
interface ImportWorkflowResponse {
  result: ImportWorkflowResult;
}

export async function importWorkflow(data: ExportedWorkflow): Promise<ImportWorkflowResult> {
  const res = await http.post<ImportWorkflowResponse>('/workflows/import', data);
  return res.result;
}
```

- [ ] **Step 2: Add i18n keys to zh-CN**

In `frontend/src/locales/zh-CN.ts`, add within the `list` object (after `edit: '编辑'`):

```typescript
      importWorkflow: '导入工作流',
      importSuccess: '导入成功',
      importRenamed: '导入成功（重命名为 {name}）',
      importFailed: '导入失败：{error}',
      importResultTitle: '导入结果',
      importResultName: '工作流名称',
      importResultStatus: '状态',
      importNoValidFiles: 'ZIP 中未找到有效的工作流文件',
      importInvalidFormat: '文件格式无效，请选择 JSON 或 ZIP 文件',
```

- [ ] **Step 3: Add i18n keys to en-US**

In `frontend/src/locales/en-US.ts`, add within the `list` object (after `edit: 'Edit'`):

```typescript
      importWorkflow: 'Import Workflow',
      importSuccess: 'Imported successfully',
      importRenamed: 'Imported (renamed to {name})',
      importFailed: 'Import failed: {error}',
      importResultTitle: 'Import Results',
      importResultName: 'Workflow Name',
      importResultStatus: 'Status',
      importNoValidFiles: 'No valid workflow files found in ZIP',
      importInvalidFormat: 'Invalid file format, please select a JSON or ZIP file',
```

- [ ] **Step 4: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/workflow.ts frontend/src/types/workflow.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(workflow): add import API function and i18n keys"
```

---

### Task 5: Frontend — Add JSZip dependency and store methods

**Files:**
- Modify: `frontend/package.json` (add jszip)
- Modify: `frontend/src/stores/workflowStore.ts:112-122` (replace `exportWorkflow`, add `batchExportWorkflows`, `handleImportFile`)

- [ ] **Step 1: Install JSZip**

Run: `cd /data/code/bot-fix-bugs/frontend && pnpm add jszip`

- [ ] **Step 2: Add `batchExportWorkflows` to store**

In `frontend/src/stores/workflowStore.ts`, add import at the top:

```typescript
import JSZip from 'jszip';
import * as workflowApi from '@/api/workflow';
import type {
  // ... existing imports ...
  ExportedWorkflow,
  ImportWorkflowResult,
  ImportResultItem,
} from '@/types/workflow';
```

Replace the existing `exportWorkflow` function (lines 112-122) and add new methods:

```typescript
  async function exportWorkflow(id: string): Promise<void> {
    const workflow = workflows.value.find((w) => w.id === id);
    const data = await workflowApi.exportWorkflow(id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow?.name ?? 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function batchExportWorkflows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    if (ids.length === 1) {
      await exportWorkflow(ids[0]);
      return;
    }

    // Fetch all exports concurrently
    const results = await Promise.all(
      ids.map(async (id) => {
        const wf = workflows.value.find((w) => w.id === id);
        const data = await workflowApi.exportWorkflow(id);
        return { name: wf?.name ?? 'workflow', data };
      })
    );

    // Build zip with sanitized filenames
    const zip = new JSZip();
    const usedNames = new Map<string, number>();

    for (const { name, data } of results) {
      const sanitized = sanitizeFilename(name);
      const count = usedNames.get(sanitized) ?? 0;
      const fileName = count === 0 ? `${sanitized}.json` : `${sanitized}(${count}).json`;
      usedNames.set(sanitized, count + 1);
      zip.file(fileName, JSON.stringify(data, null, 2));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflows-export.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File): Promise<ImportResultItem[]> {
    const importResults: ImportResultItem[] = [];
    let workflowsToImport: { name: string; data: ExportedWorkflow }[] = [];

    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportedWorkflow;
      if (!parsed.name || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('invalid_format');
      }
      workflowsToImport.push({ name: parsed.name, data: parsed });
    } else if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.keys(zip.files).filter(
        (f) => f.endsWith('.json') && !zip.files[f].dir
      );
      if (jsonFiles.length === 0) {
        throw new Error('no_valid_files');
      }
      for (const jsonFile of jsonFiles) {
        const text = await zip.files[jsonFile].async('text');
        try {
          const parsed = JSON.parse(text) as ExportedWorkflow;
          if (parsed.name && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
            workflowsToImport.push({ name: parsed.name, data: parsed });
          }
        } catch {
          // Skip invalid JSON files in zip
        }
      }
      if (workflowsToImport.length === 0) {
        throw new Error('no_valid_files');
      }
    } else {
      throw new Error('invalid_format');
    }

    // Import sequentially for deterministic rename ordering
    for (const { name, data } of workflowsToImport) {
      try {
        const result = await workflowApi.importWorkflow(data);
        importResults.push({ originalName: name, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        importResults.push({ originalName: name, error: msg });
      }
    }

    // Refresh list after import
    await fetchWorkflows();
    return importResults;
  }
```

Add a `sanitizeFilename` helper function outside the store (after `getDefaultConfig`):

```typescript
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}
```

Update the return statement to include the new methods:

```typescript
  return {
    // ... existing ...
    batchExportWorkflows,
    handleImportFile,
    // ...
  };
```

- [ ] **Step 3: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/stores/workflowStore.ts
git commit -m "feat(workflow): add batch export zip and import file handling to store"
```

---

### Task 6: Frontend — Write store tests for import/export

**Files:**
- Create: `frontend/tests/stores/workflowStore-import-export.test.ts`

- [ ] **Step 1: Write tests**

Create `frontend/tests/stores/workflowStore-import-export.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { ExportedWorkflow, ImportWorkflowResult } from '@/types/workflow';

vi.mock('@/api/workflow');

// Mock JSZip
const mockFile = vi.fn();
const mockGenerateAsync = vi.fn();
const mockLoadAsync = vi.fn();

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
      static loadAsync = mockLoadAsync;
    },
  };
});

describe('workflowStore import/export', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeExported = (name = 'Test'): ExportedWorkflow => ({
    name,
    description: null,
    nodes: [
      {
        name: 'sql_1',
        description: null,
        type: 'sql',
        config: { nodeType: 'sql', datasourceId: '', sql: '', outputVariable: 'r' },
        positionX: 0,
        positionY: 0,
      },
    ],
    edges: [],
  });

  describe('batchExportWorkflows', () => {
    it('should download single JSON for one workflow', async () => {
      const store = useWorkflowStore();
      store.workflows = [{ id: 'wf-1', name: 'My WF', description: null, nodeCount: 1, lastRunAt: null, lastRunStatus: null, createdAt: '', updatedAt: '' }];
      vi.mocked(workflowApi.exportWorkflow).mockResolvedValue(makeExported('My WF'));

      // Mock URL/DOM
      const mockClick = vi.fn();
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:url');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });
      vi.spyOn(document, 'createElement').mockReturnValue({ click: mockClick, href: '', download: '' } as unknown as HTMLAnchorElement);

      await store.batchExportWorkflows(['wf-1']);

      expect(workflowApi.exportWorkflow).toHaveBeenCalledWith('wf-1');
      expect(mockClick).toHaveBeenCalled();
    });

    it('should create zip for multiple workflows', async () => {
      const store = useWorkflowStore();
      store.workflows = [
        { id: 'wf-1', name: 'WF1', description: null, nodeCount: 1, lastRunAt: null, lastRunStatus: null, createdAt: '', updatedAt: '' },
        { id: 'wf-2', name: 'WF2', description: null, nodeCount: 1, lastRunAt: null, lastRunStatus: null, createdAt: '', updatedAt: '' },
      ];
      vi.mocked(workflowApi.exportWorkflow)
        .mockResolvedValueOnce(makeExported('WF1'))
        .mockResolvedValueOnce(makeExported('WF2'));
      mockGenerateAsync.mockResolvedValue(new Blob());

      const mockClick = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:url'), revokeObjectURL: vi.fn() });
      vi.spyOn(document, 'createElement').mockReturnValue({ click: mockClick, href: '', download: '' } as unknown as HTMLAnchorElement);

      await store.batchExportWorkflows(['wf-1', 'wf-2']);

      expect(mockFile).toHaveBeenCalledTimes(2);
      expect(mockFile).toHaveBeenCalledWith('WF1.json', expect.any(String));
      expect(mockFile).toHaveBeenCalledWith('WF2.json', expect.any(String));
      expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    });
  });

  describe('handleImportFile', () => {
    it('should import single JSON file', async () => {
      const store = useWorkflowStore();
      const exported = makeExported('Imported');
      const importResult: ImportWorkflowResult = { id: 'wf-new', name: 'Imported', renamed: false };

      vi.mocked(workflowApi.importWorkflow).mockResolvedValue(importResult);
      vi.mocked(workflowApi.listWorkflows).mockResolvedValue([]);

      const file = new File([JSON.stringify(exported)], 'workflow.json', { type: 'application/json' });
      const results = await store.handleImportFile(file);

      expect(results).toHaveLength(1);
      expect(results[0].originalName).toBe('Imported');
      expect(results[0].result).toEqual(importResult);
    });

    it('should collect errors without throwing for partial failures', async () => {
      const store = useWorkflowStore();

      mockLoadAsync.mockResolvedValue({
        files: {
          'a.json': { dir: false, async: vi.fn().mockResolvedValue(JSON.stringify(makeExported('A'))) },
          'b.json': { dir: false, async: vi.fn().mockResolvedValue(JSON.stringify(makeExported('B'))) },
        },
      });

      vi.mocked(workflowApi.importWorkflow)
        .mockResolvedValueOnce({ id: 'wf-1', name: 'A', renamed: false })
        .mockRejectedValueOnce(new Error('Server error'));
      vi.mocked(workflowApi.listWorkflows).mockResolvedValue([]);

      const file = new File([], 'batch.zip');
      Object.defineProperty(file, 'name', { value: 'batch.zip' });
      const results = await store.handleImportFile(file);

      expect(results).toHaveLength(2);
      expect(results[0].result).toBeDefined();
      expect(results[1].error).toBe('Server error');
    });

    it('should throw for invalid file format', async () => {
      const store = useWorkflowStore();
      const file = new File([], 'data.csv');
      Object.defineProperty(file, 'name', { value: 'data.csv' });

      await expect(store.handleImportFile(file)).rejects.toThrow('invalid_format');
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /data/code/bot-fix-bugs/frontend && npx vitest run tests/stores/workflowStore-import-export.test.ts`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/stores/workflowStore-import-export.test.ts
git commit -m "test(workflow): add store tests for batch export and import"
```

---

### Task 7: Frontend — Create ImportResultDialog component

**Files:**
- Create: `frontend/src/components/workflow/ImportResultDialog.vue`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/workflow/ImportResultDialog.vue`:

```vue
<template>
  <el-dialog
    :model-value="visible"
    :title="t('workflow.list.importResultTitle')"
    width="520px"
    @close="emit('close')"
  >
    <el-table :data="results" style="width: 100%">
      <el-table-column :label="t('workflow.list.importResultName')" min-width="160">
        <template #default="{ row }">{{ row.originalName }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.importResultStatus')" min-width="200">
        <template #default="{ row }">
          <span v-if="row.result && !row.result.renamed" class="import-status import-status--success">
            {{ t('workflow.list.importSuccess') }}
          </span>
          <span v-else-if="row.result && row.result.renamed" class="import-status import-status--renamed">
            {{ t('workflow.list.importRenamed', { name: row.result.name }) }}
          </span>
          <span v-else class="import-status import-status--error">
            {{ t('workflow.list.importFailed', { error: row.error ?? '' }) }}
          </span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button type="primary" @click="emit('close')">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ImportResultItem } from '@/types/workflow';

defineProps<{
  visible: boolean;
  results: ImportResultItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.import-status {
  font-size: 13px;
}

.import-status--success {
  color: var(--success);
}

.import-status--renamed {
  color: var(--warning);
}

.import-status--error {
  color: var(--error);
}
</style>
```

- [ ] **Step 2: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/ImportResultDialog.vue
git commit -m "feat(workflow): add ImportResultDialog component"
```

---

### Task 8: Frontend — Update WfListView with import button and batch export

**Files:**
- Modify: `frontend/src/components/workflow/WfListView.vue`

- [ ] **Step 1: Add import button and file input to template**

In `WfListView.vue`, update the `wf-list-header__right` div (lines 29-36) to add the import button before the export button:

```vue
      <div class="wf-list-header__right">
        <el-button :icon="Upload" @click="triggerImportFile">
          {{ t('workflow.list.importWorkflow') }}
        </el-button>
        <input
          ref="importFileInput"
          type="file"
          accept=".json,.zip"
          style="display: none"
          @change="handleImportFileChange"
        />
        <el-button :icon="Download" :disabled="selectedIds.length === 0" @click="handleBatchExport">
          {{ t('workflow.list.exportSelected') }}
        </el-button>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
          {{ t('workflow.newWorkflow') }}
        </el-button>
      </div>
```

Add the `ImportResultDialog` at the end of the template (before the closing `</div>` of `wf-list-view`):

```vue
    <!-- Import Result Dialog -->
    <ImportResultDialog
      :visible="showImportResult"
      :results="importResults"
      @close="showImportResult = false"
    />
```

- [ ] **Step 2: Update script setup**

Add `Upload` to the icons import:

```typescript
import {
  Search,
  Plus,
  Edit as EditIcon,
  VideoPlay,
  CopyDocument,
  Download,
  Upload,
  Delete as DeleteIcon,
  Clock,
} from '@element-plus/icons-vue';
```

Add component import:

```typescript
import ImportResultDialog from './ImportResultDialog.vue';
import type { ImportResultItem } from '@/types/workflow';
```

Add import state and handlers after the selection section:

```typescript
// ── Import ──────────────────────────────────────────────
const importFileInput = ref<HTMLInputElement>();
const showImportResult = ref(false);
const importResults = ref<ImportResultItem[]>([]);

function triggerImportFile(): void {
  importFileInput.value?.click();
}

async function handleImportFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const results = await store.handleImportFile(file);
    importResults.value = results;
    showImportResult.value = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'no_valid_files') {
      ElMessage.warning(t('workflow.list.importNoValidFiles'));
    } else {
      ElMessage.error(t('workflow.list.importInvalidFormat'));
    }
  } finally {
    // Reset file input so same file can be selected again
    input.value = '';
  }
}
```

Update `handleBatchExport` to use the new store method:

```typescript
async function handleBatchExport(): Promise<void> {
  if (selectedIds.value.length === 0) return;
  try {
    await store.batchExportWorkflows(selectedIds.value);
  } catch {
    ElMessage.error(t('common.failed'));
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /data/code/bot-fix-bugs/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run all frontend checks**

Run: `cd /data/code/bot-fix-bugs/frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workflow/WfListView.vue
git commit -m "feat(workflow): add import button and batch export to workflow list"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full backend preflight**

Run: `cd /data/code/bot-fix-bugs/backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run full frontend preflight**

Run: `cd /data/code/bot-fix-bugs/frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Run all workflow-related tests**

Run: `cd /data/code/bot-fix-bugs/backend && npx vitest run tests/workflow/`
Expected: all PASS

Run: `cd /data/code/bot-fix-bugs/frontend && npx vitest run tests/stores/workflowStore`
Expected: all PASS
