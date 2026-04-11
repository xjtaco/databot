# Frontend Stylelint Integration Design

## Summary

Add Stylelint to the frontend to lint CSS/SCSS code across `.scss` files and `<style>` blocks in `.vue` files. Covers error detection, coding conventions, logical-group property ordering, and Prettier compatibility.

## Current State

- Frontend uses **SCSS** with **scoped styles** in all Vue components
- **ESLint** (9.x flat config) + **Prettier** already configured
- **No CSS/SCSS linting** exists
- Components follow BEM naming and import design tokens via `@use '@/styles/variables' as *`
- Element Plus classes (`.el-*`) appear throughout
- Two components use plain `<style scoped>` without `lang="scss"`: `TableList.vue` and `ImportResultDialog.vue`

## Dependencies

| Package | Purpose |
|---|---|
| `stylelint` | Core engine |
| `stylelint-config-standard-scss` | SCSS standard rules (includes `stylelint-scss` + `postcss-scss`) |
| `stylelint-config-recess-order` | Logical-group property ordering (position > box model > typography > visual > misc) |
| `postcss-html` | Parses `<style>` blocks in `.vue` files (required — `postcss-scss` alone cannot parse HTML-like files) |

All installed as `devDependencies`.

Note: `stylelint-config-prettier-scss` is omitted — Stylelint 15+ removed all stylistic/formatting rules from core, so there are no conflicts with Prettier to disable.

## Configuration

New file: `frontend/stylelint.config.js` (ESM via project's `"type": "module"`, consistent with `eslint.config.js`)

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

Key decisions:
- `postcss-html` override for `.vue` files — without this, Stylelint cannot parse `<template>`/`<script>`/`<style>` structure
- Vue pseudo-classes (`:deep()`, `:slotted()`, `:global()`) explicitly allowed
- `selector-class-pattern` disabled because BEM naming and Element Plus class names (`.el-*`) cannot be covered by a single regex pattern
- `scss/at-rule-no-unknown` and `at-rule-no-unknown` not set explicitly — `stylelint-config-standard-scss` already configures these correctly
- `ignoreFiles: ['dist/**']` to avoid linting compiled output

## NPM Scripts

Add to `frontend/package.json` scripts:

```json
"stylelint": "stylelint \"src/**/*.{scss,vue}\"",
"stylelint:fix": "stylelint \"src/**/*.{scss,vue}\" --fix"
```

## Preflight Integration

Update the existing `preflight` script to include Stylelint between ESLint and Prettier:

```
pnpm run lint:fix && pnpm run lint && pnpm run stylelint:fix && pnpm run stylelint && pnpm run format && pnpm run format:check && pnpm run typecheck && pnpm run build && pnpm run test
```

Execution order:
1. ESLint fix + check
2. **Stylelint fix + check** (new)
3. Prettier format + check
4. TypeScript typecheck
5. Build
6. Tests

## CLAUDE.md Update

Update the frontend static checks line from:

> `ESLint`/`TypeScript Compiler`/`Prettier`

To:

> `ESLint`/`Stylelint`/`TypeScript Compiler`/`Prettier`

## Existing Code Migration

1. Add `lang="scss"` to the two plain CSS `<style>` blocks (`TableList.vue`, `ImportResultDialog.vue`) for consistency
2. Run `pnpm run stylelint:fix` to auto-fix mechanical issues (property ordering, shorthand normalization, etc.) — expected to resolve 80%+ of violations
3. Manually fix remaining logical issues (invalid values, duplicate declarations)
4. No `/* stylelint-disable */` comments — all rules enforced from day one

## Scope

- **In scope**: Stylelint config, npm scripts, preflight integration, CLAUDE.md update, existing code fix
- **Out of scope**: VS Code integration, Git pre-commit hooks, custom rule authoring
