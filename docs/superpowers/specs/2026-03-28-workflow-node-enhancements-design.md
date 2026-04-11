# Workflow Node Enhancements Design

## Overview

A set of improvements to the databot workflow system covering: typed I/O for node inputs and outputs, Copilot intelligence enhancement, two new node types (Markdown output and Email), and execution status animations on the canvas.

## Scope

| # | Feature | Status |
|---|---------|--------|
| 0 | Copilot references data dictionaries and knowledge base before building nodes | In scope |
| 1 | Node output to files for large content | **Out of scope** (keep as-is) |
| 2a | Typed input parameters with UI components (text/password/number/checkbox/radio/select) for Python and LLM nodes | In scope |
| 2b | Typed output values with file path marking and inline content preview | In scope |
| 3 | Markdown output node with visual template editor | In scope |
| 4 | Email sending node with global SMTP config catalog | In scope |
| 5 | Node execution dynamic animations on canvas | In scope |

## Architecture Decision: Typed I/O System (Approach B)

All features are built on a unified typed I/O system rather than ad-hoc per-feature implementations. This provides:
- Consistent parameter UI rendering across node types
- Type-aware file path marking and preview in outputs
- Smart field matching between upstream outputs and downstream inputs (e.g., email node can filter for `markdownFile` outputs)

---

## Part 1: Typed I/O System

### 1.1 Core Type Definitions

Shared between backend (`backend/src/workflow/workflow.types.ts`) and frontend (`frontend/src/types/workflow.ts`).

```typescript
// --- Input Parameter Types ---

type ParamValueType = 'text' | 'password' | 'number' | 'checkbox' | 'radio' | 'select';

interface ParamDefinition {
  value: string | number | boolean;
  type: ParamValueType;
  label?: string;           // Display name for the parameter
  options?: string[];        // Option list for radio/select types
}

// --- Output Value Types ---

type OutputValueType = 'text' | 'filePath' | 'csvFile' | 'markdownFile' | 'jsonFile' | 'imageFile';

interface TypedOutputValue {
  value: string;
  type: OutputValueType;
}

type OutputFieldValue = string | number | boolean | TypedOutputValue;
```

### 1.2 Node Config Changes

**Python node** — `params` type changes from `Record<string, string>` to `Record<string, ParamDefinition>`:

```typescript
interface PythonNodeConfig {
  nodeType: 'python';
  params: Record<string, ParamDefinition>;
  // e.g. { "db_host": { value: "localhost", type: "text" },
  //        "db_pass": { value: "***", type: "password" },
  //        "verbose": { value: true, type: "checkbox" } }
  script: string;
  timeout?: number;
  outputVariable: string;
}
```

**LLM node** — same change:

```typescript
interface LlmNodeConfig {
  nodeType: 'llm';
  params: Record<string, ParamDefinition>;
  prompt: string;
  outputVariable: string;
}
```

**SQL node** — unchanged (no custom parameters).

### 1.3 Output Type Annotation

The execution engine automatically wraps known output fields with `TypedOutputValue` when storing `WorkflowNodeRun.outputs`:

| Node Type | Field | Auto-tagged Type |
|-----------|-------|-----------------|
| SQL | `csvPath` | `csvFile` |
| Python | `csvPath` (if present) | `csvFile` |
| Markdown | `markdownPath` | `markdownFile` |

Other fields remain as plain values.

### 1.4 Template Variable Resolution

Existing `{{node.field}}` syntax unchanged. When the referenced value is a `TypedOutputValue`, the engine extracts `.value` automatically. An optional `{{node.field.__type}}` accessor is available for advanced scenarios (e.g., email node checking if content is markdown).

### 1.4.1 templateResolver Integration

The existing `resolveParamsTemplates()` function in `templateResolver.ts` expects `Record<string, string>`. With the new `Record<string, ParamDefinition>` format, this function must be updated to:

1. Extract `.value` from each `ParamDefinition` before template resolution
2. Resolve templates on the extracted string value
3. Return the resolved value back into the `ParamDefinition` structure

This ensures backward compatibility — the template resolution logic itself remains unchanged, only the param extraction/wrapping layer is added.

### 1.5 Frontend: Parameter Editor Component

