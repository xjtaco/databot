package com.databot.bridge.model;

import static org.junit.jupiter.api.Assertions.*;

import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

class ConnectionConfigTest {

  @Test
  void shouldParseFullConfig() {
    JsonObject json =
        new JsonObject()
            .put("id", "test-id")
            .put("dbType", "mysql")
            .put("host", "db.example.com")
            .put("port", 3306)
            .put("database", "mydb")
            .put("user", "admin")
            .put("password", "secret")
            .put("properties", new JsonObject().put("key1", "val1"));

    ConnectionConfig config = ConnectionConfig.fromJson(json);

    assertEquals("test-id", config.getId());
    assertEquals(DbType.MYSQL, config.getDbType());
    assertEquals("db.example.com", config.getHost());
    assertEquals(3306, config.getPort());
    assertEquals("mydb", config.getDatabase());
    assertEquals("admin", config.getUser());
    assertEquals("secret", config.getPassword());
    assertEquals("val1", config.getProperties().get("key1"));
  }

  @Test
  void shouldUseDefaultsForMissingOptionalFields() {
    JsonObject json = new JsonObject().put("dbType", "postgresql").put("host", "localhost");

    ConnectionConfig config = ConnectionConfig.fromJson(json);

    assertNull(config.getId());
    assertEquals(DbType.POSTGRESQL, config.getDbType());
    assertEquals(0, config.getPort());
    assertEquals("", config.getDatabase());
    assertEquals("", config.getUser());
    assertEquals("", config.getPassword());
    assertTrue(config.getProperties().isEmpty());
  }

  @Test
  void shouldThrowForInvalidDbType() {
    JsonObject json = new JsonObject().put("dbType", "nosql").put("host", "localhost");

    assertThrows(IllegalArgumentException.class, () -> ConnectionConfig.fromJson(json));
  }

  @Test
  void shouldParseCaseInsensitiveDbType() {
    JsonObject json = new JsonObject().put("dbType", "PostgreSQL").put("host", "localhost");

    ConnectionConfig config = ConnectionConfig.fromJson(json);
    assertEquals(DbType.POSTGRESQL, config.getDbType());
  }

  @Test
  void shouldHandleNullProperties() {
    JsonObject json = new JsonObject().put("dbType", "mysql").put("host", "localhost");
    // No "properties" key

    ConnectionConfig config = ConnectionConfig.fromJson(json);
    assertNotNull(config.getProperties());
    assertTrue(config.getProperties().isEmpty());
  }

  @Test
  void shouldSetId() {
    ConnectionConfig config = new ConnectionConfig();
    config.setId("new-id");
    assertEquals("new-id", config.getId());
  }
}
