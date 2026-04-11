import { getPrismaClient } from '../infrastructure/database';
import type { ConfigCategory } from './globalConfig.types';

interface ConfigRow {
  configKey: string;
  configValue: string;
}

export async function getConfigsByCategory(category: ConfigCategory): Promise<ConfigRow[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.globalConfig.findMany({
    where: { category },
    select: { configKey: true, configValue: true },
  });
  return rows;
}

export async function upsertConfigs(
  category: ConfigCategory,
  configs: Array<{ key: string; value: string }>
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.$transaction(
    configs.map((c) =>
      prisma.globalConfig.upsert({
        where: {
          category_configKey: { category, configKey: c.key },
        },
        update: { configValue: c.value },
        create: { category, configKey: c.key, configValue: c.value },
      })
    )
  );
}
