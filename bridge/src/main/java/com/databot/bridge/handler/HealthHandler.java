package com.databot.bridge.handler;

import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

public class HealthHandler {
  public void handle(RoutingContext ctx) {
    ctx.response()
        .putHeader("Content-Type", "application/json")
        .end(new JsonObject().put("status", "ok").encode());
  }
}
