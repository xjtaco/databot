# Frontend Precision Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DataBot frontend into a cohesive dark Precision Console across desktop and mobile shell, chat, and key page surfaces.

**Architecture:** Keep the existing Vue component boundaries and navigation behavior. Centralize visual primitives in SCSS tokens and a small console helper stylesheet, then apply those primitives to the shell, sidebar, chat surface, and page containers. This is a visual refactor only: stores, routes, API calls, and emitted events stay unchanged.

**Tech Stack:** Vue 3, Vite, TypeScript, SCSS, Element Plus, Pinia, Vue Test Utils, Vitest, Playwright MCP for browser verification.

---

## File Structure

Modify:

- `frontend/src/styles/variables.scss`: tune core dark console tokens, spacing, radii, shadows, shell widths.
- `frontend/src/styles/themes/dark.scss`: expose new CSS variables for console surfaces, panels, controls, focus, and overlays.
- `frontend/src/styles/index.scss`: import console helpers and strengthen Element Plus global dark overrides.
- `frontend/src/styles/_console.scss`: create shared console page, header, toolbar, control, and table styles.
- `frontend/src/layouts/DesktopLayout.vue`: add console workspace surface and overflow boundaries.
- `frontend/src/layouts/MobileLayout.vue`: refine overlay, drawer, and mobile main surface.
- `frontend/src/components/sidebar/DataSourceSidebar.vue`: align sidebar background with console shell.
- `frontend/src/components/sidebar/IconBar.vue`: restyle rail logo, active states, hover states, language, and user controls.
- `frontend/src/components/common/IconButton.vue`: ensure icon buttons have stable console dimensions and focus state.
- `frontend/src/components/chat/ChatContainer.vue`: turn chat into the primary command surface.
- `frontend/src/components/chat/ChatHeader.vue`: restyle header as operational console toolbar.
- `frontend/src/components/chat/ChatMessageList.vue`: constrain message width, improve empty state, and add message entrance support.
- `frontend/src/components/chat/ChatMessage.vue`: restyle user and assistant messages with lower card weight and better density.
- `frontend/src/components/chat/ChatInput.vue`: restyle as command bar with safe mobile bottom spacing.
- `frontend/src/components/data-management/DataManagementPage.vue`: align tree/detail panel shell and mobile header.
- `frontend/src/components/workflow/WorkflowPage.vue`: align editor/list containers, drawers, mobile headers, and fixed add action.
- `frontend/src/components/schedule/SchedulePage.vue`: apply shared console page patterns.
- `frontend/src/components/settings/SettingsPage.vue`: apply shared console page patterns.
- `frontend/src/components/user/UserManagementPage.vue`: apply shared console page patterns.
- `frontend/src/components/audit/AuditLogPage.vue`: apply shared console page patterns.

Test and verification targets:

- `frontend/tests/components/DataManagementPage.test.ts`
- `frontend/tests/components/ConnectionStatus.test.ts`
- `frontend/tests/components/workflow/WfEditorCanvas.test.ts`
- `pnpm run typecheck`
- `pnpm run build`
- Browser screenshots at 1440x900 and 390x844 for chat, data management, and workflow.

---

### Task 1: Visual Foundation Tokens And Helpers

**Files:**

- Modify: `frontend/src/styles/variables.scss`
- Modify: `frontend/src/styles/themes/dark.scss`
- Modify: `frontend/src/styles/index.scss`
- Create: `frontend/src/styles/_console.scss`

- [ ] **Step 1: Run current style and type checks**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
```

Expected: both commands finish successfully before visual edits. If either fails, capture the exact failing file and message before editing.

- [ ] **Step 2: Update base SCSS tokens**

In `frontend/src/styles/variables.scss`, replace the current background, text, accent, border, radius, and shadow token block with this console token set:

```scss
// Background colors
$bg-page: #080a0d;
$bg-sidebar: #0d1015;
$bg-card: #11161d;
$bg-deeper: #05070a;
$bg-elevated: #151b23;
$bg-panel: #0f1319;
$bg-control: #171e27;

// Text colors
$text-primary-color: #f4f7fb;
$text-secondary-color: #a9b2bf;
$text-muted: #697483;

