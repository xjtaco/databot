-- CreateIndex
CREATE UNIQUE INDEX "datasources_connection_key" ON "datasources"("type", "host", "port", "database", "schema");
