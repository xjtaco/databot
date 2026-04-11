package com.databot.bridge.pool;

import com.databot.bridge.jdbc.JdbcUrlBuilder;
import com.databot.bridge.model.ConnectionConfig;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ConnectionPoolManager {
  private static final Logger LOG = LoggerFactory.getLogger(ConnectionPoolManager.class);

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

    String jdbcUrl =
        JdbcUrlBuilder.build(
            config.getDbType(),
            config.getHost(),
            config.getPort(),
            config.getDatabase(),
            config.getProperties());

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
    LOG.info("Registered connection pool: {} ({})", id, config.getDbType());
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
      LOG.info("Removed connection pool: {}", id);
    }
  }

  public void closeAll() {
    pools.forEach(
        (id, ds) -> {
          ds.close();
          LOG.info("Closed connection pool: {}", id);
        });
    pools.clear();
    configs.clear();
  }

  public Connection testConnection(ConnectionConfig config) throws SQLException {
    String jdbcUrl =
        JdbcUrlBuilder.build(
            config.getDbType(),
            config.getHost(),
            config.getPort(),
            config.getDatabase(),
            config.getProperties());

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
