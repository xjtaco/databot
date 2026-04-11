# Multi-Database Support via JDBC Bridge

## Overview

新增 Java JDBC Bridge 中间层服务，统一处理所有远程数据库连接（除 SQLite 外），支持 15+ 种数据库类型。Bridge 使用 Vert.x Web 框架，提供 RESTful API 供 Node.js Backend 调用。

## 支持的数据库类型

MySQL, SQL Server, MariaDB, Oracle, DB2, SAP HANA, KingBase, ClickHouse, Apache Spark, Apache Hive2, StarRocks, Trino, PrestoDB, TiDB, 达梦, PostgreSQL

## 架构

```
Frontend (Vue 3) → Backend (Node.js/Express) → Bridge (Java/Vert.x) → 各数据库
                                               ↑
                                          REST API (HTTP)
```

- **Bridge 职责**：纯 JDBC 代理，连接池管理、SQL 执行、元数据获取，不含业务逻辑
- **Backend 职责**：业务逻辑（类型映射、字典生成、Prisma 存储、密码加密等）
- **现有 PostgreSQL** 迁移到 Bridge，删除 `backend/src/postgres/` 模块
- **现有 `infrastructure/datasources/`** 模块重构，远程数据库实现改为调用 Bridge（见 Section 2.1）
- Bridge 与 Backend 之间通过 Docker 内部网络通信，密码以明文传输（Bridge 不做持久化存储）；Backend 负责加解密

## Section 1: Bridge 服务

### 技术栈

- Java 17 + Vert.x Web + HikariCP
- Maven 构建，fat jar 部署
- 目录：`bridge/`

### REST API

**连接管理：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/connections` | 注册连接（创建连接池） |
| DELETE | `/connections/{id}` | 销毁连接池 |
| POST | `/connections/test` | 测试连接（不缓存） |

**元数据查询：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/connections/{id}/databases` | 获取数据库列表 |
| GET | `/connections/{id}/schemas` | 获取 schema 列表 |
| GET | `/connections/{id}/tables` | 获取表列表（query param: schema） |
| GET | `/connections/{id}/tables/{table}/columns` | 获取列信息 |

**SQL 执行：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/connections/{id}/query` | 执行 SQL，body: `{ sql, maxRows? }` |

**健康检查：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

### 连接注册请求体

```json
{
  "id": "datasource-uuid",
  "dbType": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "user": "root",
  "password": "xxx",
  "properties": {}
}
```

- `id` 由 Backend 指定（复用 Datasource UUID）
- `dbType` 枚举所有支持的数据库类型
- `properties` 可选，传递特殊参数（如 Oracle SID/ServiceName、SAP HANA instance number）

### 连接池管理

- 每个注册连接创建独立 HikariCP pool（min=1, max=5）
- 空闲超时 30 分钟自动回收
- Bridge 重启后连接池丢失，Backend 下次请求时按需重新注册
- `POST /connections` 为幂等操作（upsert）：若 id 已存在，关闭旧连接池并用新配置重建

### JDBC URL 生成

`JdbcUrlBuilder` 根据 `dbType` 拼接 URL：

```
mysql       → jdbc:mysql://{host}:{port}/{database}
mariadb     → jdbc:mariadb://{host}:{port}/{database}
postgresql  → jdbc:postgresql://{host}:{port}/{database}
sqlserver   → jdbc:sqlserver://{host}:{port};databaseName={database}
oracle      → jdbc:oracle:thin:@{host}:{port}/{database}
db2         → jdbc:db2://{host}:{port}/{database}
saphana     → jdbc:sap://{host}:{port}/?databaseName={database}
kingbase    → jdbc:kingbase8://{host}:{port}/{database}
clickhouse  → jdbc:clickhouse://{host}:{port}/{database}
spark       → jdbc:hive2://{host}:{port}/{database}
hive2       → jdbc:hive2://{host}:{port}/{database}
starrocks   → jdbc:mysql://{host}:{port}/{database}
trino       → jdbc:trino://{host}:{port}/{database}
prestodb    → jdbc:presto://{host}:{port}/{database}
tidb        → jdbc:mysql://{host}:{port}/{database}
dameng      → jdbc:dm://{host}:{port}/{database}
```

### Bridge 内部结构

```
bridge/src/main/java/com/databot/bridge/
├── MainVerticle.java              # Vert.x 启动入口，注册路由
├── handler/
│   ├── ConnectionHandler.java     # 连接注册/销毁/测试
│   ├── MetadataHandler.java       # 数据库/schema/表/列查询
│   └── QueryHandler.java          # SQL 执行
├── pool/
│   └── ConnectionPoolManager.java # HikariCP 池管理，空闲回收
├── jdbc/
│   └── JdbcUrlBuilder.java        # 根据 dbType 生成 JDBC URL
└── model/
    ├── ConnectionConfig.java      # 连接配置 POJO
    └── QueryResult.java           # 查询结果封装
