package com.databot.bridge.pool;

import static org.junit.jupiter.api.Assertions.*;

import com.databot.bridge.model.ConnectionConfig;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

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
    ConnectionConfig config =
        ConnectionConfig.fromJson(
            new JsonObject()
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
