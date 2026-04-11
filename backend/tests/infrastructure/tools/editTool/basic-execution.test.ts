import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EditTool } from '../../../../src/infrastructure/tools/editTool';
import { ToolExecutionError } from '../../../../src/errors/types';

// Mock the pathSecurity module to allow writing to temp directories during tests
vi.mock('../../../../src/utils/pathSecurity', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/utils/pathSecurity')>();
  return {
    ...original,
    validateFilePath: (filePath: string) => {
      // Use the original validation but with tmpdir as the work folder
      return original.validateFilePath(filePath, tmpdir());
    },
  };
});

describe('EditTool.execute() - Success', () => {
  let editTool: EditTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    editTool = new EditTool();
    // Create a temporary directory for test files
    testDir = join(tmpdir(), `editool-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'test.txt');
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should replace single occurrence successfully', async () => {
    // Arrange
    const initialContent = 'Hello world\nThis is a test\nGoodbye world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: 'Hello world',
      new_string: 'Hello everyone',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Successfully replaced 1 occurrence(s) in file: ' + testFilePath);

    // Verify file content
    const finalContent = await fs.readFile(testFilePath, 'utf-8');
    expect(finalContent).toBe('Hello everyone\nThis is a test\nGoodbye world');
  });

  it('should replace multiple occurrences when expected_replacements is set', async () => {
    // Arrange
    const initialContent = 'apple banana apple cherry apple';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: 'apple',
      new_string: 'orange',
      expected_replacements: 3,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Successfully replaced 3 occurrence(s) in file: ' + testFilePath);

    // Verify file content
    const finalContent = await fs.readFile(testFilePath, 'utf-8');
    expect(finalContent).toBe('orange banana orange cherry orange');
  });

  it('should handle empty new_string (deletion)', async () => {
    // Arrange
    const initialContent = 'Hello world\nThis is a test';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: ' world',
      new_string: '',
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file content
    const finalContent = await fs.readFile(testFilePath, 'utf-8');
    expect(finalContent).toBe('Hello\nThis is a test');
  });

  it('should preserve exact whitespace', async () => {
    // Arrange
    const initialContent = '  indented line\n    more indented';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: '  indented line',
      new_string: '  modified line',
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file content
    const finalContent = await fs.readFile(testFilePath, 'utf-8');
    expect(finalContent).toBe('  modified line\n    more indented');
  });

  it('should handle multiline strings', async () => {
    // Arrange
    const initialContent = 'Line 1\nLine 2\nLine 3\nLine 4';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: 'Line 2\nLine 3',
      new_string: 'Modified Line 2\nModified Line 3',
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file content
    const finalContent = await fs.readFile(testFilePath, 'utf-8');
    expect(finalContent).toBe('Line 1\nModified Line 2\nModified Line 3\nLine 4');
  });

  it('should return success with message string', async () => {
    // Arrange
    const initialContent = 'Hello world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await editTool.execute({
      file_path: testFilePath,
      old_string: 'Hello',
      new_string: 'Hi',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
    expect(result.data as string).toContain('Successfully replaced');
    expect(result.data as string).toContain('1 occurrence(s)');
    expect(result.data as string).toContain(testFilePath);
  });
});

describe('EditTool.execute() - Error Scenarios', () => {
  let editTool: EditTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    editTool = new EditTool();
    testDir = join(tmpdir(), `editool-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'test.txt');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should fail when old_string not found in file', async () => {
    // Arrange
    const initialContent = 'Hello world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Goodbye',
        new_string: 'Farewell',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Goodbye',
        new_string: 'Farewell',
      })
    ).rejects.toThrow('not found');
  });

  it('should fail when old_string and new_string are the same', async () => {
    // Arrange
    const initialContent = 'Hello world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Hello',
        new_string: 'Hello',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Hello',
        new_string: 'Hello',
      })
    ).rejects.toThrow('cannot be the same');
  });

  it('should fail when old_string is empty', async () => {
    // Arrange
    const initialContent = 'Hello world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: '',
        new_string: 'Hello',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: '',
        new_string: 'Hello',
      })
    ).rejects.toThrow('cannot be empty');
  });

  it('should fail when file_path is not absolute', async () => {
    // Act & Assert
    await expect(
      editTool.execute({
        file_path: 'relative/path.txt',
        old_string: 'Hello',
        new_string: 'Hi',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: 'relative/path.txt',
        old_string: 'Hello',
        new_string: 'Hi',
      })
    ).rejects.toThrow('absolute path');
  });

  it('should fail when file does not exist', async () => {
    // Use a path within tmpdir that doesn't exist
    const nonexistentPath = join(testDir, 'nonexistent', 'file.txt');

    // Act & Assert
    await expect(
      editTool.execute({
        file_path: nonexistentPath,
        old_string: 'Hello',
        new_string: 'Hi',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: nonexistentPath,
        old_string: 'Hello',
        new_string: 'Hi',
      })
    ).rejects.toThrow('Failed to read file');
  });

  it('should fail when expected_replacements exceeds actual occurrences', async () => {
    // Arrange
    const initialContent = 'Hello world';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Hello',
        new_string: 'Hi',
        expected_replacements: 2,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Hello',
        new_string: 'Hi',
        expected_replacements: 2,
      })
    ).rejects.toThrow('Expected 2 replacement(s) but only found 1 occurrence(s)');
  });

  it('should fail with invalid parameters (null file_path)', async () => {
    // Act & Assert
    await expect(
      editTool.execute({
        file_path: null as unknown as string,
        old_string: 'Hello',
        new_string: 'Hi',
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail with invalid parameters (undefined old_string)', async () => {
    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: undefined as unknown as string,
        new_string: 'Hi',
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail with invalid expected_replacements type', async () => {
    // Act & Assert
    await expect(
      editTool.execute({
        file_path: testFilePath,
        old_string: 'Hello',
        new_string: 'Hi',
        expected_replacements: '1' as unknown as number,
      })
    ).rejects.toThrow(ToolExecutionError);
  });
});

describe('EditTool.validate()', () => {
  let editTool: EditTool;

  beforeEach(() => {
    editTool = new EditTool();
  });

  it('should validate correct parameters', () => {
    // Act
    const isValid = editTool.validate({
      file_path: '/test/file.txt',
      old_string: 'Hello',
      new_string: 'Hi',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should validate correct parameters with expected_replacements', () => {
    // Act
    const isValid = editTool.validate({
      file_path: '/test/file.txt',
      old_string: 'Hello',
      new_string: 'Hi',
      expected_replacements: 2,
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should reject null file_path', () => {
    // Act
    const isValid = editTool.validate({
      file_path: null as unknown as string,
      old_string: 'Hello',
      new_string: 'Hi',
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject undefined old_string', () => {
    // Act
    const isValid = editTool.validate({
      file_path: '/test/file.txt',
      old_string: undefined as unknown as string,
      new_string: 'Hi',
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for new_string', () => {
    // Act
    const isValid = editTool.validate({
      file_path: '/test/file.txt',
      old_string: 'Hello',
      new_string: 123 as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for expected_replacements', () => {
    // Act
    const isValid = editTool.validate({
      file_path: '/test/file.txt',
      old_string: 'Hello',
      new_string: 'Hi',
      expected_replacements: '1' as unknown as number,
    });

    // Assert
    expect(isValid).toBe(false);
  });
});

describe('EditTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const editTool = new EditTool();

    // Assert
    expect(editTool.name).toBe('edit');
  });

  it('should have description', () => {
    // Arrange
    const editTool = new EditTool();

    // Assert
    expect(editTool.description).toBeDefined();
    expect(editTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const editTool = new EditTool();

    // Assert
    expect(editTool.parameters).toBeDefined();
    expect(editTool.parameters.type).toBe('object');
    expect(editTool.parameters.properties).toBeDefined();
    expect(editTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const editTool = new EditTool();

    // Assert
    expect(editTool.parameters.properties.file_path).toBeDefined();
    expect(editTool.parameters.properties.old_string).toBeDefined();
    expect(editTool.parameters.properties.new_string).toBeDefined();
    expect(editTool.parameters.properties.expected_replacements).toBeDefined();
  });

  it('should mark file_path, old_string, new_string as required', () => {
    // Arrange
    const editTool = new EditTool();

    // Assert
    expect(editTool.parameters.required).toContain('file_path');
    expect(editTool.parameters.required).toContain('old_string');
    expect(editTool.parameters.required).toContain('new_string');
    expect(editTool.parameters.required).not.toContain('expected_replacements');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const editTool = new EditTool();

    // Act
    const metadata = editTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('edit');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
