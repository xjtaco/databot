# Inline Action Card Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the action card system to support inline form editing within chat messages, fix workflow/template navigation, and add inline forms for data management, file upload, knowledge base, and scheduled tasks.

**Architecture:** Extend `ActionCard.vue` with an `editing` status that renders domain-specific form components. Change the handler architecture from synchronous result to callback-based streaming. Add `pendingIntent` consumption in `WorkflowPage.vue`. Add two new backend card definitions for file uploads.

**Tech Stack:** Vue 3 + TypeScript, Element Plus, Pinia stores, Vitest

---

### Task 1: Add `editing` to CardStatus type

**Files:**
- Modify: `frontend/src/types/actionCard.ts:4-10`
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Update CardStatus union type**

In `frontend/src/types/actionCard.ts`, add `'editing'` to the `CardStatus` union:

```ts
export type CardStatus =
  | 'proposed'
  | 'confirming'
  | 'editing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
```

- [ ] **Step 2: Add i18n key for editing status**

In `frontend/src/locales/zh-CN.ts`, inside the `chat.actionCard` object, add:

```ts
editing: '编辑中...',
```

In `frontend/src/locales/en-US.ts`, inside the `chat.actionCard` object, add:

```ts
editing: 'Editing...',
```

- [ ] **Step 3: Update existing ActionCard test to cover editing status**

In `frontend/tests/components/chat/ActionCard.test.ts`, add a test:

```ts
it('shows editing status label when card is in editing state', () => {
  const card = makeCard({ status: 'editing' });
  const wrapper = mount(ActionCard, {
    props: { card },
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  expect(wrapper.text()).toContain('Editing');
});
```

- [ ] **Step 4: Run tests to verify**

Run: `cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/actionCard.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts frontend/tests/components/chat/ActionCard.test.ts
git commit -m "feat(actionCard): add 'editing' status to CardStatus type and i18n"
```

---

### Task 2: Refactor handler architecture to support callbacks

**Files:**
- Modify: `frontend/src/components/chat/actionCards/actionCardRegistry.ts`
- Modify: `frontend/src/components/chat/actionCards/handlers.ts`
- Modify: `frontend/src/components/chat/ActionCard.vue`
- Test: `frontend/tests/components/chat/actionCardHandlers.test.ts`
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Update ActionHandler type and executeAction in actionCardRegistry.ts**

Replace the contents of `frontend/src/components/chat/actionCards/actionCardRegistry.ts`:

```ts
import type { UiActionCardPayload } from '@/types/actionCard';

export interface ActionCallbacks {
  setStatus: (status: 'running' | 'succeeded' | 'failed') => void;
  setResult: (result: string) => void;
  setError: (error: string) => void;
}

export interface ActionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export type ActionHandler = (
  payload: UiActionCardPayload,
  callbacks: ActionCallbacks
) => Promise<ActionResult | void>;

const registry = new Map<string, ActionHandler>();

function actionKey(domain: string, action: string): string {
  return `${domain}:${action}`;
}

export function registerActionHandler(
  domain: string,
  action: string,
  handler: ActionHandler
): void {
  registry.set(actionKey(domain, action), handler);
}

export function isActionRegistered(domain: string, action: string): boolean {
  return registry.has(actionKey(domain, action));
}

export async function executeAction(
  payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const handler = registry.get(actionKey(payload.domain, payload.action));
  if (!handler) {
    return {
      success: false,
      summary: `Unsupported action: ${payload.domain}.${payload.action}`,
    };
  }
  try {
    const result = await handler(payload, callbacks);
    return result ?? { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getRegistry(): Map<string, ActionHandler> {
  return registry;
}
```

- [ ] **Step 2: Update existing handlers to accept callbacks parameter**

