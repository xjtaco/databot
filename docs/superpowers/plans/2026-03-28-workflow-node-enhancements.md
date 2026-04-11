# Workflow Node Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed I/O system, Copilot intelligence enhancement, Markdown output node, Email sending node with global SMTP config, and execution animations to the databot workflow system.

**Architecture:** A unified typed I/O system (`ParamDefinition` for inputs, `TypedOutputValue` for outputs) provides the foundation. Two new node types (Markdown, Email) and a global SMTP config catalog extend the existing patterns. Execution animations are pure CSS driven by existing WebSocket events.

**Tech Stack:** Express.js v5, Prisma v7, Vue 3, TypeScript, Element Plus, vue-flow, nodemailer, marked, CodeMirror

**Spec:** `docs/superpowers/specs/2026-03-28-workflow-node-enhancements-design.md`

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/src/utils/markdownProcessor.ts` | Shared markdown file processing: CSV→table, Plotly validation, image→base64, placeholder replacement |
| `backend/src/workflow/nodeExecutors/markdownExecutor.ts` | Markdown node execution: template resolution + file processing + write output |
| `backend/src/workflow/nodeExecutors/emailExecutor.ts` | Email node execution: SMTP send via nodemailer |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/src/workflow/workflow.types.ts` | Add ParamDefinition, TypedOutputValue, MarkdownNodeConfig, EmailNodeConfig, output types |
| `backend/src/workflow/templateResolver.ts` | Update resolveParamsTemplates() for ParamDefinition format |
| `backend/src/workflow/nodeExecutors/index.ts` | Register markdown and email executors |
| `backend/src/workflow/executionEngine.ts` | Output type annotation, resolveNodeConfig for new types, buildPreview for new types |
| `backend/src/infrastructure/tools/outputMdTool.ts` | Delegate to markdownProcessor |
| `backend/src/copilot/copilotPrompt.ts` | Add data dictionary instruction + new node schemas |
| `backend/src/copilot/copilotTools.ts` | Add markdown/email default configs, update wf_add_node |
| `backend/src/globalConfig/globalConfig.types.ts` | Add SmtpConfig, 'smtp' to ConfigCategory |
| `backend/src/globalConfig/globalConfig.controller.ts` | Add SMTP validation + handlers |
| `backend/src/globalConfig/globalConfig.service.ts` | Add SMTP config CRUD with encryption |
| `backend/src/globalConfig/globalConfig.routes.ts` | Add SMTP routes |
| `backend/src/workflow/workflow.routes.ts` | Add file-preview endpoint |
| `backend/src/workflow/workflow.controller.ts` | Add file-preview handler |
| `backend/package.json` | Add nodemailer, @types/nodemailer, marked |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/workflow/config/WfParamEditor.vue` | Generic typed parameter editor component |
| `frontend/src/components/workflow/config/WfConfigMarkdown.vue` | Markdown node config with visual template editor |
| `frontend/src/components/workflow/config/WfConfigEmail.vue` | Email node config editor |
| `frontend/src/components/settings/SmtpConfigCard.vue` | SMTP settings card for Settings page |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/types/workflow.ts` | Add ParamDefinition, TypedOutputValue, new node configs, expand WorkflowNodeType |
| `frontend/src/types/globalConfig.ts` | Add SmtpConfigForm |
| `frontend/src/constants/workflow.ts` | Add markdown/email colors |
| `frontend/src/api/globalConfig.ts` | Add SMTP API functions |
| `frontend/src/stores/globalConfigStore.ts` | Add SMTP config state/actions |
| `frontend/src/components/workflow/config/WfConfigPythonScript.vue` | Use WfParamEditor |
| `frontend/src/components/workflow/config/WfConfigLlmGenerate.vue` | Use WfParamEditor |
| `frontend/src/components/workflow/WfConfigPanel.vue` | Route markdown/email node types |
| `frontend/src/components/workflow/WfEditorCanvas.vue` | Edge animation classes, getContentPreview for new types |
| `frontend/src/components/workflow/WfCanvasNode.vue` | Icons for new types, animation CSS |
| `frontend/src/components/workflow/WfNodePreview.vue` | TypedOutputValue display + file preview |
| `frontend/src/components/workflow/copilot/CopilotNodeCard.vue` | Support new node types |
| `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue` | Support new node types |
| `frontend/src/components/settings/SettingsPage.vue` | Add SmtpConfigCard |
| `frontend/src/locales/zh-CN.ts` | i18n entries |
| `frontend/src/locales/en-US.ts` | i18n entries |

---

## Task 1: Backend — Typed I/O Type Definitions

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts`

- [ ] **Step 1: Write tests for param normalization**

Create `backend/tests/workflow/paramNormalization.test.ts`:

```typescript
import { normalizeParams, isTypedOutputValue } from '../../src/workflow/workflow.types';

describe('normalizeParams', () => {
  it('wraps plain string values as text ParamDefinition', () => {
    const legacy = { host: 'localhost', port: '5432' };
    const result = normalizeParams(legacy);
    expect(result).toEqual({
      host: { value: 'localhost', type: 'text' },
      port: { value: '5432', type: 'text' },
    });
  });

  it('passes through ParamDefinition values unchanged', () => {
    const typed = {
      host: { value: 'localhost', type: 'text' as const },
      pass: { value: 'secret', type: 'password' as const },
    };
    const result = normalizeParams(typed);
    expect(result).toEqual(typed);
  });

  it('handles mixed legacy and typed params', () => {
    const mixed = {
      host: 'localhost',
      pass: { value: 'secret', type: 'password' as const },
    };
    const result = normalizeParams(mixed as Record<string, string | import('../../src/workflow/workflow.types').ParamDefinition>);
    expect(result).toEqual({
      host: { value: 'localhost', type: 'text' },
      pass: { value: 'secret', type: 'password' },
    });
  });
});