```

### 元数据查询

统一通过 JDBC `DatabaseMetaData` API：

```java
DatabaseMetaData meta = connection.getMetaData();
meta.getCatalogs()                           // 数据库列表
meta.getSchemas(catalog, null)               // schema 列表
meta.getTables(catalog, schema, "%", types)  // 表列表
meta.getColumns(catalog, schema, table, "%") // 列信息
meta.getPrimaryKeys(catalog, schema, table)  // 主键
```

### 查询结果格式

```json
{
  "columns": [
    { "name": "id", "type": "INTEGER", "nullable": false },
    { "name": "name", "type": "VARCHAR", "nullable": true }
  ],
  "rows": [
    [1, "Alice"],
    [2, "Bob"]
  ],
  "rowCount": 2,
  "truncated": false
}
```

### 错误响应格式

```json
{
  "error": "CONNECTION_FAILED",
  "message": "Cannot connect to database: Connection refused",
  "details": { "host": "localhost", "port": 3306 }
}
```

错误码枚举：`CONNECTION_FAILED`、`CONNECTION_NOT_FOUND`、`QUERY_ERROR`、`METADATA_ERROR`、`INVALID_REQUEST`、`TIMEOUT`

### 查询超时

`POST /connections/{id}/query` 支持 `timeoutMs` 参数：

```json
{ "sql": "SELECT ...", "maxRows": 1000, "timeoutMs": 30000 }
```

未指定时使用 Bridge 默认超时（60 秒）。针对 Hive/Spark 等慢查询场景尤其重要。

### 连接驱逐与重试

当 Backend 请求一个已被驱逐的连接时，Bridge 返回 `CONNECTION_NOT_FOUND` 错误。Backend 的 `bridgeClient.ts` 需实现重试逻辑：检测到此错误后，自动重新注册连接并重试原请求（最多 1 次重试）。
```

### JDBC 驱动依赖

| 数据库 | Maven Artifact |
|--------|---------------|
| MySQL | `com.mysql:mysql-connector-j` |
| MariaDB | `org.mariadb.jdbc:mariadb-java-client` |
| PostgreSQL | `org.postgresql:postgresql` |
| SQL Server | `com.microsoft.sqlserver:mssql-jdbc` |
| Oracle | `com.oracle.database.jdbc:ojdbc11` |
| DB2 | `com.ibm.db2:jcc` |
| SAP HANA | `com.sap.cloud.db.jdbc:ngdbc` |
| ClickHouse | `com.clickhouse:clickhouse-jdbc` |
| Spark / Hive2 | `org.apache.hive:hive-jdbc` |
| Trino | `io.trino:trino-jdbc` |
| PrestoDB | `com.facebook.presto:presto-jdbc` |
| KingBase | 手动引入 jar（`bridge/libs/kingbase8-jdbc.jar`） |
| 达梦 | 手动引入 jar（`bridge/libs/DmJdbcDriver18.jar`） |

## Section 2: Backend 改造

### 2.1 `infrastructure/datasources/` 模块重构

现有模块结构：
- `base.ts` — 抽象 `Datasource` 类（`connect()`, `disconnect()`, `executeQuery()`, `getTables()`, `getColumns()`, `validateQuery()`）
- `postgresDatasource.ts` — PostgreSQL 实现（`pg` 驱动）
- `mysqlDatasource.ts` — MySQL 实现（`mysql2` 驱动）
- `sqliteDatasource.ts` — SQLite 实现（`better-sqlite3`）
- `datasourceFactory.ts` — 工厂 + 单例缓存
- `types.ts` — `DatasourceType = 'mysql' | 'postgres' | 'sqlite'`

