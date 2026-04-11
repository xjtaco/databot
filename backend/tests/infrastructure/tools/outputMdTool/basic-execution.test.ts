import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { OutputMdTool } from '../../../../src/infrastructure/tools/outputMdTool';

describe('OutputMdTool.execute() - Basic Execution', () => {
  let outputMdTool: OutputMdTool;
  let testDir: string;

  beforeEach(async () => {
    outputMdTool = new OutputMdTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `outputmdtool-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('No replace_files', () => {
    it('should return content directly when replace_files is not provided', async () => {
      // Arrange
      const mdContent = '# Data Analysis Report\n\n## Summary\n\nThis is a test report.';

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
      expect(result.metadata).toEqual({
        parameters: { md_content: mdContent },
        hasFileReplacements: false,
        contentSize: Buffer.byteLength(mdContent, 'utf-8'),
        mdContent,
      });
    });

    it('should return content directly when replace_files is empty array', async () => {
      // Arrange
      const mdContent = '# Simple Report';

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
      expect(result.metadata?.hasFileReplacements).toBe(false);
    });

    it('should handle markdown with tables', async () => {
      // Arrange
      const mdContent = `# Report

| Column A | Column B |
|----------|----------|
| Value 1  | Value 2  |
| Value 3  | Value 4  |
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
    });

    it('should handle markdown with code blocks', async () => {
      // Arrange
      const mdContent = `# Code Example

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
    });

    it('should handle markdown with mermaid diagrams', async () => {
      // Arrange
      const mdContent = `# Flow Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
    });

    it('should handle markdown with UTF-8 characters', async () => {
      // Arrange
      const mdContent = '# 数据分析报告\n\n## 摘要\n\n这是一个测试报告。';

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBe(mdContent);
      expect(result.metadata?.contentSize).toBe(Buffer.byteLength(mdContent, 'utf-8'));
    });
  });

  describe('With valid replace_files', () => {
    it('should replace CSV placeholder with markdown table', async () => {
      // Arrange
      const testFile1 = join(testDir, 'data.csv');
      const testFile2 = join(testDir, 'chart.png');
      await fs.writeFile(testFile1, 'col1,col2\n1,2');
      await fs.writeFile(testFile2, 'fake png content');

      const mdContent = `# Report

<!-- {${testFile1}} -->

![Chart](<!-- {${testFile2}} -->)
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile1, testFile2],
      });

      // Assert
      expect(result.success).toBe(true);
      // result.data should be original content (sent to LLM to avoid context overflow)
      expect(result.data).toBe(mdContent);
      // Processed content with replacements should be in metadata.mdContent
      expect(result.metadata?.mdContent).toContain('| col1 | col2 |');
      expect(result.metadata?.mdContent).toContain('| 1 | 2 |');
      // PNG should be replaced with base64 image in metadata.mdContent
      expect(result.metadata?.mdContent).toContain('![image](data:image/png;base64,');
      expect(result.metadata?.hasFileReplacements).toBe(true);
      expect(result.metadata?.replaceFiles).toEqual([testFile1, testFile2]);
    });

    it('should succeed with single CSV file placeholder and convert to table', async () => {
      // Arrange
      const testFile = join(testDir, 'report.csv');
      await fs.writeFile(testFile, 'data,value\n1,2');

      const mdContent = `# Data Report

<!-- {${testFile}} -->
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.success).toBe(true);
      // result.data should be original content (sent to LLM)
      expect(result.data).toBe(mdContent);
      // Processed content should be in metadata.mdContent
      expect(result.metadata?.mdContent).toContain('| data | value |');
      expect(result.metadata?.mdContent).toContain('| 1 | 2 |');
      expect(result.metadata?.hasFileReplacements).toBe(true);
      expect(result.metadata?.replaceFiles).toEqual([testFile]);
    });

    it('should succeed with placeholder having extra spaces and convert CSV', async () => {
      // Arrange
      const testFile = join(testDir, 'data.csv');
      await fs.writeFile(testFile, 'col\nval');

      const mdContent = `# Report

<!--   {${testFile}}   -->
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.success).toBe(true);
      // result.data should be original content (sent to LLM)
      expect(result.data).toBe(mdContent);
      // Processed content should be in metadata.mdContent
      expect(result.metadata?.mdContent).toContain('| col |');
      expect(result.metadata?.mdContent).toContain('| val |');
    });

    it('should replace all placeholders when file appears multiple times', async () => {
      // Arrange
      const testFile = join(testDir, 'data.csv');
      await fs.writeFile(testFile, 'col\nval');

      const mdContent = `# Report

First reference: <!-- {${testFile}} -->

Second reference: <!-- {${testFile}} -->
`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.success).toBe(true);
      // result.data should be original content (sent to LLM)
      expect(result.data).toBe(mdContent);
      // Placeholders should be replaced with table in metadata.mdContent
      expect(result.metadata?.mdContent).toContain('| col |');
    });
  });

  describe('Metadata validation', () => {
    it('should include correct contentSize in metadata', async () => {
      // Arrange
      const mdContent = '# Test';

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      expect(result.metadata?.contentSize).toBe(6);
    });

    it('should calculate contentSize correctly for UTF-8 content', async () => {
      // Arrange
      const mdContent = '你好';

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
      });

      // Assert
      // '你好' is 6 bytes in UTF-8 (3 bytes per character)
      expect(result.metadata?.contentSize).toBe(6);
    });

    it('should include replaceFiles and mdContent in metadata when files are provided', async () => {
      // Arrange
      const testFile = join(testDir, 'test.csv');
      await fs.writeFile(testFile, 'col\nval');

      const mdContent = `<!-- {${testFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.metadata?.replaceFiles).toEqual([testFile]);
      expect(result.metadata?.mdContent).toBeDefined();
      expect(result.metadata?.mdContent).toContain('| col |');
    });
  });
});
