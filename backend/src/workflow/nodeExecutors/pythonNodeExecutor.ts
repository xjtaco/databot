import { promises as fs } from 'fs';
import { join } from 'path';
import { executeInContainer } from '../../infrastructure/sandbox/dockerExecutor';
import { config as appConfig } from '../../base/config';
import { WorkflowExecutionError } from '../../errors/types';
import logger from '../../utils/logger';
import { PythonNodeConfig, PythonNodeOutput } from '../workflow.types';
import { NodeExecutionContext, NodeExecutor } from './types';
import { buildNodeIdSuffix, resolveReadableNodeBaseName } from './utils';

/**
 * Wraps user script with params dict and JSON output.
 * The wrapper:
 * 1. Reads params from a JSON file written alongside the script
 * 2. Executes the user script
 * 3. Expects the user script to set a `result` variable (dict)
 * 4. Outputs JSON to stdout with a sentinel marker
 */
export function buildWrappedScript(paramsFileName: string, userScript: string): string {
  return `import json, sys, os

# Workspace directory for file output
WORKSPACE = os.path.dirname(os.path.abspath(__file__))

# Parameters from upstream nodes (loaded from JSON file)
_params_path = os.path.join(WORKSPACE, ${JSON.stringify(paramsFileName)})
with open(_params_path, 'r', encoding='utf-8') as _f:
    params = json.load(_f)

# Initialize result
result = {}

# === User Script Start ===
${userScript}
# === User Script End ===

# Output result as JSON with sentinel marker
print('__WORKFLOW_RESULT_START__')
print(json.dumps(result))
print('__WORKFLOW_RESULT_END__')
`;
}

export class PythonNodeExecutor implements NodeExecutor {
  readonly type = 'python';

  async execute(context: NodeExecutionContext): Promise<PythonNodeOutput> {
    const config = context.resolvedConfig as PythonNodeConfig;
    const { workFolder, nodeId } = context;
    const { baseName, usedFallback } = resolveReadableNodeBaseName(context.nodeName, 'python');
    const fallbackSuffix = usedFallback ? `_${buildNodeIdSuffix(nodeId)}` : '';

    // Write params to a separate JSON file for safe deserialization
    const paramsFileName = usedFallback
      ? `python_params${fallbackSuffix}.json`
      : `${baseName}_params.json`;
    const paramsPath = join(workFolder, paramsFileName);
    await fs.writeFile(paramsPath, JSON.stringify(config.params), 'utf-8');

    // Write wrapped Python script
    const scriptFileName = usedFallback ? `python_script${fallbackSuffix}.py` : `${baseName}.py`;
    const scriptPath = join(workFolder, scriptFileName);
    const wrappedScript = buildWrappedScript(paramsFileName, config.script);
    await fs.writeFile(scriptPath, wrappedScript, 'utf-8');

    // Compute container-relative work directory
    const containerWorkDir = appConfig.sandbox.defaultWorkDir;
    // The workFolder is like /app/databot/workfolder/wf_xxxx
    // We need the relative suffix to append to container workdir
    const workFolderBase = appConfig.work_folder;
    const relativePath = workFolder.startsWith(workFolderBase)
      ? workFolder.slice(workFolderBase.length)
      : '';
    const containerPath = containerWorkDir + relativePath;

    // Execute in sandbox
    const timeout = (config.timeout ?? 120) * 1000;
    const execResult = await executeInContainer({
      containerName: appConfig.sandbox.containerName,
      command: `python ${scriptFileName}`,
      workDir: containerPath,
      user: appConfig.sandbox.user,
      timeout,
    });

    if (!execResult.success) {
      throw new WorkflowExecutionError(
        `Python script execution failed: ${execResult.error ?? execResult.stderr}`,
        { nodeId, stderr: execResult.stderr }
      );
    }

    // Parse result from stdout using sentinel markers
    const stdout = execResult.stdout;
    const result = extractResult(stdout);

    // Check for CSV output file
    const csvPath = join(
      workFolder,
      usedFallback ? `python_output${fallbackSuffix}.csv` : `${baseName}_output.csv`
    );
    let csvExists = false;
    try {
      await fs.access(csvPath);
      csvExists = true;
    } catch {
      // No CSV output
    }

    logger.info('Python node executed', { nodeId, hasCSV: csvExists });

    return {
      result,
      csvPath: csvExists ? csvPath : undefined,
      stderr: execResult.stderr === '(empty)' ? '' : execResult.stderr,
    };
  }
}

function extractResult(stdout: string): Record<string, unknown> {
  const startMarker = '__WORKFLOW_RESULT_START__';
  const endMarker = '__WORKFLOW_RESULT_END__';
  const startIdx = stdout.indexOf(startMarker);
  const endIdx = stdout.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    // Fallback: try to parse entire stdout as JSON
    try {
      const parsed = JSON.parse(stdout.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON
    }
    return { raw_output: stdout };
  }

  const jsonStr = stdout.slice(startIdx + startMarker.length, endIdx).trim();
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw_output: jsonStr };
  }
}
