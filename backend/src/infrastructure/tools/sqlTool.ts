import { promises as fs } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';
import { DatasourceFactory } from '../datasources/datasourceFactory';
import { DatasourceConfig, DatasourceType, QueryResult } from '../datasources/types';
import { queryResultToCSV } from '../datasources/csvUtils';
import { config as appConfig } from '../../base/config';
import { decryptPassword } from '../../utils/encryption';

interface SqlToolResultData {
  message: string;
  preview_rows: number;
  total_rows: number;
  output_file: string;
  columns: string[];
  preview_data: Record<string, unknown>[];
}

/**
 * Parse INI config file to DatasourceConfig
 * INI format:
 * [datasource]
 * type=mysql|postgres|sqlite
 * host=localhost
 * port=3306
 * database=mydb
 * username=user
 * password=pass
 * filename=/path/to/db.sqlite (for SQLite)
 */
function parseIniConfig(configContent: string): DatasourceConfig {
  const lines = configContent.split(/\r?\n/);
  const config: Record<string, string> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip empty lines, comments, and section headers
    if (
      !trimmedLine ||
      trimmedLine.startsWith(';') ||
      trimmedLine.startsWith('#') ||
      trimmedLine.startsWith('[')
    ) {
      continue;
    }

    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, equalIndex).trim().toLowerCase();
    const value = trimmedLine.substring(equalIndex + 1).trim();
    config[key] = value;
  }

  // Backward compatibility: map 'postgres' to 'postgresql'
  let datasourceType = config.type;
  if (datasourceType === 'postgres') {
    datasourceType = 'postgresql';
  }

  // Validate required fields
  const type = datasourceType as DatasourceType;
  const validTypes = [
    'mysql',
    'postgresql',
    'sqlite',
    'sqlserver',
    'mariadb',
    'oracle',
    'db2',
    'saphana',
    'kingbase',
    'clickhouse',
    'spark',
    'hive2',
    'starrocks',
    'trino',
    'prestodb',
    'tidb',
    'dameng',
  ];
  if (!type || !validTypes.includes(type)) {
    throw new ToolExecutionError(
      `Invalid or missing datasource type in config file. Must be one of: ${validTypes.join(', ')}`
    );
  }

  const datasourceConfig: DatasourceConfig = {
    type,
    database: config.database || '',
  };

  // Add optional fields
  if (config.host) {
    datasourceConfig.host = config.host;
  }
  if (config.port) {
    datasourceConfig.port = Number.parseInt(config.port, 10);
  }
  if (config.user) {
    datasourceConfig.user = config.user;
  }
  if (config.password) {
    // Decrypt password if encrypted (supports both encrypted and legacy plaintext)
    datasourceConfig.password = decryptPassword(config.password);
  }
  // Support both 'filepath' and 'file_path' in config.ini
  if (config.filepath || config.file_path) {
    let filepath = config.filepath || config.file_path;

    // For SQLite: resolve relative paths against the upload directory
    if (type === 'sqlite' && !isAbsolute(filepath)) {
      filepath = join(appConfig.upload.directory, filepath);
    }

    datasourceConfig.filepath = filepath;
  }
  if (config.connectiontimeout) {
    datasourceConfig.connectionTimeout = Number.parseInt(config.connectiontimeout, 10);
  }
  if (config.poolsize) {
    datasourceConfig.poolSize = Number.parseInt(config.poolsize, 10);
  }
  if (config.querytimeout) {
    datasourceConfig.queryTimeout = Number.parseInt(config.querytimeout, 10);
  }

  return datasourceConfig;
}

/**
 * Create output directory if it doesn't exist
 */
