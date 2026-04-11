# Custom Node Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add import/export/new-node buttons to the custom node list tab, add a create mode with node type palette to the editor, and add a save dialog with name/description input.

**Architecture:** All changes are frontend-only. Import/export uses frontend-side ZIP (JSZip) matching the existing workflow pattern. The editor gets a dual mode (create/edit) with a left-side node palette for create mode. Save triggers a dialog for name/description input.

**Tech Stack:** Vue 3, TypeScript, Element Plus, JSZip, Vue Flow

**Spec:** `docs/superpowers/specs/2026-04-02-custom-node-enhancements-design.md`

---

## File Map

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/components/workflow/WfCustomNodeList.vue` | Add import/export/new buttons, selection checkboxes, import result dialog |
| `frontend/src/components/workflow/WfCustomNodeEditor.vue` | Optional templateId, node type palette for create mode, save dialog |
| `frontend/src/components/workflow/WfListView.vue:205-207` | Forward `create` event from WfCustomNodeList |
| `frontend/src/components/workflow/WorkflowPage.vue:375-383` | Add `handleCreateTemplate`, wire create event |
| `frontend/src/stores/workflowStore.ts` | Add `batchExportTemplates()`, `importTemplates()` |
| `frontend/src/locales/en-US.ts:513-529` | Add new i18n keys |
| `frontend/src/locales/zh-CN.ts` (matching section) | Add new i18n keys |

---

## Task 1: i18n Keys

**Files:**
- Modify: `frontend/src/locales/en-US.ts:513-529`
- Modify: `frontend/src/locales/zh-CN.ts` (matching section)

- [ ] **Step 1: Add English keys**

In `frontend/src/locales/en-US.ts`, inside the `customNode` object (after `connectionLost` line 528, before the closing `}`), add:

```typescript
importNodes: 'Import Nodes',
exportSelected: 'Export Selected',
newNode: 'New Node',
importSuccess: 'Import successful',
noValidTemplates: 'No valid templates found in file',
saveDialogTitle: 'Save Node Template',
nameRequired: 'Name is required',
nodePalette: 'Select Node Type',
nodeAdded: 'Node added. Configure and save.',
copilotUnavailable: 'Save the node first to use Copilot',
```

- [ ] **Step 2: Add Chinese keys**

Same structure in `frontend/src/locales/zh-CN.ts`:

```typescript
importNodes: '导入节点',
exportSelected: '导出所选',
newNode: '新建节点',
importSuccess: '导入成功',
noValidTemplates: '文件中没有有效的模板',
saveDialogTitle: '保存节点模板',
nameRequired: '名称不能为空',
nodePalette: '选择节点类型',
nodeAdded: '节点已添加，请配置后保存。',
copilotUnavailable: '请先保存节点后使用 Copilot',
```

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/en-US.ts frontend/src/locales/zh-CN.ts
git commit -m "feat(custom-node): add i18n keys for enhancements"
```

---

## Task 2: Store — Import/Export Methods

**Files:**
- Modify: `frontend/src/stores/workflowStore.ts`

- [ ] **Step 1: Add batchExportTemplates method**

In `frontend/src/stores/workflowStore.ts`, after the `updateTemplate` method (~line 635), add:

```typescript
async function batchExportTemplates(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const results = await Promise.all(
    ids.map(async (id) => {
      const tpl = customTemplates.value.find((t) => t.id === id);
      return {
        name: tpl?.name ?? 'template',
        data: {
          name: tpl?.name ?? '',
          description: tpl?.description ?? '',
          type: tpl?.type ?? '',
          config: tpl?.config ?? {},
        },
      };
    })
  );

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
  a.download = 'custom-nodes-export.zip';
  a.click();
  URL.revokeObjectURL(url);
}
```

Note: `JSZip` and `sanitizeFilename` are already imported at the top of this file (used by workflow export).

- [ ] **Step 2: Add importTemplates method**

After `batchExportTemplates`, add:

```typescript
async function importTemplates(file: File): Promise<ImportResultItem[]> {
  const importResults: ImportResultItem[] = [];
  const templatesToImport: { name: string; data: { name: string; description?: string; type: string; config: NodeConfig } }[] = [];

  if (file.name.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.name === 'string' && typeof parsed.type === 'string' && parsed.config) {
      templatesToImport.push({
        name: parsed.name,
        data: { name: parsed.name, description: parsed.description as string | undefined, type: parsed.type, config: parsed.config as NodeConfig },
      });
    }
  } else if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const jsonFiles = Object.keys(zip.files).filter(
      (f) => f.endsWith('.json') && !zip.files[f].dir
    );
    for (const jsonFile of jsonFiles) {
      const text = await zip.files[jsonFile].async('text');
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.name === 'string' && typeof parsed.type === 'string' && parsed.config) {
          templatesToImport.push({
            name: parsed.name,
            data: { name: parsed.name, description: parsed.description as string | undefined, type: parsed.type, config: parsed.config as NodeConfig },
          });
        }
      } catch {
        // Skip invalid JSON files
      }
    }
  }

  for (const tpl of templatesToImport) {
    try {
      const result = await workflowApi.createTemplate({
        name: tpl.data.name,
        description: tpl.data.description,
        type: tpl.data.type,
        config: tpl.data.config,
      });
      importResults.push({
        originalName: tpl.name,
        result: { id: result.id, name: result.name, renamed: result.name !== tpl.name },
      });
    } catch (err: unknown) {
      // On name conflict, try with suffix
      try {
        const retryName = `${tpl.data.name} (1)`;
        const result = await workflowApi.createTemplate({
          ...tpl.data,
          name: retryName,
        });
        importResults.push({
          originalName: tpl.name,
          result: { id: result.id, name: result.name, renamed: true },
        });
      } catch {
        importResults.push({
          originalName: tpl.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await fetchTemplates();
  return importResults;
}
```

- [ ] **Step 3: Add to return object**

Add `batchExportTemplates` and `importTemplates` to the return object in the custom templates section.

- [ ] **Step 4: Run preflight**

Run: `cd frontend && pnpm run preflight`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/workflowStore.ts
git commit -m "feat(custom-node): add batch export and import store methods"
```

---

## Task 3: WfCustomNodeList — Header Buttons + Selection

**Files:**
- Modify: `frontend/src/components/workflow/WfCustomNodeList.vue`

- [ ] **Step 1: Add `create` emit and selection state**

In the script section (~line 115), update emits and add state:

```typescript
const emit = defineEmits<{
  edit: [templateId: string];
  create: [];
}>();

const selectedIds = ref<string[]>([]);
const importFileInput = ref<HTMLInputElement>();
```

- [ ] **Step 2: Add header buttons**

Replace the header section (lines 3-12) with import/export/new buttons matching the workflow list pattern:

```html
<div class="wf-custom-node-list__header">
  <div class="wf-custom-node-list__header-left">
    <el-input
      v-model="searchQuery"
      :placeholder="t('workflow.customNode.search')"
      :prefix-icon="Search"
      clearable
      class="wf-custom-node-list__search"
    />
  </div>
  <div class="wf-custom-node-list__header-right">
    <el-tooltip :content="t('workflow.customNode.importNodes')" :disabled="!isMobile">
      <el-button :icon="Upload" @click="triggerImportFile">
        <template v-if="!isMobile">{{ t('workflow.customNode.importNodes') }}</template>
      </el-button>
    </el-tooltip>
    <input
      ref="importFileInput"
      type="file"
      accept=".json,.zip"
      style="display: none"
      @change="handleImportFileChange"
    />
    <el-tooltip :content="t('workflow.customNode.exportSelected')" :disabled="!isMobile">
      <el-button :icon="Download" :disabled="selectedIds.length === 0" @click="handleBatchExport">
        <template v-if="!isMobile">{{ t('workflow.customNode.exportSelected') }}</template>
      </el-button>
    </el-tooltip>
    <el-button type="primary" :icon="Plus" @click="emit('create')">
      <template v-if="!isMobile">{{ t('workflow.customNode.newNode') }}</template>
    </el-button>
  </div>
</div>
```

Add imports: `Upload`, `Download`, `Plus` from `@element-plus/icons-vue`.

- [ ] **Step 3: Add selection column to desktop table**

In the `el-table` (line 20), add `@selection-change="handleSelectionChange"` and a checkbox column:

```html
<el-table ... @selection-change="handleSelectionChange">
  <el-table-column type="selection" width="40" />
  <!-- existing columns -->
</el-table>
```

- [ ] **Step 4: Add checkbox to mobile cards**

In each mobile card (line 68), add a checkbox in the card header:

```html
<el-checkbox
  :model-value="selectedIds.includes(tpl.id)"
  @change="toggleMobileSelection(tpl.id)"
