-- CreateTable
CREATE TABLE "datasources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_path" VARCHAR(500),
    "host" VARCHAR(255),
    "port" INTEGER,
    "database" VARCHAR(255),
    "user" VARCHAR(255),
    "password" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "physical_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(50) NOT NULL,
    "datasource_id" UUID,
    "dictionary_path" VARCHAR(500),
    "data_file_path" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "physical_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "data_type" VARCHAR(50) NOT NULL,
    "column_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "columns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasources_name_key" ON "datasources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tables_physical_name_key" ON "tables"("physical_name");

-- CreateIndex
CREATE INDEX "tables_datasource_id_idx" ON "tables"("datasource_id");

-- CreateIndex
CREATE INDEX "columns_table_id_idx" ON "columns"("table_id");

-- CreateIndex
CREATE UNIQUE INDEX "columns_table_id_physical_name_key" ON "columns"("table_id", "physical_name");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_datasource_id_fkey" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