New component `WfParamEditor.vue` renders input controls based on `ParamDefinition.type`:

| type | Element Plus Component |
|------|----------------------|
| `text` | `el-input` |
| `password` | `el-input type="password" show-password` |
| `number` | `el-input-number` |
| `checkbox` | `el-checkbox` |
| `radio` | `el-radio-group` with `options` |
| `select` | `el-select` with `options` |

When adding a parameter in the Python/LLM config panel, the user selects the parameter type from a dropdown and optionally provides options (for radio/select).

### 1.6 Frontend: Output Value Display

In `WfNodePreview.vue`, output field rendering logic:

- **Plain values** (string/number/boolean): displayed as-is (current behavior)
- **TypedOutputValue** with file type: display file path text + an expand/collapse icon button beside it
  - Click to expand: loads file content inline below the path
  - `csvFile`: renders as HTML table (reuse existing SQL preview logic)
  - `markdownFile`: renders via existing `markdown.ts` utility
  - `imageFile`: `<img>` tag
  - `jsonFile` / `filePath`: code block display

File content is fetched on-demand via a new API endpoint `GET /api/workflow/file-preview?path=<encodedPath>` (restricted to work folder).

### 1.7 Migration

Existing workflows with `params: Record<string, string>` need migration. Strategy:
- Backend reads params and auto-wraps: if a value is a plain string, treat as `{ value: str, type: 'text' }`.
- This normalization happens at read time in the service layer, no DB migration needed.
- Frontend config components handle both formats gracefully during transition.

---

## Part 2: Copilot Enhancement

### 2.1 System Prompt Update

Add the following instruction block to `copilotPrompt.ts`:

```
## 工作流构建规范

在创建或修改节点配置之前，你必须：
1. 使用 scoped_glob 浏览数据字典目录，了解可用的表和数据结构
2. 使用 scoped_read_file 阅读与当前任务相关的数据字典文件
3. 使用 scoped_glob/scoped_read_file 检查知识库中是否有与任务相关的参考资料
4. 基于获取的信息构建准确的节点配置（正确的表名、字段名、数据类型等）

不要凭记忆或猜测构建 SQL 查询或数据处理逻辑，始终以数据字典为准。
```

### 2.2 No Tool Changes Required

The existing `scoped_glob`, `scoped_grep`, and `scoped_read_file` tools already provide access to both `data_dictionary_folder` and `knowledge_folder`. The change is purely in the prompt to guide the Copilot to proactively use these tools before node creation.

---

## Part 3: Markdown Output Node

### 3.1 Node Type Registration

Add to `WorkflowNodeType`:

```typescript
export const WorkflowNodeType = {
  Sql: 'sql',
  Python: 'python',
  Llm: 'llm',
  Markdown: 'markdown',
};
```

### 3.2 Config Type

```typescript
interface MarkdownNodeConfig {
  nodeType: 'markdown';
  template: string;              // Markdown template with {{variable}} and file placeholders
  replaceFiles: string[];        // File paths to embed (can reference upstream output paths)
  outputVariable: string;
  outputFilename?: string;       // Optional output filename (auto-generated if omitted)
}
```

### 3.3 Output Type

```typescript
interface MarkdownNodeOutput {
  markdownPath: string;          // Auto-tagged as TypedOutputValue { type: 'markdownFile' }
  contentLength: number;
}
```

### 3.4 Execution Logic

1. Resolve `{{variable}}` template references using upstream node outputs
2. Process file placeholders `<!-- {path} -->` using shared `markdownProcessor` utility:
   - CSV → markdown table
   - JSON → validated Plotly code block
   - Image → base64 data URI
3. Write output to `workFolder/YYYY-MM-DD/<outputFilename or auto>.md`
4. Return `{ markdownPath, contentLength }`

### 3.5 Shared markdownProcessor Utility

Extract the file processing logic from `outputMdTool.ts` into a shared utility `backend/src/utils/markdownProcessor.ts`. Both `outputMdTool` and the markdown node executor call this utility. Functions:

- `processFilePlaceholders(content: string, files: string[]): string`
- `csvToMarkdownTable(csvContent: string): string`
- `validatePlotlyJson(json: string): boolean`
- `imageToBase64DataUri(filePath: string): string`

