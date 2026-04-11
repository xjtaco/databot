import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { InvalidFileTypeError } from '../../src/errors/types';

// Mock config
vi.mock('../../src/base/config', () => ({
  config: {
    upload: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
    },
  },
}));

import { createUploadMiddleware } from '../../src/middleware/uploadFactory';

describe('uploadFactory', () => {
  const csvConfig = {
    allowedMimeTypes: ['text/csv'],
    allowedExtensions: ['.csv'],
  };

  describe('createUploadMiddleware()', () => {
    it('should return a multer instance', () => {
      const middleware = createUploadMiddleware(csvConfig);

      expect(middleware).toBeDefined();
      expect(middleware.single).toBeDefined();
      expect(middleware.array).toBeDefined();
      expect(middleware.fields).toBeDefined();
    });

    it('should accept files with valid extension and MIME type', () => {
      const middleware = createUploadMiddleware(csvConfig);

      // Access the internal file filter via multer's configuration
      // We test by calling the middleware's fileFilter directly
      const fileFilter = extractFileFilter(middleware);

      const mockFile = {
        fieldname: 'file',
        originalname: 'data.csv',
        encoding: '7bit',
        mimetype: 'text/csv',
        size: 1024,
        buffer: Buffer.from(''),
      };

      const callback = vi.fn();
      fileFilter({} as Request, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject files with invalid extension', () => {
      const middleware = createUploadMiddleware(csvConfig);
      const fileFilter = extractFileFilter(middleware);

      const mockFile = {
        fieldname: 'file',
        originalname: 'data.xlsx',
        encoding: '7bit',
        mimetype: 'text/csv',
        size: 1024,
        buffer: Buffer.from(''),
      };

      const callback = vi.fn();
      fileFilter({} as Request, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });

    it('should reject files with invalid MIME type', () => {
      const middleware = createUploadMiddleware(csvConfig);
      const fileFilter = extractFileFilter(middleware);

      const mockFile = {
        fieldname: 'file',
        originalname: 'data.csv',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from(''),
      };

      const callback = vi.fn();
      fileFilter({} as Request, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });

    it('should handle multiple allowed types', () => {
      const multiConfig = {
        allowedMimeTypes: ['text/csv', 'application/vnd.ms-excel'],
        allowedExtensions: ['.csv', '.xls'],
      };
      const middleware = createUploadMiddleware(multiConfig);
      const fileFilter = extractFileFilter(middleware);

      const xlsFile = {
        fieldname: 'file',
        originalname: 'data.xls',
        encoding: '7bit',
        mimetype: 'application/vnd.ms-excel',
        size: 1024,
        buffer: Buffer.from(''),
      };

      const callback = vi.fn();
      fileFilter({} as Request, xlsFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should use custom maxFileSize when provided', () => {
      const customConfig = {
        ...csvConfig,
        maxFileSize: 5 * 1024 * 1024,
      };

      const middleware = createUploadMiddleware(customConfig);
      expect(middleware).toBeDefined();
      // Multer stores limits internally; we verify the middleware was created without error
    });

    it('should use default maxFileSize from config when not provided', () => {
      const middleware = createUploadMiddleware(csvConfig);
      expect(middleware).toBeDefined();
    });
  });
});

/**
 * Extract the fileFilter function from a multer instance for testing.
 * Multer stores the fileFilter in its internal options.
 */

function extractFileFilter(multerInstance: ReturnType<typeof createUploadMiddleware>): any {
  const opts = multerInstance as any;
  if (opts.fileFilter) return opts.fileFilter;
  if (opts._fileFilter) return opts._fileFilter;
  throw new Error('Could not extract fileFilter from multer instance');
}
