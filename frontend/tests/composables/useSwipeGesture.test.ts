import { describe, it, expect, afterEach } from 'vitest';
import { useSwipeGesture } from '@/composables/useSwipeGesture';

function createPointerEvent(type: string, overrides: Partial<PointerEvent> = {}): PointerEvent {
  const captured = { value: false };
  return {
    type,
    isPrimary: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    target: {
      setPointerCapture: () => {
        captured.value = true;
      },
    } as unknown as EventTarget,
    ...overrides,
  } as unknown as PointerEvent;
}

describe('useSwipeGesture', () => {
  afterEach(() => {
    // Each test creates a fresh instance so no shared cleanup needed
  });

  it('should initialize with null swipedId and not swiping', () => {
    const { swipedId, isSwiping } = useSwipeGesture();

    expect(swipedId.value).toBeNull();
    expect(isSwiping()).toBe(false);
  });

  describe('swipe left to reveal', () => {
    it('should set swipedId when swiped left beyond threshold', () => {
      const { swipedId, handlePointerDown, handlePointerMove, handlePointerUp } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 140, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 140, clientY: 100 }));

      expect(swipedId.value).toBe('item-1');
    });

    it('should not set swipedId when swipe is below threshold', () => {
      const { swipedId, handlePointerDown, handlePointerMove, handlePointerUp } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 180, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 180, clientY: 100 }));

      expect(swipedId.value).toBeNull();
    });
  });

  describe('swipe right to dismiss', () => {
    it('should clear swipedId when swiping right on already-swiped item', () => {
      const { swipedId, handlePointerDown, handlePointerMove, handlePointerUp } = useSwipeGesture();

      // First, swipe left to reveal
      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 140, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 140, clientY: 100 }));
      expect(swipedId.value).toBe('item-1');

      // Then, swipe right to dismiss
      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 120, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 120, clientY: 100 }));

      expect(swipedId.value).toBeNull();
    });
  });

  describe('isSwiping()', () => {
    it('should return true during horizontal movement', () => {
      const { isSwiping, handlePointerDown, handlePointerMove } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 180, clientY: 100 }));

      expect(isSwiping()).toBe(true);
    });

    it('should not flag as swiping for vertical scroll', () => {
      const { isSwiping, handlePointerDown, handlePointerMove } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      // Vertical movement is dominant
      handlePointerMove(createPointerEvent('pointermove', { clientX: 198, clientY: 150 }));

      expect(isSwiping()).toBe(false);
    });
  });

  describe('non-primary pointer', () => {
    it('should ignore non-primary pointer events', () => {
      const { swipedId, handlePointerDown, handlePointerUp } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100, isPrimary: false }),
        'item-1'
      );
      handlePointerUp(
        createPointerEvent('pointerup', { clientX: 100, clientY: 100, isPrimary: false })
      );

      expect(swipedId.value).toBeNull();
    });
  });

  describe('different pointer IDs', () => {
    it('should ignore move/up from different pointer than the started one', () => {
      const { swipedId, handlePointerDown, handlePointerMove, handlePointerUp } = useSwipeGesture();

      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }),
        'item-1'
      );
      handlePointerMove(
        createPointerEvent('pointermove', { clientX: 140, clientY: 100, pointerId: 2 })
      );
      handlePointerUp(
        createPointerEvent('pointerup', { clientX: 140, clientY: 100, pointerId: 2 })
      );

      expect(swipedId.value).toBeNull();
    });
  });

  describe('resetSwipe()', () => {
    it('should clear swipedId and swiping state', () => {
      const {
        swipedId,
        isSwiping,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        resetSwipe,
      } = useSwipeGesture();

      // Create a swiped state
      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 140, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 140, clientY: 100 }));
      expect(swipedId.value).toBe('item-1');

      resetSwipe();

      expect(swipedId.value).toBeNull();
      expect(isSwiping()).toBe(false);
    });
  });

  describe('replacing swiped item', () => {
    it('should replace swipedId when swiping a different item', () => {
      const { swipedId, handlePointerDown, handlePointerMove, handlePointerUp } = useSwipeGesture();

      // Swipe item-1
      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }),
        'item-1'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 140, clientY: 100 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 140, clientY: 100 }));
      expect(swipedId.value).toBe('item-1');

      // Swipe item-2
      handlePointerDown(
        createPointerEvent('pointerdown', { clientX: 200, clientY: 200 }),
        'item-2'
      );
      handlePointerMove(createPointerEvent('pointermove', { clientX: 140, clientY: 200 }));
      handlePointerUp(createPointerEvent('pointerup', { clientX: 140, clientY: 200 }));
      expect(swipedId.value).toBe('item-2');
    });
  });
});