该模块被 SQL Tool（LLM agent）、SQL Node Executor（workflow）、Table Service 使用，是查询执行的核心路径。

**改造方案：**

1. **新增 `bridgeDatasource.ts`** — 实现 `Datasource` 抽象类，所有方法通过 `bridgeClient.ts` 调用 Bridge REST API
   - `connect()` → 调用 Bridge `POST /connections` 注册连接池
   - `disconnect()` → 调用 Bridge `DELETE /connections/{id}`
   - `executeQuery()` → 调用 Bridge `POST /connections/{id}/query`
   - `getTables()` → 调用 Bridge `GET /connections/{id}/tables`
   - `getColumns()` → 调用 Bridge `GET /connections/{id}/tables/{table}/columns`
   - `validateQuery()` 保留在 Backend 侧（读写校验在发送到 Bridge 之前执行）

2. **删除** `postgresDatasource.ts` 和 `mysqlDatasource.ts`

3. **保留** `sqliteDatasource.ts`（SQLite 不走 Bridge）

4. **扩展 `DatasourceType`**：
   ```typescript
   export type DatasourceType =
     | 'mysql' | 'sqlserver' | 'mariadb' | 'oracle' | 'db2'
     | 'saphana' | 'kingbase' | 'clickhouse' | 'spark' | 'hive2'
     | 'starrocks' | 'trino' | 'prestodb' | 'tidb' | 'dameng'
     | 'postgresql' | 'sqlite';
   ```

5. **更新 `datasourceFactory.ts`**：
   - SQLite → `SqliteDatasource`
   - 其他所有类型 → `BridgeDatasource`
   - 缓存 key 生成规则不变（`type:host:port:database:user`）

6. **`DatasourceConfig` 扩展**：新增 `properties?: Record<string, string>` 字段

7. **`postgres` → `postgresql` 重命名**：现有 `DatasourceType` 中 `'postgres'` 统一改为 `'postgresql'`，与 `TableSourceTypeValues.POSTGRESQL` 一致。需处理：
   - Prisma 数据迁移：`UPDATE datasources SET type = 'postgresql' WHERE type = 'postgres'`
   - `dictionaryGenerator.ts` 中生成的 config.ini `type = postgres` 改为 `type = postgresql`
   - 现有 `.ini` 文件中的 `type = postgres` 需兼容读取（`sqlTool.ts` 解析时同时接受两种值）

这样 SQL Tool、SQL Node Executor 等消费者代码**无需修改**，`DatasourceFactory.getOrCreateDatasource()` 接口不变，只是底层实现从原生驱动改为 Bridge HTTP 调用。

### 2.2 新增统一数据源模块

`backend/src/datasource/`，替代 `backend/src/postgres/`：

| 文件 | 职责 |
|------|------|
| `datasource.types.ts` | 统一连接配置接口 |
| `datasource.service.ts` | 业务逻辑（调 Bridge、类型映射、字典、Prisma） |
| `datasource.controller.ts` | 请求校验、路由处理 |
| `datasource.routes.ts` | 统一路由 |
| `bridgeClient.ts` | Bridge HTTP 客户端封装 |
| `typeMapper.ts` | 各数据库类型 → FieldDataType 映射 |

### 统一连接配置接口

```typescript
interface DatabaseConnectionConfig {
  dbType: DatabaseType
  host: string
  port: number
  database: string
  user: string
  password: string
  properties?: Record<string, string>
}
```

### Backend REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/datasource/test-connection` | 测试连接 |
| POST | `/datasource` | 创建数据源 |
| PUT | `/datasource/{id}` | 更新数据源 |
| DELETE | `/datasource/{id}` | 删除数据源 |

### Bridge 客户端

`bridgeClient.ts` 封装所有 Bridge HTTP 调用：

- `testConnection(config)` → Bridge `POST /connections/test`
- `registerConnection(id, config)` → Bridge `POST /connections`
- `getMetadata(id)` → Bridge `GET /connections/{id}/tables` + columns
- `executeQuery(id, sql)` → Bridge `POST /connections/{id}/query`
- `destroyConnection(id)` → Bridge `DELETE /connections/{id}`

### 类型映射

`typeMapper.ts` 集中管理所有数据库类型到 `FieldDataType` 的映射，按 `dbType` 分组。

