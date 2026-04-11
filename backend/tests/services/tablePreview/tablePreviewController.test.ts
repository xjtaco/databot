import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the table service
const mockGetTablePreview = vi.hoisted(() => vi.fn());
const mockListTables = vi.hoisted(() => vi.fn());
const mockListDatasourcesWithTables = vi.hoisted(() => vi.fn());
const mockGetTable = vi.hoisted(() => vi.fn());
const mockGetDictionaryContent = vi.hoisted(() => vi.fn());
const mockUpdateTable = vi.hoisted(() => vi.fn());
const mockDeleteTable = vi.hoisted(() => vi.fn());
const mockUploadAndSaveFile = vi.hoisted(() => vi.fn());
const mockParseUploadedFile = vi.hoisted(() => vi.fn());
const mockParseUploadedFileInMemory = vi.hoisted(() => vi.fn());
const mockConfirmMetadata = vi.hoisted(() => vi.fn());
const mockConfirmMetadataWithFile = vi.hoisted(() => vi.fn());

vi.mock('../../../src/table/table.service', () => ({
  listTables: mockListTables,
  listDatasourcesWithTables: mockListDatasourcesWithTables,
  getTable: mockGetTable,
  getDictionaryContent: mockGetDictionaryContent,
  updateTable: mockUpdateTable,
  deleteTable: mockDeleteTable,
  getTablePreview: mockGetTablePreview,
  uploadAndSaveFile: mockUploadAndSaveFile,
  parseUploadedFile: mockParseUploadedFile,
  parseUploadedFileInMemory: mockParseUploadedFileInMemory,
  confirmMetadata: mockConfirmMetadata,
  confirmMetadataWithFile: mockConfirmMetadataWithFile,
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getTablePreviewHandler } from '../../../src/table/table.controller';
import { errorHandler } from '../../../src/middleware/errorHandler';

describe('getTablePreviewHandler', () => {
  let app: express.Application;

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.get('/tables/:id/preview', getTablePreviewHandler);
    app.use(
      (
        err: Error & { statusCode?: number; code?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        errorHandler(err, _req, res, _next);
      }
    );
  });

  it('should return 400 for invalid UUID', async () => {
    const response = await request(app).get('/tables/not-a-uuid/preview').expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.message).toBe('Invalid table ID');
  });

  it('should return 400 for invalid limit value', async () => {
    const response = await request(app).get(`/tables/${validUuid}/preview?limit=30`).expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.message).toContain('limit must be one of');
  });

  it('should use default limit of 20 when not specified', async () => {
    const previewData = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }],
      totalRows: 1,
    };
    mockGetTablePreview.mockResolvedValue(previewData);

    await request(app).get(`/tables/${validUuid}/preview`).expect(200);

    expect(mockGetTablePreview).toHaveBeenCalledWith(validUuid, 20);
  });

  it.each([20, 50, 100])('should return 200 for valid limit %d', async (limit) => {
    const previewData = {
      columns: ['id'],
      rows: [{ id: 1 }],
      totalRows: 1,
    };
    mockGetTablePreview.mockResolvedValue(previewData);

    await request(app).get(`/tables/${validUuid}/preview?limit=${limit}`).expect(200);

    expect(mockGetTablePreview).toHaveBeenCalledWith(validUuid, limit);
  });

  it('should return preview data on success', async () => {
    const previewData = {
      columns: ['id', 'name', 'age'],
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
      totalRows: 100,
    };
    mockGetTablePreview.mockResolvedValue(previewData);

    const response = await request(app).get(`/tables/${validUuid}/preview`).expect(200);

    expect(response.body).toEqual(previewData);
  });
});