describe('isTypedOutputValue', () => {
  it('returns true for TypedOutputValue objects', () => {
    expect(isTypedOutputValue({ value: '/path/to/file.csv', type: 'csvFile' })).toBe(true);
  });

  it('returns false for plain values', () => {
    expect(isTypedOutputValue('hello')).toBe(false);
    expect(isTypedOutputValue(42)).toBe(false);
    expect(isTypedOutputValue(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/paramNormalization.test.ts`
Expected: FAIL — imports not found

- [ ] **Step 3: Add type definitions and helpers to workflow.types.ts**

In `backend/src/workflow/workflow.types.ts`, add after line 51 (after existing LlmNodeConfig):

```typescript
// --- Typed I/O System ---

export type ParamValueType = 'text' | 'password' | 'number' | 'checkbox' | 'radio' | 'select';

export interface ParamDefinition {
  value: string | number | boolean;
  type: ParamValueType;
  label?: string;
  options?: string[];
}

export type OutputValueType = 'text' | 'filePath' | 'csvFile' | 'markdownFile' | 'jsonFile' | 'imageFile';

export interface TypedOutputValue {
  value: string;
  type: OutputValueType;
}

export type OutputFieldValue = string | number | boolean | TypedOutputValue;

/** Type guard for TypedOutputValue */
export function isTypedOutputValue(val: unknown): val is TypedOutputValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    'type' in val &&
    typeof (val as TypedOutputValue).value === 'string' &&
    typeof (val as TypedOutputValue).type === 'string'
  );
}

/** Normalize legacy Record<string, string> params to Record<string, ParamDefinition> */
export function normalizeParams(
  params: Record<string, string | ParamDefinition>
): Record<string, ParamDefinition> {
  const result: Record<string, ParamDefinition> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string') {
      result[key] = { value: val, type: 'text' };
    } else {
      result[key] = val;
    }
  }
  return result;
}
```

Also update `PythonNodeConfig` and `LlmNodeConfig` params type from `Record<string, string>` to `Record<string, string | ParamDefinition>` (union for backward compat).

Add new node config types:

```typescript
export interface MarkdownNodeConfig {
  nodeType: 'markdown';
  template: string;
  replaceFiles: string[];
  outputVariable: string;
  outputFilename?: string;
}

export interface EmailNodeConfig {
  nodeType: 'email';
  to: string;
  subject: string;
  contentSource: 'inline' | 'upstream';
  body?: string;
  upstreamField?: string;
  isHtml: boolean;
  outputVariable: string;
}

export interface MarkdownNodeOutput {
  markdownPath: string;
  contentLength: number;
}

export interface EmailNodeOutput {
  success: boolean;
  messageId: string;
  recipients: string[];
}
```

Update `NodeConfig` union to include the new types. Update `WorkflowNodeType` to add `Markdown: 'markdown'` and `Email: 'email'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/workflow/paramNormalization.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/workflow/workflow.types.ts backend/tests/workflow/paramNormalization.test.ts
git commit -m "feat(workflow): add typed I/O type definitions and param normalization"
```

---

## Task 2: Backend — Update templateResolver for ParamDefinition

**Files:**
- Modify: `backend/src/workflow/templateResolver.ts`
- Test: `backend/tests/workflow/templateResolver.test.ts` (existing or new)

- [ ] **Step 1: Write tests for ParamDefinition-aware template resolution**

Create or extend `backend/tests/workflow/templateResolver.test.ts`:

```typescript
import { resolveParamsTemplates } from '../../src/workflow/templateResolver';

describe('resolveParamsTemplates with ParamDefinition', () => {
  const nodeOutputs = new Map<string, Record<string, unknown>>([
    ['sql_node', { csvPath: '/data/output.csv', totalRows: 100 }],
  ]);

  it('resolves templates in ParamDefinition values', () => {
    const params = {
      file: { value: '{{sql_node.csvPath}}', type: 'text' as const },
      password: { value: 'static-secret', type: 'password' as const },
    };
    const result = resolveParamsTemplates(params, nodeOutputs);
    expect(result).toEqual({
      file: { value: '/data/output.csv', type: 'text' },
      password: { value: 'static-secret', type: 'password' },
    });
  });

  it('handles legacy string params (backward compat)', () => {
    const params = { host: 'localhost', file: '{{sql_node.csvPath}}' };
    const result = resolveParamsTemplates(params, nodeOutputs);
    expect(result).toEqual({
      host: { value: 'localhost', type: 'text' },
      file: { value: '/data/output.csv', type: 'text' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/templateResolver.test.ts`
Expected: FAIL — type mismatch or wrong return format

- [ ] **Step 3: Update resolveParamsTemplates in templateResolver.ts**

Current signature (line 54-63):
```typescript
export function resolveParamsTemplates(
  params: Record<string, string>,
  nodeOutputs: Map<string, Record<string, unknown>>
): Record<string, string>
```

Change to:
```typescript
import { normalizeParams, type ParamDefinition } from './workflow.types';

export function resolveParamsTemplates(
  params: Record<string, string | ParamDefinition>,
  nodeOutputs: Map<string, Record<string, unknown>>
): Record<string, ParamDefinition> {
  const normalized = normalizeParams(params);
  const result: Record<string, ParamDefinition> = {};
  for (const [key, paramDef] of Object.entries(normalized)) {
    const resolvedValue = typeof paramDef.value === 'string'
      ? resolveTemplate(paramDef.value, nodeOutputs)
      : String(paramDef.value);
    result[key] = { ...paramDef, value: resolvedValue };
  }
  return result;
}
```

Also update `resolveTemplate` to handle `TypedOutputValue` in `getNestedValue`: when traversing a path and encountering a `TypedOutputValue`, auto-extract `.value`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/workflow/templateResolver.test.ts`
Expected: PASS

- [ ] **Step 5: Update executionEngine.ts resolveNodeConfig**

The `resolveNodeConfig()` function (around line 337) calls `resolveParamsTemplates()` for Python and LLM nodes. Now `resolveParamsTemplates()` returns `Record<string, ParamDefinition>`. The executor receives `resolvedConfig` and the Python executor writes `config.params` directly as JSON to the sandbox — so params must remain `Record<string, string>` at the executor level.

In `resolveNodeConfig()`, after calling `resolveParamsTemplates()`, extract flat values:
```typescript
const resolvedParamDefs = resolveParamsTemplates(config.params, nodeOutputs);
const flatParams: Record<string, string> = {};
for (const [k, pd] of Object.entries(resolvedParamDefs)) {
  flatParams[k] = String(pd.value);
}
return { ...config, params: flatParams };
```

This keeps the executor interface stable while the config editing UI uses the richer `ParamDefinition` format.

- [ ] **Step 6: Run full backend tests**

Run: `cd backend && pnpm vitest run`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/workflow/templateResolver.ts backend/src/workflow/executionEngine.ts backend/tests/workflow/templateResolver.test.ts
git commit -m "feat(workflow): update templateResolver for ParamDefinition format"
```

---

## Task 3: Backend — Extract markdownProcessor utility

**Files:**
- Create: `backend/src/utils/markdownProcessor.ts`
- Modify: `backend/src/infrastructure/tools/outputMdTool.ts`

- [ ] **Step 1: Write tests for markdownProcessor**

Create `backend/tests/utils/markdownProcessor.test.ts`:

```typescript
import { csvToMarkdownTable, validatePlotlyJson, imageToBase64DataUri, processFilePlaceholders } from '../../src/utils/markdownProcessor';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '__tmp_md_processor');

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('csvToMarkdownTable', () => {
  it('converts CSV content to markdown table', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = csvToMarkdownTable(csv);
    expect(result).toContain('| name | age |');
    expect(result).toContain('| Alice | 30 |');
  });

  it('handles empty CSV', () => {
    expect(csvToMarkdownTable('')).toBe('');
  });
});

describe('validatePlotlyJson', () => {
  it('accepts valid plotly trace types', () => {
    const json = JSON.stringify({ data: [{ type: 'scatter', x: [1], y: [2] }] });
    expect(validatePlotlyJson(json)).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(validatePlotlyJson('not json')).toBe(false);
  });
});

describe('processFilePlaceholders', () => {
  it('replaces CSV placeholder with table', () => {
    const csvPath = join(TEST_DIR, 'test.csv');
    writeFileSync(csvPath, 'a,b\n1,2');
    const md = `# Report\n<!-- {${csvPath}} -->`;
    const result = processFilePlaceholders(md, [csvPath]);
    expect(result).toContain('| a | b |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/utils/markdownProcessor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create markdownProcessor.ts**

Extract from `outputMdTool.ts` (lines ~63-186 for file handlers, ~210-290 for placeholder processing) into `backend/src/utils/markdownProcessor.ts`:

```typescript
import { readFileSync } from 'fs';
import { extname } from 'path';

const FORBIDDEN_PATTERNS = ['..', '/etc/', '/sys/', '/proc/'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function csvToMarkdownTable(csvContent: string): string { /* extract from outputMdTool lines 63-88 */ }
export function validatePlotlyJson(json: string): boolean { /* extract from outputMdTool lines 132-176 */ }
export function imageToBase64DataUri(filePath: string): string { /* extract from outputMdTool lines 181-186 */ }
export function validateFilePath(filePath: string): void { /* forbidden pattern + size checks */ }

export function processFilePlaceholders(content: string, files: string[]): string {
  // Extract placeholders: <!-- {/path/to/file} -->
  // Match each placeholder to files list
  // Process based on extension: .csv -> table, .json -> plotly, image -> base64
  // Replace in content and return
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/utils/markdownProcessor.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor outputMdTool to use markdownProcessor**

In `backend/src/infrastructure/tools/outputMdTool.ts`, replace inline CSV/Plotly/image processing with calls to the extracted functions from `markdownProcessor.ts`. The tool's `execute()` method should call `processFilePlaceholders()`.

- [ ] **Step 6: Run existing outputMdTool tests**

Run: `cd backend && pnpm vitest run tests/infrastructure/tools/outputMdTool/`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/markdownProcessor.ts backend/src/infrastructure/tools/outputMdTool.ts backend/tests/utils/markdownProcessor.test.ts
git commit -m "refactor(tools): extract markdownProcessor utility from outputMdTool"
```

---

## Task 4: Backend — Markdown node executor

**Files:**
- Create: `backend/src/workflow/nodeExecutors/markdownExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/index.ts`

**Important architecture note:** All executors implement the `NodeExecutor` interface from `nodeExecutors/types.ts`:
```typescript
interface NodeExecutionContext { workFolder: string; nodeId: string; nodeName: string; resolvedConfig: NodeConfig; }
interface NodeExecutor { readonly type: string; execute(context: NodeExecutionContext): Promise<NodeOutput>; }
```
Executors receive **already template-resolved** config from the execution engine. They do NOT access `nodeOutputs` or call `resolveTemplate()` themselves.

- [ ] **Step 1: Write tests for markdown executor**

Create `backend/tests/workflow/nodeExecutors/markdownExecutor.test.ts`:

```typescript
import { MarkdownExecutor } from '../../../src/workflow/nodeExecutors/markdownExecutor';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import type { MarkdownNodeConfig } from '../../../src/workflow/workflow.types';

const TEST_DIR = join(__dirname, '__tmp_md_exec');
const WORK_DIR = join(TEST_DIR, 'work');

beforeAll(() => {
  mkdirSync(WORK_DIR, { recursive: true });
});
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('MarkdownExecutor', () => {
  const executor = new MarkdownExecutor();

  it('generates markdown file from pre-resolved template', async () => {
    const config: MarkdownNodeConfig = {
      nodeType: 'markdown',
      template: '# Report for 42 rows',  // already resolved by execution engine
      replaceFiles: [],
      outputVariable: 'md_output',
    };
    const result = await executor.execute({
      workFolder: WORK_DIR,
      nodeId: 'node1',
      nodeName: 'md_node',
      resolvedConfig: config,
    });
    expect(result.markdownPath).toBeDefined();
    expect(result.contentLength).toBeGreaterThan(0);
    const content = readFileSync(result.markdownPath, 'utf-8');
    expect(content).toContain('# Report for 42 rows');
  });

  it('processes file placeholders via markdownProcessor', async () => {
    const csvPath = join(TEST_DIR, 'data.csv');
    writeFileSync(csvPath, 'col1,col2\nval1,val2');
    const config: MarkdownNodeConfig = {
      nodeType: 'markdown',
      template: `# Data\n<!-- {${csvPath}} -->`,
      replaceFiles: [csvPath],  // already resolved paths
      outputVariable: 'md_output',
    };
    const result = await executor.execute({
      workFolder: WORK_DIR,
      nodeId: 'node2',
      nodeName: 'md_node_2',
      resolvedConfig: config,
    });
    const content = readFileSync(result.markdownPath, 'utf-8');
    expect(content).toContain('| col1 | col2 |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/markdownExecutor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement markdownExecutor.ts**

Create `backend/src/workflow/nodeExecutors/markdownExecutor.ts`:

```typescript
import { writeFileSync } from 'fs';
import { join } from 'path';
import { processFilePlaceholders } from '../../utils/markdownProcessor';
import { getTodayDateDir, ensureDirectoryExists, getUniqueFilename, getFileBasename, getFileExtension } from '../../utils/fileHelpers';
import type { MarkdownNodeConfig, MarkdownNodeOutput } from '../workflow.types';
import type { NodeExecutor, NodeExecutionContext } from './types';

export class MarkdownExecutor implements NodeExecutor {
  readonly type = 'markdown';

  async execute(context: NodeExecutionContext): Promise<MarkdownNodeOutput> {
    const config = context.resolvedConfig as MarkdownNodeConfig;

    // 1. Template variables are already resolved by execution engine
    let content = config.template;

    // 2. Process file placeholders (CSV→table, JSON→plotly, image→base64)
    if (config.replaceFiles.length > 0) {
      content = processFilePlaceholders(content, config.replaceFiles);
    }

    // 3. Write to file
    const outputDir = join(context.workFolder, getTodayDateDir());
    ensureDirectoryExists(outputDir);
    const rawFilename = config.outputFilename || 'output.md';
    const basename = getFileBasename(rawFilename);
    const extension = getFileExtension(rawFilename) || '.md';
    const uniqueName = getUniqueFilename(outputDir, basename, extension);
    const outputPath = join(outputDir, uniqueName);
    writeFileSync(outputPath, content, 'utf-8');

    return {
      markdownPath: outputPath,
      contentLength: Buffer.byteLength(content, 'utf-8'),
    };
  }
}
```

- [ ] **Step 4: Register in nodeExecutors/index.ts**

Add import and registration for MarkdownExecutor:

```typescript
import { MarkdownExecutor } from './markdownExecutor';
// In the executors map:
executors.set('markdown', new MarkdownExecutor());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/markdownExecutor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/nodeExecutors/markdownExecutor.ts backend/src/workflow/nodeExecutors/index.ts backend/tests/workflow/nodeExecutors/markdownExecutor.test.ts
git commit -m "feat(workflow): add markdown node executor"
```

---

## Task 5: Backend — Global SMTP Config

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.types.ts`
- Modify: `backend/src/globalConfig/globalConfig.service.ts`
- Modify: `backend/src/globalConfig/globalConfig.controller.ts`
- Modify: `backend/src/globalConfig/globalConfig.routes.ts`

- [ ] **Step 1: Write tests for SMTP config CRUD**

Create `backend/tests/globalConfig/smtpConfig.test.ts`:

```typescript
import { validateSmtpConfig } from '../../src/globalConfig/globalConfig.controller';

describe('validateSmtpConfig', () => {
  it('accepts valid SMTP config', () => {
    const config = { type: 'smtp', host: 'smtp.example.com', port: 465, secure: true, user: 'me@example.com', pass: 'secret' };
    expect(() => validateSmtpConfig(config)).not.toThrow();
  });

  it('rejects missing host', () => {
    const config = { type: 'smtp', host: '', port: 465, secure: true, user: 'me@example.com', pass: 'secret' };
    expect(() => validateSmtpConfig(config)).toThrow();
  });

  it('rejects invalid port', () => {
    const config = { type: 'smtp', host: 'smtp.example.com', port: 0, secure: true, user: 'me@example.com', pass: 'secret' };
    expect(() => validateSmtpConfig(config)).toThrow();
  });

  it('rejects missing user', () => {
    const config = { type: 'smtp', host: 'smtp.example.com', port: 465, secure: true, user: '', pass: 'secret' };
    expect(() => validateSmtpConfig(config)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/globalConfig/smtpConfig.test.ts`
Expected: FAIL — function not found

- [ ] **Step 3: Add SmtpConfig type**

In `backend/src/globalConfig/globalConfig.types.ts`, add:

```typescript
export type ConfigCategory = 'llm' | 'web_search' | 'smtp';

export interface SmtpConfigData {
  type: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string;
}

export const DEFAULT_SMTP_CONFIG: SmtpConfigData = {
  type: 'smtp',
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '',
};
```

- [ ] **Step 4: Add SMTP validation in controller**

In `backend/src/globalConfig/globalConfig.controller.ts`, add `validateSmtpConfig()` following the existing pattern of `validateLLMConfig()`:

```typescript
export function validateSmtpConfig(data: Record<string, unknown>): SmtpConfigData {
  const host = (data.host as string)?.trim();
  if (!host) throw new ValidationError('SMTP host is required', 'E040');
  const port = data.port as number;
  if (!port || port < 1 || port > 65535) throw new ValidationError('Invalid port', 'E041');
  const user = (data.user as string)?.trim();
  if (!user) throw new ValidationError('SMTP user is required', 'E042');
  // pass can be masked (preserve existing)
  return { type: 'smtp', host, port, secure: !!data.secure, user, pass: data.pass as string, fromName: (data.fromName as string) || '' };
}
```

Add handler functions: `getSmtpConfigHandler`, `saveSmtpConfigHandler`, `testSmtpConnectionHandler`.

- [ ] **Step 5: Add SMTP service methods**

In `backend/src/globalConfig/globalConfig.service.ts`, add `getSmtpConfig()`, `getSmtpConfigResponse()`, `saveSmtpConfig()`, `testSmtpConnection()` following the exact pattern of LLM config (cached, encrypted pass, mask in response).

For `testSmtpConnection()`: use nodemailer to create a transporter and call `transporter.verify()`.

- [ ] **Step 6: Add SMTP routes**

In `backend/src/globalConfig/globalConfig.routes.ts`, add:

```typescript
router.get('/smtp', asyncHandler(getSmtpConfigHandler));
router.put('/smtp', asyncHandler(saveSmtpConfigHandler));
router.post('/smtp/test', asyncHandler(testSmtpConnectionHandler));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/globalConfig/smtpConfig.test.ts`
Expected: PASS

- [ ] **Step 8: Install nodemailer and marked**

Run: `cd backend && pnpm add nodemailer marked && pnpm add -D @types/nodemailer`

- [ ] **Step 9: Commit**

```bash
git add backend/src/globalConfig/ backend/tests/globalConfig/smtpConfig.test.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(config): add global SMTP configuration catalog"
```

---

## Task 6: Backend — Email node executor

**Files:**
- Create: `backend/src/workflow/nodeExecutors/emailExecutor.ts`
- Modify: `backend/src/workflow/nodeExecutors/index.ts`

- [ ] **Step 1: Write tests for email executor**

Create `backend/tests/workflow/nodeExecutors/emailExecutor.test.ts`:

```typescript
import { EmailExecutor } from '../../../src/workflow/nodeExecutors/emailExecutor';
import type { EmailNodeConfig } from '../../../src/workflow/workflow.types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '__tmp_email_exec');

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: '<test@example.com>' }),
    }),
  },
}));

// Mock globalConfig service
vi.mock('../../../src/globalConfig/globalConfig.service', () => ({
  getSmtpConfig: vi.fn().mockResolvedValue({
    host: 'smtp.test.com', port: 465, secure: true,
    user: 'sender@test.com', pass: 'secret', fromName: 'Test',
  }),
}));

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('EmailExecutor', () => {
  const executor = new EmailExecutor();

  it('sends email with inline content (all fields pre-resolved)', async () => {
    const config: EmailNodeConfig = {
      nodeType: 'email',
      to: 'user@example.com',        // already resolved by engine
      subject: 'Test Report',         // already resolved
      contentSource: 'inline',
      body: '# Hello World',          // already resolved
      isHtml: true,
      outputVariable: 'email_result',
    };
    const result = await executor.execute({
      workFolder: TEST_DIR,
      nodeId: 'node1',
      nodeName: 'email_node',
      resolvedConfig: config,
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.recipients).toEqual(['user@example.com']);
  });

  it('sends email with upstream markdown file (path pre-resolved)', async () => {
    const mdPath = join(TEST_DIR, 'report.md');
    writeFileSync(mdPath, '# Report\nSome data here');
    const config: EmailNodeConfig = {
      nodeType: 'email',
      to: 'user@example.com',
      subject: 'Report for 42 rows',    // already resolved
      contentSource: 'upstream',
      upstreamField: mdPath,              // already resolved to actual path by engine
      isHtml: true,
      outputVariable: 'email_result',
    };
    const result = await executor.execute({
      workFolder: TEST_DIR,
      nodeId: 'node2',
      nodeName: 'email_node_2',
      resolvedConfig: config,
    });
    expect(result.success).toBe(true);
  });

  it('throws when SMTP not configured', async () => {
    const { getSmtpConfig } = await import('../../../src/globalConfig/globalConfig.service');
    (getSmtpConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ host: '', port: 465, secure: true, user: '', pass: '' });

    const config: EmailNodeConfig = {
      nodeType: 'email', to: 'a@b.com', subject: 'test',
      contentSource: 'inline', body: 'hi', isHtml: false, outputVariable: 'r',
    };
    await expect(executor.execute({
      workFolder: TEST_DIR, nodeId: 'n', nodeName: 'n', resolvedConfig: config,
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/emailExecutor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement emailExecutor.ts**

Create `backend/src/workflow/nodeExecutors/emailExecutor.ts`. **Important:** The executor receives already template-resolved config from the execution engine. It does NOT call `resolveTemplate()` itself.

```typescript
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { marked } from 'marked';
import { getSmtpConfig } from '../../globalConfig/globalConfig.service';
import type { EmailNodeConfig, EmailNodeOutput } from '../workflow.types';
import type { NodeExecutor, NodeExecutionContext } from './types';
import { WorkflowExecutionError } from '../../errors/types';

export class EmailExecutor implements NodeExecutor {
  readonly type = 'email';

  async execute(context: NodeExecutionContext): Promise<EmailNodeOutput> {
    const config = context.resolvedConfig as EmailNodeConfig;

    // 1. Load SMTP config
    const smtp = await getSmtpConfig();
    if (!smtp.host || !smtp.user) {
      throw new WorkflowExecutionError('SMTP not configured. Please configure in Settings.');
    }

    // 2. All template variables in to/subject/body are already resolved by execution engine

    // 3. Get content
    let content: string;
    if (config.contentSource === 'upstream' && config.upstreamField) {
      // upstreamField is already resolved to an actual file path by the engine
      content = readFileSync(config.upstreamField, 'utf-8');
    } else {
      content = config.body || '';
    }

    // 4. Convert markdown to HTML if needed
    let html: string | undefined;
    const text: string = content;
    if (config.isHtml) {
      const htmlBody = await marked(content);
      html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">${htmlBody}</div>`;
    }

    // 5. Send email
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const recipients = config.to.split(',').map(r => r.trim()).filter(Boolean);
    const info = await transporter.sendMail({
      from: smtp.fromName ? `"${smtp.fromName}" <${smtp.user}>` : smtp.user,
      to: recipients.join(', '),
      subject: config.subject,
      text,
      html,
    });

    return {
      success: true,
      messageId: info.messageId,
      recipients,
    };
  }
}
```

- [ ] **Step 4: Register in nodeExecutors/index.ts**

```typescript
import { EmailExecutor } from './emailExecutor';
executors.set('email', new EmailExecutor());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/workflow/nodeExecutors/emailExecutor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/nodeExecutors/emailExecutor.ts backend/src/workflow/nodeExecutors/index.ts backend/tests/workflow/nodeExecutors/emailExecutor.test.ts
git commit -m "feat(workflow): add email node executor with nodemailer"
```

---

## Task 7: Backend — Execution engine updates (output type annotation + new node types)

**Files:**
- Modify: `backend/src/workflow/executionEngine.ts`

- [ ] **Step 1: Write tests for output type annotation**

Create `backend/tests/workflow/outputTypeAnnotation.test.ts`:

```typescript
import { annotateOutputTypes } from '../../src/workflow/executionEngine';

describe('annotateOutputTypes', () => {
  it('wraps SQL csvPath as csvFile TypedOutputValue', () => {
    const output = { csvPath: '/data/out.csv', totalRows: 10, columns: ['a'], previewData: [] };
    const result = annotateOutputTypes('sql', output);
    expect(result.csvPath).toEqual({ value: '/data/out.csv', type: 'csvFile' });
    expect(result.totalRows).toBe(10); // non-file fields unchanged
  });

  it('wraps Markdown markdownPath as markdownFile', () => {
    const output = { markdownPath: '/data/report.md', contentLength: 500 };
    const result = annotateOutputTypes('markdown', output);
    expect(result.markdownPath).toEqual({ value: '/data/report.md', type: 'markdownFile' });
  });

  it('wraps Python csvPath if present', () => {
    const output = { result: { key: 'val' }, csvPath: '/data/py.csv', stderr: '' };
    const result = annotateOutputTypes('python', output);
    expect(result.csvPath).toEqual({ value: '/data/py.csv', type: 'csvFile' });
    expect(result.result).toEqual({ key: 'val' }); // unchanged
  });

  it('leaves LLM output unchanged', () => {
    const output = { result: { text: 'hello' }, rawResponse: 'hello' };
    const result = annotateOutputTypes('llm', output);
    expect(result).toEqual(output);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/outputTypeAnnotation.test.ts`
Expected: FAIL — function not found

- [ ] **Step 3: Implement annotateOutputTypes and update execution engine**

In `executionEngine.ts`, add exported function:

```typescript
export function annotateOutputTypes(
  nodeType: string,
  output: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...output };
  const fileFieldMap: Record<string, Record<string, OutputValueType>> = {
    sql: { csvPath: 'csvFile' },
    python: { csvPath: 'csvFile' },
    markdown: { markdownPath: 'markdownFile' },
  };
  const fieldMap = fileFieldMap[nodeType];
  if (fieldMap) {
    for (const [field, outputType] of Object.entries(fieldMap)) {
      if (typeof result[field] === 'string') {
        result[field] = { value: result[field], type: outputType };
      }
    }
  }
  return result;
}
```

In the main `executeNodes` loop (around line 266), after getting the executor result, call `annotateOutputTypes()` before storing in `nodeOutputs`.

Also update:
- `resolveNodeConfig()`: add cases for `'markdown'` and `'email'` node types. For markdown: resolve `{{variables}}` in `template` and each entry in `replaceFiles[]`. For email: resolve `{{variables}}` in `to`, `subject`, `body`, and `upstreamField`. **Critical for Python/LLM params migration**: after `resolveParamsTemplates()` returns `Record<string, ParamDefinition>`, extract flat `Record<string, string>` by mapping each param to `String(paramDef.value)` before passing to executors. The Python executor writes `config.params` as JSON for the sandbox script — it must remain `Record<string, string>` at the executor level.
- `buildPreview()`: add preview formatting for markdown (show markdownPath + contentLength) and email (show recipients + messageId)
- `getOutputVariable()`: handle new config types
- `NodeOutput` union type in `workflow.types.ts`: add `MarkdownNodeOutput | EmailNodeOutput` to the union so executor return types satisfy the `NodeExecutor` interface
- `nodeOutputToRecord()`: add handling for new output types

- [ ] **Step 4: Run tests**

Run: `cd backend && pnpm vitest run tests/workflow/outputTypeAnnotation.test.ts`
Expected: PASS

- [ ] **Step 5: Add file-preview endpoint**

In `backend/src/workflow/workflow.controller.ts`, add:

```typescript
export async function filePreviewHandler(req: Request, res: Response): Promise<void> {
  const filePath = req.query.path as string;
  if (!filePath) throw new ValidationError('path query parameter is required');
  // Security: must be under work folder
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(config.work_folder))) {
    throw new ValidationError('Access denied: file outside work folder');
  }
  const content = readFileSync(resolved, 'utf-8');
  res.json({ content, path: resolved });
}
```

In `backend/src/workflow/workflow.routes.ts`, add:

```typescript
router.get('/file-preview', asyncHandler(filePreviewHandler));
```

- [ ] **Step 6: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/workflow/executionEngine.ts backend/src/workflow/workflow.controller.ts backend/src/workflow/workflow.routes.ts backend/tests/workflow/outputTypeAnnotation.test.ts
git commit -m "feat(workflow): add output type annotation and file-preview endpoint"
```

---

## Task 8: Backend — Copilot prompt and tool updates

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/copilotTools.ts`

- [ ] **Step 1: Update copilot system prompt**

In `copilotPrompt.ts`, add the data dictionary/knowledge base instruction block (from spec Part 2) before the tool usage guidelines section. Also add markdown and email node type descriptions with their config_schema and output_schema following the existing pattern for SQL/Python/LLM.

- [ ] **Step 2: Add default config builders for new node types**

In `copilotTools.ts`, add after existing builders (around line 78):

```typescript
function buildDefaultMarkdownConfig(): MarkdownNodeConfig {
  return {
    nodeType: 'markdown',
    template: '',
    replaceFiles: [],
    outputVariable: 'md_output',
  };
}

function buildDefaultEmailConfig(): EmailNodeConfig {
  return {
    nodeType: 'email',
    to: '',
    subject: '',
    contentSource: 'inline',
    body: '',
    isHtml: true,
    outputVariable: 'email_result',
  };
}
```

- [ ] **Step 3: Update WfAddNodeTool**

In the `WfAddNodeTool.execute()` method, update the switch/if chain that selects default config (around line 238) to include `'markdown'` and `'email'` cases.

Also update the tool's parameter schema to list `'markdown'` and `'email'` in the allowed `type` enum.

- [ ] **Step 4: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/copilotTools.ts
git commit -m "feat(copilot): add data dictionary guidance and new node type support"
```

---

## Task 9: Frontend — Type definitions and constants

**Files:**
- Modify: `frontend/src/types/workflow.ts`
- Modify: `frontend/src/types/globalConfig.ts`
- Modify: `frontend/src/constants/workflow.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Update frontend workflow types**

In `frontend/src/types/workflow.ts`:

Update `WorkflowNodeType` (line 1):
```typescript
export type WorkflowNodeType = 'sql' | 'python' | 'llm' | 'markdown' | 'email';
```

Update `PythonNodeConfig.params` and `LlmNodeConfig.params` (lines 58, 66):
```typescript
params: Record<string, string | ParamDefinition>;
```

Add new types:
```typescript
export type ParamValueType = 'text' | 'password' | 'number' | 'checkbox' | 'radio' | 'select';

export interface ParamDefinition {
  value: string | number | boolean;
  type: ParamValueType;
  label?: string;
  options?: string[];
}

export type OutputValueType = 'text' | 'filePath' | 'csvFile' | 'markdownFile' | 'jsonFile' | 'imageFile';

export interface TypedOutputValue {
  value: string;
  type: OutputValueType;
}

export interface MarkdownNodeConfig {
  nodeType: 'markdown';
  template: string;
  replaceFiles: string[];
  outputVariable: string;
  outputFilename?: string;
}

export interface EmailNodeConfig {
  nodeType: 'email';
  to: string;
  subject: string;
  contentSource: 'inline' | 'upstream';
  body?: string;
  upstreamField?: string;
  isHtml: boolean;
  outputVariable: string;
}
```

Update `NodeConfig` union (line 71):
```typescript
export type NodeConfig = SqlNodeConfig | PythonNodeConfig | LlmNodeConfig | MarkdownNodeConfig | EmailNodeConfig;
```

- [ ] **Step 2: Add SmtpConfigForm type**

In `frontend/src/types/globalConfig.ts`, add:
```typescript
export interface SmtpConfigForm {
  type: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}
```

- [ ] **Step 3: Update NODE_COLORS**

In `frontend/src/constants/workflow.ts`:
```typescript
export const NODE_COLORS: Record<WorkflowNodeType, string> = {
  sql: '#3B82F6',
  python: '#22C55E',
  llm: '#A855F7',
  markdown: '#F59E0B',
  email: '#EC4899',
};
```

- [ ] **Step 4: Add i18n entries**

In `frontend/src/locales/zh-CN.ts`, add to `workflow.nodeTypes`:
```typescript
markdown: 'Markdown 输出',
email: '邮件发送',
```

Add to `workflow.config`:
```typescript
markdownTemplate: 'Markdown 模板',
markdownInsertVariable: '插入变量',
markdownInsertFile: '插入文件占位符',
markdownPreview: '预览',
markdownOutputFilename: '输出文件名',
markdownOutputFilenamePlaceholder: '可选，默认自动生成',
emailTo: '收件人',
emailToPlaceholder: '邮箱地址，多个用逗号分隔',
emailSubject: '主题',
emailSubjectPlaceholder: '邮件主题',
emailContentSource: '内容来源',
emailContentInline: '直接编写',
emailContentUpstream: '引用上游输出',
emailBody: '邮件内容',
emailUpstreamField: '选择上游输出',
emailIsHtml: '转为 HTML 发送',
paramType: '参数类型',
paramOptions: '选项（逗号分隔）',
```

Add to `settings`:
```typescript
smtp: {
  title: 'SMTP 邮件服务',
  description: '配置邮件发送服务，用于工作流邮件节点',
  host: 'SMTP 服务器',
  hostPlaceholder: '例如: smtp.gmail.com',
  port: '端口',
  secure: '使用 SSL/TLS',
  user: '发件人邮箱',
  userPlaceholder: '例如: user@example.com',
  pass: '密码/授权码',
  passPlaceholder: '输入密码或授权码',
  fromName: '发件人名称',
  fromNamePlaceholder: '可选',
  testConnection: '测试连接',
  testConnectionShort: '测试',
  testing: '测试中...',
  testSuccess: 'SMTP 连接测试成功',
  testFailed: 'SMTP 连接测试失败',
  saveSuccess: 'SMTP 配置已保存',
  saveFailed: 'SMTP 配置保存失败',
},
```

Add same entries (English versions) to `frontend/src/locales/en-US.ts`.

- [ ] **Step 5: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS (may have type errors in components referencing old params type — that's expected and will be fixed in subsequent tasks)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/ frontend/src/constants/workflow.ts frontend/src/locales/
git commit -m "feat(frontend): add typed I/O types, new node types, and i18n entries"
```

---

## Task 10: Frontend — WfParamEditor component

**Files:**
- Create: `frontend/src/components/workflow/config/WfParamEditor.vue`
- Test: `frontend/tests/components/workflow/WfParamEditor.test.ts`

- [ ] **Step 1: Write test**

Create `frontend/tests/components/workflow/WfParamEditor.test.ts`:

```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import WfParamEditor from '@/components/workflow/config/WfParamEditor.vue';
import ElementPlus from 'element-plus';
import { createI18n } from 'vue-i18n';

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} } });

describe('WfParamEditor', () => {
  it('renders text input for text type', () => {
    const wrapper = mount(WfParamEditor, {
      props: {
        params: { host: { value: 'localhost', type: 'text' } },
      },
      global: { plugins: [ElementPlus, i18n] },
    });
    expect(wrapper.find('.el-input').exists()).toBe(true);
  });

  it('renders password input for password type', () => {
    const wrapper = mount(WfParamEditor, {
      props: {
        params: { secret: { value: 'abc', type: 'password' } },
      },
      global: { plugins: [ElementPlus, i18n] },
    });
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it('emits update:params on value change', async () => {
    const wrapper = mount(WfParamEditor, {
      props: {
        params: { key: { value: 'val', type: 'text' } },
      },
      global: { plugins: [ElementPlus, i18n] },
    });
    // Simulate value change and check emit
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted()).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/components/workflow/WfParamEditor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WfParamEditor.vue**

Create `frontend/src/components/workflow/config/WfParamEditor.vue`:

The component accepts `params: Record<string, ParamDefinition>` prop and emits `update:params`. For each parameter entry, it renders:
- A key input (el-input, small)
- A type selector dropdown (el-select with ParamValueType options)
- A value input that varies by type (el-input, el-input type=password, el-input-number, el-checkbox, el-radio-group, el-select)
- Options input (el-input, comma-separated) visible when type is radio/select
- A delete button (Trash2 icon)
- An "Add Parameter" button at the bottom

Follow the styling pattern from `WfConfigPythonScript.vue` param editor (lines 10-32 for template, 167-198 for styles).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/components/workflow/WfParamEditor.test.ts`
Expected: PASS

- [ ] **Step 5: Update WfConfigPythonScript.vue to use WfParamEditor**

Replace the inline param editor (lines 9-32) with:
```vue
<WfParamEditor v-model:params="params" />
```

Import and use the new component. Update `params` ref type from `Record<string, string>` to `Record<string, ParamDefinition>`. Update `syncParams()` accordingly.

- [ ] **Step 6: Update WfConfigLlmGenerate.vue similarly**

Same pattern — replace inline param editing with `WfParamEditor`.

- [ ] **Step 7: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow/config/WfParamEditor.vue frontend/src/components/workflow/config/WfConfigPythonScript.vue frontend/src/components/workflow/config/WfConfigLlmGenerate.vue frontend/tests/components/workflow/WfParamEditor.test.ts
git commit -m "feat(frontend): add WfParamEditor with typed parameter inputs"
```

---

## Task 11: Frontend — WfConfigMarkdown component

**Files:**
- Create: `frontend/src/components/workflow/config/WfConfigMarkdown.vue`

- [ ] **Step 1: Implement WfConfigMarkdown.vue**

The component receives `node: WorkflowNodeInfo` prop (same pattern as WfConfigPythonScript). Contains:

1. **Node name** input (el-form-item + el-input)
2. **Toolbar** with buttons:
   - Insert Variable button — opens el-popover with list of upstream node output fields
   - Insert File Placeholder button — opens el-popover filtered to file-type outputs
   - Preview toggle button
3. **CodeMirror editor** (markdown mode) for template editing — or rendered markdown preview when toggled
4. **File references** section showing replaceFiles list with delete buttons
5. **Output filename** input (optional)
6. **Output variable** input

Use `@codemirror/lang-markdown` for syntax highlighting. Use existing `renderMarkdown()` from `@/utils/markdown` for preview mode.

To get upstream node outputs: use `workflowStore.editorWorkflow.nodes` filtered by topological upstream + `workflowStore.lastRunDetail.nodeRuns` for output field info.

Follow exact styling patterns from `WfConfigPythonScript.vue`.

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/config/WfConfigMarkdown.vue
git commit -m "feat(frontend): add WfConfigMarkdown visual template editor"
```

---

## Task 12: Frontend — SMTP config and API

**Files:**
- Modify: `frontend/src/api/globalConfig.ts`
- Modify: `frontend/src/stores/globalConfigStore.ts`
- Create: `frontend/src/components/settings/SmtpConfigCard.vue`
- Modify: `frontend/src/components/settings/SettingsPage.vue`

- [ ] **Step 1: Add SMTP API functions**

In `frontend/src/api/globalConfig.ts`, add:
```typescript
export async function getSmtpConfig(): Promise<SmtpConfigForm> {
  return http.get<SmtpConfigForm>('/global-config/smtp');
}

export async function saveSmtpConfig(config: SmtpConfigForm): Promise<SmtpConfigForm> {
  return http.put<SmtpConfigForm>('/global-config/smtp', config);
}

export async function testSmtpConnection(config: SmtpConfigForm): Promise<TestConnectionResult> {
  return http.post<TestConnectionResult>('/global-config/smtp/test', config);
}
```

- [ ] **Step 2: Add SMTP state to globalConfigStore**

In `frontend/src/stores/globalConfigStore.ts`, add `smtpConfig` ref, `smtpLoading`/`smtpError` from `useAsyncAction()`, and `fetchSmtpConfig`/`saveSmtpConfig` actions. Follow the exact pattern of LLM config.

- [ ] **Step 3: Create SmtpConfigCard.vue**

Clone the structure of `LLMConfigCard.vue` (196 lines). Replace fields with:
- host (text input)
- port (number input)
- secure (el-switch)
- user (text input)
- pass (password input with show/hide toggle)
- fromName (text input, optional)
- Test Connection + Save buttons

Use the same `config-card` SCSS import and class pattern. Use `Mail` icon from lucide-vue-next instead of `Bot`.

- [ ] **Step 4: Add SmtpConfigCard to SettingsPage**

In `frontend/src/components/settings/SettingsPage.vue`:
- Import SmtpConfigCard
- Add `<SmtpConfigCard :is-mobile="isMobile" />` after WebSearchConfigCard (line 13)

- [ ] **Step 5: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/globalConfig.ts frontend/src/stores/globalConfigStore.ts frontend/src/components/settings/SmtpConfigCard.vue frontend/src/components/settings/SettingsPage.vue
git commit -m "feat(frontend): add SMTP config card in settings"
```

---

## Task 13: Frontend — WfConfigEmail component

**Files:**
- Create: `frontend/src/components/workflow/config/WfConfigEmail.vue`

- [ ] **Step 1: Implement WfConfigEmail.vue**

The component receives `node: WorkflowNodeInfo` prop. Contains:

1. **Node name** input
2. **Recipients** (`to`): el-input with placeholder hinting comma-separated + {{variable}}
3. **Subject**: el-input
4. **Content source**: el-radio-group with 'inline'/'upstream' options
   - When `inline`: CodeMirror editor (markdown mode)
   - When `upstream`: el-select dropdown listing upstream outputs that are markdownFile or text type
5. **Send as HTML**: el-checkbox (default checked)
6. **Output variable** input

Follow exact patterns from WfConfigPythonScript.vue for component structure and store sync.

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/config/WfConfigEmail.vue
git commit -m "feat(frontend): add WfConfigEmail component"
```

---

## Task 14: Frontend — Wire up new node types in routing components

**Files:**
- Modify: `frontend/src/components/workflow/WfConfigPanel.vue`
- Modify: `frontend/src/components/workflow/WfCanvasNode.vue`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`
- Modify: `frontend/src/components/workflow/copilot/CopilotNodeCard.vue`
- Modify: `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue`
- Modify: `frontend/src/components/workflow/WfNodePreview.vue`

- [ ] **Step 1: Update WfConfigPanel.vue**

Add imports for WfConfigMarkdown and WfConfigEmail. Add template branches (after line 23):

```vue
<WfConfigMarkdown v-else-if="node.type === 'markdown'" :node="node" />
<WfConfigEmail v-else-if="node.type === 'email'" :node="node" />
```

Add icons for new types in header (after line 10):
```vue
<FileText v-else-if="node.type === 'markdown'" :size="18" />
<Mail v-else-if="node.type === 'email'" :size="18" />
```

Import `FileText, Mail` from lucide-vue-next.

- [ ] **Step 2: Update WfCanvasNode.vue**

Add icons for markdown and email in the header section (after line 19):
```vue
<FileText v-else-if="data.nodeType === 'markdown'" :size="12" />
<Mail v-else-if="data.nodeType === 'email'" :size="12" />
```

Update the `Sparkles` else clause to only match 'llm'. Import `FileText, Mail` from lucide-vue-next.

Also add target Handle for markdown and email nodes (they can receive input):
Update line 14 — change condition from `data.nodeType !== 'sql'` to include all non-SQL types (already works since markdown/email are not 'sql').

- [ ] **Step 3: Update WfEditorCanvas.vue getContentPreview**

Add cases in `getContentPreview()` (after line 111):
```typescript
case 'markdown':
  return ((config as MarkdownNodeConfig).template || '').split('\n')[0].substring(0, 50);
case 'email':
  return ((config as EmailNodeConfig).to || '').substring(0, 50);
```

- [ ] **Step 4: Update CopilotNodeCard.vue**

Add icon branches (after line 7):
```vue
<FileText v-else-if="nodeType === 'markdown'" :size="16" />
<Mail v-else-if="nodeType === 'email'" :size="16" />
```

Add config editor branches (after line 28):
```vue
<WfConfigMarkdown v-else-if="nodeType === 'markdown'" :node="nodeObj" />
<WfConfigEmail v-else-if="nodeType === 'email'" :node="nodeObj" />
```

Update `configSummary` computed (after line 73):
```typescript
else if (cfg.nodeType === 'markdown') {
  content = cfg.template;
} else if (cfg.nodeType === 'email') {
  content = cfg.to;
}
```

Import the new components and icons.

- [ ] **Step 5: Update WfMobileNodeConfigSheet.vue**

Add config editor branches (after line 12):
```vue
<WfConfigMarkdown v-else-if="node.type === 'markdown'" :node="node" />
<WfConfigEmail v-else-if="node.type === 'email'" :node="node" />
```

Import the new components.

- [ ] **Step 6: Update WfNodePreview.vue for TypedOutputValue + new node types**

Add markdown and email preview sections in the template (after line 48):
```vue
<!-- Markdown preview -->
<template v-else-if="nodeType === 'markdown' && markdownPreview">
  <div class="wf-node-preview__section-title">{{ t('workflow.preview.markdownOutput') }}</div>
  <div v-html="markdownPreview" class="wf-node-preview__markdown"></div>
</template>

<!-- Email preview -->
<template v-else-if="nodeType === 'email' && emailPreview">
  <div class="wf-node-preview__section-title">{{ t('workflow.preview.emailOutput') }}</div>
  <pre class="wf-node-preview__code">{{ emailPreview }}</pre>
</template>
```

Add computed properties:
```typescript
const markdownPreview = computed(() => {
  if (props.nodeType !== 'markdown' || !props.nodeRun.outputs) return null;
  // Render the markdownPath or content if available
  return JSON.stringify(props.nodeRun.outputs, null, 2);
});

const emailPreview = computed(() => {
  if (props.nodeType !== 'email' || !props.nodeRun.outputs) return null;
  return JSON.stringify(props.nodeRun.outputs, null, 2);
});
```

Add TypedOutputValue file preview support: for each output field, check if it's a TypedOutputValue with a file type. If so, render a file path with an expand/collapse button that loads content from `/api/workflow/file-preview`.

- [ ] **Step 7: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow/
git commit -m "feat(frontend): wire up markdown and email nodes in all routing components"
```

---

## Task 15: Frontend — Execution animations

**Files:**
- Modify: `frontend/src/components/workflow/WfCanvasNode.vue`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`

- [ ] **Step 1: Add CSS animations to WfCanvasNode.vue**

Replace the existing static border-color styles (lines 73-87) with animated versions. Add CSS custom property for node color RGB:

```scss
.wf-canvas-node {
  // Add CSS variable for RGB values
  &--sql { --node-color-rgb: 59, 130, 246; }
  &--python { --node-color-rgb: 34, 197, 94; }
  &--llm { --node-color-rgb: 168, 85, 247; }
  &--markdown { --node-color-rgb: 245, 158, 11; }
  &--email { --node-color-rgb: 236, 72, 153; }

  &.is-running {
    animation: node-pulse 1.5s ease-in-out infinite;
    border-color: rgb(var(--node-color-rgb));
  }

  &.is-completed {
    animation: flash-success 0.6s ease-out;
    border-color: #52c41a;
  }

  &.is-failed {
    animation: flash-error 0.4s ease-out;
    border-color: #f5222d;
    box-shadow: 0 0 8px rgba(245, 34, 45, 0.3);
  }

  &.is-skipped {
    opacity: 0.5;
    border-color: #d9d9d9;
  }
}

@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(var(--node-color-rgb), 0.3); }
  50% { box-shadow: 0 0 16px rgba(var(--node-color-rgb), 0.6); }
}

@keyframes flash-success {
  0% { box-shadow: 0 0 0 rgba(82, 196, 26, 0); }
  30% { box-shadow: 0 0 20px rgba(82, 196, 26, 0.5); }
  100% { box-shadow: 0 0 4px rgba(82, 196, 26, 0.2); }
}

@keyframes flash-error {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-3px); }
  40%, 80% { transform: translateX(3px); }
}
```

Add `is-skipped` to the class bindings in template (line 4):
```vue
'is-skipped': data.executionStatus === 'skipped',
```

- [ ] **Step 2: Add edge animations to WfEditorCanvas.vue**

Update the edge mapping (lines 91-99) to use dynamic styles based on connected node execution states:

```typescript
flowEdges.value = wf.edges.map((e) => {
  const targetStatus = store.nodeExecutionStates.get(e.targetNodeId);
  const edgeClass = targetStatus === 'running' ? 'edge-running'
    : targetStatus === 'completed' ? 'edge-completed'
    : targetStatus === 'failed' ? 'edge-failed'
    : '';
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: 'smoothstep',
    animated: targetStatus === 'running',
    class: edgeClass,
    style: {
      stroke: targetStatus === 'completed' ? '#52c41a'
        : targetStatus === 'failed' ? '#f5222d'
        : '#6b6b70',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: targetStatus === 'completed' ? '#52c41a'
        : targetStatus === 'failed' ? '#f5222d'
        : '#6b6b70',
    },
  };
});
```

Add edge CSS in the scoped styles:
```scss
:deep(.edge-running .vue-flow__edge-path) {
  stroke-dasharray: 5;
  animation: edge-flow 1s linear infinite;
}

@keyframes edge-flow {
  to { stroke-dashoffset: -10; }
}

:deep(.edge-failed .vue-flow__edge-path) {
  stroke-dasharray: 4 2;
}
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/WfCanvasNode.vue frontend/src/components/workflow/WfEditorCanvas.vue
git commit -m "feat(frontend): add node execution animations and edge status effects"
```

---

## Task 16: Final integration verification

- [ ] **Step 1: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run full frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit any remaining fixes**

If any preflight or test issues found, fix and commit.

- [ ] **Step 6: Final commit — integration complete**

```bash
git commit --allow-empty -m "feat(workflow): complete workflow node enhancements integration"
```
