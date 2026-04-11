package com.databot.bridge.handler;

import com.databot.bridge.model.ConnectionConfig;
import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ConnectionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(ConnectionHandler.class);
  private final ConnectionPoolManager poolManager;

  public ConnectionHandler(ConnectionPoolManager poolManager) {
    this.poolManager = poolManager;
  }

  public void register(RoutingContext ctx) {
    ctx.vertx()
        .executeBlocking(
            () -> {
              JsonObject body = ctx.body().asJsonObject();
              if (body == null) {
                throw new IllegalArgumentException("Request body is required");
              }
              ConnectionConfig config = ConnectionConfig.fromJson(body);
              poolManager.register(config);
              return new JsonObject().put("id", config.getId()).put("status", "registered");
            })
        .onSuccess(
            result ->
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .setStatusCode(201)
                    .end(result.encode()))
        .onFailure(
            err -> {
              LOG.error("Failed to register connection", err);
              ctx.response()
                  .putHeader("Content-Type", "application/json")
                  .setStatusCode(400)
                  .end(
                      ErrorResponse.create(ErrorResponse.CONNECTION_FAILED, err.getMessage())
                          .encode());
            });
  }

  public void remove(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    poolManager.remove(id);
    ctx.response().setStatusCode(204).end();
  }

  public void test(RoutingContext ctx) {
    ctx.vertx()
        .executeBlocking(
            () -> {
              JsonObject body = ctx.body().asJsonObject();
              if (body == null) {
                throw new IllegalArgumentException("Request body is required");
              }
              ConnectionConfig config = ConnectionConfig.fromJson(body);
              poolManager.testConnection(config);
              return new JsonObject().put("success", true).put("message", "Connection successful");
            })
        .onSuccess(
            result ->
                ctx.response().putHeader("Content-Type", "application/json").end(result.encode()))
        .onFailure(
            err -> {
              LOG.error("Connection test failed", err);
              ctx.response()
                  .putHeader("Content-Type", "application/json")
                  .setStatusCode(400)
                  .end(
                      ErrorResponse.create(ErrorResponse.CONNECTION_FAILED, err.getMessage())
                          .encode());
            });
  }
}
