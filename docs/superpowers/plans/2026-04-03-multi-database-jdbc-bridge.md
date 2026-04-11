# Multi-Database JDBC Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Java JDBC Bridge service and refactor frontend/backend to support 16 database types (MySQL, SQL Server, MariaDB, Oracle, DB2, SAP HANA, KingBase, ClickHouse, Spark, Hive2, StarRocks, Trino, PrestoDB, TiDB, 达梦, PostgreSQL) through a unified connection flow.

**Architecture:** A new Java/Vert.x microservice (`bridge/`) acts as a stateless JDBC proxy. The Node.js backend calls it via REST for all remote database operations. The frontend gets a generic connection dialog replacing the PostgreSQL-specific one. SQLite stays as-is with its native driver.

**Tech Stack:** Java 17, Vert.x Web, HikariCP, Maven | Node.js, Express v5, Prisma v7 | Vue 3, TypeScript, Element Plus

**Spec:** `docs/superpowers/specs/2026-04-03-multi-database-jdbc-bridge-design.md`

**Parallelism:** Tasks 1-5 (Bridge) are fully independent from Tasks 6-9 (Prisma/config/backend clients) and can run in parallel. Task 9 (typeMapper) is independent from Task 8 (bridgeClient). Tasks 10-13 must be sequential. Tasks 14-18 (frontend) depend on Task 13 completing. Task 19 (Docker) depends on Task 5.

---

## File Map

### New Files (Bridge - `bridge/`)

| File | Responsibility |
|------|---------------|
| `bridge/pom.xml` | Maven build config with all JDBC driver dependencies |
| `bridge/Dockerfile` | Multi-stage build for fat jar |
| `bridge/src/main/java/com/databot/bridge/MainVerticle.java` | Vert.x entry point, route registration |
| `bridge/src/main/java/com/databot/bridge/model/ConnectionConfig.java` | Connection config POJO |
| `bridge/src/main/java/com/databot/bridge/model/QueryResult.java` | Query result POJO |
| `bridge/src/main/java/com/databot/bridge/model/ErrorResponse.java` | Error response POJO |
| `bridge/src/main/java/com/databot/bridge/model/DbType.java` | Database type enum |
| `bridge/src/main/java/com/databot/bridge/jdbc/JdbcUrlBuilder.java` | JDBC URL generation per dbType |
| `bridge/src/main/java/com/databot/bridge/pool/ConnectionPoolManager.java` | HikariCP pool lifecycle + idle eviction |
| `bridge/src/main/java/com/databot/bridge/handler/HealthHandler.java` | GET /health |
| `bridge/src/main/java/com/databot/bridge/handler/ConnectionHandler.java` | POST /connections, DELETE, POST /test |
| `bridge/src/main/java/com/databot/bridge/handler/MetadataHandler.java` | GET databases/schemas/tables/columns |
| `bridge/src/main/java/com/databot/bridge/handler/QueryHandler.java` | POST /connections/{id}/query |
| `bridge/src/test/java/com/databot/bridge/jdbc/JdbcUrlBuilderTest.java` | Unit tests for URL builder |
| `bridge/src/test/java/com/databot/bridge/pool/ConnectionPoolManagerTest.java` | Unit tests for pool manager |

### New Files (Backend)

| File | Responsibility |
|------|---------------|
| `backend/src/datasource/datasource.types.ts` | DatabaseType enum, DatabaseConnectionConfig interface |
| `backend/src/datasource/bridgeClient.ts` | HTTP client for Bridge REST API with retry logic |
| `backend/src/datasource/typeMapper.ts` | Vendor SQL type → FieldDataType mapping per dbType |
| `backend/src/datasource/datasource.service.ts` | Business logic: create/update/delete datasource via Bridge |
| `backend/src/datasource/datasource.controller.ts` | Request validation, route handlers |
| `backend/src/datasource/datasource.routes.ts` | Express router for `/datasource/*` |
| `backend/src/datasource/index.ts` | Barrel exports for datasource module |
| `backend/src/infrastructure/datasources/bridgeDatasource.ts` | Datasource impl calling Bridge REST API |
| `backend/tests/datasource/bridgeClient.test.ts` | Tests for bridge client |
| `backend/tests/datasource/typeMapper.test.ts` | Tests for type mapper |
| `backend/tests/datasource/datasource.controller.test.ts` | Tests for controller validation |
| `backend/tests/datasource/datasource.service.test.ts` | Tests for datasource service |
| `backend/tests/infrastructure/datasources/bridgeDatasource.test.ts` | Tests for BridgeDatasource |

### New Files (Frontend)

| File | Responsibility |
|------|---------------|
| `frontend/src/api/datasource.ts` | API client for `/datasource/*` endpoints |
| `frontend/src/components/sidebar/DatabaseConnectionDialog.vue` | Generic connection dialog with db type selector |
| `frontend/src/components/sidebar/DatabaseConnectionButton.vue` | Button to open dialog |
| `frontend/tests/stores/datafileStore-datasource.test.ts` | Tests for updated store methods |

### Modified Files (Backend)

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `schema`, `properties` to Datasource; change Table unique constraint |
| `backend/src/base/config.ts` | Add `bridge.url` config |
| `backend/src/infrastructure/datasources/types.ts` | Expand DatasourceType, add properties to DatasourceConfig |
| `backend/src/infrastructure/datasources/datasourceFactory.ts` | Route non-SQLite types to BridgeDatasource |
| `backend/src/infrastructure/datasources/index.ts` | Export BridgeDatasource, remove old exports |
| `backend/src/table/table.types.ts` | Expand TableSourceTypeValues with all 16 db types |
| `backend/src/table/table.repository.ts` | Update mapDatasource for schema/properties fields |
| `backend/src/table/table.service.ts` | Update datasourceTypeMap with all types |
| `backend/src/table/dictionaryGenerator.ts` | Generalize postgres-specific functions |
| `backend/src/infrastructure/tools/sqlTool.ts` | Accept `postgres` as alias for `postgresql` in INI parsing |
| `backend/src/routes/api.ts` | Replace postgres routes with datasource routes |
| `backend/src/errors/errorCode.ts` | Add bridge-related error codes |

### Modified Files (Frontend)

| File | Change |
|------|--------|
| `frontend/src/types/datafile.ts` | Expand DatabaseDatasourceType, add DatabaseType |
| `frontend/src/stores/datafileStore.ts` | Replace postgres-specific methods with generic |
| `frontend/src/components/sidebar/DatasourceGroup.vue` | Edit button for all remote db types |
| `frontend/src/components/data-management/DataTreeContent.vue` | Replace PostgresConnectionButton |
| `frontend/src/components/data-management/DataManagementPage.vue` | Use DatabaseConnectionDialog |
| `frontend/src/locales/zh-CN.ts` | Replace postgres keys with datasource keys |
| `frontend/src/locales/en-US.ts` | Replace postgres keys with datasource keys |

### Deleted Files

| File | Reason |
|------|--------|
| `backend/src/postgres/postgres.service.ts` | Replaced by `datasource/datasource.service.ts` |
| `backend/src/postgres/postgres.controller.ts` | Replaced by `datasource/datasource.controller.ts` |
| `backend/src/postgres/postgres.routes.ts` | Replaced by `datasource/datasource.routes.ts` |
| `backend/src/postgres/postgres.types.ts` | Replaced by `datasource/datasource.types.ts` |
| `backend/src/postgres/connectionTester.ts` | Replaced by Bridge `POST /connections/test` |
| `backend/src/infrastructure/datasources/postgresDatasource.ts` | Replaced by `bridgeDatasource.ts` |
| `backend/src/infrastructure/datasources/mysqlDatasource.ts` | Replaced by `bridgeDatasource.ts` |
| `frontend/src/api/postgres.ts` | Replaced by `datasource.ts` |
| `frontend/src/components/sidebar/PostgresConnectionDialog.vue` | Replaced by `DatabaseConnectionDialog.vue` |
| `frontend/src/components/sidebar/PostgresConnectionButton.vue` | Replaced by `DatabaseConnectionButton.vue` |

### Modified Files (Docker)

| File | Change |
|------|--------|
| `docker/docker-compose.yaml` | Add bridge service, BRIDGE_URL env var |

---

## Task 1: Bridge Maven Project Setup

**Files:**
- Create: `bridge/pom.xml`
- Create: `bridge/src/main/java/com/databot/bridge/model/DbType.java`

- [ ] **Step 1: Create bridge directory structure**

```bash
mkdir -p bridge/src/main/java/com/databot/bridge/{model,jdbc,pool,handler}
mkdir -p bridge/src/test/java/com/databot/bridge/{jdbc,pool}
mkdir -p bridge/libs
```