### 3.6 Frontend: Visual Template Editor

New component `WfConfigMarkdown.vue`:

**Editor area:**
- CodeMirror with markdown syntax highlighting
- Toolbar buttons:
  - **Insert Variable** `{{ }}`: dropdown listing all upstream node output fields with type labels, inserts `{{nodeName.field}}`
  - **Insert File Placeholder** `<!-- {} -->`: dropdown listing upstream outputs with file types (`filePath`/`csvFile`/`jsonFile`/`imageFile`), inserts `<!-- {{{nodeName.csvPath}}} -->` and auto-adds to `replaceFiles`
  - **Preview**: toggles to rendered markdown preview view (using existing `markdown.ts`)

**File references area:**
- Displays current `replaceFiles` list with source variable and file type icon
- Manual add/delete

**Output config:**
- Output variable name input
- Optional output filename input

### 3.7 Canvas Appearance

- Color: `#F59E0B` (amber)
- Icon: Document icon
- Content preview: first 50 characters of template

### 3.8 Copilot Tool Update

Add markdown node support to `wf_add_node` and `wf_update_node` tools. Update the copilot system prompt with markdown node config schema and usage guidance.

---

## Part 4: Email Sending Node + Global SMTP Config

### 4.1 Global SMTP Configuration Catalog

**Config type:**

```typescript
interface SmtpConfig {
  type: 'smtp';
  host: string;           // SMTP server address
  port: number;           // Port (default: 465)
  secure: boolean;        // Use SSL/TLS (default: true)
  user: string;           // Sender email/account
  pass: string;           // Password or auth code (encrypted storage)
  fromName?: string;      // Sender display name (optional)
}
```

**Backend routes** (in `globalConfig` module):

- `GET /api/globalConfig/smtp` — fetch config (pass masked)
- `PUT /api/globalConfig/smtp` — save config (pass encrypted)
- `POST /api/globalConfig/smtp/test` — test connection (send test email to self)

Reuses existing `globalConfig.service.ts` encryption and masking logic.

**Frontend** — new `SmtpConfigCard.vue` in Settings page alongside LLM and WebSearch cards:

- host + port inputs
- secure toggle switch
- user input
- pass password input with show-password toggle
- fromName optional input
- Test Connection button + Save button

**Frontend store** — extend `globalConfigStore.ts` with `fetchSmtpConfig()` and `saveSmtpConfig()`.

### 4.2 Email Node Type

Add to `WorkflowNodeType`:

```typescript
export const WorkflowNodeType = {
  Sql: 'sql',
  Python: 'python',
  Llm: 'llm',
  Markdown: 'markdown',
  Email: 'email',
};
```

### 4.3 Config Type

```typescript
interface EmailNodeConfig {
  nodeType: 'email';
  to: string;                    // Recipients (comma-separated, supports {{variable}})
  subject: string;               // Subject line (supports {{variable}})
  contentSource: 'inline' | 'upstream';
  body?: string;                 // For inline: direct content with {{variable}} support
  upstreamField?: string;        // For upstream: reference like {{markdown_node.markdownPath}}
  isHtml: boolean;               // Convert markdown to HTML for sending (default: true)
  outputVariable: string;
}
```

### 4.4 Output Type

```typescript
interface EmailNodeOutput {
  success: boolean;
  messageId: string;
  recipients: string[];
}
```

### 4.5 Execution Logic

1. Load global SMTP config; error if not configured
2. Resolve template variables in `to`, `subject`, `body`
3. Get email content:
   - `inline`: use `body` field directly
   - `upstream`: read file content from the referenced upstream field (typically a `markdownFile`)
4. If `isHtml` is true: convert markdown → HTML using `marked`, wrap in base email styling
5. Send via `nodemailer` using global SMTP transporter
6. Return `{ success, messageId, recipients }`

**New dependency:** `nodemailer` + `@types/nodemailer` in backend `package.json`.

### 4.6 Frontend: Config Component

New `WfConfigEmail.vue`:

