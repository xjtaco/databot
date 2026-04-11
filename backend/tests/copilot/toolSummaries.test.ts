import { describe, it, expect } from 'vitest';
import { buildToolStartSummary, buildToolDoneSummary } from '../../src/copilot/toolSummaries';

describe('toolSummaries', () => {
  describe('buildToolStartSummary', () => {
    it('returns Chinese summary for zh-CN locale', () => {
      const result = buildToolStartSummary('zh-CN', 'wf_get_node', {});
      expect(result).toBe('获取节点详情');
    });

    it('returns English summary for en-US locale', () => {
      const result = buildToolStartSummary('en-US', 'wf_get_node', {});
      expect(result).toBe('Getting node details');
    });

    it('interpolates args into Chinese summary', () => {
      const result = buildToolStartSummary('zh-CN', 'wf_update_node', { nodeId: 'node-1' });
      expect(result).toContain('node-1');
      expect(result).toContain('更新节点');
    });

    it('interpolates args into English summary', () => {
      const result = buildToolStartSummary('en-US', 'wf_update_node', { nodeId: 'node-1' });
      expect(result).toContain('node-1');
      expect(result).toContain('Updating node');
    });

    it('falls back to zh-CN for unknown locale', () => {
      const result = buildToolStartSummary('fr-FR', 'wf_get_node', {});
      expect(result).toBe('获取节点详情');
    });

    it('returns fallback for unknown tool name', () => {
      expect(buildToolStartSummary('zh-CN', 'unknown_tool', {})).toContain('执行');
      expect(buildToolStartSummary('en-US', 'unknown_tool', {})).toContain('Executing');
    });

    it('handles all tool names without errors for both locales', () => {
      const tools = [
        'wf_add_node',
        'wf_update_node',
        'wf_patch_node',
        'wf_delete_node',
        'wf_connect_nodes',
        'wf_disconnect_nodes',
        'wf_execute',
        'wf_execute_node',
        'wf_get_summary',
        'wf_get_node',
        'wf_get_upstream',
        'wf_get_downstream',
        'wf_get_run_result',
        'wf_search_custom_nodes',
        'scoped_glob',
        'scoped_grep',
        'scoped_read_file',
      ];
      for (const tool of tools) {
        expect(buildToolStartSummary('zh-CN', tool, {})).toBeTruthy();
        expect(buildToolStartSummary('en-US', tool, {})).toBeTruthy();
      }
    });
  });

  describe('buildToolDoneSummary', () => {
    it('returns Chinese done summary for zh-CN locale', () => {
      expect(buildToolDoneSummary('zh-CN', 'wf_update_node')).toBe('节点已更新');
    });

    it('returns English done summary for en-US locale', () => {
      expect(buildToolDoneSummary('en-US', 'wf_update_node')).toBe('Node updated');
    });

    it('returns error message on failure', () => {
      const result = buildToolDoneSummary('zh-CN', 'wf_update_node', {
        success: false,
        data: null,
        error: '连接失败',
      });
      expect(result).toBe('连接失败');
    });

    it('returns default failed message when no error string', () => {
      expect(buildToolDoneSummary('zh-CN', 'wf_update_node', { success: false, data: null })).toBe(
        '操作失败'
      );
      expect(buildToolDoneSummary('en-US', 'wf_update_node', { success: false, data: null })).toBe(
        'Operation failed'
      );
    });

    it('handles execution status in result data', () => {
      const completed = buildToolDoneSummary('zh-CN', 'wf_execute_node', {
        success: true,
        data: { status: 'completed' },
      });
      expect(completed).toBe('执行完成');

      const failed = buildToolDoneSummary('en-US', 'wf_execute_node', {
        success: true,
        data: { status: 'failed' },
      });
      expect(failed).toBe('Execution failed');
    });

    it('returns fallback for unknown tool name', () => {
      expect(buildToolDoneSummary('zh-CN', 'unknown_tool')).toBe('完成');
      expect(buildToolDoneSummary('en-US', 'unknown_tool')).toBe('Done');
    });
  });
});
