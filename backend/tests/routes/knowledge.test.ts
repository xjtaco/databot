import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { KnowledgeNotFoundError, ValidationError } from '../../src/errors/types';

// Mock the knowledge service
const mockCreateFolder = vi.hoisted(() => vi.fn());
const mockListFolderTree = vi.hoisted(() => vi.fn());
const mockUpdateFolder = vi.hoisted(() => vi.fn());
const mockDeleteFolder = vi.hoisted(() => vi.fn());
const mockUploadFiles = vi.hoisted(() => vi.fn());
const mockGetFileContent = vi.hoisted(() => vi.fn());
const mockUpdateFileContent = vi.hoisted(() => vi.fn());
const mockMoveFile = vi.hoisted(() => vi.fn());
const mockDeleteFile = vi.hoisted(() => vi.fn());

vi.mock('../../src/knowledge/knowledge.service', () => ({
  createFolder: mockCreateFolder,
  listFolderTree: mockListFolderTree,
  updateFolder: mockUpdateFolder,
  deleteFolder: mockDeleteFolder,
  uploadFiles: mockUploadFiles,
  getFileContent: mockGetFileContent,
  updateFileContent: mockUpdateFileContent,
  moveFile: mockMoveFile,
  deleteFile: mockDeleteFile,
}));

// Mock the knowledge repository (used for pre-delete lookups)
const mockFindFolderById = vi.hoisted(() => vi.fn());
const mockFindFileById = vi.hoisted(() => vi.fn());

vi.mock('../../src/knowledge/knowledge.repository', () => ({
  findFolderById: mockFindFolderById,
  findFileById: mockFindFileById,
}));

// Mock audit log middleware to avoid DB calls
vi.mock('../../src/auditLog', () => ({
  auditMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  AuditAction: {},
  AuditCategory: {},
}));

// Mock the upload middleware to pass through
vi.mock('../../src/middleware/uploadFactory', () => ({
  createUploadMiddleware: () => ({
    array: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      // Simulate multer processing - files should come from test setup
      next();
    },
  }),
}));

// Import after mocking
import knowledgeRouter from '../../src/knowledge/knowledge.routes';