- [ ] **Step 2: Create pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.databot</groupId>
  <artifactId>bridge</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>

  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <vertx.version>4.5.11</vertx.version>
    <hikari.version>6.2.1</hikari.version>
    <junit.version>5.11.4</junit.version>
    <slf4j.version>2.0.16</slf4j.version>
    <logback.version>1.5.16</logback.version>
  </properties>

  <dependencies>
    <!-- Vert.x -->
    <dependency>
      <groupId>io.vertx</groupId>
      <artifactId>vertx-core</artifactId>
      <version>${vertx.version}</version>
    </dependency>
    <dependency>
      <groupId>io.vertx</groupId>
      <artifactId>vertx-web</artifactId>
      <version>${vertx.version}</version>
    </dependency>

    <!-- Connection Pool -->
    <dependency>
      <groupId>com.zaxxer</groupId>
      <artifactId>HikariCP</artifactId>
      <version>${hikari.version}</version>
    </dependency>

    <!-- Logging -->
    <dependency>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-api</artifactId>
      <version>${slf4j.version}</version>
    </dependency>
    <dependency>
      <groupId>ch.qos.logback</groupId>
      <artifactId>logback-classic</artifactId>
      <version>${logback.version}</version>
    </dependency>

    <!-- JDBC Drivers -->
    <dependency>
      <groupId>com.mysql</groupId>
      <artifactId>mysql-connector-j</artifactId>
      <version>9.1.0</version>
    </dependency>
    <dependency>
      <groupId>org.mariadb.jdbc</groupId>
      <artifactId>mariadb-java-client</artifactId>
      <version>3.5.1</version>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <version>42.7.5</version>
    </dependency>
    <dependency>
      <groupId>com.microsoft.sqlserver</groupId>
      <artifactId>mssql-jdbc</artifactId>
      <version>12.8.1.jre11</version>
    </dependency>
    <dependency>
      <groupId>com.oracle.database.jdbc</groupId>
      <artifactId>ojdbc11</artifactId>
      <version>23.6.0.24.10</version>
    </dependency>
    <dependency>
      <groupId>com.ibm.db2</groupId>
      <artifactId>jcc</artifactId>
      <version>11.5.9.0</version>
    </dependency>
    <dependency>
      <groupId>com.sap.cloud.db.jdbc</groupId>
      <artifactId>ngdbc</artifactId>
      <version>2.21.11</version>
    </dependency>
    <dependency>
      <groupId>com.clickhouse</groupId>
      <artifactId>clickhouse-jdbc</artifactId>
      <version>0.7.2</version>
      <classifier>all</classifier>
    </dependency>
    <dependency>
      <groupId>org.apache.hive</groupId>
      <artifactId>hive-jdbc</artifactId>
      <version>4.0.1</version>
      <exclusions>
        <exclusion>
          <groupId>org.apache.logging.log4j</groupId>
          <artifactId>*</artifactId>
        </exclusion>
      </exclusions>
    </dependency>
    <dependency>
      <groupId>io.trino</groupId>
      <artifactId>trino-jdbc</artifactId>
      <version>466</version>
    </dependency>
    <dependency>
      <groupId>com.facebook.presto</groupId>
      <artifactId>presto-jdbc</artifactId>
      <version>0.290</version>
    </dependency>

    <!-- Non-Maven drivers loaded from libs/ -->
    <dependency>
      <groupId>com.kingbase</groupId>
      <artifactId>kingbase8-jdbc</artifactId>
      <version>8.6</version>
      <scope>system</scope>
      <systemPath>${project.basedir}/libs/kingbase8-jdbc.jar</systemPath>
    </dependency>
    <dependency>
      <groupId>com.dameng</groupId>
      <artifactId>DmJdbcDriver18</artifactId>
      <version>8.1</version>
      <scope>system</scope>
      <systemPath>${project.basedir}/libs/DmJdbcDriver18.jar</systemPath>
    </dependency>

    <!-- Test -->
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>${junit.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.mockito</groupId>
      <artifactId>mockito-core</artifactId>
      <version>5.15.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <finalName>bridge</finalName>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.6.0</version>
        <executions>
          <execution>
            <phase>package</phase>
            <goals><goal>shade</goal></goals>
            <configuration>
              <includeSystemScope>true</includeSystemScope>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                  <mainClass>com.databot.bridge.MainVerticle</mainClass>
                </transformer>
                <transformer implementation="org.apache.maven.plugins.shade.resource.ServicesResourceTransformer"/>
              </transformers>
              <filters>
                <filter>
                  <artifact>*:*</artifact>
                  <excludes>
                    <exclude>META-INF/*.SF</exclude>
                    <exclude>META-INF/*.DSA</exclude>
                    <exclude>META-INF/*.RSA</exclude>
                  </excludes>
                </filter>
              </filters>
            </configuration>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 3: Create DbType enum**

Create `bridge/src/main/java/com/databot/bridge/model/DbType.java`:

```java
package com.databot.bridge.model;

public enum DbType {
    MYSQL("com.mysql.cj.jdbc.Driver"),
    MARIADB("org.mariadb.jdbc.Driver"),
    POSTGRESQL("org.postgresql.Driver"),
    SQLSERVER("com.microsoft.sqlserver.jdbc.SQLServerDriver"),
    ORACLE("oracle.jdbc.OracleDriver"),
    DB2("com.ibm.db2.jcc.DB2Driver"),
    SAPHANA("com.sap.db.jdbc.Driver"),
    KINGBASE("com.kingbase8.Driver"),
    CLICKHOUSE("com.clickhouse.jdbc.ClickHouseDriver"),
    SPARK("org.apache.hive.jdbc.HiveDriver"),
    HIVE2("org.apache.hive.jdbc.HiveDriver"),
    STARROCKS("com.mysql.cj.jdbc.Driver"),
    TRINO("io.trino.jdbc.TrinoDriver"),
    PRESTODB("com.facebook.presto.jdbc.PrestoDriver"),
    TIDB("com.mysql.cj.jdbc.Driver"),
    DAMENG("dm.jdbc.driver.DmDriver");

    private final String driverClass;

    DbType(String driverClass) {
        this.driverClass = driverClass;
    }

    public String getDriverClass() {
        return driverClass;
    }

    public static DbType fromString(String value) {
        try {
            return DbType.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unsupported database type: " + value);
        }
    }
}
```

- [ ] **Step 4: Verify Maven compiles**

```bash
cd bridge && mvn compile -q
```

Expected: BUILD SUCCESS (may warn about missing libs/ jars — that's OK for now)

- [ ] **Step 5: Commit**

```bash
git add bridge/pom.xml bridge/src/
git commit -m "feat(bridge): scaffold Maven project with JDBC driver dependencies"
```

---

## Task 2: Bridge Models & JDBC URL Builder

**Files:**
- Create: `bridge/src/main/java/com/databot/bridge/model/ConnectionConfig.java`
- Create: `bridge/src/main/java/com/databot/bridge/model/QueryResult.java`
- Create: `bridge/src/main/java/com/databot/bridge/model/ErrorResponse.java`
- Create: `bridge/src/main/java/com/databot/bridge/jdbc/JdbcUrlBuilder.java`
- Create: `bridge/src/test/java/com/databot/bridge/jdbc/JdbcUrlBuilderTest.java`

- [ ] **Step 1: Create model POJOs**

`ConnectionConfig.java`:
```java
package com.databot.bridge.model;

import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.HashMap;

public class ConnectionConfig {
    private String id;
    private DbType dbType;
    private String host;
    private int port;
    private String database;
    private String user;
    private String password;
    private Map<String, String> properties;

    public ConnectionConfig() {
        this.properties = new HashMap<>();
    }

    public static ConnectionConfig fromJson(JsonObject json) {
        ConnectionConfig config = new ConnectionConfig();
        config.id = json.getString("id");
        config.dbType = DbType.fromString(json.getString("dbType"));
        config.host = json.getString("host");
        config.port = json.getInteger("port", 0);
        config.database = json.getString("database", "");
        config.user = json.getString("user", "");
        config.password = json.getString("password", "");
        JsonObject props = json.getJsonObject("properties");
        if (props != null) {
            props.forEach(entry -> config.properties.put(entry.getKey(), String.valueOf(entry.getValue())));
        }
        return config;
    }

    // Getters
    public String getId() { return id; }
    public DbType getDbType() { return dbType; }
    public String getHost() { return host; }
    public int getPort() { return port; }
    public String getDatabase() { return database; }
    public String getUser() { return user; }
    public String getPassword() { return password; }
    public Map<String, String> getProperties() { return properties; }

    public void setId(String id) { this.id = id; }
}
```

`QueryResult.java`:
```java
package com.databot.bridge.model;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.List;

public class QueryResult {
    private final List<ColumnInfo> columns;
    private final List<JsonArray> rows;
    private final int rowCount;
    private final boolean truncated;

    public QueryResult(List<ColumnInfo> columns, List<JsonArray> rows, int rowCount, boolean truncated) {
        this.columns = columns;
        this.rows = rows;
        this.rowCount = rowCount;
        this.truncated = truncated;
    }

    public JsonObject toJson() {
        JsonArray colArray = new JsonArray();
        for (ColumnInfo col : columns) {
            colArray.add(new JsonObject()
                .put("name", col.name())
                .put("type", col.type())
                .put("nullable", col.nullable()));
        }
        JsonArray rowArray = new JsonArray();
        for (JsonArray row : rows) {
            rowArray.add(row);
        }
        return new JsonObject()
            .put("columns", colArray)
            .put("rows", rowArray)
            .put("rowCount", rowCount)
            .put("truncated", truncated);
    }

    public record ColumnInfo(String name, String type, boolean nullable) {}
}
```

`ErrorResponse.java`:
```java
package com.databot.bridge.model;

import io.vertx.core.json.JsonObject;

public class ErrorResponse {
    public static final String CONNECTION_FAILED = "CONNECTION_FAILED";
    public static final String CONNECTION_NOT_FOUND = "CONNECTION_NOT_FOUND";
    public static final String QUERY_ERROR = "QUERY_ERROR";
    public static final String METADATA_ERROR = "METADATA_ERROR";
    public static final String INVALID_REQUEST = "INVALID_REQUEST";
    public static final String TIMEOUT = "TIMEOUT";

    public static JsonObject create(String error, String message) {
        return new JsonObject()
            .put("error", error)
            .put("message", message);
    }

    public static JsonObject create(String error, String message, JsonObject details) {
        return create(error, message).put("details", details);
    }
}
```

- [ ] **Step 2: Write JdbcUrlBuilder test**

`bridge/src/test/java/com/databot/bridge/jdbc/JdbcUrlBuilderTest.java`:
```java
package com.databot.bridge.jdbc;

import com.databot.bridge.model.DbType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class JdbcUrlBuilderTest {

    @ParameterizedTest
    @CsvSource({
        "MYSQL,      jdbc:mysql://localhost:3306/testdb",
        "MARIADB,    jdbc:mariadb://localhost:3306/testdb",
        "POSTGRESQL, jdbc:postgresql://localhost:5432/testdb",
        "CLICKHOUSE, jdbc:clickhouse://localhost:8123/testdb",
        "TRINO,      jdbc:trino://localhost:8080/testdb",
        "PRESTODB,   jdbc:presto://localhost:8080/testdb",
        "TIDB,       jdbc:mysql://localhost:3306/testdb",
        "STARROCKS,  jdbc:mysql://localhost:9030/testdb",
        "DB2,        jdbc:db2://localhost:50000/testdb",
        "KINGBASE,   jdbc:kingbase8://localhost:54321/testdb",
        "DAMENG,     jdbc:dm://localhost:5236/testdb",
        "SPARK,      jdbc:hive2://localhost:10000/testdb",
        "HIVE2,      jdbc:hive2://localhost:10000/testdb"
    })
    void shouldBuildCorrectUrl(DbType dbType, String expectedUrl) {
        int port = Integer.parseInt(expectedUrl.replaceAll(".*:(\\d+)/.*", "$1"));
        String url = JdbcUrlBuilder.build(dbType, "localhost", port, "testdb", Map.of());
        assertEquals(expectedUrl, url);
    }

    @Test
    void shouldBuildSqlServerUrl() {
        String url = JdbcUrlBuilder.build(DbType.SQLSERVER, "localhost", 1433, "testdb", Map.of());
        assertEquals("jdbc:sqlserver://localhost:1433;databaseName=testdb;encrypt=false", url);
    }

    @Test
    void shouldBuildOracleUrl() {
        String url = JdbcUrlBuilder.build(DbType.ORACLE, "localhost", 1521, "testdb", Map.of());
        assertEquals("jdbc:oracle:thin:@localhost:1521/testdb", url);
    }

    @Test
    void shouldBuildSapHanaUrl() {
        String url = JdbcUrlBuilder.build(DbType.SAPHANA, "localhost", 30015, "testdb", Map.of());
        assertEquals("jdbc:sap://localhost:30015/?databaseName=testdb", url);
    }

    @Test
    void shouldBuildOracleWithSidProperty() {
        String url = JdbcUrlBuilder.build(DbType.ORACLE, "localhost", 1521, "ORCL", Map.of("connectionType", "sid"));
        assertEquals("jdbc:oracle:thin:@localhost:1521:ORCL", url);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd bridge && mvn test -pl . -Dtest=JdbcUrlBuilderTest -q
```

Expected: FAIL — `JdbcUrlBuilder` class not found

- [ ] **Step 4: Implement JdbcUrlBuilder**

`bridge/src/main/java/com/databot/bridge/jdbc/JdbcUrlBuilder.java`:
```java
package com.databot.bridge.jdbc;

import com.databot.bridge.model.DbType;
import java.util.Map;

public class JdbcUrlBuilder {

    private JdbcUrlBuilder() {}

    public static String build(DbType dbType, String host, int port, String database, Map<String, String> properties) {
        return switch (dbType) {
            case MYSQL, TIDB, STARROCKS -> "jdbc:mysql://" + host + ":" + port + "/" + database;
            case MARIADB -> "jdbc:mariadb://" + host + ":" + port + "/" + database;
            case POSTGRESQL, KINGBASE -> {
                String prefix = dbType == DbType.KINGBASE ? "kingbase8" : "postgresql";
                yield "jdbc:" + prefix + "://" + host + ":" + port + "/" + database;
            }
            case SQLSERVER -> "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database + ";encrypt=false";
            case ORACLE -> buildOracleUrl(host, port, database, properties);
            case DB2 -> "jdbc:db2://" + host + ":" + port + "/" + database;
            case SAPHANA -> "jdbc:sap://" + host + ":" + port + "/?databaseName=" + database;
            case CLICKHOUSE -> "jdbc:clickhouse://" + host + ":" + port + "/" + database;
            case SPARK, HIVE2 -> "jdbc:hive2://" + host + ":" + port + "/" + database;
            case TRINO -> "jdbc:trino://" + host + ":" + port + "/" + database;
            case PRESTODB -> "jdbc:presto://" + host + ":" + port + "/" + database;
            case DAMENG -> "jdbc:dm://" + host + ":" + port + "/" + database;
        };
    }

    private static String buildOracleUrl(String host, int port, String database, Map<String, String> properties) {
        String connectionType = properties.getOrDefault("connectionType", "serviceName");
        if ("sid".equalsIgnoreCase(connectionType)) {
            return "jdbc:oracle:thin:@" + host + ":" + port + ":" + database;
        }
        return "jdbc:oracle:thin:@" + host + ":" + port + "/" + database;
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd bridge && mvn test -pl . -Dtest=JdbcUrlBuilderTest -q
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add bridge/
git commit -m "feat(bridge): add models, DbType enum, and JdbcUrlBuilder with tests"
```

---

## Task 3: Bridge ConnectionPoolManager

**Files:**
- Create: `bridge/src/main/java/com/databot/bridge/pool/ConnectionPoolManager.java`
- Create: `bridge/src/test/java/com/databot/bridge/pool/ConnectionPoolManagerTest.java`

- [ ] **Step 1: Write ConnectionPoolManager test**

`bridge/src/test/java/com/databot/bridge/pool/ConnectionPoolManagerTest.java`:
```java
package com.databot.bridge.pool;

import com.databot.bridge.model.ConnectionConfig;
import com.databot.bridge.model.DbType;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConnectionPoolManagerTest {

    private final ConnectionPoolManager manager = new ConnectionPoolManager(5, 1800000);

    @AfterEach
    void cleanup() {
        manager.closeAll();
    }

    @Test
    void shouldReturnFalseForNonExistentConnection() {
        assertFalse(manager.has("nonexistent"));
    }

    @Test
    void shouldRemoveNonExistentConnectionWithoutError() {
        assertDoesNotThrow(() -> manager.remove("nonexistent"));
    }

    @Test
    void shouldReportHasAfterRegister() {
        // Cannot fully test without a real DB, but we can test the register path
        // throws because no real DB is available — that's expected
        ConnectionConfig config = ConnectionConfig.fromJson(new JsonObject()
            .put("id", "test-1")
            .put("dbType", "mysql")
            .put("host", "localhost")
            .put("port", 3306)
            .put("database", "testdb")
            .put("user", "root")
            .put("password", "pass"));
        // This will throw because no MySQL is running, but it exercises the code path
        assertThrows(RuntimeException.class, () -> manager.register(config));
        assertFalse(manager.has("test-1"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd bridge && mvn test -Dtest=ConnectionPoolManagerTest -q
```

Expected: FAIL — class not found

- [ ] **Step 3: Implement ConnectionPoolManager**

`bridge/src/main/java/com/databot/bridge/pool/ConnectionPoolManager.java`:
```java
package com.databot.bridge.pool;

import com.databot.bridge.jdbc.JdbcUrlBuilder;
import com.databot.bridge.model.ConnectionConfig;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.ConcurrentHashMap;

public class ConnectionPoolManager {
    private static final Logger logger = LoggerFactory.getLogger(ConnectionPoolManager.class);

    private final ConcurrentHashMap<String, HikariDataSource> pools = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ConnectionConfig> configs = new ConcurrentHashMap<>();
    private final int maxPoolSize;
    private final long idleTimeoutMs;

    public ConnectionPoolManager(int maxPoolSize, long idleTimeoutMs) {
        this.maxPoolSize = maxPoolSize;
        this.idleTimeoutMs = idleTimeoutMs;
    }

    public void register(ConnectionConfig config) {
        String id = config.getId();
        // Upsert: close existing pool if present
        remove(id);

        String jdbcUrl = JdbcUrlBuilder.build(
            config.getDbType(), config.getHost(), config.getPort(),
            config.getDatabase(), config.getProperties());

        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(jdbcUrl);
        hikariConfig.setUsername(config.getUser());
        hikariConfig.setPassword(config.getPassword());
        hikariConfig.setDriverClassName(config.getDbType().getDriverClass());
        hikariConfig.setMaximumPoolSize(maxPoolSize);
        hikariConfig.setMinimumIdle(1);
        hikariConfig.setIdleTimeout(idleTimeoutMs);
        hikariConfig.setConnectionTimeout(30000);
        hikariConfig.setPoolName("pool-" + id);

        HikariDataSource ds = new HikariDataSource(hikariConfig);
        pools.put(id, ds);
        configs.put(id, config);
        logger.info("Registered connection pool: {} ({})", id, config.getDbType());
    }

    public Connection getConnection(String id) throws SQLException {
        HikariDataSource ds = pools.get(id);
        if (ds == null) {
            throw new IllegalArgumentException("Connection not found: " + id);
        }
        return ds.getConnection();
    }

    public boolean has(String id) {
        return pools.containsKey(id);
    }

    public void remove(String id) {
        HikariDataSource ds = pools.remove(id);
        configs.remove(id);
        if (ds != null) {
            ds.close();
            logger.info("Removed connection pool: {}", id);
        }
    }

    public void closeAll() {
        pools.forEach((id, ds) -> {
            ds.close();
            logger.info("Closed connection pool: {}", id);
        });
        pools.clear();
        configs.clear();
    }

    public Connection testConnection(ConnectionConfig config) throws SQLException {
        String jdbcUrl = JdbcUrlBuilder.build(
            config.getDbType(), config.getHost(), config.getPort(),
            config.getDatabase(), config.getProperties());

        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(jdbcUrl);
        hikariConfig.setUsername(config.getUser());
        hikariConfig.setPassword(config.getPassword());
        hikariConfig.setDriverClassName(config.getDbType().getDriverClass());
        hikariConfig.setMaximumPoolSize(1);
        hikariConfig.setConnectionTimeout(10000);
        hikariConfig.setPoolName("test-" + System.currentTimeMillis());

        try (HikariDataSource ds = new HikariDataSource(hikariConfig)) {
            Connection conn = ds.getConnection();
            conn.close();
            return null; // success
        }
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd bridge && mvn test -Dtest=ConnectionPoolManagerTest -q
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add bridge/src/
git commit -m "feat(bridge): add ConnectionPoolManager with HikariCP pool lifecycle"
```

---

## Task 4: Bridge Handlers (Connection, Metadata, Query, Health)

**Files:**
- Create: `bridge/src/main/java/com/databot/bridge/handler/HealthHandler.java`
- Create: `bridge/src/main/java/com/databot/bridge/handler/ConnectionHandler.java`
- Create: `bridge/src/main/java/com/databot/bridge/handler/MetadataHandler.java`
- Create: `bridge/src/main/java/com/databot/bridge/handler/QueryHandler.java`

- [ ] **Step 1: Create HealthHandler**

```java
package com.databot.bridge.handler;

import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

public class HealthHandler {
    public void handle(RoutingContext ctx) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", "ok").encode());
    }
}
```

- [ ] **Step 2: Create ConnectionHandler**

```java
package com.databot.bridge.handler;

import com.databot.bridge.model.ConnectionConfig;
import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ConnectionHandler {
    private static final Logger logger = LoggerFactory.getLogger(ConnectionHandler.class);
    private final ConnectionPoolManager poolManager;

    public ConnectionHandler(ConnectionPoolManager poolManager) {
        this.poolManager = poolManager;
    }

    public void register(RoutingContext ctx) {
        ctx.vertx().executeBlocking(() -> {
            JsonObject body = ctx.body().asJsonObject();
            if (body == null) {
                throw new IllegalArgumentException("Request body is required");
            }
            ConnectionConfig config = ConnectionConfig.fromJson(body);
            poolManager.register(config);
            return new JsonObject().put("id", config.getId()).put("status", "registered");
        }).onSuccess(result -> ctx.response()
            .putHeader("Content-Type", "application/json")
            .setStatusCode(201)
            .end(result.encode())
        ).onFailure(err -> {
            logger.error("Failed to register connection", err);
            ctx.response()
                .putHeader("Content-Type", "application/json")
                .setStatusCode(400)
                .end(ErrorResponse.create(ErrorResponse.CONNECTION_FAILED, err.getMessage()).encode());
        });
    }

    public void remove(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        poolManager.remove(id);
        ctx.response().setStatusCode(204).end();
    }

    public void test(RoutingContext ctx) {
        ctx.vertx().executeBlocking(() -> {
            JsonObject body = ctx.body().asJsonObject();
            if (body == null) {
                throw new IllegalArgumentException("Request body is required");
            }
            ConnectionConfig config = ConnectionConfig.fromJson(body);
            poolManager.testConnection(config);
            return new JsonObject().put("success", true).put("message", "Connection successful");
        }).onSuccess(result -> ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(result.encode())
        ).onFailure(err -> {
            logger.error("Connection test failed", err);
            ctx.response()
                .putHeader("Content-Type", "application/json")
                .setStatusCode(400)
                .end(ErrorResponse.create(ErrorResponse.CONNECTION_FAILED, err.getMessage()).encode());
        });
    }
}
```

- [ ] **Step 3: Create MetadataHandler**

```java
package com.databot.bridge.handler;

import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.*;

public class MetadataHandler {
    private static final Logger logger = LoggerFactory.getLogger(MetadataHandler.class);
    private final ConnectionPoolManager poolManager;

    public MetadataHandler(ConnectionPoolManager poolManager) {
        this.poolManager = poolManager;
    }

    public void getDatabases(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        ctx.vertx().executeBlocking(() -> {
            try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray databases = new JsonArray();
                try (ResultSet rs = meta.getCatalogs()) {
                    while (rs.next()) {
                        databases.add(rs.getString("TABLE_CAT"));
                    }
                }
                return new JsonObject().put("databases", databases);
            }
        }).onSuccess(result -> sendJson(ctx, result))
          .onFailure(err -> handleError(ctx, id, err));
    }

    public void getSchemas(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        ctx.vertx().executeBlocking(() -> {
            try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray schemas = new JsonArray();
                try (ResultSet rs = meta.getSchemas()) {
                    while (rs.next()) {
                        schemas.add(new JsonObject()
                            .put("schema", rs.getString("TABLE_SCHEM"))
                            .put("catalog", rs.getString("TABLE_CATALOG")));
                    }
                }
                return new JsonObject().put("schemas", schemas);
            }
        }).onSuccess(result -> sendJson(ctx, result))
          .onFailure(err -> handleError(ctx, id, err));
    }

    public void getTables(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        String schema = ctx.queryParam("schema").stream().findFirst().orElse(null);
        ctx.vertx().executeBlocking(() -> {
            try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray tables = new JsonArray();
                String catalog = conn.getCatalog();
                try (ResultSet rs = meta.getTables(catalog, schema, "%", new String[]{"TABLE", "VIEW"})) {
                    while (rs.next()) {
                        tables.add(new JsonObject()
                            .put("name", rs.getString("TABLE_NAME"))
                            .put("schema", rs.getString("TABLE_SCHEM"))
                            .put("type", rs.getString("TABLE_TYPE")));
                    }
                }
                return new JsonObject().put("tables", tables);
            }
        }).onSuccess(result -> sendJson(ctx, result))
          .onFailure(err -> handleError(ctx, id, err));
    }

    public void getColumns(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        String table = ctx.pathParam("table");
        String schema = ctx.queryParam("schema").stream().findFirst().orElse(null);
        ctx.vertx().executeBlocking(() -> {
            try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                String catalog = conn.getCatalog();

                // Get primary keys first
                java.util.Set<String> primaryKeys = new java.util.HashSet<>();
                try (ResultSet pkRs = meta.getPrimaryKeys(catalog, schema, table)) {
                    while (pkRs.next()) {
                        primaryKeys.add(pkRs.getString("COLUMN_NAME"));
                    }
                }

                JsonArray columns = new JsonArray();
                try (ResultSet rs = meta.getColumns(catalog, schema, table, "%")) {
                    while (rs.next()) {
                        columns.add(new JsonObject()
                            .put("name", rs.getString("COLUMN_NAME"))
                            .put("type", rs.getString("TYPE_NAME"))
                            .put("nullable", rs.getInt("NULLABLE") == DatabaseMetaData.columnNullable)
                            .put("ordinal", rs.getInt("ORDINAL_POSITION"))
                            .put("defaultValue", rs.getString("COLUMN_DEF"))
                            .put("isPrimaryKey", primaryKeys.contains(rs.getString("COLUMN_NAME"))));
                    }
                }
                return new JsonObject().put("columns", columns);
            }
        }).onSuccess(result -> sendJson(ctx, result))
          .onFailure(err -> handleError(ctx, id, err));
    }

    private void sendJson(RoutingContext ctx, JsonObject json) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(json.encode());
    }

    private void handleError(RoutingContext ctx, String id, Throwable err) {
        logger.error("Metadata query failed for connection {}", id, err);
        if (err instanceof IllegalArgumentException) {
            ctx.response().setStatusCode(404)
                .putHeader("Content-Type", "application/json")
                .end(ErrorResponse.create(ErrorResponse.CONNECTION_NOT_FOUND, err.getMessage()).encode());
        } else {
            ctx.response().setStatusCode(500)
                .putHeader("Content-Type", "application/json")
                .end(ErrorResponse.create(ErrorResponse.METADATA_ERROR, err.getMessage()).encode());
        }
    }
}
```

- [ ] **Step 4: Create QueryHandler**

```java
package com.databot.bridge.handler;

import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.model.QueryResult;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class QueryHandler {
    private static final Logger logger = LoggerFactory.getLogger(QueryHandler.class);
    private static final int DEFAULT_MAX_ROWS = 10000;
    private static final int DEFAULT_TIMEOUT_SECONDS = 60;
    private final ConnectionPoolManager poolManager;

    public QueryHandler(ConnectionPoolManager poolManager) {
        this.poolManager = poolManager;
    }

    public void execute(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        ctx.vertx().executeBlocking(() -> {
            JsonObject body = ctx.body().asJsonObject();
            if (body == null || !body.containsKey("sql")) {
                throw new IllegalArgumentException("Request body must contain 'sql' field");
            }
            String sql = body.getString("sql");
            int maxRows = body.getInteger("maxRows", DEFAULT_MAX_ROWS);
            int timeoutMs = body.getInteger("timeoutMs", DEFAULT_TIMEOUT_SECONDS * 1000);

            try (Connection conn = poolManager.getConnection(id);
                 Statement stmt = conn.createStatement()) {

                stmt.setQueryTimeout(timeoutMs / 1000);
                stmt.setMaxRows(maxRows + 1); // +1 to detect truncation

                boolean hasResultSet = stmt.execute(sql);
                if (!hasResultSet) {
                    int updateCount = stmt.getUpdateCount();
                    return new JsonObject()
                        .put("columns", new JsonArray())
                        .put("rows", new JsonArray())
                        .put("rowCount", updateCount)
                        .put("truncated", false);
                }

                try (ResultSet rs = stmt.getResultSet()) {
                    ResultSetMetaData rsMeta = rs.getMetaData();
                    int columnCount = rsMeta.getColumnCount();

                    List<QueryResult.ColumnInfo> columns = new ArrayList<>();
                    for (int i = 1; i <= columnCount; i++) {
                        columns.add(new QueryResult.ColumnInfo(
                            rsMeta.getColumnLabel(i),
                            rsMeta.getColumnTypeName(i),
                            rsMeta.isNullable(i) == ResultSetMetaData.columnNullable));
                    }

                    List<JsonArray> rows = new ArrayList<>();
                    int count = 0;
                    boolean truncated = false;
                    while (rs.next()) {
                        if (count >= maxRows) {
                            truncated = true;
                            break;
                        }
                        JsonArray row = new JsonArray();
                        for (int i = 1; i <= columnCount; i++) {
                            row.add(convertValue(rs, i));
                        }
                        rows.add(row);
                        count++;
                    }

                    return new QueryResult(columns, rows, count, truncated).toJson();
                }
            }
        }).onSuccess(result -> ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(result.encode())
        ).onFailure(err -> {
            logger.error("Query execution failed for connection {}", id, err);
            if (err instanceof IllegalArgumentException) {
                int code = err.getMessage().contains("not found") ? 404 : 400;
                String errorType = code == 404 ? ErrorResponse.CONNECTION_NOT_FOUND : ErrorResponse.INVALID_REQUEST;
                ctx.response().setStatusCode(code)
                    .putHeader("Content-Type", "application/json")
                    .end(ErrorResponse.create(errorType, err.getMessage()).encode());
            } else if (err instanceof SQLTimeoutException) {
                ctx.response().setStatusCode(408)
                    .putHeader("Content-Type", "application/json")
                    .end(ErrorResponse.create(ErrorResponse.TIMEOUT, err.getMessage()).encode());
            } else {
                ctx.response().setStatusCode(500)
                    .putHeader("Content-Type", "application/json")
                    .end(ErrorResponse.create(ErrorResponse.QUERY_ERROR, err.getMessage()).encode());
            }
        });
    }

    private Object convertValue(ResultSet rs, int index) throws SQLException {
        Object value = rs.getObject(index);
        if (value == null) return null;
        if (value instanceof BigDecimal bd) return bd.doubleValue();
        if (value instanceof java.sql.Timestamp ts) return ts.toString();
        if (value instanceof java.sql.Date d) return d.toString();
        if (value instanceof java.sql.Time t) return t.toString();
        if (value instanceof byte[]) return "[binary]";
        return value;
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add bridge/src/main/java/com/databot/bridge/handler/
git commit -m "feat(bridge): add Connection, Metadata, Query, and Health handlers"
```

---

## Task 5: Bridge MainVerticle & Dockerfile

**Files:**
- Create: `bridge/src/main/java/com/databot/bridge/MainVerticle.java`
- Create: `bridge/Dockerfile`
- Create: `bridge/src/main/resources/logback.xml`

- [ ] **Step 1: Create logback.xml**

`bridge/src/main/resources/logback.xml`:
```xml
<configuration>
  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
    </encoder>
  </appender>
  <root level="INFO">
    <appender-ref ref="STDOUT"/>
  </root>
</configuration>
```

- [ ] **Step 2: Create MainVerticle**

```java
package com.databot.bridge;

import com.databot.bridge.handler.*;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MainVerticle extends AbstractVerticle {
    private static final Logger logger = LoggerFactory.getLogger(MainVerticle.class);

    private ConnectionPoolManager poolManager;

    @Override
    public void start() {
        int port = Integer.parseInt(System.getenv().getOrDefault("BRIDGE_PORT", "8080"));
        int poolMaxSize = Integer.parseInt(System.getenv().getOrDefault("POOL_MAX_SIZE", "5"));
        long idleTimeout = Long.parseLong(System.getenv().getOrDefault("POOL_IDLE_TIMEOUT", "1800000"));

        poolManager = new ConnectionPoolManager(poolMaxSize, idleTimeout);

        HealthHandler healthHandler = new HealthHandler();
        ConnectionHandler connectionHandler = new ConnectionHandler(poolManager);
        MetadataHandler metadataHandler = new MetadataHandler(poolManager);
        QueryHandler queryHandler = new QueryHandler(poolManager);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create().setBodyLimit(1024 * 1024)); // 1MB limit

        // Health
        router.get("/health").handler(healthHandler::handle);

        // Connection management
        router.post("/connections").handler(connectionHandler::register);
        router.post("/connections/test").handler(connectionHandler::test);
        router.delete("/connections/:id").handler(connectionHandler::remove);

        // Metadata
        router.get("/connections/:id/databases").handler(metadataHandler::getDatabases);
        router.get("/connections/:id/schemas").handler(metadataHandler::getSchemas);
        router.get("/connections/:id/tables").handler(metadataHandler::getTables);
        router.get("/connections/:id/tables/:table/columns").handler(metadataHandler::getColumns);

        // Query
        router.post("/connections/:id/query").handler(queryHandler::execute);

        vertx.createHttpServer()
            .requestHandler(router)
            .listen(port)
            .onSuccess(server -> logger.info("Bridge server started on port {}", server.actualPort()))
            .onFailure(err -> logger.error("Failed to start server", err));
    }

    @Override
    public void stop() {
        if (poolManager != null) {
            poolManager.closeAll();
        }
    }

    public static void main(String[] args) {
        Vertx vertx = Vertx.vertx();
        vertx.deployVerticle(new MainVerticle());
    }
}
```

- [ ] **Step 3: Create Dockerfile**

`bridge/Dockerfile`:
```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY libs ./libs
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/bridge.jar .
EXPOSE 8080
CMD ["java", "-jar", "bridge.jar"]
```

- [ ] **Step 4: Verify build compiles**

```bash
cd bridge && mvn package -DskipTests -q
```

Expected: BUILD SUCCESS, `bridge/target/bridge.jar` created

- [ ] **Step 5: Commit**

```bash
git add bridge/
git commit -m "feat(bridge): add MainVerticle with route registration and Dockerfile"
```

---

## Task 6: Prisma Schema Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add schema and properties fields to Datasource model, update Table unique constraint**

In `backend/prisma/schema.prisma`, modify the `Datasource` model to add `schema` and `properties` fields after the `password` field. Modify the `Table` model to change `physicalName` from `@unique` to a composite unique constraint `@@unique([datasourceId, physicalName])`.

Key changes to `Datasource` model — add after `password`:
```prisma
  schema     String?  @db.VarChar(255)
  properties String?  @db.Text
```

Key changes to `Table` model — change:
```prisma
  physicalName String   @unique
```
to:
```prisma
  physicalName String
  // ... keep other fields ...
  @@unique([datasourceId, physicalName])
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd backend && pnpm prisma migrate dev --name add-multi-db-support
```

Expected: Migration created and applied successfully

- [ ] **Step 3: Create data migration for postgres→postgresql rename and name format**

```bash
cd backend && npx prisma db execute --stdin <<< "UPDATE datasources SET type = 'postgresql' WHERE type = 'postgres';"
cd backend && npx prisma db execute --stdin <<< "UPDATE datasources SET name = host || ':' || port || '/' || database WHERE host IS NOT NULL AND type != 'sqlite';"
```

Verify the migration:
```bash
cd backend && npx prisma db execute --stdin <<< "SELECT id, name, type FROM datasources;"
```

- [ ] **Step 4: Add `bridge/target/` to .gitignore**

Append to `.gitignore`:
```
bridge/target/
```

- [ ] **Step 5: Generate Prisma client**

```bash
cd backend && pnpm prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/ .gitignore
git commit -m "feat(db): add schema/properties fields and composite unique constraint for multi-db support"
```

---

## Task 7: Backend Config & Error Codes

**Files:**
- Modify: `backend/src/base/config.ts`
- Modify: `backend/src/errors/errorCode.ts`

- [ ] **Step 1: Add bridge config to config.ts**

Add to the `config` object in `backend/src/base/config.ts`, after the existing `encryption` block (around line 53):

```typescript
  bridge: {
    url: env.BRIDGE_URL || 'http://localhost:8080',
  },
```

- [ ] **Step 2: Add bridge error codes**

In `backend/src/errors/errorCode.ts`, add after the last error code:

```typescript
  BRIDGE_CONNECTION_FAILED: 'E00038',
  BRIDGE_REQUEST_FAILED: 'E00039',
  BRIDGE_TIMEOUT: 'E00040',
  // LAST_USED_CODE: E00040
```

Update the `LAST_USED_CODE` comment.

- [ ] **Step 3: Commit**

```bash
git add backend/src/base/config.ts backend/src/errors/errorCode.ts
git commit -m "feat(backend): add bridge URL config and error codes"
```

---

## Task 8: Backend Bridge Client

**Files:**
- Create: `backend/src/datasource/bridgeClient.ts`
- Create: `backend/src/datasource/datasource.types.ts`
- Create: `backend/tests/datasource/bridgeClient.test.ts`

- [ ] **Step 1: Create datasource.types.ts**

```typescript
export const DATABASE_TYPES = [
  'mysql', 'sqlserver', 'mariadb', 'oracle', 'db2',
  'saphana', 'kingbase', 'clickhouse', 'spark', 'hive2',
  'starrocks', 'trino', 'prestodb', 'tidb', 'dameng',
  'postgresql',
] as const;

export type DatabaseType = (typeof DATABASE_TYPES)[number];

export interface DatabaseConnectionConfig {
  dbType: DatabaseType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
  properties?: Record<string, string>;
}

export interface BridgeTestResult {
  success: boolean;
  message: string;
}

export interface BridgeColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  ordinal: number;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface BridgeTableInfo {
  name: string;
  schema: string | null;
  type: string;
}

export interface BridgeQueryResult {
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export interface BridgeErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export function isDatabaseType(value: string): value is DatabaseType {
  return DATABASE_TYPES.includes(value as DatabaseType);
}

export const DEFAULT_PORTS: Record<DatabaseType, number> = {
  mysql: 3306,
  sqlserver: 1433,
  mariadb: 3306,
  oracle: 1521,
  db2: 50000,
  saphana: 30015,
  kingbase: 54321,
  clickhouse: 8123,
  spark: 10000,
  hive2: 10000,
  starrocks: 9030,
  trino: 8080,
  prestodb: 8080,
  tidb: 3306,
  dameng: 5236,
  postgresql: 5432,
};
```

- [ ] **Step 2: Write bridgeClient test**

`backend/tests/datasource/bridgeClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config module
vi.mock('../../src/base/config', () => ({
  config: { bridge: { url: 'http://localhost:8080' } },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { BridgeClient } from '../../src/datasource/bridgeClient';

describe('BridgeClient', () => {
  const client = new BridgeClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should call POST /connections/test', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Connection successful' }),
      });

      const result = await client.testConnection({
        dbType: 'mysql', host: 'localhost', port: 3306,
        database: 'test', user: 'root', password: 'pass',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should throw on connection failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'CONNECTION_FAILED', message: 'refused' }),
      });

      await expect(client.testConnection({
        dbType: 'mysql', host: 'localhost', port: 3306,
        database: 'test', user: 'root', password: 'pass',
      })).rejects.toThrow();
    });
  });

  describe('registerConnection', () => {
    it('should call POST /connections', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'abc', status: 'registered' }),
      });

      await client.registerConnection('abc', {
        dbType: 'postgresql', host: 'localhost', port: 5432,
        database: 'mydb', user: 'user', password: 'pass',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('executeQuery with retry on eviction', () => {
    it('should retry once on CONNECTION_NOT_FOUND', async () => {
      // First call fails with CONNECTION_NOT_FOUND
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'CONNECTION_NOT_FOUND', message: 'not found' }),
      });
      // Re-register succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'abc', status: 'registered' }),
      });
      // Retry query succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ columns: [], rows: [], rowCount: 0, truncated: false }),
      });

      const config = {
        dbType: 'mysql' as const, host: 'localhost', port: 3306,
        database: 'test', user: 'root', password: 'pass',
      };
      const result = await client.executeQuery('abc', 'SELECT 1', config);

      expect(result.rowCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(3); // query, register, retry
    });
  });

  describe('destroyConnection', () => {
    it('should call DELETE /connections/{id}', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await client.destroyConnection('abc');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections/abc',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && pnpm test -- --run tests/datasource/bridgeClient.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 4: Implement bridgeClient.ts**

`backend/src/datasource/bridgeClient.ts`:

```typescript
import { config } from '../base/config';
import { DatasourceConnectionError, DatasourceQueryError } from '../errors/types';
import logger from '../utils/logger';
import type {
  DatabaseConnectionConfig,
  BridgeTestResult,
  BridgeQueryResult,
  BridgeTableInfo,
  BridgeColumnInfo,
  BridgeErrorResponse,
} from './datasource.types';

export class BridgeClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.bridge.url;
  }

  async testConnection(connectionConfig: DatabaseConnectionConfig): Promise<BridgeTestResult> {
    const response = await this.post('/connections/test', connectionConfig);
    return response as BridgeTestResult;
  }

  async registerConnection(id: string, connectionConfig: DatabaseConnectionConfig): Promise<void> {
    await this.post('/connections', { ...connectionConfig, id });
  }

  async destroyConnection(id: string): Promise<void> {
    await this.request('DELETE', `/connections/${id}`);
  }

  async getDatabases(id: string): Promise<string[]> {
    const result = await this.get(`/connections/${id}/databases`);
    return (result as { databases: string[] }).databases;
  }

  async getSchemas(id: string): Promise<Array<{ schema: string; catalog: string | null }>> {
    const result = await this.get(`/connections/${id}/schemas`);
    return (result as { schemas: Array<{ schema: string; catalog: string | null }> }).schemas;
  }

  async getTables(id: string, schema?: string): Promise<BridgeTableInfo[]> {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    const result = await this.get(`/connections/${id}/tables${query}`);
    return (result as { tables: BridgeTableInfo[] }).tables;
  }

  async getColumns(id: string, table: string, schema?: string): Promise<BridgeColumnInfo[]> {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    const result = await this.get(`/connections/${id}/tables/${encodeURIComponent(table)}/columns${query}`);
    return (result as { columns: BridgeColumnInfo[] }).columns;
  }

  async executeQuery(
    id: string,
    sql: string,
    connectionConfig?: DatabaseConnectionConfig,
    options?: { maxRows?: number; timeoutMs?: number },
  ): Promise<BridgeQueryResult> {
    const body = { sql, maxRows: options?.maxRows, timeoutMs: options?.timeoutMs };

    try {
      return (await this.post(`/connections/${id}/query`, body)) as BridgeQueryResult;
    } catch (err) {
      // Retry once on CONNECTION_NOT_FOUND (pool was evicted)
      if (connectionConfig && err instanceof DatasourceConnectionError && err.message.includes('CONNECTION_NOT_FOUND')) {
        logger.info(`Connection ${id} was evicted, re-registering and retrying`);
        await this.registerConnection(id, connectionConfig);
        return (await this.post(`/connections/${id}/query`, body)) as BridgeQueryResult;
      }
      throw err;
    }
  }

  private async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      throw new DatasourceConnectionError(`Bridge request failed: ${(err as Error).message}`);
    }

    if (method === 'DELETE' && response.status === 204) {
      return undefined;
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorBody = json as unknown as BridgeErrorResponse;
      const errorMessage = errorBody.message || `Bridge returned ${response.status}`;

      if (errorBody.error === 'CONNECTION_NOT_FOUND') {
        throw new DatasourceConnectionError(`CONNECTION_NOT_FOUND: ${errorMessage}`);
      }
      if (errorBody.error === 'TIMEOUT') {
        throw new DatasourceQueryError(`Query timeout: ${errorMessage}`);
      }
      if (errorBody.error === 'QUERY_ERROR') {
        throw new DatasourceQueryError(errorMessage);
      }
      throw new DatasourceConnectionError(errorMessage);
    }

    return json;
  }
}

export const bridgeClient = new BridgeClient();
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pnpm test -- --run tests/datasource/bridgeClient.test.ts
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/datasource/ backend/tests/datasource/
git commit -m "feat(backend): add bridge client with retry logic and datasource types"
```

---

## Task 9: Backend Type Mapper

**Files:**
- Create: `backend/src/datasource/typeMapper.ts`
- Create: `backend/tests/datasource/typeMapper.test.ts`

- [ ] **Step 1: Write typeMapper test**

`backend/tests/datasource/typeMapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapVendorType } from '../../src/datasource/typeMapper';

describe('mapVendorType', () => {
  it('should map MySQL integer types', () => {
    expect(mapVendorType('mysql', 'INT')).toBe('number');
    expect(mapVendorType('mysql', 'BIGINT')).toBe('number');
    expect(mapVendorType('mysql', 'TINYINT')).toBe('number');
  });

  it('should map MySQL string types', () => {
    expect(mapVendorType('mysql', 'VARCHAR')).toBe('string');
    expect(mapVendorType('mysql', 'TEXT')).toBe('string');
  });

  it('should map MySQL datetime types', () => {
    expect(mapVendorType('mysql', 'DATETIME')).toBe('datetime');
    expect(mapVendorType('mysql', 'TIMESTAMP')).toBe('datetime');
    expect(mapVendorType('mysql', 'DATE')).toBe('datetime');
  });

  it('should map PostgreSQL types', () => {
    expect(mapVendorType('postgresql', 'integer')).toBe('number');
    expect(mapVendorType('postgresql', 'character varying')).toBe('string');
    expect(mapVendorType('postgresql', 'boolean')).toBe('boolean');
    expect(mapVendorType('postgresql', 'timestamp without time zone')).toBe('datetime');
    expect(mapVendorType('postgresql', 'jsonb')).toBe('string');
  });

  it('should map SQL Server types', () => {
    expect(mapVendorType('sqlserver', 'int')).toBe('number');
    expect(mapVendorType('sqlserver', 'nvarchar')).toBe('string');
    expect(mapVendorType('sqlserver', 'datetime2')).toBe('datetime');
    expect(mapVendorType('sqlserver', 'bit')).toBe('boolean');
  });

  it('should map Oracle types', () => {
    expect(mapVendorType('oracle', 'NUMBER')).toBe('number');
    expect(mapVendorType('oracle', 'VARCHAR2')).toBe('string');
    expect(mapVendorType('oracle', 'DATE')).toBe('datetime'); // Oracle DATE includes time
  });

  it('should map date to datetime for all databases', () => {
    // FieldDataType has no 'date', only 'datetime'
    expect(mapVendorType('mysql', 'DATE')).toBe('datetime');
    expect(mapVendorType('postgresql', 'date')).toBe('datetime');
    expect(mapVendorType('sqlserver', 'date')).toBe('datetime');
  });

  it('should return string for unknown types', () => {
    expect(mapVendorType('mysql', 'SOME_UNKNOWN_TYPE')).toBe('string');
  });

  it('should handle case insensitively', () => {
    expect(mapVendorType('mysql', 'varchar')).toBe('string');
    expect(mapVendorType('mysql', 'VARCHAR')).toBe('string');
    expect(mapVendorType('mysql', 'Varchar')).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- --run tests/datasource/typeMapper.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement typeMapper.ts**

`backend/src/datasource/typeMapper.ts`:

```typescript
import { FieldDataTypeValues } from '../table/table.types';
import type { DatabaseType } from './datasource.types';

type FieldDataType = (typeof FieldDataTypeValues)[keyof typeof FieldDataTypeValues];

const NUMERIC_PATTERN = /^(int|integer|bigint|smallint|tinyint|mediumint|serial|bigserial|smallserial|float|double|real|decimal|numeric|number|money|smallmoney)$/i;
const STRING_PATTERN = /^(varchar|character varying|character|char|text|nvarchar|nchar|ntext|clob|longtext|mediumtext|tinytext|bpchar|varchar2|string|longvarchar)$/i;
const BOOLEAN_PATTERN = /^(boolean|bool|bit)$/i;
const DATETIME_PATTERN = /^(date|datetime|timestamp|datetime2|datetimeoffset|smalldatetime|timestamp without time zone|timestamp with time zone)$/i;

export function mapVendorType(_dbType: DatabaseType, vendorType: string): FieldDataType {
  const normalized = vendorType.trim().toLowerCase();

  if (DATETIME_PATTERN.test(normalized)) return 'datetime';
  if (BOOLEAN_PATTERN.test(normalized)) return 'boolean';
  if (NUMERIC_PATTERN.test(normalized)) return 'number';
  if (STRING_PATTERN.test(normalized)) return 'string';

  // Fallback: treat unknown as string
  return 'string';
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pnpm test -- --run tests/datasource/typeMapper.test.ts
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/datasource/typeMapper.ts backend/tests/datasource/typeMapper.test.ts
git commit -m "feat(backend): add vendor SQL type mapper for all database types"
```

---

## Task 10: Backend Type Expansions & Dictionary Refactoring

> **NOTE:** This task MUST run before Task 11 (Datasource Service), because the service depends on the generalized dictionary functions created here.

**Files:**
- Modify: `backend/src/table/table.types.ts`
- Modify: `backend/src/table/dictionaryGenerator.ts`
- Modify: `backend/src/table/table.service.ts`
- Modify: `backend/src/table/table.repository.ts`
- Modify: `backend/src/infrastructure/tools/sqlTool.ts`

- [ ] **Step 1: Expand TableSourceTypeValues**

In `backend/src/table/table.types.ts`, expand `TableSourceTypeValues` to include all 16 database types as specified in Section 2.3 of the spec. Also add `schema?: string` and `properties?: string` to `DatasourceMetadata` and `CreateDatasourceInput` interfaces.

- [ ] **Step 2: Refactor dictionaryGenerator.ts**

In `backend/src/table/dictionaryGenerator.ts`:

- Rename `PostgresConfigParams` → `DatabaseConfigParams`, add `dbType: string` field
- Rename `generatePostgresConfigIni()` → `generateDatabaseConfigIni()`, use `dbType` param for the `type=` line
- Rename `savePostgresConfigIni()` → `saveDatabaseConfigIni()`
- Rename `savePostgresDictionaryFile()` → `saveDatabaseDictionaryFile()`
- Add `DB_TYPE_LABELS` lookup table (all 16 types + sqlite)
- In `generateDictionaryContent()`, replace `if (type === 'postgresql')` with lookup in `DB_TYPE_LABELS`

- [ ] **Step 3: Update table.service.ts**

In `backend/src/table/table.service.ts`:

- Expand `datasourceTypeMap` (lines 314-319) to include all database types mapping to `DatasourceType`
- Change `postgresql: 'postgres'` to `postgresql: 'postgresql'` (matches the renamed type)
- Add all new types: `sqlserver: 'sqlserver'`, `mariadb: 'mariadb'`, etc.

- [ ] **Step 4: Update table.repository.ts**

In `backend/src/table/table.repository.ts`:

- In `mapDatasource()`, include `schema` and `properties` fields
- In `createDatasource()`, pass through `schema` and `properties`
- Datasource name format: `{host}:{port}/{database}` (instead of just `database`)

- [ ] **Step 5: Update sqlTool.ts for backward compatibility**

In `backend/src/infrastructure/tools/sqlTool.ts`, in `parseIniConfig()`:

- Accept both `type = postgres` and `type = postgresql` when parsing INI files
- Map `'postgres'` to `'postgresql'` for the DatasourceConfig

- [ ] **Step 6: Run related tests**

```bash
cd backend && pnpm test -- --run tests/services/tableMetadata/ tests/infrastructure/tools/sqlTool/
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/table/ backend/src/infrastructure/tools/sqlTool.ts
git commit -m "feat(backend): expand TableSourceType, refactor dictionary generator, update sqlTool compat"
```

---

## Task 11: Backend Datasource Service, Controller & Routes

> **NOTE:** Depends on Task 10 (dictionary refactoring must be done first).

**Files:**
- Create: `backend/src/datasource/datasource.service.ts`
- Create: `backend/src/datasource/datasource.controller.ts`
- Create: `backend/src/datasource/datasource.routes.ts`
- Create: `backend/src/datasource/index.ts`
- Create: `backend/tests/datasource/datasource.controller.test.ts`
- Create: `backend/tests/datasource/datasource.service.test.ts`

- [ ] **Step 1: Write controller validation test**

`backend/tests/datasource/datasource.controller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateConnectionConfig } from '../../src/datasource/datasource.controller';
import { ValidationError } from '../../src/errors/types';

describe('validateConnectionConfig', () => {
  it('should pass valid config', () => {
    expect(() => validateConnectionConfig({
      dbType: 'mysql', host: 'localhost', port: 3306,
      database: 'mydb', user: 'root', password: 'pass',
    })).not.toThrow();
  });

  it('should reject invalid dbType', () => {
    expect(() => validateConnectionConfig({
      dbType: 'invalid', host: 'localhost', port: 3306,
      database: 'mydb', user: 'root', password: 'pass',
    })).toThrow(ValidationError);
  });

  it('should reject missing host', () => {
    expect(() => validateConnectionConfig({
      dbType: 'mysql', host: '', port: 3306,
      database: 'mydb', user: 'root', password: 'pass',
    })).toThrow(ValidationError);
  });

  it('should reject invalid port', () => {
    expect(() => validateConnectionConfig({
      dbType: 'mysql', host: 'localhost', port: 0,
      database: 'mydb', user: 'root', password: 'pass',
    })).toThrow(ValidationError);
  });

  it('should reject password mask on create', () => {
    expect(() => validateConnectionConfig({
      dbType: 'mysql', host: 'localhost', port: 3306,
      database: 'mydb', user: 'root', password: '****',
    })).toThrow(ValidationError);
  });

  it('should allow password mask on update', () => {
    expect(() => validateConnectionConfig({
      dbType: 'mysql', host: 'localhost', port: 3306,
      database: 'mydb', user: 'root', password: '****',
    }, true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- --run tests/datasource/datasource.controller.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement datasource.service.ts**

`backend/src/datasource/datasource.service.ts`:

This service replaces `backend/src/postgres/postgres.service.ts`. Follow the same structure but generalized. Key functions:

```typescript
import { bridgeClient } from './bridgeClient';
import { mapVendorType } from './typeMapper';
import { encryptPassword, decryptPassword, isPasswordMask } from '../utils/encryption';
import { saveDatabaseDictionaryFile, saveDatabaseConfigIni, deleteDatabaseDictionary } from '../table/dictionaryGenerator';
import * as repository from '../table/table.repository';
import type { DatabaseConnectionConfig, DatabaseType } from './datasource.types';

export async function createDatasource(config: DatabaseConnectionConfig) {
  // 1. Test connection via Bridge
  await bridgeClient.testConnection(config);

  // 2. Register connection with Bridge (use a temp ID for metadata extraction)
  const tempId = crypto.randomUUID();
  await bridgeClient.registerConnection(tempId, config);

  // 3. Get tables and columns from Bridge
  const tables = await bridgeClient.getTables(tempId, config.schema);
  // For each table, get columns:
  //   const columns = await bridgeClient.getColumns(tempId, table.name, config.schema);

  // 4. Encrypt password
  const encryptedPassword = encryptPassword(config.password);

  // 5. Create Prisma Datasource record
  //    - name: `${config.host}:${config.port}/${config.database}`
  //    - type: config.dbType
  //    - schema: config.schema
  //    - properties: JSON.stringify(config.properties)
  //    - Store schema-qualified physicalName: `${schema}.${tableName}` or just `tableName`

  // 6. Save dictionary files using generalized functions
  //    saveDatabaseConfigIni({ dbType: config.dbType, host, port, database, user, password: encrypted })
  //    saveDatabaseDictionaryFile(...)

  // 7. Destroy temp Bridge connection
  await bridgeClient.destroyConnection(tempId);

  // 8. Return { datasourceId, databaseName, tableIds }
}

export async function updateDatasource(id: string, config: DatabaseConnectionConfig) {
  // Same flow as postgres.service.ts:updatePostgresDatasource
  // Handle PASSWORD_MASK: if password is '****', read encrypted from DB via getDatasourceRawPassword()
  // Delete old datasource + dictionary, create new (IDs change)
}

export async function deleteDatasource(id: string) {
  // Delete dictionary files, then Prisma record (CASCADE deletes tables)
}
```

Schema-qualified `physicalName`: when a schema is available, store as `schema.tableName` (e.g., `public.users`). Otherwise just `tableName`.

- [ ] **Step 4: Implement datasource.controller.ts**

`backend/src/datasource/datasource.controller.ts`:

Export `validateConnectionConfig()` function and handler functions following the same pattern as `backend/src/postgres/postgres.controller.ts` (lines 18-87), but validating `dbType` against `DATABASE_TYPES` and using the generic service.

- [ ] **Step 5: Implement datasource.routes.ts**

```typescript
import { Router } from 'express';
import {
  testConnectionHandler,
  createDatasourceHandler,
  updateDatasourceHandler,
  deleteDatasourceHandler,
} from './datasource.controller';

const router = Router();

router.post('/test-connection', testConnectionHandler);
router.post('/', createDatasourceHandler);
router.put('/:id', updateDatasourceHandler);
router.delete('/:id', deleteDatasourceHandler);

export default router;
```

- [ ] **Step 6: Create index.ts barrel export**

`backend/src/datasource/index.ts`:

```typescript
export { default as datasourceRoutes } from './datasource.routes';
export * from './datasource.types';
export { bridgeClient } from './bridgeClient';
```

- [ ] **Step 7: Write datasource.service.test.ts**

`backend/tests/datasource/datasource.service.test.ts`:

Mock `bridgeClient`, `encryptPassword`, `repository`, and `dictionaryGenerator`. Test:
- `createDatasource` calls Bridge test → register → getTables → getColumns → Prisma create → dictionary save → Bridge destroy
- `updateDatasource` handles PASSWORD_MASK correctly (reads encrypted from DB)
- `deleteDatasource` deletes dictionary files then Prisma record

- [ ] **Step 8: Run tests**

```bash
cd backend && pnpm test -- --run tests/datasource/
```

Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/datasource/ backend/tests/datasource/
git commit -m "feat(backend): add unified datasource service, controller, and routes"
```

---

## Task 12: Backend BridgeDatasource (infrastructure/datasources)

> **NOTE:** Tasks 10-14 must be executed sequentially — each depends on the previous.

**Files:**
- Create: `backend/src/infrastructure/datasources/bridgeDatasource.ts`
- Create: `backend/tests/infrastructure/datasources/bridgeDatasource.test.ts`
- Modify: `backend/src/infrastructure/datasources/types.ts`
- Modify: `backend/src/infrastructure/datasources/datasourceFactory.ts`
- Modify: `backend/src/infrastructure/datasources/index.ts`

- [ ] **Step 1: Expand DatasourceType in types.ts**

In `backend/src/infrastructure/datasources/types.ts`, change:

```typescript
export type DatasourceType = 'mysql' | 'postgres' | 'sqlite';
```

to:

```typescript
export type DatasourceType =
  | 'mysql' | 'sqlserver' | 'mariadb' | 'oracle' | 'db2'
  | 'saphana' | 'kingbase' | 'clickhouse' | 'spark' | 'hive2'
  | 'starrocks' | 'trino' | 'prestodb' | 'tidb' | 'dameng'
  | 'postgresql' | 'sqlite';
```

Add `schema?: string` and `properties?: Record<string, string>` to `DatasourceConfig` interface.

- [ ] **Step 2: Write BridgeDatasource test**

`backend/tests/infrastructure/datasources/bridgeDatasource.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/base/config', () => ({
  config: { bridge: { url: 'http://localhost:8080' } },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { BridgeDatasource } from '../../../src/infrastructure/datasources/bridgeDatasource';
import type { DatasourceConfig } from '../../../src/infrastructure/datasources/types';

describe('BridgeDatasource', () => {
  let ds: BridgeDatasource;
  const dsConfig: DatasourceConfig = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'testdb',
    user: 'root',
    password: 'pass',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ds = new BridgeDatasource(dsConfig);
  });

  describe('connect', () => {
    it('should register connection with Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });

      await ds.connect();
      expect(ds.isConnected).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/connections',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('disconnect', () => {
    it('should destroy connection in Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
      await ds.disconnect();

      expect(ds.isConnected).toBe(false);
    });
  });

  describe('getTables', () => {
    it('should return table names from Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tables: [
            { name: 'users', schema: null, type: 'TABLE' },
            { name: 'orders', schema: null, type: 'TABLE' },
          ],
        }),
      });

      const tables = await ds.getTables();
      expect(tables).toEqual(['users', 'orders']);
    });
  });

  describe('executeQuery', () => {
    it('should execute query via Bridge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test', status: 'registered' }),
      });
      await ds.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          rows: [[1], [2]],
          rowCount: 2,
          truncated: false,
        }),
      });

      const result = await ds.executeQuery('SELECT id FROM users');
      expect(result.rowCount).toBe(2);
      expect(result.rows).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && pnpm test -- --run tests/infrastructure/datasources/bridgeDatasource.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement BridgeDatasource**

`backend/src/infrastructure/datasources/bridgeDatasource.ts`:

```typescript
import { Datasource } from './base';
import { bridgeClient } from '../../datasource/bridgeClient';
import { mapVendorType } from '../../datasource/typeMapper';
import type { DatasourceConfig, Column, QueryResult } from './types';
import type { DatabaseType } from '../../datasource/datasource.types';

export class BridgeDatasource extends Datasource {
  private connectionId: string;

  constructor(config: DatasourceConfig) {
    super(config);
    // Deterministic ID from config: "type:host:port:database:user"
    this.connectionId = `${config.type}:${config.host}:${config.port}:${config.database}:${config.user}`;
  }

  async connect(): Promise<void> {
    await bridgeClient.registerConnection(this.connectionId, {
      dbType: this.config.type as DatabaseType,
      host: this.config.host || 'localhost',
      port: this.config.port || 0,
      database: this.config.database,
      user: this.config.user || '',
      password: this.config.password || '',
      properties: this.config.properties,
    });
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    await bridgeClient.destroyConnection(this.connectionId);
    this.isConnected = false;
  }

  async executeQuery(query: string, _params?: unknown[]): Promise<QueryResult> {
    this.validateConnected();
    this.validateQuery(query);

    const bridgeConfig = {
      dbType: this.config.type as DatabaseType,
      host: this.config.host || 'localhost',
      port: this.config.port || 0,
      database: this.config.database,
      user: this.config.user || '',
      password: this.config.password || '',
    };

    const result = await bridgeClient.executeQuery(
      this.connectionId, query, bridgeConfig,
      { timeoutMs: this.config.queryTimeout },
    );

    // Convert Bridge rows (unknown[][]) to QueryResult rows (Record<string, unknown>[])
    const rows = result.rows.map((row) => {
      const record: Record<string, unknown> = {};
      result.columns.forEach((col, i) => { record[col.name] = row[i]; });
      return record;
    });

    return {
      rows,
      rowCount: result.rowCount,
      fields: result.columns.map((col) => ({
        name: col.name,
        type: this.mapVendorTypeToCommon(col.type),
      })),
    };
  }

  async getTables(): Promise<string[]> {
    this.validateConnected();
    const tables = await bridgeClient.getTables(this.connectionId);
    return tables.map((t) => t.name);
  }

  async getColumns(tableName: string): Promise<Column[]> {
    this.validateConnected();
    const columns = await bridgeClient.getColumns(this.connectionId, tableName);
    return columns.map((col) => ({
      name: col.name,
      type: this.mapVendorTypeToCommon(col.type),
      nullable: col.nullable,
      primaryKey: col.isPrimaryKey,
      defaultValue: col.defaultValue ?? undefined,
    }));
  }

  protected mapVendorTypeToCommon(vendorType: string): string {
    return mapVendorType(this.config.type as DatabaseType, vendorType);
  }
}
```

Key detail: `executeQuery()` converts Bridge's positional array rows (`unknown[][]`) to the `QueryResult.rows` format (`Record<string, unknown>[]`) by zipping column names with row values.

- [ ] **Step 5: Update datasourceFactory.ts**

In `backend/src/infrastructure/datasources/datasourceFactory.ts`:

- Replace the `switch` in `createDatasource()`:
  - `'sqlite'` → `new SqliteDatasource(config)`
  - All other types (`default`) → `new BridgeDatasource(config)`
- Remove imports of `MySQLDatasource` and `PostgresDatasource`
- Import `BridgeDatasource`
- Fix `generateDatasourceKey()` default port fallback: replace `config.type === 'mysql' ? 3306 : 5432` with `config.port || 0` (port should always be provided; the old fallback is wrong for 14 of the 16 types)

- [ ] **Step 6: Update index.ts**

In `backend/src/infrastructure/datasources/index.ts`:

- Remove exports for `MySQLDatasource` and `PostgresDatasource`
- Add export for `BridgeDatasource`

- [ ] **Step 7: Run all datasource tests**

```bash
cd backend && pnpm test -- --run tests/infrastructure/datasources/
```

Expected: All PASS (update existing `datasourceFactory.test.ts` to mock `BridgeDatasource` instead of `MySQLDatasource`/`PostgresDatasource`)

- [ ] **Step 8: Commit**

```bash
git add backend/src/infrastructure/datasources/ backend/tests/infrastructure/datasources/
git commit -m "feat(backend): add BridgeDatasource, expand DatasourceType, update factory"
```

---

## Task 13: Backend Route Swap & Cleanup

**Files:**
- Modify: `backend/src/routes/api.ts`
- Delete: `backend/src/postgres/` (entire directory)
- Delete: `backend/src/infrastructure/datasources/postgresDatasource.ts`
- Delete: `backend/src/infrastructure/datasources/mysqlDatasource.ts`

- [ ] **Step 1: Update api.ts routes**

In `backend/src/routes/api.ts`:

- Remove: `import postgresRoutes from '../postgres/postgres.routes';`
- Add: `import datasourceRoutes from '../datasource/datasource.routes';`
- Change: `router.use('/postgres', postgresRoutes);` → `router.use('/datasource', datasourceRoutes);`

- [ ] **Step 2: Delete old files**

```bash
rm -rf backend/src/postgres/
rm backend/src/infrastructure/datasources/postgresDatasource.ts
rm backend/src/infrastructure/datasources/mysqlDatasource.ts
```

- [ ] **Step 3: Update/remove old tests**

Remove or update tests that reference deleted modules:

```bash
rm backend/tests/infrastructure/datasources/postgresDatasource.test.ts
rm backend/tests/infrastructure/datasources/mysqlDatasource.test.ts
rm backend/tests/services/postgresConnection/connectionTester.test.ts
rm backend/tests/services/postgresConnection/datasourceService.test.ts
```

Update `backend/tests/routes/postgres.test.ts` → rename to `backend/tests/routes/datasource.test.ts` and update to test `/datasource/*` endpoints.

- [ ] **Step 4: Run full backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: All lint, typecheck, build, and tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A backend/
git commit -m "feat(backend): swap postgres routes for unified datasource routes, remove old modules"
```

---

## Task 14: Frontend Types & API

**Files:**
- Modify: `frontend/src/types/datafile.ts`
- Create: `frontend/src/api/datasource.ts`

- [ ] **Step 1: Expand frontend types**

In `frontend/src/types/datafile.ts`:

Change `DatabaseDatasourceType`:
```typescript
export type DatabaseType =
  | 'mysql' | 'sqlserver' | 'mariadb' | 'oracle' | 'db2'
  | 'saphana' | 'kingbase' | 'clickhouse' | 'spark' | 'hive2'
  | 'starrocks' | 'trino' | 'prestodb' | 'tidb' | 'dameng'
  | 'postgresql';

export type DatabaseDatasourceType = 'sqlite' | DatabaseType;
```

Expand `TableSourceType` to include all types.

Add to `DatasourceMetadata`:
```typescript
  dbType?: DatabaseType;
  schema?: string;
  properties?: Record<string, string>;
```

- [ ] **Step 2: Create datasource.ts API**

`frontend/src/api/datasource.ts`:

```typescript
import http from '@/utils/http';
import type { DatabaseType } from '@/types/datafile';

export interface DatabaseConnectionConfig {
  dbType: DatabaseType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
  properties?: Record<string, string>;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export interface DatasourceResult {
  datasourceId: string;
  databaseName: string;
  tableIds: string[];
}

export function testConnection(config: DatabaseConnectionConfig): Promise<TestConnectionResult> {
  return http.post('/datasource/test-connection', config);
}

export function createDatasource(config: DatabaseConnectionConfig): Promise<DatasourceResult> {
  return http.post('/datasource', config);
}

export function updateDatasource(id: string, config: DatabaseConnectionConfig): Promise<DatasourceResult> {
  return http.put(`/datasource/${id}`, config);
}

export function deleteDatasource(id: string): Promise<void> {
  return http.delete(`/datasource/${id}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/datafile.ts frontend/src/api/datasource.ts
git commit -m "feat(frontend): add DatabaseType, datasource API client"
```

---

## Task 15: Frontend Store Updates

**Files:**
- Modify: `frontend/src/stores/datafileStore.ts`
- Create: `frontend/tests/stores/datafileStore-datasource.test.ts`

- [ ] **Step 1: Update datafileStore.ts**

Replace PostgreSQL-specific methods with generic ones:

- `testPostgresConnection()` → `testDatasourceConnection(config: DatabaseConnectionConfig)`
- `createPostgresDatasource()` → `createDatasource(config: DatabaseConnectionConfig)`
- `updatePostgresDatasource()` → `updateDatasource(id, config: DatabaseConnectionConfig)`
- In `deleteDatasource()`: replace `postgresApi.deletePostgresDatasource()` with `datasourceApi.deleteDatasource()`
- Remove import of `postgres.ts` API, add import of `datasource.ts` API
- The condition `datasource.type === 'postgresql'` for delete should change to check for any `DatabaseType` (i.e., not `'sqlite'`)

- [ ] **Step 2: Write store test**

`frontend/tests/stores/datafileStore-datasource.test.ts`:

Test the updated store methods with mocked API calls, verifying:
- `testDatasourceConnection` calls `datasourceApi.testConnection`
- `createDatasource` calls `datasourceApi.createDatasource` and refreshes tables
- `deleteDatasource` uses `datasourceApi.deleteDatasource` for non-sqlite types

- [ ] **Step 3: Run tests**

```bash
cd frontend && pnpm test -- --run tests/stores/datafileStore-datasource.test.ts tests/stores/datafileStore.test.ts
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/datafileStore.ts frontend/tests/stores/
git commit -m "feat(frontend): generalize datafileStore for multi-database support"
```

---

## Task 16: Frontend i18n Updates

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Update zh-CN.ts**

Replace `postgres.*` keys with `datasource.*` keys:

```typescript
datasource: {
  connectionDialog: {
    createTitle: '新建数据库连接',
    editTitle: '编辑数据库连接',
    dbType: '数据库类型',
    host: '主机',
    port: '端口',
    database: '数据库',
    user: '用户名',
    password: '密码',
    schema: 'Schema',
    testConnection: '测试连接',
    testSuccess: '连接成功',
    testFailed: '连接失败',
    createSuccess: '数据库连接创建成功',
    updateSuccess: '数据库连接更新成功',
    cancel: '取消',
    save: '保存',
  },
  validation: {
    dbTypeRequired: '请选择数据库类型',
    hostRequired: '请输入主机地址',
    portRequired: '请输入端口号',
    portRange: '端口号必须在 1-65535 之间',
    databaseRequired: '请输入数据库名称',
    userRequired: '请输入用户名',
    passwordRequired: '请输入密码',
  },
  types: {
    mysql: 'MySQL',
    sqlserver: 'SQL Server',
    mariadb: 'MariaDB',
    oracle: 'Oracle',
    db2: 'DB2',
    saphana: 'SAP HANA',
    kingbase: '人大金仓',
    clickhouse: 'ClickHouse',
    spark: 'Apache Spark',
    hive2: 'Apache Hive',
    starrocks: 'StarRocks',
    trino: 'Trino',
    prestodb: 'PrestoDB',
    tidb: 'TiDB',
    dameng: '达梦',
    postgresql: 'PostgreSQL',
  },
  // Special field labels
  oracle: { connectionType: '连接方式', sid: 'SID', serviceName: 'Service Name' },
  saphana: { instanceNumber: '实例号' },
  trino: { catalog: 'Catalog', schema: 'Schema' },
  prestodb: { catalog: 'Catalog', schema: 'Schema' },
  spark: { transport: '传输协议' },
  hive2: { transport: '传输协议' },
},
```

Update `sidebar.newConnectionTooltip` to `'新建数据库连接'`.

- [ ] **Step 2: Update en-US.ts**

Same structure with English translations:

```typescript
datasource: {
  connectionDialog: {
    createTitle: 'New Database Connection',
    editTitle: 'Edit Database Connection',
    dbType: 'Database Type',
    host: 'Host',
    port: 'Port',
    database: 'Database',
    user: 'Username',
    password: 'Password',
    schema: 'Schema',
    testConnection: 'Test Connection',
    testSuccess: 'Connection successful',
    testFailed: 'Connection failed',
    createSuccess: 'Database connection created',
    updateSuccess: 'Database connection updated',
    cancel: 'Cancel',
    save: 'Save',
  },
  validation: {
    dbTypeRequired: 'Database type is required',
    hostRequired: 'Host is required',
    portRequired: 'Port is required',
    portRange: 'Port must be between 1 and 65535',
    databaseRequired: 'Database name is required',
    userRequired: 'Username is required',
    passwordRequired: 'Password is required',
  },
  types: {
    mysql: 'MySQL',
    sqlserver: 'SQL Server',
    mariadb: 'MariaDB',
    oracle: 'Oracle',
    db2: 'DB2',
    saphana: 'SAP HANA',
    kingbase: 'KingBase',
    clickhouse: 'ClickHouse',
    spark: 'Apache Spark',
    hive2: 'Apache Hive',
    starrocks: 'StarRocks',
    trino: 'Trino',
    prestodb: 'PrestoDB',
    tidb: 'TiDB',
    dameng: 'DM (达梦)',
    postgresql: 'PostgreSQL',
  },
  oracle: { connectionType: 'Connection Type', sid: 'SID', serviceName: 'Service Name' },
  saphana: { instanceNumber: 'Instance Number' },
  trino: { catalog: 'Catalog', schema: 'Schema' },
  prestodb: { catalog: 'Catalog', schema: 'Schema' },
  spark: { transport: 'Transport Protocol' },
  hive2: { transport: 'Transport Protocol' },
},
```

Update `sidebar.newConnectionTooltip` to `'Create new database connection'`.

- [ ] **Step 3: Remove old postgres keys**

Delete the `postgres: { ... }` section from both locale files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/
git commit -m "feat(frontend): replace postgres i18n keys with generic datasource keys"
```

---

## Task 17: Frontend DatabaseConnectionDialog Component

**Files:**
- Create: `frontend/src/components/sidebar/DatabaseConnectionDialog.vue`

- [ ] **Step 1: Create DatabaseConnectionDialog.vue**

This component replaces `PostgresConnectionDialog.vue`. Key changes from the original:

- Add `dbType` selector (Element Plus `el-select`) at the top of the form, before host/port fields
- When `dbType` changes, auto-fill `port` with the default port for that type
- Add conditional fields based on `dbType`:
  - Oracle: radio group for SID/Service Name (stored in `properties.connectionType`)
  - SAP HANA: instance number input (stored in `properties.instanceNumber`)
  - Trino/PrestoDB: catalog and schema inputs (stored in `properties.catalog`, `properties.schema`)
  - Spark/Hive2: transport protocol select (stored in `properties.transport`)
- For databases with schema concept (PostgreSQL, SQL Server, Oracle, DB2, SAP HANA, KingBase, 达梦): show optional `schema` input field
- Form data model adds `dbType`, `schema`, `properties` fields
- Validation rules add `dbType` required
- All text uses `t('datasource.xxx')` i18n keys
- API calls use `datasourceApi` instead of `postgresApi`
- The component is generic — works for create and edit mode (edit mode populates `dbType` from existing datasource)

Use the existing `PostgresConnectionDialog.vue` (lines 1-270) as the structural template, extending it with the db type selector and conditional fields.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/sidebar/DatabaseConnectionDialog.vue
git commit -m "feat(frontend): add generic DatabaseConnectionDialog with multi-db support"
```

---

## Task 18: Frontend Component Updates & Cleanup

**Files:**
- Create: `frontend/src/components/sidebar/DatabaseConnectionButton.vue`
- Modify: `frontend/src/components/sidebar/DatasourceGroup.vue`
- Modify: `frontend/src/components/data-management/DataTreeContent.vue`
- Modify: `frontend/src/components/data-management/DataManagementPage.vue`
- Delete: `frontend/src/components/sidebar/PostgresConnectionDialog.vue`
- Delete: `frontend/src/components/sidebar/PostgresConnectionButton.vue`
- Delete: `frontend/src/api/postgres.ts`

- [ ] **Step 1: Create DatabaseConnectionButton.vue**

Based on `PostgresConnectionButton.vue`, just change the tooltip key to `t('sidebar.newConnectionTooltip')` (which now says "新建数据库连接") and the emit name.

- [ ] **Step 2: Update DatasourceGroup.vue**

In `frontend/src/components/sidebar/DatasourceGroup.vue`:

Change the edit button condition from:
```vue
v-if="datasource.type === 'postgresql'"
```
to:
```vue
v-if="datasource.type !== 'sqlite'"
```

This shows the edit button for ALL remote database types.

- [ ] **Step 3: Update DataTreeContent.vue**

Replace `PostgresConnectionButton` with `DatabaseConnectionButton`:

- Update import
- Update template component reference

- [ ] **Step 4: Update DataManagementPage.vue**

Replace `PostgresConnectionDialog` with `DatabaseConnectionDialog`:

- Update import
- Update template component reference
- Rename `handlePostgresEditSuccess` → `handleDatasourceEditSuccess`
- Pass `editingDatasource` to dialog (dialog needs to extract `dbType` from it)

- [ ] **Step 5: Delete old files**

```bash
rm frontend/src/components/sidebar/PostgresConnectionDialog.vue
rm frontend/src/components/sidebar/PostgresConnectionButton.vue
rm frontend/src/api/postgres.ts
```

- [ ] **Step 6: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Expected: All lint, typecheck, build, and tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A frontend/
git commit -m "feat(frontend): replace postgres-specific components with generic database components"
```

---

## Task 19: Docker Compose Integration

**Files:**
- Modify: `docker/docker-compose.yaml`

- [ ] **Step 1: Add bridge service to docker-compose.yaml**

In `docker/docker-compose.yaml`, add the `bridge` service before the `backend` service:

```yaml
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
```

Add `BRIDGE_URL` to backend's environment:
```yaml
      - BRIDGE_URL=http://bridge:8080
```

Add `bridge` to backend's `depends_on`:
```yaml
      bridge:
        condition: service_healthy
```

- [ ] **Step 2: Commit**

```bash
git add docker/docker-compose.yaml
git commit -m "feat(docker): add bridge service to docker-compose"
```

---

## Task 20: Final Integration Verification

- [ ] **Step 1: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: All PASS

- [ ] **Step 2: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Expected: All PASS

- [ ] **Step 3: Run bridge build**

```bash
cd bridge && mvn package -q
```

Expected: BUILD SUCCESS

- [ ] **Step 4: Verify Docker build**

```bash
cd bridge && docker build -t databot-bridge .
```

Expected: Image builds successfully

- [ ] **Step 5: Commit any final fixes**

If any issues found, fix and commit.
