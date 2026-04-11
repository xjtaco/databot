import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { ExportedWorkflow, ImportWorkflowResult } from '@/types/workflow';

vi.mock('@/api/workflow');

// Use vi.hoisted so these refs are available inside the vi.mock factory (which is hoisted)
const { mockFile, mockGenerateAsync, mockLoadAsync } = vi.hoisted(() => ({
  mockFile: vi.fn(),
  mockGenerateAsync: vi.fn(),
  mockLoadAsync: vi.fn(),
}));

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
      static loadAsync = mockLoadAsync;
    },
  };
});

describe('workflowStore import/export', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeExported = (name = 'Test'): ExportedWorkflow => ({
    name,
    description: null,
    nodes: [
      {
        name: 'sql_1',
        description: null,
        type: 'sql',
        config: { nodeType: 'sql', datasourceId: '', params: {}, sql: '', outputVariable: 'r' },
        positionX: 0,
        positionY: 0,
      },
    ],
    edges: [],
  });

  describe('batchExportWorkflows', () => {
    it('should download single JSON for one workflow', async () => {
      const store = useWorkflowStore();
      store.workflows = [
        {
          id: 'wf-1',
          name: 'My WF',
          description: null,
          nodeCount: 1,
          lastRunAt: null,
          lastRunStatus: null,
          createdAt: '',
          updatedAt: '',
          creatorName: null,
        },
      ];
      vi.mocked(workflowApi.exportWorkflow).mockResolvedValue(makeExported('My WF'));

      const mockClick = vi.fn();
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:url');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: mockClick,
        href: '',
        download: '',
      } as unknown as HTMLAnchorElement);

      await store.batchExportWorkflows(['wf-1']);

      expect(workflowApi.exportWorkflow).toHaveBeenCalledWith('wf-1');
      expect(mockClick).toHaveBeenCalled();
    });

    it('should create zip for multiple workflows', async () => {
      const store = useWorkflowStore();
      store.workflows = [
        {
          id: 'wf-1',
          name: 'WF1',
          description: null,
          nodeCount: 1,
          lastRunAt: null,
          lastRunStatus: null,
          createdAt: '',
          updatedAt: '',
          creatorName: null,
        },
        {
          id: 'wf-2',
          name: 'WF2',
          description: null,
          nodeCount: 1,
          lastRunAt: null,
          lastRunStatus: null,
          createdAt: '',
          updatedAt: '',
          creatorName: null,
        },
      ];
      vi.mocked(workflowApi.exportWorkflow)
        .mockResolvedValueOnce(makeExported('WF1'))
        .mockResolvedValueOnce(makeExported('WF2'));
      mockGenerateAsync.mockResolvedValue(new Blob());

      const mockClick = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:url'),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: mockClick,
        href: '',
        download: '',
      } as unknown as HTMLAnchorElement);

      await store.batchExportWorkflows(['wf-1', 'wf-2']);

      expect(mockFile).toHaveBeenCalledTimes(2);
      expect(mockFile).toHaveBeenCalledWith('WF1.json', expect.any(String));
      expect(mockFile).toHaveBeenCalledWith('WF2.json', expect.any(String));
      expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    });
  });

  describe('handleImportFile', () => {
    it('should import single JSON file', async () => {
      const store = useWorkflowStore();
      const exported = makeExported('Imported');
      const importResult: ImportWorkflowResult = { id: 'wf-new', name: 'Imported', renamed: false };

      vi.mocked(workflowApi.importWorkflow).mockResolvedValue(importResult);
      vi.mocked(workflowApi.listWorkflows).mockResolvedValue([]);

      const fileContent = JSON.stringify(exported);
      const file = new File([fileContent], 'workflow.json', { type: 'application/json' });
      // jsdom does not implement Blob.prototype.text — patch the prototype temporarily
      const originalText = Blob.prototype.text;
      Blob.prototype.text = function () {
        return Promise.resolve(fileContent);
      };
      const results = await store.handleImportFile(file);
      Blob.prototype.text = originalText;

      expect(results).toHaveLength(1);
      expect(results[0].originalName).toBe('Imported');
      expect(results[0].result).toEqual(importResult);
    });

    it('should collect errors without throwing for partial failures', async () => {
      const store = useWorkflowStore();

      mockLoadAsync.mockResolvedValue({
        files: {
          'a.json': {
            dir: false,
            async: vi.fn().mockResolvedValue(JSON.stringify(makeExported('A'))),
          },
          'b.json': {
            dir: false,
            async: vi.fn().mockResolvedValue(JSON.stringify(makeExported('B'))),
          },
        },
      });

      vi.mocked(workflowApi.importWorkflow)
        .mockResolvedValueOnce({ id: 'wf-1', name: 'A', renamed: false })
        .mockRejectedValueOnce(new Error('Server error'));
      vi.mocked(workflowApi.listWorkflows).mockResolvedValue([]);

      const file = new File([], 'batch.zip');
      Object.defineProperty(file, 'name', { value: 'batch.zip' });
      const results = await store.handleImportFile(file);

      expect(results).toHaveLength(2);
      expect(results[0].result).toBeDefined();
      expect(results[1].error).toBe('Server error');
    });

    it('should throw for invalid file format', async () => {
      const store = useWorkflowStore();
      const file = new File([], 'data.csv');
      Object.defineProperty(file, 'name', { value: 'data.csv' });

      await expect(store.handleImportFile(file)).rejects.toThrow('invalid_format');
    });
  });
});
