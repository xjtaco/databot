import { CustomNodeTemplateNotFoundError, WorkflowValidationError } from '../errors/types';
import logger from '../utils/logger';
import * as repository from './customNodeTemplate.repository';
import {
  CustomNodeTemplateInfo,
  CreateCustomNodeTemplateInput,
  WorkflowNodeType,
  isValidNodeType,
} from './workflow.types';

export async function createTemplate(
  input: CreateCustomNodeTemplateInput,
  createdBy?: string
): Promise<CustomNodeTemplateInfo> {
  if (!input.name || input.name.trim().length === 0) {
    throw new WorkflowValidationError('Template name must not be empty');
  }
  if (!isValidNodeType(input.type)) {
    throw new WorkflowValidationError(`Invalid node type: ${input.type}`);
  }
  if (input.type === WorkflowNodeType.Branch) {
    throw new WorkflowValidationError('Branch nodes cannot be saved as custom templates');
  }
  const template = await repository.createTemplate(
    input.name,
    input.description ?? null,
    input.type,
    input.config,
    createdBy
  );
  logger.info('Created custom node template', { templateId: template.id, name: template.name });
  return template;
}

export async function listTemplates(): Promise<CustomNodeTemplateInfo[]> {
  return repository.findAllTemplates();
}

export async function getTemplate(id: string): Promise<CustomNodeTemplateInfo> {
  const template = await repository.findTemplateById(id);
  if (!template) {
    throw new CustomNodeTemplateNotFoundError('Custom node template not found');
  }
  return template;
}

export async function updateTemplate(
  id: string,
  input: Partial<CreateCustomNodeTemplateInput>
): Promise<CustomNodeTemplateInfo> {
  const existing = await repository.findTemplateById(id);
  if (!existing) {
    throw new CustomNodeTemplateNotFoundError('Custom node template not found');
  }
  if (input.type && !isValidNodeType(input.type)) {
    throw new WorkflowValidationError(`Invalid node type: ${input.type}`);
  }
  const template = await repository.updateTemplate(id, {
    name: input.name,
    description: input.description,
    type: input.type,
    config: input.config,
  });
  logger.info('Updated custom node template', { templateId: id });
  return template;
}

export async function deleteTemplate(id: string): Promise<void> {
  const existing = await repository.findTemplateById(id);
  if (!existing) {
    throw new CustomNodeTemplateNotFoundError('Custom node template not found');
  }
  await repository.deleteTemplate(id);
  logger.info('Deleted custom node template', { templateId: id });
}