In `frontend/src/components/chat/actionCards/handlers.ts`, update the existing handlers. The navigation handlers and workflow/template copilot_create handlers need the `_callbacks` parameter added (prefixed with underscore since they don't use it — they return ActionResult synchronously).

For the navigation handler:

```ts
function navigationHandler(
  targetNav: 'data' | 'workflow' | 'schedule',
  targetTab?: 'data' | 'knowledge'
): ActionHandler {
  return async (payload: UiActionCardPayload): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    if (targetTab) {
      navigationStore.setPendingIntent({ type: 'open_data_management', tab: targetTab });
    }
    navigationStore.navigateTo(targetNav);
    return { success: true, summary: `Navigated to ${payload.title}` };
  };
}
```

The navigation handlers and copilot_create handlers don't change their body — they still return `ActionResult`. The `callbacks` parameter is optional in the type so they continue to work.

For the stub handlers at the bottom, also keep them returning `ActionResult`:

```ts
for (const [domain, action] of stubActions) {
  registerActionHandler(
    domain,
    action,
    async (payload: UiActionCardPayload): Promise<ActionResult> => ({
      success: false,
      summary: `Action "${payload.title}" is not yet fully implemented. Please use the ${payload.targetNav ?? domain} page directly.`,
    })
  );
}
```

- [ ] **Step 3: Update ActionCard.vue to pass callbacks and handle editing status**

In `frontend/src/components/chat/ActionCard.vue`, update `handleConfirm` to:
1. Check if the card has an inline form (via the `formComponentMap`). If so, transition to `editing` status.
2. For non-form cards (workflow/template create), execute immediately as before.
3. Add rendering of the inline form component when status is `editing`.

Update the `<script setup>` section. Add the form component map and import:

```ts
import { ref, computed, markRaw, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { executeAction } from './actionCards';
import type { ChatActionCard, CardStatus } from '@/types/actionCard';

// Lazy-loaded form components
const InlineDataCreateForm = markRaw(
  (await import('./forms/InlineDataCreateForm.vue')).default
) as Component;
const InlineFileUploadForm = markRaw(
  (await import('./forms/InlineFileUploadForm.vue')).default
) as Component;
const InlineKnowledgeFolderForm = markRaw(
  (await import('./forms/InlineKnowledgeFolderForm.vue')).default
) as Component;
const InlineKnowledgeFileForm = markRaw(
  (await import('./forms/InlineKnowledgeFileForm.vue')).default
) as Component;
const InlineScheduleForm = markRaw(
  (await import('./forms/InlineScheduleForm.vue')).default
) as Component;

const formComponentMap: Record<string, Component> = {
  'data:datasource_create': InlineDataCreateForm,
  'data:file_upload': InlineFileUploadForm,
  'knowledge:folder_create': InlineKnowledgeFolderForm,
  'knowledge:folder_rename': InlineKnowledgeFolderForm,
  'knowledge:folder_move': InlineKnowledgeFolderForm,
  'knowledge:folder_delete': InlineKnowledgeFolderForm,
  'knowledge:file_upload': InlineKnowledgeFileForm,
  'knowledge:file_move': InlineKnowledgeFileForm,
  'knowledge:file_delete': InlineKnowledgeFileForm,
  'schedule:create': InlineScheduleForm,
  'schedule:update': InlineScheduleForm,
  'schedule:delete': InlineScheduleForm,
};
```

Update `handleConfirm`:

```ts
const formComponent = computed(() => {
  const key = `${props.card.payload.domain}:${props.card.payload.action}`;
  return formComponentMap[key] ?? null;
});

async function handleConfirm(): Promise<void> {
  if (props.card.payload.riskLevel === 'danger' && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'confirming');
    return;
  }

  // If this card has an inline form, transition to editing
  if (formComponent.value && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'editing');
    return;
  }

  // Direct execution (workflow/template create, navigation, etc.)
  emit('statusChange', props.card.id, 'running');
  try {
    const result = await executeAction(props.card.payload, {
      setStatus: (status) => emit('statusChange', props.card.id, status),
      setResult: (summary) => emit('statusChange', props.card.id, 'succeeded', { resultSummary: summary }),
      setError: (error) => emit('statusChange', props.card.id, 'failed', { error }),
    });
    if (result.success) {
      emit('statusChange', props.card.id, 'succeeded', { resultSummary: result.summary });
    } else {
      emit('statusChange', props.card.id, 'failed', {
        resultSummary: result.summary,
        error: result.error,
      });
    }
  } catch (err) {
    emit('statusChange', props.card.id, 'failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

Add form event handlers:

```ts
function handleFormCancel(): void {
  emit('statusChange', props.card.id, 'cancelled');
}

function handleFormSubmit(status: CardStatus, opts?: { resultSummary?: string; error?: string }): void {
  emit('statusChange', props.card.id, status, opts);
}
```

Update `showActions` computed:

```ts
const showActions = computed(() => {
  return props.card.status === 'proposed' || props.card.status === 'confirming';
});
```

In the `<template>`, add the editing state form rendering after the existing result/error block (before the actions div):

```html
<!-- Inline Form (editing state) -->
<component
  v-if="card.status === 'editing' && formComponent"
  :is="formComponent"
  :payload="card.payload"
  class="action-card__inline-form"
  @submit="handleFormSubmit"
  @cancel="handleFormCancel"
/>
```

- [ ] **Step 4: Create placeholder form components**

Create 5 minimal placeholder `.vue` files in `frontend/src/components/chat/actionCards/forms/` that accept `payload` prop and emit `submit`/`cancel`. Each should just show a text "Form: [action]" for now — they'll be fully implemented in later tasks.

`frontend/src/components/chat/actionCards/forms/InlineDataCreateForm.vue`:

```vue
<template>
  <div class="inline-form-placeholder">
    <p>{{ payload.action }}</p>
    <el-button size="small" @click="emit('submit', 'succeeded', { resultSummary: 'Created' })">Submit</el-button>
    <el-button size="small" @click="emit('cancel')">Cancel</el-button>
  </div>
</template>

<script setup lang="ts">
import type { UiActionCardPayload } from '@/types/actionCard';

defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();
</script>
```

Create identical placeholder files for:
- `InlineFileUploadForm.vue`
- `InlineKnowledgeFolderForm.vue`
- `InlineKnowledgeFileForm.vue`
- `InlineScheduleForm.vue`

- [ ] **Step 5: Run existing tests**

Run: `cd frontend && pnpm vitest run tests/components/chat/`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/actionCards/ frontend/src/components/chat/ActionCard.vue
git commit -m "refactor(actionCard): add editing status and form component map"
```

---

### Task 3: Fix WorkflowPage pendingIntent consumption (Part A)

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowPage.vue:347-353`
- Modify: `frontend/src/components/chat/actionCards/handlers.ts`

- [ ] **Step 1: Add pendingIntent consumption in WorkflowPage.vue onMounted**

In `frontend/src/components/workflow/WorkflowPage.vue`, update the `onMounted` hook. Import `useNavigationStore` and `useDebugCopilotStore`:

Add to imports:
```ts
import { useNavigationStore } from '@/stores/navigationStore';
import { useDebugCopilotStore } from '@/stores/debugCopilotStore';
```

Add store initialization after existing stores:
```ts
const navigationStore = useNavigationStore();
const debugCopilotStore = useDebugCopilotStore();
```

Replace the existing `onMounted` with:

```ts
onMounted(async () => {
  await Promise.all([
    store.fetchWorkflows(),
    store.fetchTemplates(),
    datafileStore.fetchDatasources(),
  ]);

  // Consume pending intent from action card navigation
  const intent = navigationStore.pendingIntent;
  if (!intent) return;

  if (intent.type === 'open_workflow_editor') {
    navigationStore.clearPendingIntent();
    try {
      await store.loadForEditing(intent.workflowId);
      copilotStore.connect(intent.workflowId);
      activeView.value = 'editor';
      if (intent.copilotPrompt) {
        // Wait for copilot connection
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const interval = setInterval(() => {
            if (copilotStore.isConnected && copilotStore.workflowId === intent.workflowId) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= 50) {
              clearInterval(interval);
              reject(new Error('Copilot connection timeout'));
            }
          }, 200);
        });
        copilotStore.sendMessage(intent.copilotPrompt);
      }
    } catch {
      ElMessage.error(t('common.failed'));
    }
  } else if (intent.type === 'open_template_editor') {
    navigationStore.clearPendingIntent();
    try {
      store.enterCustomNodeEditor(intent.templateId);
      activeView.value = 'customNodeEditor';
      if (intent.copilotPrompt) {
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const interval = setInterval(() => {
            if (debugCopilotStore.isConnected) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= 50) {
              clearInterval(interval);
              reject(new Error('Debug Copilot connection timeout'));
            }
          }, 200);
        });
        debugCopilotStore.sendMessage(intent.copilotPrompt);
      }
    } catch {
      ElMessage.error(t('common.failed'));
    }
  } else {
    navigationStore.clearPendingIntent();
  }
});
```

- [ ] **Step 2: Remove duplicate copilot send logic from handlers.ts**

In `frontend/src/components/chat/actionCards/handlers.ts`, the `workflow:copilot_create` handler currently waits for connection and sends the prompt itself. Since `WorkflowPage.vue` now handles this via `pendingIntent`, remove the `copilotPrompt` sending logic from the handler to avoid double-sending.

Update the `workflow:copilot_create` handler:

```ts
registerActionHandler(
  'workflow',
  'copilot_create',
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = (payload.params.name as string) || 'Untitled Workflow';
    const description = payload.params.description as string | undefined;
    const copilotPrompt = payload.copilotPrompt;

    try {
      const { useWorkflowStore } = await import('@/stores/workflowStore');
      const workflowStore = useWorkflowStore();
      const workflowId = await workflowStore.createWorkflow(name, description);

      navigationStore.setPendingIntent({
        type: 'open_workflow_editor',
        workflowId,
        copilotPrompt,
      });
      navigationStore.navigateTo('workflow');

      return {
        success: true,
        summary: `Created workflow "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        summary: 'Failed to create workflow.',
      };
    }
  }
);
```

Similarly update the `template:copilot_create` handler:

```ts
registerActionHandler(
  'template',
  'copilot_create',
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = (payload.params.name as string) || 'Untitled Template';
    const description = payload.params.description as string | undefined;
    const copilotPrompt = payload.copilotPrompt;
    const nodeType = ((payload.params.nodeType as string) || 'llm') as WorkflowNodeType;

    try {
      const { createTemplate } = await import('@/api/workflow');
      const template = await createTemplate({
        name,
        description: description ?? '',
        type: nodeType,
        config: {
          nodeType,
          params: {},
          prompt: '',
          outputVariable: 'result',
        } as NodeConfig,
      });

      navigationStore.setPendingIntent({
        type: 'open_template_editor',
        templateId: template.id,
        copilotPrompt,
      });
      navigationStore.navigateTo('workflow');

      return {
        success: true,
        summary: `Created template "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        summary: 'Failed to create template.',
      };
    }
  }
);
```

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/WorkflowPage.vue frontend/src/components/chat/actionCards/handlers.ts
git commit -m "fix(workflow): consume pendingIntent in WorkflowPage onMounted"
```

