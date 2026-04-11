import { ref, type Ref } from 'vue';

interface AsyncActionState {
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
}

type AsyncFn<TArgs extends unknown[], TReturn> = (...args: TArgs) => Promise<TReturn>;

/**
 * Wraps an async function with automatic isLoading and error state management.
 * On error, sets `error` ref and re-throws.
 */
export function useAsyncAction(): AsyncActionState & {
  wrapAction: <TArgs extends unknown[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>
  ) => AsyncFn<TArgs, TReturn>;
} {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  function wrapAction<TArgs extends unknown[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>
  ): AsyncFn<TArgs, TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      isLoading.value = true;
      error.value = null;
      try {
        return await fn(...args);
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        isLoading.value = false;
      }
    };
  }

  return { isLoading, error, wrapAction };
}
