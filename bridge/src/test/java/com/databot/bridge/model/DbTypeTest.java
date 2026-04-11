package com.databot.bridge.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

class DbTypeTest {

  @ParameterizedTest
  @EnumSource(DbType.class)
  void allTypesShouldHaveDriverClass(DbType dbType) {
    assertNotNull(dbType.getDriverClass());
    assertFalse(dbType.getDriverClass().isEmpty());
  }

  @Test
  void fromStringShouldBeCaseInsensitive() {
    assertEquals(DbType.MYSQL, DbType.fromString("mysql"));
    assertEquals(DbType.MYSQL, DbType.fromString("MYSQL"));
    assertEquals(DbType.MYSQL, DbType.fromString("MySQL"));
  }

  @Test
  void fromStringShouldThrowForUnknown() {
    IllegalArgumentException ex =
        assertThrows(IllegalArgumentException.class, () -> DbType.fromString("nosql"));
    assertTrue(ex.getMessage().contains("Unsupported database type"));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "mysql",
        "mariadb",
        "postgresql",
        "sqlserver",
        "oracle",
        "db2",
        "saphana",
        "kingbase",
        "clickhouse",
        "spark",
        "hive2",
        "starrocks",
        "trino",
        "prestodb",
        "tidb",
        "dameng"
      })
  void shouldParseAllSupportedTypes(String typeName) {
    assertDoesNotThrow(() -> DbType.fromString(typeName));
  }

  @Test
  void shouldHave16Types() {
    assertEquals(16, DbType.values().length);
  }
}
