package com.databot.bridge.handler;

import com.databot.bridge.model.ErrorResponse;
import com.databot.bridge.model.QueryResult;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class QueryHandler {
  private static final Logger LOG = LoggerFactory.getLogger(QueryHandler.class);
  private static final int DEFAULT_MAX_ROWS = 10000;
  private static final int DEFAULT_TIMEOUT_SECONDS = 60;
  private final ConnectionPoolManager poolManager;

  public QueryHandler(ConnectionPoolManager poolManager) {
    this.poolManager = poolManager;
  }

  public void execute(RoutingContext ctx) {
    String id = ctx.pathParam("id");
    ctx.vertx()
        .executeBlocking(
            () -> {
              JsonObject body = ctx.body().asJsonObject();
              if (body == null || !body.containsKey("sql")) {
                throw new IllegalArgumentException("Request body must contain 'sql' field");
              }
              String sql = body.getString("sql");
              int maxRows = body.getInteger("maxRows", DEFAULT_MAX_ROWS);
              int timeoutMs = body.getInteger("timeoutMs", DEFAULT_TIMEOUT_SECONDS * 1000);

              try (Connection conn = poolManager.getConnection(id);
                  Statement stmt = conn.createStatement()) {

                stmt.setQueryTimeout(timeoutMs / 1000);
                stmt.setMaxRows(maxRows + 1);

                boolean hasResultSet = stmt.execute(sql);
                if (!hasResultSet) {
                  int updateCount = stmt.getUpdateCount();
                  return new JsonObject()
                      .put("columns", new JsonArray())
                      .put("rows", new JsonArray())
                      .put("rowCount", updateCount)
                      .put("truncated", false);
                }

                try (ResultSet rs = stmt.getResultSet()) {
                  ResultSetMetaData rsMeta = rs.getMetaData();
                  int columnCount = rsMeta.getColumnCount();

                  List<QueryResult.ColumnInfo> columns = new ArrayList<>();
                  for (int i = 1; i <= columnCount; i++) {
                    columns.add(
                        new QueryResult.ColumnInfo(
                            rsMeta.getColumnLabel(i),
                            rsMeta.getColumnTypeName(i),
                            rsMeta.isNullable(i) == ResultSetMetaData.columnNullable));
                  }

                  List<JsonArray> rows = new ArrayList<>();
                  int count = 0;
                  boolean truncated = false;
                  while (rs.next()) {
                    if (count >= maxRows) {
                      truncated = true;
                      break;
                    }
                    JsonArray row = new JsonArray();
                    for (int i = 1; i <= columnCount; i++) {
                      row.add(convertValue(rs, i));
                    }
                    rows.add(row);
                    count++;
                  }

                  return new QueryResult(columns, rows, count, truncated).toJson();
                }
              }
            })
        .onSuccess(
            result ->
                ctx.response().putHeader("Content-Type", "application/json").end(result.encode()))
        .onFailure(
            err -> {
              LOG.error("Query execution failed for connection {}", id, err);
              if (err instanceof IllegalArgumentException) {
                int code = err.getMessage().contains("not found") ? 404 : 400;
                String errorType =
                    code == 404
                        ? ErrorResponse.CONNECTION_NOT_FOUND
                        : ErrorResponse.INVALID_REQUEST;
                ctx.response()
                    .setStatusCode(code)
                    .putHeader("Content-Type", "application/json")
                    .end(ErrorResponse.create(errorType, err.getMessage()).encode());
              } else if (err instanceof SQLTimeoutException) {
                ctx.response()
                    .setStatusCode(408)
                    .putHeader("Content-Type", "application/json")
                    .end(ErrorResponse.create(ErrorResponse.TIMEOUT, err.getMessage()).encode());
              } else {
                ctx.response()
                    .setStatusCode(500)
                    .putHeader("Content-Type", "application/json")
                    .end(
                        ErrorResponse.create(ErrorResponse.QUERY_ERROR, err.getMessage()).encode());
              }
            });
  }

  Object convertValue(ResultSet rs, int index) throws SQLException {
    Object value = rs.getObject(index);
    if (value == null) {
      return null;
    }
    if (value instanceof BigDecimal bd) {
      return bd.doubleValue();
    }
    if (value instanceof Timestamp ts) {
      return ts.toString();
    }
    if (value instanceof Date d) {
      return d.toString();
    }
    if (value instanceof Time t) {
      return t.toString();
    }
    if (value instanceof byte[]) {
      return "[binary]";
    }
    return value;
  }
}
