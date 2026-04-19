import { dirname } from 'node:path';
import type { ConfigStatusResponse } from '../globalConfig/globalConfig.types';

const NODE_TYPE_SQL = `### SQL Query (sql)

- **Description**: Connects to external datasources to execute SQL queries; results are automatically exported as CSV files. Supports PostgreSQL, MySQL, SQLite.
- **Capabilities**: Execute arbitrary SQL; results saved as CSV via csvPath; returns totalRows/columns/previewData
- **Config schema**:
  - datasourceId (required): Target datasource ID
  - sql (required, supports \`{{outputVariable.field}}\` template syntax): SQL statement to execute
  - outputVariable (required): Output variable name for downstream node references
- **Output schema**:
  - csvPath (string): Path to the result CSV file
  - totalRows (number): Total number of rows in the result
  - columns (string[]): List of column names
  - previewData (Record[]): Preview of the first few rows
- **Inputs:** The sql field supports {{}} template variables to reference upstream outputs, e.g. {{python_result.status}}
- **Outputs:** csvPath (csvFile), totalRows (number), columns (string[]), previewData (object[])
- **Downstream reference examples:** {{query_result.csvPath}}, {{query_result.totalRows}}
- **Tips**: Read the config.ini file in the datasource's dictionary directory to get the datasource_id for the datasourceId field; use \`{{}}\` to reference upstream node data; downstream Python nodes can read CSV via csvPath`;

const NODE_TYPE_PYTHON = `### Python Script (python)

- **Description**: Executes Python scripts in a secure sandbox (Docker). Can receive upstream parameters, process data, and output results.
- **Capabilities**: Docker-isolated execution; params receive upstream data; outputs JSON via the \`result\` variable; optional CSV output
- **Config schema**:
  - params (key-value pairs, supports \`{{}}\` templates): Parameter dictionary passed to the script
  - script (required): Python script content
  - timeout (optional): Execution timeout in seconds
  - outputVariable (required): Output variable name
- **Output schema**:
  - result (Record): JSON object returned via the script's \`result\` variable
  - csvPath (string | undefined): Path to generated CSV, if any
  - stderr (string): Standard error output, used for debugging
- **Inputs:** Values in the params dict support {{}} template variables. The script field also supports {{}} templates. Can accept outputs from multiple upstream nodes.
- **Outputs:** result (object), csvPath (csvFile, optional), stderr (text). For template references, object fields inside \`result\` are flattened to the top level.
- **Downstream reference examples:** {{analysis.key}}, {{analysis.csvPath}}. If the script sets \`result = {"key": "..."}\`, use \`{{analysis.key}}\`, not \`{{analysis.result.key}}\`.
- **Tips**: Access inputs via the \`params\` dict; \`result\` must be a JSON-serializable dict; use pandas for CSV processing; the script has a predefined \`WORKSPACE\` variable pointing to the node execution temp directory at runtime — always use \`os.path.join(WORKSPACE, 'filename')\` to build file paths; never hardcode absolute paths
- **Large-result handling**:
  - Small structured outputs can still be returned directly in \`result\`
  - For large outputs such as reports, long text, detailed tables, exported records, or generated artifacts, prefer writing files under \`WORKSPACE\`
  - When the result can reasonably be represented as a file, prefer returning a file path rather than embedding large text in the output
  - Return path fields such as \`markdownPath\`, \`txtPath\`, \`jsonPath\`, or \`csvPath\` when appropriate
  - In the final user-facing answer, mention the result file path instead of pasting the full contents
- If wf_execute_node returns raw_output or needsUpstreamFix: true, the script must assign every downstream field to result; printing is not enough
- **Report generation**: When generating data analysis reports, the Python node handles chart generation, data embedding, and Markdown file assembly:
  - Charts: Use matplotlib; must set \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei']\` and \`plt.rcParams['axes.unicode_minus'] = False\`; save PNG with \`fig.savefig(os.path.join(WORKSPACE, 'chart.png'), dpi=150, bbox_inches='tight')\`
  - Image embedding: Read PNG as base64 and embed in Markdown as \`![description](data:image/png;base64,{base64_str})\`
  - CSV embedding: Use pandas to convert CSV to Markdown tables
  - Output: Write the assembled Markdown to \`os.path.join(WORKSPACE, 'report.md')\` and return the path via \`result = {"markdownPath": os.path.join(WORKSPACE, 'report.md')}\`
  - For large datasets, aggregate or sample before embedding to avoid oversized Markdown files`;

