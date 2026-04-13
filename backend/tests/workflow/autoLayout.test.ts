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

  it('orders a layer by upstream coordinates instead of ids', () => {
    const result = autoLayout(
      [
        { id: 'root' },
        { id: 'right-parent', positionX: 200 },
        { id: 'left-parent', positionX: -200 },
        { id: 'right-child' },
        { id: 'left-child' },
      ],
      [
        { sourceNodeId: 'root', targetNodeId: 'right-parent' },
        { sourceNodeId: 'root', targetNodeId: 'left-parent' },
        { sourceNodeId: 'right-parent', targetNodeId: 'right-child' },
        { sourceNodeId: 'left-parent', targetNodeId: 'left-child' },
      ]
    );

    const leftChild = result.positions.get('left-child');
    const rightChild = result.positions.get('right-child');

    expect(leftChild && rightChild).toBeTruthy();
    expect(leftChild!.y).toBe(rightChild!.y);
    expect(leftChild!.x).toBeLessThan(rightChild!.x);
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

  it('throws when an edge references an unknown node', () => {
    expect(() =>
      autoLayout([{ id: 'a' }], [{ sourceNodeId: 'a', targetNodeId: 'missing' }])
    ).toThrow('unknown node');
  });

  it('places disconnected nodes below the main connected graph', () => {
    const result = autoLayout(
      [{ id: 'start' }, { id: 'middle' }, { id: 'end' }, { id: 'orphan' }],
      [
        { sourceNodeId: 'start', targetNodeId: 'middle' },
        { sourceNodeId: 'middle', targetNodeId: 'end' },
      ]
    );

    const connectedMaxY = Math.max(
      result.positions.get('start')?.y ?? 0,
      result.positions.get('middle')?.y ?? 0,
      result.positions.get('end')?.y ?? 0
    );

    expect(result.positions.get('orphan')?.y).toBeGreaterThan(connectedMaxY);
  });

  it('places disconnected subgraphs in a secondary zone while preserving local flow order', () => {
    const result = autoLayout(
      [
        { id: 'main-start' },
        { id: 'main-end' },
        { id: 'secondary-start' },
        { id: 'secondary-end' },
      ],
      [
        { sourceNodeId: 'main-start', targetNodeId: 'main-end' },
        { sourceNodeId: 'secondary-start', targetNodeId: 'secondary-end' },
      ]
    );

    const mainEnd = result.positions.get('main-end');
    const secondaryStart = result.positions.get('secondary-start');
    const secondaryEnd = result.positions.get('secondary-end');

    expect(mainEnd && secondaryStart && secondaryEnd).toBeTruthy();
    expect(secondaryStart!.y).toBeGreaterThan(mainEnd!.y);
    expect(secondaryEnd!.y).toBeGreaterThan(secondaryStart!.y);
  });
});
