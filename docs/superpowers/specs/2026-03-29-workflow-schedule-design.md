# Workflow Scheduled Tasks Design

## Overview

Add a scheduled tasks feature that allows users to configure workflows to run on recurring schedules. The feature includes a new top-level navigation page (Desktop table view + Mobile card view), a config dialog for creating/editing schedules, and an in-process cron-based scheduling engine.

Reference design: `design/databot.pen` — frames "Desktop - Scheduled Tasks", "Desktop - Schedule Config Dialog", "Mobile - Scheduled Tasks", "Mobile - Schedule Config Dialog".

## Decisions

- **Scheduling approach**: In-process using `node-cron`. Schedules persisted in database; restored on server startup.
- **Failure behavior**: Failed executions update `lastRunStatus` to "failed" but the schedule continues. Next trigger runs as normal.
- **Parameter overrides**: Reuse existing workflow `ParamDefinition` system. Dynamic variables (`{{today}}`, `{{today - 30d}}`) resolved at execution time.
- **Cron input**: Cron tab provides text input with real-time "next execution time" preview via `cron-parser`.
- **Module placement**: All schedule code lives within `backend/src/workflow/` (approach A — tightly coupled with workflow module).

## Data Model

New Prisma model `WorkflowSchedule`:

```prisma
model WorkflowSchedule {
  id            String    @id @default(uuid()) @db.Uuid
  name          String    @db.VarChar(255)
  description   String    @default("") @db.Text
  workflowId    String    @map("workflow_id") @db.Uuid
  workflow      Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  scheduleType  String    @map("schedule_type") @db.VarChar(20) // "daily" | "weekly" | "monthly" | "cron"
  cronExpr      String    @map("cron_expr") @db.VarChar(100) // All types stored as cron expression
  timezone      String    @default("Asia/Shanghai") @db.VarChar(50)
  params        String    @default("{}") @db.Text // JSON: Record<string, string>
  enabled       Boolean   @default(true)
  lastRunId     String?   @map("last_run_id") @db.Uuid
  lastRunStatus String?   @map("last_run_status") @db.VarChar(20)
  lastRunAt     DateTime? @map("last_run_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@index([workflowId])
  @@map("workflow_schedules")
}
```

Key points:
- All schedule types (daily/weekly/monthly/cron) are converted to cron expressions for storage. `scheduleType` preserves the original mode for UI restoration.
- `onDelete: Cascade` — deleting a workflow removes its schedules.
- `lastRunStatus` is denormalized to avoid JOINs on the list page.
- `lastRunId` is intentionally **not** a foreign key relation. It is a denormalized reference that may point to a deleted run (e.g., after old runs are cleaned up).
- `params` stores JSON as `Record<string, string>` — matching `executeWorkflow`'s input type. The form UI reads `ParamDefinition` from the workflow for labels/types, but only stores the overridden string values.
- `Workflow` model gains a reverse relation: `schedules WorkflowSchedule[]`.
- Column naming, type annotations, and index follow existing Prisma schema conventions (`@map`, `@db.*`, `@@index`, `@@map`).

## Backend API

### Routes

Mounted under `/workflows/schedules`. The `scheduleRoutes` are imported in `workflow.routes.ts` and mounted via `router.use('/schedules', scheduleRoutes)` **before** the `/:id` catch-all route to avoid path conflicts.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/workflows/schedules` | Create a scheduled task |
| GET | `/workflows/schedules` | List all (with lastRun info) |
| GET | `/workflows/schedules/:id` | Get details |
| PUT | `/workflows/schedules/:id` | Update (including enable/disable) |
| DELETE | `/workflows/schedules/:id` | Delete |

### Integration

- **Route mounting**: Import `scheduleRoutes` in `workflow.routes.ts` and register `router.use('/schedules', scheduleRoutes)` before any `/:id` parametric routes to avoid path ambiguity.
- **Server startup**: Call `initScheduleEngine()` in the server entry point (`backend/src/index.ts`), after database connection is ready, following the `startWorkspaceCleanup()` pattern.
- **Graceful shutdown**: Call `stopAllSchedules()` alongside `stopWorkspaceCleanup()` in the shutdown handler.
- **Module exports**: Export `initScheduleEngine`, `stopAllSchedules`, and `scheduleRoutes` from `backend/src/workflow/index.ts`.

### New Dependencies

- `node-cron` — In-process cron scheduling (backend)
- `cron-parser` — Cron expression parsing and next-run-time computation (used in both backend for validation and frontend for preview)

### DTO Types (`schedule.types.ts`)

Key request/response types to define:

- `CreateScheduleInput` — `{ name, description?, workflowId, scheduleType, cronExpr, timezone, params?, enabled? }`
- `UpdateScheduleInput` — Same as create (all fields optional except id)
- `ScheduleListItem` — `{ id, name, description, workflowId, workflowName, scheduleType, cronExpr, timezone, enabled, lastRunId?, lastRunStatus?, lastRunAt?, createdAt }`
- `ScheduleDetail` — Full model fields including `params`

### File Structure

New files in `backend/src/workflow/`:

| File | Responsibility |
|------|---------------|
| `schedule.types.ts` | Type definitions, validators, ScheduleType constants |
| `schedule.controller.ts` | HTTP request handlers |
| `schedule.service.ts` | Business logic (CRUD + scheduling lifecycle) |
| `schedule.repository.ts` | Prisma database operations |
| `schedule.routes.ts` | Express route definitions |
| `scheduleEngine.ts` | Cron scheduling engine (core) |

### Scheduling Engine (`scheduleEngine.ts`)

Manages in-memory cron job instances, synchronized with the database.

```
Key functions:
- initScheduleEngine()         — Called at server startup; loads all enabled schedules from DB, registers cron jobs
- registerSchedule(schedule)   — Creates a cron job instance with execution callback
- unregisterSchedule(id)       — Stops and removes a cron job
- updateSchedule(id, schedule) — Unregister then register (atomic update)
- stopAllSchedules()           — Called during graceful shutdown