const NODE_TYPE_LLM = `### LLM Generation (llm)

- **Description**: Calls a large language model for text processing tasks. Takes a prompt + upstream parameters; output must be JSON.
- **Capabilities**: Uses the system-configured LLM; automatically injects params into the prompt; enforces JSON output; suitable for classification/extraction/summarization
- **Config schema**:
  - params (key-value pairs, supports \`{{}}\` templates): Context variables injected into the prompt
  - prompt (required): Prompt content; can reference variables from params
  - outputVariable (required): Output variable name
- **Output schema**:
  - result (Record): Parsed JSON object returned by the LLM
  - rawResponse (string): Raw text response from the LLM
- **Inputs:** Values in the params dict support {{}} template variables. The prompt field supports {{}} templates.
- **Outputs:** result (object — JSON returned by the LLM), rawResponse (text — raw text). For template references, object fields inside \`result\` are flattened to the top level.
- **Downstream reference examples:** {{llm_result.summary}}, {{llm_result.rawResponse}}. If the LLM returns \`{"summary": "..."}\`, use \`{{llm_result.summary}}\`, not \`{{llm_result.result.summary}}\`.
- **Tips**: Explicitly request a specific JSON structure in your prompt; params are automatically injected as context; recommended temperature 0.2
- **Data volume control**: LLM nodes are not suitable for processing large volumes of raw data. Params passed to the LLM should contain aggregated summary data (statistics, Top N, key metrics, etc.) — do not pass raw CSV data. If raw data processing is needed, use a Python node for aggregation/summarization first, then pass the results to the LLM node`;

const NODE_TYPE_EMAIL = `### Email Sending (email)

- **Description**: Sends emails via global SMTP configuration. Supports inline body or using an upstream node's output file as email content.
- **Capabilities**: Uses global SMTP config; supports HTML or plain text; can reference upstream Python node output files as content
- **Config schema**:
  \`\`\`json
  {
    "nodeType": "email",
    "to": "string (recipient email, supports {{}} template syntax)",
    "subject": "string (email subject, supports {{}} template syntax)",
    "contentSource": "'inline' | 'upstream' (content source: inline for direct body, upstream for referencing upstream field)",
    "body": "string (email body when contentSource is 'inline')",
    "upstreamField": "string (when contentSource is 'upstream', references an upstream node output field, e.g. {{report_gen.markdownPath}})",
    "isHtml": "boolean (whether the email is HTML format, default: true)",
    "outputVariable": "string (required, output variable name)"
  }
  \`\`\`
- **Output schema**:
  \`\`\`json
  {
    "success": "boolean (whether the email was sent successfully)",
    "messageId": "string (email message ID)",
    "recipients": "string[] (actual recipient list)"
  }
  \`\`\`
- **Inputs:** The to, subject, body, and upstreamField fields all support {{}} template variables. upstreamField can only reference outputs from upstream nodes reachable via edges.
- **Outputs:** success (boolean), messageId (text), recipients (string[])
- **Tips**: Confirm global SMTP is configured before sending; use upstream mode to reference a markdownPath field from a Python node's output as email content (e.g. \`{{report_gen.markdownPath}}\`); isHtml defaults to true — always use HTML format unless the user explicitly requests plain text`;

