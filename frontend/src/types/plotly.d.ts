declare module 'plotly.js-dist-min' {
  interface PlotlyHTMLElement extends HTMLElement {
    data: PlotData[];
    layout: Partial<PlotLayout>;
  }

  interface PlotData {
    type?: string;
    x?: unknown[];
    y?: unknown[];
    z?: unknown[];
    text?: string | string[];
    name?: string;
    mode?: string;
    marker?: Record<string, unknown>;
    line?: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface PlotLayout {
    title?: string | { text: string; [key: string]: unknown };
    xaxis?: Record<string, unknown>;
    yaxis?: Record<string, unknown>;
    autosize?: boolean;
    width?: number;
    height?: number;
    font?: Record<string, unknown>;
    paper_bgcolor?: string;
    plot_bgcolor?: string;
    [key: string]: unknown;
  }

  interface PlotConfig {
    responsive?: boolean;
    displayModeBar?: boolean;
    displaylogo?: boolean;
    [key: string]: unknown;
  }

  export function newPlot(
    root: string | HTMLElement,
    data: PlotData[],
    layout?: Partial<PlotLayout>,
    config?: Partial<PlotConfig>
  ): Promise<PlotlyHTMLElement>;

  export function purge(root: string | HTMLElement): void;

  export function toImage(
    root: string | HTMLElement,
    options?: {
      format?: 'png' | 'jpeg' | 'webp' | 'svg';
      width?: number;
      height?: number;
      scale?: number;
    }
  ): Promise<string>;
}
