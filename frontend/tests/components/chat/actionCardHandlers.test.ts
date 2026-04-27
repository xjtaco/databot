import { describe, it, expect, beforeAll } from 'vitest';
import { getRegistry } from '@/components/chat/actionCards/actionCardRegistry';

describe('first-version action handlers', () => {
  beforeAll(async () => {
    // Clear any previous registrations, then import handlers to trigger registration
    getRegistry().clear();
    await import('@/components/chat/actionCards');
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

  it('registers all stub handlers', () => {
    const expectedStubs = [
      'data:datasource_create',
      'data:datasource_test',
      'data:datasource_delete',
      'knowledge:folder_create',
      'knowledge:folder_rename',
      'knowledge:folder_move',
      'knowledge:folder_delete',
      'knowledge:file_open',
      'knowledge:file_move',
      'knowledge:file_delete',
      'schedule:create',
      'schedule:update',
      'schedule:delete',
    ];
    for (const key of expectedStubs) {
      expect(getRegistry().has(key)).toBe(true);
    }
  });
});
