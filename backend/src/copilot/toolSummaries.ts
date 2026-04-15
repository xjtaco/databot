/**
 * Bilingual tool execution summaries for copilot and debug agents.
 * Locale is passed from frontend via WebSocket query param.
 */

interface ToolSummaryTexts {
  start: Record<string, string | ((args: Record<string, unknown>) => string)>;
  done: Record<string, string>;
  fallbackStart: string;
  fallbackDone: string;
  failed: string;
  executionCompleted: string;
  executionFailed: string;
}

const zhCN: ToolSummaryTexts = {
  start: {
    wf_add_node: (args) => `创建 ${String(args.type ?? '')} 节点 "${String(args.name ?? '')}"`,
    wf_update_node: (args) => `更新节点 ${String(args.nodeId ?? '')}`,
    wf_patch_node: '修改节点内容',
    wf_replace_node: (args) => `替换节点 ${String(args.nodeId ?? '')}`,
    wf_delete_node: (args) => `删除节点 ${String(args.nodeId ?? '')}`,
    wf_connect_nodes: '连接节点',
    wf_disconnect_nodes: '断开节点连接',
    wf_execute: '执行工作流',
    wf_execute_node: (args) => `执行节点 ${String(args.nodeId ?? '')}`,
    wf_get_summary: '获取工作流摘要',
    wf_get_node: '获取节点详情',
    wf_get_upstream: '获取上游节点',
    wf_get_downstream: '获取下游节点',
    wf_get_run_result: (args) => `获取执行结果 ${String(args.runId ?? '')}`,
    wf_search_custom_nodes: (args) => `搜索自定义节点: ${String(args.pattern ?? '')}`,
    scoped_glob: (args) => `搜索文件: ${String(args.pattern ?? '')}`,
    scoped_grep: (args) => `搜索内容: ${String(args.pattern ?? '')}`,
    scoped_read_file: '读取文件',
    web_search: '执行网页搜索',
    sql: '执行 SQL 查询',
    todos_writer: '更新任务列表',
  },
  done: {
    wf_add_node: '节点已创建',
    wf_update_node: '节点已更新',
    wf_patch_node: '节点已修改',
    wf_replace_node: '节点已替换',
    wf_delete_node: '节点已删除',
    wf_connect_nodes: '已连接',
    wf_disconnect_nodes: '已断开',
    wf_execute: '执行完成',
    wf_execute_node: '执行完成',
    wf_get_summary: '摘要已获取',
    wf_get_node: '节点详情已获取',
    wf_get_upstream: '上游节点已获取',
    wf_get_downstream: '下游节点已获取',
    wf_get_run_result: '执行结果已获取',
    wf_search_custom_nodes: '搜索完成',
    scoped_glob: '搜索完成',
    scoped_grep: '搜索完成',
    scoped_read_file: '文件已读取',
    web_search: '网页搜索完成',
    sql: 'SQL 查询完成',
    todos_writer: '任务列表已更新',
  },
  fallbackStart: '执行',
  fallbackDone: '完成',
  failed: '操作失败',
  executionCompleted: '执行完成',
  executionFailed: '执行失败',
};

const enUS: ToolSummaryTexts = {
  start: {
    wf_add_node: (args) => `Creating ${String(args.type ?? '')} node "${String(args.name ?? '')}"`,
    wf_update_node: (args) => `Updating node ${String(args.nodeId ?? '')}`,
    wf_patch_node: 'Patching node content',
    wf_replace_node: (args) => `Replacing node ${String(args.nodeId ?? '')}`,
    wf_delete_node: (args) => `Deleting node ${String(args.nodeId ?? '')}`,
    wf_connect_nodes: 'Connecting nodes',
    wf_disconnect_nodes: 'Disconnecting nodes',
    wf_execute: 'Executing workflow',
    wf_execute_node: (args) => `Executing node ${String(args.nodeId ?? '')}`,
    wf_get_summary: 'Getting workflow summary',
    wf_get_node: 'Getting node details',
    wf_get_upstream: 'Getting upstream nodes',
    wf_get_downstream: 'Getting downstream nodes',
    wf_get_run_result: (args) => `Getting run result ${String(args.runId ?? '')}`,
    wf_search_custom_nodes: (args) => `Searching custom nodes: ${String(args.pattern ?? '')}`,
    scoped_glob: (args) => `Searching files: ${String(args.pattern ?? '')}`,
    scoped_grep: (args) => `Searching content: ${String(args.pattern ?? '')}`,
    scoped_read_file: 'Reading file',
    web_search: 'Searching the web',
    sql: 'Running SQL query',
    todos_writer: 'Updating task list',
  },
  done: {
    wf_add_node: 'Node created',
    wf_update_node: 'Node updated',
    wf_patch_node: 'Node patched',
    wf_replace_node: 'Node replaced',
    wf_delete_node: 'Node deleted',
    wf_connect_nodes: 'Connected',
    wf_disconnect_nodes: 'Disconnected',
    wf_execute: 'Execution complete',
    wf_execute_node: 'Execution complete',
    wf_get_summary: 'Summary retrieved',
    wf_get_node: 'Node details retrieved',
    wf_get_upstream: 'Upstream nodes retrieved',
    wf_get_downstream: 'Downstream nodes retrieved',
    wf_get_run_result: 'Run result retrieved',
    wf_search_custom_nodes: 'Search complete',
    scoped_glob: 'Search complete',
    scoped_grep: 'Search complete',
    scoped_read_file: 'File read',
    web_search: 'Web search complete',
    sql: 'SQL query complete',
    todos_writer: 'Task list updated',
  },
  fallbackStart: 'Executing',
  fallbackDone: 'Done',
  failed: 'Operation failed',
  executionCompleted: 'Execution complete',
  executionFailed: 'Execution failed',
};

const locales: Record<string, ToolSummaryTexts> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function getTexts(locale: string): ToolSummaryTexts {
  return locales[locale] ?? zhCN;
}

export function buildToolStartSummary(
  locale: string,
  toolName: string,
  args: Record<string, unknown>
): string {
  const texts = getTexts(locale);
  const entry = texts.start[toolName];
  if (!entry) return `${texts.fallbackStart} ${toolName}`;
  return typeof entry === 'function' ? entry(args) : entry;
}

export function buildToolDoneSummary(
  locale: string,
  toolName: string,
  result?: { success: boolean; data: unknown; error?: string }
): string {
  const texts = getTexts(locale);
  if (result && !result.success) return result.error || texts.failed;

  // Special handling for execution tools with status in result
  if (result && (toolName === 'wf_execute' || toolName === 'wf_execute_node')) {
    const data = result.data as Record<string, unknown> | null;
    if (data && typeof data === 'object' && 'status' in data) {
      return data.status === 'completed' ? texts.executionCompleted : texts.executionFailed;
    }
  }

  return texts.done[toolName] ?? texts.fallbackDone;
}
