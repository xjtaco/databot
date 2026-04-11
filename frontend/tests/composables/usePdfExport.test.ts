import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { withSetup } from '../setup';
import { usePdfExport } from '@/composables/usePdfExport';

// Use vi.hoisted so mocks are available in vi.mock factories (which are hoisted)
const { mockSave, mockFrom, mockSet, mockHtml2pdfFn } = vi.hoisted(() => {
  const mockSave = vi.fn().mockResolvedValue(undefined);
  const mockFrom = vi.fn().mockReturnValue({ save: mockSave });
  const mockSet = vi.fn().mockReturnValue({ from: mockFrom });
  const mockHtml2pdfFn = vi.fn().mockReturnValue({ set: mockSet });
  return { mockSave, mockFrom, mockSet, mockHtml2pdfFn };
});

vi.mock('html2pdf.js', () => {
  const fn = (...args: unknown[]) => mockHtml2pdfFn(...args);
  return { default: fn };
});

// Mock plotly.js-dist-min
vi.mock('plotly.js-dist-min', () => ({
  toImage: vi.fn().mockResolvedValue('data:image/png;base64,mockdata'),
}));

// Mock element-plus ElMessage
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  createI18n: vi.fn(),
}));

describe('usePdfExport', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Re-establish mock chain after clearAllMocks
    mockSave.mockResolvedValue(undefined);
    mockFrom.mockReturnValue({ save: mockSave });
    mockSet.mockReturnValue({ from: mockFrom });
    mockHtml2pdfFn.mockReturnValue({ set: mockSet });
  });

  it('should initialize with isExporting as false', () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    expect(result.isExporting.value).toBe(false);

    unmount();
  });

  it('should set isExporting during export and reset after', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Test content</p>';

    const exportPromise = result.exportToPdf(element);

    expect(result.isExporting.value).toBe(true);

    await exportPromise;

    expect(result.isExporting.value).toBe(false);

    unmount();
  });

  it('should call html2pdf with correct options', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report content</p>';

    await result.exportToPdf(element, { filename: 'test-report.pdf' });

    expect(mockHtml2pdfFn).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'test-report.pdf',
      })
    );
    expect(mockSave).toHaveBeenCalled();

    unmount();
  });

  it('should use default filename when not provided', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report content</p>';

    await result.exportToPdf(element);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: expect.stringMatching(/^report-\d{4}-\d{2}-\d{2}\.pdf$/),
      })
    );

    unmount();
  });

  it('should not start a second export while one is in progress', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report</p>';

    // Start first export (don't await)
    const firstExport = result.exportToPdf(element);

    // Try second export immediately
    await result.exportToPdf(element);

    await firstExport;

    // html2pdf should only be called once
    expect(mockHtml2pdfFn).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('should reset isExporting on error', async () => {
    mockSave.mockRejectedValueOnce(new Error('PDF generation failed'));

    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report</p>';

    await result.exportToPdf(element);

    expect(result.isExporting.value).toBe(false);

    unmount();
  });

  it('should pass the original element to html2pdf (no manual clone)', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report</p>';
    document.body.appendChild(element);

    await result.exportToPdf(element);

    // from() should receive the original element, not a clone
    expect(mockFrom).toHaveBeenCalledWith(element);

    document.body.removeChild(element);
    unmount();
  });

  it('should configure html2canvas with onclone callback', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report</p>';

    await result.exportToPdf(element);

    const setArgs = mockSet.mock.calls[0][0];
    expect(setArgs.html2canvas).toBeDefined();
    expect(typeof setArgs.html2canvas.onclone).toBe('function');

    unmount();
  });

  it('should apply print-friendly styles in onclone callback', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<h1>Report Title</h1><p>Content</p>';

    await result.exportToPdf(element);

    // Extract the onclone callback and invoke it with a mock
    const setArgs = mockSet.mock.calls[0][0];
    const onclone = setArgs.html2canvas.onclone;

    const clonedDoc = document.implementation.createHTMLDocument('cloned');
    const clonedElement = clonedDoc.createElement('div');
    clonedDoc.body.appendChild(clonedElement);

    onclone(clonedDoc, clonedElement);

    // Check that print-friendly CSS variables were set on the cloned document root
    expect(clonedDoc.documentElement.style.getPropertyValue('--text-primary')).toBe('#1a1a1a');
    expect(clonedDoc.documentElement.style.getPropertyValue('--text-secondary')).toBe('#333333');
    expect(clonedDoc.documentElement.style.getPropertyValue('--bg-primary')).toBe('#ffffff');

    // Check that the cloned element has explicit styles (JSDOM normalizes hex to rgb)
    expect(clonedElement.style.color).toBe('rgb(51, 51, 51)');
    expect(clonedElement.style.backgroundColor).toBe('rgb(255, 255, 255)');

    unmount();
  });

  it('should not leave cloned elements in DOM (no manual clone)', async () => {
    const { result, unmount } = withSetup(() => usePdfExport());

    const element = document.createElement('div');
    element.innerHTML = '<p>Report</p>';
    document.body.appendChild(element);

    const childCountBefore = document.body.children.length;

    await result.exportToPdf(element);

    // No clone should be added/left in the DOM
    expect(document.body.children.length).toBe(childCountBefore);

    document.body.removeChild(element);
    unmount();
  });
});
