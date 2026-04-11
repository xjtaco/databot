import multer from 'multer';
import type { Request } from 'express';
import { config } from '../base/config';
import { InvalidFileTypeError } from '../errors/types';
import { getFileExtension } from '../utils/fileHelpers';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface UploadConfig {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFileSize?: number;
}

export function createUploadMiddleware(uploadConfig: UploadConfig): multer.Multer {
  const { allowedMimeTypes, allowedExtensions, maxFileSize } = uploadConfig;

  const fileFilter = (
    _req: Request,
    file: MulterFile,
    callback: multer.FileFilterCallback
  ): void => {
    const extension = getFileExtension(file.originalname);

    if (!allowedExtensions.includes(extension)) {
      callback(new InvalidFileTypeError(`Invalid file extension: ${extension}`));
      return;
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(new InvalidFileTypeError(`Invalid file type: ${file.mimetype}`));
      return;
    }

    callback(null, true);
  };

  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSize ?? config.upload.maxFileSize,
    },
    fileFilter,
  });
}