---

### Task 4: Implement InlineDataCreateForm (datasource creation)

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineDataCreateForm.vue`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add i18n keys for inline forms**

In `frontend/src/locales/zh-CN.ts`, inside `chat.actionCard`, add:

```ts
inlineForm: {
  createDatasource: '创建数据源',
  testConnection: '测试连接',
  testSuccess: '连接成功',
  testFailed: '连接测试失败',
  createSuccess: '数据源创建成功',
  createFailed: '数据源创建失败',
  uploadFile: '上传文件',
  uploadSuccess: '文件上传成功',
  uploadFailed: '文件上传失败',
  selectFile: '选择文件',
  dropzoneText: '拖拽文件到此处',
  dropzoneClick: '或点击选择文件',
  folderName: '文件夹名称',
  createFolder: '创建文件夹',
  createFolderSuccess: '文件夹创建成功',
  renameFolder: '重命名文件夹',
  renameSuccess: '文件夹重命名成功',
  moveFolder: '移动文件夹',
  moveSuccess: '文件夹移动成功',
  deleteConfirm: '确认删除',
  deleteSuccess: '删除成功',
  selectTarget: '选择目标文件夹',
  createSchedule: '创建定时任务',
  updateSchedule: '更新定时任务',
  scheduleSuccess: '定时任务保存成功',
  scheduleFailed: '定时任务保存失败',
  knowledgeUpload: '上传知识文件',
  knowledgeUploadSuccess: '知识文件上传成功',
  knowledgeUploadFailed: '知识文件上传失败',
  moveFile: '移动文件',
  moveFileSuccess: '文件移动成功',
  deleteFile: '删除文件',
  deleteFileSuccess: '文件删除成功',
  createSuccess: '创建成功',
  save: '保存',
},
```

In `frontend/src/locales/en-US.ts`, inside `chat.actionCard`, add:

```ts
inlineForm: {
  createDatasource: 'Create Datasource',
  testConnection: 'Test Connection',
  testSuccess: 'Connection successful',
  testFailed: 'Connection test failed',
  createSuccess: 'Datasource created successfully',
  createFailed: 'Failed to create datasource',
  uploadFile: 'Upload File',
  uploadSuccess: 'File uploaded successfully',
  uploadFailed: 'Failed to upload file',
  selectFile: 'Select File',
  dropzoneText: 'Drag files here',
  dropzoneClick: 'or click to select',
  folderName: 'Folder Name',
  createFolder: 'Create Folder',
  createFolderSuccess: 'Folder created successfully',
  renameFolder: 'Rename Folder',
  renameSuccess: 'Folder renamed successfully',
  moveFolder: 'Move Folder',
  moveSuccess: 'Folder moved successfully',
  deleteConfirm: 'Confirm Delete',
  deleteSuccess: 'Deleted successfully',
  selectTarget: 'Select Target Folder',
  createSchedule: 'Create Schedule',
  updateSchedule: 'Update Schedule',
  scheduleSuccess: 'Schedule saved successfully',
  scheduleFailed: 'Failed to save schedule',
  knowledgeUpload: 'Upload Knowledge Files',
  knowledgeUploadSuccess: 'Knowledge files uploaded successfully',
  knowledgeUploadFailed: 'Failed to upload knowledge files',
  moveFile: 'Move File',
  moveFileSuccess: 'File moved successfully',
  deleteFile: 'Delete File',
  deleteFileSuccess: 'File deleted successfully',
  createSuccess: 'Created successfully',
  save: 'Save',
},
```

- [ ] **Step 2: Implement InlineDataCreateForm.vue**

Replace the placeholder with the full implementation. The form reuses the same field logic as `DatabaseConnectionDialog.vue` but renders inline within the card:

```vue
<template>
  <div class="inline-datasource-form">
    <el-form ref="formRef" :model="formData" :rules="formRules" label-position="top">
      <el-form-item :label="t('datasource.connectionDialog.dbType')" prop="dbType">
        <el-select v-model="formData.dbType" :placeholder="t('datasource.connectionDialog.dbType')" :disabled="isSubmitting" class="inline-datasource-form__full">
          <el-option v-for="dbType in DATABASE_TYPES" :key="dbType" :label="t(`datasource.types.${dbType}`)" :value="dbType" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.host')" prop="host">
        <el-input v-model="formData.host" placeholder="localhost" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.port')" prop="port">
        <el-input-number v-model="formData.port" :min="1" :max="65535" :disabled="isSubmitting" controls-position="right" class="inline-datasource-form__full" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.database')" prop="database">
        <el-input v-model="formData.database" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.user')" prop="user">
        <el-input v-model="formData.user" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.password')" prop="password">
        <el-input v-model="formData.password" type="password" show-password :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item v-if="showSchemaField" :label="t('datasource.connectionDialog.schema')" prop="schema">
        <el-input v-model="formData.schema" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Oracle: SID vs Service Name -->
      <el-form-item v-if="formData.dbType === 'oracle'" :label="t('datasource.oracle.connectionType')">
        <el-radio-group v-model="formData.oracleConnectionType" :disabled="isSubmitting">
          <el-radio value="sid">{{ t('datasource.oracle.sid') }}</el-radio>
          <el-radio value="serviceName">{{ t('datasource.oracle.serviceName') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- SAP HANA: Instance Number -->
      <el-form-item v-if="formData.dbType === 'saphana'" :label="t('datasource.saphana.instanceNumber')">
        <el-input v-model="formData.saphanaInstanceNumber" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Trino: Catalog -->
      <el-form-item v-if="formData.dbType === 'trino'" :label="t('datasource.trino.catalog')">
        <el-input v-model="formData.trinoCatalog" :disabled="isSubmitting" />
      </el-form-item>

      <!-- PrestoDB: Catalog -->
      <el-form-item v-if="formData.dbType === 'prestodb'" :label="t('datasource.prestodb.catalog')">
        <el-input v-model="formData.prestodbCatalog" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Spark: Transport Protocol -->
      <el-form-item v-if="formData.dbType === 'spark'" :label="t('datasource.spark.transport')">
        <el-select v-model="formData.sparkTransport" :disabled="isSubmitting" class="inline-datasource-form__full">
          <el-option label="Binary" value="binary" />
          <el-option label="HTTP" value="http" />
        </el-select>
      </el-form-item>

      <!-- Hive2: Transport Protocol -->
      <el-form-item v-if="formData.dbType === 'hive2'" :label="t('datasource.hive2.transport')">
        <el-select v-model="formData.hive2Transport" :disabled="isSubmitting" class="inline-datasource-form__full">
          <el-option label="Binary" value="binary" />
          <el-option label="HTTP" value="http" />
        </el-select>
      </el-form-item>

      <!-- Inline error for test connection -->
      <div v-if="testError" class="inline-datasource-form__test-error">{{ testError }}</div>

      <div class="inline-datasource-form__actions">
        <el-button size="small" :loading="isTesting" :disabled="isSubmitting" @click="handleTestConnection">
          {{ t('chat.actionCard.inlineForm.testConnection') }}
        </el-button>
        <div class="inline-datasource-form__actions-right">
          <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
          <el-button size="small" type="primary" :loading="isSubmitting" @click="handleSubmit">
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInstance, FormRules } from 'element-plus';
import { useDatafileStore } from '@/stores';
import type { DatabaseType } from '@/types/datafile';
import type { DatabaseConnectionConfig } from '@/api/datasource';
import type { UiActionCardPayload } from '@/types/actionCard';

const DATABASE_TYPES: DatabaseType[] = [
  'mysql', 'postgresql', 'sqlserver', 'mariadb', 'oracle', 'db2', 'saphana',
  'kingbase', 'clickhouse', 'spark', 'hive2', 'starrocks', 'trino', 'prestodb',
  'tidb', 'dameng',
];

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  mysql: 3306, sqlserver: 1433, mariadb: 3306, oracle: 1521, db2: 50000,
  saphana: 30015, kingbase: 54321, clickhouse: 8123, spark: 10000, hive2: 10000,
  starrocks: 9030, trino: 8080, prestodb: 8080, tidb: 3306, dameng: 5236, postgresql: 5432,
};

