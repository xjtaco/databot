import { Router } from 'express';
import { createUploadMiddleware } from '../middleware/uploadFactory';
import { uploadSqliteHandler, deleteDatasourceHandler } from './sqlite.controller';

const sqliteUploadMiddleware = createUploadMiddleware({
  allowedMimeTypes: [
    'application/vnd.sqlite3',
    'application/x-sqlite3',
    'application/octet-stream',
  ],
  allowedExtensions: ['.db', '.sqlite', '.sqlite3'],
});

const router = Router();

router.post('/upload', sqliteUploadMiddleware.single('file'), uploadSqliteHandler);
router.delete('/datasource/:id', deleteDatasourceHandler);

export default router;
