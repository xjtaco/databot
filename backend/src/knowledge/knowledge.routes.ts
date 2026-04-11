import { Router } from 'express';
import { createUploadMiddleware } from '../middleware/uploadFactory';
import {
  createFolderHandler,
  listFolderTreeHandler,
  updateFolderHandler,
  deleteFolderHandler,
  uploadFilesHandler,
  getFileContentHandler,
  updateFileContentHandler,
  moveFileHandler,
  deleteFileHandler,
} from './knowledge.controller';
import { auditMiddleware, AuditAction, AuditCategory } from '../auditLog';

const knowledgeUploadMiddleware = createUploadMiddleware({
  allowedMimeTypes: ['text/markdown', 'text/plain', 'text/x-markdown', 'application/octet-stream'],
  allowedExtensions: ['.md', '.markdown'],
});

const router = Router();

router.post(
  '/folders',
  auditMiddleware(AuditAction.KNOWLEDGE_FOLDER_CREATED, AuditCategory.KNOWLEDGE),
  createFolderHandler
);
router.get('/folders', listFolderTreeHandler);
router.put('/folders/:id', updateFolderHandler);
router.delete(
  '/folders/:id',
  auditMiddleware(AuditAction.KNOWLEDGE_FOLDER_DELETED, AuditCategory.KNOWLEDGE),
  deleteFolderHandler
);
router.post(
  '/folders/:folderId/files',
  knowledgeUploadMiddleware.array('files', 20),
  auditMiddleware(AuditAction.KNOWLEDGE_FILE_UPLOADED, AuditCategory.KNOWLEDGE),
  uploadFilesHandler
);
router.get('/files/:id', getFileContentHandler);
router.put('/files/:id', updateFileContentHandler);
router.put('/files/:id/move', moveFileHandler);
router.delete(
  '/files/:id',
  auditMiddleware(AuditAction.KNOWLEDGE_FILE_DELETED, AuditCategory.KNOWLEDGE),
  deleteFileHandler
);

export default router;
