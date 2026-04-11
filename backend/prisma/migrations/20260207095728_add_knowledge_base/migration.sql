-- CreateTable
CREATE TABLE "knowledge_folders" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_files" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "folder_id" UUID NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_files_folder_id_idx" ON "knowledge_files"("folder_id");

-- AddForeignKey
ALTER TABLE "knowledge_folders" ADD CONSTRAINT "knowledge_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "knowledge_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
