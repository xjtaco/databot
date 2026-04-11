import { HttpStatusCode } from '../base/types';
import { ErrorCode } from './errorCode';
import { ApiError } from './types';

export class ErrorFactory {
  static createUnknownError(message: string) {
    return new ApiError(message, ErrorCode.UNKNOWN_ERROR, HttpStatusCode.INTERNAL_SERVER_ERROR);
  }
  static createNotFoundError(message: string) {
    return new ApiError(message, ErrorCode.NOT_FOUND_ERROR, HttpStatusCode.NOT_FOUND);
  }
}
