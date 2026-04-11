import { Router } from 'express';
import { createUploadMiddleware } from '../middleware/uploadFactory';
import { legacyUploadHandler, uploadAndSaveHandler } from './datafile.controller';

const uploadMiddleware = createUploadMiddleware({
  allowedMimeTypes: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  allowedExtensions: ['.csv', '.xls', '.xlsx'],
});

const router = Router();

router.post('/upload', uploadMiddleware.single('file'), legacyUploadHandler);
router.post('/datafile/upload', uploadMiddleware.single('file'), uploadAndSaveHandler);

export default router;
