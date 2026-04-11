import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

/**
 * Registry for Plotly chart JSON data, keyed by unique chart ID.
 * Entries are created during markdown rendering and consumed by usePlotlyRenderer.
 */
const plotlyChartRegistry = new Map<string, string>();
let plotlyIdCounter = 0;

export function getPlotlyChartData(id: string): string | undefined {
  return plotlyChartRegistry.get(id);
}

export function clearPlotlyChartRegistry(): void {
  plotlyChartRegistry.clear();
  plotlyIdCounter = 0;
}

/**
 * Configure marked with syntax highlighting
 */
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Custom renderer for code blocks with syntax highlighting
 */
const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  if (lang === 'plotly') {
    const chartId = `plotly-chart-${++plotlyIdCounter}`;
    plotlyChartRegistry.set(chartId, text);
    return `<div class="plotly-chart" data-plotly-id="${chartId}"></div>`;
  }
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre class="hljs"><code class="language-${language}">${highlighted}</code></pre>`;
};

marked.use({ renderer });

/**
 * Render markdown content to HTML
 */
export function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-plotly-id'],
  });
}

/**
 * Escape HTML entities for safe display
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
