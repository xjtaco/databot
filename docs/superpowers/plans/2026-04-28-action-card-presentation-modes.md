# Action Card Presentation Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add catalog-driven action card presentation modes so form cards open directly in chat, high-risk operations require modal confirmation, workflow/template cards confirm navigation before creating objects, and all card UI copy uses frontend i18n keys.

**Architecture:** Extend the backend action-card catalog schema with presentation, confirmation, and i18n metadata, then pass those fields through `show_ui_action_card` into frontend payloads. The frontend initializes card state from presentation metadata and centralizes button/modal behavior in `ActionCard.vue`, while existing inline form components remain responsible for form fields and API calls after confirmation is granted.

**Tech Stack:** Backend Express/TypeScript/Vitest; frontend Vue 3 + TypeScript + Pinia + Element Plus + vue-i18n + Vitest.

---

## File Map

- `backend/src/infrastructure/tools/uiActionCardTypes.ts`: add backend catalog and payload types for presentation mode, confirmation mode, and i18n keys.
- `backend/src/infrastructure/tools/uiActionCardCatalog.ts`: populate presentation and i18n metadata for every catalog entry.
- `backend/src/infrastructure/tools/showUiActionCardTool.ts`: include new metadata fields in emitted card payloads.
- `backend/src/agent/coreAgentSession.ts`: update operation-card prompt rules for inline forms and deferred navigation confirmation.
- `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`: verify emitted card payload includes metadata.
- `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`: add catalog coverage assertions.
- `backend/tests/agent/corePrompt-action-cards.test.ts`: verify prompt mentions inline forms and deferred navigation confirmation.
- `frontend/src/types/actionCard.ts`: mirror new payload fields.
- `frontend/src/stores/chatStore.ts`: initialize action card status from `presentationMode`.
- `frontend/src/components/chat/ActionCard.vue`: render localized title/summary/actions, route presentation modes, and own modal confirmations.
- `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFolderForm.vue`: support modal-approved submit for delete.
- `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFileForm.vue`: support modal-approved submit for delete.
- `frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue`: support modal-approved submit for delete.
- `frontend/src/locales/zh-CN.ts`: add localized action-card catalog strings and modal strings.
- `frontend/src/locales/en-US.ts`: add matching English strings.
- `frontend/tests/stores/chatStore-action-cards.test.ts`: verify initial statuses.
- `frontend/tests/components/chat/ActionCard.test.ts`: verify presentation modes, i18n rendering, and modal gating.
- `frontend/tests/components/chat/actionCardHandlers.test.ts`: update expectations for form-backed direct handlers if presentation behavior changes handler registration assumptions.

---

### Task 1: Backend Action Card Metadata Types

**Files:**
- Modify: `backend/src/infrastructure/tools/uiActionCardTypes.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`

- [ ] **Step 1: Write the failing payload metadata test**

Add this test to `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts` near the existing valid-card tests:

```ts
it('includes presentation and i18n metadata in cardPayload', async () => {
  const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
  const result = await tool.execute({ cardId: 'workflow.copilot_create' });

  expect(result.success).toBe(true);
  const payload = result.metadata?.cardPayload as {
    presentationMode?: string;
    confirmationMode?: string;
    titleKey?: string;
    summaryKey?: string;
    actionLabelKey?: string;
    confirmTitleKey?: string;
    confirmMessageKey?: string;
  };
  expect(payload.presentationMode).toBe('deferred_navigation_action');
  expect(payload.confirmationMode).toBe('modal');
  expect(payload.titleKey).toBe('chat.actionCards.workflowCopilotCreate.title');
  expect(payload.summaryKey).toBe('chat.actionCards.workflowCopilotCreate.summary');
  expect(payload.actionLabelKey).toBe('chat.actionCards.workflowCopilotCreate.action');
  expect(payload.confirmTitleKey).toBe(
    'chat.actionCards.workflowCopilotCreate.confirmTitle'
  );
  expect(payload.confirmMessageKey).toBe(
    'chat.actionCards.workflowCopilotCreate.confirmMessage'
  );
});
```

- [ ] **Step 2: Run the backend test and verify it fails**

Run:

```bash
cd backend && pnpm vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: FAIL because `presentationMode`, `confirmationMode`, and i18n key fields are missing from `cardPayload`.

- [ ] **Step 3: Add backend types**

In `backend/src/infrastructure/tools/uiActionCardTypes.ts`, add:

```ts
export type ActionCardPresentationMode = 'inline_form' | 'button' | 'deferred_navigation_action';
export type ActionCardConfirmationMode = 'none' | 'modal' | 'danger_text';
```

Extend `UiActionCardDefinition`:

```ts
  presentationMode: ActionCardPresentationMode;
  confirmationMode: ActionCardConfirmationMode;
  titleKey: string;
  summaryKey: string;
  actionLabelKey?: string;
  confirmTitleKey?: string;
  confirmMessageKey?: string;
