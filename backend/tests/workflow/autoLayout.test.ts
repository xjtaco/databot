import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/workflow/layout/autoLayout';

describe('autoLayout', () => {
  it('simple chain has increasing Y order', () => {
    const result = autoLayout(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ]
    );

    expect(result.positions.get('a')?.y).toBeLessThan(result.positions.get('b')?.y ?? Infinity);
    expect(result.positions.get('b')?.y).toBeLessThan(result.positions.get('c')?.y ?? Infinity);
  });

  it('branch siblings spread horizontally with same Y', () => {
    const result = autoLayout(
      [{ id: 'start' }, { id: 'left' }, { id: 'right' }],
      [
        { sourceNodeId: 'start', targetNodeId: 'left' },
        { sourceNodeId: 'start', targetNodeId: 'right' },
      ]
    );

    expect(result.positions.get('left')?.y).toBe(result.positions.get('right')?.y);
    expect(result.positions.get('left')?.x).not.toBe(result.positions.get('right')?.x);
  });

  it('merge node sits below upstreams and near center', () => {
    const result = autoLayout(
      [{ id: 'start' }, { id: 'left' }, { id: 'right' }, { id: 'merge' }],
      [
        { sourceNodeId: 'start', targetNodeId: 'left' },
        { sourceNodeId: 'start', targetNodeId: 'right' },
        { sourceNodeId: 'left', targetNodeId: 'merge' },
        { sourceNodeId: 'right', targetNodeId: 'merge' },
      ]
    );

    const left = result.positions.get('left');
    const right = result.positions.get('right');
    const merge = result.positions.get('merge');

    expect(left && right && merge).toBeTruthy();
    expect(merge!.y).toBeGreaterThan(left!.y);
    expect(merge!.y).toBeGreaterThan(right!.y);
    expect(merge!.x).toBeCloseTo((left!.x + right!.x) / 2, 0);
  });
});
