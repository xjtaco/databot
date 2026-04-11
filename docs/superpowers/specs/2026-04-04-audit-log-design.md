# Audit Log Module Design

## Overview

Add an audit log module to databot that records admin operations and user key data operations. Only administrators can view audit logs. Log details are rendered in Chinese or English based on the current UI language setting.

## Requirements

- Track admin operations (user management, system config) and user key data operations (datasource, workflow, knowledge CRUD)
- Structured storage in database; frontend dynamically renders i18n descriptions from action codes + params
- Dedicated navigation menu item visible only to admins
- Filtering by time range, operator, action type + keyword search + CSV export
- Admin-configurable retention period with automatic cleanup
- Resource name snapshots in log params (survive resource deletion)

## Data Model

### AuditLog Table

```prisma
model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String?  @map("user_id") @db.Uuid
  username  String   // snapshot, traceable after user deletion
  action    String   // action code, e.g. "USER_CREATED", "DATASOURCE_DELETED"
  category  String   // "user_management", "datasource", "workflow", "knowledge", "system_config", "auth"
  params    Json?    // structured params, e.g. { "targetUsername": "alice", "datasourceName": "prod-db" }
  ipAddress String?  @map("ip_address")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([userId])
  @@index([action])
  @@index([category])
  @@map("audit_logs")
}
```

### Audit Action Codes

| Category | Action | Params Example |
|----------|--------|----------------|
| auth | `LOGIN_SUCCESS` | `{}` |
| auth | `LOGIN_FAILED` | `{ "reason": "invalid_password" }` |
| auth | `LOGOUT` | `{}` |
| auth | `PASSWORD_CHANGED` | `{}` |
| user_management | `USER_CREATED` | `{ "targetUsername": "alice", "role": "user" }` |
| user_management | `USER_UPDATED` | `{ "targetUsername": "alice", "changes": ["email","role"] }` |
| user_management | `USER_LOCKED` | `{ "targetUsername": "alice" }` |
| user_management | `USER_UNLOCKED` | `{ "targetUsername": "alice" }` |
| user_management | `USER_DELETED` | `{ "targetUsername": "alice" }` |
| datasource | `DATASOURCE_CREATED` | `{ "datasourceName": "prod-db" }` |
| datasource | `DATASOURCE_UPDATED` | `{ "datasourceName": "prod-db" }` |
| datasource | `DATASOURCE_DELETED` | `{ "datasourceName": "prod-db" }` |
| workflow | `WORKFLOW_CREATED` | `{ "workflowName": "ETL Pipeline" }` |
| workflow | `WORKFLOW_UPDATED` | `{ "workflowName": "ETL Pipeline" }` |
| workflow | `WORKFLOW_DELETED` | `{ "workflowName": "ETL Pipeline" }` |
| workflow | `WORKFLOW_EXECUTED` | `{ "workflowName": "ETL Pipeline" }` |
| knowledge | `KNOWLEDGE_FOLDER_CREATED` | `{ "folderName": "Reports" }` |
| knowledge | `KNOWLEDGE_FOLDER_DELETED` | `{ "folderName": "Reports" }` |
| knowledge | `KNOWLEDGE_FILE_UPLOADED` | `{ "fileName": "report.pdf" }` |
| knowledge | `KNOWLEDGE_FILE_DELETED` | `{ "fileName": "report.pdf" }` |
| system_config | `GLOBAL_CONFIG_UPDATED` | `{ "configKey": "llm_provider" }` |
| system_config | `AUDIT_LOGS_CLEANED` | `{ "deletedCount": 42, "retentionDays": 180 }` |

### Retention Configuration

New entry in `GlobalConfig`:
- `configKey`: `audit_log_retention_days`
- `category`: `audit`
- `configValue`: `"180"` (default 180 days)

## Backend Architecture

### Module Structure

```
backend/src/auditLog/
├── auditLogController.ts   # HTTP request handling (query, export)
├── auditLogService.ts      # Business logic (log, query, cleanup)
├── auditLogRepository.ts   # Prisma data access
├── auditLogRoutes.ts       # Route definitions
├── auditMiddleware.ts      # Audit middleware
├── auditActions.ts         # Action code constants
└── auditCleanupJob.ts      # Scheduled cleanup job
```

### Audit Middleware

```typescript
// Usage: mount on routes that need auditing
router.post('/users', adminOnly, auditMiddleware('USER_CREATED', 'user_management'), userController.create)
```