```

Extend `UiActionCardPayload` with the same fields:

```ts
  presentationMode?: ActionCardPresentationMode;
  confirmationMode?: ActionCardConfirmationMode;
  titleKey?: string;
  summaryKey?: string;
  actionLabelKey?: string;
  confirmTitleKey?: string;
  confirmMessageKey?: string;
```

Use optional payload fields for compatibility with historical card payloads.

- [ ] **Step 4: Run typecheck and verify catalog errors appear**

Run:

```bash
cd backend && pnpm run typecheck
```

Expected: FAIL in `uiActionCardCatalog.ts` because existing catalog entries do not yet provide required metadata fields.

- [ ] **Step 5: Commit**

Do not commit yet if typecheck is failing. Continue to Task 2.

---

### Task 2: Backend Catalog Metadata and Prompt

**Files:**
- Modify: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- Modify: `backend/src/infrastructure/tools/showUiActionCardTool.ts`
- Modify: `backend/src/agent/coreAgentSession.ts`
- Test: `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`
- Test: `backend/tests/agent/corePrompt-action-cards.test.ts`

- [ ] **Step 1: Add catalog coverage test**

Add this test to `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`:

```ts
it('all returned catalog cards include presentation and i18n metadata', async () => {
  const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
  const result = await tool.execute({ query: '.*', queryMode: 'regex' });

  expect(result.success).toBe(true);
  const cards = result.data as Array<{
    cardId: string;
    presentationMode?: string;
    confirmationMode?: string;
    titleKey?: string;
    summaryKey?: string;
  }>;
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    expect(card.presentationMode, card.cardId).toMatch(
      /^(inline_form|button|deferred_navigation_action)$/
    );
    expect(card.confirmationMode, card.cardId).toMatch(/^(none|modal|danger_text)$/);
    expect(card.titleKey, card.cardId).toMatch(/^chat\.actionCards\./);
    expect(card.summaryKey, card.cardId).toMatch(/^chat\.actionCards\./);
  }
});
```

Add this test to `backend/tests/agent/corePrompt-action-cards.test.ts`:

```ts
it('describes inline forms and deferred navigation confirmation', () => {
  expect(corePrompt).toContain('inline');
  expect(corePrompt).toContain('navigation');
  expect(corePrompt).toContain('confirm');
  expect(corePrompt).toContain('Workflow/template');
});
```

- [ ] **Step 2: Run tests and verify failures**

Run:

```bash
cd backend && pnpm vitest run \
  tests/infrastructure/tools/searchUiActionCardTool.test.ts \
  tests/infrastructure/tools/showUiActionCardTool.test.ts \
  tests/agent/corePrompt-action-cards.test.ts
```

Expected: FAIL because catalog metadata is missing and the prompt lacks the new wording.

- [ ] **Step 3: Populate catalog metadata**

In `backend/src/infrastructure/tools/uiActionCardCatalog.ts`, add these fields to each catalog entry. Use this mapping:

```ts
// data.open
presentationMode: 'button',
confirmationMode: 'none',
titleKey: 'chat.actionCards.dataOpen.title',
summaryKey: 'chat.actionCards.dataOpen.summary',
actionLabelKey: 'chat.actionCards.dataOpen.action',

// data.datasource_create
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.dataDatasourceCreate.title',
summaryKey: 'chat.actionCards.dataDatasourceCreate.summary',

// data.datasource_test
presentationMode: 'button',
confirmationMode: 'none',
titleKey: 'chat.actionCards.dataDatasourceTest.title',
summaryKey: 'chat.actionCards.dataDatasourceTest.summary',
actionLabelKey: 'chat.actionCards.dataDatasourceTest.action',

// data.datasource_delete
presentationMode: 'inline_form',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.dataDatasourceDelete.title',
summaryKey: 'chat.actionCards.dataDatasourceDelete.summary',
actionLabelKey: 'chat.actionCards.dataDatasourceDelete.action',
confirmTitleKey: 'chat.actionCards.dataDatasourceDelete.confirmTitle',
confirmMessageKey: 'chat.actionCards.dataDatasourceDelete.confirmMessage',

// data.file_upload
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.dataFileUpload.title',
summaryKey: 'chat.actionCards.dataFileUpload.summary',

// knowledge.open
presentationMode: 'button',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeOpen.title',
summaryKey: 'chat.actionCards.knowledgeOpen.summary',
actionLabelKey: 'chat.actionCards.knowledgeOpen.action',

// knowledge.folder_create
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFolderCreate.title',
summaryKey: 'chat.actionCards.knowledgeFolderCreate.summary',

// knowledge.folder_rename
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFolderRename.title',
summaryKey: 'chat.actionCards.knowledgeFolderRename.summary',

