import type { ActionDomain, UiActionCardDefinition } from './uiActionCardTypes';

// ---------------------------------------------------------------------------
// In-memory catalog – single source of truth for all UI action cards
// ---------------------------------------------------------------------------

const catalog: readonly UiActionCardDefinition[] = [
  // ── data ──────────────────────────────────────────────────────────────────
  {
    cardId: 'data.open',
    domain: 'data',
    action: 'open',
    title: 'Open Data Panel',
    description: 'Navigate to the data management panel to browse datasources.',
    usage: 'When the user wants to view or manage their datasources.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'data',
    relatedDomains: ['knowledge'],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_create',
    domain: 'data',
    action: 'datasource_create',
    title: 'Create Datasource',
    description: 'Create a new database datasource by providing connection details.',
    usage: 'When the user wants to add a new database connection (MySQL, PostgreSQL, etc.).',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Display name for the datasource.',
      },
      {
        name: 'type',
        type: 'string',
        description: 'Database type, e.g. mysql, postgresql, clickhouse.',
      },
      {
        name: 'host',
        type: 'string',
        description: 'Database host address.',
        sensitive: true,
      },
      {
        name: 'port',
        type: 'number',
        description: 'Database port number.',
        sensitive: true,
      },
      {
        name: 'database',
        type: 'string',
        description: 'Database name to connect to.',
        sensitive: true,
      },
      {
        name: 'username',
        type: 'string',
        description: 'Login username.',
        sensitive: true,
      },
      {
        name: 'password',
        type: 'string',
        description: 'Login password.',
        sensitive: true,
      },
    ],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Optional description for the datasource.',
      },
    ],
    riskLevel: 'medium',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'data',
    relatedDomains: ['knowledge'],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_test',
    domain: 'data',
    action: 'datasource_test',
    title: 'Test Datasource Connection',
    description: 'Test the connectivity of an existing datasource.',
    usage: 'When the user wants to verify that a datasource connection is working.',
    requiredParams: [
      {
        name: 'datasourceId',
        type: 'string',
        description: 'ID of the datasource to test.',
      },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'data',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_delete',
    domain: 'data',
    action: 'datasource_delete',
    title: 'Delete Datasource',
    description: 'Permanently remove a datasource and its saved credentials.',
    usage: 'When the user wants to remove a datasource they no longer need.',
    requiredParams: [
      {
        name: 'datasourceId',
        type: 'string',
        description: 'ID of the datasource to delete.',
      },
    ],
    optionalParams: [],
    riskLevel: 'danger',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'data',
    relatedDomains: ['knowledge'],
    dependencies: [],
  },

  // ── knowledge ─────────────────────────────────────────────────────────────
  {
    cardId: 'knowledge.open',
    domain: 'knowledge',
    action: 'open',
    title: 'Open Knowledge Panel',
    description: 'Navigate to the knowledge base panel to browse folders and files.',
    usage: 'When the user wants to view or manage their knowledge base.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: ['data'],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_create',
    domain: 'knowledge',
    action: 'folder_create',
    title: 'Create Folder',
    description: 'Create a new folder in the knowledge base.',
    usage: 'When the user wants to organize knowledge files into a new folder.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Name of the folder to create.',
      },
    ],
    optionalParams: [
      {
        name: 'parentId',
        type: 'string',
        description: 'Parent folder ID. If omitted, creates at root.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_rename',
    domain: 'knowledge',
    action: 'folder_rename',
    title: 'Rename Folder',
    description: 'Rename an existing folder in the knowledge base.',
    usage: 'When the user wants to change the name of a knowledge folder.',
    requiredParams: [
      {
        name: 'folderId',
        type: 'string',
        description: 'ID of the folder to rename.',
      },
      {
        name: 'newName',
        type: 'string',
        description: 'New name for the folder.',
      },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_move',
    domain: 'knowledge',
    action: 'folder_move',
    title: 'Move Folder',
    description: 'Move a folder to a different parent location.',
    usage: 'When the user wants to reorganize a folder in the knowledge tree.',
    requiredParams: [
      {
        name: 'folderId',
        type: 'string',
        description: 'ID of the folder to move.',
      },
      {
        name: 'targetParentId',
        type: 'string',
        description: 'ID of the new parent folder.',
      },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_delete',
    domain: 'knowledge',
    action: 'folder_delete',
    title: 'Delete Folder',
    description: 'Delete a folder and all of its contents recursively.',
    usage: 'When the user wants to remove a folder and everything inside it.',
    requiredParams: [
      {
        name: 'folderId',
        type: 'string',
        description: 'ID of the folder to delete.',
      },
    ],
    optionalParams: [],
    riskLevel: 'danger',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_open',
    domain: 'knowledge',
    action: 'file_open',
    title: 'Open Knowledge File',
    description: 'Open and display a file from the knowledge base.',
    usage: 'When the user wants to view the contents of a knowledge file.',
    requiredParams: [
      {
        name: 'fileId',
        type: 'string',
        description: 'ID of the file to open.',
      },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_move',
    domain: 'knowledge',
    action: 'file_move',
    title: 'Move File',
    description: 'Move a file to a different folder in the knowledge base.',
    usage: 'When the user wants to reorganize a knowledge file.',
    requiredParams: [
      {
        name: 'fileId',
        type: 'string',
        description: 'ID of the file to move.',
      },
      {
        name: 'targetFolderId',
        type: 'string',
        description: 'ID of the target folder.',
      },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_delete',
    domain: 'knowledge',
    action: 'file_delete',
    title: 'Delete File',
    description: 'Permanently delete a file from the knowledge base.',
    usage: 'When the user wants to remove a knowledge file.',
    requiredParams: [
      {
        name: 'fileId',
        type: 'string',
        description: 'ID of the file to delete.',
      },
    ],
    optionalParams: [],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },

  // ── schedule ─────────────────────────────────────────────────────────────
  {
    cardId: 'schedule.open',
    domain: 'schedule',
    action: 'open',
    title: 'Open Schedule Panel',
    description: 'Navigate to the scheduled tasks panel.',
    usage: 'When the user wants to view or manage scheduled tasks.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'schedule',
    relatedDomains: ['data', 'workflow'],
    dependencies: [],
  },
  {
    cardId: 'schedule.create',
    domain: 'schedule',
    action: 'create',
    title: 'Create Scheduled Task',
    description: 'Create a new scheduled task with a cron expression.',
    usage: 'When the user wants to set up a recurring task (e.g. daily data refresh).',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Display name for the scheduled task.',
      },
      {
        name: 'cron',
        type: 'string',
        description: 'Cron expression defining the schedule (e.g. "0 8 * * *").',
      },
      {
        name: 'workflowId',
        type: 'string',
        description: 'ID of the workflow to execute on schedule.',
      },
    ],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Optional description of the scheduled task.',
      },
      {
        name: 'enabled',
        type: 'boolean',
        description: 'Whether the schedule is active immediately. Defaults to true.',
      },
    ],
    riskLevel: 'medium',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: ['workflow', 'data'],
    dependencies: ['workflow.copilot_create'],
  },
  {
    cardId: 'schedule.update',
    domain: 'schedule',
    action: 'update',
    title: 'Update Scheduled Task',
    description: 'Modify an existing scheduled task.',
    usage: 'When the user wants to change the cron expression or settings of a schedule.',
    requiredParams: [
      {
        name: 'scheduleId',
        type: 'string',
        description: 'ID of the scheduled task to update.',
      },
    ],
    optionalParams: [
      {
        name: 'name',
        type: 'string',
        description: 'New display name.',
      },
      {
        name: 'cron',
        type: 'string',
        description: 'New cron expression.',
      },
      {
        name: 'enabled',
        type: 'boolean',
        description: 'Enable or disable the schedule.',
      },
    ],
    riskLevel: 'medium',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
  {
    cardId: 'schedule.delete',
    domain: 'schedule',
    action: 'delete',
    title: 'Delete Scheduled Task',
    description: 'Permanently remove a scheduled task.',
    usage: 'When the user wants to stop and remove a scheduled task.',
    requiredParams: [
      {
        name: 'scheduleId',
        type: 'string',
        description: 'ID of the scheduled task to delete.',
      },
    ],
    optionalParams: [],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: ['workflow'],
    dependencies: [],
  },

  // ── workflow ─────────────────────────────────────────────────────────────
  {
    cardId: 'workflow.copilot_create',
    domain: 'workflow',
    action: 'copilot_create',
    title: 'Create Workflow with Copilot',
    description: 'Launch the workflow copilot to design and create a new workflow.',
    usage: 'When the user wants to build a new data processing or analysis workflow.',
    requiredParams: [],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of what the workflow should do.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['data', 'schedule', 'template'],
    dependencies: [],
  },

  // ── template ─────────────────────────────────────────────────────────────
  {
    cardId: 'template.copilot_create',
    domain: 'template',
    action: 'copilot_create',
    title: 'Create Template with Copilot',
    description: 'Launch the template copilot to design a reusable workflow template.',
    usage:
      'When the user wants to create a reusable template from an existing workflow or from scratch.',
    requiredParams: [],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of what the template should contain.',
      },
      {
        name: 'workflowId',
        type: 'string',
        description: 'ID of an existing workflow to base the template on.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['workflow'],
    dependencies: ['workflow.copilot_create'],
  },
] as const;

// ---------------------------------------------------------------------------
// Index for fast lookup
// ---------------------------------------------------------------------------

const byId = new Map<string, UiActionCardDefinition>(catalog.map((def) => [def.cardId, def]));

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

function matchScore(def: UiActionCardDefinition, queryWords: string[]): number {
  // Empty query → base score so every card is reachable via domain-only search
  if (queryWords.length === 0) return 1;

  const fullId = def.cardId.toLowerCase();
  const title = def.title.toLowerCase();
  const action = def.action.toLowerCase();
  const usage = def.usage.toLowerCase();

  // Collect all param-related text for matching
  const paramText = [...def.requiredParams, ...def.optionalParams]
    .map((p) => `${p.name} ${p.description}`)
    .join(' ')
    .toLowerCase();

  let score = 0;

  // Exact cardId match → highest
  if (fullId === queryWords.join(' ')) {
    score += 100;
  }

  for (const word of queryWords) {
    if (word.length === 0) continue;
    const w = word.toLowerCase();
    if (fullId.includes(w)) score += 10;
    if (title.includes(w)) score += 8;
    if (action.includes(w)) score += 6;
    if (usage.includes(w)) score += 4;
    if (paramText.includes(w)) score += 2;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search the catalog by relevance score.
 *
 * @param query  Free-text query; words are matched against cardId, title,
 *               action, usage, and param fields.
 * @param options.domain  If provided, only cards from this domain are returned.
 * @param options.maxResults  Maximum number of results (default 5).
 */
export function searchCatalog(
  query: string,
  options?: { domain?: ActionDomain; maxResults?: number }
): UiActionCardDefinition[] {
  const domain = options?.domain;
  const maxResults = options?.maxResults ?? 5;

  const words = query.split(/\s+/).filter(Boolean);

  const scored = catalog
    .filter((def) => (domain ? def.domain === domain : true))
    .map((def) => ({ def, score: matchScore(def, words) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((entry) => entry.def);

  return scored;
}

/**
 * Look up a card definition by its exact cardId.
 * Returns `undefined` if the cardId is not found.
 */
export function getCardDefinition(cardId: string): UiActionCardDefinition | undefined {
  return byId.get(cardId);
}
