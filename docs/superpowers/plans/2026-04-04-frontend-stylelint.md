# Frontend Stylelint Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stylelint to the frontend for comprehensive CSS/SCSS linting with logical-group property ordering, integrated into the preflight pipeline.

**Architecture:** Install Stylelint with SCSS and property-ordering presets, configure for Vue SFC parsing via postcss-html, integrate into existing npm scripts and preflight, then fix all existing violations.

**Tech Stack:** Stylelint 16+, stylelint-config-standard-scss, stylelint-config-recess-order, postcss-html

**Spec:** `docs/superpowers/specs/2026-04-04-frontend-stylelint-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Stylelint packages**

```bash
cd /data/code/databot/frontend && pnpm add -D stylelint stylelint-config-standard-scss stylelint-config-recess-order postcss-html
```

- [ ] **Step 2: Verify installation**

```bash
cd /data/code/databot/frontend && pnpm ls stylelint stylelint-config-standard-scss stylelint-config-recess-order postcss-html
```

Expected: All four packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore: add stylelint dependencies"
```

---

### Task 2: Create Stylelint Configuration

**Files:**
- Create: `frontend/stylelint.config.js`

- [ ] **Step 1: Create configuration file**

Create `frontend/stylelint.config.js` with this exact content:

```js
export default {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-recess-order',
  ],
  ignoreFiles: ['dist/**'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    // Allow Vue scoped pseudo-classes
    // Currently only :deep() is used; :slotted() and :global() whitelisted for future use
    'selector-pseudo-class-no-unknown': [true, {
      ignorePseudoClasses: ['deep', 'slotted', 'global'],
    }],

    // Disable class pattern — BEM + Element Plus classes coexist
    'selector-class-pattern': null,
  },
};
```

- [ ] **Step 2: Smoke test — lint a single SCSS file**

```bash
cd /data/code/databot/frontend && npx stylelint "src/styles/variables.scss"
```

Expected: Runs without parse errors (lint warnings are OK at this stage).

- [ ] **Step 3: Smoke test — lint a single Vue file**

```bash
cd /data/code/databot/frontend && npx stylelint "src/App.vue"
```

Expected: Runs without parse errors (lint warnings are OK). This verifies postcss-html is working.

- [ ] **Step 4: Commit**

```bash
git add frontend/stylelint.config.js
git commit -m "chore: add stylelint configuration"
```

---

### Task 3: Add NPM Scripts and Update Preflight

**Files:**
- Modify: `frontend/package.json` (scripts section)

- [ ] **Step 1: Add stylelint scripts to package.json**

Add these two scripts to the `scripts` object in `frontend/package.json`:

```json
"stylelint": "stylelint \"src/**/*.{scss,vue}\"",
"stylelint:fix": "stylelint \"src/**/*.{scss,vue}\" --fix"
```

- [ ] **Step 2: Update preflight script**

Replace the current `preflight` script:

```
"preflight": "pnpm run lint:fix && pnpm run lint && pnpm run format && pnpm run format:check && pnpm run typecheck && pnpm run build && pnpm run test"
```

With:

```
"preflight": "pnpm run lint:fix && pnpm run lint && pnpm run stylelint:fix && pnpm run stylelint && pnpm run format && pnpm run format:check && pnpm run typecheck && pnpm run build && pnpm run test"
```

- [ ] **Step 3: Verify scripts are registered**

```bash
cd /data/code/databot/frontend && pnpm run stylelint --help 2>&1 | head -5
```

Expected: Shows stylelint help output (confirms the script resolves).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json
git commit -m "chore: add stylelint scripts and integrate into preflight"
```

---

### Task 4: Fix Plain CSS Style Blocks

**Files:**
- Modify: `frontend/src/components/datafile/TableList.vue:104` — change `<style scoped>` to `<style scoped lang="scss">`
- Modify: `frontend/src/components/workflow/ImportResultDialog.vue:54` — change `<style scoped>` to `<style scoped lang="scss">`

- [ ] **Step 1: Add lang="scss" to TableList.vue**

In `frontend/src/components/datafile/TableList.vue`, line 104, change:

```html
<style scoped>
```

To:

```html
<style scoped lang="scss">
```

- [ ] **Step 2: Add lang="scss" to ImportResultDialog.vue**

In `frontend/src/components/workflow/ImportResultDialog.vue`, line 54, change:

```html
<style scoped>
```

To:

```html
<style scoped lang="scss">
```

- [ ] **Step 3: Verify both files lint without parse errors**

```bash
cd /data/code/databot/frontend && npx stylelint "src/components/datafile/TableList.vue" "src/components/workflow/ImportResultDialog.vue"
```

Expected: Runs without parse errors (lint warnings are OK). Confirms the `lang="scss"` change makes these files parseable by Stylelint.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/datafile/TableList.vue frontend/src/components/workflow/ImportResultDialog.vue
git commit -m "refactor: add lang=\"scss\" to plain CSS style blocks"
```

---

### Task 5: Auto-Fix Existing Violations

**Files:**
- Modify: All `.vue` and `.scss` files under `frontend/src/` (auto-fix only)

- [ ] **Step 1: Run stylelint auto-fix**

```bash
cd /data/code/databot/frontend && pnpm run stylelint:fix
```

Expected: Fixes property ordering, shorthand normalization, and other auto-fixable issues. Note the output — some warnings may remain.

- [ ] **Step 2: Check remaining violations**

```bash
cd /data/code/databot/frontend && pnpm run stylelint 2>&1 | tail -20
```

If violations remain, note them for manual fixing in the next step.

- [ ] **Step 3: Manually fix remaining violations**

For each remaining violation, fix it directly in the source file. Common manual fixes:
- Duplicate declarations: remove the redundant one
- Invalid property values: correct the value
- Unknown properties: verify the property name

Do NOT add `/* stylelint-disable */` comments.

- [ ] **Step 4: Verify clean lint**

```bash
cd /data/code/databot/frontend && pnpm run stylelint
```

Expected: Zero violations — clean exit.

- [ ] **Step 5: Commit**

```bash
cd /data/code/databot/frontend && git add src/ && git diff --cached --stat
```

Review the changed files (should only be `.vue` and `.scss` files under `src/`), then:

```bash
git commit -m "style: fix all existing stylelint violations"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:12`

- [ ] **Step 1: Update static checks line**

In `CLAUDE.md`, line 12, change:

```
- **静态检查**：`ESLint`/`TypeScript Compiler`/`Prettier`
```

To:

```
- **静态检查**：`ESLint`/`Stylelint`/`TypeScript Compiler`/`Prettier`
```

- [ ] **Step 2: Verify the edit**

```bash
grep Stylelint CLAUDE.md
```

Expected: Shows the updated line containing `Stylelint`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Stylelint to frontend static checks in CLAUDE.md"
```

---

### Task 7: Run Full Preflight

- [ ] **Step 1: Run preflight**

```bash
cd /data/code/databot/frontend && pnpm run preflight
```

Expected: All steps pass — ESLint, Stylelint, Prettier, TypeScript, build, and tests all green.

- [ ] **Step 2: If preflight fails, fix issues**

Read the error output, identify which step failed, fix the issue, and re-run preflight until it passes cleanly.

- [ ] **Step 3: Commit any fixes**

If any fixes were needed:

```bash
cd /data/code/databot/frontend && git add -A
git commit -m "fix: resolve preflight issues after stylelint integration"
```
