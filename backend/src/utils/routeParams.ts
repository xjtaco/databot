import type { Request } from 'express';
import { ValidationError } from '../errors/types';
import { isValidUuid } from './validation';

export function getStringParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid parameter: ${name}`);
  }
  return value;
}

export function getValidatedUuid(req: Request, paramName: string): string {
  const id = getStringParam(req, paramName);
  if (!isValidUuid(id)) {
    throw new ValidationError(`Invalid ${paramName}`);
  }
  return id;
}
