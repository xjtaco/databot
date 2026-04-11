import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getTodayDateDir,
  ensureDirectoryExists,
  getFileBasename,
  getFileExtension,
  getUniqueFilename,
} from '../../src/utils/fileHelpers';

vi.mock('fs');
const mockedFs = vi.mocked(fs);

describe('fileHelpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTodayDateDir()', () => {
    it('should return date in YYYY-MM-DD format', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15'));

      expect(getTodayDateDir()).toBe('2025-03-15');

      vi.useRealTimers();
    });

    it('should pad single-digit month and day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-05'));

      expect(getTodayDateDir()).toBe('2025-01-05');

      vi.useRealTimers();
    });

    it('should handle December 31st', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-31'));

      expect(getTodayDateDir()).toBe('2025-12-31');

      vi.useRealTimers();
    });
  });

  describe('ensureDirectoryExists()', () => {
    it('should create directory when it does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      ensureDirectoryExists('/some/new/dir');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/some/new/dir', { recursive: true });
    });

    it('should not create directory when it already exists', () => {
      mockedFs.existsSync.mockReturnValue(true);

      ensureDirectoryExists('/existing/dir');

      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getFileBasename()', () => {
    it('should return name without extension', () => {
      expect(getFileBasename('report.csv')).toBe('report');
    });

    it('should handle multiple dots', () => {
      expect(getFileBasename('archive.tar.gz')).toBe('archive.tar');
    });

    it('should return full name when no extension', () => {
      expect(getFileBasename('Makefile')).toBe('Makefile');
    });

    it('should handle dot at the start (hidden files)', () => {
      expect(getFileBasename('.gitignore')).toBe('');
    });

    it('should handle empty string', () => {
      expect(getFileBasename('')).toBe('');
    });
  });

  describe('getFileExtension()', () => {
    it('should return extension with dot, lowercased', () => {
      expect(getFileExtension('report.CSV')).toBe('.csv');
    });

    it('should return last extension for multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('.gz');
    });

    it('should return empty string when no extension', () => {
      expect(getFileExtension('Makefile')).toBe('');
    });

    it('should handle hidden file as extension', () => {
      expect(getFileExtension('.gitignore')).toBe('.gitignore');
    });

    it('should return empty string for empty input', () => {
      expect(getFileExtension('')).toBe('');
    });

    it('should lowercase the extension', () => {
      expect(getFileExtension('data.XLSX')).toBe('.xlsx');
    });
  });

  describe('getUniqueFilename()', () => {
    beforeEach(() => {
      mockedFs.existsSync.mockReset();
    });

    it('should return original filename when no collision', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = getUniqueFilename('/uploads', 'report', '.csv');

      expect(result).toBe('report.csv');
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join('/uploads', 'report.csv'));
    });

    it('should append _1 on first collision', () => {
      mockedFs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

      const result = getUniqueFilename('/uploads', 'report', '.csv');

      expect(result).toBe('report_1.csv');
    });

    it('should increment counter until unique', () => {
      mockedFs.existsSync
        .mockReturnValueOnce(true) // report.csv exists
        .mockReturnValueOnce(true) // report_1.csv exists
        .mockReturnValueOnce(true) // report_2.csv exists
        .mockReturnValueOnce(false); // report_3.csv is free

      const result = getUniqueFilename('/uploads', 'report', '.csv');

      expect(result).toBe('report_3.csv');
    });

    it('should handle empty extension', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = getUniqueFilename('/uploads', 'Makefile', '');

      expect(result).toBe('Makefile');
    });
  });
});
