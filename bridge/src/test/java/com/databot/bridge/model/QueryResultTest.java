package com.databot.bridge.model;

import static org.junit.jupiter.api.Assertions.*;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.List;
import org.junit.jupiter.api.Test;

class QueryResultTest {

  @Test
  void shouldSerializeToJson() {
    List<QueryResult.ColumnInfo> columns =
        List.of(
            new QueryResult.ColumnInfo("id", "INTEGER", false),
            new QueryResult.ColumnInfo("name", "VARCHAR", true));
    List<JsonArray> rows =
        List.of(new JsonArray().add(1).add("Alice"), new JsonArray().add(2).add("Bob"));

    QueryResult result = new QueryResult(columns, rows, 2, false);
    JsonObject json = result.toJson();

    assertEquals(2, json.getInteger("rowCount"));
    assertFalse(json.getBoolean("truncated"));

    JsonArray colArray = json.getJsonArray("columns");
    assertEquals(2, colArray.size());
    assertEquals("id", colArray.getJsonObject(0).getString("name"));
    assertEquals("INTEGER", colArray.getJsonObject(0).getString("type"));
    assertFalse(colArray.getJsonObject(0).getBoolean("nullable"));
    assertTrue(colArray.getJsonObject(1).getBoolean("nullable"));

    JsonArray rowArray = json.getJsonArray("rows");
    assertEquals(2, rowArray.size());
    assertEquals(1, rowArray.getJsonArray(0).getInteger(0));
    assertEquals("Alice", rowArray.getJsonArray(0).getString(1));
  }

  @Test
  void shouldSerializeEmptyResult() {
    QueryResult result = new QueryResult(List.of(), List.of(), 0, false);
    JsonObject json = result.toJson();

    assertEquals(0, json.getInteger("rowCount"));
    assertFalse(json.getBoolean("truncated"));
    assertTrue(json.getJsonArray("columns").isEmpty());
    assertTrue(json.getJsonArray("rows").isEmpty());
  }

  @Test
  void shouldSerializeTruncatedResult() {
    QueryResult result =
        new QueryResult(
            List.of(new QueryResult.ColumnInfo("x", "INT", false)),
            List.of(new JsonArray().add(1)),
            1,
            true);
    JsonObject json = result.toJson();

    assertTrue(json.getBoolean("truncated"));
    assertEquals(1, json.getInteger("rowCount"));
  }
}