### 2.3 `TableSourceType` 扩展

**后端** `backend/src/table/table.types.ts`：

```typescript
export const TableSourceTypeValues = {
  CSV: 'csv',
  EXCEL: 'excel',
  SQLITE: 'sqlite',
  MYSQL: 'mysql',
  POSTGRESQL: 'postgresql',
  SQLSERVER: 'sqlserver',
  MARIADB: 'mariadb',
  ORACLE: 'oracle',
  DB2: 'db2',
  SAPHANA: 'saphana',
  KINGBASE: 'kingbase',
  CLICKHOUSE: 'clickhouse',
  SPARK: 'spark',
  HIVE2: 'hive2',
  STARROCKS: 'starrocks',
  TRINO: 'trino',
  PRESTODB: 'prestodb',
  TIDB: 'tidb',
  DAMENG: 'dameng',
} as const;
```

**前端** `frontend/src/types/datafile.ts` 同步扩展 `TableSourceType` 和 `DatabaseDatasourceType`。

Prisma `Datasource.type` 字段为 `VarChar(50)`，不加 DB 约束，在 `datasource.controller.ts` 做运行时校验（值必须在 `TableSourceTypeValues` 中）。

`dictionaryGenerator.ts` 全面重构：
- `savePostgresDictionaryFile()` → 通用 `saveDatabaseDictionaryFile(dbType, ...)`
- `savePostgresConfigIni()` / `generatePostgresConfigIni()` → `saveDatabaseConfigIni(dbType, ...)` / `generateDatabaseConfigIni(dbType, ...)`
- `PostgresConfigParams` 接口 → `DatabaseConfigParams`（增加 `dbType` 字段）
- `generateDictionaryContent()` 中硬编码的 `if (type === 'postgresql')` 改为查表：

```typescript
const DB_TYPE_LABELS: Record<DatabaseType, string> = {
  mysql: 'MySQL', postgresql: 'PostgreSQL', oracle: 'Oracle', ...
};
```

### 2.4 Schema/Catalog 处理

不同数据库的 catalog/schema 层级差异较大：

| 数据库 | Catalog | Schema | 说明 |
|--------|---------|--------|------|
| PostgreSQL | database | public 等 | 默认 public schema |
| MySQL / MariaDB / TiDB | database | 无 | catalog = database |
| SQL Server | database | dbo 等 | 默认 dbo schema |
| Oracle | 无 | user | schema = 连接用户 |
| DB2 | 无 | user | 同 Oracle |
| SAP HANA | 无 | user | 同 Oracle |
| ClickHouse / StarRocks | database | 无 | 同 MySQL |
| Trino / PrestoDB | catalog | schema | 两层都有意义 |
| Spark / Hive2 | database | 无 | catalog = database |
| KingBase | database | public 等 | 同 PostgreSQL |
| 达梦 | 无 | user | 同 Oracle |

**处理策略：**

1. **Prisma `Datasource` 模型新增 `schema` 字段**（可选），存储用户选择的 schema
2. **连接对话框**：对有 schema 概念的数据库（PostgreSQL、SQL Server、Oracle、DB2、SAP HANA、KingBase、达梦、Trino、PrestoDB），创建连接时可选填 schema，不填则使用默认 schema
3. **`Table.physicalName`**：存储 schema 限定名（如 `public.users`），LLM 生成 SQL 时可直接引用。Prisma `Table` 模型的 `physicalName` 唯一约束从全局 `@unique` 改为 `@@unique([datasourceId, physicalName])`，避免不同数据源中同名表冲突
4. **Bridge 元数据接口**：`GET /connections/{id}/tables?schema=xxx`，schema 为空时 Bridge 使用 JDBC 默认 schema

### 2.5 Datasource 名称唯一性

当前 Prisma `Datasource.name` 有 `@unique` 约束，值为 `config.database`。多个服务器上同名数据库会冲突。

**改造**：name 改为 `{host}:{port}/{database}` 格式，前端显示时取 `database` 部分，完整名称用于去重。

### Prisma Schema 变更

`Datasource` 模型新增字段：

```prisma
model Datasource {
  // 现有字段不变
  schema     String?  @db.VarChar(255)  // 可选 schema（如 public, dbo）
  properties String?  @db.Text          // JSON 存储特殊连接参数，序列化用 JSON.stringify/parse
}
```

