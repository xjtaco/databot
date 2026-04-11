import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAsyncAction } from '@/composables/useAsyncAction';

describe('useAsyncAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with isLoading false and error null', () => {
    const { isLoading, error } = useAsyncAction();

    expect(isLoading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  describe('wrapAction()', () => {
    it('should set isLoading to true during execution', async () => {
      const { isLoading, wrapAction } = useAsyncAction();
      let loadingDuringExec = false;

      const action = wrapAction(async () => {
        loadingDuringExec = isLoading.value;
      });

      await action();

      expect(loadingDuringExec).toBe(true);
      expect(isLoading.value).toBe(false);
    });

    it('should clear error before execution', async () => {
      const { error, wrapAction } = useAsyncAction();

      const failing = wrapAction(async () => {
        throw new Error('fail');
      });

      try {
        await failing();
      } catch {
        // expected
      }

      expect(error.value).toBe('fail');

      const passing = wrapAction(async () => {
        return 'ok';
      });

      let errorDuringExec: string | null = 'not-null';
      const checking = wrapAction(async () => {
        errorDuringExec = error.value;
      });

      await passing();
      expect(error.value).toBeNull();

      // Also verify error is cleared at the start
      error.value = 'stale error';
      await checking();
      expect(errorDuringExec).toBeNull();
    });

    it('should return the result of the wrapped function', async () => {
      const { wrapAction } = useAsyncAction();

      const action = wrapAction(async (x: number, y: number) => {
        return x + y;
      });

      const result = await action(3, 4);

      expect(result).toBe(7);
    });

    it('should pass arguments through to the wrapped function', async () => {
      const { wrapAction } = useAsyncAction();
      const fn = vi.fn(async (name: string, age: number) => ({ name, age }));
      const action = wrapAction(fn);

      await action('Alice', 30);

      expect(fn).toHaveBeenCalledWith('Alice', 30);
    });

    it('should set error message on Error throw', async () => {
      const { error, wrapAction } = useAsyncAction();

      const action = wrapAction(async () => {
        throw new Error('Something went wrong');
      });

      await expect(action()).rejects.toThrow('Something went wrong');
      expect(error.value).toBe('Something went wrong');
    });

    it('should stringify non-Error throws', async () => {
      const { error, wrapAction } = useAsyncAction();

      const action = wrapAction(async () => {
        throw 'string error';
      });

      await expect(action()).rejects.toBe('string error');
      expect(error.value).toBe('string error');
    });

    it('should re-throw the error', async () => {
      const { wrapAction } = useAsyncAction();
      const originalError = new Error('original');

      const action = wrapAction(async () => {
        throw originalError;
      });

      await expect(action()).rejects.toBe(originalError);
    });

    it('should set isLoading to false after error', async () => {
      const { isLoading, wrapAction } = useAsyncAction();

      const action = wrapAction(async () => {
        throw new Error('fail');
      });

      try {
        await action();
      } catch {
        // expected
      }

      expect(isLoading.value).toBe(false);
    });
  });
});
