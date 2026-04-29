import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { withSetup } from '../setup';
import { useChat } from '@/composables/useChat';
import { useChatStore } from '@/stores/chatStore';
import type { UiActionCardPayload } from '@/types/actionCard';

function createMockWebSocket() {
  const handlers: Array<(msg: unknown) => void> = [];
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((handler: (msg: unknown) => void) => handlers.push(handler)),
    offMessage: vi.fn(),
    setToken: vi.fn(),
    reconnectWithUrl: vi.fn(),
    simulateMessage(msg: unknown) {
      handlers.forEach((h) => h(msg));
    },
  };
}

describe('useChat action_card handling', () => {
  let mockWs: ReturnType<typeof createMockWebSocket>;
  let unmount: () => void;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockWs = createMockWebSocket();
  });

  afterEach(() => {
    unmount?.();
  });

  it('adds action card to chat store when action_card message received', () => {
    const result = withSetup(() => useChat({ websocket: mockWs as never }));
    unmount = result.unmount;
    const chatStore = useChatStore();
    chatStore.startAssistantMessage();

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
      presentationMode: 'resource_list',
      resourceSections: [
        {
          resourceType: 'datasource',
          titleKey: 'chat.actionCards.resource.datasource.sectionTitle',
          emptyKey: 'chat.actionCards.resource.datasource.empty',
          allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
        },
        {
          resourceType: 'table',
          titleKey: 'chat.actionCards.resource.table.sectionTitle',
          emptyKey: 'chat.actionCards.resource.table.empty',
          allowedActions: [
            { key: 'view' },
            { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
          ],
        },
      ],
    };

    mockWs.simulateMessage({
      type: 'action_card',
      timestamp: Date.now(),
      data: payload,
    });

    const msg = chatStore.messages[chatStore.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].payload.id).toBe('card-1');
    expect(msg.actionCards![0].payload.presentationMode).toBe('resource_list');
    expect(
      msg.actionCards![0].payload.resourceSections?.map((section) => section.resourceType)
    ).toEqual(['datasource', 'table']);
  });

  it('preserves current delete action cards as resource lists without id parameters', () => {
    const result = withSetup(() => useChat({ websocket: mockWs as never }));
    unmount = result.unmount;
    const chatStore = useChatStore();
    chatStore.startAssistantMessage();

    const deletePayloads: UiActionCardPayload[] = [
      {
        id: 'datasource-delete-card',
        cardId: 'data.datasource_delete',
        domain: 'data',
        action: 'datasource_delete',
        title: 'Delete data source',
        summary: 'Choose a data source to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'datasource',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'table-delete-card',
        cardId: 'data.table_delete',
        domain: 'data',
        action: 'table_delete',
        title: 'Delete table',
        summary: 'Choose a table to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'table',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'workflow-delete-card',
        cardId: 'workflow.delete',
        domain: 'workflow',
        action: 'delete',
        title: 'Delete workflow',
        summary: 'Choose a workflow to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'workflow',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'template-delete-card',
        cardId: 'template.delete',
        domain: 'template',
        action: 'delete',
        title: 'Delete template',
        summary: 'Choose a template to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'template',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'folder-delete-card',
        cardId: 'knowledge.folder_delete',
        domain: 'knowledge',
        action: 'folder_delete',
        title: 'Delete folder',
        summary: 'Choose a folder to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'knowledge_folder',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'file-delete-card',
        cardId: 'knowledge.file_delete',
        domain: 'knowledge',
        action: 'file_delete',
        title: 'Delete file',
        summary: 'Choose a file to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'knowledge_file',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
      {
        id: 'schedule-delete-card',
        cardId: 'schedule.delete',
        domain: 'schedule',
        action: 'delete',
        title: 'Delete schedule',
        summary: 'Choose a schedule to delete',
        params: {},
        riskLevel: 'danger',
        confirmRequired: true,
        executionMode: 'frontend',
        presentationMode: 'resource_list',
        resourceType: 'schedule',
        allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
      },
    ];

    for (const payload of deletePayloads) {
      mockWs.simulateMessage({
        type: 'action_card',
        timestamp: Date.now(),
        data: payload,
      });
    }

    const msg = chatStore.messages[chatStore.messages.length - 1];
    expect(msg.actionCards).toHaveLength(deletePayloads.length);
    expect(
      msg.actionCards?.every((card) => card.payload.presentationMode === 'resource_list')
    ).toBe(true);
    expect(msg.actionCards?.every((card) => Object.keys(card.payload.params).length === 0)).toBe(
      true
    );
    expect(
      msg.actionCards?.every((card) => card.payload.allowedActions?.[0]?.key === 'delete')
    ).toBe(true);
  });
});
