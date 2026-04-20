# Frontend Precision Console Redesign Design

## Purpose

Redesign the DataBot frontend into a cohesive Precision Console: dark, restrained, dense, and optimized for AI-assisted data operations. The work covers both desktop and mobile.

The approved scope is "Shell + Key Surfaces": redesign the application shell and high-visibility page surfaces without rewriting every deep business component.

## Visual Direction

DataBot should feel like a professional working console, not a marketing page. The interface should prioritize state, speed, and control.

Visual principles:

- Deep neutral surfaces with clear layering.
- Orange retained as the single accent for primary actions, active navigation, and important state.
- Fewer card treatments; prefer structural panels, separators, plain layout, and page-level hierarchy.
- Compact spacing on desktop while keeping touch targets stable on mobile.
- Typography should be practical and readable. Avoid decorative headings in routine product UI.

## Desktop Information Architecture

Desktop keeps the existing left icon rail and main workspace model.

Changes:

- Make the left rail visually quieter, with stronger active state and more consistent icon button dimensions.
- Make the main workspace a single console surface with page-level background and subtle panel separation.
- Standardize page headers across chat, workflow, data management, schedules, settings, users, and audit logs.
- Keep the current navigation model and emitted events unchanged.

The default chat screen should feel like the primary command surface:

- Header shows the current chat context and operational status.
- Message list uses a constrained reading width with enough density for long sessions.
- Empty state should orient the user without looking like a landing page.
- Input becomes a stable command bar with clear focus, send, and stop states.

## Mobile Information Architecture

Mobile should be a focused single-task console, not a compressed desktop.

Changes:

- Keep the existing mobile drawer navigation.
- Restyle mobile drawer, overlay, top bars, sheets, and bottom input with consistent tokens.
- Keep safe-area handling for bottom input and full-screen workflow modes.
- Standardize mobile page headers for data management, workflow, schedule, settings, users, and audit logs.
- Avoid adding persistent secondary panels on mobile.

## In Scope

- Global SCSS design tokens and CSS variables.
- Dark theme variable tuning.
- `DesktopLayout.vue`, `MobileLayout.vue`, and related shell styles.
- Sidebar and icon navigation styling.
- Chat container, header, message list, and input styling.
- Key page container styling for:
  - Data management
  - Workflow
  - Schedule
  - Settings
  - User management
  - Audit log
- Shared Element Plus overrides needed to make drawers, dialogs, buttons, and inputs match the new console style.

## Out of Scope

- Rewriting business logic or stores.
- Replacing Element Plus.
- Redesigning every nested form, table cell, drawer body, and node configuration component in detail.
- Changing API contracts.
- Changing routing or permission behavior.
- Introducing a light theme redesign.

## Motion

Motion should support hierarchy and feedback, not decoration.

Required motion patterns:

- Short slide/fade transitions for mobile drawer and app overlays.
- Fast hover and active transitions for navigation, buttons, and list rows.
- Subtle fade/translate entrance for new chat messages and transient tool state.

Avoid long animation sequences, decorative ambient motion, or scroll effects that interfere with operational use.

## Component Boundaries

The implementation should preserve existing component responsibilities:

- Layout components decide desktop versus mobile shell.
- Sidebar components remain responsible for navigation and user commands.
- Chat components remain responsible for status, message list, and input.
- Workflow and data management keep their existing desktop/mobile branch logic.
- Page components receive visual consistency through class styles and shared tokens, not through broad behavioral refactors.

If a component file is very large, only change styles or small markup needed for the redesign. Do not split components unless required to complete the visual work safely.

## Accessibility And Responsiveness

Requirements:

- Maintain readable contrast on all dark surfaces.
- Preserve keyboard focus visibility.
- Keep icon buttons at stable dimensions.
- On mobile, prevent text clipping in headers, tabs, and action buttons.
- Respect `env(safe-area-inset-bottom)` for bottom input or fixed actions.
- Verify 1440px desktop and 390px mobile layouts.

## Testing And Verification

Minimum verification:

- `pnpm run typecheck`
- `pnpm run build`
- Browser verification with desktop and mobile viewport screenshots for:
  - Chat
  - Data management
  - Workflow

Run targeted component tests if markup changes affect component behavior or snapshots.

## Risks

- Existing nested components may still carry older visual patterns after the first pass. This is acceptable within the approved scope if the shell and key surfaces are cohesive.
- Element Plus defaults can leak into drawers and popovers. Add scoped global overrides only where necessary.
- Mobile workflow screens have unique interaction constraints; style changes must not reduce tap target size or hide existing actions.

## Success Criteria

- The app immediately reads as one cohesive DataBot console on both desktop and mobile.
- The chat surface looks like the primary AI data command workspace.
- Workflow and data management no longer feel visually separate from chat.
- The redesign does not change business behavior, navigation semantics, or API usage.
- Verification commands pass, or any failure is documented with the exact cause.