// knowledge.folder_move
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFolderMove.title',
summaryKey: 'chat.actionCards.knowledgeFolderMove.summary',

// knowledge.folder_delete
presentationMode: 'inline_form',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.knowledgeFolderDelete.title',
summaryKey: 'chat.actionCards.knowledgeFolderDelete.summary',
actionLabelKey: 'chat.actionCards.knowledgeFolderDelete.action',
confirmTitleKey: 'chat.actionCards.knowledgeFolderDelete.confirmTitle',
confirmMessageKey: 'chat.actionCards.knowledgeFolderDelete.confirmMessage',

// knowledge.file_open
presentationMode: 'button',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFileOpen.title',
summaryKey: 'chat.actionCards.knowledgeFileOpen.summary',
actionLabelKey: 'chat.actionCards.knowledgeFileOpen.action',

// knowledge.file_upload
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFileUpload.title',
summaryKey: 'chat.actionCards.knowledgeFileUpload.summary',

// knowledge.file_move
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.knowledgeFileMove.title',
summaryKey: 'chat.actionCards.knowledgeFileMove.summary',

// knowledge.file_delete
presentationMode: 'inline_form',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.knowledgeFileDelete.title',
summaryKey: 'chat.actionCards.knowledgeFileDelete.summary',
actionLabelKey: 'chat.actionCards.knowledgeFileDelete.action',
confirmTitleKey: 'chat.actionCards.knowledgeFileDelete.confirmTitle',
confirmMessageKey: 'chat.actionCards.knowledgeFileDelete.confirmMessage',

// schedule.open
presentationMode: 'button',
confirmationMode: 'none',
titleKey: 'chat.actionCards.scheduleOpen.title',
summaryKey: 'chat.actionCards.scheduleOpen.summary',
actionLabelKey: 'chat.actionCards.scheduleOpen.action',

// schedule.create
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.scheduleCreate.title',
summaryKey: 'chat.actionCards.scheduleCreate.summary',

// schedule.update
presentationMode: 'inline_form',
confirmationMode: 'none',
titleKey: 'chat.actionCards.scheduleUpdate.title',
summaryKey: 'chat.actionCards.scheduleUpdate.summary',

// schedule.delete
presentationMode: 'inline_form',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.scheduleDelete.title',
summaryKey: 'chat.actionCards.scheduleDelete.summary',
actionLabelKey: 'chat.actionCards.scheduleDelete.action',
confirmTitleKey: 'chat.actionCards.scheduleDelete.confirmTitle',
confirmMessageKey: 'chat.actionCards.scheduleDelete.confirmMessage',

// workflow.copilot_create
presentationMode: 'deferred_navigation_action',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.workflowCopilotCreate.title',
summaryKey: 'chat.actionCards.workflowCopilotCreate.summary',
actionLabelKey: 'chat.actionCards.workflowCopilotCreate.action',
confirmTitleKey: 'chat.actionCards.workflowCopilotCreate.confirmTitle',
confirmMessageKey: 'chat.actionCards.workflowCopilotCreate.confirmMessage',

// template.copilot_create
presentationMode: 'deferred_navigation_action',
confirmationMode: 'modal',
titleKey: 'chat.actionCards.templateCopilotCreate.title',
summaryKey: 'chat.actionCards.templateCopilotCreate.summary',
actionLabelKey: 'chat.actionCards.templateCopilotCreate.action',
confirmTitleKey: 'chat.actionCards.templateCopilotCreate.confirmTitle',
confirmMessageKey: 'chat.actionCards.templateCopilotCreate.confirmMessage',
```

- [ ] **Step 4: Pass metadata through `show_ui_action_card`**

In `backend/src/infrastructure/tools/showUiActionCardTool.ts`, add these fields when building `payload`:

```ts
      presentationMode: definition.presentationMode,
      confirmationMode: definition.confirmationMode,
      titleKey: definition.titleKey,
      summaryKey: definition.summaryKey,
      actionLabelKey: definition.actionLabelKey,
      confirmTitleKey: definition.confirmTitleKey,
      confirmMessageKey: definition.confirmMessageKey,
```

- [ ] **Step 5: Update CoreAgent prompt**

In `backend/src/agent/coreAgentSession.ts`, update the Operation Cards section with these bullet rules:

```md
8. For inline form cards, show the card so the frontend can collect or confirm details directly in chat. Do not ask the user to confirm in prose first.
9. Workflow/template cards are deferred navigation actions. The frontend must ask the user to confirm leaving the CoreAgent chat before creating the object and navigating.
10. Do not write button labels or modal text in normal responses; the frontend renders localized card text from its i18n catalog.
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd backend && pnpm vitest run \
  tests/infrastructure/tools/searchUiActionCardTool.test.ts \
  tests/infrastructure/tools/showUiActionCardTool.test.ts \
  tests/agent/corePrompt-action-cards.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/infrastructure/tools/uiActionCardTypes.ts \
  backend/src/infrastructure/tools/uiActionCardCatalog.ts \
  backend/src/infrastructure/tools/showUiActionCardTool.ts \
  backend/src/agent/coreAgentSession.ts \
  backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts \
  backend/tests/infrastructure/tools/showUiActionCardTool.test.ts \
  backend/tests/agent/corePrompt-action-cards.test.ts
