# Table Data Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Data Preview" tab to the TableDetail page that shows actual row data from CSV/Excel files and SQLite/PostgreSQL databases.

**Architecture:** New backend endpoint `GET /tables/:id/preview` dispatches by table type: file-based tables (CSV/Excel) read data directly from disk via XLSX library; database tables (SQLite/PostgreSQL) query via `DatasourceFactory`. Frontend adds a `DataPreview.vue` component as a third tab in `TableDetail.vue` with its own loading/error state.

**Tech Stack:** Express.js, Prisma, XLSX, DatasourceFactory (better-sqlite3/pg), Vue 3, Element Plus, Pinia

**Spec:** `docs/superpowers/specs/2026-03-29-table-data-preview-design.md`

---

### Task 1: Backend — Add `PreviewData` type and `getTablePreview` service function

**Files:**
- Modify: `backend/src/table/table.types.ts`
- Modify: `backend/src/table/table.service.ts`
- Test: `backend/tests/services/tablePreview/tablePreview.test.ts`

- [ ] **Step 1: Add `PreviewData` type to `table.types.ts`**

At the end of `backend/src/table/table.types.ts`, add:

```typescript
export interface PreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}
```

- [ ] **Step 2: Write failing tests for `getTablePreview` — file-based tables**

Create `backend/tests/services/tablePreview/tablePreview.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

// Mock dependencies
const mockFindTableById = vi.hoisted(() => vi.fn());
const mockFindDatasourceById = vi.hoisted(() => vi.fn());
const mockGetDatasourceRawPassword = vi.hoisted(() => vi.fn());

vi.mock('@/table/table.repository', () => ({
  findTableById: mockFindTableById,
  findDatasourceById: mockFindDatasourceById,
  getDatasourceRawPassword: mockGetDatasourceRawPassword,
}));

const mockGetOrCreateDatasource = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/datasources/datasourceFactory', () => ({
  DatasourceFactory: {
    getOrCreateDatasource: mockGetOrCreateDatasource,
  },
}));

const mockDecryptPassword = vi.hoisted(() => vi.fn());
vi.mock('@/utils/encryption', () => ({
  decryptPassword: mockDecryptPassword,
}));

vi.mock('@/base/config', () => ({
  config: {
    upload: { directory: '/tmp/uploads' },
  },
}));

vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getTablePreview } from '@/table/table.service';

describe('getTablePreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw MetadataNotFoundError when table not found', async () => {
    mockFindTableById.mockResolvedValue(null);
    await expect(getTablePreview('non-existent-id', 20)).rejects.toThrow('Table not found');
  });

  it('should throw MetadataNotFoundError when csv table has no dataFilePath', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: 'csv',
      dataFilePath: null,
      columns: [],
    });
    await expect(getTablePreview('table-1', 20)).rejects.toThrow();
  });

  it('should throw MetadataNotFoundError when database table has no datasourceId', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: 'sqlite',
      datasourceId: null,
      columns: [],
    });
    await expect(getTablePreview('table-1', 20)).rejects.toThrow();
  });

  it('should preview CSV file data', async () => {
    // Create a real CSV buffer for testing
    const csvContent = 'name,age,active\nAlice,30,true\nBob,25,false\nCharlie,35,true';
    const csvBuffer = Buffer.from(csvContent);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(csvBuffer);

    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: 'csv',
      physicalName: 'test_csv',
      dataFilePath: '2026-03-29/test.csv',
      columns: [
        { physicalName: 'name' },
        { physicalName: 'age' },
        { physicalName: 'active' },
      ],
    });

    const result = await getTablePreview('table-1', 20);

    expect(result.columns).toEqual(['name', 'age', 'active']);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: 30, active: true });
    expect(result.totalRows).toBe(3);
  });

  it('should preview database table data', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: 'postgresql',
      physicalName: 'users',
      datasourceId: 'ds-1',
      columns: [],
    });

    mockFindDatasourceById.mockResolvedValue({
      id: 'ds-1',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
    });

    mockGetDatasourceRawPassword.mockResolvedValue('ENC:encrypted');
    mockDecryptPassword.mockReturnValue('plaintext');

    const mockDatasource = {
      isConnected: true,
      executeQuery: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ name: 'Alice', age: 30 }],
          rowCount: 1,
          fields: [{ name: 'name', type: 'varchar' }, { name: 'age', type: 'int4' }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '100' }],
          rowCount: 1,
          fields: [{ name: 'count', type: 'int8' }],
        }),
    };
    mockGetOrCreateDatasource.mockReturnValue(mockDatasource);

    const result = await getTablePreview('table-1', 20);

    expect(result.columns).toEqual(['name', 'age']);
    expect(result.rows).toEqual([{ name: 'Alice', age: 30 }]);
    expect(result.totalRows).toBe(100);

    // Verify SQL identifier is properly escaped
    const selectCall = mockDatasource.executeQuery.mock.calls[0][0] as string;
    expect(selectCall).toContain('"users"');
    expect(selectCall).toContain('LIMIT 20');
  });

  it('should limit rows to requested amount', async () => {
    const csvRows = Array.from({ length: 50 }, (_, i) => `name${i},${i}`);
    const csvContent = 'name,value\n' + csvRows.join('\n');
    vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from(csvContent));

    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: 'csv',
      physicalName: 'big_csv',
      dataFilePath: '2026-03-29/big.csv',
      columns: [{ physicalName: 'name' }, { physicalName: 'value' }],
    });

    const result = await getTablePreview('table-1', 20);

    expect(result.rows).toHaveLength(20);
    expect(result.totalRows).toBe(50);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/services/tablePreview/tablePreview.test.ts`
