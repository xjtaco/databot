-- CreateTable
CREATE TABLE "global_configs" (
    "id" UUID NOT NULL,
    "config_key" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "config_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_configs_category_config_key_key" ON "global_configs"("category", "config_key");
