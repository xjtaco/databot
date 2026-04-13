import { promises as fs } from 'fs';
import { join, isAbsolute } from 'path';
import { getPrismaClient } from '../../infrastructure/database';
import { DatasourceFactory } from '../../infrastructure/datasources/datasourceFactory';
import { queryResultToCSV } from '../../infrastructure/datasources/csvUtils';
import { DatasourceConfig, DatasourceType } from '../../infrastructure/datasources/types';
import { WorkflowExecutionError } from '../../errors/types';
import { decryptPassword } from '../../utils/encryption';
import { config as appConfig } from '../../base/config';
import logger from '../../utils/logger';
import { SqlNodeConfig, SqlNodeOutput } from '../workflow.types';
import { NodeExecutionContext, NodeExecutor } from './types';
import { buildNodeIdSuffix, resolveReadableNodeBaseName } from './utils';

export class SqlNodeExecutor implements NodeExecutor {
  readonly type = 'sql';

  async execute(context: NodeExecutionContext): Promise<SqlNodeOutput> {
    const config = context.resolvedConfig as SqlNodeConfig;

    // Load datasource config from DB
    const prisma = getPrismaClient();
    const datasource = await prisma.datasource.findUnique({
      where: { id: config.datasourceId },
    });

    if (!datasource) {
      throw new WorkflowExecutionError(`Datasource not found: ${config.datasourceId}`);
    }

    // Map DB type strings to DatasourceType values
    const typeMap: Record<string, DatasourceType> = {
      postgresql: 'postgresql',
      mysql: 'mysql',
      sqlite: 'sqlite',
      sqlserver: 'sqlserver',
      mariadb: 'mariadb',
      oracle: 'oracle',
      db2: 'db2',
      saphana: 'saphana',
      kingbase: 'kingbase',
      clickhouse: 'clickhouse',
      spark: 'spark',
      hive2: 'hive2',
      starrocks: 'starrocks',
      trino: 'trino',
      prestodb: 'prestodb',
      tidb: 'tidb',
      dameng: 'dameng',
    };
    const dsType = typeMap[datasource.type];
    if (!dsType) {
      throw new WorkflowExecutionError(`Unknown datasource type: ${datasource.type}`);
    }

    const dsConfig: DatasourceConfig = {
      type: dsType,
      host: datasource.host ?? undefined,
      port: datasource.port ?? undefined,
      database: datasource.database ?? '',
      user: datasource.user ?? undefined,
      password: datasource.password ? decryptPassword(datasource.password) : undefined,
      filepath:
        datasource.filePath && dsType === 'sqlite' && !isAbsolute(datasource.filePath)
          ? join(appConfig.upload.directory, datasource.filePath)
          : (datasource.filePath ?? undefined),
      schema: datasource.schema ?? undefined,
      properties: datasource.properties
        ? (JSON.parse(datasource.properties) as Record<string, string>)
        : undefined,
    };

    // Get or create datasource connection
    const ds = DatasourceFactory.getOrCreateDatasource(dsConfig);
    if (!ds.isConnected) {
      await ds.connect();
    }

    // Execute query
    const queryResult = await ds.executeQuery(config.sql);

    // Write CSV output
    const csvContent = queryResultToCSV(queryResult);
    const { baseName, usedFallback } = resolveReadableNodeBaseName(context.nodeName, 'sql');
    const csvFileName = usedFallback
      ? `sql_output_${buildNodeIdSuffix(context.nodeId)}.csv`
      : `${baseName}_output.csv`;
    const csvPath = join(context.workFolder, csvFileName);
    await fs.writeFile(csvPath, csvContent, 'utf-8');

    // Build preview (max 100 rows)
    const previewData = queryResult.rows.slice(0, 100);
    const columns = queryResult.fields.map((f) => f.name);

    logger.info('SQL node executed', {
      nodeId: context.nodeId,
      totalRows: queryResult.rowCount,
      csvPath,
    });

    return {
      csvPath,
      totalRows: queryResult.rowCount,
      columns,
      previewData,
    };
  }
}
