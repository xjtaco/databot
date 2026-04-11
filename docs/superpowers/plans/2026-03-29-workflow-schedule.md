# Workflow Scheduled Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scheduled tasks feature that lets users configure workflows to run on recurring cron schedules, with a dedicated management page (desktop table + mobile cards), config dialog, and in-process scheduling engine.

**Architecture:** New `WorkflowSchedule` Prisma model stores schedule config. Backend `scheduleEngine.ts` manages in-memory `node-cron` jobs synchronized with the database. CRUD API at `/workflows/schedules`. Frontend adds a new top-level "Schedule" nav page with table/card views and a create/edit dialog. All backend code lives in `backend/src/workflow/` alongside existing workflow files.

**Tech Stack:** node-cron (scheduling), cron-parser (validation + next-run preview), Prisma (persistence), Express v5 (API), Vue 3 + Element Plus + Pinia (frontend)

**Spec:** `docs/superpowers/specs/2026-03-29-workflow-schedule-design.md`

---

## File Map

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/src/workflow/schedule.types.ts` | Constants, DTO types, validators |
| `backend/src/workflow/schedule.repository.ts` | Prisma database operations |
| `backend/src/workflow/schedule.service.ts` | Business logic (CRUD + scheduling lifecycle) |
| `backend/src/workflow/schedule.controller.ts` | HTTP request handlers |
| `backend/src/workflow/schedule.routes.ts` | Express route definitions |
| `backend/src/workflow/scheduleEngine.ts` | Cron scheduling engine |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `WorkflowSchedule` model, add `schedules` relation to `Workflow` |
| `backend/src/errors/errorCode.ts` | Add `SCHEDULE_NOT_FOUND`, `SCHEDULE_VALIDATION_ERROR` codes |
| `backend/src/errors/types.ts` | Add `ScheduleNotFoundError`, `ScheduleValidationError` classes |
| `backend/src/workflow/workflow.routes.ts` | Mount `scheduleRoutes` before `/:id` catch-all |
| `backend/src/workflow/index.ts` | Export schedule routes and engine lifecycle functions |
| `backend/src/index.ts` | Call `initScheduleEngine()` on startup, `stopAllSchedules()` on shutdown |
| `backend/package.json` | Add `node-cron`, `cron-parser`, and their `@types/*` |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/types/schedule.ts` | TypeScript type definitions |
| `frontend/src/api/schedule.ts` | HTTP client (CRUD) |
| `frontend/src/stores/scheduleStore.ts` | Pinia store |
| `frontend/src/components/schedule/SchedulePage.vue` | Main page (desktop table + mobile cards) |
| `frontend/src/components/schedule/ScheduleTable.vue` | Desktop table component |
| `frontend/src/components/schedule/ScheduleCardList.vue` | Mobile card list |
| `frontend/src/components/schedule/ScheduleDialog.vue` | Desktop create/edit modal |
| `frontend/src/components/schedule/ScheduleSheet.vue` | Mobile bottom sheet form |
| `frontend/src/components/schedule/ScheduleForm.vue` | Shared form logic |
| `frontend/src/components/schedule/CronPreview.vue` | Cron next-execution preview |
| `frontend/src/components/schedule/index.ts` | Barrel export |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/types/sidebar.ts` | Add `'schedule'` to `NavType` union |
| `frontend/src/components/sidebar/IconBar.vue` | Add Schedule nav item (Timer icon) |
| `frontend/src/layouts/DesktopLayout.vue` | Add `showSchedule` computed + `SchedulePage` render |
| `frontend/src/layouts/MobileLayout.vue` | Same as desktop layout |
| `frontend/src/stores/index.ts` | Export `useScheduleStore` |
| `frontend/src/locales/zh-CN.ts` | Add `schedule.*` keys |
| `frontend/src/locales/en-US.ts` | Add `schedule.*` keys |
| `frontend/package.json` | Add `cron-parser` |

### Test Files
| File | Coverage |
|------|----------|
| `backend/tests/workflow/schedule.service.test.ts` | CRUD logic, validation |
| `backend/tests/workflow/scheduleEngine.test.ts` | Cron lifecycle, variable resolution, concurrency |
| `frontend/tests/stores/scheduleStore.test.ts` | Store CRUD, state transitions |

---

## Task 1: Database Schema & Dependencies

**Files:**
- Modify: `backend/prisma/schema.prisma:132-144` (Workflow model), append after line 231
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

- [ ] **Step 1: Add WorkflowSchedule model to Prisma schema**

Add reverse relation to the Workflow model (after line 141, after `runs WorkflowRun[]`):

```prisma
  schedules WorkflowSchedule[]
```

Append after the last model (after line 231):

```prisma
model WorkflowSchedule {
  id            String    @id @default(uuid()) @db.Uuid
  name          String    @db.VarChar(255)
  description   String    @default("") @db.Text
  workflowId    String    @map("workflow_id") @db.Uuid
  workflow      Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  scheduleType  String    @map("schedule_type") @db.VarChar(20)
  cronExpr      String    @map("cron_expr") @db.VarChar(100)
  timezone      String    @default("Asia/Shanghai") @db.VarChar(50)
  params        String    @default("{}") @db.Text
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

- [ ] **Step 2: Install backend dependencies**

```bash
cd backend && pnpm add node-cron cron-parser && pnpm add -D @types/node-cron
```

- [ ] **Step 3: Install frontend dependency**

```bash
cd frontend && pnpm add cron-parser
```

- [ ] **Step 4: Run Prisma migration**

```bash
cd backend && pnpm prisma migrate dev --name add_workflow_schedule
```

- [ ] **Step 5: Generate Prisma client**

```bash
cd backend && pnpm prisma generate
```

- [ ] **Step 6: Verify — run backend preflight**

```bash
cd backend && pnpm run preflight
```
Expected: passes (no compile errors from new model)

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/ backend/package.json backend/pnpm-lock.yaml frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(schedule): add WorkflowSchedule schema and dependencies"
```

---

## Task 2: Error Codes & Error Types

**Files:**
- Modify: `backend/src/errors/errorCode.ts:3,40`
- Modify: `backend/src/errors/types.ts:271` (append after last error class)

- [ ] **Step 1: Write failing test for new error types**

Create `backend/tests/workflow/schedule.service.test.ts` with initial error type import test:

```typescript
import { describe, it, expect } from 'vitest';
import { ScheduleNotFoundError, ScheduleValidationError } from '@/errors/types';
import { ErrorCode } from '@/errors/errorCode';

describe('schedule error types', () => {
  it('should create ScheduleNotFoundError with correct code and status', () => {
    const error = new ScheduleNotFoundError('Schedule not found');
    expect(error.code).toBe(ErrorCode.SCHEDULE_NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Schedule not found');
    expect(error).toBeInstanceOf(ScheduleNotFoundError);
  });

  it('should create ScheduleValidationError with correct code and status', () => {
    const error = new ScheduleValidationError('Invalid cron expression');
    expect(error.code).toBe(ErrorCode.SCHEDULE_VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid cron expression');
    expect(error).toBeInstanceOf(ScheduleValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: FAIL — `ScheduleNotFoundError` not found in `@/errors/types`

- [ ] **Step 3: Add error codes**

In `backend/src/errors/errorCode.ts`, update line 3 comment to `LAST_USED_CODE: E00037`, and add after line 40 (before `} as const`):

```typescript
  SCHEDULE_NOT_FOUND: 'E00036',
  SCHEDULE_VALIDATION_ERROR: 'E00037',
```

- [ ] **Step 4: Add error classes**

In `backend/src/errors/types.ts`, append at the end of the file (after line 271, after `CopilotAgentLoopError`):

```typescript
export class ScheduleNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.SCHEDULE_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, ScheduleNotFoundError.prototype);
  }
}

export class ScheduleValidationError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.SCHEDULE_VALIDATION_ERROR,
      HttpStatusCode.BAD_REQUEST,
      details,
      cause
    );
    Object.setPrototypeOf(this, ScheduleValidationError.prototype);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/errors/ backend/tests/workflow/schedule.service.test.ts
git commit -m "feat(schedule): add schedule error codes and error types"
```

---

## Task 3: Backend Types (`schedule.types.ts`)

**Files:**
- Create: `backend/src/workflow/schedule.types.ts`

- [ ] **Step 1: Add tests for type validators**

Append to `backend/tests/workflow/schedule.service.test.ts`:

```typescript
import {
  ScheduleType,
  isValidScheduleType,
  isValidCronExpr,
} from '@/workflow/schedule.types';

describe('schedule type validators', () => {
  it('should validate schedule types', () => {
    expect(isValidScheduleType('daily')).toBe(true);
    expect(isValidScheduleType('weekly')).toBe(true);
    expect(isValidScheduleType('monthly')).toBe(true);
    expect(isValidScheduleType('cron')).toBe(true);
    expect(isValidScheduleType('hourly')).toBe(false);
    expect(isValidScheduleType('')).toBe(false);
  });

  it('should validate cron expressions', () => {
    expect(isValidCronExpr('0 8 * * *')).toBe(true);
    expect(isValidCronExpr('0 9 * * 1')).toBe(true);
    expect(isValidCronExpr('invalid')).toBe(false);
    expect(isValidCronExpr('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: FAIL — module `@/workflow/schedule.types` not found

- [ ] **Step 3: Implement schedule.types.ts**

Create `backend/src/workflow/schedule.types.ts`:

```typescript
import parser from 'cron-parser';

export const ScheduleType = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  Cron: 'cron',
} as const;

export type ScheduleTypeValue = (typeof ScheduleType)[keyof typeof ScheduleType];

const validScheduleTypes = new Set<string>(Object.values(ScheduleType));

export function isValidScheduleType(type: string): type is ScheduleTypeValue {
  return validScheduleTypes.has(type);
}

export function isValidCronExpr(expr: string): boolean {
  if (!expr) return false;
  try {
    parser.parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  workflowId: string;
  scheduleType: ScheduleTypeValue;
  cronExpr: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  workflowId?: string;
  scheduleType?: ScheduleTypeValue;
  cronExpr?: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}

export interface ScheduleListItem {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  workflowName: string;
  scheduleType: ScheduleTypeValue;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface ScheduleDetail extends ScheduleListItem {
  params: Record<string, string>;
  updatedAt: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/workflow/schedule.types.ts backend/tests/workflow/schedule.service.test.ts
git commit -m "feat(schedule): add schedule types, DTOs, and validators"
```

---

## Task 4: Backend Repository (`schedule.repository.ts`)

**Files:**
- Create: `backend/src/workflow/schedule.repository.ts`

- [ ] **Step 1: Create schedule.repository.ts**

Follow the pattern from `workflow.repository.ts` — import Prisma client, define mapper functions, implement CRUD operations:

```typescript
import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import type { ScheduleListItem, ScheduleDetail, CreateScheduleInput, UpdateScheduleInput } from './schedule.types';

type PrismaScheduleWithWorkflow = Prisma.WorkflowScheduleGetPayload<{
  include: { workflow: { select: { name: true } } };
}>;

function mapScheduleListItem(row: PrismaScheduleWithWorkflow): ScheduleListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowId: row.workflowId,
    workflowName: row.workflow.name,
    scheduleType: row.scheduleType as ScheduleListItem['scheduleType'],
    cronExpr: row.cronExpr,
    timezone: row.timezone,
    enabled: row.enabled,
    lastRunId: row.lastRunId,
    lastRunStatus: row.lastRunStatus,
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
  };
}

function mapScheduleDetail(row: PrismaScheduleWithWorkflow): ScheduleDetail {
  return {
    ...mapScheduleListItem(row),
    params: JSON.parse(row.params) as Record<string, string>,
    updatedAt: row.updatedAt,
  };
}

const includeWorkflow = { workflow: { select: { name: true } } } as const;

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  const prisma = getPrismaClient();
  const row = await prisma.workflowSchedule.create({
    data: {
      name: input.name,
      description: input.description ?? '',
      workflowId: input.workflowId,
      scheduleType: input.scheduleType,
      cronExpr: input.cronExpr,
      timezone: input.timezone ?? 'Asia/Shanghai',
      params: JSON.stringify(input.params ?? {}),
      enabled: input.enabled ?? true,
    },
    include: includeWorkflow,
  });
  return mapScheduleDetail(row);
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.workflowSchedule.findMany({
    include: includeWorkflow,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapScheduleListItem);
}

export async function getScheduleById(id: string): Promise<ScheduleDetail | null> {
  const prisma = getPrismaClient();
  const row = await prisma.workflowSchedule.findUnique({
    where: { id },
    include: includeWorkflow,
  });
  return row ? mapScheduleDetail(row) : null;
}

export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<ScheduleDetail> {
  const prisma = getPrismaClient();
  const data: Prisma.WorkflowScheduleUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.workflowId !== undefined) data.workflow = { connect: { id: input.workflowId } };
  if (input.scheduleType !== undefined) data.scheduleType = input.scheduleType;
  if (input.cronExpr !== undefined) data.cronExpr = input.cronExpr;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.params !== undefined) data.params = JSON.stringify(input.params);
  if (input.enabled !== undefined) data.enabled = input.enabled;

  const row = await prisma.workflowSchedule.update({
    where: { id },
    data,
    include: includeWorkflow,
  });
  return mapScheduleDetail(row);
}

export async function deleteSchedule(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.delete({ where: { id } });
}

export async function updateLastRun(
  id: string,
  runId: string,
  status: string,
  runAt: Date
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.update({
    where: { id },
    data: { lastRunId: runId, lastRunStatus: status, lastRunAt: runAt },
  });
}

export async function updateLastRunStatus(id: string, status: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.update({
    where: { id },
    data: { lastRunStatus: status },
  });
}

export async function listEnabledSchedules(): Promise<ScheduleDetail[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.workflowSchedule.findMany({
    where: { enabled: true },
    include: includeWorkflow,
  });
  return rows.map(mapScheduleDetail);
}
```

- [ ] **Step 2: Run backend preflight to verify compilation**

```bash
cd backend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/schedule.repository.ts
git commit -m "feat(schedule): add schedule repository with Prisma operations"
```

---

## Task 5: Schedule Engine (`scheduleEngine.ts`)

**Files:**
- Create: `backend/src/workflow/scheduleEngine.ts`
- Create: `backend/tests/workflow/scheduleEngine.test.ts`

- [ ] **Step 1: Write failing tests for date variable resolution**

Create `backend/tests/workflow/scheduleEngine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/workflow/schedule.repository');
vi.mock('@/workflow/executionEngine');
vi.mock('node-cron');

import { resolveDateVariables } from '@/workflow/scheduleEngine';

describe('scheduleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('resolveDateVariables', () => {
    it('should resolve {{today}} to current date', () => {
      const result = resolveDateVariables({ date: '{{today}}' });
      expect(result.date).toBe('2026-03-29');
    });

    it('should resolve {{today - 30d}} to 30 days ago', () => {
      const result = resolveDateVariables({ start: '{{today - 30d}}' });
      expect(result.start).toBe('2026-02-27');
    });

    it('should resolve {{today + 7d}} to 7 days ahead', () => {
      const result = resolveDateVariables({ end: '{{today + 7d}}' });
      expect(result.end).toBe('2026-04-05');
    });

    it('should leave non-variable values unchanged', () => {
      const result = resolveDateVariables({ key: 'plain-value' });
      expect(result.key).toBe('plain-value');
    });

    it('should handle empty params', () => {
      const result = resolveDateVariables({});
      expect(result).toEqual({});
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm vitest run tests/workflow/scheduleEngine.test.ts
```
Expected: FAIL — module `@/workflow/scheduleEngine` not found

- [ ] **Step 3: Write tests for schedule lifecycle**

Append to `backend/tests/workflow/scheduleEngine.test.ts`:

```typescript
import {
  initScheduleEngine,
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
} from '@/workflow/scheduleEngine';
import * as repository from '@/workflow/schedule.repository';
import * as executionEngine from '@/workflow/executionEngine';
import cron from 'node-cron';
import type { ScheduleDetail } from '@/workflow/schedule.types';

const makeSchedule = (overrides: Partial<ScheduleDetail> = {}): ScheduleDetail => ({
  id: 'sched-1',
  name: 'Test Schedule',
  description: '',
  workflowId: 'wf-1',
  workflowName: 'Test Workflow',
  scheduleType: 'daily',
  cronExpr: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lastRunId: null,
  lastRunStatus: null,
  lastRunAt: null,
  createdAt: new Date(),
  params: {},
  updatedAt: new Date(),
  ...overrides,
});

describe('schedule lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAllSchedules();
  });

  it('should register a cron job for a schedule', () => {
    const schedule = makeSchedule();
    registerSchedule(schedule);
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 8 * * *',
      expect.any(Function),
      expect.objectContaining({ timezone: 'Asia/Shanghai' })
    );
  });

  it('should unregister a cron job', () => {
    const schedule = makeSchedule();
    registerSchedule(schedule);
    unregisterSchedule('sched-1');
    // The mock cron task's stop() should have been called
    const mockTask = vi.mocked(cron.schedule).mock.results[0].value;
    expect(mockTask.stop).toHaveBeenCalled();
  });

  it('should load enabled schedules on init', async () => {
    const schedules = [makeSchedule(), makeSchedule({ id: 'sched-2', cronExpr: '0 9 * * 1' })];
    vi.mocked(repository.listEnabledSchedules).mockResolvedValue(schedules);

    await initScheduleEngine();

    expect(repository.listEnabledSchedules).toHaveBeenCalled();
    expect(cron.schedule).toHaveBeenCalledTimes(2);
  });

  it('should stop all jobs on stopAllSchedules', () => {
    registerSchedule(makeSchedule({ id: 's1' }));
    registerSchedule(makeSchedule({ id: 's2' }));
    stopAllSchedules();
    const results = vi.mocked(cron.schedule).mock.results;
    expect(results[0].value.stop).toHaveBeenCalled();
    expect(results[1].value.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Implement scheduleEngine.ts**

Create `backend/src/workflow/scheduleEngine.ts`:

```typescript
import cron, { type ScheduledTask } from 'node-cron';
import logger from '../utils/logger';
import { WorkflowExecutionError } from '../errors/types';
import type { ScheduleDetail } from './schedule.types';
import * as repository from './schedule.repository';

const activeTasks = new Map<string, ScheduledTask>();

const DATE_VAR_REGEX = /\{\{today(?:\s*([+-])\s*(\d+)d)?\}\}/g;

export function resolveDateVariables(params: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const now = new Date();

  for (const [key, value] of Object.entries(params)) {
    resolved[key] = value.replace(DATE_VAR_REGEX, (_match, op?: string, days?: string) => {
      const date = new Date(now);
      if (op && days) {
        const offset = parseInt(days, 10) * (op === '-' ? -1 : 1);
        date.setDate(date.getDate() + offset);
      }
      return date.toISOString().slice(0, 10);
    });
  }

  return resolved;
}

export function registerSchedule(schedule: ScheduleDetail): void {
  // Unregister existing if present (idempotent)
  unregisterSchedule(schedule.id);

  const task = cron.schedule(
    schedule.cronExpr,
    async () => {
      await executeScheduledWorkflow(schedule);
    },
    { timezone: schedule.timezone }
  );

  activeTasks.set(schedule.id, task);
  logger.info('Registered schedule', { scheduleId: schedule.id, name: schedule.name, cronExpr: schedule.cronExpr });
}

export function unregisterSchedule(id: string): void {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
    logger.info('Unregistered schedule', { scheduleId: id });
  }
}

export async function initScheduleEngine(): Promise<void> {
  const schedules = await repository.listEnabledSchedules();
  for (const schedule of schedules) {
    registerSchedule(schedule);
  }
  logger.info('Schedule engine initialized', { count: schedules.length });
}

export function stopAllSchedules(): void {
  for (const [id, task] of activeTasks) {
    task.stop();
    logger.info('Stopped schedule', { scheduleId: id });
  }
  activeTasks.clear();
}

async function executeScheduledWorkflow(schedule: ScheduleDetail): Promise<void> {
  const { executeWorkflow } = await import('./executionEngine');

  try {
    const resolvedParams = resolveDateVariables(schedule.params);
    const { runId, promise } = await executeWorkflow(schedule.workflowId, resolvedParams);
    const runAt = new Date();

    await repository.updateLastRun(schedule.id, runId, 'running', runAt);
    logger.info('Schedule triggered workflow', {
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      runId,
    });

    // Listen for completion in background
    promise
      .then(() => repository.updateLastRunStatus(schedule.id, 'completed'))
      .catch(async (err: unknown) => {
        logger.error('Scheduled workflow execution failed', {
          scheduleId: schedule.id,
          runId,
          error: err instanceof Error ? err.message : String(err),
        });
        await repository.updateLastRunStatus(schedule.id, 'failed');
      });
  } catch (err: unknown) {
    if (err instanceof WorkflowExecutionError && /already executing/i.test(err.message)) {
      logger.warn('Schedule skipped: workflow already executing', {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
      });
      return; // Skip — do NOT update lastRunStatus
    }
    logger.error('Schedule execution error', {
      scheduleId: schedule.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await repository.updateLastRunStatus(schedule.id, 'failed');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/workflow/scheduleEngine.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/scheduleEngine.ts backend/tests/workflow/scheduleEngine.test.ts
git commit -m "feat(schedule): add schedule engine with cron lifecycle and date variables"
```

---

## Task 6: Backend Service (`schedule.service.ts`)

**Files:**
- Create: `backend/src/workflow/schedule.service.ts`
- Modify: `backend/tests/workflow/schedule.service.test.ts`

- [ ] **Step 1: Add service tests**

Append to `backend/tests/workflow/schedule.service.test.ts`:

```typescript
vi.mock('@/workflow/schedule.repository');
vi.mock('@/workflow/workflow.repository');
vi.mock('@/workflow/scheduleEngine');

import * as scheduleService from '@/workflow/schedule.service';
import * as scheduleRepo from '@/workflow/schedule.repository';
import * as workflowRepo from '@/workflow/workflow.repository';
import * as scheduleEngine from '@/workflow/scheduleEngine';
import type { ScheduleDetail } from '@/workflow/schedule.types';

const makeScheduleDetail = (overrides: Partial<ScheduleDetail> = {}): ScheduleDetail => ({
  id: 'sched-1',
  name: 'Daily Sync',
  description: '',
  workflowId: 'wf-1',
  workflowName: 'My Workflow',
  scheduleType: 'daily',
  cronExpr: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lastRunId: null,
  lastRunStatus: null,
  lastRunAt: null,
  createdAt: new Date(),
  params: {},
  updatedAt: new Date(),
  ...overrides,
});

describe('schedule.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSchedule', () => {
    it('should validate cron expression and create schedule', async () => {
      const input = { name: 'Test', workflowId: 'wf-1', scheduleType: 'daily' as const, cronExpr: '0 8 * * *' };
      const detail = makeScheduleDetail();
      vi.mocked(scheduleRepo.createSchedule).mockResolvedValue(detail);

      const result = await scheduleService.createSchedule(input);

      expect(scheduleRepo.createSchedule).toHaveBeenCalledWith(input);
      expect(scheduleEngine.registerSchedule).toHaveBeenCalledWith(detail);
      expect(result).toEqual(detail);
    });

    it('should reject invalid cron expression', async () => {
      const input = { name: 'Test', workflowId: 'wf-1', scheduleType: 'cron' as const, cronExpr: 'invalid' };
      await expect(scheduleService.createSchedule(input)).rejects.toThrow('Invalid cron expression');
    });

    it('should reject empty name', async () => {
      const input = { name: '', workflowId: 'wf-1', scheduleType: 'daily' as const, cronExpr: '0 8 * * *' };
      await expect(scheduleService.createSchedule(input)).rejects.toThrow();
    });
  });

  describe('deleteSchedule', () => {
    it('should unregister engine and delete from DB', async () => {
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());
      vi.mocked(scheduleRepo.deleteSchedule).mockResolvedValue(undefined);

      await scheduleService.deleteSchedule('sched-1');

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleRepo.deleteSchedule).toHaveBeenCalledWith('sched-1');
    });

    it('should throw ScheduleNotFoundError for non-existent schedule', async () => {
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(null);
      await expect(scheduleService.deleteSchedule('bad-id')).rejects.toThrow('Schedule not found');
    });
  });

  describe('updateSchedule', () => {
    it('should re-register engine when cron or enabled changes', async () => {
      const updated = makeScheduleDetail({ cronExpr: '0 9 * * *' });
      vi.mocked(scheduleRepo.updateSchedule).mockResolvedValue(updated);
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());

      await scheduleService.updateSchedule('sched-1', { cronExpr: '0 9 * * *' });

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleEngine.registerSchedule).toHaveBeenCalledWith(updated);
    });

    it('should unregister when disabled', async () => {
      const updated = makeScheduleDetail({ enabled: false });
      vi.mocked(scheduleRepo.updateSchedule).mockResolvedValue(updated);
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());

      await scheduleService.updateSchedule('sched-1', { enabled: false });

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleEngine.registerSchedule).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: FAIL — `@/workflow/schedule.service` not found

- [ ] **Step 3: Implement schedule.service.ts**

Create `backend/src/workflow/schedule.service.ts`:

```typescript
import logger from '../utils/logger';
import { ScheduleNotFoundError, ScheduleValidationError } from '../errors/types';
import { isValidCronExpr, isValidScheduleType } from './schedule.types';
import type { CreateScheduleInput, UpdateScheduleInput, ScheduleDetail, ScheduleListItem } from './schedule.types';
import * as repository from './schedule.repository';
import { registerSchedule, unregisterSchedule } from './scheduleEngine';

function validateCreateInput(input: CreateScheduleInput): void {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new ScheduleValidationError('Schedule name is required');
  }
  if (!input.workflowId) {
    throw new ScheduleValidationError('Workflow ID is required');
  }
  if (!isValidScheduleType(input.scheduleType)) {
    throw new ScheduleValidationError(`Invalid schedule type: ${input.scheduleType}`);
  }
  if (!isValidCronExpr(input.cronExpr)) {
    throw new ScheduleValidationError('Invalid cron expression');
  }
}

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  validateCreateInput(input);
  const detail = await repository.createSchedule(input);
  if (detail.enabled) {
    registerSchedule(detail);
  }
  logger.info('Created schedule', { scheduleId: detail.id, name: detail.name });
  return detail;
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  return repository.listSchedules();
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  const detail = await repository.getScheduleById(id);
  if (!detail) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  return detail;
}

export async function updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleDetail> {
  const existing = await repository.getScheduleById(id);
  if (!existing) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  if (input.scheduleType !== undefined && !isValidScheduleType(input.scheduleType)) {
    throw new ScheduleValidationError(`Invalid schedule type: ${input.scheduleType}`);
  }
  if (input.cronExpr !== undefined && !isValidCronExpr(input.cronExpr)) {
    throw new ScheduleValidationError('Invalid cron expression');
  }

  const updated = await repository.updateSchedule(id, input);

  // Re-register or unregister depending on enabled state
  unregisterSchedule(id);
  if (updated.enabled) {
    registerSchedule(updated);
  }

  logger.info('Updated schedule', { scheduleId: id });
  return updated;
}

export async function deleteSchedule(id: string): Promise<void> {
  const existing = await repository.getScheduleById(id);
  if (!existing) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  unregisterSchedule(id);
  await repository.deleteSchedule(id);
  logger.info('Deleted schedule', { scheduleId: id });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/workflow/schedule.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/workflow/schedule.service.ts backend/tests/workflow/schedule.service.test.ts
git commit -m "feat(schedule): add schedule service with CRUD and engine lifecycle"
```

---

## Task 7: Backend Controller & Routes

**Files:**
- Create: `backend/src/workflow/schedule.controller.ts`
- Create: `backend/src/workflow/schedule.routes.ts`
- Modify: `backend/src/workflow/workflow.routes.ts:25` (mount before `/:id`)
- Modify: `backend/src/workflow/index.ts`
- Modify: `backend/src/index.ts:13,44,98`

- [ ] **Step 1: Create schedule.controller.ts**

```typescript
import type { Request, Response } from 'express';
import { getValidatedUuid } from '../utils/routeParams';
import { HttpStatusCode } from '../base/types';
import * as service from './schedule.service';
import type { CreateScheduleInput, UpdateScheduleInput } from './schedule.types';

export async function createScheduleHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateScheduleInput;
  const result = await service.createSchedule(input);
  res.status(HttpStatusCode.CREATED).json(result);
}

export async function listSchedulesHandler(_req: Request, res: Response): Promise<void> {
  const schedules = await service.listSchedules();
  res.json({ schedules });
}

export async function getScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const schedule = await service.getSchedule(id);
  res.json(schedule);
}

export async function updateScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const input = req.body as UpdateScheduleInput;
  const result = await service.updateSchedule(id, input);
  res.json(result);
}

export async function deleteScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  await service.deleteSchedule(id);
  res.status(HttpStatusCode.NO_CONTENT).send();
}
```

- [ ] **Step 2: Create schedule.routes.ts**

```typescript
import { Router } from 'express';
import {
  createScheduleHandler,
  listSchedulesHandler,
  getScheduleHandler,
  updateScheduleHandler,
  deleteScheduleHandler,
} from './schedule.controller';

const router = Router();

router.post('/', createScheduleHandler);
router.get('/', listSchedulesHandler);
router.get('/:id', getScheduleHandler);
router.put('/:id', updateScheduleHandler);
router.delete('/:id', deleteScheduleHandler);

export default router;
```

- [ ] **Step 3: Mount scheduleRoutes in workflow.routes.ts**

In `backend/src/workflow/workflow.routes.ts`, add import at top:

```typescript
import scheduleRoutes from './schedule.routes';
```

Add before line 26 (before `router.get('/:id', ...)`):

```typescript
router.use('/schedules', scheduleRoutes);
```

- [ ] **Step 4: Update workflow/index.ts exports**

In `backend/src/workflow/index.ts`, add:

```typescript
export { default as scheduleRoutes } from './schedule.routes';
export { initScheduleEngine, stopAllSchedules } from './scheduleEngine';
```

- [ ] **Step 5: Wire up startup/shutdown in backend/src/index.ts**

Update import on line 13:

```typescript
import { initWorkflowWebSocket, startWorkspaceCleanup, stopWorkspaceCleanup, initScheduleEngine, stopAllSchedules } from './workflow';
```

Add `stopAllSchedules();` after line 44 (`stopWorkspaceCleanup();`) in shutdown handler.

Add `await initScheduleEngine();` after line 98 (`startWorkspaceCleanup();`) in startup.

- [ ] **Step 6: Run backend preflight**

```bash
cd backend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/workflow/schedule.controller.ts backend/src/workflow/schedule.routes.ts backend/src/workflow/workflow.routes.ts backend/src/workflow/index.ts backend/src/index.ts
git commit -m "feat(schedule): add schedule API routes and server lifecycle integration"
```

---

## Task 8: Frontend Types, API Client, and i18n

**Files:**
- Create: `frontend/src/types/schedule.ts`
- Create: `frontend/src/api/schedule.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Modify: `frontend/package.json` (already done in Task 1)

- [ ] **Step 1: Create frontend types**

Create `frontend/src/types/schedule.ts`:

```typescript
export type ScheduleType = 'daily' | 'weekly' | 'monthly' | 'cron';

export interface ScheduleListItem {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  workflowName: string;
  scheduleType: ScheduleType;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

export interface ScheduleDetail extends ScheduleListItem {
  params: Record<string, string>;
  updatedAt: string;
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  workflowId: string;
  scheduleType: ScheduleType;
  cronExpr: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  workflowId?: string;
  scheduleType?: ScheduleType;
  cronExpr?: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}
```

- [ ] **Step 2: Create API client**

Create `frontend/src/api/schedule.ts`:

```typescript
import http from '@/utils/http';
import type {
  ScheduleListItem,
  ScheduleDetail,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/types/schedule';

interface ListSchedulesResponse {
  schedules: ScheduleListItem[];
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  const res = await http.get<ListSchedulesResponse>('/workflows/schedules');
  return res.schedules;
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  return http.get<ScheduleDetail>(`/workflows/schedules/${id}`);
}

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  return http.post<ScheduleDetail>('/workflows/schedules', input);
}

export async function updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleDetail> {
  return http.put<ScheduleDetail>(`/workflows/schedules/${id}`, input);
}

export async function deleteSchedule(id: string): Promise<void> {
  await http.delete(`/workflows/schedules/${id}`);
}
```

- [ ] **Step 3: Add i18n keys to zh-CN.ts**

In `frontend/src/locales/zh-CN.ts`, add a `schedule` section after line 441 (after the `workflow` section's closing `},`):

```typescript
  schedule: {
    title: '定时任务',
    description: '管理定期执行的工作流',
    newSchedule: '新建定时任务',
    editSchedule: '编辑定时任务',
    taskName: '任务名称',
    taskNamePlaceholder: '例如：每日销售同步',
    descriptionLabel: '描述',
    descriptionPlaceholder: '可选描述...',
    workflow: '工作流',
    workflowPlaceholder: '选择工作流...',
    scheduleType: '调度类型',
    time: '时间',
    timezone: '时区',
    params: '覆盖参数（可选）',
    paramsHint: '留空使用工作流默认值。变量将在运行时注入。',
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    cron: 'Cron',
    cronPlaceholder: '例如：0 8 * * *',
    cronNextRun: '下次执行：',
    cronInvalid: '无效的 Cron 表达式',
    createSchedule: '创建',
    cancel: '取消',
    status: {
      active: '运行中',
      paused: '已暂停',
      failed: '失败',
    },
    table: {
      status: '状态',
      taskName: '任务名称',
      workflow: '工作流',
      schedule: '调度',
      lastRun: '最后运行',
      actions: '操作',
      duration: '耗时：{duration}',
      error: '错误：{message}',
    },
    confirmDelete: '确定要删除定时任务 "{name}" 吗？',
    deleteSuccess: '定时任务已删除',
    createSuccess: '定时任务已创建',
    updateSuccess: '定时任务已更新',
    weekdays: {
      mon: '周一',
      tue: '周二',
      wed: '周三',
      thu: '周四',
      fri: '周五',
      sat: '周六',
      sun: '周日',
    },
  },
```

- [ ] **Step 4: Add i18n keys to en-US.ts**

In `frontend/src/locales/en-US.ts`, add the matching `schedule` section at the equivalent position (after the `workflow` section):

```typescript
  schedule: {
    title: 'Scheduled Tasks',
    description: 'Manage workflows that run on a recurring schedule',
    newSchedule: 'New Schedule',
    editSchedule: 'Edit Schedule',
    taskName: 'Task Name',
    taskNamePlaceholder: 'e.g. Daily Sales Sync',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Optional description...',
    workflow: 'Workflow',
    workflowPlaceholder: 'Select a workflow...',
    scheduleType: 'Schedule Type',
    time: 'Time',
    timezone: 'Timezone',
    params: 'Override Parameters (optional)',
    paramsHint: 'Leave empty to use workflow defaults. Variables will be injected at runtime.',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    cron: 'Cron',
    cronPlaceholder: 'e.g. 0 8 * * *',
    cronNextRun: 'Next run:',
    cronInvalid: 'Invalid cron expression',
    createSchedule: 'Create',
    cancel: 'Cancel',
    status: {
      active: 'Active',
      paused: 'Paused',
      failed: 'Failed',
    },
    table: {
      status: 'STATUS',
      taskName: 'TASK NAME',
      workflow: 'WORKFLOW',
      schedule: 'SCHEDULE',
      lastRun: 'LAST RUN',
      actions: 'ACTIONS',
      duration: 'Duration: {duration}',
      error: 'Error: {message}',
    },
    confirmDelete: 'Are you sure you want to delete schedule "{name}"?',
    deleteSuccess: 'Schedule deleted',
    createSuccess: 'Schedule created',
    updateSuccess: 'Schedule updated',
    weekdays: {
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
      sun: 'Sun',
    },
  },
```

- [ ] **Step 5: Add sidebar i18n key**

In zh-CN.ts `sidebar` section (around line 100), add:

```typescript
    schedule: '定时任务',
```

In en-US.ts `sidebar` section at the same position:

```typescript
    schedule: 'Scheduled Tasks',
```

- [ ] **Step 6: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/schedule.ts frontend/src/api/schedule.ts frontend/src/locales/
git commit -m "feat(schedule): add frontend types, API client, and i18n keys"
```

---

## Task 9: Frontend Store (`scheduleStore.ts`)

**Files:**
- Create: `frontend/src/stores/scheduleStore.ts`
- Modify: `frontend/src/stores/index.ts:14`
- Create: `frontend/tests/stores/scheduleStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `frontend/tests/stores/scheduleStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useScheduleStore } from '@/stores/scheduleStore';
import * as scheduleApi from '@/api/schedule';
import type { ScheduleListItem, ScheduleDetail } from '@/types/schedule';

vi.mock('@/api/schedule');

const makeListItem = (overrides: Partial<ScheduleListItem> = {}): ScheduleListItem => ({
  id: 'sched-1',
  name: 'Daily Sync',
  description: 'Sync data daily',
  workflowId: 'wf-1',
  workflowName: 'Sales Report',
  scheduleType: 'daily',
  cronExpr: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lastRunId: null,
  lastRunStatus: null,
  lastRunAt: null,
  createdAt: '2026-03-29T00:00:00Z',
  ...overrides,
});

describe('scheduleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with empty state', () => {
    const store = useScheduleStore();
    expect(store.schedules).toEqual([]);
    expect(store.formVisible).toBe(false);
    expect(store.editingSchedule).toBeNull();
  });

  it('should fetch schedules', async () => {
    const items = [makeListItem(), makeListItem({ id: 'sched-2', name: 'Weekly Report' })];
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue(items);

    const store = useScheduleStore();
    await store.fetchSchedules();

    expect(store.schedules).toEqual(items);
    expect(scheduleApi.listSchedules).toHaveBeenCalledOnce();
  });

  it('should create schedule and refresh list', async () => {
    const detail: ScheduleDetail = {
      ...makeListItem(),
      params: {},
      updatedAt: '2026-03-29T00:00:00Z',
    };
    vi.mocked(scheduleApi.createSchedule).mockResolvedValue(detail);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([makeListItem()]);

    const store = useScheduleStore();
    const input = { name: 'Test', workflowId: 'wf-1', scheduleType: 'daily' as const, cronExpr: '0 8 * * *' };
    await store.createSchedule(input);

    expect(scheduleApi.createSchedule).toHaveBeenCalledWith(input);
    expect(scheduleApi.listSchedules).toHaveBeenCalled();
  });

  it('should delete schedule and refresh list', async () => {
    vi.mocked(scheduleApi.deleteSchedule).mockResolvedValue(undefined);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([]);

    const store = useScheduleStore();
    store.schedules = [makeListItem()];
    await store.deleteSchedule('sched-1');

    expect(scheduleApi.deleteSchedule).toHaveBeenCalledWith('sched-1');
    expect(scheduleApi.listSchedules).toHaveBeenCalled();
  });

  it('should toggle enabled via updateSchedule', async () => {
    const updated: ScheduleDetail = {
      ...makeListItem({ enabled: false }),
      params: {},
      updatedAt: '2026-03-29T00:00:00Z',
    };
    vi.mocked(scheduleApi.updateSchedule).mockResolvedValue(updated);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([makeListItem({ enabled: false })]);

    const store = useScheduleStore();
    store.schedules = [makeListItem()];
    await store.toggleEnabled('sched-1');

    expect(scheduleApi.updateSchedule).toHaveBeenCalledWith('sched-1', { enabled: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && pnpm vitest run tests/stores/scheduleStore.test.ts
```
Expected: FAIL — `@/stores/scheduleStore` not found

- [ ] **Step 3: Implement scheduleStore.ts**

Create `frontend/src/stores/scheduleStore.ts`:

```typescript
import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as api from '@/api/schedule';
import type {
  ScheduleListItem,
  ScheduleDetail,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/types/schedule';

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<ScheduleListItem[]>([]);
  const formVisible = ref(false);
  const editingSchedule = ref<ScheduleDetail | null>(null);
  const loading = ref(false);

  async function fetchSchedules(): Promise<void> {
    loading.value = true;
    try {
      schedules.value = await api.listSchedules();
    } finally {
      loading.value = false;
    }
  }

  async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
    const result = await api.createSchedule(input);
    await fetchSchedules();
    return result;
  }

  async function updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleDetail> {
    const result = await api.updateSchedule(id, input);
    await fetchSchedules();
    return result;
  }

  async function deleteSchedule(id: string): Promise<void> {
    await api.deleteSchedule(id);
    await fetchSchedules();
  }

  async function toggleEnabled(id: string): Promise<void> {
    const schedule = schedules.value.find((s) => s.id === id);
    if (!schedule) return;
    await updateSchedule(id, { enabled: !schedule.enabled });
  }

  async function loadEditingSchedule(id: string): Promise<void> {
    editingSchedule.value = await api.getSchedule(id);
  }

  function openCreateForm(): void {
    editingSchedule.value = null;
    formVisible.value = true;
  }

  async function openEditForm(id: string): Promise<void> {
    await loadEditingSchedule(id);
    formVisible.value = true;
  }

  function closeForm(): void {
    formVisible.value = false;
    editingSchedule.value = null;
  }

  return {
    schedules,
    formVisible,
    editingSchedule,
    loading,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleEnabled,
    loadEditingSchedule,
    openCreateForm,
    openEditForm,
    closeForm,
  };
});
```

- [ ] **Step 4: Export store from index.ts**

In `frontend/src/stores/index.ts`, add after line 14:

```typescript
export { useScheduleStore } from './scheduleStore';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && pnpm vitest run tests/stores/scheduleStore.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/scheduleStore.ts frontend/src/stores/index.ts frontend/tests/stores/scheduleStore.test.ts
git commit -m "feat(schedule): add schedule Pinia store with CRUD operations"
```

---

## Task 10: Navigation Integration

**Files:**
- Modify: `frontend/src/types/sidebar.ts:1`
- Modify: `frontend/src/components/sidebar/IconBar.vue:47,62-81`
- Modify: `frontend/src/layouts/DesktopLayout.vue:5-8,19,23-25`
- Modify: `frontend/src/layouts/MobileLayout.vue:18-20,32,37-39`

- [ ] **Step 1: Add 'schedule' to NavType**

In `frontend/src/types/sidebar.ts`, change line 1:

```typescript
export type NavType = 'data' | 'chat' | 'workflow' | 'schedule' | 'settings';
```

- [ ] **Step 2: Add Timer icon to IconBar.vue**

In `frontend/src/components/sidebar/IconBar.vue`:

Add `Timer` to the lucide import (line 41-47):

```typescript
import {
  Zap,
  Database,
  MessageSquare,
  Workflow,
  Timer,
  Settings as LucideSettings,
} from 'lucide-vue-next';
```

Add the schedule nav item in `topNavItems` (after the workflow item, before `]);` at line 81):

```typescript
  {
    nav: 'schedule' as NavType,
    icon: Timer,
    label: t('sidebar.schedule'),
    disabled: false,
  },
```

- [ ] **Step 3: Add SchedulePage to DesktopLayout.vue**

In `frontend/src/layouts/DesktopLayout.vue`:

Add import:
```typescript
import { SchedulePage } from '@/components/schedule';
```

Add computed:
```typescript
const showSchedule = computed(() => activeNav.value === 'schedule');
```

Add to template (after `showWorkflow` line, before `<ChatContainer v-else />`):
```vue
<SchedulePage v-else-if="showSchedule" />
```

- [ ] **Step 4: Add SchedulePage to MobileLayout.vue**

In `frontend/src/layouts/MobileLayout.vue`:

Add import:
```typescript
import { SchedulePage } from '@/components/schedule';
```

Add computed:
```typescript
const showSchedule = computed(() => activeNav.value === 'schedule');
```

Add to template (after `showWorkflow` line, before `<ChatContainer v-else ...>`):
```vue
<SchedulePage v-else-if="showSchedule" is-mobile @back="handleBack" />
```

- [ ] **Step 5: Create schedule component barrel export**

Create `frontend/src/components/schedule/index.ts`:

```typescript
export { default as SchedulePage } from './SchedulePage.vue';
```

- [ ] **Step 6: Create stub SchedulePage.vue**

Create `frontend/src/components/schedule/SchedulePage.vue` (stub for now, completed in next tasks):

```vue
<template>
  <div class="schedule-page">
    <div class="schedule-page__header">
      <h2>{{ t('schedule.title') }}</h2>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
</script>
```

- [ ] **Step 7: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/sidebar.ts frontend/src/components/sidebar/IconBar.vue frontend/src/layouts/ frontend/src/components/schedule/
git commit -m "feat(schedule): add schedule navigation and stub page"
```

---

## Task 11: CronPreview Component

**Files:**
- Create: `frontend/src/components/schedule/CronPreview.vue`

- [ ] **Step 1: Implement CronPreview.vue**

```vue
<template>
  <div v-if="nextRunText" class="cron-preview">
    <span class="cron-preview__label">{{ t('schedule.cronNextRun') }}</span>
    <span class="cron-preview__time">{{ nextRunText }}</span>
  </div>
  <div v-else-if="cronExpr && !isValid" class="cron-preview cron-preview--error">
    <span>{{ t('schedule.cronInvalid') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import parser from 'cron-parser';

const props = defineProps<{
  cronExpr: string;
  timezone?: string;
}>();

const { t } = useI18n();

const parseResult = computed(() => {
  if (!props.cronExpr) return null;
  try {
    const interval = parser.parseExpression(props.cronExpr, {
      tz: props.timezone || 'Asia/Shanghai',
    });
    return { next: interval.next().toDate(), valid: true };
  } catch {
    return { next: null, valid: false };
  }
});

const isValid = computed(() => parseResult.value?.valid ?? false);

const nextRunText = computed(() => {
  const result = parseResult.value;
  if (!result?.next) return '';
  return result.next.toLocaleString();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.cron-preview {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: 12px;
  color: $text-muted;

  &__time {
    color: $accent;
  }

  &--error {
    color: $danger;
  }
}
</style>
```

- [ ] **Step 2: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/schedule/CronPreview.vue
git commit -m "feat(schedule): add CronPreview component with real-time validation"
```

---

## Task 12: ScheduleForm Component

**Files:**
- Create: `frontend/src/components/schedule/ScheduleForm.vue`

- [ ] **Step 1: Implement ScheduleForm.vue**

This is the shared form logic used by both desktop dialog and mobile sheet. It contains: task name, description, workflow selector, schedule type tabs (Daily/Weekly/Monthly/Cron), time + timezone fields, and parameter overrides.

```vue
<template>
  <el-form label-position="top" :model="form" class="schedule-form">
    <el-form-item :label="t('schedule.taskName')">
      <el-input v-model="form.name" :placeholder="t('schedule.taskNamePlaceholder')" />
    </el-form-item>

    <el-form-item :label="t('schedule.descriptionLabel')">
      <el-input
        v-model="form.description"
        type="textarea"
        :rows="2"
        :placeholder="t('schedule.descriptionPlaceholder')"
      />
    </el-form-item>

    <el-form-item :label="t('schedule.workflow')">
      <el-select
        v-model="form.workflowId"
        :placeholder="t('schedule.workflowPlaceholder')"
        filterable
        style="width: 100%"
        @change="handleWorkflowChange"
      >
        <el-option
          v-for="wf in workflows"
          :key="wf.id"
          :label="wf.name"
          :value="wf.id"
        />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('schedule.scheduleType')">
      <div class="schedule-form__tabs">
        <button
          v-for="tab in scheduleTypeTabs"
          :key="tab.value"
          class="schedule-form__tab"
          :class="{ 'is-active': form.scheduleType === tab.value }"
          type="button"
          @click="form.scheduleType = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </el-form-item>

    <!-- Daily: Time + Timezone -->
    <div v-if="form.scheduleType === 'daily'" class="schedule-form__row">
      <el-form-item :label="t('schedule.time')" class="schedule-form__half">
        <el-time-picker v-model="form.time" format="HH:mm" value-format="HH:mm" />
      </el-form-item>
      <el-form-item :label="t('schedule.timezone')" class="schedule-form__half">
        <el-select v-model="form.timezone" filterable>
          <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
        </el-select>
      </el-form-item>
    </div>

    <!-- Weekly: Day picker + Time + Timezone -->
    <template v-if="form.scheduleType === 'weekly'">
      <el-form-item>
        <div class="schedule-form__weekdays">
          <button
            v-for="day in weekdayOptions"
            :key="day.value"
            type="button"
            class="schedule-form__weekday"
            :class="{ 'is-active': form.weekday === day.value }"
            @click="form.weekday = day.value"
          >
            {{ day.label }}
          </button>
        </div>
      </el-form-item>
      <div class="schedule-form__row">
        <el-form-item :label="t('schedule.time')" class="schedule-form__half">
          <el-time-picker v-model="form.time" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <el-form-item :label="t('schedule.timezone')" class="schedule-form__half">
          <el-select v-model="form.timezone" filterable>
            <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <!-- Monthly: Day of month + Time + Timezone -->
    <template v-if="form.scheduleType === 'monthly'">
      <el-form-item>
        <el-select v-model="form.monthDay" style="width: 100%">
          <el-option v-for="d in 31" :key="d" :label="`${d}`" :value="d" />
        </el-select>
      </el-form-item>
      <div class="schedule-form__row">
        <el-form-item :label="t('schedule.time')" class="schedule-form__half">
          <el-time-picker v-model="form.time" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <el-form-item :label="t('schedule.timezone')" class="schedule-form__half">
          <el-select v-model="form.timezone" filterable>
            <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <!-- Cron: Expression + Preview -->
    <template v-if="form.scheduleType === 'cron'">
      <el-form-item>
        <el-input v-model="form.cronExpr" :placeholder="t('schedule.cronPlaceholder')" />
      </el-form-item>
      <CronPreview :cron-expr="form.cronExpr" :timezone="form.timezone" />
      <div class="schedule-form__row" style="margin-top: 16px">
        <el-form-item :label="t('schedule.timezone')" style="width: 100%">
          <el-select v-model="form.timezone" filterable>
            <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <!-- Parameters -->
    <el-form-item v-if="workflowParams.length > 0" :label="t('schedule.params')">
      <p class="schedule-form__hint">{{ t('schedule.paramsHint') }}</p>
      <div v-for="param in workflowParams" :key="param.key" class="schedule-form__param">
        <label>{{ param.label || param.key }}</label>
        <el-input v-model="form.params[param.key]" size="small" />
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowStore } from '@/stores/workflowStore';
import CronPreview from './CronPreview.vue';
import type { ScheduleType, ScheduleDetail, CreateScheduleInput } from '@/types/schedule';

const props = defineProps<{
  editing?: ScheduleDetail | null;
}>();

defineEmits<{
  submit: [input: CreateScheduleInput];
}>();

const { t } = useI18n();
const workflowStore = useWorkflowStore();

const timezones = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
];

const scheduleTypeTabs = computed(() => [
  { value: 'daily' as ScheduleType, label: t('schedule.daily') },
  { value: 'weekly' as ScheduleType, label: t('schedule.weekly') },
  { value: 'monthly' as ScheduleType, label: t('schedule.monthly') },
  { value: 'cron' as ScheduleType, label: t('schedule.cron') },
]);

const weekdayOptions = computed(() => [
  { value: 1, label: t('schedule.weekdays.mon') },
  { value: 2, label: t('schedule.weekdays.tue') },
  { value: 3, label: t('schedule.weekdays.wed') },
  { value: 4, label: t('schedule.weekdays.thu') },
  { value: 5, label: t('schedule.weekdays.fri') },
  { value: 6, label: t('schedule.weekdays.sat') },
  { value: 0, label: t('schedule.weekdays.sun') },
]);

const workflows = computed(() => workflowStore.workflows);

interface FormState {
  name: string;
  description: string;
  workflowId: string;
  scheduleType: ScheduleType;
  time: string;
  timezone: string;
  weekday: number;
  monthDay: number;
  cronExpr: string;
  params: Record<string, string>;
}

const form = reactive<FormState>({
  name: '',
  description: '',
  workflowId: '',
  scheduleType: 'daily',
  time: '08:00',
  timezone: 'Asia/Shanghai',
  weekday: 1,
  monthDay: 1,
  cronExpr: '',
  params: {},
});

// Parse editing data into form
watch(
  () => props.editing,
  (val) => {
    if (val) {
      form.name = val.name;
      form.description = val.description;
      form.workflowId = val.workflowId;
      form.scheduleType = val.scheduleType;
      form.timezone = val.timezone;
      form.params = { ...val.params };
      // Parse cron back to friendly fields
      parseCronToForm(val.cronExpr, val.scheduleType);
    }
  },
  { immediate: true }
);

function parseCronToForm(expr: string, type: ScheduleType): void {
  const parts = expr.split(' ');
  if (parts.length < 5) return;
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  form.time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  if (type === 'weekly') form.weekday = parseInt(dayOfWeek, 10);
  if (type === 'monthly') form.monthDay = parseInt(dayOfMonth, 10);
  if (type === 'cron') form.cronExpr = expr;
}

function buildCronExpr(): string {
  if (form.scheduleType === 'cron') return form.cronExpr;
  const [hour, minute] = form.time.split(':');
  switch (form.scheduleType) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${form.weekday}`;
    case 'monthly':
      return `${minute} ${hour} ${form.monthDay} * *`;
    default:
      return '';
  }
}

// Workflow params loading — fetch workflow detail directly via API to avoid
// coupling to the editor state. Extract ParamDefinition from Python/LLM nodes.
import { getWorkflow } from '@/api/workflow';
import type { WorkflowDetail, PythonNodeConfig, LlmNodeConfig } from '@/types/workflow';

interface ParamInfo {
  key: string;
  label: string;
}

const selectedWorkflowDetail = ref<WorkflowDetail | null>(null);

const workflowParams = computed<ParamInfo[]>(() => {
  const wf = selectedWorkflowDetail.value;
  if (!wf) return [];
  const params: ParamInfo[] = [];
  for (const node of wf.nodes) {
    const config = node.config;
    if (config && (config.nodeType === 'python' || config.nodeType === 'llm')) {
      const typedConfig = config as PythonNodeConfig | LlmNodeConfig;
      if (typedConfig.params) {
        for (const [key, def] of Object.entries(typedConfig.params)) {
          params.push({ key, label: def.label || key });
        }
      }
    }
  }
  return params;
});

async function handleWorkflowChange(id: string): Promise<void> {
  form.params = {};
  try {
    selectedWorkflowDetail.value = await getWorkflow(id);
  } catch {
    selectedWorkflowDetail.value = null;
  }
}

function getSubmitInput(): CreateScheduleInput {
  return {
    name: form.name,
    description: form.description || undefined,
    workflowId: form.workflowId,
    scheduleType: form.scheduleType,
    cronExpr: buildCronExpr(),
    timezone: form.timezone,
    params: Object.keys(form.params).length > 0 ? form.params : undefined,
  };
}

defineExpose({ getSubmitInput });
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-form {
  &__tabs {
    display: flex;
    width: 100%;
    background: $bg-deeper;
    border-radius: $radius-sm;
    padding: 3px;
    border: 1px solid $border-dark;
  }

  &__tab {
    flex: 1;
    height: 32px;
    border: none;
    background: none;
    color: $text-muted;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &.is-active {
      background: linear-gradient(to top, $accent, $accent-light);
      color: #fff;
      font-weight: 600;
    }
  }

  &__row {
    display: flex;
    gap: $spacing-md;
  }

  &__half {
    flex: 1;
  }

  &__weekdays {
    display: flex;
    gap: $spacing-xs;
  }

  &__weekday {
    flex: 1;
    height: 32px;
    border: 1px solid $border-dark;
    background: $bg-deeper;
    color: $text-muted;
    font-size: 12px;
    cursor: pointer;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &.is-active {
      background: $accent;
      border-color: $accent;
      color: #fff;
    }
  }

  &__hint {
    font-size: 11px;
    color: $text-muted;
    margin-bottom: $spacing-sm;
  }

  &__param {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    margin-bottom: $spacing-xs;

    label {
      font-size: 12px;
      color: $text-secondary-color;
      min-width: 100px;
    }
  }
}
</style>
```

- [ ] **Step 2: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/schedule/ScheduleForm.vue
git commit -m "feat(schedule): add ScheduleForm with schedule type tabs and cron preview"
```

---

## Task 13: Desktop Dialog & Mobile Sheet

**Files:**
- Create: `frontend/src/components/schedule/ScheduleDialog.vue`
- Create: `frontend/src/components/schedule/ScheduleSheet.vue`

- [ ] **Step 1: Create ScheduleDialog.vue (desktop modal)**

```vue
<template>
  <el-dialog
    :model-value="visible"
    :title="editing ? t('schedule.editSchedule') : t('schedule.newSchedule')"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <ScheduleForm ref="formRef" :editing="editing" />
    <template #footer>
      <el-button @click="emit('update:visible', false)">{{ t('schedule.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ t('schedule.createSchedule') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useScheduleStore } from '@/stores/scheduleStore';
import ScheduleForm from './ScheduleForm.vue';
import type { ScheduleDetail } from '@/types/schedule';

defineProps<{
  visible: boolean;
  editing?: ScheduleDetail | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const store = useScheduleStore();
const formRef = ref<InstanceType<typeof ScheduleForm>>();
const submitting = ref(false);

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const input = formRef.value.getSubmitInput();
  submitting.value = true;
  try {
    if (store.editingSchedule) {
      await store.updateSchedule(store.editingSchedule.id, input);
      ElMessage.success(t('schedule.updateSuccess'));
    } else {
      await store.createSchedule(input);
      ElMessage.success(t('schedule.createSuccess'));
    }
    emit('update:visible', false);
  } finally {
    submitting.value = false;
  }
}
</script>
```

- [ ] **Step 2: Create ScheduleSheet.vue (mobile bottom sheet)**

```vue
<template>
  <transition name="sheet">
    <div v-if="visible" class="schedule-sheet__overlay" @click="emit('update:visible', false)">
      <div class="schedule-sheet" @click.stop>
        <div class="schedule-sheet__handle">
          <div class="schedule-sheet__handle-bar"></div>
        </div>
        <div class="schedule-sheet__header">
          <span class="schedule-sheet__title">
            {{ editing ? t('schedule.editSchedule') : t('schedule.newSchedule') }}
          </span>
        </div>
        <div class="schedule-sheet__body">
          <ScheduleForm ref="formRef" :editing="editing" />
        </div>
        <div class="schedule-sheet__footer">
          <el-button style="width: 100%" @click="emit('update:visible', false)">
            {{ t('schedule.cancel') }}
          </el-button>
          <el-button type="primary" style="width: 100%" :loading="submitting" @click="handleSubmit">
            {{ t('schedule.createSchedule') }}
          </el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useScheduleStore } from '@/stores/scheduleStore';
import ScheduleForm from './ScheduleForm.vue';
import type { ScheduleDetail } from '@/types/schedule';

defineProps<{
  visible: boolean;
  editing?: ScheduleDetail | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const store = useScheduleStore();
const formRef = ref<InstanceType<typeof ScheduleForm>>();
const submitting = ref(false);

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const input = formRef.value.getSubmitInput();
  submitting.value = true;
  try {
    if (store.editingSchedule) {
      await store.updateSchedule(store.editingSchedule.id, input);
      ElMessage.success(t('schedule.updateSuccess'));
    } else {
      await store.createSchedule(input);
      ElMessage.success(t('schedule.createSuccess'));
    }
    emit('update:visible', false);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-sheet {
  &__overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: $z-index-modal;
    display: flex;
    align-items: flex-end;
  }

  position: relative;
  width: 100%;
  max-height: 90vh;
  background: $bg-sidebar;
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__handle {
    display: flex;
    justify-content: center;
    padding: 12px 0;
  }

  &__handle-bar {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: $text-muted;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px 16px;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: $text-primary-color;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 20px;
  }

  &__footer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 20px 24px;
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.3s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;

  .schedule-sheet {
    transform: translateY(100%);
  }
}
</style>
```

- [ ] **Step 3: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/schedule/ScheduleDialog.vue frontend/src/components/schedule/ScheduleSheet.vue
git commit -m "feat(schedule): add desktop dialog and mobile bottom sheet for schedule config"
```

---

## Task 14: Schedule Table & Card List

**Files:**
- Create: `frontend/src/components/schedule/ScheduleTable.vue`
- Create: `frontend/src/components/schedule/ScheduleCardList.vue`

- [ ] **Step 1: Create ScheduleTable.vue (desktop)**

Following the design mockup — table with columns: STATUS, TASK NAME, WORKFLOW, SCHEDULE, LAST RUN, ACTIONS (edit + delete). Status uses color-coded dot + text. Paused rows are dimmed.

```vue
<template>
  <div class="schedule-table-wrap">
    <el-table :data="schedules" style="width: 100%" :row-class-name="rowClassName">
      <el-table-column :label="t('schedule.table.status')" width="100">
        <template #default="{ row }">
          <div class="schedule-table__status">
            <span class="schedule-table__dot" :class="statusClass(row)"></span>
            <span :class="statusClass(row)">{{ statusText(row) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column :label="t('schedule.table.taskName')" min-width="200">
        <template #default="{ row }">
          <div class="schedule-table__name">
            <span class="schedule-table__title">{{ row.name }}</span>
            <span class="schedule-table__desc">{{ row.description }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column :label="t('schedule.table.workflow')" width="200">
        <template #default="{ row }">
          <div class="schedule-table__workflow">
            <GitBranch :size="14" />
            <span>{{ row.workflowName }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column :label="t('schedule.table.schedule')" width="180">
        <template #default="{ row }">
          <div class="schedule-table__schedule">
            <Timer :size="14" />
            <span>{{ row.cronExpr }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column :label="t('schedule.table.lastRun')" width="180">
        <template #default="{ row }">
          <div v-if="row.lastRunAt" class="schedule-table__lastrun">
            <span :class="{ 'is-error': row.lastRunStatus === 'failed' }">
              {{ formatDate(row.lastRunAt) }}
            </span>
            <span v-if="row.lastRunStatus === 'failed'" class="schedule-table__error">
              {{ t('schedule.table.error', { message: 'execution failed' }) }}
            </span>
          </div>
          <span v-else class="schedule-table__muted">—</span>
        </template>
      </el-table-column>

      <el-table-column :label="t('schedule.table.actions')" width="100" align="right">
        <template #default="{ row }">
          <div class="schedule-table__actions">
            <button class="schedule-table__action-btn" @click="emit('edit', row.id)">
              <Pencil :size="16" />
            </button>
            <button class="schedule-table__action-btn schedule-table__action-btn--danger" @click="emit('delete', row.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { GitBranch, Timer, Pencil, Trash2 } from 'lucide-vue-next';
import type { ScheduleListItem } from '@/types/schedule';

defineProps<{
  schedules: ScheduleListItem[];
}>();

const emit = defineEmits<{
  edit: [id: string];
  delete: [id: string];
}>();

const { t } = useI18n();

function statusClass(row: ScheduleListItem): string {
  if (!row.enabled) return 'is-paused';
  if (row.lastRunStatus === 'failed') return 'is-failed';
  return 'is-active';
}

function statusText(row: ScheduleListItem): string {
  if (!row.enabled) return t('schedule.status.paused');
  if (row.lastRunStatus === 'failed') return t('schedule.status.failed');
  return t('schedule.status.active');
}

function rowClassName({ row }: { row: ScheduleListItem }): string {
  return row.enabled ? '' : 'is-paused-row';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-table-wrap {
  border-radius: $radius-md;
  border: 1px solid $border-elevated;
  overflow: hidden;
}

.schedule-table {
  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.is-active { background: $success; }
    &.is-paused { background: $text-muted; }
    &.is-failed { background: $danger; }
  }

  .is-active { color: $success; }
  .is-paused { color: $text-muted; }
  .is-failed { color: $danger; }

  &__name {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary-color;
  }

  &__desc {
    font-size: 11px;
    color: $text-muted;
  }

  &__workflow,
  &__schedule {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: $text-secondary-color;
  }

  &__lastrun {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }

  &__error {
    font-size: 11px;
    color: $danger;
  }

  &__muted {
    color: $text-muted;
  }

  &__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  &__action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-md;
    border: none;
    background: none;
    color: $text-muted;
    cursor: pointer;
    transition: all $transition-fast;

    &:hover {
      background: $bg-elevated;
      color: $text-secondary-color;
    }

    &--danger:hover {
      color: $danger;
    }
  }
}

:deep(.is-paused-row) {
  opacity: 0.6;
}
</style>
```

- [ ] **Step 2: Create ScheduleCardList.vue (mobile)**

Following the mobile design — cards with status dot, title, edit icon, workflow name, schedule, last run.

```vue
<template>
  <div class="schedule-cards">
    <div
      v-for="item in schedules"
      :key="item.id"
      class="schedule-card"
      :class="{ 'is-paused': !item.enabled }"
    >
      <div class="schedule-card__top">
        <span class="schedule-card__dot" :class="statusClass(item)"></span>
        <span class="schedule-card__title">{{ item.name }}</span>
        <button class="schedule-card__edit" @click="emit('edit', item.id)">
          <Pencil :size="16" />
        </button>
        <button class="schedule-card__delete" @click="emit('delete', item.id)">
          <Trash2 :size="16" />
        </button>
      </div>
      <div class="schedule-card__mid">
        <GitBranch :size="13" />
        <span>{{ item.workflowName }}</span>
      </div>
      <div class="schedule-card__bottom">
        <div class="schedule-card__sched">
          <Timer :size="12" />
          <span>{{ item.cronExpr }}</span>
        </div>
        <span class="schedule-card__spacer"></span>
        <span v-if="item.lastRunAt" class="schedule-card__last">
          {{ formatShortDate(item.lastRunAt) }}
        </span>
      </div>
    </div>
    <div v-if="schedules.length === 0" class="schedule-cards__empty">
      {{ t('common.noData') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { GitBranch, Timer, Pencil, Trash2 } from 'lucide-vue-next';
import type { ScheduleListItem } from '@/types/schedule';

defineProps<{
  schedules: ScheduleListItem[];
}>();

const emit = defineEmits<{
  edit: [id: string];
  delete: [id: string];
}>();

const { t } = useI18n();

function statusClass(item: ScheduleListItem): string {
  if (!item.enabled) return 'is-paused';
  if (item.lastRunStatus === 'failed') return 'is-failed';
  return 'is-active';
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__empty {
    text-align: center;
    color: $text-muted;
    padding: 40px 0;
  }
}

.schedule-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: $bg-card;
  border: 1px solid $border-elevated;
  border-radius: $radius-md;

  &.is-paused {
    opacity: 0.6;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &.is-active { background: $success; }
    &.is-paused { background: $text-muted; }
    &.is-failed { background: $danger; }
  }

  &__title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary-color;
  }

  &__edit,
  &__delete {
    border: none;
    background: none;
    color: $text-muted;
    cursor: pointer;
    padding: 0;
  }

  &__delete {
    color: $danger;
  }

  &__mid {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: $text-muted;
  }

  &__bottom {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__sched {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    color: $text-secondary-color;
  }

  &__spacer {
    flex: 1;
  }

  &__last {
    font-size: 11px;
    color: $text-muted;
  }
}
</style>
```

- [ ] **Step 3: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/schedule/ScheduleTable.vue frontend/src/components/schedule/ScheduleCardList.vue
git commit -m "feat(schedule): add desktop table and mobile card list components"
```

---

## Task 15: SchedulePage — Full Implementation

**Files:**
- Modify: `frontend/src/components/schedule/SchedulePage.vue` (replace stub)

- [ ] **Step 1: Replace SchedulePage.vue with full implementation**

```vue
<template>
  <div class="schedule-page" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile Header -->
    <div v-if="isMobile" class="schedule-page__mobile-header">
      <button class="schedule-page__back-btn" @click="emit('back')">
        <Menu :size="18" />
      </button>
      <span class="schedule-page__title">{{ t('schedule.title') }}</span>
      <span class="schedule-page__spacer"></span>
      <button class="schedule-page__add-btn" @click="store.openCreateForm()">
        <Plus :size="18" />
      </button>
    </div>

    <!-- Desktop Header -->
    <div v-else class="schedule-page__header">
      <div class="schedule-page__header-left">
        <h2 class="schedule-page__title">{{ t('schedule.title') }}</h2>
        <p class="schedule-page__desc">{{ t('schedule.description') }}</p>
      </div>
      <el-button type="primary" @click="store.openCreateForm()">
        <Plus :size="16" />
        {{ t('schedule.newSchedule') }}
      </el-button>
    </div>

    <!-- Body -->
    <div class="schedule-page__body">
      <ScheduleCardList
        v-if="isMobile"
        :schedules="store.schedules"
        @edit="store.openEditForm($event)"
        @delete="handleDelete"
      />
      <ScheduleTable
        v-else
        :schedules="store.schedules"
        @edit="store.openEditForm($event)"
        @delete="handleDelete"
      />
    </div>

    <!-- Dialog / Sheet -->
    <ScheduleSheet
      v-if="isMobile"
      :visible="store.formVisible"
      :editing="store.editingSchedule"
      @update:visible="store.closeForm()"
    />
    <ScheduleDialog
      v-else
      :visible="store.formVisible"
      :editing="store.editingSchedule"
      @update:visible="store.closeForm()"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Plus, Menu } from 'lucide-vue-next';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import ScheduleTable from './ScheduleTable.vue';
import ScheduleCardList from './ScheduleCardList.vue';
import ScheduleDialog from './ScheduleDialog.vue';
import ScheduleSheet from './ScheduleSheet.vue';

defineProps<{
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useScheduleStore();
const workflowStore = useWorkflowStore();

onMounted(async () => {
  await Promise.all([store.fetchSchedules(), workflowStore.fetchWorkflows()]);
});

async function handleDelete(id: string): Promise<void> {
  const schedule = store.schedules.find((s) => s.id === id);
  if (!schedule) return;
  try {
    await ElMessageBox.confirm(
      t('schedule.confirmDelete', { name: schedule.name }),
      t('common.warning'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    );
    await store.deleteSchedule(id);
    ElMessage.success(t('schedule.deleteSuccess'));
  } catch {
    // User cancelled
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-page {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    display: flex;
    align-items: center;
    padding: 20px 32px;
    border-bottom: 1px solid $border-dark;
  }

  &__header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: $text-primary-color;
    margin: 0;
  }

  &__desc {
    font-size: 13px;
    color: $text-muted;
    margin: 0;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
  }

  &.is-mobile &__body {
    padding: 16px;
  }

  &__mobile-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid $border-dark;
  }

  &__back-btn,
  &__add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: $radius-md;
    color: $text-secondary-color;
  }

  &__add-btn {
    color: $accent;
  }

  &__spacer {
    flex: 1;
  }

  .is-mobile & &__title {
    font-size: 16px;
  }
}
</style>
```

- [ ] **Step 2: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/schedule/SchedulePage.vue
git commit -m "feat(schedule): implement full SchedulePage with table, cards, and dialogs"
```

---

## Task 16: Final Preflight & Integration Test

**Files:** None new — verification only

- [ ] **Step 1: Run full backend preflight**

```bash
cd backend && pnpm run preflight
```
Expected: PASS (lint + typecheck + build)

- [ ] **Step 2: Run full backend tests**

```bash
cd backend && pnpm test
```
Expected: All tests pass including new schedule tests

- [ ] **Step 3: Run full frontend preflight**

```bash
cd frontend && pnpm run preflight
```
Expected: PASS (lint + typecheck + build)

- [ ] **Step 4: Run full frontend tests**

```bash
cd frontend && pnpm test
```
Expected: All tests pass including new schedule store tests

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(schedule): address preflight and test issues"
```
