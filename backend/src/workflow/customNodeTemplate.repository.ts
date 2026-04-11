import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import { CustomNodeTemplateInfo, NodeConfig, WorkflowNodeTypeValue } from './workflow.types';

type PrismaTemplate = Prisma.CustomNodeTemplateGetPayload<{
  include: { creator: { select: { username: true } } };
}>;

function mapTemplate(t: PrismaTemplate): CustomNodeTemplateInfo {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type as WorkflowNodeTypeValue,
    config: JSON.parse(t.config) as NodeConfig,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    creatorName: t.creator?.username ?? null,
  };
}

export async function createTemplate(
  name: string,
  description: string | null,
  type: string,
  config: NodeConfig,
  createdBy?: string
): Promise<CustomNodeTemplateInfo> {
  const prisma = getPrismaClient();
  const t = await prisma.customNodeTemplate.create({
    data: { name, description, type, config: JSON.stringify(config), createdBy: createdBy ?? null },
    include: { creator: { select: { username: true } } },
  });
  return mapTemplate(t);
}

export async function findAllTemplates(): Promise<CustomNodeTemplateInfo[]> {
  const prisma = getPrismaClient();
  const templates = await prisma.customNodeTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { username: true } } },
  });
  return templates.map(mapTemplate);
}

export async function findTemplateById(id: string): Promise<CustomNodeTemplateInfo | null> {
  const prisma = getPrismaClient();
  const t = await prisma.customNodeTemplate.findUnique({
    where: { id },
    include: { creator: { select: { username: true } } },
  });
  return t ? mapTemplate(t) : null;
}

export async function updateTemplate(
  id: string,
  data: { name?: string; description?: string | null; type?: string; config?: NodeConfig }
): Promise<CustomNodeTemplateInfo> {
  const prisma = getPrismaClient();
  const updateData: Prisma.CustomNodeTemplateUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.config !== undefined) updateData.config = JSON.stringify(data.config);
  const t = await prisma.customNodeTemplate.update({
    where: { id },
    data: updateData,
    include: { creator: { select: { username: true } } },
  });
  return mapTemplate(t);
}

export async function deleteTemplate(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.customNodeTemplate.delete({ where: { id } });
}
