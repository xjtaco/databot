import { ref, type Ref } from 'vue';

const SWIPE_THRESHOLD = 50;
const SWIPE_DETECT_THRESHOLD = 10;

interface SwipeGestureReturn {
  swipedId: Ref<string | null>;
  isSwiping: () => boolean;
  handlePointerDown: (event: PointerEvent, itemId: string) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
  resetSwipe: () => void;
}

/**
 * Composable for swipe-to-reveal-delete gesture on list items.
 * Handles pointer events, tracks swipe state, and exposes the currently swiped item ID.
 */
export function useSwipeGesture(): SwipeGestureReturn {
  const swipedId = ref<string | null>(null);

  let pointerStartX = 0;
  let pointerStartY = 0;
  let currentItemId: string | null = null;
  let swiping = false;
  let activePointerId: number | null = null;

  function handlePointerDown(event: PointerEvent, itemId: string): void {
    if (!event.isPrimary) return;

    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    currentItemId = itemId;
    activePointerId = event.pointerId;
    swiping = false;

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (currentItemId === null || event.pointerId !== activePointerId) return;

    const deltaX = pointerStartX - event.clientX;
    const deltaY = Math.abs(event.clientY - pointerStartY);

    // If vertical scroll is dominant, don't handle swipe
    if (deltaY > Math.abs(deltaX)) return;

    // Mark as swiping when horizontal movement exceeds threshold
    if (Math.abs(deltaX) > SWIPE_DETECT_THRESHOLD) {
      swiping = true;
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (currentItemId === null || event.pointerId !== activePointerId) return;

    const deltaX = pointerStartX - event.clientX;
    const isCurrentItemSwiped = swipedId.value === currentItemId;

    if (deltaX > SWIPE_THRESHOLD) {
      // Swipe left — reveal delete button
      swipedId.value = currentItemId;
    } else if (isCurrentItemSwiped && deltaX < -SWIPE_DETECT_THRESHOLD) {
      // Swipe right on already-swiped item — hide delete button
      swipedId.value = null;
    }

    currentItemId = null;
    activePointerId = null;
  }

  function isSwiping(): boolean {
    return swiping;
  }

  function resetSwipe(): void {
    swipedId.value = null;
    swiping = false;
  }

  return {
    swipedId,
    isSwiping,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetSwipe,
  };
}