const NODE_TYPE_BRANCH = `### Branch (branch)

Conditional branch node that evaluates an upstream output field as Truthy/Falsy to control workflow branching.

**Config:**
- \`field\`: string — The variable to evaluate, using template syntax e.g. \`{{python_result.flag}}\`
- \`outputVariable\`: string — Output variable name

**Truthy evaluation rules (Python-style):**
- **Falsy (takes the No branch):** null, undefined, false, 0, NaN, empty string "", "false" (case-insensitive), empty array [], empty object {}
- **Truthy (takes the Yes branch):** All other values

**Output:**
- \`result\`: boolean — Evaluation result

**Tips:**
- For complex conditions, use a Python node to process and output a boolean value, then pass it to the Branch node
- Example: Python outputs \`{"result": {"should_continue": true}}\` → Branch field: \`{{python_result.should_continue}}\`
- When connecting downstream nodes, you must specify "true" or "false" via the sourceHandle parameter of the wf_connect_nodes tool
- sourceHandle="true" represents the Truthy branch, sourceHandle="false" represents the Falsy branch
- Downstream nodes can directly reference any upstream node's output via {{}}, the branch node does not pass through data`;

const NODE_TYPE_WEB_SEARCH = `### Web Search (web_search)

Web search node that calls the globally configured search engine to search for keywords, saving results as a Markdown file.

**Config:**
- \`params\`: key-value pairs for custom text inputs, supports \`{{}}\` templates
- \`keywords\`: string — Search keywords, supports \`{{}}\` template variables
- \`outputVariable\`: string — Output variable name

**Output:**
- \`markdownPath\`: string — Path to the search results Markdown file
- \`totalResults\`: number — Number of search results

**Inputs:** The params values and keywords field support {{}} template variables and can reference upstream string outputs.
**Outputs:** markdownPath (markdownFile), totalResults (number)
**Downstream reference examples:** {{search_result.markdownPath}}

**Tips:**
- Search engine type and parameters are configured in global settings; the node itself does not need search engine configuration
- The output Markdown file can be passed to downstream LLM nodes via {{webSearchNode.markdownPath}}`;

type SharedNodeEntry = {
  content: string;
  enabled: (configStatus: ConfigStatusResponse) => boolean;
  type: string;
};

const SHARED_NODE_ENTRIES: SharedNodeEntry[] = [
  { type: 'sql', content: NODE_TYPE_SQL, enabled: () => true },
  { type: 'python', content: NODE_TYPE_PYTHON, enabled: () => true },
  { type: 'llm', content: NODE_TYPE_LLM, enabled: (configStatus) => configStatus.llm },
  { type: 'email', content: NODE_TYPE_EMAIL, enabled: (configStatus) => configStatus.smtp },
  { type: 'branch', content: NODE_TYPE_BRANCH, enabled: () => true },
  {
    type: 'web_search',
    content: NODE_TYPE_WEB_SEARCH,
    enabled: (configStatus) => configStatus.webSearch,
  },
];

const SHARED_NODE_GUIDES = new Map(SHARED_NODE_ENTRIES.map((entry) => [entry.type, entry.content]));

export function buildSharedTempWorkdirGuidelines(tempWorkdir: string): string {
  const workFolderRoot = dirname(tempWorkdir);

  return `## Temp Workdir

- Current temp directory: \`${tempWorkdir}\`
- generated files must be written under this directory or its execution subdirectories
- Do not write directly under \`${workFolderRoot}\`
- Use short English snake_case filenames such as \`query_result.csv\`, \`report.md\`, or \`chart.png\`
- Python \`WORKSPACE\` points to the node execution temp directory at runtime and should be used for file writes in Python nodes
- Build file paths with \`os.path.join(WORKSPACE, 'filename')\` so files stay inside the runtime workspace`;
}

export function getSharedNodeTypeGuide(nodeType: string): string {
  return (
    SHARED_NODE_GUIDES.get(nodeType) ??
    `### Node Guide

No specific guide available for node type "${nodeType}".`
  );
}

export function getSharedNodeTypeDescriptions(configStatus: ConfigStatusResponse): string {
  return SHARED_NODE_ENTRIES.filter((entry) => entry.enabled(configStatus))
    .map((entry) => entry.content)
    .join('\n\n');
}