Expected: FAIL — `getTablePreview` is not exported from `table.service`

- [ ] **Step 4: Implement `getTablePreview` in `table.service.ts`**

Add the following imports at the top of `backend/src/table/table.service.ts`:

```typescript
import * as XLSX from 'xlsx';
import { DatasourceFactory } from '@/infrastructure/datasources/datasourceFactory';
import { DatasourceConfig, DatasourceType } from '@/infrastructure/datasources/types';
import { decryptPassword } from '@/utils/encryption';
import { PreviewData, TableSourceTypeValues } from './table.types';
```

Add the following helper function and `getTablePreview` function at the end of the file:

```typescript
/**
 * Escape a SQL identifier by double-quoting and escaping internal double-quotes.
 */
function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const datasourceTypeMap: Record<string, DatasourceType> = {
  postgresql: 'postgres',
  postgres: 'postgres',
  mysql: 'mysql',
  sqlite: 'sqlite',
};

/**
 * Preview actual row data from a table.
 * Dispatches by table type: file-based (CSV/Excel) reads from disk,
 * database-backed (SQLite/PostgreSQL) queries via DatasourceFactory.
 */
export async function getTablePreview(id: string, limit: number): Promise<PreviewData> {
  const table = await repository.findTableById(id);
  if (!table) {
    throw new MetadataNotFoundError('Table not found', { id });
  }

  const tableType = table.type;

  if (tableType === TableSourceTypeValues.CSV || tableType === TableSourceTypeValues.EXCEL) {
    if (!table.dataFilePath) {
      throw new MetadataNotFoundError('Data file not found for table', { id });
    }

    const absolutePath = path.join(config.upload.directory, table.dataFilePath);

    if (!fs.existsSync(absolutePath)) {
      throw new MetadataNotFoundError('Data file does not exist', { id, path: table.dataFilePath });
    }

    const buffer = fs.readFileSync(absolutePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    if (data.length === 0) {
      return { columns: [], rows: [], totalRows: 0 };
    }

    const headerRow = data[0] as (string | number)[];
    const columns = headerRow.map((h) => String(h));
    const totalRows = data.length - 1; // exclude header

    const rows: Record<string, unknown>[] = [];
    const rowEnd = Math.min(data.length, limit + 1); // +1 for header
    for (let i = 1; i < rowEnd; i++) {
      const row = data[i] as unknown[];
      const record: Record<string, unknown> = {};
      for (let j = 0; j < columns.length; j++) {
        record[columns[j]] = row[j] ?? null;
      }
      rows.push(record);
    }

    logger.info('File table preview generated', { id, totalRows, returnedRows: rows.length });

    return { columns, rows, totalRows };
  }

  // Database-backed table (SQLite / PostgreSQL)
  if (!table.datasourceId) {
    throw new MetadataNotFoundError('Datasource not found for table', { id });
  }

  const datasource = await repository.findDatasourceById(table.datasourceId);
  if (!datasource) {
    throw new MetadataNotFoundError('Datasource not found', { id: table.datasourceId });
  }

  const dsType = datasourceTypeMap[datasource.type];
  if (!dsType) {
    throw new MetadataNotFoundError('Unknown datasource type', { type: datasource.type });
  }

  // Get decrypted password
  const rawPassword = await repository.getDatasourceRawPassword(table.datasourceId);
  const password = rawPassword ? decryptPassword(rawPassword) : undefined;

  const dsConfig: DatasourceConfig = {
    type: dsType,
    host: datasource.host ?? undefined,
    port: datasource.port ?? undefined,
    database: datasource.database ?? '',
    user: datasource.user ?? undefined,
    password,
    filepath: datasource.filePath ?? undefined,
  };

  const ds = DatasourceFactory.getOrCreateDatasource(dsConfig);
  if (!ds.isConnected) {
    await ds.connect();
  }

  const escapedName = escapeIdentifier(table.physicalName);
  const dataResult = await ds.executeQuery(`SELECT * FROM ${escapedName} LIMIT ${limit}`);
  const countResult = await ds.executeQuery(`SELECT COUNT(*) AS count FROM ${escapedName}`);

  const columns = dataResult.fields.map((f) => f.name);
  const totalRows = Number(countResult.rows[0]?.count ?? 0);

  logger.info('Database table preview generated', { id, totalRows, returnedRows: dataResult.rows.length });

  return { columns, rows: dataResult.rows, totalRows };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/services/tablePreview/tablePreview.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/table/table.types.ts backend/src/table/table.service.ts backend/tests/services/tablePreview/tablePreview.test.ts
git commit -m "feat(table): add getTablePreview service with file and database support"
```

