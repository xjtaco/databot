package com.databot.bridge;

import com.databot.bridge.handler.ConnectionHandler;
import com.databot.bridge.handler.HealthHandler;
import com.databot.bridge.handler.MetadataHandler;
import com.databot.bridge.handler.QueryHandler;
import com.databot.bridge.pool.ConnectionPoolManager;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MainVerticle extends AbstractVerticle {
  private static final Logger LOG = LoggerFactory.getLogger(MainVerticle.class);

  private ConnectionPoolManager poolManager;

  @Override
  public void start() {
    int port = Integer.parseInt(System.getenv().getOrDefault("BRIDGE_PORT", "8080"));
    int poolMaxSize = Integer.parseInt(System.getenv().getOrDefault("POOL_MAX_SIZE", "5"));
    long idleTimeout = Long.parseLong(System.getenv().getOrDefault("POOL_IDLE_TIMEOUT", "1800000"));

    poolManager = new ConnectionPoolManager(poolMaxSize, idleTimeout);

    HealthHandler healthHandler = new HealthHandler();
    ConnectionHandler connectionHandler = new ConnectionHandler(poolManager);
    MetadataHandler metadataHandler = new MetadataHandler(poolManager);
    QueryHandler queryHandler = new QueryHandler(poolManager);

    Router router = Router.router(vertx);
    router.route().handler(BodyHandler.create().setBodyLimit(1024 * 1024));

    // Health
    router.get("/health").handler(healthHandler::handle);

    // Connection management
    router.post("/connections").handler(connectionHandler::register);
    router.post("/connections/test").handler(connectionHandler::test);
    router.delete("/connections/:id").handler(connectionHandler::remove);

    // Metadata
    router.get("/connections/:id/databases").handler(metadataHandler::getDatabases);
    router.get("/connections/:id/schemas").handler(metadataHandler::getSchemas);
    router.get("/connections/:id/tables").handler(metadataHandler::getTables);
    router.get("/connections/:id/tables/:table/columns").handler(metadataHandler::getColumns);

    // Query
    router.post("/connections/:id/query").handler(queryHandler::execute);

    vertx
        .createHttpServer()
        .requestHandler(router)
        .listen(port)
        .onSuccess(server -> LOG.info("Bridge server started on port {}", server.actualPort()))
        .onFailure(err -> LOG.error("Failed to start server", err));
  }

  @Override
  public void stop() {
    if (poolManager != null) {
      poolManager.closeAll();
    }
  }

  public static void main(String[] args) {
    Vertx vertx = Vertx.vertx();
    vertx.deployVerticle(new MainVerticle());
  }
}