Middleware logic:
1. Attaches `auditContext` object to `req` for controller to supplement params
2. Intercepts `res.json()`, writes audit log asynchronously after successful response (2xx)
3. Gets `userId`/`username` from `req.user`, IP from `req.ip`
4. Controller supplements context via `req.auditContext.params = { targetUsername: "alice" }`

For login/logout operations that bypass `authMiddleware`, call `auditLogService.log()` explicitly in `authService`.

### API Endpoints

All endpoints require admin permission:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit-logs` | Paginated query with filters |
| `GET` | `/api/audit-logs/export` | Export logs as CSV |
| `GET` | `/api/audit-logs/actions` | List all action types (for filter dropdown) |

### Query Parameters (GET /api/audit-logs)

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number, default 1 |
| `pageSize` | number | Items per page, default 20, max 100 |
| `startDate` | ISO string | Start time |
| `endDate` | ISO string | End time |
| `userId` | string | Filter by operator |
| `category` | string | Filter by category |
| `action` | string | Filter by action |
| `keyword` | string | Keyword search (fuzzy match on params JSON and username) |

### Scheduled Cleanup Job

- Uses `setInterval`-based scheduler (consistent with the project's existing `scheduleEngine.ts` pattern using `cron-parser`), runs daily at 02:00
- Reads `audit_log_retention_days` from `GlobalConfig`
- Deletes records where `createdAt` is older than retention period
- Logs cleanup action as `AUDIT_LOGS_CLEANED`

### Error Codes

New error code:
- `E00057`: `AUDIT_LOG_EXPORT_ERROR` - Export failed

## Frontend Architecture

### Module Structure

```
frontend/src/
├── api/auditLog.ts              # API calls
├── stores/auditLogStore.ts      # Pinia store
├── components/audit/
│   ├── AuditLogPage.vue         # Main page (desktop table + mobile cards)
│   └── AuditLogFilterPanel.vue  # Filter panel component
├── locales/
│   ├── zh-CN.ts                 # Add auditLog.* namespace
│   └── en-US.ts                 # Add auditLog.* namespace
```

### Desktop Layout

- Top filter bar: date range picker, operator dropdown, action type dropdown, keyword search, query/reset/export buttons
- Main table: time, operator, category (colored tag), action, details (i18n rendered text), IP address
- Bottom pagination

### Mobile Layout

- Top simplified: search box + filter button (tap to expand filter panel) + export button
- List as card layout, each card displays one log entry
- Simplified bottom pagination

### i18n Dynamic Rendering

```typescript
// Frontend renders description from action code + params
// zh-CN: auditLog.actions.USER_CREATED = "创建了用户 {targetUsername}，角色: {role}"
// en-US: auditLog.actions.USER_CREATED = "Created user {targetUsername}, role: {role}"
```

### Navigation Entry

- Add "Audit Log" menu item in `DesktopLayout.vue` and `MobileLayout.vue`
- Visibility controlled by `authStore.isAdmin`

## Testing Strategy

### Backend Unit Tests

| Test File | Coverage |
|-----------|----------|
| `auditLogService.test.ts` | Log recording, query filtering, keyword search, export generation, cleanup logic |
| `auditLogController.test.ts` | Parameter validation, permission checks, paginated response format |
| `auditMiddleware.test.ts` | Middleware mounting, record on success/failure, auditContext param supplementation |
| `auditCleanupJob.test.ts` | Cleanup by retention days, config reading, edge cases (missing config defaults) |

### Frontend Unit Tests

| Test File | Coverage |
|-----------|----------|
| `auditLogStore.test.ts` | API calls, state management, filter param construction |
| `AuditLogPage.test.ts` | Page rendering, filter interaction, pagination, i18n description text switching |

## Edge Cases

- **Missing cleanup config**: Default to 180 days
- **Large export**: Reuse query conditions, stream CSV, max export limit 10,000 records; if limit is hit, only return first 10,000 matching records and include a warning header in the CSV
- **Concurrent writes**: Audit logs are append-only, no concurrency conflicts
- **Login failure recording**: No `req.user` available; use `username` from request body, `userId` is null
- **Deleted user**: Username snapshot stored in log, unaffected
- **No User relation**: `AuditLog` intentionally does not define a Prisma relation to `User` — this ensures logs survive user deletion and supports null `userId` for login failures
- **Scheduled workflow executions**: Only manual workflow executions are audited in this version; system-triggered (cron) executions are already tracked in `WorkflowRun` and do not generate audit logs

## Out of Scope

- Real-time push (WebSocket notification for new logs)
- Log archival to external storage
- Operation rollback functionality
