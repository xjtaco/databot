import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { HttpStatusCode } from '../base/types';
import { getValidatedUuid } from '../utils/routeParams';
import * as templateService from './customNodeTemplate.service';
import { CreateCustomNodeTemplateInput } from './workflow.types';

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateCustomNodeTemplateInput;
  if (!input.name || typeof input.name !== 'string') {
    throw new ValidationError('Name is required');
  }
  if (!input.type || typeof input.type !== 'string') {
    throw new ValidationError('Type is required');
  }
  if (!input.config || typeof input.config !== 'object') {
    throw new ValidationError('Config is required');
  }
  const template = await templateService.createTemplate(input, req.user?.userId);
  res.status(HttpStatusCode.CREATED).json({ template });
}

export async function listTemplatesHandler(_req: Request, res: Response): Promise<void> {
  const templates = await templateService.listTemplates();
  res.json({ templates });
}

export async function getTemplateHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const template = await templateService.getTemplate(id);
  res.json({ template });
}

export async function updateTemplateHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const input = req.body as Partial<CreateCustomNodeTemplateInput>;
  const template = await templateService.updateTemplate(id, input);
  res.json({ template });
}

export async function deleteTemplateHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  await templateService.deleteTemplate(id);
  res.json({ deleted: true });
}