// Accent colors
$accent: #ff6a2a;
$accent-light: #ff8a52;
$accent-strong: #ff4f12;
$accent-tint10: rgba(#ff6a2a, 0.1);
$accent-tint20: rgba(#ff6a2a, 0.18);

// Border colors
$border-dark: #1d2530;
$border-elevated: #2a3543;
$border-strong: #3a4656;
```

Then change the radius and shadows in the same file to:

```scss
$radius-sm: 6px;
$radius-md: 8px;
$radius-lg: 8px;
$radius-xl: 10px;
$radius-pill: 100px;
$radius-full: 9999px;

$shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 24%);
$shadow-md:
  0 10px 24px -18px rgb(0 0 0 / 70%),
  0 1px 0 rgb(255 255 255 / 3%) inset;
$shadow-lg:
  0 18px 48px -28px rgb(0 0 0 / 85%),
  0 1px 0 rgb(255 255 255 / 4%) inset;
$shadow-modal: 0 24px 80px rgb(0 0 0 / 55%);
```

Expected: no TypeScript files change in this step.

- [ ] **Step 3: Expose console CSS variables**

In `frontend/src/styles/themes/dark.scss`, add these variables inside the `:root, [data-theme='dark']` block after `--bg-hover`:

```scss
  --bg-panel: #{$bg-panel};
  --bg-control: #{$bg-control};
  --bg-console: linear-gradient(180deg, #0a0d12 0%, #080a0d 46%, #06080b 100%);
  --bg-console-grid:
    linear-gradient(rgb(255 255 255 / 2.4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 2.4%) 1px, transparent 1px);
  --surface-raised: #{$bg-card};
  --surface-sunken: #{$bg-deeper};
```

Add these after the existing border variables:

```scss
  --border-strong: #{$border-strong};
  --focus-ring: rgb(255 106 42 / 38%);
```

Change `--accent-gradient` to:

```scss
  --accent-gradient: linear-gradient(180deg, #{$accent-light} 0%, #{$accent-strong} 100%);
```

Change message, input, scrollbar, and overlay variables to:

```scss
  --message-user-bg: rgb(255 106 42 / 14%);
  --message-assistant-bg: #{$bg-panel};

  --input-bg: #{$bg-control};
  --input-border: #{$border-elevated};
  --input-focus-border: #{$accent};

  --scrollbar-track: #{$bg-deeper};
  --scrollbar-thumb: #{$border-elevated};
  --scrollbar-thumb-hover: #{$border-strong};

  --dialog-overlay: rgb(0 0 0 / 64%);
  --dialog-bg: #{$bg-panel};
  --dialog-header-bg: #{$bg-sidebar};
  --dialog-card-bg: #{$bg-card};
  --dialog-border: #{$border-elevated};
```

Expected: old aliases remain at the bottom of the block for compatibility.

- [ ] **Step 4: Create console helper stylesheet**

Create `frontend/src/styles/_console.scss` with this content:

```scss
@use 'variables' as *;

@mixin console-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-console);
}

@mixin console-scroll-page {
  @include console-page;

  overflow-y: auto;
}

@mixin console-desktop-padding {
  padding: 22px 28px 28px;
}

@mixin console-page-header {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: $spacing-lg;
  padding-bottom: $spacing-md;
  border-bottom: 1px solid var(--border-primary);
}

@mixin console-title-stack {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

@mixin console-title {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@mixin console-description {
  margin: 0;
  color: var(--text-tertiary);
  font-size: $font-size-sm;
  line-height: $line-height-normal;
}

@mixin console-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  padding: $spacing-md 0;
}

@mixin console-mobile-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: $spacing-sm;
  min-height: 52px;
  padding: 0 $spacing-sm;
  background: rgb(13 16 21 / 92%);
  border-bottom: 1px solid var(--border-primary);
  backdrop-filter: blur(16px);
}

@mixin console-icon-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--text-tertiary);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: $radius-md;
  transition:
    color $transition-fast,
    background-color $transition-fast,
    border-color $transition-fast,
    transform $transition-fast;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-control);
    border-color: var(--border-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  &:active {
    transform: translateY(1px);
  }
}

@mixin console-input-shell {
  background: var(--bg-control);
  border: 1px solid var(--border-secondary);
  border-radius: $radius-lg;
  box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
}

@mixin console-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--bg-panel);
  --el-table-row-hover-bg-color: var(--bg-elevated);
  --el-table-border-color: var(--border-primary);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-tertiary);

  border: 1px solid var(--border-primary);
  border-radius: $radius-lg;

  :deep(.el-table__header th.el-table__cell) {
    font-weight: $font-weight-medium;
  }

  :deep(.el-table__body tr:last-child td) {
    border-bottom: none;
  }

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }
}
```

Expected: helper names are generic and do not import component files.

- [ ] **Step 5: Import helpers and strengthen global Element Plus styling**

In `frontend/src/styles/index.scss`, add `@use 'console';` after the existing `@use 'typography';` line.

In the Element Plus overrides section of the same file, add:

```scss
.el-button {
  --el-button-border-radius: #{$radius-md};
  --el-button-bg-color: var(--bg-control);
  --el-button-border-color: var(--border-secondary);
  --el-button-text-color: var(--text-secondary);
  --el-button-hover-bg-color: var(--bg-elevated);
  --el-button-hover-border-color: var(--border-strong);
  --el-button-hover-text-color: var(--text-primary);
}

