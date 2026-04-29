import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { executeAction, getRegistry } from '@/components/chat/actionCards/actionCardRegistry';
import { useNavigationStore } from '@/stores/navigationStore';
import { i18n } from '@/locales';
import type { UiActionCardPayload } from '@/types/actionCard';

const {
  createTemplateMock,
  createWorkflowMock,
  listWorkflowsMock,
  listDatasourcesMock,
  listTablesMock,
  listFolderTreeMock,
  getFileContentMock,
  listSchedulesMock,
} = vi.hoisted(() => ({
  createTemplateMock: vi.fn(),
  createWorkflowMock: vi.fn(),
  listWorkflowsMock: vi.fn(),
  listDatasourcesMock: vi.fn(),
  listTablesMock: vi.fn(),
  listFolderTreeMock: vi.fn(),
  getFileContentMock: vi.fn(),
  listSchedulesMock: vi.fn(),
}));

vi.mock('@/api/workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/workflow')>();
  return {
    ...actual,
    createTemplate: createTemplateMock,
    createWorkflow: createWorkflowMock,
    listWorkflows: listWorkflowsMock,
  };
});

vi.mock('@/api/datafile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/datafile')>();
  return {
    ...actual,
    listDatasources: listDatasourcesMock,
    listTables: listTablesMock,
  };
});

vi.mock('@/api/knowledge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/knowledge')>();
  return {
    ...actual,
    listFolderTree: listFolderTreeMock,
    getFileContent: getFileContentMock,
  };
});

vi.mock('@/api/schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/schedule')>();
  return {
    ...actual,
    listSchedules: listSchedulesMock,
  };
});

function makePayload(overrides: Partial<UiActionCardPayload>): UiActionCardPayload {
  return {
    id: 'card-1',
    cardId: 'workflow.open',
    domain: 'workflow',
    action: 'open',
    title: 'Open Workflow Panel',
    summary: 'Navigate to workflow panel.',
    params: {},
    riskLevel: 'low',
    confirmRequired: false,
    executionMode: 'frontend',
    targetNav: 'workflow',
    ...overrides,
  };
}