### 配置

`config.ts` 新增：

```typescript
bridge: {
  url: env.BRIDGE_URL || 'http://localhost:8080',
}
```

`BRIDGE_URL` 未配置时默认 `http://localhost:8080`（本地开发），生产环境通过 docker-compose 注入 `http://bridge:8080`。

### 迁移

- 删除 `backend/src/postgres/` 目录
- 路由从 `/postgres/*` 改为 `/datasource/*`
- `backend/src/sqlite/` 保持不变

## Section 3: 前端改造

### 组件变更

| 原组件 | 新组件 | 变更 |
|--------|--------|------|
| `PostgresConnectionDialog.vue` | `DatabaseConnectionDialog.vue` | 顶部新增数据库类型选择器，动态渲染配置表单 |
| `PostgresConnectionButton.vue` | `DatabaseConnectionButton.vue` | 改名，通用文案 |
| `DatasourceGroup.vue` | 不改名 | 编辑按钮判断改为所有远程数据库类型 |
| `DataTreeContent.vue` | 不改名 | 替换 PostgreSQL 按钮为通用连接按钮 |

### 数据库类型选择与默认端口

选择数据库类型后自动填充默认端口：

| 类型 | 默认端口 |
|------|---------|
| MySQL / MariaDB / TiDB | 3306 |
| PostgreSQL | 5432 |
| SQL Server | 1433 |
| Oracle | 1521 |
| DB2 | 50000 |
| SAP HANA | 30015 |
| KingBase | 54321 |
| ClickHouse | 8123 |
| StarRocks | 9030 |
| Trino / PrestoDB | 8080 |
| Apache Spark / Hive2 | 10000 |
| 达梦 | 5236 |

### 特殊字段

根据 `dbType` 动态显示额外字段：

| 数据库 | 特殊字段 |
|--------|---------|
| Oracle | 连接方式（SID/Service Name） |
| SAP HANA | Instance Number |
| Trino / PrestoDB | Catalog, Schema |
| Apache Spark / Hive2 | 传输协议（binary/http） |

### API 层

`frontend/src/api/postgres.ts` → `frontend/src/api/datasource.ts`：

```typescript
testConnection(config)        → POST /datasource/test-connection
createDatasource(config)      → POST /datasource
updateDatasource(id, config)  → PUT /datasource/{id}
deleteDatasource(id)          → DELETE /datasource/{id}
```

### 类型

```typescript
type DatabaseType =
  | 'mysql' | 'sqlserver' | 'mariadb' | 'oracle' | 'db2'
  | 'saphana' | 'kingbase' | 'clickhouse' | 'spark' | 'hive2'
  | 'starrocks' | 'trino' | 'prestodb' | 'tidb' | 'dameng'
  | 'postgresql'
```

### i18n

- 删除 `postgres.*` key，新增 `datasource.*` 通用 key
- 新增各数据库类型显示名称（`datasource.types.mysql`、`datasource.types.oracle` 等）

### Store

`datafileStore.ts` 中 PostgreSQL 专用方法统一为通用数据源方法。

## Section 4: Docker Compose

### 目录结构

```
project-root/
├── bridge/
│   ├── src/main/java/com/databot/bridge/
│   ├── libs/              # KingBase、达梦等非 Maven 驱动
│   ├── pom.xml
│   └── Dockerfile
├── backend/
├── frontend/
└── docker/
    └── docker-compose.yaml   # 现有位置，新增 bridge 服务
```

### Bridge Dockerfile

```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY libs ./libs
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/bridge.jar .
EXPOSE 8080
CMD ["java", "-jar", "bridge.jar"]
```

### docker-compose.yaml（在现有 `docker/docker-compose.yaml` 中新增 bridge 服务）

```yaml
services:
  bridge:
    build:
      context: ../bridge
    environment:
      - BRIDGE_PORT=8080
      - POOL_MAX_SIZE=5
      - POOL_IDLE_TIMEOUT=1800000
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - net

  backend:
    # 现有配置不变，新增以下环境变量
    environment:
      - BRIDGE_URL=http://bridge:8080
    depends_on:
      bridge:
        condition: service_healthy
```

注：健康检查使用 `wget`（Alpine 镜像自带），而非 `curl`。
