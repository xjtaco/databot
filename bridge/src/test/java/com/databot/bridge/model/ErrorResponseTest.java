package com.databot.bridge.model;

import static org.junit.jupiter.api.Assertions.*;

import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

class ErrorResponseTest {

  @Test
  void shouldCreateSimpleError() {
    JsonObject error = ErrorResponse.create("CONNECTION_FAILED", "refused");

    assertEquals("CONNECTION_FAILED", error.getString("error"));
    assertEquals("refused", error.getString("message"));
    assertNull(error.getJsonObject("details"));
  }

  @Test
  void shouldCreateErrorWithDetails() {
    JsonObject details = new JsonObject().put("host", "localhost").put("port", 3306);
    JsonObject error = ErrorResponse.create("CONNECTION_FAILED", "refused", details);

    assertEquals("CONNECTION_FAILED", error.getString("error"));
    assertEquals("refused", error.getString("message"));
    assertEquals("localhost", error.getJsonObject("details").getString("host"));
    assertEquals(3306, error.getJsonObject("details").getInteger("port"));
  }

  @Test
  void shouldHaveCorrectConstants() {
    assertEquals("CONNECTION_FAILED", ErrorResponse.CONNECTION_FAILED);
    assertEquals("CONNECTION_NOT_FOUND", ErrorResponse.CONNECTION_NOT_FOUND);
    assertEquals("QUERY_ERROR", ErrorResponse.QUERY_ERROR);
    assertEquals("METADATA_ERROR", ErrorResponse.METADATA_ERROR);
    assertEquals("INVALID_REQUEST", ErrorResponse.INVALID_REQUEST);
    assertEquals("TIMEOUT", ErrorResponse.TIMEOUT);
  }
}
