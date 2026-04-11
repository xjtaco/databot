import { describe, it, expect, beforeEach } from 'vitest';
import { renderMarkdown, getPlotlyChartData, clearPlotlyChartRegistry } from '@/utils/markdown';

describe('markdown - Plotly code block rendering', () => {
  beforeEach(() => {
    clearPlotlyChartRegistry();
  });

  it('should convert plotly code blocks to chart divs with data-plotly-id', () => {
    const json = '{"data":[{"type":"scatter","x":[1,2],"y":[3,4]}]}';
    const md = '```plotly\n' + json + '\n```';

    const html = renderMarkdown(md);

    expect(html).toContain('class="plotly-chart"');
    expect(html).toContain('data-plotly-id="plotly-chart-1"');
  });

  it('should store chart JSON in registry and retrieve it', () => {
    const json = '{"data":[{"type":"bar","x":["A"],"y":[10]}]}';
    const md = '```plotly\n' + json + '\n```';

    renderMarkdown(md);

    const stored = getPlotlyChartData('plotly-chart-1');
    expect(stored).toBe(json);
  });

  it('should assign unique IDs for multiple plotly blocks', () => {
    const json1 = '{"data":[{"type":"scatter"}]}';
    const json2 = '{"data":[{"type":"bar"}]}';
    const md = '```plotly\n' + json1 + '\n```\n\n```plotly\n' + json2 + '\n```';

    const html = renderMarkdown(md);

    expect(html).toContain('data-plotly-id="plotly-chart-1"');
    expect(html).toContain('data-plotly-id="plotly-chart-2"');
    expect(getPlotlyChartData('plotly-chart-1')).toBe(json1);
    expect(getPlotlyChartData('plotly-chart-2')).toBe(json2);
  });

  it('should reset IDs after clearing registry', () => {
    const json = '{"data":[{"type":"scatter"}]}';
    renderMarkdown('```plotly\n' + json + '\n```');
    expect(getPlotlyChartData('plotly-chart-1')).toBeDefined();

    clearPlotlyChartRegistry();

    expect(getPlotlyChartData('plotly-chart-1')).toBeUndefined();

    renderMarkdown('```plotly\n' + json + '\n```');
    expect(getPlotlyChartData('plotly-chart-1')).toBe(json);
  });

  it('should not affect non-plotly code blocks', () => {
    const md = '```javascript\nconsole.log("hello");\n```';

    const html = renderMarkdown(md);

    expect(html).not.toContain('plotly-chart');
    expect(html).toContain('class="language-javascript"');
  });

  it('should allow data-plotly-id through DOMPurify sanitization', () => {
    const json = '{"data":[{"type":"pie"}]}';
    const md = '```plotly\n' + json + '\n```';

    const html = renderMarkdown(md);

    // data-plotly-id should survive sanitization
    expect(html).toContain('data-plotly-id=');
  });

  it('should return undefined for non-existent chart ID', () => {
    expect(getPlotlyChartData('nonexistent')).toBeUndefined();
  });
});
