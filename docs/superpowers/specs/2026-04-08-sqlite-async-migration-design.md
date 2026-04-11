# SQLite Async Migration Design

**Date:** 2026-04-08
**Status:** Approved

## Problem

`SqliteDatasource` uses `better-sqlite3`, a synchronous SQLite driver. Calls like `stmt.all()` block the Node.js event loop during query execution. When copilot or agent sessions run complex SQL queries on large SQLite databases, the entire backend becomes unresponsive — no HTTP requests or WebSocket messages can be processed until the query completes.

## Solution

Replace `better-sqlite3` with `sqlite3` (native async C++ addon) + `sqlite` (Promise wrapper) in `SqliteDatasource` only. This gives true async I/O that yields the event loop during query execution.

## Scope

### Changed
- `backend/src/infrastructure/datasources/sqliteDatasource.ts` — rewrite to use `sqlite` + `sqlite3`
- `backend/tests/infrastructure/datasources/sqliteDatasource.test.ts` — update mocks
- `backend/package.json` — add `sqlite3`, `sqlite` dependencies

### Unchanged
- `backend/src/sqlite/sqliteParser.ts` — keeps `better-sqlite3` (one-shot upload parsing, short-lived)
- `backend/src/infrastructure/datasources/base.ts` — no changes to base class
- `backend/src/infrastructure/datasources/datasourceFactory.ts` — no changes
- `backend/src/infrastructure/tools/sqlTool.ts` — no changes (uses Datasource abstraction)
- SqlTool integration tests — setup databases with `better-sqlite3`, query via `SqliteDatasource` (now async)
- `better-sqlite3` and `@types/better-sqlite3` remain in dependencies (used by sqliteParser and tests)

## API Mapping

| Method | better-sqlite3 (sync) | sqlite3 + sqlite (async) |
|--------|----------------------|--------------------------|
| Open DB | `new betterSqlite3(path)` | `open({ filename, driver: sqlite3.Database })` |
| WAL mode | `db.pragma('journal_mode = WAL')` | `db.run('PRAGMA journal_mode = WAL')` |
| Close | `db.close()` sync | `db.close()` async |
| SELECT query | `db.prepare(sql).all(...params)` sync | `db.all(sql, ...params)` async |
| Column metadata | `stmt.columns()` for empty results | `db.all('PRAGMA table_info(tableName)')` |
| Table list | `db.pragma(query)` | `db.all('SELECT name FROM sqlite_master ...')` |
| Column info | `db.pragma('table_info(table)')` | `db.all('PRAGMA table_info("table")')` |

## Column Metadata for Empty Results

`better-sqlite3` provides `stmt.columns()` to get column names even when a query returns zero rows. The `sqlite` package does not have this. For empty result sets, we will execute a wrapped subquery `SELECT * FROM (<original_query>) LIMIT 0` via `db.all()` — sqlite3 returns column names in the statement metadata. If that also fails to provide columns, fall back to returning an empty fields array (matching the existing behavior for edge cases).

## Type Changes

Remove custom interfaces (`SQLiteDatabase`, `SQLiteStatement`, `SQLiteColumn`). Use the `Database` type from the `sqlite` package directly.

## Error Handling

No changes to error types. `DatasourceConnectionError`, `DatasourceQueryError`, and `DatasourceSchemaError` continue to be thrown at the same points. The `sqlite3` driver emits errors as rejected promises, which align with the existing try/catch pattern.

## Testing Strategy

- **Unit tests** (`sqliteDatasource.test.ts`): Update mocks from `better-sqlite3` to `sqlite`/`sqlite3`
- **Integration tests** (`sqlTool/*.test.ts`): No changes needed — they create test DBs with `better-sqlite3` then query through `SqlTool` → `DatasourceFactory` → `SqliteDatasource`. The async `SqliteDatasource` reads the same SQLite files.