.el-button--primary {
  --el-button-bg-color: var(--accent);
  --el-button-border-color: var(--accent);
  --el-button-text-color: var(--text-on-accent);
  --el-button-hover-bg-color: var(--accent-light);
  --el-button-hover-border-color: var(--accent-light);
  --el-button-hover-text-color: var(--text-on-accent);
}

.el-input__wrapper,
.el-select__wrapper,
.el-textarea__inner {
  background-color: var(--input-bg);
  border-radius: #{$radius-md};
  box-shadow: 0 0 0 1px var(--input-border) inset;
}

.el-input__wrapper.is-focus,
.el-select__wrapper.is-focused,
.el-textarea__inner:focus {
  box-shadow: 0 0 0 1px var(--input-focus-border) inset;
}

.el-dropdown-menu {
  background: var(--bg-panel);
  border: 1px solid var(--border-secondary);
}

.el-dropdown-menu__item {
  color: var(--text-secondary);

  &:hover,
  &:focus {
    color: var(--text-primary);
    background: var(--bg-elevated);
  }
}
```

Expected: existing drawer and dialog overrides remain below these additions.

- [ ] **Step 6: Run foundation checks and commit**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
```

Expected: both commands pass.

Commit:

```bash
git add frontend/src/styles/variables.scss frontend/src/styles/themes/dark.scss frontend/src/styles/index.scss frontend/src/styles/_console.scss
git commit -m "style(frontend): add precision console tokens"
```

---

### Task 2: Desktop And Mobile Shell Navigation

**Files:**

- Modify: `frontend/src/layouts/DesktopLayout.vue`
- Modify: `frontend/src/layouts/MobileLayout.vue`
- Modify: `frontend/src/components/sidebar/DataSourceSidebar.vue`
- Modify: `frontend/src/components/sidebar/IconBar.vue`
- Modify: `frontend/src/components/common/IconButton.vue`

- [ ] **Step 1: Run sidebar and shell regression tests**

Run:

```bash
cd frontend
pnpm run test -- tests/components/ConnectionStatus.test.ts
```

Expected: test file passes before shell styling edits.

- [ ] **Step 2: Restyle desktop shell**

In `frontend/src/layouts/DesktopLayout.vue`, replace the scoped style block content with:

```scss
@use '@/styles/variables' as *;

.desktop-layout {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-console);

  &__main {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% 0%, rgb(255 106 42 / 5%), transparent 26%),
      var(--bg-console);
  }
}
```

Expected: template and script in this file do not change.

- [ ] **Step 3: Restyle mobile shell**

In `frontend/src/layouts/MobileLayout.vue`, keep the template and script unchanged. Replace the scoped style block content with:

```scss
@use '@/styles/variables' as *;

.mobile-layout {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-console);

  &__overlay {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal - 1;
    background-color: var(--dialog-overlay);
    backdrop-filter: blur(8px);
  }

  &__sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: $z-index-modal;
    box-shadow: var(--shadow-lg);
  }

  &__main {
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition:
    opacity $transition-normal,
    transform $transition-normal;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;

  &.mobile-layout__sidebar {
    transform: translateX(-100%);
  }
}
```

Expected: overlay keeps the same click behavior.

- [ ] **Step 4: Restyle sidebar container**

In `frontend/src/components/sidebar/DataSourceSidebar.vue`, replace the scoped style block content with:

```scss
@use '@/styles/variables' as *;

.data-source-sidebar {
  display: flex;
  flex-direction: row;
  width: $sidebar-width-collapsed;
  height: 100%;
  overflow: hidden;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-primary);
}
```

Expected: emitted navigation and user command behavior stays unchanged.

- [ ] **Step 5: Restyle the icon rail**

In `frontend/src/components/sidebar/IconBar.vue`, keep template and script unchanged. Replace the scoped style block with this rail style:

```scss
@use '@/styles/variables' as *;

.icon-bar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  width: $icon-bar-width;
  min-width: $icon-bar-width;
  height: 100%;
  padding: 12px 8px;
  background: linear-gradient(180deg, var(--bg-sidebar) 0%, var(--surface-sunken) 100%);
  border-right: 1px solid var(--border-primary);

  &--mobile {
    gap: 6px;
    width: $icon-bar-width-mobile;
    min-width: $icon-bar-width-mobile;
    padding: 10px 6px;
  }

  &__logo {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    background: var(--bg-panel);

    .icon-bar--mobile & {
      width: 30px;
      height: 30px;
    }
  }

  &__logo-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  &__separator {
    flex-shrink: 0;
    width: 22px;
    height: 1px;
    margin: 4px 0;
    background-color: var(--border-primary);
  }

  &__item {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    color: var(--text-tertiary);
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;
    transition:
      color $transition-fast,
      background-color $transition-fast,
      border-color $transition-fast,
      transform $transition-fast;

    .icon-bar--mobile & {
      width: 36px;
      height: 36px;
    }

    &:hover:not(.is-disabled) {
      color: var(--text-primary);
      background-color: var(--bg-control);
      border-color: var(--border-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    &:active:not(.is-disabled) {
      transform: translateY(1px);
    }

    &.is-active {
      color: var(--accent);
      background-color: var(--accent-tint10);
      border-color: rgb(255 106 42 / 28%);

      .icon-bar__indicator {
        opacity: 1;
        transform: translateY(-50%) scaleY(1);
      }
    }

    &.is-disabled {
      color: var(--border-secondary);
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__indicator {
    position: absolute;
    top: 50%;
    left: -8px;
    width: 3px;
    height: 20px;
    background-color: var(--accent);
    border-radius: 0 3px 3px 0;
    opacity: 0;
    transform: translateY(-50%) scaleY(0.6);
    transition:
      opacity $transition-fast,
      transform $transition-fast;

    .icon-bar--mobile & {
      left: -6px;
      height: 16px;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__lang {
    font-size: 12px;
    font-weight: $font-weight-semibold;
    letter-spacing: 0;
  }

  &__user {
    color: var(--text-secondary);
  }

  &__username {
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
  }

  &__dropdown-icon {
    margin-right: $spacing-sm;
  }
}
```

Expected: active nav indicator remains visible for top and admin nav items.

- [ ] **Step 6: Normalize common icon button styling**

In `frontend/src/components/common/IconButton.vue`, keep props, emits, and slots unchanged. Replace only the scoped style with:

```scss
@use '@/styles/variables' as *;
@use '@/styles/console' as console;

.icon-button {
  @include console.console-icon-button;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }
}
```

If the component root class is not `.icon-button`, rename only the selector to match the existing template class. Do not change the component API.

- [ ] **Step 7: Run shell checks and commit**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
pnpm run test -- tests/components/ConnectionStatus.test.ts
```

Expected: all commands pass.

Commit:

```bash
git add frontend/src/layouts/DesktopLayout.vue frontend/src/layouts/MobileLayout.vue frontend/src/components/sidebar/DataSourceSidebar.vue frontend/src/components/sidebar/IconBar.vue frontend/src/components/common/IconButton.vue
git commit -m "style(frontend): redesign console shell navigation"
```

---

### Task 3: Chat Command Surface

**Files:**

- Modify: `frontend/src/components/chat/ChatContainer.vue`
- Modify: `frontend/src/components/chat/ChatHeader.vue`
- Modify: `frontend/src/components/chat/ChatMessageList.vue`
- Modify: `frontend/src/components/chat/ChatMessage.vue`
- Modify: `frontend/src/components/chat/ChatInput.vue`

- [ ] **Step 1: Run chat-adjacent regression tests**

Run:

```bash
cd frontend
pnpm run test -- tests/components/ConnectionStatus.test.ts tests/components/ToolCallIndicator.test.ts tests/components/TodosStatusBar.test.ts
```

Expected: all listed tests pass before visual edits.

- [ ] **Step 2: Restyle chat container**

In `frontend/src/components/chat/ChatContainer.vue`, replace the scoped style block with:

```scss
@use '@/styles/variables' as *;

.chat-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background:
    var(--bg-console-grid) 0 0 / 28px 28px,
    radial-gradient(circle at 72% 0%, rgb(255 106 42 / 5%), transparent 24%),
    var(--bg-console);
}
```

Expected: `ChatHeader`, drawers, message list, indicator, and input remain in the same order.

- [ ] **Step 3: Restyle chat header**

In `frontend/src/components/chat/ChatHeader.vue`, replace only the scoped style block with a compact console toolbar:

```scss
@use '@/styles/variables' as *;

