import { nextTick, watch, onBeforeUnmount, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getPlotlyChartData } from '@/utils/markdown';

export function usePlotlyRenderer(
  containerRef: Ref<HTMLElement | null>,
  renderedContent: Ref<string>
): void {
  const { t } = useI18n();
  const mountedElements: HTMLElement[] = [];

  async function mountPlotlyCharts(): Promise<void> {
    if (!containerRef.value) return;

    const chartDivs = containerRef.value.querySelectorAll<HTMLElement>('.plotly-chart');
    if (chartDivs.length === 0) return;

    let Plotly: typeof import('plotly.js-dist-min');
    try {
      Plotly = await import('plotly.js-dist-min');
    } catch (err) {
      console.error('Failed to load Plotly library:', err);
      for (const div of chartDivs) {
        if (!div.dataset.plotlyMounted) {
          div.innerHTML = `<div class="plotly-chart-error">${t('chat.chart.error')}</div>`;
        }
      }
      return;
    }

    for (const div of chartDivs) {
      if (div.dataset.plotlyMounted) continue;

      const chartId = div.dataset.plotlyId;
      if (!chartId) continue;

      const jsonStr = getPlotlyChartData(chartId);
      if (!jsonStr) continue;

      div.innerHTML = `<div class="plotly-chart-loading">${t('chat.chart.loading')}</div>`;

      try {
        const figure = JSON.parse(jsonStr) as {
          data: Record<string, unknown>[];
          layout?: Record<string, unknown>;
        };

        div.innerHTML = '';

        const layout = {
          ...figure.layout,
          autosize: true,
          font: { family: '"WenQuanYi Zen Hei", sans-serif' },
        };

        await Plotly.newPlot(div, figure.data, layout, {
          responsive: true,
          displaylogo: false,
        });

        div.dataset.plotlyMounted = 'true';
        mountedElements.push(div);
      } catch (err) {
        console.error(`Failed to render Plotly chart ${chartId}:`, err);
        div.innerHTML = `<div class="plotly-chart-error">${t('chat.chart.error')}</div>`;
      }
    }
  }

  watch(
    renderedContent,
    () => {
      void nextTick(() => mountPlotlyCharts());
    },
    { immediate: true }
  );

  // Also watch containerRef for cases where content is already complete
  // when the component mounts (e.g. outputMd messages added via addAssistantMessage).
  // The renderedContent watch fires during setup before DOM is ready,
  // so we need a second trigger once the ref is populated.
  watch(containerRef, (el) => {
    if (el) {
      void nextTick(() => mountPlotlyCharts());
    }
  });

  onBeforeUnmount(() => {
    void import('plotly.js-dist-min').then((Plotly) => {
      for (const el of mountedElements) {
        Plotly.purge(el);
      }
    });
  });
}
