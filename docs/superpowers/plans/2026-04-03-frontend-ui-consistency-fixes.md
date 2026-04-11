# Frontend UI/UX Consistency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix UI/UX inconsistencies across desktop and mobile including broken hover interactions, undersized touch targets, missing safe area support, inconsistent bottom sheets, duplicated components, hardcoded values, and naming inconsistencies.

**Architecture:** Incremental fixes across existing components and styles. No new architecture — just correcting inconsistencies and ensuring mobile-first patterns work correctly.

**Tech Stack:** Vue 3, SCSS, Element Plus, Lucide Icons

---

### Task 1: Fix mobile hover-dependent interactions (P0)

**Files:**
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue:181-196` (delete button styles)
- Modify: `frontend/src/components/chat/ChatListDrawer.vue:170-194` (delete button styles)
- Modify: `frontend/src/components/chat/ChatMessage.vue:126-233` (action button styles)
- Modify: `frontend/src/styles/_chat-list.scss` (shared chat list item styles)

**Problem:** Delete buttons and message action buttons use `opacity: 0` + `:hover` to reveal. On touch devices, hover doesn't exist, so these buttons are invisible and unreachable. ChatListBottomSheet is a mobile-only component but still uses hover reveal.

- [ ] **Step 1: ChatListBottomSheet — always show delete button**

In `ChatListBottomSheet.vue`, the delete button should always be visible on this mobile-only component. Change the `.chat-list-item__delete-btn` styles to always be visible with muted color:

```scss
.chat-list-item__delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: $text-muted;
  cursor: pointer;
  padding: 6px;
  border-radius: $radius-sm;
  transition: color $transition-fast, background-color $transition-fast;

  &:active {
    color: $error;
    background: $bg-elevated;
  }
}
```

- [ ] **Step 2: ChatListDrawer — keep hover for desktop, add always-visible for mobile**

In `ChatListDrawer.vue`, keep the existing hover behavior but add a fallback. Since this component is only used on desktop (via `v-if="isDesktop"` in ChatContainer), the hover pattern is fine. No change needed here.

- [ ] **Step 3: ChatMessage — always show action buttons on mobile**

In `ChatMessage.vue`, change the actions opacity to be always visible on mobile:

```scss
&__actions {
  display: flex;
  gap: $spacing-xs;
  margin-top: $spacing-sm;
  opacity: 0;
  transition: opacity $transition-fast;

  @media (max-width: $breakpoint-md) {
    opacity: 1;
  }
}
```

- [ ] **Step 4: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatListBottomSheet.vue frontend/src/components/chat/ChatMessage.vue
git commit -m "fix(mobile): make delete and action buttons visible on touch devices"
```

---

### Task 2: Fix touch target sizes (P0)

**Files:**
- Modify: `frontend/src/components/common/IconButton.vue:27-57`
- Modify: `frontend/src/components/chat/ChatInput.vue:115-158`
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue:181-196`

**Problem:** IconButton is 36x36px, ChatInput send button shrinks to 36x36px on mobile, and the BottomSheet delete button is ~26x26px. Apple/WCAG recommend minimum 44x44px for touch targets.

- [ ] **Step 1: IconButton — add mobile size increase**

Add a media query to bump the size to 44px on mobile:

```scss
.icon-button {
  // ... existing styles ...

  @media (max-width: $breakpoint-md) {
    width: 44px;
    height: 44px;
  }
}
```

Need to add `@use '@/styles/variables' as *;` is already there.

- [ ] **Step 2: ChatInput — keep 40px on mobile instead of shrinking to 36px**

Remove the mobile media query that shrinks the button:

```scss
&__btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  transition: opacity $transition-fast;

  // Remove the @media block that shrinks to 36px
}
```

- [ ] **Step 3: ChatListBottomSheet — increase delete button padding**

Change delete button padding from 6px to 10px so the touch target is at least 34px (14px icon + 20px padding). Combined with the hit area being the full list item right side, this is acceptable:

```scss
.chat-list-item__delete-btn {
  // ...
  padding: 10px;
  // ...
}
```

- [ ] **Step 4: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/IconButton.vue frontend/src/components/chat/ChatInput.vue frontend/src/components/chat/ChatListBottomSheet.vue
git commit -m "fix(mobile): increase touch targets to meet 44px minimum"
```