- **Recipients** (`to`): `el-input`, placeholder hints comma separation and `{{variable}}` support
- **Subject**: `el-input` with `{{variable}}` support
- **Content source**: `el-radio-group` ("直接编写" / "引用上游输出")
  - Inline: CodeMirror markdown editor
  - Upstream: dropdown select listing upstream outputs with `markdownFile` or `text` type
- **Send as HTML**: `el-checkbox` (default checked)
- **Output variable name**

### 4.7 Canvas Appearance

- Color: `#EC4899` (pink)
- Icon: Message icon
- Content preview: first 50 characters of recipient address

### 4.8 Copilot Tool Update

Add email node support to `wf_add_node` and `wf_update_node`. Update copilot prompt with email node config schema.

---

## Part 5: Node Execution Dynamic Animations

### 5.1 Status-to-Visual Mapping

Applied to `WfCanvasNode.vue` via CSS class bindings based on `executionStatus`:

| Status | Visual Effect | Implementation |
|--------|--------------|----------------|
| `pending` | Default appearance | No extra class |
| `running` | Breathing glow + pulsing border | `box-shadow` pulse animation using node theme color, 1.5s infinite |
| `completed` | Brief green flash → static green border | `flash-success` animation (0.6s ease-out) |
| `failed` | Red shake → persistent red border + shadow | `flash-error` shake animation (0.4s) + red box-shadow |
| `skipped` | Grayed out, semi-transparent | `opacity: 0.5`, gray border |

### 5.2 CSS Animations

```css
/* Running: breathing pulse */
@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(var(--node-color-rgb), 0.3); }
  50% { box-shadow: 0 0 16px rgba(var(--node-color-rgb), 0.6); }
}
.wf-canvas-node.is-running {
  animation: node-pulse 1.5s ease-in-out infinite;
  border-color: var(--node-color);
}

/* Completed: green flash */
@keyframes flash-success {
  0% { box-shadow: 0 0 0 rgba(82, 196, 26, 0); }
  30% { box-shadow: 0 0 20px rgba(82, 196, 26, 0.5); }
  100% { box-shadow: 0 0 4px rgba(82, 196, 26, 0.2); }
}
.wf-canvas-node.is-completed {
  animation: flash-success 0.6s ease-out;
  border-color: #52c41a;
}

/* Failed: red shake */
@keyframes flash-error {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-3px); }
  40%, 80% { transform: translateX(3px); }
}
.wf-canvas-node.is-failed {
  animation: flash-error 0.4s ease-out;
  border-color: #f5222d;
  box-shadow: 0 0 8px rgba(245, 34, 45, 0.3);
}

/* Skipped: grayed out */
.wf-canvas-node.is-skipped {
  opacity: 0.5;
  border-color: #d9d9d9;
}
```

### 5.3 Edge Animations

Edges between nodes also reflect execution state:

- **Running node incoming edge**: `stroke-dasharray` + animated `stroke-dashoffset` for a "flowing" effect
- **Completed node edge**: solid line + green stroke
- **Failed node edge**: dashed line + red stroke

Implemented via dynamic edge class bindings in `WfEditorCanvas.vue` based on source/target node execution states.

### 5.4 No Additional JS Required

The existing WebSocket event flow → `workflowStore.handleExecutionEvent()` → `nodeExecutionStates` Map → reactive class bindings in `WfCanvasNode.vue` already provides the data pipeline. The animations are purely CSS-driven.

---

## Files to Create or Modify

### Backend — New Files
- `backend/src/utils/markdownProcessor.ts` — shared markdown file processing utility
- `backend/src/workflow/nodeExecutors/markdownExecutor.ts` — markdown node execution logic
- `backend/src/workflow/nodeExecutors/emailExecutor.ts` — email node execution logic

