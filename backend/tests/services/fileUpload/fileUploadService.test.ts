import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock config before importing the service
vi.mock('../../../src/base/config', () => ({
  config: {
    upload: {
      directory: '/tmp/test-uploads',
      maxFileSize: 52428800,
    },
    work_folder: '/tmp',
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { processUploadedFile } from '../../../src/datafile/datafile.service';
import { FileUploadError } from '../../../src/errors/types';

describe('fileUploadService', () => {
  const testDir = '/tmp/test-uploads';

  beforeEach(() => {
    // Clean up test directory before each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('processUploadedFile - CSV files', () => {
    it('should save CSV file to date-organized directory', async () => {
      const csvContent = 'name,age\nAlice,30\nBob,25';
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = await processUploadedFile(buffer, 'test.csv');

      expect(result.originalName).toBe('test.csv');
      expect(result.savedFiles).toHaveLength(1);
      expect(result.savedFiles[0]).toBe('test.csv');
      expect(result.directory).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify file was actually saved
      const today = new Date();
      const dateDir = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const savedPath = path.join(testDir, dateDir, 'test.csv');
      expect(fs.existsSync(savedPath)).toBe(true);

      const savedContent = fs.readFileSync(savedPath, 'utf-8');
      expect(savedContent).toBe(csvContent);
    });

    it('should handle duplicate filenames by adding counter', async () => {
      const buffer = Buffer.from('data', 'utf-8');

      // Save first file
      await processUploadedFile(buffer, 'duplicate.csv');

      // Save second file with same name
      const result = await processUploadedFile(buffer, 'duplicate.csv');

      expect(result.savedFiles[0]).toBe('duplicate_1.csv');
    });

    it('should handle Chinese filenames correctly', async () => {
      const buffer = Buffer.from('数据', 'utf-8');

      const result = await processUploadedFile(buffer, '中文文件名.csv');

      expect(result.originalName).toBe('中文文件名.csv');
      expect(result.savedFiles[0]).toBe('中文文件名.csv');
    });
  });

  describe('processUploadedFile - Excel files', () => {
    it('should convert Excel file to CSV', async () => {
      // Create a simple Excel file buffer using xlsx
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Name', 'Age'],
        ['Alice', 30],
        ['Bob', 25],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await processUploadedFile(buffer, 'test.xlsx');

      expect(result.originalName).toBe('test.xlsx');
      expect(result.savedFiles).toHaveLength(1);
      expect(result.savedFiles[0]).toBe('test_Sheet1.csv');
    });

    it('should convert multiple sheets to separate CSV files', async () => {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const sheet1 = XLSX.utils.aoa_to_sheet([['A', 'B']]);
      const sheet2 = XLSX.utils.aoa_to_sheet([['C', 'D']]);

      XLSX.utils.book_append_sheet(workbook, sheet1, 'First');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Second');

      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await processUploadedFile(buffer, 'multi.xlsx');

      expect(result.savedFiles).toHaveLength(2);
      expect(result.savedFiles).toContain('multi_First.csv');
      expect(result.savedFiles).toContain('multi_Second.csv');
    });

    it('should preserve Chinese sheet names', async () => {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([['数据']]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '调度产量日报表');

      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await processUploadedFile(buffer, 'report.xlsx');

      expect(result.savedFiles[0]).toBe('report_调度产量日报表.csv');
    });

    it('should handle sheet names with spaces', async () => {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([['data']]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet With Spaces');

      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await processUploadedFile(buffer, 'test.xlsx');

      // Spaces should be preserved
      expect(result.savedFiles[0]).toBe('test_Sheet With Spaces.csv');
    });

    it('should handle .xls format', async () => {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([['Data']]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }));

      const result = await processUploadedFile(buffer, 'legacy.xls');

      expect(result.originalName).toBe('legacy.xls');
      expect(result.savedFiles).toHaveLength(1);
    });
  });

  describe('processUploadedFile - Error handling', () => {
    it('should throw error for unsupported file extension', async () => {
      const buffer = Buffer.from('data', 'utf-8');

      await expect(processUploadedFile(buffer, 'file.txt')).rejects.toThrow(FileUploadError);
      await expect(processUploadedFile(buffer, 'file.txt')).rejects.toThrow(
        'Unsupported file extension'
      );
    });

    it('should throw error for file without extension', async () => {
      const buffer = Buffer.from('data', 'utf-8');

      await expect(processUploadedFile(buffer, 'noextension')).rejects.toThrow(FileUploadError);
      await expect(processUploadedFile(buffer, 'noextension')).rejects.toThrow(
        'Unsupported file extension'
      );
    });
  });

  describe('Directory creation', () => {
    it('should create date directory if it does not exist', async () => {
      const buffer = Buffer.from('data', 'utf-8');

      await processUploadedFile(buffer, 'test.csv');

      const today = new Date();
      const dateDir = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const dirPath = path.join(testDir, dateDir);

      expect(fs.existsSync(dirPath)).toBe(true);
    });
  });
});
