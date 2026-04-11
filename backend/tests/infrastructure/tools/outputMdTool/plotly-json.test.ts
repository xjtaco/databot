import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { OutputMdTool } from '../../../../src/infrastructure/tools/outputMdTool';

describe('OutputMdTool - Plotly JSON conversion', () => {
  let outputMdTool: OutputMdTool;
  let testDir: string;

  beforeEach(async () => {
    outputMdTool = new OutputMdTool();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `outputmdtool-plotly-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function writeJsonFile(filename: string, content: unknown): Promise<string> {
    const filePath = join(testDir, filename);
    await fs.writeFile(filePath, JSON.stringify(content), 'utf-8');
    return filePath;
  }

  async function writeRawFile(filename: string, content: string): Promise<string> {
    const filePath = join(testDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('Valid Plotly JSON', () => {
    it('should convert a simple scatter chart to a plotly code block', async () => {
      const plotlyData = {
        data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 5, 6] }],
        layout: { title: 'Test Chart' },
      };
      const filePath = await writeJsonFile('chart.json', plotlyData);

      const result = await outputMdTool.execute({
        md_content: `# Report\n\n<!-- {${filePath}} -->`,
        replace_files: [filePath],
      });

      const processedContent = result.metadata?.mdContent as string;
      expect(processedContent).toContain('```plotly');
      expect(processedContent).toContain('"scatter"');
      expect(processedContent).toContain('\n```');
    });

    it('should convert a bar chart to a plotly code block', async () => {
      const plotlyData = {
        data: [{ type: 'bar', x: ['A', 'B', 'C'], y: [10, 20, 30] }],
      };
      const filePath = await writeJsonFile('bar.json', plotlyData);

      const result = await outputMdTool.execute({
        md_content: `<!-- {${filePath}} -->`,
        replace_files: [filePath],
      });

      const processedContent = result.metadata?.mdContent as string;
      expect(processedContent).toContain('```plotly');
      expect(processedContent).toContain('"bar"');
    });

    it('should accept traces without explicit type (defaults to scatter in Plotly)', async () => {
      const plotlyData = {
        data: [{ x: [1, 2], y: [3, 4] }],
      };
      const filePath = await writeJsonFile('no-type.json', plotlyData);

      const result = await outputMdTool.execute({
        md_content: `<!-- {${filePath}} -->`,
        replace_files: [filePath],
      });

      const processedContent = result.metadata?.mdContent as string;
      expect(processedContent).toContain('```plotly');
    });

    it('should accept multiple traces', async () => {
      const plotlyData = {
        data: [
          { type: 'scatter', x: [1, 2], y: [3, 4], name: 'Series A' },
          { type: 'bar', x: [1, 2], y: [5, 6], name: 'Series B' },
        ],
        layout: { title: 'Multi-trace Chart' },
      };
      const filePath = await writeJsonFile('multi.json', plotlyData);

      const result = await outputMdTool.execute({
        md_content: `<!-- {${filePath}} -->`,
        replace_files: [filePath],
      });

      const processedContent = result.metadata?.mdContent as string;
      expect(processedContent).toContain('```plotly');
      expect(processedContent).toContain('Series A');
      expect(processedContent).toContain('Series B');
    });

    it('should accept all common trace types', async () => {
      const traceTypes = [
        'scatter',
        'bar',
        'pie',
        'heatmap',
        'histogram',
        'box',
        'violin',
        'scatter3d',
        'surface',
        'sunburst',
        'treemap',
        'funnel',
        'waterfall',
        'indicator',
        'table',
        'candlestick',
        'sankey',
      ];

      for (const traceType of traceTypes) {
        const plotlyData = { data: [{ type: traceType }] };
        const filePath = await writeJsonFile(`${traceType}.json`, plotlyData);

        const result = await outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        });

        const processedContent = result.metadata?.mdContent as string;
        expect(processedContent).toContain('```plotly');
      }
    });
  });

  describe('Invalid Plotly JSON', () => {
    it('should throw for non-JSON content', async () => {
      const filePath = await writeRawFile('bad.json', 'not json at all');

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('File is not valid JSON');
    });

    it('should throw for JSON array instead of object', async () => {
      const filePath = await writeJsonFile('array.json', [1, 2, 3]);

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly JSON must be an object');
    });

    it('should throw for missing data array', async () => {
      const filePath = await writeJsonFile('no-data.json', { layout: { title: 'No data' } });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly JSON missing required "data" array');
    });

    it('should throw for empty data array', async () => {
      const filePath = await writeJsonFile('empty-data.json', { data: [] });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly JSON "data" array must not be empty');
    });

    it('should throw for non-object trace in data array', async () => {
      const filePath = await writeJsonFile('bad-trace.json', { data: ['not an object'] });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly data[0] must be an object');
    });

    it('should throw for invalid trace type', async () => {
      const filePath = await writeJsonFile('bad-type.json', {
        data: [{ type: 'invalid_chart_type' }],
      });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('is not a valid Plotly trace type');
    });

    it('should throw for non-string trace type', async () => {
      const filePath = await writeJsonFile('num-type.json', { data: [{ type: 123 }] });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('is not a valid Plotly trace type');
    });

    it('should throw for non-object layout', async () => {
      const filePath = await writeJsonFile('bad-layout.json', {
        data: [{ type: 'scatter' }],
        layout: 'not an object',
      });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly JSON "layout" must be an object');
    });

    it('should throw for array layout', async () => {
      const filePath = await writeJsonFile('array-layout.json', {
        data: [{ type: 'bar' }],
        layout: [1, 2],
      });

      await expect(
        outputMdTool.execute({
          md_content: `<!-- {${filePath}} -->`,
          replace_files: [filePath],
        })
      ).rejects.toThrow('Plotly JSON "layout" must be an object');
    });
  });
});