---

### Task 2: Backend — Add route and controller for table preview

**Files:**
- Modify: `backend/src/table/table.controller.ts`
- Modify: `backend/src/table/table.routes.ts`
- Test: `backend/tests/services/tablePreview/tablePreviewController.test.ts`

- [ ] **Step 1: Write failing test for controller validation**

Create `backend/tests/services/tablePreview/tablePreviewController.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the service
const mockGetTablePreview = vi.hoisted(() => vi.fn());

vi.mock('@/table/table.service', () => ({
  listTables: vi.fn(),
  listDatasourcesWithTables: vi.fn(),
  getTable: vi.fn(),
  getDictionaryContent: vi.fn(),
  updateTable: vi.fn(),
  deleteTable: vi.fn(),
  getTablePreview: mockGetTablePreview,
}));

vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getTablePreviewHandler } from '@/table/table.controller';
import { errorHandler } from '@/middleware/errorHandler';

function buildApp() {
  const app = express();
  app.get('/tables/:id/preview', getTablePreviewHandler);
  app.use(errorHandler);
  return app;
}

describe('getTablePreviewHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 for invalid UUID', async () => {
    const app = buildApp();
    const res = await request(app).get('/tables/not-a-uuid/preview');
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid limit value', async () => {
    const app = buildApp();
    const res = await request(app).get('/tables/550e8400-e29b-41d4-a716-446655440001/preview?limit=30');
    expect(res.status).toBe(400);
  });

  it('should use default limit of 20', async () => {
    mockGetTablePreview.mockResolvedValue({ columns: [], rows: [], totalRows: 0 });
    const app = buildApp();
    await request(app).get('/tables/550e8400-e29b-41d4-a716-446655440001/preview');
    expect(mockGetTablePreview).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', 20);
  });

  it('should accept valid limit values', async () => {
    mockGetTablePreview.mockResolvedValue({ columns: ['a'], rows: [{ a: 1 }], totalRows: 1 });
    const app = buildApp();

    for (const limit of [20, 50, 100]) {
      const res = await request(app).get(`/tables/550e8400-e29b-41d4-a716-446655440001/preview?limit=${limit}`);
      expect(res.status).toBe(200);
    }
  });

  it('should return preview data on success', async () => {
    const previewData = {
      columns: ['name', 'age'],
      rows: [{ name: 'Alice', age: 30 }],
      totalRows: 100,
    };
    mockGetTablePreview.mockResolvedValue(previewData);
    const app = buildApp();
    const res = await request(app).get('/tables/550e8400-e29b-41d4-a716-446655440001/preview?limit=50');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(previewData);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/services/tablePreview/tablePreviewController.test.ts`
Expected: FAIL — `getTablePreviewHandler` is not exported

- [ ] **Step 3: Add `getTablePreviewHandler` to `table.controller.ts`**

Add import of `getTablePreview` to the service import block:

```typescript
import {
  listTables,
  listDatasourcesWithTables,
  getTable,
  getDictionaryContent,
  updateTable,
  deleteTable,
  getTablePreview,
} from './table.service';
```