### Backend — Modified Files
- `backend/src/workflow/workflow.types.ts` — add new types (ParamDefinition, TypedOutputValue, MarkdownNodeConfig, EmailNodeConfig, etc.)
- `backend/src/workflow/executionEngine.ts` — add markdown/email node execution, output type annotation
- `backend/src/workflow/nodeExecutors/index.ts` — register markdown and email executors in `getNodeExecutor()`
- `backend/src/workflow/templateResolver.ts` — update `resolveParamsTemplates()` to extract `.value` from `ParamDefinition` before resolving templates
- `backend/src/infrastructure/tools/outputMdTool.ts` — extract shared logic to markdownProcessor
- `backend/src/copilot/copilotPrompt.ts` — add data dictionary/knowledge base instruction and new node schemas
- `backend/src/copilot/copilotTools.ts` — update wf_add_node/wf_update_node for new node types
- `backend/src/globalConfig/globalConfig.controller.ts` — add SMTP validation and handlers (following existing pattern of inline validation)
- `backend/src/globalConfig/globalConfig.service.ts` — add SMTP config CRUD
- `backend/src/globalConfig/globalConfig.types.ts` — add SmtpConfig type and `'smtp'` to ConfigCategory
- `backend/src/globalConfig/globalConfig.routes.ts` — add SMTP routes (GET/PUT/POST test)
- `backend/src/workflow/workflow.routes.ts` — add `GET /api/workflow/file-preview` endpoint for on-demand file content loading
- `backend/src/workflow/workflow.controller.ts` — add file-preview handler (restricted to work folder)
- `backend/package.json` — add nodemailer and marked dependencies

### Frontend — New Files
- `frontend/src/components/workflow/config/WfConfigMarkdown.vue` — markdown node config editor
- `frontend/src/components/workflow/config/WfConfigEmail.vue` — email node config editor
- `frontend/src/components/workflow/config/WfParamEditor.vue` — generic typed parameter editor
- `frontend/src/components/settings/SmtpConfigCard.vue` — SMTP settings card

### Frontend — Modified Files
- `frontend/src/types/workflow.ts` — add new types mirroring backend
- `frontend/src/components/workflow/WfCanvasNode.vue` — execution animation CSS classes (use `.wf-canvas-node` selector)
- `frontend/src/components/workflow/WfEditorCanvas.vue` — edge animation class bindings
- `frontend/src/components/workflow/WfNodePreview.vue` — TypedOutputValue display with file preview
- `frontend/src/components/workflow/config/WfConfigPythonScript.vue` — use WfParamEditor
- `frontend/src/components/workflow/config/WfConfigLlmGenerate.vue` — use WfParamEditor
- `frontend/src/components/workflow/WfConfigPanel.vue` — add markdown/email node config routing
- `frontend/src/components/workflow/copilot/CopilotNodeCard.vue` — support new node types
- `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue` — support new node types
- `frontend/src/components/settings/SettingsPage.vue` — add SMTP config card
- `frontend/src/stores/workflowStore.ts` — handle new node types
- `frontend/src/stores/globalConfigStore.ts` — add SMTP config state/actions
- `frontend/src/constants/workflow.ts` — add markdown/email node colors and icons
- `frontend/src/locales/zh-CN.ts` — add i18n entries for all new UI text
- `frontend/src/locales/en-US.ts` — add i18n entries for all new UI text

---

## Testing Strategy

### Backend Tests
- `markdownProcessor.ts` — unit tests for CSV/Plotly/image processing
- `markdownExecutor.ts` — template resolution, file placeholder processing, output file generation
- `emailExecutor.ts` — template resolution, SMTP send (mocked nodemailer), error handling for missing config
- `globalConfig` SMTP — validation, encryption/decryption, test connection
- Execution engine — output type annotation, new node type routing
- Param normalization — migration from `Record<string, string>` to `Record<string, ParamDefinition>`

### Frontend Tests
- `WfParamEditor.vue` — renders correct component for each ParamValueType
- `WfConfigMarkdown.vue` — template editing, variable insertion, file placeholder management
- `WfConfigEmail.vue` — content source switching, upstream field selection
- `SmtpConfigCard.vue` — form validation, save/test actions
- `WfNodePreview.vue` — TypedOutputValue detection, file preview expand/collapse
- `WfCanvasNode.vue` — CSS class application based on execution status

---

## Dependencies

- `nodemailer` (backend) — SMTP email sending
- `@types/nodemailer` (backend, devDependency) — TypeScript types
- `marked` (backend) — markdown-to-HTML conversion for email node (already used in frontend)
- No new frontend dependencies (all UI components from Element Plus, markdown rendering from existing `marked`)
