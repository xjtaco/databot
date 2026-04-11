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
