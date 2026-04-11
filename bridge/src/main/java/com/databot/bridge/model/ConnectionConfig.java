package com.databot.bridge.model;

import io.vertx.core.json.JsonObject;
import java.util.HashMap;
import java.util.Map;

public class ConnectionConfig {
  private String id;
  private DbType dbType;
  private String host;
  private int port;
  private String database;
  private String user;
  private String password;
  private Map<String, String> properties;

  public ConnectionConfig() {
    this.properties = new HashMap<>();
  }

  public static ConnectionConfig fromJson(JsonObject json) {
    ConnectionConfig config = new ConnectionConfig();
    config.id = json.getString("id");
    config.dbType = DbType.fromString(json.getString("dbType"));
    config.host = json.getString("host");
    config.port = json.getInteger("port", 0);
    config.database = json.getString("database", "");
    config.user = json.getString("user", "");
    config.password = json.getString("password", "");
    JsonObject props = json.getJsonObject("properties");
    if (props != null) {
      props.forEach(
          entry -> config.properties.put(entry.getKey(), String.valueOf(entry.getValue())));
    }
    return config;
  }

  public String getId() {
    return id;
  }

  public DbType getDbType() {
    return dbType;
  }

  public String getHost() {
    return host;
  }

  public int getPort() {
    return port;
  }

  public String getDatabase() {
    return database;
  }

  public String getUser() {
    return user;
  }

  public String getPassword() {
    return password;
  }

  public Map<String, String> getProperties() {
    return properties;
  }

  public void setId(String id) {
    this.id = id;
  }
}
