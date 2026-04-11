package com.databot.bridge.jdbc;

import static org.junit.jupiter.api.Assertions.*;

import com.databot.bridge.model.DbType;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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
    String url =
        JdbcUrlBuilder.build(
            DbType.ORACLE, "localhost", 1521, "ORCL", Map.of("connectionType", "sid"));
    assertEquals("jdbc:oracle:thin:@localhost:1521:ORCL", url);
  }
}