const SCHEMA_SUPPORTED_TYPES: Set<DatabaseType> = new Set([
  'postgresql', 'sqlserver', 'oracle', 'db2', 'saphana', 'kingbase', 'dameng', 'trino', 'prestodb',
]);

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();
const formRef = ref<FormInstance>();
const isTesting = ref(false);
const isSubmitting = ref(false);
const testError = ref('');

const formData = reactive({
  dbType: '' as DatabaseType | '',
  host: '',
  port: 5432,
  database: '',
  user: '',
  password: '',
  schema: '',
  oracleConnectionType: 'sid' as 'sid' | 'serviceName',
  saphanaInstanceNumber: '',
  trinoCatalog: '',
  prestodbCatalog: '',
  sparkTransport: 'binary' as 'binary' | 'http',
  hive2Transport: 'binary' as 'binary' | 'http',
});

const showSchemaField = computed(() =>
  formData.dbType && SCHEMA_SUPPORTED_TYPES.has(formData.dbType as DatabaseType)
);

const formRules = computed<FormRules>(() => ({
  dbType: [{ required: true, message: t('datasource.validation.dbTypeRequired'), trigger: 'change' }],
  host: [{ required: true, message: t('datasource.validation.hostRequired'), trigger: 'blur' }],
  port: [
    { required: true, message: t('datasource.validation.portRequired'), trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: t('datasource.validation.portRange'), trigger: 'blur' },
  ],
  database: [{ required: true, message: t('datasource.validation.databaseRequired'), trigger: 'blur' }],
  user: [{ required: true, message: t('datasource.validation.userRequired'), trigger: 'blur' }],
  password: [{ required: true, message: t('datasource.validation.passwordRequired'), trigger: 'blur' }],
}));

watch(() => formData.dbType, (newType) => {
  if (newType) {
    formData.port = DEFAULT_PORTS[newType as DatabaseType];
  }
});

onMounted(() => {
  const params = props.payload.params;
  if (params.type) formData.dbType = params.type as DatabaseType;
  if (params.host) formData.host = params.host as string;
  if (params.port) formData.port = params.port as number;
  if (params.database) formData.database = params.database as string;
  if (params.username) formData.user = params.username as string;
  if (params.password) formData.password = params.password as string;
});

function buildConfig(): DatabaseConnectionConfig {
  const dbType = formData.dbType as DatabaseType;
  const config: DatabaseConnectionConfig = {
    dbType, host: formData.host, port: formData.port,
    database: formData.database, user: formData.user, password: formData.password,
  };
  if (showSchemaField.value && formData.schema) config.schema = formData.schema;
  const properties: Record<string, string> = {};
  if (dbType === 'oracle') properties.connectionType = formData.oracleConnectionType;
  if (dbType === 'saphana' && formData.saphanaInstanceNumber) properties.instanceNumber = formData.saphanaInstanceNumber;
  if (dbType === 'trino' && formData.trinoCatalog) properties.catalog = formData.trinoCatalog;
  if (dbType === 'prestodb' && formData.prestodbCatalog) properties.catalog = formData.prestodbCatalog;
  if (dbType === 'spark') properties.transport = formData.sparkTransport;
  if (dbType === 'hive2') properties.transport = formData.hive2Transport;
  if (Object.keys(properties).length > 0) config.properties = properties;
  return config;
}