git commit -m "feat(action-card): add presentation metadata"
```

---

### Task 3: Frontend Types, Store Initial State, and Locale Keys

**Files:**
- Modify: `frontend/src/types/actionCard.ts`
- Modify: `frontend/src/stores/chatStore.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Test: `frontend/tests/stores/chatStore-action-cards.test.ts`

- [ ] **Step 1: Write failing store tests**

Add these tests to `frontend/tests/stores/chatStore-action-cards.test.ts`:

```ts
it('initializes inline form cards as editing', () => {
  const store = useChatStore();
  store.addAssistantMessage('Card:');
  store.addActionCard(
    makePayload({
      cardId: 'knowledge.folder_create',
      domain: 'knowledge',
      action: 'folder_create',
      presentationMode: 'inline_form',
      confirmationMode: 'none',
    })
  );
  const msg = store.messages[store.messages.length - 1];
  expect(msg.actionCards![0].status).toBe('editing');
});

it('keeps deferred navigation cards proposed', () => {
  const store = useChatStore();
  store.addAssistantMessage('Card:');
  store.addActionCard(
    makePayload({
      cardId: 'workflow.copilot_create',
      domain: 'workflow',
      action: 'copilot_create',
      presentationMode: 'deferred_navigation_action',
      confirmationMode: 'modal',
    })
  );
  const msg = store.messages[store.messages.length - 1];
  expect(msg.actionCards![0].status).toBe('proposed');
});
```

- [ ] **Step 2: Run frontend store test and verify failure**

Run:

```bash
cd frontend && pnpm vitest run tests/stores/chatStore-action-cards.test.ts
```

Expected: FAIL because frontend payload types and initialization logic do not exist yet.

- [ ] **Step 3: Add frontend payload types**

In `frontend/src/types/actionCard.ts`, add:

```ts
export type ActionCardPresentationMode = 'inline_form' | 'button' | 'deferred_navigation_action';
export type ActionCardConfirmationMode = 'none' | 'modal' | 'danger_text';
```

Extend `UiActionCardPayload`:

```ts
  presentationMode?: ActionCardPresentationMode;
  confirmationMode?: ActionCardConfirmationMode;
  titleKey?: string;
  summaryKey?: string;
  actionLabelKey?: string;
  confirmTitleKey?: string;
  confirmMessageKey?: string;
```

- [ ] **Step 4: Initialize card status from presentation mode**

In `frontend/src/stores/chatStore.ts`, add helper near `addActionCard`:

```ts
  function getInitialActionCardStatus(payload: UiActionCardPayload): CardStatus {
    if (payload.presentationMode === 'inline_form') return 'editing';
    return 'proposed';
  }
```

Update `addActionCard`:

```ts
    const card: ChatActionCard = {
      id: payload.id,
      payload,
      status: getInitialActionCardStatus(payload),
    };
```

- [ ] **Step 5: Add locale keys**

In both `frontend/src/locales/zh-CN.ts` and `frontend/src/locales/en-US.ts`, add `chat.actionCards`. The Chinese keys:

```ts
    actionCards: {
      generic: {
        confirmTitle: '确认操作',
        confirmMessage: '确认后将执行此操作。',
        navigationConfirmTitle: '离开聊天窗口？',
        navigationConfirmMessage: '确认后将进入对应编辑器，当前 CoreAgent 聊天会保留在历史记录中。',
      },
      dataOpen: { title: '打开数据管理', summary: '进入数据管理页面。', action: '打开数据管理' },
      dataDatasourceCreate: { title: '创建数据源', summary: '在聊天中填写连接信息并创建数据源。' },
      dataDatasourceTest: { title: '测试数据源连接', summary: '进入数据管理页测试连接。', action: '测试连接' },
      dataDatasourceDelete: {
        title: '删除数据源',
        summary: '删除一个已有数据源。',
        action: '删除数据源',
        confirmTitle: '确认删除数据源',
        confirmMessage: '此操作会删除数据源及保存的连接信息，确认继续？',
      },
      dataFileUpload: { title: '上传数据文件', summary: '上传 CSV、Excel 或 SQLite 文件作为数据源。' },
      knowledgeOpen: { title: '打开知识库', summary: '进入知识库管理页面。', action: '打开知识库' },
      knowledgeFolderCreate: { title: '创建知识库文件夹', summary: '在知识库中创建新文件夹。' },
      knowledgeFolderRename: { title: '重命名知识库文件夹', summary: '修改已有知识库文件夹名称。' },
      knowledgeFolderMove: { title: '移动知识库文件夹', summary: '将文件夹移动到新的父级位置。' },
      knowledgeFolderDelete: {
        title: '删除知识库文件夹',
        summary: '删除文件夹及其内容。',
        action: '删除文件夹',
        confirmTitle: '确认删除文件夹',
        confirmMessage: '此操作会删除文件夹及其中内容，确认继续？',
      },
      knowledgeFileOpen: { title: '打开知识库文件', summary: '查看知识库文件内容。', action: '打开文件' },
      knowledgeFileUpload: { title: '上传知识库文件', summary: '上传 Markdown 文件到知识库。' },
      knowledgeFileMove: { title: '移动知识库文件', summary: '将知识库文件移动到其他文件夹。' },
      knowledgeFileDelete: {
        title: '删除知识库文件',
        summary: '删除一个知识库文件。',
        action: '删除文件',
        confirmTitle: '确认删除文件',
        confirmMessage: '此操作会永久删除该知识库文件，确认继续？',
      },
      scheduleOpen: { title: '打开定时任务', summary: '进入定时任务管理页面。', action: '打开定时任务' },
      scheduleCreate: { title: '创建定时任务', summary: '在聊天中配置并创建定时任务。' },
      scheduleUpdate: { title: '更新定时任务', summary: '修改已有定时任务。' },
      scheduleDelete: {
        title: '删除定时任务',
        summary: '删除一个已有定时任务。',
        action: '删除定时任务',
        confirmTitle: '确认删除定时任务',
        confirmMessage: '此操作会停止并删除该定时任务，确认继续？',
      },
      workflowCopilotCreate: {
        title: '创建工作流',
        summary: '进入工作流编辑器并使用 Copilot 创建工作流。',
        action: '进入工作流编辑器',
        confirmTitle: '离开聊天并创建工作流？',
        confirmMessage: '确认后将创建工作流并进入工作流编辑器。',
      },
      templateCopilotCreate: {
        title: '创建节点模板',
        summary: '进入模板编辑器并使用 Copilot 创建节点模板。',
        action: '进入模板编辑器',
        confirmTitle: '离开聊天并创建节点模板？',
        confirmMessage: '确认后将创建节点模板并进入模板编辑器。',
      },
    },
```

Add the equivalent English text to `en-US.ts` with the same object shape:

```ts
    actionCards: {
      generic: {
        confirmTitle: 'Confirm Action',
        confirmMessage: 'The action will run after confirmation.',
        navigationConfirmTitle: 'Leave chat?',
        navigationConfirmMessage: 'You will enter the related editor. The CoreAgent chat remains in history.',
      },
      dataOpen: { title: 'Open Data Management', summary: 'Go to the data management page.', action: 'Open Data Management' },
      dataDatasourceCreate: { title: 'Create Datasource', summary: 'Fill connection details in chat and create a datasource.' },
      dataDatasourceTest: { title: 'Test Datasource Connection', summary: 'Go to data management to test the connection.', action: 'Test Connection' },
      dataDatasourceDelete: {
        title: 'Delete Datasource',
        summary: 'Delete an existing datasource.',
        action: 'Delete Datasource',
        confirmTitle: 'Delete datasource?',
        confirmMessage: 'This removes the datasource and saved connection details. Continue?',
      },
      dataFileUpload: { title: 'Upload Data File', summary: 'Upload a CSV, Excel, or SQLite file as a datasource.' },
      knowledgeOpen: { title: 'Open Knowledge Base', summary: 'Go to knowledge base management.', action: 'Open Knowledge Base' },
      knowledgeFolderCreate: { title: 'Create Knowledge Folder', summary: 'Create a folder in the knowledge base.' },
      knowledgeFolderRename: { title: 'Rename Knowledge Folder', summary: 'Rename an existing knowledge folder.' },
      knowledgeFolderMove: { title: 'Move Knowledge Folder', summary: 'Move a folder to a new parent location.' },
      knowledgeFolderDelete: {
        title: 'Delete Knowledge Folder',
        summary: 'Delete a folder and its contents.',
        action: 'Delete Folder',
        confirmTitle: 'Delete folder?',
        confirmMessage: 'This removes the folder and its contents. Continue?',
      },
      knowledgeFileOpen: { title: 'Open Knowledge File', summary: 'View knowledge file content.', action: 'Open File' },
      knowledgeFileUpload: { title: 'Upload Knowledge File', summary: 'Upload Markdown files to the knowledge base.' },
      knowledgeFileMove: { title: 'Move Knowledge File', summary: 'Move a knowledge file to another folder.' },
      knowledgeFileDelete: {
        title: 'Delete Knowledge File',
        summary: 'Delete a knowledge file.',
        action: 'Delete File',
        confirmTitle: 'Delete file?',
        confirmMessage: 'This permanently deletes the knowledge file. Continue?',
      },
      scheduleOpen: { title: 'Open Scheduled Tasks', summary: 'Go to scheduled task management.', action: 'Open Scheduled Tasks' },
      scheduleCreate: { title: 'Create Scheduled Task', summary: 'Configure and create a scheduled task in chat.' },
      scheduleUpdate: { title: 'Update Scheduled Task', summary: 'Modify an existing scheduled task.' },
      scheduleDelete: {
        title: 'Delete Scheduled Task',
        summary: 'Delete an existing scheduled task.',
        action: 'Delete Scheduled Task',
        confirmTitle: 'Delete scheduled task?',
        confirmMessage: 'This stops and deletes the scheduled task. Continue?',
      },
      workflowCopilotCreate: {
        title: 'Create Workflow',
        summary: 'Enter the workflow editor and use Copilot to create a workflow.',
        action: 'Open Workflow Editor',
        confirmTitle: 'Leave chat and create workflow?',
        confirmMessage: 'After confirmation, a workflow will be created and the editor will open.',
      },
      templateCopilotCreate: {
        title: 'Create Node Template',
        summary: 'Enter the template editor and use Copilot to create a node template.',
        action: 'Open Template Editor',
        confirmTitle: 'Leave chat and create node template?',
        confirmMessage: 'After confirmation, a node template will be created and the editor will open.',
      },
    },
```