Execution callback:
1. Resolve dynamic variables in params ({{today}}, {{today - 30d}}, etc.) at execution time
2. Call executionEngine.executeWorkflow(workflowId, resolvedParams)
3. Get runId, update schedule's lastRunId and lastRunAt
4. Listen for execution completion, update lastRunStatus
```

**Concurrency**: The existing `executionEngine.executeWorkflow()` throws `WorkflowExecutionError` when a workflow is already executing. The schedule engine catches this specific error and treats it as a skip — logs a warning, does **not** update `lastRunStatus`, and lets the next scheduled trigger proceed normally.

**Dynamic variable resolution**: Date variables (`{{today}}`, `{{today - 30d}}`, etc.) are resolved in a **separate** function within `scheduleEngine.ts`, not by extending `templateResolver`. This avoids namespace collisions with the existing `{{node_name.field_path}}` template syntax. The schedule engine resolves date variables in `params` values before passing them to `executeWorkflow`. Variables are resolved at execution time (not creation time) to ensure each run uses the current date.

## Frontend Architecture

### Navigation

New "Schedule" nav item (lucide `timer` icon) in the sidebar IconBar, at the same level as Chat / Workflow / Settings. Both `DesktopLayout.vue` and `MobileLayout.vue` add the nav entry and page routing logic.

### New Files

| File | Responsibility |
|------|---------------|
| `api/schedule.ts` | HTTP client (CRUD) |
| `types/schedule.ts` | TypeScript type definitions |
| `stores/scheduleStore.ts` | Pinia store (list, CRUD, state) |
| `components/schedule/SchedulePage.vue` | Main page (desktop table + mobile cards) |
| `components/schedule/ScheduleTable.vue` | Desktop table component |
| `components/schedule/ScheduleCardList.vue` | Mobile card list |
| `components/schedule/ScheduleDialog.vue` | Desktop create/edit modal |
| `components/schedule/ScheduleSheet.vue` | Mobile bottom sheet form |
| `components/schedule/ScheduleForm.vue` | Shared form logic (used by both dialog and sheet) |
| `components/schedule/CronPreview.vue` | Cron expression next-execution-time preview |

### State Management (`scheduleStore.ts`)

```
State:
- schedules: ScheduleListItem[]
- formVisible: boolean
- editingSchedule: Schedule | null  (null = creating new)

Actions:
- fetchSchedules()
- createSchedule(input)
- updateSchedule(id, input)
- deleteSchedule(id)
- toggleEnabled(id)
```

### Form Interaction

1. Selecting a Workflow auto-loads its parameter definitions.
2. Schedule Type tabs switch between four modes:
   - **Daily**: Time + Timezone pickers
   - **Weekly**: Day-of-week selector + Time + Timezone
   - **Monthly**: Day-of-month selector (1-31) + Time + Timezone
   - **Cron**: Cron expression text input + `CronPreview` (real-time next execution time)
3. Parameters section: Displays the selected workflow's defined params; user can override values; supports `{{today}}` dynamic variables.

### i18n

All user-facing strings defined in `locales/zh-CN.ts` and `locales/en-US.ts` with `schedule.` key prefix.

## Error Handling

New error types in `backend/src/errors/`:

| Error | Scenario | HTTP Status |
|-------|----------|-------------|
| `ScheduleNotFoundError` | Query/update/delete non-existent schedule | 404 |
| `ScheduleValidationError` | Invalid cron expression, workflow not found, missing required fields | 400 |

New E-codes added sequentially in `errorCode.ts`.

Runtime errors in the scheduling engine (execution failures, concurrency conflicts):
- Log via `logger` (not thrown)
- Update `lastRunStatus` to `"failed"`
- Schedule continues (next trigger still fires)

## Testing

### Backend (`backend/tests/`)

| Test File | Coverage |
|-----------|----------|
| `schedule.service.test.ts` | CRUD logic, param validation, cron expression validation |
| `scheduleEngine.test.ts` | Register/unregister/update cron jobs, startup recovery, concurrency skip, dynamic variable resolution |
| `schedule.controller.test.ts` | Request param validation, response format |

### Frontend (`frontend/tests/`)

| Test File | Coverage |
|-----------|----------|
| `scheduleStore.test.ts` | Store CRUD operations, state transitions |
| `ScheduleForm.test.ts` | Schedule type switching, param loading, cron preview |

### Key Test Scenarios

- Friendly mode conversion (daily/weekly/monthly <-> cron expression)
- Schedule recovery after server restart
- Cascade cleanup when workflow is deleted
- Dynamic variable `{{today}}` resolved at execution time, not creation time
- Concurrent execution skip when previous run is still active