/>
```

- [ ] **Step 5: Add handler methods**

Add these methods in the script section:

```typescript
function handleSelectionChange(selection: CustomNodeTemplateInfo[]): void {
  selectedIds.value = selection.map((s) => s.id);
}

function toggleMobileSelection(id: string): void {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function triggerImportFile(): void {
  importFileInput.value?.click();
}

async function handleImportFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    const results = await store.importTemplates(file);
    // Show results — use ElMessage for simple feedback
    const successCount = results.filter((r) => r.result).length;
    const errorCount = results.filter((r) => r.error).length;
    if (errorCount === 0) {
      ElMessage.success(t('workflow.customNode.importSuccess'));
    } else {
      ElMessage.warning(`${successCount} imported, ${errorCount} failed`);
    }
  } catch {
    ElMessage.error(t('common.failed'));
  }
  target.value = ''; // Reset file input
}

async function handleBatchExport(): Promise<void> {
  try {
    await store.batchExportTemplates(selectedIds.value);
    ElMessage.success(t('common.success'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}
```

- [ ] **Step 6: Update header styles**

Add flex layout for the header to accommodate left (search) and right (buttons) areas. Match the workflow list header pattern:

```scss
&__header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-md 0;
}

&__header-left {
  flex: 1;
}

&__header-right {
  display: flex;
  gap: $spacing-xs;
}
```

- [ ] **Step 7: Run preflight**

Run: `cd frontend && pnpm run preflight`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow/WfCustomNodeList.vue
git commit -m "feat(custom-node): add import/export/new buttons and selection to list"
```

---

## Task 4: WfListView + WorkflowPage — Wire Create Event

**Files:**
- Modify: `frontend/src/components/workflow/WfListView.vue:205-207`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue:375-383`

- [ ] **Step 1: Forward create event in WfListView**

In `frontend/src/components/workflow/WfListView.vue`, update the custom nodes tab pane (line 205-207):

```html
<el-tab-pane :label="t('workflow.tabs.customNodes')" name="customNodes">
  <WfCustomNodeList @edit="handleEditTemplate" @create="handleCreateTemplate" />
</el-tab-pane>
```

Add the handler and emit:

```typescript
// Add to defineEmits (alongside existing editTemplate):
const emit = defineEmits<{
  // ... existing emits ...
  editTemplate: [templateId: string];
  createTemplate: [];
}>();

function handleCreateTemplate(): void {
  emit('createTemplate');
}
```

- [ ] **Step 2: Handle create event in WorkflowPage**

In `frontend/src/components/workflow/WorkflowPage.vue`, add after `handleEditTemplate` (line 378):

```typescript
function handleCreateTemplate(): void {
  store.enterCustomNodeEditor('');
  activeView.value = 'customNodeEditor';
}
```

Update `enterCustomNodeEditor` call — passing empty string signals create mode.

Wire the event on both desktop and mobile WfListView instances. Add `@create-template="handleCreateTemplate"` next to the existing `@edit-template`:

```html
<WfListView
  ...
  @edit-template="handleEditTemplate"
  @create-template="handleCreateTemplate"
/>
```

- [ ] **Step 3: Update WfCustomNodeEditor usage**

In both desktop and mobile template blocks, change the `template-id` binding to handle empty string:

```html
<WfCustomNodeEditor
  v-else-if="activeView === 'customNodeEditor'"
  :template-id="store.editingTemplateId || undefined"
  @back="handleExitCustomNodeEditor"
/>
```

- [ ] **Step 4: Update store enterCustomNodeEditor**

In `frontend/src/stores/workflowStore.ts`, update `enterCustomNodeEditor` to accept empty string for create mode:

```typescript
function enterCustomNodeEditor(templateId: string): void {
  editingTemplateId.value = templateId || null;
}
```

- [ ] **Step 5: Run preflight**

Run: `cd frontend && pnpm run preflight`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workflow/WfListView.vue frontend/src/components/workflow/WorkflowPage.vue frontend/src/stores/workflowStore.ts
git commit -m "feat(custom-node): wire create event through list view to page"
```

---

## Task 5: WfCustomNodeEditor — Create Mode + Palette + Save Dialog

This is the largest task. The editor needs to support create mode with a node type palette and a save dialog.

**Files:**
- Modify: `frontend/src/components/workflow/WfCustomNodeEditor.vue`

- [ ] **Step 1: Make templateId optional**

Change the props (currently required `templateId: string`):

```typescript
const props = defineProps<{
  templateId?: string;
}>();
```

Add computed for mode detection:

```typescript
const isCreateMode = computed(() => !props.templateId);
```

- [ ] **Step 2: Add node type palette template (create mode)**

In the desktop body section (after line 39), add a left-side palette that shows only in create mode:

```html
<!-- Node Type Palette (create mode only) -->
<div v-if="isCreateMode && !hasNode" class="wf-custom-node-editor__palette">
  <h4 class="wf-custom-node-editor__palette-title">{{ t('workflow.customNode.nodePalette') }}</h4>
  <div class="wf-custom-node-editor__palette-items">
    <button
      v-for="nodeType in availableNodeTypes"
      :key="nodeType.type"
      class="wf-custom-node-editor__palette-item"
      :disabled="nodeType.disabled"
      @click="addNodeToCanvas(nodeType.type)"
    >
      <span class="wf-custom-node-editor__palette-icon" :style="{ color: NODE_COLORS[nodeType.type] }">
        <component :is="nodeType.icon" :size="20" />
      </span>
      <span>{{ t(`workflow.nodeTypes.${nodeType.type}`) }}</span>
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add palette data and logic**

In the script section, add:

```typescript
import { Database, Code, Sparkles, Mail, Search as SearchIcon } from 'lucide-vue-next';

const hasNode = computed(() => flowNodes.value.length > 0);

const availableNodeTypes = computed(() => [
  { type: 'sql' as WorkflowNodeType, icon: Database, disabled: false },
  { type: 'python' as WorkflowNodeType, icon: Code, disabled: false },
  { type: 'llm' as WorkflowNodeType, icon: Sparkles, disabled: !configStatus.value?.llm },
  { type: 'email' as WorkflowNodeType, icon: Mail, disabled: !configStatus.value?.smtp },
  { type: 'web_search' as WorkflowNodeType, icon: SearchIcon, disabled: !configStatus.value?.webSearch },
]);
```

Fetch config status on mount (reuse existing pattern from the app):

```typescript
import { useGlobalConfigStore } from '@/stores';
const globalConfigStore = useGlobalConfigStore();
const configStatus = computed(() => globalConfigStore.configStatus);
```

Add the `addNodeToCanvas` function:

```typescript
function addNodeToCanvas(type: WorkflowNodeType): void {
  const defaultConfig = getDefaultConfig(type);
  localTemplate.value = {
    id: '',
    name: `new_${type}`,
    description: null,
    type,
    config: defaultConfig,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  buildFlowGraph();
  ElMessage.info(t('workflow.customNode.nodeAdded'));
}
```

Import `getDefaultConfig` from the workflowStore or extract it. Actually the editor builds its own flow graph from `localTemplate` — so just setting `localTemplate` and calling `buildFlowGraph()` is sufficient. The `getDefaultConfig` function is currently in `workflowStore.ts` as a module-level function. Since it's not exported, duplicate the minimal default config logic or export it.

- [ ] **Step 4: Add save dialog**

Add a dialog that appears when user clicks Save:

```html
<!-- Save Dialog -->
<el-dialog v-model="showSaveDialog" :title="t('workflow.customNode.saveDialogTitle')" width="420px">
  <el-form label-position="top">
    <el-form-item :label="t('workflow.customNode.saveName')" required>
      <el-input v-model="saveDialogName" />
    </el-form-item>
    <el-form-item :label="t('workflow.customNode.saveDesc')">
      <el-input v-model="saveDialogDesc" type="textarea" :rows="3" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showSaveDialog = false">{{ t('common.cancel') }}</el-button>
    <el-button type="primary" :disabled="!saveDialogName.trim()" :loading="isSaving" @click="confirmSave">
      {{ t('common.save') }}
    </el-button>
  </template>
</el-dialog>
```

Add state:

```typescript
const showSaveDialog = ref(false);
const saveDialogName = ref('');
const saveDialogDesc = ref('');
```

- [ ] **Step 5: Rewrite handleSave to open dialog**

Replace the current `handleSave` (lines 435-448):

```typescript
function handleSave(): void {
  if (!localTemplate.value) return;
  // Pre-fill dialog
  saveDialogName.value = localTemplate.value.name;
  saveDialogDesc.value = localTemplate.value.description ?? '';
  showSaveDialog.value = true;
}

async function confirmSave(): Promise<void> {
  if (!localTemplate.value || !saveDialogName.value.trim()) return;
  isSaving.value = true;
  try {
    if (isCreateMode.value) {
      // Create new template
      await workflowApi.createTemplate({
        name: saveDialogName.value.trim(),
        description: saveDialogDesc.value.trim() || undefined,
        type: localTemplate.value.type,
        config: localTemplate.value.config,
      });
      ElMessage.success(t('common.success'));
      showSaveDialog.value = false;
      emit('back'); // Return to list
    } else {
      // Update existing template
      await workflowStore.updateTemplate(props.templateId!, {
        name: saveDialogName.value.trim(),
        description: saveDialogDesc.value.trim() || undefined,
        config: localTemplate.value.config,
      });
      ElMessage.success(t('workflow.saveSuccess'));
      showSaveDialog.value = false;
    }
  } catch {
    ElMessage.error(t('workflow.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}
```

Import `* as workflowApi from '@/api/workflow'` at the top.

- [ ] **Step 6: Update onMounted for create mode**

Update the `onMounted` (lines 372-387) to handle both modes:

```typescript
onMounted(async () => {
  if (props.templateId) {
    // Edit mode — load existing template
    const tpl = workflowStore.customTemplates.find((t) => t.id === props.templateId);
    if (tpl) {
      localTemplate.value = JSON.parse(JSON.stringify(tpl));
    }
    buildFlowGraph();

    // Connect debug copilot
    debugStore.connect(props.templateId);
    debugStore.setOnNodeChanged(handleNodeChanged);
  }
  // Create mode — empty canvas, no copilot connection
});
```

- [ ] **Step 7: Hide copilot panel in create mode**

In the desktop body template, wrap the copilot panel with `v-if="!isCreateMode"`:

```html
<div v-if="!isCreateMode" class="wf-custom-node-editor__copilot-panel">
  <!-- existing copilot panel content -->
</div>
```

In the mobile template, hide the copilot button in the header when in create mode:

```html
<el-button v-if="!isCreateMode" size="small" @click="showMobileCopilot = true">
  <MessageSquare :size="14" />
</el-button>
```

- [ ] **Step 8: Add mobile palette**

For mobile create mode, add a node type selection above the node card area:

```html
<!-- Mobile: Node type selection (create mode, no node yet) -->
<div v-if="isCreateMode && !hasNode" class="wf-custom-node-editor__mobile-palette">
  <h4>{{ t('workflow.customNode.nodePalette') }}</h4>
  <div class="wf-custom-node-editor__mobile-palette-grid">
    <button
      v-for="nodeType in availableNodeTypes"
      :key="nodeType.type"
      class="wf-custom-node-editor__mobile-palette-item"
      :disabled="nodeType.disabled"
      @click="addNodeToCanvas(nodeType.type)"
    >
      <component :is="nodeType.icon" :size="20" :style="{ color: NODE_COLORS[nodeType.type] }" />
      <span>{{ t(`workflow.nodeTypes.${nodeType.type}`) }}</span>
    </button>
  </div>
</div>
```

- [ ] **Step 9: Add palette styles**

```scss
// Desktop palette
&__palette {
  width: 200px;
  border-right: 1px solid $border-dark;
  padding: $spacing-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  flex-shrink: 0;
}

&__palette-title {
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  color: $text-secondary-color;
  margin: 0 0 $spacing-sm;
}

&__palette-items {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

&__palette-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  border-radius: $radius-md;
  border: 1px solid $border-dark;
  background: $bg-card;
  color: $text-primary-color;
  cursor: pointer;
  font-size: $font-size-sm;
  transition: all $transition-fast;

  &:hover:not(:disabled) {
    border-color: $accent;
    background: $bg-elevated;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// Mobile palette
&__mobile-palette {
  padding: $spacing-md;

  h4 {
    font-size: $font-size-sm;
    color: $text-secondary-color;
    margin: 0 0 $spacing-sm;
  }
}

&__mobile-palette-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-sm;
}

&__mobile-palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: $spacing-md;
  border-radius: $radius-md;
  border: 1px solid $border-dark;
  background: $bg-card;
  color: $text-primary-color;
  cursor: pointer;
  font-size: $font-size-xs;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
```

- [ ] **Step 10: Run preflight**

Run: `cd frontend && pnpm run preflight`

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/workflow/WfCustomNodeEditor.vue
git commit -m "feat(custom-node): add create mode with palette and save dialog"
```

---

## Task 6: Final Integration + Preflight

- [ ] **Step 1: Run full frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS (no backend changes, but verify nothing broke)

- [ ] **Step 3: Push**

```bash
git push
```