- [ ] **Step 6: Run store test**

Run:

```bash
cd frontend && pnpm vitest run tests/stores/chatStore-action-cards.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/actionCard.ts \
  frontend/src/stores/chatStore.ts \
  frontend/src/locales/zh-CN.ts \
  frontend/src/locales/en-US.ts \
  frontend/tests/stores/chatStore-action-cards.test.ts
git commit -m "feat(action-card): initialize presentation modes"
```

---

### Task 4: Localized ActionCard Rendering and Deferred Navigation Modal

**Files:**
- Modify: `frontend/src/components/chat/ActionCard.vue`
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Write failing i18n and deferred navigation tests**

Add tests to `frontend/tests/components/chat/ActionCard.test.ts`:

```ts
it('renders title and summary from i18n keys when present', () => {
  const card = makeCard({
    payload: {
      ...makeCard().payload,
      title: 'Fallback title',
      summary: 'Fallback summary',
      titleKey: 'chat.actionCards.workflowCopilotCreate.title',
      summaryKey: 'chat.actionCards.workflowCopilotCreate.summary',
      actionLabelKey: 'chat.actionCards.workflowCopilotCreate.action',
      presentationMode: 'deferred_navigation_action',
      confirmationMode: 'modal',
    },
  });
  const wrapper = mount(ActionCard, {
    props: { card },
    global: { plugins: [i18n], stubs: { teleport: true } },
  });

  expect(wrapper.text()).toContain('Create Workflow');
  expect(wrapper.text()).toContain('Enter the workflow editor');
  expect(wrapper.text()).toContain('Open Workflow Editor');
  expect(wrapper.text()).not.toContain('Fallback title');
});

it('opens navigation confirmation before executing deferred navigation action', async () => {
  const card = makeCard({
    payload: {
      ...makeCard().payload,
      domain: 'workflow',
      action: 'copilot_create',
      presentationMode: 'deferred_navigation_action',
      confirmationMode: 'modal',
      actionLabelKey: 'chat.actionCards.workflowCopilotCreate.action',
      confirmTitleKey: 'chat.actionCards.workflowCopilotCreate.confirmTitle',
      confirmMessageKey: 'chat.actionCards.workflowCopilotCreate.confirmMessage',
    },
  });
  const wrapper = mount(ActionCard, {
    props: { card },
    global: {
      plugins: [i18n],
      stubs: {
        teleport: true,
        ConfirmDialog: {
          props: ['visible', 'title', 'message'],
          emits: ['confirm', 'cancel', 'update:visible'],
          template:
            '<div v-if="visible" class="confirm-dialog-stub"><span>{{ title }}</span><button class="confirm" @click="$emit(\\'confirm\\')">confirm</button><button class="cancel" @click="$emit(\\'cancel\\')">cancel</button></div>',
        },
      },
    },
  });

  await wrapper.find('button').trigger('click');
  expect(wrapper.text()).toContain('Leave chat and create workflow?');
  expect(wrapper.emitted('statusChange')).toBeFalsy();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts
```

Expected: FAIL because ActionCard still renders `payload.title`, `payload.summary`, and the generic confirm button behavior.

- [ ] **Step 3: Add localized computed labels**

In `frontend/src/components/chat/ActionCard.vue`, add helper:

```ts
function translateOptional(key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
```

Add computed values:

```ts
const cardTitle = computed(() => translateOptional(props.card.payload.titleKey, props.card.payload.title));
const cardSummary = computed(() =>
  translateOptional(props.card.payload.summaryKey, props.card.payload.summary)
);
const actionLabel = computed(() =>
  translateOptional(props.card.payload.actionLabelKey, t('chat.actionCard.confirm'))
);
const confirmTitle = computed(() =>
  translateOptional(props.card.payload.confirmTitleKey, t('chat.actionCards.generic.confirmTitle'))
);
const confirmMessage = computed(() =>
  translateOptional(
    props.card.payload.confirmMessageKey,
    props.card.payload.presentationMode === 'deferred_navigation_action'
      ? t('chat.actionCards.generic.navigationConfirmMessage')
      : t('chat.actionCards.generic.confirmMessage')
  )
);
```

Update template title and summary:

```vue
<div class="action-card__title">{{ cardTitle }}</div>
<div class="action-card__summary">{{ cardSummary }}</div>
```

Update generic button:

```vue
{{ actionLabel }}
```

- [ ] **Step 4: Add modal state and deferred navigation gating**

Import existing dialog:

```ts
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
```

Add refs:

```ts
const confirmDialogVisible = ref(false);
const pendingExecution = ref<(() => Promise<void>) | null>(null);
```

Add helpers:

```ts
function needsModalConfirmation(): boolean {
  return props.card.payload.confirmationMode === 'modal';
}

async function runWithOptionalModal(action: () => Promise<void>): Promise<void> {
  if (needsModalConfirmation()) {
    pendingExecution.value = action;
    confirmDialogVisible.value = true;
    return;
  }
  await action();
}

async function handleModalConfirm(): Promise<void> {
  const action = pendingExecution.value;
  pendingExecution.value = null;
  confirmDialogVisible.value = false;
  if (action) {
    await action();
  }
}

function handleModalCancel(): void {
  pendingExecution.value = null;
  confirmDialogVisible.value = false;
}
```

Move the current direct execution body of `handleConfirm()` into:

```ts
async function executeCurrentAction(): Promise<void> {
  emit('statusChange', props.card.id, 'running');
  try {
    const result = await executeAction(props.card.payload, {
      setStatus: (status) => emit('statusChange', props.card.id, status),
      setResult: (summary) =>
        emit('statusChange', props.card.id, 'succeeded', { resultSummary: summary }),
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

Update `handleConfirm()`:

```ts
async function handleConfirm(): Promise<void> {
  if (props.card.payload.riskLevel === 'danger' && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'confirming');
    return;
  }

  if (formComponent.value && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'editing');
    return;
  }

  await runWithOptionalModal(executeCurrentAction);
}
```

Add dialog to template:

```vue
<ConfirmDialog
  v-model:visible="confirmDialogVisible"
  :title="confirmTitle"
  :message="confirmMessage"
  :type="card.payload.riskLevel === 'danger' || card.payload.riskLevel === 'high' ? 'danger' : 'warning'"
  @confirm="handleModalConfirm"
  @cancel="handleModalCancel"
/>
```

- [ ] **Step 5: Run ActionCard tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/ActionCard.vue frontend/tests/components/chat/ActionCard.test.ts
git commit -m "feat(action-card): render localized presentation actions"
```

---

### Task 5: Modal Confirmation for Inline Destructive Forms

**Files:**
- Modify: `frontend/src/components/chat/ActionCard.vue`
- Modify: `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFolderForm.vue`
- Modify: `frontend/src/components/chat/actionCards/forms/InlineKnowledgeFileForm.vue`
- Modify: `frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue`
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Write failing modal-gating test for inline forms**

In `frontend/tests/components/chat/ActionCard.test.ts`, add a stubbed inline form test:

```ts
it('gates inline destructive form submit behind modal confirmation', async () => {
  const card = makeCard({
    status: 'editing',
    payload: {
      ...makeCard().payload,
      domain: 'knowledge',
      action: 'folder_delete',
      presentationMode: 'inline_form',
      confirmationMode: 'modal',
      confirmTitleKey: 'chat.actionCards.knowledgeFolderDelete.confirmTitle',
      confirmMessageKey: 'chat.actionCards.knowledgeFolderDelete.confirmMessage',
    },
  });
  const wrapper = mount(ActionCard, {
    props: { card },
    global: {
      plugins: [i18n],
      stubs: {
        teleport: true,
        InlineKnowledgeFolderForm: {
          emits: ['request-confirmed-submit'],
          template:
            '<button class="delete-form-submit" @click="$emit(\\'request-confirmed-submit\\', async () => {})">delete</button>',
        },
        ConfirmDialog: {
          props: ['visible', 'title'],
          emits: ['confirm', 'cancel', 'update:visible'],
          template:
            '<div v-if="visible" class="confirm-dialog-stub"><span>{{ title }}</span><button class="confirm" @click="$emit(\\'confirm\\')">confirm</button></div>',
        },
      },
    },
  });

  await wrapper.find('.delete-form-submit').trigger('click');
  expect(wrapper.text()).toContain('Delete folder?');
  expect(wrapper.emitted('statusChange')).toBeFalsy();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts
```

