import type { ActionDomain, UiActionCardDefinition } from './uiActionCardTypes';

// ---------------------------------------------------------------------------
// In-memory catalog – single source of truth for all UI action cards
// ---------------------------------------------------------------------------

type ActionCardPresentationMetadata = Pick<
  UiActionCardDefinition,
  'presentationMode' | 'confirmationMode' | 'titleKey' | 'summaryKey'
>;

type UiActionCardCatalogEntry = Omit<UiActionCardDefinition, keyof ActionCardPresentationMetadata>;

const cardPresentationMetadata = {
  'data.open': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.data.open.title',
    summaryKey: 'chat.actionCards.data.open.summary',
  },
  'data.datasource_create': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.data.datasourceCreate.title',
    summaryKey: 'chat.actionCards.data.datasourceCreate.summary',
  },
  'data.datasource_test': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.data.datasourceTest.title',
    summaryKey: 'chat.actionCards.data.datasourceTest.summary',
  },
  'data.datasource_delete': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.data.datasourceDelete.title',
    summaryKey: 'chat.actionCards.data.datasourceDelete.summary',
  },
  'data.file_upload': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.data.fileUpload.title',
    summaryKey: 'chat.actionCards.data.fileUpload.summary',
  },
  'knowledge.open': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.open.title',
    summaryKey: 'chat.actionCards.knowledge.open.summary',
  },
  'knowledge.folder_create': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.knowledge.folderCreate.title',
    summaryKey: 'chat.actionCards.knowledge.folderCreate.summary',
  },
  'knowledge.folder_rename': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.folderRename.title',
    summaryKey: 'chat.actionCards.knowledge.folderRename.summary',
  },
  'knowledge.folder_move': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.folderMove.title',
    summaryKey: 'chat.actionCards.knowledge.folderMove.summary',
  },
  'knowledge.folder_delete': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.knowledge.folderDelete.title',
    summaryKey: 'chat.actionCards.knowledge.folderDelete.summary',
  },
  'knowledge.file_open': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.fileOpen.title',
    summaryKey: 'chat.actionCards.knowledge.fileOpen.summary',
  },
  'knowledge.file_create': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.knowledge.fileCreate.title',
    summaryKey: 'chat.actionCards.knowledge.fileCreate.summary',
  },
  'knowledge.file_upload': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.fileUpload.title',
    summaryKey: 'chat.actionCards.knowledge.fileUpload.summary',
  },
  'knowledge.file_move': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.knowledge.fileMove.title',
    summaryKey: 'chat.actionCards.knowledge.fileMove.summary',
  },
  'knowledge.file_delete': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.knowledge.fileDelete.title',
    summaryKey: 'chat.actionCards.knowledge.fileDelete.summary',
  },
  'schedule.open': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.schedule.open.title',
    summaryKey: 'chat.actionCards.schedule.open.summary',
  },
  'schedule.create': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.schedule.create.title',
    summaryKey: 'chat.actionCards.schedule.create.summary',
  },
  'schedule.update': {
    presentationMode: 'inline_form',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.schedule.update.title',
    summaryKey: 'chat.actionCards.schedule.update.summary',
  },
  'schedule.delete': {
    presentationMode: 'inline_form',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.schedule.delete.title',
    summaryKey: 'chat.actionCards.schedule.delete.summary',
  },
  'workflow.open': {
    presentationMode: 'in_chat',
    confirmationMode: 'none',
    titleKey: 'chat.actionCards.workflow.open.title',
    summaryKey: 'chat.actionCards.workflow.open.summary',
  },
  'workflow.copilot_create': {
    presentationMode: 'deferred_navigation',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.workflow.copilotCreate.title',
    summaryKey: 'chat.actionCards.workflow.copilotCreate.summary',
  },
  'workflow.template_node': {
    presentationMode: 'deferred_navigation',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.workflow.templateNode.title',
    summaryKey: 'chat.actionCards.workflow.templateNode.summary',
  },
  'workflow.template_etl': {
    presentationMode: 'deferred_navigation',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.workflow.templateEtl.title',
    summaryKey: 'chat.actionCards.workflow.templateEtl.summary',
  },
  'workflow.template_report': {
    presentationMode: 'deferred_navigation',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.workflow.templateReport.title',
    summaryKey: 'chat.actionCards.workflow.templateReport.summary',
  },
  'template.copilot_create': {
    presentationMode: 'deferred_navigation',
    confirmationMode: 'modal',
    titleKey: 'chat.actionCards.template.copilotCreate.title',
    summaryKey: 'chat.actionCards.template.copilotCreate.summary',
  },
} satisfies Record<string, ActionCardPresentationMetadata>;

const presentationMetadataByCardId: Record<string, ActionCardPresentationMetadata> =
  cardPresentationMetadata;

