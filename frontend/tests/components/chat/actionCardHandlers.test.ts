import { describe, it, expect, beforeAll } from 'vitest';
import { getRegistry } from '@/components/chat/actionCards/actionCardRegistry';

describe('action card handlers', () => {
  beforeAll(async () => {
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

  it('registers datasource_test handler', () => {
    expect(getRegistry().has('data:datasource_test')).toBe(true);
  });

  it('registers datasource_delete handler', () => {
    expect(getRegistry().has('data:datasource_delete')).toBe(true);
  });

  it('registers knowledge.file_open handler', () => {
    expect(getRegistry().has('knowledge:file_open')).toBe(true);
  });

  it('does NOT register handlers for form-based cards', () => {
    const formCards = [
      'data:datasource_create',
      'data:file_upload',
      'knowledge:folder_create',
      'knowledge:folder_rename',
      'knowledge:folder_move',
      'knowledge:folder_delete',
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
