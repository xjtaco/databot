# Table Data Preview

Add a "Data Preview" tab to the TableDetail page, allowing users to preview actual row data for both file-based tables (CSV/Excel) and database tables (SQLite/PostgreSQL).

## Backend

### New API Endpoint

`GET /api/tables/:id/preview?limit=20`

**Response:**
```json
{
  "columns": ["col1", "col2", "col3"],
  "rows": [
    { "col1": "value1", "col2": 42, "col3": true },
    ...
  ],
  "totalRows": 1500
}
```

**Query params:**
- `limit` (optional, default 20): Number of rows to return. Allowed values: 20, 50, 100. Invalid values return 400 ValidationError.

**Error responses:**
- 400: Invalid limit value
- 404: Table not found, data file missing, or datasource not found
- 500: Datasource connection failure

### Service Logic (`table.service.ts` — new function `getTablePreview`)

1. Fetch the table record (with columns, datasourceId).
2. Validate preconditions:
   - If `table.type` is `csv` or `excel` and `table.dataFilePath` is null, throw 404 error.
   - If `table.type` is `sqlite` or `postgresql` and `table.datasourceId` is null, throw 404 error.
3. Dispatch by `table.type`:
   - **csv / excel**: Resolve absolute path via `path.join(config.upload.directory, table.dataFilePath)`. Read the file using existing parsing utilities from `metadataParser`. Parse the first `limit` rows. Count total rows (CSV: line count; Excel: sheet row count).
   - **sqlite / postgresql**:
     1. Look up datasource record via `findDatasourceById(table.datasourceId)`.
     2. Retrieve the raw encrypted password via `getDatasourceRawPassword(datasourceId)` and decrypt with `decryptPassword()`.
     3. Normalize `table.type` from `TableSourceType` to `DatasourceType` (e.g., `'postgresql'` -> `'postgres'`), following the same pattern as `sqlNodeExecutor.ts`.
     4. Build `DatasourceConfig` and use `DatasourceFactory.getOrCreateDatasource()` to get a connection.
     5. Execute `SELECT * FROM <escaped_identifier> LIMIT <limit>` for data and `SELECT COUNT(*) FROM <escaped_identifier>` for total row count.
     6. **SQL identifier escaping**: `physicalName` must be escaped as a SQL identifier (double-quote escaping with internal double-quotes escaped), not just wrapped in raw quotes.
4. Return `{ columns, rows, totalRows }`.

### Route & Controller

- Route: Add `GET /:id/preview` to `table.routes.ts`
- Controller: `getTablePreviewHandler` in `table.controller.ts` — validates UUID, validates `limit` query param (default 20, must be one of 20/50/100, otherwise 400 error), calls service, returns JSON.

## Frontend

### New Component: `DataPreview.vue`

Location: `frontend/src/components/datafile/DataPreview.vue`

- **Props**: `tableId: string`
- **Layout**:
  - Top toolbar: total row count on the left, `el-select` for row limit (20/50/100) on the right
  - Body: `el-table` with columns dynamically generated from API response `columns` array
  - Loading state: `v-loading` directive on the table
  - Empty state: "No data" message
  - Error state: error message display
- **Local state**: Component manages its own loading/error state (not shared with the store's global `isLoading`), so loading the preview does not affect other parts of the page.

### TableDetail.vue Changes

- Add a third `el-tab-pane` with name `preview` and label from i18n `datafile.dataPreview`
- In the `activeTab` watcher, when tab is `preview`, call `datafileStore.fetchPreviewData(tableId)`
- Import and render `DataPreview` component inside the new tab

### Store Changes (`datafileStore.ts`)

- New state: `previewData: PreviewData | null`
- New action: `fetchPreviewData(tableId: string, limit?: number)` — calls `GET /tables/:id/preview?limit=N`, stores result, returns the data directly (so the component can manage its own loading state)
- Clear `previewData` in both `fetchTable` and `clearCurrentTable` to avoid stale data when switching tables

### Type Definition (`datafile.ts`)

```typescript
interface PreviewData {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
}
```

### API Client (`datafile.ts`)

New function:
```typescript
function getTablePreview(id: string, limit?: number): Promise<PreviewData>
```

### i18n Keys

| Key | zh-CN | en-US |
|-----|-------|-------|
| `datafile.dataPreview` | 数据预览 | Data Preview |
| `datafile.previewRows` | 显示行数 | Rows |
| `datafile.totalRows` | 总行数 | Total Rows |
| `datafile.previewError` | 数据预览失败 | Failed to load preview |
| `datafile.noPreviewData` | 暂无数据 | No data |