const baseCatalog: readonly UiActionCardCatalogEntry[] = [
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
  {
    cardId: 'data.file_upload',
    domain: 'data',
    action: 'file_upload',
    title: 'Upload Data File',
    description: 'Upload a CSV, Excel, or SQLite file as a data source.',
    usage: 'When the user wants to upload a data file (CSV, Excel, SQLite) for analysis.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
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
    cardId: 'knowledge.file_create',
    domain: 'knowledge',
    action: 'file_create',
    title: 'Create Knowledge File',
    description: 'Create a new Markdown file in the knowledge base.',
    usage: 'When the user wants to create or write a new knowledge file.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Name of the file to create.',
      },
    ],
    optionalParams: [
      {
        name: 'folderId',
        type: 'string',
        description: 'Target folder ID. If omitted, creates at root.',
      },
      {
        name: 'content',
        type: 'string',
        description: 'Initial Markdown content.',
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
    cardId: 'knowledge.file_upload',
    domain: 'knowledge',
    action: 'file_upload',
    title: 'Upload Knowledge File',
    description: 'Upload a Markdown file to the knowledge base.',
    usage: 'When the user wants to add a Markdown file to the knowledge base.',
    requiredParams: [],
    optionalParams: [
      {
        name: 'folderId',
        type: 'string',
        description: 'Target folder ID. If omitted, user selects folder.',
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
        name: 'workflowId',
        type: 'string',
        description: 'ID of the workflow to execute on schedule.',
      },
    ],
    optionalParams: [
      {
        name: 'cronExpression',
        type: 'string',
        description: 'Cron expression defining the schedule (e.g. "0 8 * * *").',
      },
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
    riskLevel: 'high',
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
    cardId: 'workflow.open',
    domain: 'workflow',
    action: 'open',
    title: 'Open Workflow Panel',
    description: 'Navigate to the workflow panel to browse and manage workflows.',
    usage: 'When the user wants to view or manage workflows.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['data', 'schedule', 'template'],
    dependencies: [],
  },
  {
    cardId: 'workflow.copilot_create',
    domain: 'workflow',
    action: 'copilot_create',
    title: 'Create Workflow with Copilot',
    description: 'Launch the workflow copilot to design and create a new workflow.',
    usage: 'When the user wants to build a new data processing or analysis workflow.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Workflow name',
      },
    ],
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
  {
    cardId: 'workflow.template_node',
    domain: 'workflow',
    action: 'template_node',
    title: 'Create Node Template Workflow',
    description: 'Open the workflow editor with a node template creation flow.',
    usage: 'When the user wants to create a reusable node template or custom workflow node.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Template or workflow name.',
      },
    ],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of the template to create.',
      },
      {
        name: 'copilotPrompt',
        type: 'string',
        description: 'Prompt to send to Copilot after navigation.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['template'],
    dependencies: [],
  },
  {
    cardId: 'workflow.template_etl',
    domain: 'workflow',
    action: 'template_etl',
    title: 'Create ETL Workflow from Template',
    description: 'Open the workflow editor with an ETL template creation flow.',
    usage: 'When the user wants to create an ETL, data pipeline, or data processing workflow.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Workflow name.',
      },
    ],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of the ETL workflow.',
      },
      {
        name: 'copilotPrompt',
        type: 'string',
        description: 'Prompt to send to Copilot after navigation.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['data', 'schedule'],
    dependencies: [],
  },
  {
    cardId: 'workflow.template_report',
    domain: 'workflow',
    action: 'template_report',
    title: 'Create Report Workflow from Template',
    description: 'Open the workflow editor with a report template creation flow.',
    usage: 'When the user wants to create a reporting or dashboard generation workflow.',
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Workflow name.',
      },
    ],
    optionalParams: [
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of the report workflow.',
      },
      {
        name: 'copilotPrompt',
        type: 'string',
        description: 'Prompt to send to Copilot after navigation.',
      },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['data', 'schedule'],
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
    requiredParams: [
      {
        name: 'name',
        type: 'string',
        description: 'Template name',
      },
    ],
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

const catalog: readonly UiActionCardDefinition[] = baseCatalog.map((entry) => {
  const metadata = presentationMetadataByCardId[entry.cardId];
  if (!metadata) {
    throw new Error(`Missing action-card presentation metadata: ${entry.cardId}`);
  }

  return {
    ...entry,
    ...metadata,
  };
});

// ---------------------------------------------------------------------------
// Index for fast lookup
// ---------------------------------------------------------------------------

const byId = new Map<string, UiActionCardDefinition>(catalog.map((def) => [def.cardId, def]));

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

export type SearchQueryMode = 'text' | 'regex';

function buildSearchableText(def: UiActionCardDefinition): string {
  const paramText = [...def.requiredParams, ...def.optionalParams]
    .map((p) => `${p.name} ${p.description}`)
    .join(' ');

  return [
    def.cardId,
    def.domain,
    def.action,
    def.title,
    def.description,
    def.usage,
    paramText,
  ].join(' ');
}

function textMatchScore(def: UiActionCardDefinition, queryWords: string[]): number {
  // Empty query → base score so every card is reachable via domain-only search
  if (queryWords.length === 0) return 1;

  const fullId = def.cardId.toLowerCase();
  const title = def.title.toLowerCase();
  const action = def.action.toLowerCase();
  const description = def.description.toLowerCase();
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
    if (description.includes(w)) score += 5;
    if (usage.includes(w)) score += 4;
    if (paramText.includes(w)) score += 2;
  }

  return score;
}

function regexMatchScore(def: UiActionCardDefinition, regex: RegExp): number {
  const searchableText = buildSearchableText(def);
  const matches = searchableText.match(regex);
  return matches ? matches.length : 0;
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
 * @param options.queryMode  Use `regex` to match query as a JavaScript regular expression.
 * @param options.maxResults  Maximum number of results (default 5).
 */
export function searchCatalog(
  query: string,
  options?: { domain?: ActionDomain; queryMode?: SearchQueryMode; maxResults?: number }
): UiActionCardDefinition[] {
  const domain = options?.domain;
  const queryMode = options?.queryMode ?? 'text';
  const maxResults = options?.maxResults ?? 5;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const regex = queryMode === 'regex' ? new RegExp(query, 'gi') : null;

  const scored = catalog
    .filter((def) => (domain ? def.domain === domain : true))
    .map((def) => ({
      def,
      score: regex ? regexMatchScore(def, regex) : textMatchScore(def, words),
    }))
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