Add the handler function at the end of the file:

```typescript
const VALID_PREVIEW_LIMITS = [20, 50, 100];

export async function getTablePreviewHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }

  let limit = 20;
  if (req.query.limit !== undefined) {
    const parsed = Number(req.query.limit);
    if (!VALID_PREVIEW_LIMITS.includes(parsed)) {
      throw new ValidationError(`limit must be one of: ${VALID_PREVIEW_LIMITS.join(', ')}`);
    }
    limit = parsed;
  }

  const preview = await getTablePreview(id, limit);
  res.json(preview);
}
```

- [ ] **Step 4: Add route to `table.routes.ts`**

Add `getTablePreviewHandler` to the import and add the route. The preview route must be placed **before** the `/:id` route to avoid being caught by the wildcard:

```typescript
import {
  listTablesHandler,
  listDatasourcesHandler,
  getTableHandler,
  getDictionaryHandler,
  updateTableHandler,
  deleteTableHandler,
  getTablePreviewHandler,
} from './table.controller';

const router = Router();

router.get('/', listTablesHandler);
router.get('/datasources', listDatasourcesHandler);
router.get('/:id', getTableHandler);
router.get('/:id/dictionary', getDictionaryHandler);
router.get('/:id/preview', getTablePreviewHandler);
router.put('/:id', updateTableHandler);
router.delete('/:id', deleteTableHandler);
```

Note: `/:id/preview` and `/:id/dictionary` are both sub-routes of `/:id` and do NOT conflict with `/:id` itself because Express v5 matches more specific paths first when they have additional segments.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/services/tablePreview/`
Expected: All tests PASS

- [ ] **Step 6: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: All checks pass (lint, format, typecheck, build, test)

- [ ] **Step 7: Commit**

```bash
git add backend/src/table/table.controller.ts backend/src/table/table.routes.ts backend/tests/services/tablePreview/tablePreviewController.test.ts
git commit -m "feat(table): add GET /tables/:id/preview route and controller"
```

---

### Task 3: Frontend — Add types, API client, and store changes

**Files:**
- Modify: `frontend/src/types/datafile.ts`
- Modify: `frontend/src/api/datafile.ts`
- Modify: `frontend/src/stores/datafileStore.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add `PreviewData` type to `frontend/src/types/datafile.ts`**

At the end of the file, add:

```typescript
export interface PreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}
```

- [ ] **Step 2: Add API function to `frontend/src/api/datafile.ts`**

Add import of `PreviewData`:

```typescript
import type {
  TableMetadata,
  TableWithColumns,
  UpdateTableInput,
  DatasourceWithTables,
  PreviewData,
} from '@/types/datafile';
```

Add function at the end:

```typescript
export async function getTablePreview(id: string, limit?: number): Promise<PreviewData> {
  const params = limit !== undefined ? `?limit=${limit}` : '';
  return http.get<PreviewData>(`/tables/${id}/preview${params}`);
}
```

- [ ] **Step 3: Add store state and action to `frontend/src/stores/datafileStore.ts`**

Add `PreviewData` to the type import:

```typescript
import type {
  TableMetadata,
  TableWithColumns,
  UpdateTableInput,
  DatasourceWithTables,
  DatabaseDatasourceType,
  PreviewData,
} from '@/types/datafile';
```

Add state after `dictionaryContent`:

```typescript
const previewData = ref<PreviewData | null>(null);
```

Add action (NOT wrapped in `wrapAction` — component manages its own loading state):

```typescript
async function fetchPreviewData(tableId: string, limit?: number): Promise<PreviewData> {
  const result = await datafileApi.getTablePreview(tableId, limit);
  previewData.value = result;
  return result;
}
```

Update `clearCurrentTable` to also clear preview data:

```typescript
function clearCurrentTable(): void {
  currentTable.value = null;
  dictionaryContent.value = '';
  previewData.value = null;
}
```

Update `fetchTable` to clear preview data at the start:

```typescript
const fetchTable = wrapAction(async (id: string): Promise<void> => {
  previewData.value = null;
  const result = await datafileApi.getTable(id);
  currentTable.value = result.table;
});
```

Add `previewData` and `fetchPreviewData` to the return object.

- [ ] **Step 4: Add i18n keys to `frontend/src/locales/zh-CN.ts`**

In the `datafile` section, add before the closing brace:

```typescript
    dataPreview: '数据预览',
    previewRows: '显示行数',
    totalRows: '总行数',
    previewError: '数据预览失败',
    noPreviewData: '暂无数据',
```

- [ ] **Step 5: Add i18n keys to `frontend/src/locales/en-US.ts`**

In the `datafile` section, add before the closing brace:

```typescript
    dataPreview: 'Data Preview',
    previewRows: 'Rows',
    totalRows: 'Total Rows',
    previewError: 'Failed to load preview',
    noPreviewData: 'No data',
```

- [ ] **Step 6: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/datafile.ts frontend/src/api/datafile.ts frontend/src/stores/datafileStore.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(frontend): add PreviewData type, API client, store, and i18n keys"
```

---

### Task 4: Frontend — Create `DataPreview.vue` component and integrate into `TableDetail.vue`

**Files:**
- Create: `frontend/src/components/datafile/DataPreview.vue`
- Modify: `frontend/src/components/datafile/TableDetail.vue`

- [ ] **Step 1: Create `DataPreview.vue`**

Create `frontend/src/components/datafile/DataPreview.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PreviewData } from '@/types/datafile';
import { useDatafileStore } from '@/stores';

const { t } = useI18n();
const datafileStore = useDatafileStore();

const props = defineProps<{
  tableId: string;
}>();

const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const previewData = ref<PreviewData | null>(null);
const limit = ref(20);

const limitOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
];

async function loadPreview(): Promise<void> {
  isLoading.value = true;
  errorMsg.value = null;
  try {
    previewData.value = await datafileStore.fetchPreviewData(props.tableId, limit.value);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.tableId,
  () => {
    previewData.value = null;
    loadPreview();
  },
  { immediate: true }
);

watch(limit, () => {
  loadPreview();
});
</script>

<template>
  <div class="data-preview">
    <div v-if="errorMsg" class="preview-error">
      <span>{{ t('datafile.previewError') }}: {{ errorMsg }}</span>
    </div>
    <template v-else>
      <div class="preview-toolbar">
        <span v-if="previewData" class="total-rows">
          {{ t('datafile.totalRows') }}: {{ previewData.totalRows }}
        </span>
        <span v-else class="total-rows">&nbsp;</span>
        <div class="limit-selector">
          <span class="limit-label">{{ t('datafile.previewRows') }}</span>
          <el-select v-model="limit" size="small" class="limit-select">
            <el-option
              v-for="opt in limitOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
      </div>
      <div v-loading="isLoading" class="preview-table-wrapper">
        <el-table
          v-if="previewData && previewData.rows.length > 0"
          :data="previewData.rows"
          border
          size="small"
          class="preview-table"
        >
          <el-table-column
            v-for="col in previewData.columns"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
            show-overflow-tooltip
          />
        </el-table>
        <div v-else-if="previewData && previewData.rows.length === 0" class="preview-empty">
          {{ t('datafile.noPreviewData') }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.data-preview {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-rows {
  font-size: $font-size-xs;
  color: $text-secondary-color;
}

.limit-selector {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
}

.limit-label {
  font-size: $font-size-xs;
  color: $text-secondary-color;
}

.limit-select {
  width: 80px;
}

.preview-table-wrapper {
  min-height: 200px;
}

.preview-table {
  :deep(.el-table__header th) {
    background: $bg-elevated;
    color: $text-muted;
    font-size: 11px;
    font-weight: $font-weight-semibold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  :deep(.el-table__body td) {
    font-size: $font-size-xs;
    font-family: $font-family-dm-mono;
  }
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: $text-secondary-color;
  font-size: $font-size-sm;
}

.preview-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: $error;
  font-size: $font-size-sm;
}
</style>
```

- [ ] **Step 2: Modify `TableDetail.vue` to add the preview tab**

Add import at the top of the `<script setup>`:

```typescript
import DataPreview from './DataPreview.vue';
```

Add the new `el-tab-pane` after the dictionary tab (inside the `<el-tabs>` block):

```vue
<el-tab-pane :label="t('datafile.dataPreview')" name="preview">
  <DataPreview v-if="table && activeTab === 'preview'" :table-id="table.id" />
</el-tab-pane>
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/datafile/DataPreview.vue frontend/src/components/datafile/TableDetail.vue
git commit -m "feat(frontend): add DataPreview component and integrate into TableDetail tabs"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 2: Run full frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: All checks pass

- [ ] **Step 3: Final commit (if any fixes needed)**

If any lint/type fixes were needed, commit them.