Expected: FAIL because `ActionCard.vue` does not listen for `request-confirmed-submit`.

- [ ] **Step 3: Add form execution request event**

In `ActionCard.vue`, update dynamic form component listeners:

```vue
<component
  :is="formComponent"
  v-if="card.status === 'editing' && formComponent"
  :payload="card.payload"
  class="action-card__inline-form"
  @submit="handleFormSubmit"
  @cancel="handleFormCancel"
  @request-confirmed-submit="handleConfirmedFormSubmit"
/>
```

Add handler:

```ts
async function handleConfirmedFormSubmit(action: () => Promise<void>): Promise<void> {
  await runWithOptionalModal(action);
}
```

- [ ] **Step 4: Update destructive form components**

In each destructive form component, change delete buttons to request confirmation before API execution.

`InlineKnowledgeFolderForm.vue`:

```ts
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
  requestConfirmedSubmit: [action: () => Promise<void>];
}>();

function requestDelete(): void {
  emit('requestConfirmedSubmit', handleDelete);
}
```

Change delete button:

```vue
@click="requestDelete"
```

`InlineKnowledgeFileForm.vue`:

```ts
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
  requestConfirmedSubmit: [action: () => Promise<void>];
}>();

function requestDelete(): void {
  emit('requestConfirmedSubmit', handleDelete);
}
```

Change delete button:

```vue
@click="requestDelete"
```

`InlineScheduleForm.vue`:

```ts
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
  requestConfirmedSubmit: [action: () => Promise<void>];
}>();

function requestDelete(): void {
  emit('requestConfirmedSubmit', handleDelete);
}
```

Change delete button:

```vue
@click="requestDelete"
```

Keep non-destructive create/update submit behavior unchanged.

- [ ] **Step 5: Run ActionCard tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ActionCard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/ActionCard.vue \
  frontend/src/components/chat/actionCards/forms/InlineKnowledgeFolderForm.vue \
  frontend/src/components/chat/actionCards/forms/InlineKnowledgeFileForm.vue \
  frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue \
  frontend/tests/components/chat/ActionCard.test.ts
git commit -m "feat(action-card): confirm destructive inline actions"
```

---

### Task 6: Handler Expectations and End-to-End Verification

**Files:**
- Modify: `frontend/tests/components/chat/actionCardHandlers.test.ts`
- Test: frontend and backend preflight

- [ ] **Step 1: Update handler registration expectations**

Review `frontend/tests/components/chat/actionCardHandlers.test.ts`. If form-backed cards are still executed entirely inside inline forms, keep this existing expectation:

```ts
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
```

If implementation moves any form-backed action into the central handler registry, replace only the relevant entry in this test with an explicit positive assertion. Do not loosen this test to simply check “some handlers exist.”

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
cd frontend && pnpm vitest run \
  tests/stores/chatStore-action-cards.test.ts \
  tests/components/chat/ActionCard.test.ts \
  tests/components/chat/actionCardHandlers.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted backend tests**

Run:

```bash
cd backend && pnpm vitest run \
  tests/infrastructure/tools/searchUiActionCardTool.test.ts \
  tests/infrastructure/tools/showUiActionCardTool.test.ts \
  tests/agent/corePrompt-action-cards.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend preflight**

Run:

```bash
cd frontend && pnpm run preflight
```

Expected: PASS with ESLint, Stylelint, TypeScript, Prettier, build, and tests completing.

- [ ] **Step 5: Run backend preflight**

Run:

```bash
cd backend && pnpm run preflight
```

Expected: PASS with lint, format, typecheck, build, and tests completing.

- [ ] **Step 6: Commit final verification adjustments**

If Task 6 modified tests or small compatibility code, commit:

```bash
git add frontend/tests/components/chat/actionCardHandlers.test.ts
git commit -m "test(action-card): verify presentation mode behavior"
```

If Task 6 made no file changes, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Direct inline forms are covered by Task 3 and Task 4.
  - Modal confirmation for high-risk operations is covered by Task 4 and Task 5.
  - Deferred workflow/template navigation is covered by Task 2 and Task 4.
  - i18n keys and frontend locale rendering are covered by Task 2, Task 3, and Task 4.
  - Persistence compatibility is covered by optional payload fields and fallback rules in Task 1 and Task 3.
- Placeholder scan: no placeholder markers or open-ended “write tests” steps remain.
- Type consistency: backend and frontend both use `presentationMode`, `confirmationMode`, `titleKey`, `summaryKey`, `actionLabelKey`, `confirmTitleKey`, and `confirmMessageKey`.
