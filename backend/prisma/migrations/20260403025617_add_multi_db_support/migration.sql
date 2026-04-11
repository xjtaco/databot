/*
  Warnings:

  - A unique constraint covering the columns `[datasource_id,physical_name]` on the table `tables` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "tables_physical_name_key";

-- AlterTable
ALTER TABLE "datasources" ADD COLUMN     "properties" TEXT,
ADD COLUMN     "schema" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "tables_datasource_id_physical_name_key" ON "tables"("datasource_id", "physical_name");
