import { ref, onMounted, onUnmounted, computed } from 'vue';

const BREAKPOINT_MD = 768;
const DEBOUNCE_MS = 150;

export function useResponsive() {
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);

  const isMobile = computed(() => windowWidth.value < BREAKPOINT_MD);
  const isDesktop = computed(() => windowWidth.value >= BREAKPOINT_MD);

  let timer: ReturnType<typeof setTimeout> | null = null;

  function handleResize() {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      windowWidth.value = window.innerWidth;
      timer = null;
    }, DEBOUNCE_MS);
  }

  onMounted(() => {
    window.addEventListener('resize', handleResize);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (timer !== null) {
      clearTimeout(timer);
    }
  });

  return {
    windowWidth,
    isMobile,
    isDesktop,
    breakpointMd: BREAKPOINT_MD,
  };
}