---

### Task 3: Add safe area support (P1)

**Files:**
- Modify: `frontend/index.html:8`
- Modify: `frontend/src/styles/variables.scss` (add safe area spacing variable)
- Modify: `frontend/src/components/chat/ChatInput.vue` (bottom safe area)
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue` (bottom safe area)
- Modify: `frontend/src/components/schedule/ScheduleSheet.vue` (bottom safe area)
- Modify: `frontend/src/styles/components/_dialogs.scss` (mobile dialog bottom safe area)

- [ ] **Step 1: Add viewport-fit=cover to index.html**

Change viewport meta:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

- [ ] **Step 2: Add safe area padding to ChatInput on mobile**

In ChatInput.vue, add bottom safe area padding:
```scss
@media (max-width: $breakpoint-md) {
  padding: $spacing-lg $spacing-md;
  padding-bottom: max($spacing-lg, env(safe-area-inset-bottom, 0px));
  gap: 10px;
}
```

- [ ] **Step 3: Add safe area padding to bottom sheets**

In ChatListBottomSheet.vue footer:
```scss
.chat-list-sheet__footer {
  padding: 12px 20px 24px 20px;
  padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
}
```

In ScheduleSheet.vue footer:
```scss
&__footer {
  // ...
  padding-bottom: max($spacing-md, env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 4: Add safe area to mobile dialog footer in _dialogs.scss**

In the `@media (max-width: $breakpoint-md)` block for `.el-dialog`:
```scss
&__footer {
  padding-bottom: max($spacing-md, env(safe-area-inset-bottom, 0px));
  // ...
}
```

- [ ] **Step 5: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/components/chat/ChatInput.vue frontend/src/components/chat/ChatListBottomSheet.vue frontend/src/components/schedule/ScheduleSheet.vue frontend/src/styles/components/_dialogs.scss
git commit -m "fix(mobile): add safe area support for notched devices"
```

---

### Task 4: Unify bottom sheet design (P1)

**Files:**
- Modify: `frontend/src/components/schedule/ScheduleSheet.vue:83-156`
- Reference: `frontend/src/components/chat/ChatListBottomSheet.vue` (canonical pattern)
- Reference: `frontend/src/styles/components/_dialogs.scss` (el-dialog mobile pattern)

**Standard (from ChatListBottomSheet + _dialogs.scss):**
- border-radius: `24px 24px 0 0`
- drag handle: `width: 40px; height: 4px; border-radius: 2px;`
- overlay: `rgba(0, 0, 0, 0.5)`

- [ ] **Step 1: Align ScheduleSheet border-radius to 24px**

Change `.schedule-sheet` border-radius from `$radius-xl $radius-xl 0 0` (16px) to `24px 24px 0 0`.

- [ ] **Step 2: Align ScheduleSheet drag handle width to 40px**

Change `&__handle` width from 36px to 40px and border-radius from `$radius-pill` to `2px` to match.

- [ ] **Step 3: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/schedule/ScheduleSheet.vue
git commit -m "fix(ui): unify bottom sheet border-radius and drag handle sizing"
```

---

### Task 5: Extract shared knowledge viewer logic (P2)

**Files:**
- Create: `frontend/src/composables/useKnowledgeContent.ts`
- Modify: `frontend/src/components/knowledge/KnowledgeFileViewer.vue`
- Modify: `frontend/src/components/knowledge/MarkdownViewerDrawer.vue`

**Problem:** ~87% code duplication between KnowledgeFileViewer and MarkdownViewerDrawer. Both have identical `loadContent`, `handleSave`, `cancelEdit` logic and identical state refs.

- [ ] **Step 1: Create useKnowledgeContent composable**

Extract shared logic into a composable:

```typescript
// frontend/src/composables/useKnowledgeContent.ts
import { ref, computed, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { renderMarkdown } from '@/utils/markdown';
import * as knowledgeApi from '@/api/knowledge';

export function useKnowledgeContent(fileId: Ref<string | null>) {
  const { t } = useI18n();
  const isLoadingContent = ref(false);
  const isEditing = ref(false);
  const isSaving = ref(false);
  const rawContent = ref('');
  const editContent = ref('');

  const renderedContent = computed(() => renderMarkdown(rawContent.value));

  async function loadContent(id: string): Promise<void> {
    isLoadingContent.value = true;
    isEditing.value = false;
    try {
      const result = await knowledgeApi.getFileContent(id);
      rawContent.value = result.content;
      editContent.value = result.content;
    } catch {
      rawContent.value = '';
      editContent.value = '';
    } finally {
      isLoadingContent.value = false;
    }
  }

  async function handleSave(): Promise<void> {
    if (!fileId.value) return;
    isSaving.value = true;
    try {
      await knowledgeApi.updateFileContent(fileId.value, editContent.value);
      rawContent.value = editContent.value;
      isEditing.value = false;
      ElMessage.success(t('knowledge.saveSuccess'));
    } catch {
      ElMessage.error(t('knowledge.saveFailed'));
    } finally {
      isSaving.value = false;
    }
  }

  function cancelEdit(): void {
    editContent.value = rawContent.value;
    isEditing.value = false;
  }

  function resetState(): void {
    isEditing.value = false;
    rawContent.value = '';
    editContent.value = '';
  }

  return {
    isLoadingContent,
    isEditing,
    isSaving,
    rawContent,
    editContent,
    renderedContent,
    loadContent,
    handleSave,
    cancelEdit,
    resetState,
  };
}
```

- [ ] **Step 2: Refactor KnowledgeFileViewer to use composable**

Replace the duplicated logic with the composable. Keep the template and styles untouched.

- [ ] **Step 3: Refactor MarkdownViewerDrawer to use composable**

Same as above — replace script logic with composable.

- [ ] **Step 4: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useKnowledgeContent.ts frontend/src/components/knowledge/KnowledgeFileViewer.vue frontend/src/components/knowledge/MarkdownViewerDrawer.vue
git commit -m "refactor: extract shared knowledge content logic into composable"
```

---

### Task 6: Extract shared chat list logic (P2)

**Files:**
- Create: `frontend/src/composables/useChatListActions.ts`
- Modify: `frontend/src/components/chat/ChatListDrawer.vue`
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue`

**Problem:** ~88% code duplication — identical delete confirmation state and handlers.

- [ ] **Step 1: Create useChatListActions composable**

```typescript
// frontend/src/composables/useChatListActions.ts
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useChatSessionStore } from '@/stores';

export function useChatListActions(emit: (event: 'select-session', id: string) => void) {
  const { t } = useI18n();
  const chatSessionStore = useChatSessionStore();
  const showDeleteConfirm = ref(false);
  const pendingDeleteId = ref<string | null>(null);
  const isDeleting = ref(false);

  function handleSelect(id: string) {
    emit('select-session', id);
  }

  function handleDelete(id: string) {
    pendingDeleteId.value = id;
    showDeleteConfirm.value = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId.value) return;
    isDeleting.value = true;
    try {
      await chatSessionStore.removeSession(pendingDeleteId.value);
      ElMessage.success(t('chat.chatList.deleteSuccess'));
      showDeleteConfirm.value = false;
    } finally {
      isDeleting.value = false;
      pendingDeleteId.value = null;
    }
  }

  return {
    chatSessionStore,
    showDeleteConfirm,
    pendingDeleteId,
    isDeleting,
    handleSelect,
    handleDelete,
    confirmDelete,
  };
}
```

- [ ] **Step 2: Refactor ChatListDrawer to use composable**

- [ ] **Step 3: Refactor ChatListBottomSheet to use composable**

- [ ] **Step 4: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useChatListActions.ts frontend/src/components/chat/ChatListDrawer.vue frontend/src/components/chat/ChatListBottomSheet.vue
git commit -m "refactor: extract shared chat list delete logic into composable"
```

---

### Task 7: Replace hardcoded breakpoints with SCSS variable (P2)

**Files:**
- Modify: `frontend/src/components/sidebar/DataFilesFolder.vue:290,319`
- Modify: `frontend/src/components/sidebar/DatasourceGroup.vue:317,351`
- Modify: `frontend/src/components/sidebar/KnowledgeFolderTree.vue:342,372`

- [ ] **Step 1: DataFilesFolder — replace 768px / 769px**

Replace `@media (max-width: 768px)` → `@media (max-width: $breakpoint-md)` and `@media (min-width: 769px)` → `@media (min-width: calc($breakpoint-md + 1px))` (or just `min-width: $breakpoint-md + 1`).

- [ ] **Step 2: DatasourceGroup — replace 768px / 769px**

Same pattern.

- [ ] **Step 3: KnowledgeFolderTree — replace 768px / 769px**

Same pattern.

- [ ] **Step 4: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sidebar/DataFilesFolder.vue frontend/src/components/sidebar/DatasourceGroup.vue frontend/src/components/sidebar/KnowledgeFolderTree.vue
git commit -m "fix(styles): replace hardcoded 768px breakpoints with $breakpoint-md variable"
```

---

### Task 8: Standardize hardcoded spacing values (P2)

**Files:**
- Modify: `frontend/src/styles/_chat-list.scss`
- Modify: `frontend/src/components/chat/ChatListDrawer.vue` (styles)
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue` (styles)
- Modify: `frontend/src/components/sidebar/DataFilesFolder.vue` (styles)

Replace px values with closest SCSS spacing variable:
- `4px` → `$spacing-xs`
- `8px` → `$spacing-sm`
- `12px` → `$spacing-sm + $spacing-xs` or keep as-is (12px has no exact match, closest is to keep it)
- `16px` → `$spacing-md`
- `20px` → keep as-is (no exact match, between $spacing-md and $spacing-lg)
- `24px` → `$spacing-lg`
- `40px` → `$spacing-xl + $spacing-sm` or keep as-is

Note: Only replace values where the corresponding variable makes semantic sense. Keep values that are intentional one-offs (e.g., 20px padding in headers).

- [ ] **Step 1: Standardize _chat-list.scss**

Replace obvious matches (8px→$spacing-sm, 4px→$spacing-xs, 12px→12px keep, 14px→14px keep).

- [ ] **Step 2: Standardize ChatListDrawer.vue spacing**

- [ ] **Step 3: Standardize ChatListBottomSheet.vue spacing**

- [ ] **Step 4: Standardize DataFilesFolder.vue gap**

Replace `gap: 10px` → `gap: $spacing-sm`.

- [ ] **Step 5: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/_chat-list.scss frontend/src/components/chat/ChatListDrawer.vue frontend/src/components/chat/ChatListBottomSheet.vue frontend/src/components/sidebar/DataFilesFolder.vue
git commit -m "fix(styles): replace hardcoded spacing values with SCSS variables"
```

---

### Task 9: Fix delete button class naming inconsistency (P3)

**Files:**
- Modify: `frontend/src/components/chat/ChatListBottomSheet.vue`

- [ ] **Step 1: Rename class in ChatListBottomSheet**

Rename `.chat-list-item__delete-btn` → `.chat-list-item__delete` to match ChatListDrawer's naming. Update both the template class attribute and the scoped style selector.

- [ ] **Step 2: Verify — run preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ChatListBottomSheet.vue
git commit -m "fix(styles): rename delete button class to match ChatListDrawer convention"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full preflight**

Run: `cd frontend/ && pnpm run preflight`

- [ ] **Step 2: Visual check — verify no regressions**

Review all changed files for correctness.