.chat-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(160px, 1fr);
  gap: $spacing-md;
  align-items: center;
  min-height: 64px;
  padding: 0 28px;
  background: rgb(8 10 13 / 82%);
  border-bottom: 1px solid var(--border-primary);
  backdrop-filter: blur(18px);

  @media (max-width: $breakpoint-md) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $spacing-sm;
    min-height: 56px;
    padding: 0 $spacing-sm;
  }

  &__left {
    display: flex;
    min-width: 0;
    gap: $spacing-sm;
    align-items: center;
  }

  &__menu-btn {
    display: flex;
  }

  &__title {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;

    h1 {
      margin: 0;
      overflow: hidden;
      color: var(--text-primary);
      font-family: $font-family-sans;
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__subtitle {
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: $font-size-xs;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (max-width: $breakpoint-md) {
      display: none;
    }
  }

  &__center {
    display: flex;
    min-width: 0;
    gap: $spacing-sm;
    align-items: center;
    justify-content: center;

    @media (max-width: $breakpoint-md) {
      display: none;
    }
  }

  &__right {
    display: flex;
    min-width: 0;
    gap: $spacing-sm;
    align-items: center;
    justify-content: flex-end;
  }

  &__new-chat-btn {
    color: var(--accent);
  }
}
```

Expected: center status hides on mobile to prevent crowding.

- [ ] **Step 4: Restyle message list and empty state**

In `frontend/src/components/chat/ChatMessageList.vue`, replace only the scoped style block with:

```scss
@use '@/styles/variables' as *;

.chat-message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 28px clamp(20px, 5vw, 72px);
  overflow-y: auto;
  scroll-behavior: smooth;

  @media (max-width: $breakpoint-md) {
    gap: $spacing-md;
    padding: $spacing-md $spacing-sm;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    align-items: flex-start;
    justify-content: center;
    width: min(640px, 100%);
    height: 100%;
    margin: 0 auto;
    text-align: left;
  }

  &__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: var(--accent);
    background-color: var(--accent-tint10);
    border: 1px solid rgb(255 106 42 / 20%);
    border-radius: $radius-lg;

    :deep(.el-icon) {
      font-size: 24px;
    }
  }

  h3 {
    margin: $spacing-sm 0 0;
    color: var(--text-primary);
    font-family: $font-family-sans;
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
  }

  p {
    max-width: 460px;
    margin: 0;
    color: var(--text-tertiary);
    font-size: $font-size-sm;
    line-height: $line-height-normal;
    white-space: pre-line;
  }

  &__anchor {
    flex-shrink: 0;
    height: 1px;
  }
}
```

Expected: the empty state stays product-oriented and not hero-like.

- [ ] **Step 5: Restyle chat messages**

In `frontend/src/components/chat/ChatMessage.vue`, replace only the scoped style block with:

```scss
@use '@/styles/variables' as *;

