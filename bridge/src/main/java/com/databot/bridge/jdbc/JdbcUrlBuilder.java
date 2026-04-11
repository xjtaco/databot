package com.databot.bridge.jdbc;

import com.databot.bridge.model.DbType;
import java.util.Map;

public final class JdbcUrlBuilder {

  private JdbcUrlBuilder() {}

  public static String build(
      DbType dbType, String host, int port, String database, Map<String, String> properties) {
    return switch (dbType) {
      case MYSQL, TIDB, STARROCKS -> "jdbc:mysql://" + host + ":" + port + "/" + database;
      case MARIADB -> "jdbc:mariadb://" + host + ":" + port + "/" + database;
      case POSTGRESQL, KINGBASE -> {
        String prefix = dbType == DbType.KINGBASE ? "kingbase8" : "postgresql";
        yield "jdbc:" + prefix + "://" + host + ":" + port + "/" + database;
      }
      case SQLSERVER ->
          "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database + ";encrypt=false";
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

  private static String buildOracleUrl(
      String host, int port, String database, Map<String, String> properties) {
    String connectionType = properties.getOrDefault("connectionType", "serviceName");
    if ("sid".equalsIgnoreCase(connectionType)) {
      return "jdbc:oracle:thin:@" + host + ":" + port + ":" + database;
    }
    return "jdbc:oracle:thin:@" + host + ":" + port + "/" + database;
  }
}
