import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

export interface PdfExportOptions {
  filename?: string;
}

/** Print-friendly overrides for dark-theme CSS variables */
const PRINT_CSS_VARS: Record<string, string> = {
  '--text-primary': '#1a1a1a',
  '--text-secondary': '#333333',
  '--text-tertiary': '#666666',
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#f5f5f5',
  '--bg-tertiary': '#eeeeee',
  '--bg-elevated': '#fafafa',
  '--border-primary': '#dddddd',
  '--border-secondary': '#cccccc',
  '--accent': '#e05000',
  '--link-color': '#0066cc',
  '--error': '#dc2626',
  '--success': '#16a34a',
  '--warning': '#d97706',
};

/**
 * Apply print-friendly styles to a cloned element inside html2canvas's cloned document.
 * html2canvas clones the entire document into an iframe; the cloned element often
 * loses layout because CSS variables defined on :root aren't resolved in the iframe.
 * We fix this by injecting the variables directly and forcing explicit dimensions.
 */
function applyPrintStyles(
  clonedDoc: Document,
  clonedElement: HTMLElement,
  sourceWidth: number
): void {
  // Set CSS variables on the cloned document root so all descendants resolve them
  const root = clonedDoc.documentElement;
  for (const [key, value] of Object.entries(PRINT_CSS_VARS)) {
    root.style.setProperty(key, value);
  }

  // Force explicit dimensions and colors on the target element
  clonedElement.style.width = `${sourceWidth}px`;
  clonedElement.style.color = '#333333';
  clonedElement.style.backgroundColor = '#ffffff';
  clonedElement.style.padding = '16px';
}

export function usePdfExport() {
  const { t } = useI18n();
  const isExporting = ref(false);

  async function exportToPdf(element: HTMLElement, options?: PdfExportOptions): Promise<void> {
    if (isExporting.value) return;
    isExporting.value = true;

    try {
      // Snapshot Plotly charts as static images before html2canvas clones the DOM,
      // because Plotly's SVG/WebGL content doesn't survive the clone.
      const plotlySelector = '.plotly-chart[data-plotly-mounted]';
      const plotlyDivs = element.querySelectorAll<HTMLElement>(plotlySelector);
      const plotlySnapshots: { el: HTMLElement; originalHTML: string; dataUrl: string }[] = [];

      if (plotlyDivs.length > 0) {
        const Plotly = await import('plotly.js-dist-min');
        for (const div of plotlyDivs) {
          const dataUrl = await Plotly.toImage(div, {
            format: 'png',
            width: div.clientWidth,
            height: div.clientHeight,
          });
          plotlySnapshots.push({ el: div, originalHTML: div.innerHTML, dataUrl });
        }
      }

      const sourceWidth = element.clientWidth || element.scrollWidth || 800;

      const html2pdf = (await import('html2pdf.js')).default;
      const filename = options?.filename || `report-${new Date().toISOString().slice(0, 10)}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
              applyPrintStyles(clonedDoc, clonedElement, sourceWidth);

              // Replace Plotly charts with static images in the cloned document
              const clonedPlotlyDivs = clonedElement.querySelectorAll<HTMLElement>(plotlySelector);
              plotlySnapshots.forEach((snap, i) => {
                if (clonedPlotlyDivs[i]) {
                  clonedPlotlyDivs[i].innerHTML =
                    `<img src="${snap.dataUrl}" style="width:100%;height:auto;" />`;
                }
              });
            },
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save();

      ElMessage.success(t('chat.exportPdfSuccess'));
    } catch (err) {
      console.error('PDF export failed:', err);
      ElMessage.error(t('chat.exportPdfFailed'));
    } finally {
      isExporting.value = false;
    }
  }

  return { exportToPdf, isExporting };
}
