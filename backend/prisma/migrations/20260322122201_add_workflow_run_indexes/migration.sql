-- CreateIndex
CREATE INDEX "workflow_node_runs_node_id_idx" ON "workflow_node_runs"("node_id");

-- CreateIndex
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs"("status");
