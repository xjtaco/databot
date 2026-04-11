const THEME_COLOR = '#0A0A0B';

let initialized = false;

function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLOR);
  }
  updateHljsTheme();
}

function updateHljsTheme(): void {
  const HLJS_LINK_ID = 'hljs-theme';
  let link = document.getElementById(HLJS_LINK_ID) as HTMLLinkElement | null;
  const href =
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';

  if (!link) {
    link = document.createElement('link');
    link.id = HLJS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  } else {
    link.href = href;
  }
}

export function useTheme() {
  function init(): void {
    if (initialized) return;
    initialized = true;
    applyTheme();
  }

  return {
    init,
  };
}
