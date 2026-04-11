package com.databot.bridge.handler;

import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MetadataHandler {
  private static final Logger LOG = LoggerFactory.getLogger(MetadataHandler.class);
  private final ConnectionPoolManager poolManager;

  public MetadataHandler(ConnectionPoolManager poolManager) {
    this.poolManager = poolManager;
  }

  public void getDatabases(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    ctx.vertx()
        .executeBlocking(
            () -> {
              try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray databases = new JsonArray();
                try (ResultSet rs = meta.getCatalogs()) {
                  while (rs.next()) {
                    databases.add(rs.getString("TABLE_CAT"));
                  }
                }
                return new JsonObject().put("databases", databases);
              }
            })
        .onSuccess(result -> sendJson(ctx, result))
        .onFailure(err -> handleError(ctx, id, err));
  }

  public void getSchemas(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    ctx.vertx()
        .executeBlocking(
            () -> {
              try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray schemas = new JsonArray();
                try (ResultSet rs = meta.getSchemas()) {
                  while (rs.next()) {
                    schemas.add(
                        new JsonObject()
                            .put("schema", rs.getString("TABLE_SCHEM"))
                            .put("catalog", rs.getString("TABLE_CATALOG")));
                  }
                }
                return new JsonObject().put("schemas", schemas);
              }
            })
        .onSuccess(result -> sendJson(ctx, result))
        .onFailure(err -> handleError(ctx, id, err));
  }

  public void getTables(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    String schema = ctx.queryParam("schema").stream().findFirst().orElse(null);
    ctx.vertx()
        .executeBlocking(
            () -> {
              try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                JsonArray tables = new JsonArray();
                String catalog = conn.getCatalog();
                try (ResultSet rs =
                    meta.getTables(catalog, schema, "%", new String[] {"TABLE", "VIEW"})) {
                  while (rs.next()) {
                    tables.add(
                        new JsonObject()
                            .put("name", rs.getString("TABLE_NAME"))
                            .put("schema", rs.getString("TABLE_SCHEM"))
                            .put("type", rs.getString("TABLE_TYPE")));
                  }
                }
                return new JsonObject().put("tables", tables);
              }
            })
        .onSuccess(result -> sendJson(ctx, result))
        .onFailure(err -> handleError(ctx, id, err));
  }

  public void getColumns(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    String table = ctx.pathParam("table");
    String schema = ctx.queryParam("schema").stream().findFirst().orElse(null);
    ctx.vertx()
        .executeBlocking(
            () -> {
              try (Connection conn = poolManager.getConnection(id)) {
                DatabaseMetaData meta = conn.getMetaData();
                String catalog = conn.getCatalog();

                java.util.Set<String> primaryKeys = new java.util.HashSet<>();
                try (ResultSet pkRs = meta.getPrimaryKeys(catalog, schema, table)) {
                  while (pkRs.next()) {
                    primaryKeys.add(pkRs.getString("COLUMN_NAME"));
                  }
                }

                JsonArray columns = new JsonArray();
                try (ResultSet rs = meta.getColumns(catalog, schema, table, "%")) {
                  while (rs.next()) {
                    columns.add(
                        new JsonObject()
                            .put("name", rs.getString("COLUMN_NAME"))
                            .put("type", rs.getString("TYPE_NAME"))
                            .put(
                                "nullable",
                                rs.getInt("NULLABLE") == DatabaseMetaData.columnNullable)
                            .put("ordinal", rs.getInt("ORDINAL_POSITION"))
                            .put("defaultValue", rs.getString("COLUMN_DEF"))
                            .put(
                                "isPrimaryKey", primaryKeys.contains(rs.getString("COLUMN_NAME"))));
                  }
                }
                return new JsonObject().put("columns", columns);
              }
            })
        .onSuccess(result -> sendJson(ctx, result))
        .onFailure(err -> handleError(ctx, id, err));
  }

  private void sendJson(RoutingContext ctx, JsonObject json) {
    ctx.response().putHeader("Content-Type", "application/json").end(json.encode());
  }

  private void handleError(RoutingContext ctx, String id, Throwable err) {
    LOG.error("Metadata query failed for connection {}", id, err);
    if (err instanceof IllegalArgumentException) {
      ctx.response()
          .setStatusCode(404)
          .putHeader("Content-Type", "application/json")
          .end(ErrorResponse.create(ErrorResponse.CONNECTION_NOT_FOUND, err.getMessage()).encode());
    } else {
      ctx.response()
          .setStatusCode(500)
          .putHeader("Content-Type", "application/json")
          .end(ErrorResponse.create(ErrorResponse.METADATA_ERROR, err.getMessage()).encode());
    }
  }
}