.chat-message {
  display: flex;
  gap: $spacing-md;
  width: min(920px, 100%);
  margin: 0 auto;
  animation: message-in 180ms ease-out;

  &:hover {
    .chat-message__actions {
      opacity: 1;
    }
  }

  &--user {
    justify-content: flex-end;
  }

  &__user-bubble {
    max-width: min(720px, 82%);
    padding: 12px 14px;
    background-color: var(--message-user-bg);
    border: 1px solid rgb(255 106 42 / 20%);
    border-radius: $radius-lg $radius-lg 2px $radius-lg;

    .chat-message__body {
      color: var(--text-primary);
      font-size: 13px;
    }
  }

  &__avatar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-top: 2px;
    background: var(--accent-gradient);
    border-radius: $radius-md;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 8%) inset;
  }

  &__avatar-letter {
    color: var(--text-on-accent);
    font-family: $font-family-sans;
    font-size: 13px;
    font-weight: $font-weight-semibold;
  }

  &__card {
    flex: 1;
    min-width: 0;
    padding: 14px 16px;
    background-color: var(--message-assistant-bg);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
  }

  &__body {
    overflow-wrap: break-word;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: $line-height-relaxed;
  }

  &__loading {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    color: var(--text-secondary);
  }

  &__typing {
    display: flex;
    gap: 4px;

    span {
      width: 6px;
      height: 6px;
      background-color: var(--accent);
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out both;

      &:nth-child(1) {
        animation-delay: -0.32s;
      }

      &:nth-child(2) {
        animation-delay: -0.16s;
      }
    }
  }

  &__loading-text {
    font-size: 13px;
  }

  &__error {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    margin-top: $spacing-sm;
    color: var(--error);
    font-size: $font-size-sm;
    background-color: var(--error-bg);
    border: 1px solid rgb(239 68 68 / 18%);
    border-radius: $radius-md;
  }

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
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes typing {
  0%,
  80%,
  100% {
    opacity: 0.5;
    transform: scale(0.6);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}
```

Expected: no markdown rendering code changes.

- [ ] **Step 6: Restyle chat input as command bar**

In `frontend/src/components/chat/ChatInput.vue`, replace only the scoped style block with:

```scss
@use '@/styles/variables' as *;

.chat-input {
  display: flex;
  gap: $spacing-sm;
  align-items: flex-end;
  padding: 14px clamp(20px, 5vw, 72px) 18px;
  background: rgb(8 10 13 / 88%);
  border-top: 1px solid var(--border-primary);
  backdrop-filter: blur(18px);

  @media (max-width: $breakpoint-md) {
    padding: 10px $spacing-sm max(10px, env(safe-area-inset-bottom, 0px));
  }

  &__input-box {
    flex: 1;
    max-width: 920px;
    padding: 12px 14px;
    margin-left: auto;
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: $radius-lg;
    box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
    transition:
      border-color $transition-fast,
      box-shadow $transition-fast;

    &:focus-within {
      border-color: var(--input-focus-border);
      box-shadow:
        0 0 0 3px var(--focus-ring),
        0 1px 0 rgb(255 255 255 / 3%) inset;
    }
  }

  :deep(.el-textarea__inner) {
    min-height: 22px !important;
    padding: 0;
    color: var(--text-primary);
    font-size: 13px;
    line-height: $line-height-normal;
    resize: none;
    background: transparent;
    border: none;
    box-shadow: none !important;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  &__btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    padding: 0;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: $radius-lg;
    transition:
      opacity $transition-fast,
      transform $transition-fast,
      border-color $transition-fast;

    :deep(.el-icon) {
      color: var(--text-on-accent);
      font-size: 18px;
    }

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    &:active:not(:disabled) {
      transform: translateY(1px);
    }

    &--send {
      background: var(--accent-gradient);
      border-color: rgb(255 106 42 / 34%);

      &:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }
    }

    &--stop {
      background: var(--error);

      &:hover {
        opacity: 0.9;
      }
    }
  }
}
```

Expected: Enter and Shift+Enter behavior stays unchanged.

- [ ] **Step 7: Run chat checks and commit**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
pnpm run test -- tests/components/ConnectionStatus.test.ts tests/components/ToolCallIndicator.test.ts tests/components/TodosStatusBar.test.ts
```

Expected: all commands pass.

Commit:

```bash
git add frontend/src/components/chat/ChatContainer.vue frontend/src/components/chat/ChatHeader.vue frontend/src/components/chat/ChatMessageList.vue frontend/src/components/chat/ChatMessage.vue frontend/src/components/chat/ChatInput.vue
git commit -m "style(frontend): redesign chat command surface"
```

---

### Task 4: Key Page Surface Unification

**Files:**

- Modify: `frontend/src/components/data-management/DataManagementPage.vue`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`
- Modify: `frontend/src/components/schedule/SchedulePage.vue`
- Modify: `frontend/src/components/settings/SettingsPage.vue`
- Modify: `frontend/src/components/user/UserManagementPage.vue`
- Modify: `frontend/src/components/audit/AuditLogPage.vue`

- [ ] **Step 1: Run page regression tests**

Run:

```bash
cd frontend
pnpm run test -- tests/components/DataManagementPage.test.ts tests/components/workflow/WfEditorCanvas.test.ts
```

Expected: both test files pass before page surface edits.

- [ ] **Step 2: Apply shared page style to schedule, user, and audit pages**

In each of these files:

- `frontend/src/components/schedule/SchedulePage.vue`
- `frontend/src/components/user/UserManagementPage.vue`
- `frontend/src/components/audit/AuditLogPage.vue`

Add this import at the top of the scoped style block:

```scss
@use '@/styles/console' as console;
```

For the page root selector, replace the existing layout declarations with:

```scss
  @include console.console-scroll-page;
  @include console.console-desktop-padding;

  &--mobile {
    padding: 0;
  }
```

For `&__title-bar`, replace its declarations with:

```scss
    @include console.console-title-stack;

    margin-bottom: 0;
```

For `&__title`, replace its declarations with:

```scss
    @include console.console-title;
```

For `&__description`, replace its declarations with:

```scss
    @include console.console-description;
```

For `&__toolbar`, replace its declarations with:

```scss
    @include console.console-toolbar;
