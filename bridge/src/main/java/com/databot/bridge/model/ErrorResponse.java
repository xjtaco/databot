package com.databot.bridge.model;

import io.vertx.core.json.JsonObject;

public final class ErrorResponse {

  private ErrorResponse() {}

  public static final String CONNECTION_FAILED = "CONNECTION_FAILED";
  public static final String CONNECTION_NOT_FOUND = "CONNECTION_NOT_FOUND";
  public static final String QUERY_ERROR = "QUERY_ERROR";
  public static final String METADATA_ERROR = "METADATA_ERROR";
  public static final String INVALID_REQUEST = "INVALID_REQUEST";
  public static final String TIMEOUT = "TIMEOUT";

  public static JsonObject create(String error, String message) {
    return new JsonObject().put("error", error).put("message", message);
  }

  public static JsonObject create(String error, String message, JsonObject details) {
    return create(error, message).put("details", details);
  }
}