describe('knowledge routes', () => {
  let app: express.Application;

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';
  const validUuid2 = '550e8400-e29b-41d4-a716-446655440001';

  const mockFolderResult = {
    id: validUuid,
    name: 'Test Folder',
    parentId: null,
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    children: [],
    files: [],
  };

  const mockFileResult = {
    id: validUuid2,
    name: 'test.md',
    folderId: validUuid,
    fileSize: 1024,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: repository lookups return the mock objects
    mockFindFolderById.mockResolvedValue(mockFolderResult);
    mockFindFileById.mockResolvedValue(mockFileResult);
    app = express();
    app.use(express.json());
    app.use(knowledgeRouter);
    // Simple error handler for tests
    app.use(
      (
        err: Error & { statusCode?: number; code?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(err.statusCode || 500).json({
          error: {
            code: err.code || 'UNKNOWN',
            message: err.message,
          },
        });
      }
    );
  });

  describe('POST /folders', () => {
    it('should create folder and return 201', async () => {
      mockCreateFolder.mockResolvedValue(mockFolderResult);

      const response = await request(app)
        .post('/folders')
        .send({ name: 'Test Folder' })
        .expect(201);

      expect(response.body.folder.name).toBe('Test Folder');
    });

    it('should create folder with parentId', async () => {
      mockCreateFolder.mockResolvedValue({ ...mockFolderResult, parentId: validUuid2 });

      await request(app)
        .post('/folders')
        .send({ name: 'Child Folder', parentId: validUuid2 })
        .expect(201);

      expect(mockCreateFolder).toHaveBeenCalledWith('Child Folder', validUuid2);
    });

    it('should validate required name field', async () => {
      const response = await request(app).post('/folders').send({ name: '' }).expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate name is provided', async () => {
      const response = await request(app).post('/folders').send({}).expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle service error', async () => {
      mockCreateFolder.mockRejectedValue(new KnowledgeNotFoundError('Parent folder not found'));

      const response = await request(app).post('/folders').send({ name: 'Test' }).expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /folders', () => {
    it('should return folder tree', async () => {
      mockListFolderTree.mockResolvedValue([mockFolderResult]);

      const response = await request(app).get('/folders').expect(200);

      expect(response.body.folders).toHaveLength(1);
    });

    it('should return empty array when no folders', async () => {
      mockListFolderTree.mockResolvedValue([]);

      const response = await request(app).get('/folders').expect(200);

      expect(response.body.folders).toHaveLength(0);
    });

    it('should handle service error', async () => {
      mockListFolderTree.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/folders').expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /folders/:id', () => {
    it('should update folder and return 200', async () => {
      const updatedFolder = { ...mockFolderResult, name: 'Renamed' };
      mockUpdateFolder.mockResolvedValue(updatedFolder);

      const response = await request(app)
        .put(`/folders/${validUuid}`)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(response.body.folder.name).toBe('Renamed');
    });

    it('should update folder parentId', async () => {
      mockUpdateFolder.mockResolvedValue(mockFolderResult);

      await request(app).put(`/folders/${validUuid}`).send({ parentId: validUuid2 }).expect(200);

      expect(mockUpdateFolder).toHaveBeenCalledWith(validUuid, {
        name: undefined,
        parentId: validUuid2,
      });
    });

    it('should handle folder not found', async () => {
      mockUpdateFolder.mockRejectedValue(new KnowledgeNotFoundError('Folder not found'));

      const response = await request(app)
        .put(`/folders/${validUuid}`)
        .send({ name: 'Test' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .put('/folders/invalid-uuid')
        .send({ name: 'Test' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle circular reference validation error', async () => {
      mockUpdateFolder.mockRejectedValue(
        new ValidationError('Cannot move folder into its own descendant')
      );

      const response = await request(app)
        .put(`/folders/${validUuid}`)
        .send({ parentId: validUuid2 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /folders/:id', () => {
    it('should delete folder and return 200', async () => {
      mockDeleteFolder.mockResolvedValue(undefined);

      const response = await request(app).delete(`/folders/${validUuid}`).expect(200);

      expect(response.body.deleted).toBe(true);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app).delete('/folders/invalid-uuid').expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle folder not found', async () => {
      mockDeleteFolder.mockRejectedValue(new KnowledgeNotFoundError('Folder not found'));

      const response = await request(app).delete(`/folders/${validUuid}`).expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /folders/:folderId/files', () => {
    it('should reject invalid folderId UUID format', async () => {
      const response = await request(app).post('/folders/invalid-uuid/files').expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when no files uploaded', async () => {
      const response = await request(app).post(`/folders/${validUuid}/files`).expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /files/:id', () => {
    it('should return file content', async () => {
      mockGetFileContent.mockResolvedValue({
        file: mockFileResult,
        content: '# Hello World',
      });

      const response = await request(app).get(`/files/${validUuid2}`).expect(200);

      expect(response.body.content).toBe('# Hello World');
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app).get('/files/invalid-uuid').expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle file not found', async () => {
      mockGetFileContent.mockRejectedValue(new KnowledgeNotFoundError('File not found'));

      const response = await request(app).get(`/files/${validUuid2}`).expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /files/:id', () => {
    it('should update file content and return 200', async () => {
      mockUpdateFileContent.mockResolvedValue(mockFileResult);

      await request(app).put(`/files/${validUuid2}`).send({ content: '# Updated' }).expect(200);

      expect(mockUpdateFileContent).toHaveBeenCalledWith(validUuid2, '# Updated');
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .put('/files/invalid-uuid')
        .send({ content: '# Test' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate content is required', async () => {
      const response = await request(app).put(`/files/${validUuid2}`).send({}).expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate content is string', async () => {
      const response = await request(app)
        .put(`/files/${validUuid2}`)
        .send({ content: 123 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle file not found', async () => {
      mockUpdateFileContent.mockRejectedValue(new KnowledgeNotFoundError('File not found'));

      const response = await request(app)
        .put(`/files/${validUuid2}`)
        .send({ content: '# Test' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /files/:id/move', () => {
    it('should move file and return 200', async () => {
      mockMoveFile.mockResolvedValue(mockFileResult);

      await request(app).put(`/files/${validUuid2}/move`).send({ folderId: validUuid }).expect(200);

      expect(mockMoveFile).toHaveBeenCalledWith(validUuid2, validUuid);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .put('/files/invalid-uuid/move')
        .send({ folderId: validUuid })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate folderId is required', async () => {
      const response = await request(app).put(`/files/${validUuid2}/move`).send({}).expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate folderId is string', async () => {
      const response = await request(app)
        .put(`/files/${validUuid2}/move`)
        .send({ folderId: 123 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle target folder not found', async () => {
      mockMoveFile.mockRejectedValue(new KnowledgeNotFoundError('Target folder not found'));

      const response = await request(app)
        .put(`/files/${validUuid2}/move`)
        .send({ folderId: validUuid })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /files/:id', () => {
    it('should delete file and return 200', async () => {
      mockDeleteFile.mockResolvedValue(undefined);

      const response = await request(app).delete(`/files/${validUuid2}`).expect(200);

      expect(response.body.deleted).toBe(true);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app).delete('/files/invalid-uuid').expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle file not found', async () => {
      mockDeleteFile.mockRejectedValue(new KnowledgeNotFoundError('File not found'));

      const response = await request(app).delete(`/files/${validUuid2}`).expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});