```

For `&__mobile-header`, replace its declarations with:

```scss
    @include console.console-mobile-header;
```

For `&__back-btn` and any `&__add-btn` in these files, replace their declarations with:

```scss
    @include console.console-icon-button;
```

For desktop table root selectors `&__table`, replace the repeated Element Plus table variable block with:

```scss
    @include console.console-table;
```

Expected: template markup remains unchanged in these three files.

- [ ] **Step 3: Restyle settings page shell**

In `frontend/src/components/settings/SettingsPage.vue`, add `@use '@/styles/console' as console;` to the style block.

Replace `.settings-page` declarations with:

```scss
  @include console.console-scroll-page;
```

Replace `&__header` declarations with:

```scss
    @include console.console-mobile-header;

    min-height: 64px;
    padding: 0 28px;

    @media (max-width: $breakpoint-md) {
      min-height: 52px;
      padding: 0 $spacing-sm;
    }
```

Replace `&__back` declarations with:

```scss
    @include console.console-icon-button;
```

Replace `&__header-title` declarations with:

```scss
    @include console.console-title;

    font-size: $font-size-lg;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-md;
    }
```

Replace `&__body` declarations with:

```scss
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 22px;
    padding: 28px;
    overflow-y: auto;

    @media (max-width: $breakpoint-md) {
      gap: $spacing-md;
      padding: $spacing-md;
    }
```

Expected: the config card components keep their internal styles.

- [ ] **Step 4: Restyle data management panels**

In `frontend/src/components/data-management/DataManagementPage.vue`, add `@use '@/styles/console' as console;` to the style block.

Change `$data-tree-panel-width` to:

```scss
$data-tree-panel-width: 300px;
```

Replace `.data-management` root declarations with:

```scss
  @include console.console-page;

  flex-direction: row;
```

Replace `&__mobile-header` declarations with:

```scss
    @include console.console-mobile-header;
```

Replace `&__tree-panel` declarations with:

```scss
    display: flex;
    flex-direction: column;
    width: $data-tree-panel-width;
    min-width: $data-tree-panel-width;
    height: 100%;
    background-color: var(--bg-sidebar);
    border-right: 1px solid var(--border-primary);
```

Replace `&__tree-header` declarations with:

```scss
    display: flex;
    align-items: center;
    min-height: 54px;
    padding: 0 $spacing-sm;
    border-bottom: 1px solid var(--border-primary);
```

Replace `&__tab` declarations with:

```scss
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;
    transition:
      color $transition-fast,
      background-color $transition-fast,
      border-color $transition-fast;

    &:hover:not(.is-active) {
      color: var(--text-secondary);
      background: var(--bg-control);
    }

    &.is-active {
      color: var(--accent);
      background: var(--accent-tint10);
      border-color: rgb(255 106 42 / 24%);
    }
```

Replace `&__detail-panel` declarations with:

```scss
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background:
      radial-gradient(circle at 70% 0%, rgb(255 106 42 / 4%), transparent 24%),
      var(--bg-console);
```

Expected: `DataManagementPage.test.ts` still finds the same classes.

- [ ] **Step 5: Restyle workflow page shell**

In `frontend/src/components/workflow/WorkflowPage.vue`, add `@use '@/styles/console' as console;` to the style block.

Replace `.workflow-page` root declarations with:

```scss
  @include console.console-page;

  flex-direction: row;
```

Replace `&__editor-main` declarations with:

```scss
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background:
      var(--bg-console-grid) 0 0 / 28px 28px,
      var(--bg-console);
```

Replace `&__mobile-list-header, &__mobile-editor-header` declarations with:

```scss
    @include console.console-mobile-header;
```

Replace `&__back-btn` declarations with:

```scss
    @include console.console-icon-button;
```

Replace `&__mobile-add-btn` declarations with:

```scss
    position: fixed;
    right: 18px;
    bottom: max(18px, env(safe-area-inset-bottom, 0px));
    z-index: $z-index-fixed;
    width: 48px;
    height: 48px;
    box-shadow: var(--shadow-lg);
```

Replace `&__mobile-node-option` declarations with:

```scss
    display: flex;
    gap: $spacing-md;
    align-items: center;
    padding: $spacing-md;
    color: var(--text-primary);
    font-size: $font-size-sm;
    cursor: pointer;
    background: var(--bg-panel);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    transition:
      background-color $transition-fast,
      border-color $transition-fast;

    &:hover {
      background-color: var(--bg-elevated);
      border-color: var(--border-secondary);
    }
