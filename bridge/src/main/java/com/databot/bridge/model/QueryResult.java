package com.databot.bridge.model;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.List;

public class QueryResult {
  private final List<ColumnInfo> columns;
  private final List<JsonArray> rows;
  private final int rowCount;
  private final boolean truncated;

  public QueryResult(
      List<ColumnInfo> columns, List<JsonArray> rows, int rowCount, boolean truncated) {
    this.columns = columns;
    this.rows = rows;
    this.rowCount = rowCount;
    this.truncated = truncated;
  }

  public JsonObject toJson() {
    JsonArray colArray = new JsonArray();
    for (ColumnInfo col : columns) {
      colArray.add(
          new JsonObject()
              .put("name", col.name())
              .put("type", col.type())
              .put("nullable", col.nullable()));
    }
    JsonArray rowArray = new JsonArray();
    for (JsonArray row : rows) {
      rowArray.add(row);
    }
    return new JsonObject()
        .put("columns", colArray)
        .put("rows", rowArray)
        .put("rowCount", rowCount)
        .put("truncated", truncated);
  }

  public record ColumnInfo(String name, String type, boolean nullable) {}
}