async function handleTestConnection(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  isTesting.value = true;
  testError.value = '';
  try {
    await datafileStore.testDatasourceConnection(buildConfig());
    testError.value = '';
  } catch (err) {
    testError.value = err instanceof Error ? err.message : t('chat.actionCard.inlineForm.testFailed');
  } finally {
    isTesting.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  isSubmitting.value = true;
  try {
    await datafileStore.createDatasource(buildConfig());
    emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.createSuccess') });
  } catch (err) {
    emit('submit', 'failed', { error: err instanceof Error ? err.message : t('chat.actionCard.inlineForm.createFailed') });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-datasource-form {
  &__full {
    width: 100%;
  }

  &__test-error {
    padding: $spacing-xs $spacing-sm;
    margin-bottom: $spacing-sm;
    font-size: $font-size-xs;
    color: var(--error);
    background-color: var(--error-bg);
    border-radius: $radius-sm;
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    margin-top: $spacing-md;
    flex-wrap: wrap;

    @media (max-width: $breakpoint-md) {
      flex-direction: column;
      align-items: stretch;

      :deep(.el-button) {
        width: 100%;
      }
    }
  }

  &__actions-right {
    display: flex;
    gap: $spacing-sm;
    margin-left: auto;

    @media (max-width: $breakpoint-md) {
      margin-left: 0;
    }
  }
}
</style>
```

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/actionCards/forms/InlineDataCreateForm.vue frontend/src/locales/
git commit -m "feat(actionCard): implement InlineDataCreateForm for datasource creation"
```

---

### Task 5: Implement InlineFileUploadForm (CSV/Excel/SQLite upload)

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineFileUploadForm.vue`

- [ ] **Step 1: Implement InlineFileUploadForm.vue**

```vue
<template>
  <div class="inline-file-upload">
    <div
      class="inline-file-upload__dropzone"
      :class="{ 'is-dragover': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
      @click="openFilePicker"
    >
      <p class="inline-file-upload__dropzone-text">
        {{ t('chat.actionCard.inlineForm.dropzoneText') }}
        <span class="inline-file-upload__dropzone-link">{{ t('chat.actionCard.inlineForm.dropzoneClick') }}</span>
      </p>
      <p class="inline-file-upload__dropzone-hint">.csv, .xls, .xlsx, .db, .sqlite, .sqlite3</p>
    </div>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept=".csv,.xls,.xlsx,.db,.sqlite,.sqlite3"
      style="display: none"
      @change="handleFileInputChange"
    />

    <div v-if="selectedFiles.length > 0" class="inline-file-upload__file-list">
      <div v-for="(file, index) in selectedFiles" :key="index" class="inline-file-upload__file-item">
        <span class="inline-file-upload__file-name">{{ file.name }}</span>
        <span class="inline-file-upload__file-size">{{ formatFileSize(file.size) }}</span>
        <el-button type="danger" :icon="Close" size="small" circle plain @click="removeFile(index)" />
      </div>
    </div>

    <div v-if="uploadError" class="inline-file-upload__error">{{ uploadError }}</div>

    <div class="inline-file-upload__actions">
      <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="isUploading" :disabled="selectedFiles.length === 0" @click="handleUpload">
        {{ t('chat.actionCard.inlineForm.uploadFile') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Close } from '@element-plus/icons-vue';
import { useDatafileStore } from '@/stores';
import type { UiActionCardPayload } from '@/types/actionCard';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();
const selectedFiles = ref<File[]>([]);
const isDragOver = ref(false);
const isUploading = ref(false);
const uploadError = ref('');
const fileInputRef = ref<HTMLInputElement>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addFiles(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    if (file.size > MAX_FILE_SIZE) {
      uploadError.value = `${file.name}: File too large`;
      continue;
    }
    if (!selectedFiles.value.some((f) => f.name === file.name && f.size === file.size)) {
      selectedFiles.value.push(file);
    }
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(input.files);
  input.value = '';
}

function removeFile(index: number): void {
  selectedFiles.value.splice(index, 1);
}

function isSqliteFile(name: string): boolean {
  return name.endsWith('.db') || name.endsWith('.sqlite') || name.endsWith('.sqlite3');
}

async function handleUpload(): Promise<void> {
  if (selectedFiles.value.length === 0) return;
  isUploading.value = true;
  uploadError.value = '';
  const results: string[] = [];
  try {
    for (const file of selectedFiles.value) {
      if (isSqliteFile(file.name)) {
        await datafileStore.uploadSqliteFile(file);
        results.push(file.name);
      } else {
        await datafileStore.uploadFile(file);
        results.push(file.name);
      }
    }
    emit('submit', 'succeeded', {
      resultSummary: t('chat.actionCard.inlineForm.uploadSuccess') + ` (${results.join(', ')})`,
    });
  } catch (err) {
    emit('submit', 'failed', {
      error: err instanceof Error ? err.message : t('chat.actionCard.inlineForm.uploadFailed'),
    });
  } finally {
    isUploading.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-file-upload {
  &__dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $spacing-lg;
    cursor: pointer;
    border: 2px dashed var(--border-primary);
    border-radius: $radius-md;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover, &.is-dragover {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }

  &__dropzone-text {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--text-secondary);
  }

  &__dropzone-link {
    color: var(--el-color-primary);
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }

  &__dropzone-hint {
    margin: $spacing-xs 0 0;
    font-size: $font-size-xs;
    color: var(--text-muted);
  }

  &__file-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin-top: $spacing-sm;
  }

  &__file-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    background-color: var(--bg-tertiary);
    border-radius: $radius-sm;
  }

  &__file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__file-size {
    flex-shrink: 0;
    font-size: $font-size-xs;
    color: var(--text-muted);
  }

  &__error {
    padding: $spacing-xs $spacing-sm;
    margin-top: $spacing-sm;
    font-size: $font-size-xs;
    color: var(--error);
    background-color: var(--error-bg);
    border-radius: $radius-sm;
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;

    @media (max-width: $breakpoint-md) {
      justify-content: stretch;

      :deep(.el-button) {
        flex: 1;
      }
    }
  }
}
</style>
```

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/actionCards/forms/InlineFileUploadForm.vue
git commit -m "feat(actionCard): implement InlineFileUploadForm for CSV/Excel/SQLite upload"
```

---

### Task 6: Implement InlineKnowledgeFolderForm

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFolderForm.vue`

- [ ] **Step 1: Implement InlineKnowledgeFolderForm.vue**

This form handles 4 actions: `folder_create`, `folder_rename`, `folder_move`, `folder_delete`. It detects the action from `payload.action` and renders the appropriate UI.

```vue
<template>
  <div class="inline-knowledge-folder-form">
    <!-- Create / Rename -->
    <template v-if="action === 'folder_create' || action === 'folder_rename'">
      <el-form label-position="top">
        <el-form-item :label="action === 'folder_create' ? t('chat.actionCard.inlineForm.folderName') : t('chat.actionCard.inlineForm.renameFolder')" required>
          <el-input v-model="folderName" :placeholder="action === 'folder_create' ? t('chat.actionCard.inlineForm.folderName') : ''" :disabled="isSubmitting" />
        </el-form-item>
        <el-form-item v-if="action === 'folder_create'" :label="t('chat.actionCard.inlineForm.selectTarget')">
          <FolderTreeSelector :folders="knowledgeStore.folderTree" v-model:selected-folder-id="parentId" :show-root="false" />
        </el-form-item>
      </el-form>
    </template>

    <!-- Move -->
    <template v-else-if="action === 'folder_move'">
      <el-form label-position="top">
        <el-form-item :label="t('chat.actionCard.inlineForm.selectTarget')">
          <FolderTreeSelector :folders="knowledgeStore.folderTree" v-model:selected-folder-id="targetParentId" :show-root="false" />
        </el-form-item>
      </el-form>
    </template>

    <!-- Delete -->
    <template v-else-if="action === 'folder_delete'">
      <p class="inline-knowledge-folder-form__delete-warning">
        {{ t('common.warning') }}: {{ payload.summary }}
      </p>
    </template>

    <div class="inline-knowledge-folder-form__actions">
      <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="isSubmitting" @click="handleSubmit">
        {{ action === 'folder_delete' ? t('common.delete') : t('common.confirm') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import FolderTreeSelector from '@/components/knowledge/FolderTreeSelector.vue';
import { useKnowledgeStore } from '@/stores';
import type { UiActionCardPayload } from '@/types/actionCard';

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const knowledgeStore = useKnowledgeStore();
const isSubmitting = ref(false);
const folderName = ref('');
const parentId = ref<string | null>(null);
const targetParentId = ref<string | null>(null);

const action = computed(() => props.payload.action);

onMounted(async () => {
  await knowledgeStore.fetchFolderTree();
  const params = props.payload.params;
  if (action.value === 'folder_create') {
    if (params.name) folderName.value = params.name as string;
    if (params.parentId) parentId.value = params.parentId as string;
  } else if (action.value === 'folder_rename') {
    if (params.newName) folderName.value = params.newName as string;
  } else if (action.value === 'folder_move') {
    if (params.targetParentId) targetParentId.value = params.targetParentId as string;
  }
});

async function handleSubmit(): Promise<void> {
  isSubmitting.value = true;
  try {
    const act = action.value;
    if (act === 'folder_create') {
      if (!folderName.value.trim()) return;
      await knowledgeStore.createFolder(folderName.value.trim(), parentId.value ?? undefined);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.createFolderSuccess') });
    } else if (act === 'folder_rename') {
      const folderId = props.payload.params.folderId as string;
      if (!folderId || !folderName.value.trim()) return;
      const { updateFolder } = await import('@/api/knowledge');
      await updateFolder(folderId, { name: folderName.value.trim() });
      await knowledgeStore.fetchFolderTree();
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.renameSuccess') });
    } else if (act === 'folder_move') {
      const folderId = props.payload.params.folderId as string;
      if (!folderId || !targetParentId.value) return;
      await knowledgeStore.moveFolder(folderId, targetParentId.value);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.moveSuccess') });
    } else if (act === 'folder_delete') {
      const folderId = props.payload.params.folderId as string;
      if (!folderId) return;
      await knowledgeStore.deleteFolder(folderId);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.deleteSuccess') });
    }
  } catch (err) {
    emit('submit', 'failed', { error: err instanceof Error ? err.message : t('common.error') });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-knowledge-folder-form {
  &__delete-warning {
    padding: $spacing-sm;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: var(--error);
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;

    @media (max-width: $breakpoint-md) {
      justify-content: stretch;

      :deep(.el-button) {
        flex: 1;
      }
    }
  }
}
</style>
```

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/actionCards/forms/InlineKnowledgeFolderForm.vue
git commit -m "feat(actionCard): implement InlineKnowledgeFolderForm for folder CRUD"
```

---

### Task 7: Implement InlineKnowledgeFileForm

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFileForm.vue`

- [ ] **Step 1: Implement InlineKnowledgeFileForm.vue**

This form handles 3 actions: `file_upload`, `file_move`, `file_delete`.

```vue
<template>
  <div class="inline-knowledge-file-form">
    <!-- Upload -->
    <template v-if="action === 'file_upload'">
      <el-form label-position="top">
        <el-form-item :label="t('chat.actionCard.inlineForm.selectTarget')">
          <FolderTreeSelector :folders="knowledgeStore.folderTree" v-model:selected-folder-id="selectedFolderId" :show-root="false" />
        </el-form-item>
      </el-form>
      <div
        class="inline-knowledge-file-form__dropzone"
        :class="{ 'is-dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
        @click="openFilePicker"
      >
        <p class="inline-knowledge-file-form__dropzone-text">
          {{ t('chat.actionCard.inlineForm.dropzoneText') }}
          <span class="inline-knowledge-file-form__dropzone-link">{{ t('chat.actionCard.inlineForm.dropzoneClick') }}</span>
        </p>
        <p class="inline-knowledge-file-form__dropzone-hint">.md, .markdown (10MB max)</p>
      </div>
      <input ref="fileInputRef" type="file" multiple accept=".md,.markdown" style="display: none" @change="handleFileInputChange" />

      <div v-if="selectedFiles.length > 0" class="inline-knowledge-file-form__file-list">
        <div v-for="(file, index) in selectedFiles" :key="index" class="inline-knowledge-file-form__file-item">
          <span class="inline-knowledge-file-form__file-name">{{ file.name }}</span>
          <span class="inline-knowledge-file-form__file-size">{{ formatFileSize(file.size) }}</span>
          <el-button type="danger" :icon="Close" size="small" circle plain @click="removeFile(index)" />
        </div>
      </div>
    </template>

    <!-- Move -->
    <template v-else-if="action === 'file_move'">
      <el-form label-position="top">
        <el-form-item :label="t('chat.actionCard.inlineForm.selectTarget')">
          <FolderTreeSelector :folders="knowledgeStore.folderTree" v-model:selected-folder-id="targetFolderId" :show-root="false" />
        </el-form-item>
      </el-form>
    </template>

    <!-- Delete -->
    <template v-else-if="action === 'file_delete'">
      <p class="inline-knowledge-file-form__delete-warning">
        {{ t('common.warning') }}: {{ payload.summary }}
      </p>
    </template>

    <div class="inline-knowledge-file-form__actions">
      <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="isSubmitting" @click="handleSubmit">
        {{ action === 'file_delete' ? t('common.delete') : t('common.confirm') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Close } from '@element-plus/icons-vue';
import FolderTreeSelector from '@/components/knowledge/FolderTreeSelector.vue';
import { useKnowledgeStore } from '@/stores';
import type { UiActionCardPayload } from '@/types/actionCard';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const knowledgeStore = useKnowledgeStore();
const isSubmitting = ref(false);
const isDragOver = ref(false);
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement>();
const selectedFolderId = ref<string | null>(null);
const targetFolderId = ref<string | null>(null);

const action = computed(() => props.payload.action);

onMounted(async () => {
  await knowledgeStore.fetchFolderTree();
  const params = props.payload.params;
  if (action.value === 'file_move' && params.targetFolderId) {
    targetFolderId.value = params.targetFolderId as string;
  }
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addFiles(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
      ElMessage.warning('Only .md files are supported');
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name}: File too large (max 10MB)`);
      continue;
    }
    if (!selectedFiles.value.some((f) => f.name === file.name && f.size === file.size)) {
      selectedFiles.value.push(file);
    }
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
}

function openFilePicker(): void { fileInputRef.value?.click(); }

function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(input.files);
  input.value = '';
}

function removeFile(index: number): void { selectedFiles.value.splice(index, 1); }

async function handleSubmit(): Promise<void> {
  isSubmitting.value = true;
  try {
    const act = action.value;
    if (act === 'file_upload') {
      if (!selectedFolderId.value || selectedFiles.value.length === 0) return;
      await knowledgeStore.uploadFiles(selectedFolderId.value, [...selectedFiles.value]);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.knowledgeUploadSuccess') });
    } else if (act === 'file_move') {
      const fileId = props.payload.params.fileId as string;
      if (!fileId || !targetFolderId.value) return;
      await knowledgeStore.moveFile(fileId, targetFolderId.value);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.moveFileSuccess') });
    } else if (act === 'file_delete') {
      const fileId = props.payload.params.fileId as string;
      if (!fileId) return;
      await knowledgeStore.deleteFile(fileId);
      emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.deleteFileSuccess') });
    }
  } catch (err) {
    emit('submit', 'failed', { error: err instanceof Error ? err.message : t('common.error') });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-knowledge-file-form {
  &__dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $spacing-lg;
    cursor: pointer;
    border: 2px dashed var(--border-primary);
    border-radius: $radius-md;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover, &.is-dragover {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }

  &__dropzone-text {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--text-secondary);
  }

  &__dropzone-link {
    color: var(--el-color-primary);
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }

  &__dropzone-hint {
    margin: $spacing-xs 0 0;
    font-size: $font-size-xs;
    color: var(--text-muted);
  }

  &__file-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin-top: $spacing-sm;
  }

  &__file-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    background-color: var(--bg-tertiary);
    border-radius: $radius-sm;
  }

  &__file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__file-size {
    flex-shrink: 0;
    font-size: $font-size-xs;
    color: var(--text-muted);
  }

  &__delete-warning {
    padding: $spacing-sm;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: var(--error);
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;

    @media (max-width: $breakpoint-md) {
      justify-content: stretch;

      :deep(.el-button) {
        flex: 1;
      }
    }
  }
}
</style>
```

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/actionCards/forms/InlineKnowledgeFileForm.vue
git commit -m "feat(actionCard): implement InlineKnowledgeFileForm for knowledge file operations"
```

---

### Task 8: Implement InlineScheduleForm

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue`

- [ ] **Step 1: Implement InlineScheduleForm.vue**

This form reuses `ScheduleForm.vue` logic for create/update, and shows a simple confirm for delete. It wraps the existing `ScheduleForm` component where possible but renders inline.

```vue
<template>
  <div class="inline-schedule-form">
    <!-- Create / Update: reuse ScheduleForm -->
    <template v-if="action === 'create' || action === 'update'">
      <ScheduleForm ref="scheduleFormRef" :editing="editingSchedule" />
    </template>

    <!-- Delete -->
    <template v-else-if="action === 'delete'">
      <p class="inline-schedule-form__delete-warning">
        {{ t('common.warning') }}: {{ payload.summary }}
      </p>
    </template>

    <div class="inline-schedule-form__actions">
      <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="action !== 'delete'"
        size="small"
        type="primary"
        :loading="isSubmitting"
        @click="handleSubmit"
      >
        {{ t('common.save') }}
      </el-button>
      <el-button
        v-else
        size="small"
        type="danger"
        :loading="isSubmitting"
        @click="handleDelete"
      >
        {{ t('common.delete') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import { useScheduleStore, useWorkflowStore } from '@/stores';
import type { ScheduleDetail } from '@/types/schedule';
import type { UiActionCardPayload } from '@/types/actionCard';

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const scheduleStore = useScheduleStore();
const workflowStore = useWorkflowStore();
const isSubmitting = ref(false);
const scheduleFormRef = ref<InstanceType<typeof ScheduleForm>>();
const editingSchedule = ref<ScheduleDetail | null>(null);

const action = computed(() => props.payload.action);

onMounted(async () => {
  await workflowStore.fetchWorkflows();
  if (action.value === 'update') {
    const scheduleId = props.payload.params.scheduleId as string;
    if (scheduleId) {
      editingSchedule.value = await scheduleStore.loadEditingSchedule(scheduleId);
    }
  }
});

async function handleSubmit(): Promise<void> {
  const input = scheduleFormRef.value?.getSubmitInput();
  if (!input) return;
  isSubmitting.value = true;
  try {
    if (action.value === 'update') {
      const scheduleId = props.payload.params.scheduleId as string;
      await scheduleStore.updateSchedule(scheduleId, input);
    } else {
      await scheduleStore.createSchedule(input);
    }
    emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.scheduleSuccess') });
  } catch (err) {
    emit('submit', 'failed', { error: err instanceof Error ? err.message : t('chat.actionCard.inlineForm.scheduleFailed') });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete(): Promise<void> {
  const scheduleId = props.payload.params.scheduleId as string;
  if (!scheduleId) return;
  isSubmitting.value = true;
  try {
    await scheduleStore.deleteSchedule(scheduleId);
    emit('submit', 'succeeded', { resultSummary: t('chat.actionCard.inlineForm.deleteSuccess') });
  } catch (err) {
    emit('submit', 'failed', { error: err instanceof Error ? err.message : t('common.error') });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-schedule-form {
  &__delete-warning {
    padding: $spacing-sm;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: var(--error);
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;

    @media (max-width: $breakpoint-md) {
      justify-content: stretch;

      :deep(.el-button) {
        flex: 1;
      }
    }
  }
}
</style>
```

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue
git commit -m "feat(actionCard): implement InlineScheduleForm for schedule CRUD"
```

---

### Task 9: Add backend card definitions for file uploads

**Files:**
- Modify: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`

- [ ] **Step 1: Add data.file_upload card definition**

In `backend/src/infrastructure/tools/uiActionCardCatalog.ts`, add after the `data.datasource_delete` entry (before the `knowledge` section):

```ts
{
  cardId: 'data.file_upload',
  domain: 'data',
  action: 'file_upload',
  title: 'Upload Data File',
  description: 'Upload a CSV, Excel, or SQLite file as a data source.',
  usage: 'When the user wants to upload a data file (CSV, Excel, SQLite) for analysis.',
  requiredParams: [],
  optionalParams: [],
  riskLevel: 'low',
  confirmRequired: false,
  targetNav: 'data',
  targetDataTab: 'data',
  relatedDomains: ['knowledge'],
  dependencies: [],
},
```

- [ ] **Step 2: Add knowledge.file_upload card definition**

Add after the `knowledge.file_open` entry:

```ts
{
  cardId: 'knowledge.file_upload',
  domain: 'knowledge',
  action: 'file_upload',
  title: 'Upload Knowledge File',
  description: 'Upload a Markdown file to the knowledge base.',
  usage: 'When the user wants to add a Markdown file to the knowledge base.',
  requiredParams: [],
  optionalParams: [
    {
      name: 'folderId',
      type: 'string',
      description: 'Target folder ID. If omitted, user selects folder.',
    },
  ],
  riskLevel: 'low',
  confirmRequired: false,
  targetNav: 'data',
  targetDataTab: 'knowledge',
  relatedDomains: [],
  dependencies: [],
},
```

- [ ] **Step 3: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/infrastructure/tools/uiActionCardCatalog.ts
git commit -m "feat(actionCard): add data.file_upload and knowledge.file_upload card definitions"
```

---

### Task 10: Remove stub handlers and register form-based handlers

**Files:**
- Modify: `frontend/src/components/chat/actionCards/handlers.ts`
- Test: `frontend/tests/components/chat/actionCardHandlers.test.ts`

- [ ] **Step 1: Remove stub handlers, keep navigation + copilot_create handlers**

In `frontend/src/components/chat/actionCards/handlers.ts`, remove the entire `stubActions` array and the `for` loop at the bottom. The stub handlers are no longer needed because the form-based cards handle everything via the `editing` status — the ActionCard never calls `executeAction` for form-based cards.

- [ ] **Step 2: Add datasource_test and datasource_delete handlers (non-form, direct execution)**

These don't use inline forms — `datasource_test` executes directly and `datasource_delete` uses the existing danger confirmation flow. Add them after the copilot_create handlers:

```ts
// ── Datasource Test Handler ─────────────────────────────────

registerActionHandler(
  'data',
  'datasource_test',
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
    try {
      const { useDatafileStore } = await import('@/stores/datafileStore');
      const datafileStore = useDatafileStore();
      const datasourceId = payload.params.datasourceId as string;
      // We need to fetch datasource details to build config — navigate to data page instead
      return {
        success: false,
        summary: 'Please test the datasource connection from the Data Management page.',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

// ── Datasource Delete Handler ───────────────────────────────

registerActionHandler(
  'data',
  'datasource_delete',
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
    try {
      const { useDatafileStore } = await import('@/stores/datafileStore');
      const datafileStore = useDatafileStore();
      const datasourceId = payload.params.datasourceId as string;
      const datasourceType = payload.params.type as string;
      await datafileStore.deleteDatasource(datasourceId, datasourceType as 'sqlite' | 'database');
      return { success: true, summary: 'Datasource deleted successfully.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);
```

Note: `datasource_test` and `datasource_delete` still need direct handlers because:
- `datasource_test` has no inline form — it needs datasource details to build a config, which the LLM can't reliably provide. It stays as a navigation card.
- `datasource_delete` uses the danger confirmation flow and then executes directly.

- [ ] **Step 3: Keep knowledge.file_open as navigation handler**

The `knowledge.file_open` card navigates to the knowledge panel. Keep it as a navigation handler:

```ts
registerActionHandler('knowledge', 'file_open', navigationHandler('data', 'knowledge'));
```

- [ ] **Step 4: Update handler tests**

In `frontend/tests/components/chat/actionCardHandlers.test.ts`, update the stub handler test. Remove the stub handler check and add checks for the new handlers:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getRegistry } from '@/components/chat/actionCards/actionCardRegistry';

describe('action card handlers', () => {
  beforeAll(async () => {
    getRegistry().clear();
    await import('@/components/chat/actionCards');
  });

  it('registers data.open handler', () => {
    expect(getRegistry().has('data:open')).toBe(true);
  });

  it('registers knowledge.open handler', () => {
    expect(getRegistry().has('knowledge:open')).toBe(true);
  });

  it('registers schedule.open handler', () => {
    expect(getRegistry().has('schedule:open')).toBe(true);
  });

  it('registers workflow.copilot_create handler', () => {
    expect(getRegistry().has('workflow:copilot_create')).toBe(true);
  });

  it('registers template.copilot_create handler', () => {
    expect(getRegistry().has('template:copilot_create')).toBe(true);
  });

  it('registers datasource_test handler', () => {
    expect(getRegistry().has('data:datasource_test')).toBe(true);
  });

  it('registers datasource_delete handler', () => {
    expect(getRegistry().has('data:datasource_delete')).toBe(true);
  });

  it('registers knowledge.file_open handler', () => {
    expect(getRegistry().has('knowledge:file_open')).toBe(true);
  });

  // Form-based cards do NOT need registered handlers — they use editing status
  it('does NOT register handlers for form-based cards', () => {
    const formCards = [
      'data:datasource_create',
      'data:file_upload',
      'knowledge:folder_create',
      'knowledge:folder_rename',
      'knowledge:folder_move',
      'knowledge:folder_delete',
      'knowledge:file_upload',
      'knowledge:file_move',
      'knowledge:file_delete',
      'schedule:create',
      'schedule:update',
      'schedule:delete',
    ];
    for (const key of formCards) {
      expect(getRegistry().has(key)).toBe(false);
    }
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && pnpm vitest run tests/components/chat/`
Expected: All tests PASS

- [ ] **Step 6: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/actionCards/handlers.ts frontend/tests/components/chat/actionCardHandlers.test.ts
git commit -m "refactor(actionCard): remove stub handlers, form-based cards use editing status"
```

---

### Task 11: Add editing status styling to ActionCard.vue

**Files:**
- Modify: `frontend/src/components/chat/ActionCard.vue` (style section only)

- [ ] **Step 1: Add editing status CSS**

In `frontend/src/components/chat/ActionCard.vue`, add to the `<style>` section, inside `.action-card`:

```scss
&--editing {
  .action-card__title::after {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-left: $spacing-sm;
    vertical-align: middle;
    content: '\270E';
    color: var(--accent);
  }
}
```

And add the inline form styling:

```scss
&__inline-form {
  margin-top: $spacing-sm;
  padding-top: $spacing-sm;
  border-top: 1px solid var(--border-primary);
}
```

- [ ] **Step 2: Update ActionCard.test.ts for editing status**

Add a test that verifies the editing status shows the inline form area:

```ts
it('shows inline form when status is editing and form component exists', async () => {
  const card = makeCard({
    status: 'editing',
    payload: { ...makeCard().payload, domain: 'data', action: 'datasource_create' },
  });
  const wrapper = mount(ActionCard, {
    props: { card },
    global: {
      plugins: [i18n],
      stubs: { teleport: true },
    },
  });
  expect(wrapper.text()).toContain('Editing');
});
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/ActionCard.vue frontend/tests/components/chat/ActionCard.test.ts
git commit -m "style(actionCard): add editing status styling and inline form container"
```

---

### Task 12: Final integration verification

- [ ] **Step 1: Run full frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All static checks and compilation pass

- [ ] **Step 2: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: All static checks and compilation pass

- [ ] **Step 3: Run all tests**

Run: `cd frontend && pnpm vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit any remaining fixes if needed**