```

Expected: workflow store calls and mobile node selection behavior stay unchanged.

- [ ] **Step 6: Run page checks and commit**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
pnpm run test -- tests/components/DataManagementPage.test.ts tests/components/workflow/WfEditorCanvas.test.ts
```

Expected: all commands pass.

Commit:

```bash
git add frontend/src/components/data-management/DataManagementPage.vue frontend/src/components/workflow/WorkflowPage.vue frontend/src/components/schedule/SchedulePage.vue frontend/src/components/settings/SettingsPage.vue frontend/src/components/user/UserManagementPage.vue frontend/src/components/audit/AuditLogPage.vue
git commit -m "style(frontend): unify key console page surfaces"
```

---

### Task 5: Build And Browser Verification

**Files:**

- Modify only files needed to fix verification failures introduced by Tasks 1-4.

- [ ] **Step 1: Run full frontend verification commands**

Run:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
pnpm run build
pnpm run test -- tests/components/DataManagementPage.test.ts tests/components/ConnectionStatus.test.ts tests/components/ToolCallIndicator.test.ts tests/components/TodosStatusBar.test.ts tests/components/workflow/WfEditorCanvas.test.ts
```

Expected: all commands pass.

- [ ] **Step 2: Start the dev server**

Run:

```bash
cd frontend
pnpm run dev -- --host 0.0.0.0
```

Expected: Vite prints a local URL. Keep the server running until browser verification is complete.

- [ ] **Step 3: Verify desktop chat**

In Playwright, open the Vite URL at `1440x900`.

Expected visual checks:

- Left icon rail is dark, compact, and has a visible active state.
- Chat header fits on one line and does not overlap status controls.
- Message area has a console surface, not a blank flat page.
- Input command bar is visible at the bottom and does not shift the layout.

Capture a screenshot named `precision-console-chat-desktop.png`.

- [ ] **Step 4: Verify mobile chat**

Resize Playwright to `390x844`.

Expected visual checks:

- Top chat header fits without text clipping.
- Menu and action buttons keep 36px or larger tap targets.
- Input command bar respects the bottom safe area.
- Sidebar drawer opens and overlay blurs/dims the background.

Capture a screenshot named `precision-console-chat-mobile.png`.

- [ ] **Step 5: Verify desktop and mobile data management**

Navigate to data management using the rail or mobile drawer.

Expected visual checks:

- Desktop tree panel and detail panel share the console visual language.
- Mobile header text does not clip.
- Mobile drawer content aligns with the dark console surface.
- Empty state remains centered and readable.

Capture screenshots named:

```text
precision-console-data-desktop.png
precision-console-data-mobile.png
```

- [ ] **Step 6: Verify desktop and mobile workflow**

Navigate to workflow using the rail or mobile drawer.

Expected visual checks:

- Workflow list/editor shell no longer looks separate from chat.
- Desktop editor canvas has a console background and stable panel boundaries.
- Mobile workflow header actions do not overflow.
- Mobile floating add action sits above the bottom safe area.

Capture screenshots named:

```text
precision-console-workflow-desktop.png
precision-console-workflow-mobile.png
```

- [ ] **Step 7: Fix verification findings**

For each visual issue found in Steps 3-6, make the smallest style change in the component that owns the visible problem. After each fix, rerun:

```bash
cd frontend
pnpm run stylelint
pnpm run typecheck
```

Expected: both commands pass after every fix.

- [ ] **Step 8: Final build and commit**

Run:

```bash
cd frontend
pnpm run build
```

Expected: production build completes successfully.

Commit:

```bash
git add frontend/src
git commit -m "style(frontend): verify precision console responsive polish"
```

If Step 7 made no file changes, skip the commit and record that browser verification required no follow-up edits.

---

## Self-Review

Spec coverage:

- Visual tokens and dark console direction are covered by Task 1.
- Desktop and mobile shell are covered by Task 2.
- Chat command surface is covered by Task 3.
- Data management, workflow, schedule, settings, users, and audit page containers are covered by Task 4.
- Motion and interaction feedback are covered by Tasks 2 and 3 through transitions and message entrance.
- Accessibility, responsiveness, typecheck, build, and browser verification are covered by Task 5.

Scope check:

- The plan keeps stores, routes, API contracts, and business behavior unchanged.
- The plan does not replace Element Plus.
- The plan does not redesign every nested form, table cell, or node config component.

Red-flag scan:

- The only scan hit is the real CSS selector `&::placeholder` in the chat input style.

Type consistency:

- All new SCSS mixins are defined in `frontend/src/styles/_console.scss` and imported as `console`.
- Component class names referenced in tests remain present.
