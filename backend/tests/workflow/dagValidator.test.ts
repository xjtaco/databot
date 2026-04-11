import { describe, it, expect } from 'vitest';
import { validateDag, topologicalSort, getUpstreamNodes } from '../../src/workflow/dagValidator';
import { WorkflowCycleDetectedError } from '../../src/errors/types';

describe('dagValidator', () => {
  describe('topologicalSort', () => {
    it('should return single node for graph with one node', () => {
      const result = topologicalSort([{ id: 'a' }], []);
      expect(result).toEqual(['a']);
    });

    it('should return nodes in correct order for linear chain', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ];
      const result = topologicalSort(nodes, edges);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle diamond DAG (A -> B, A -> C, B -> D, C -> D)', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'a', targetNodeId: 'c' },
        { sourceNodeId: 'b', targetNodeId: 'd' },
        { sourceNodeId: 'c', targetNodeId: 'd' },
      ];
      const result = topologicalSort(nodes, edges);
      expect(result[0]).toBe('a');
      expect(result[3]).toBe('d');
      expect(result.indexOf('b')).toBeLessThan(result.indexOf('d'));
      expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
    });

    it('should handle disconnected nodes', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [{ sourceNodeId: 'a', targetNodeId: 'b' }];
      const result = topologicalSort(nodes, edges);
      expect(result).toHaveLength(3);
      expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
      expect(result).toContain('c');
    });

    it('should return empty array for empty graph', () => {
      const result = topologicalSort([], []);
      expect(result).toEqual([]);
    });

    it('should throw WorkflowCycleDetectedError for simple cycle', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'a' },
      ];
      expect(() => topologicalSort(nodes, edges)).toThrow(WorkflowCycleDetectedError);
    });

    it('should throw WorkflowCycleDetectedError for self-loop', () => {
      const nodes = [{ id: 'a' }];
      const edges = [{ sourceNodeId: 'a', targetNodeId: 'a' }];
      expect(() => topologicalSort(nodes, edges)).toThrow(WorkflowCycleDetectedError);
    });

    it('should throw WorkflowCycleDetectedError for 3-node cycle', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
        { sourceNodeId: 'c', targetNodeId: 'a' },
      ];
      expect(() => topologicalSort(nodes, edges)).toThrow(WorkflowCycleDetectedError);
    });

    it('should ignore edges referencing non-existent nodes', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'x', targetNodeId: 'y' },
      ];
      const result = topologicalSort(nodes, edges);
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('validateDag', () => {
    it('should not throw for valid DAG', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [{ sourceNodeId: 'a', targetNodeId: 'b' }];
      expect(() => validateDag(nodes, edges)).not.toThrow();
    });

    it('should throw for cyclic graph', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'a' },
      ];
      expect(() => validateDag(nodes, edges)).toThrow(WorkflowCycleDetectedError);
    });
  });

  describe('getUpstreamNodes', () => {
    it('should return only the target node if it has no upstream', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [{ sourceNodeId: 'a', targetNodeId: 'b' }];
      const result = getUpstreamNodes('a', nodes, edges);
      expect(result).toEqual(['a']);
    });

    it('should return upstream chain in topological order', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ];
      const result = getUpstreamNodes('c', nodes, edges);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should return only relevant subgraph', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'c' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
        { sourceNodeId: 'c', targetNodeId: 'd' },
      ];
      // Getting upstream of 'c' should include a, b, c but not d
      const result = getUpstreamNodes('c', nodes, edges);
      expect(result).toHaveLength(3);
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result[result.length - 1]).toBe('c');
      expect(result).not.toContain('d');
    });

    it('should return empty for non-existent node', () => {
      const nodes = [{ id: 'a' }];
      const result = getUpstreamNodes('nonexistent', nodes, []);
      expect(result).toEqual([]);
    });

    it('should handle diamond upstream', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
      const edges = [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'a', targetNodeId: 'c' },
        { sourceNodeId: 'b', targetNodeId: 'd' },
        { sourceNodeId: 'c', targetNodeId: 'd' },
      ];
      const result = getUpstreamNodes('d', nodes, edges);
      expect(result).toHaveLength(4);
      expect(result[0]).toBe('a');
      expect(result[result.length - 1]).toBe('d');
    });
  });
});