describe('action card handlers', () => {
  beforeAll(async () => {
    getRegistry().clear();
    await import('@/components/chat/actionCards');
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    i18n.global.locale.value = 'en-US';
    createWorkflowMock.mockResolvedValue({
      id: 'workflow-1',
      name: 'New Workflow',
      description: null,
      nodes: [],
      edges: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    listWorkflowsMock.mockResolvedValue([
      {
        id: 'workflow-1',
        name: 'Daily ETL',
        description: null,
        nodeCount: 3,
        lastRunAt: '2026-01-01T00:00:00Z',
        lastRunStatus: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        creatorName: 'Alice',
      },
      {
        id: 'workflow-2',
        name: 'Monthly Report',
        description: 'Revenue report',
        nodeCount: 2,
        lastRunAt: null,
        lastRunStatus: null,
        createdAt: '2026-01-03T00:00:00Z',
        updatedAt: '2026-01-04T00:00:00Z',
        creatorName: null,
      },
    ]);
    listDatasourcesMock.mockResolvedValue({
      datasources: [
        {
          id: 'ds-1',
          name: 'Sales DB',
          type: 'mysql',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          tables: [],
        },
      ],
    });
    listTablesMock.mockResolvedValue({
      tables: [
        {
          id: 'table-1',
          displayName: 'orders',
          physicalName: 'orders',
          type: 'mysql',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    listFolderTreeMock.mockResolvedValue({
      folders: [
        {
          id: 'folder-1',
          name: 'Research',
          parentId: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          children: [],
          files: [
            {
              id: 'file-1',
              name: 'brief.md',
              folderId: 'folder-1',
              fileSize: 120,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
    });
    getFileContentMock.mockResolvedValue({
      file: {
        id: 'file-1',
        name: 'brief.md',
        folderId: 'folder-1',
        fileSize: 120,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      content: '# Brief\nKey research notes',
    });
    listSchedulesMock.mockResolvedValue([
      {
        id: 'schedule-1',
        name: 'Daily refresh',
        description: '',
        workflowId: 'workflow-1',
        workflowName: 'Daily ETL',
        scheduleType: 'daily',
        cronExpr: '0 8 * * *',
        timezone: 'Asia/Shanghai',
        enabled: true,
        lastRunId: null,
        lastRunStatus: null,
        lastRunAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        creatorName: null,
      },
    ]);
    createTemplateMock.mockResolvedValue({
      id: 'template-1',
      name: 'Reusable Node',
      description: null,
      type: 'llm',
      config: {
        nodeType: 'llm',
        params: {},
        prompt: '',
        outputVariable: 'result',
      },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      creatorName: null,
    });
  });

  it('registers data.open handler', () => {
    expect(getRegistry().has('data:open')).toBe(true);
  });

  it('registers knowledge.open handler', () => {
    expect(getRegistry().has('knowledge:open')).toBe(true);
  });

  it('registers schedule.open handler', () => {
    expect(getRegistry().has('schedule:open')).toBe(true);
  });

  it('registers workflow.copilot_create handler', () => {
    expect(getRegistry().has('workflow:copilot_create')).toBe(true);
  });

  it('registers template.copilot_create handler', () => {
    expect(getRegistry().has('template:copilot_create')).toBe(true);
  });

  it('registers datasource_test handler', () => {
    expect(getRegistry().has('data:datasource_test')).toBe(true);
  });

  it('registers datasource_delete handler', () => {
    expect(getRegistry().has('data:datasource_delete')).toBe(true);
  });

  it('registers knowledge.file_open handler', () => {
    expect(getRegistry().has('knowledge:file_open')).toBe(true);
  });

  it('registers backend-discoverable workflow handlers', () => {
    expect(getRegistry().has('workflow:open')).toBe(true);
    expect(getRegistry().has('workflow:template_node')).toBe(true);
    expect(getRegistry().has('workflow:template_etl')).toBe(true);
    expect(getRegistry().has('workflow:template_report')).toBe(true);
  });

  it('keeps non-editor list cards inside the chat and shows fetched results', async () => {
    const cases: Array<{
      cardId: string;
      domain: UiActionCardPayload['domain'];
      action: string;
      params?: Record<string, unknown>;
      expectedSnippets: string[];
    }> = [
      {
        cardId: 'workflow.open',
        domain: 'workflow',
        action: 'open',
        expectedSnippets: ['Workflows (2)', 'Daily ETL', '3 nodes', 'Monthly Report'],
      },
      {
        cardId: 'data.open',
        domain: 'data',
        action: 'open',
        expectedSnippets: ['Data sources (1)', 'Sales DB', 'Tables (1)', 'orders'],
      },
      {
        cardId: 'knowledge.open',
        domain: 'knowledge',
        action: 'open',
        expectedSnippets: ['Knowledge folders (1)', 'Research', 'Knowledge files (1)', 'brief.md'],
      },
      {
        cardId: 'schedule.open',
        domain: 'schedule',
        action: 'open',
        expectedSnippets: ['Scheduled tasks (1)', 'Daily refresh', 'Daily ETL', 'enabled'],
      },
      {
        cardId: 'data.datasource_test',
        domain: 'data',
        action: 'datasource_test',
        expectedSnippets: ['You can continue testing data source connections in this chat.'],
      },
      {
        cardId: 'knowledge.file_open',
        domain: 'knowledge',
        action: 'file_open',
        params: { fileId: 'file-1' },
        expectedSnippets: ['brief.md', '# Brief', 'Key research notes'],
      },
    ];

    for (const item of cases) {
      const navigationStore = useNavigationStore();
      navigationStore.navigateTo('chat');

      const result = await executeAction(
        makePayload({
          cardId: item.cardId,
          domain: item.domain,
          action: item.action,
          params: item.params ?? {},
        }),
        {
          setStatus: vi.fn(),
          setResult: vi.fn(),
          setError: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      for (const snippet of item.expectedSnippets) {
        expect(result.summary).toContain(snippet);
      }
      expect(navigationStore.activeNav).toBe('chat');
      expect(navigationStore.pendingIntent).toBeNull();
    }
  });

  it('keeps workflow.open inside chat when executed', async () => {
    const result = await executeAction(makePayload({ action: 'open' }), {
      setStatus: vi.fn(),
      setResult: vi.fn(),
      setError: vi.fn(),
    });

    const navigationStore = useNavigationStore();
    expect(result.success).toBe(true);
    expect(navigationStore.activeNav).toBe('chat');
  });

  it('returns localized workflow creation summaries', async () => {
    const result = await executeAction(
      makePayload({
        cardId: 'workflow.template_etl',
        action: 'template_etl',
        params: { name: 'Daily ETL' },
      }),
      {
        setStatus: vi.fn(),
        setResult: vi.fn(),
        setError: vi.fn(),
      }
    );

    expect(result.summary).toBe('Workflow created: Daily ETL');
  });

  it('marks workflow creation complete before leaving chat', async () => {
    const navigationStore = useNavigationStore();
    const setResult = vi.fn(() => {
      expect(navigationStore.activeNav).toBe('chat');
    });

    const result = await executeAction(
      makePayload({
        cardId: 'workflow.copilot_create',
        action: 'copilot_create',
        params: { name: 'Monthly Revenue' },
      }),
      {
        setStatus: vi.fn(),
        setResult,
        setError: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(setResult).toHaveBeenCalledWith('Workflow created: Monthly Revenue');
    expect(navigationStore.activeNav).toBe('workflow');
  });

  it('marks data source test complete without leaving chat', async () => {
    const navigationStore = useNavigationStore();
    const setResult = vi.fn();

    const result = await executeAction(
      makePayload({
        cardId: 'data.datasource_test',
        domain: 'data',
        action: 'datasource_test',
      }),
      {
        setStatus: vi.fn(),
        setResult,
        setError: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(setResult).toHaveBeenCalledWith(
      'You can continue testing data source connections in this chat.'
    );
    expect(navigationStore.activeNav).toBe('chat');
  });

  it('executes workflow.template_node by creating a template and opening it', async () => {
    const result = await executeAction(
      makePayload({
        cardId: 'workflow.template_node',
        action: 'template_node',
        params: {
          name: 'Reusable Node',
          description: 'Extract common logic',
          nodeType: 'python',
        },
        copilotPrompt: 'Build a reusable node',
      }),
      {
        setStatus: vi.fn(),
        setResult: vi.fn(),
        setError: vi.fn(),
      }
    );

    const navigationStore = useNavigationStore();
    expect(result.success).toBe(true);
    expect(createTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Reusable Node',
        description: 'Extract common logic',
        type: 'python',
      })
    );
    expect(navigationStore.pendingIntent).toEqual({
      type: 'open_template_editor',
      templateId: 'template-1',
      copilotPrompt: 'Build a reusable node',
    });
    expect(navigationStore.activeNav).toBe('workflow');
  });

  it('executes workflow template workflow cards by creating workflows and opening them', async () => {
    for (const action of ['template_etl', 'template_report']) {
      const result = await executeAction(
        makePayload({
          cardId: `workflow.${action}`,
          action,
          params: { name: `Workflow ${action}`, description: 'Generated from template' },
          copilotPrompt: `Create ${action}`,
        }),
        {
          setStatus: vi.fn(),
          setResult: vi.fn(),
          setError: vi.fn(),
        }
      );

      const navigationStore = useNavigationStore();
      expect(result.success).toBe(true);
      expect(navigationStore.pendingIntent).toEqual({
        type: 'open_workflow_editor',
        workflowId: 'workflow-1',
        copilotPrompt: `Create ${action}`,
      });
      expect(navigationStore.activeNav).toBe('workflow');
    }
    expect(createWorkflowMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT register handlers for form-based cards', () => {
    const formCards = [
      'data:datasource_create',
      'data:file_upload',
      'knowledge:folder_create',
      'knowledge:folder_rename',
      'knowledge:folder_move',
      'knowledge:folder_delete',
      'knowledge:file_create',
      'knowledge:file_upload',
      'knowledge:file_move',
      'knowledge:file_delete',
      'schedule:create',
      'schedule:update',
      'schedule:delete',
    ];
    for (const key of formCards) {
      expect(getRegistry().has(key)).toBe(false);
    }
  });
});