async function ensureOutputDirectory(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export class SqlTool extends Tool {
  name = ToolName.Sql;
  description = `Load the configuration file for the corresponding data source from the data dictionary directory, execute SQL on that data source, output up to 3 rows as a preview, and save the full query results to a file in CSV format.
*Note*:
- Before using this tool, refer to the 'type' field in the data source config file (config.ini) in the data dictionary directory to ensure the SQL uses the correct dialect (e.g., PostgreSQL, MySQL, etc.)
- The SQL to execute must use the physical table names and physical column names as specified in the data dictionary`;

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description:
          'The SQL to execute, must be a query starting with SELECT/WITH, and must include a LIMIT clause to restrict the number of rows returned.',
      },
      conf_file: {
        type: 'string',
        description: 'Absolute path to the data source configuration file in the data dictionary',
      },
      output_csv: {
        type: 'string',
        description:
          'Absolute file path for the CSV output of query results. Must be under the work folder directory.',
      },
    },
    required: ['sql', 'conf_file', 'output_csv'],
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    if (
      params.sql === undefined ||
      params.sql === null ||
      typeof params.sql !== 'string' ||
      params.sql.trim() === ''
    ) {
      return false;
    }

    if (
      params.conf_file === undefined ||
      params.conf_file === null ||
      typeof params.conf_file !== 'string' ||
      params.conf_file.trim() === ''
    ) {
      return false;
    }

    if (
      params.output_csv === undefined ||
      params.output_csv === null ||
      typeof params.output_csv !== 'string' ||
      params.output_csv.trim() === ''
    ) {
      return false;
    }

    return true;
  }

  /**
   * Execute SQL query on the specified data source and output results as a CSV file. Load the data source
   * configuration from config_file and convert it to a DatasourceConfig object, get the corresponding data source
   * instance from DatasourceFactory, execute the SQL query on that data source, output up to 3 rows as preview,
   * and save the results to a CSV file.
   * @param sql: SQL query string (must start with SELECT/WITH and include LIMIT)
   * @param conf_file: Absolute path to data source configuration file
   * @param output_csv: Path to output CSV file
   * @returns Summary message of execution
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const sql = params.sql as string;
    const confFile = params.conf_file as string;
    const outputCsv = params.output_csv as string;

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    // Validate output_csv is under the configured work_folder
    const resolvedOutput = resolve(outputCsv);
    const resolvedWorkFolder = resolve(appConfig.work_folder);
    if (
      resolvedOutput !== resolvedWorkFolder &&
      !resolvedOutput.startsWith(resolvedWorkFolder + sep)
    ) {
      throw new ToolExecutionError(
        `output_csv path must be under the work folder '${appConfig.work_folder}'. Got: '${outputCsv}'`
      );
    }

    try {
      // Read config file
      let configContent: string;
      try {
        configContent = await fs.readFile(confFile, 'utf-8');
      } catch {
        throw new ToolExecutionError(`Failed to read config file: ${confFile}`);
      }

      // Parse config file
      let datasourceConfig: DatasourceConfig;
      try {
        datasourceConfig = parseIniConfig(configContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(`Failed to parse config file: ${errorMessage}`);
      }

      // Get or create datasource
      const datasource = DatasourceFactory.getOrCreateDatasource(datasourceConfig);

      // Connect to datasource if not already connected
      if (!datasource.isConnected) {
        try {
          await datasource.connect();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new ToolExecutionError(`Failed to connect to datasource: ${errorMessage}`);
        }
      }

      // Execute query
      let queryResult: QueryResult;
      try {
        queryResult = await datasource.executeQuery(sql);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(`Failed to execute query: ${errorMessage}`);
      }

      // Convert result to CSV
      const csvContent = queryResultToCSV(queryResult);

      // Ensure output directory exists
      await ensureOutputDirectory(outputCsv);

      // Write CSV to file
      try {
        await fs.writeFile(outputCsv, csvContent, 'utf-8');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(`Failed to write CSV file: ${errorMessage}`);
      }

      // Prepare preview data (max 3 rows)
      const previewRows = Math.min(3, queryResult.rowCount);
      const previewData = queryResult.rows.slice(0, previewRows);
      const columns = queryResult.fields.map((f) => f.name);

      const resultData: SqlToolResultData = {
        message: `Query executed successfully. Returned ${queryResult.rowCount} rows, saved to ${outputCsv}`,
        preview_rows: previewRows,
        total_rows: queryResult.rowCount,
        output_file: outputCsv,
        columns,
        preview_data: previewData,
      };

      logger.info(
        `SqlTool executed query successfully: ${queryResult.rowCount} rows returned, saved to ${outputCsv}`
      );

      return {
        success: true,
        data: resultData,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`SqlTool execution failed:`, errorMessage);

      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the SQL tool instance
ToolRegistry.register(new SqlTool());
