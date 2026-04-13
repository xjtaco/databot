import { config } from '../base/config';
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
- **Inputs:** The sql field supports {{}} template variables to reference upstream outputs, e.g. {{python_result.result.status}}
- **Outputs:** csvPath (csvFile), totalRows (number), columns (string[]), previewData (object[])
- **Downstream reference examples:** {{query_result.csvPath}}, {{query_result.totalRows}}
- **Tips**: Read the config.ini file in the datasource's dictionary directory to get the datasource_id for the datasourceId field; use \`{{}}\` to reference upstream node data; downstream Python nodes can read CSV via csvPath`;

const NODE_TYPE_PYTHON = `### Python Script (python)

- **Description**: Executes Python scripts in a secure sandbox (Docker). Can receive upstream parameters, process data, and output results.
- **Capabilities**: Docker-isolated execution; params receive upstream data; outputs JSON via the \`result\` variable; optional file outputs for larger generated artifacts
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
- **Outputs:** result (object), csvPath (csvFile, optional), stderr (text)
- **Downstream reference examples:** {{result.key}}, {{result.csvPath}}
- **Tips**: Access inputs via the \`params\` dict; \`result\` must be a JSON-serializable dict; use pandas for CSV processing; the script has a predefined \`WORKSPACE\` variable pointing to the node execution temp directory at runtime — prefer \`os.path.join(WORKSPACE, 'filename')\` for file paths when the node needs to write artifacts; small structured outputs may still return directly in \`result\`, but large outputs should prefer files under \`WORKSPACE\`; when the result can be a file, prefer returning the file path instead of large text; common file path fields include \`markdownPath\`, \`txtPath\`, \`jsonPath\`, and \`csvPath\`; the final user-facing answer should mention the file path instead of pasting full contents
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
- **Outputs:** result (object — JSON returned by the LLM), rawResponse (text — raw text)
- **Downstream reference examples:** {{llm_result.result.summary}}, {{llm_result.rawResponse}}
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
    "upstreamField": "string (when contentSource is 'upstream', references an upstream node output field, e.g. {{report_gen.result.markdownPath}})",
    "isHtml": "boolean (whether the email is HTML format, default: true)",
    "outputVariable": "string (required, output name)"
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
- **Tips**: Confirm global SMTP is configured before sending; use upstream mode to reference a markdownPath field from a Python node's result as email content (e.g. \`{{report_gen.result.markdownPath}}\`); isHtml defaults to true — always use HTML format unless the user explicitly requests plain text`;

const NODE_TYPE_BRANCH = `### Branch (branch)

Conditional branch node that evaluates an upstream output field as Truthy/Falsy to control workflow branching.

**Config:**
- \`field\`: string — The variable to evaluate, using template syntax e.g. \`{{python_result.result.flag}}\`
- \`outputVariable\`: string — Output variable name

**Truthy evaluation rules (Python-style):**
- **Falsy (takes the No branch):** null, undefined, false, 0, NaN, empty string "", "false" (case-insensitive), empty array [], empty object {}
- **Truthy (takes the Yes branch):** All other values

**Output:**
- \`result\`: boolean — Evaluation result

**Tips:**
- For complex conditions, use a Python node to process and output a boolean value, then pass it to the Branch node
- Example: Python outputs \`{"result": {"should_continue": true}}\` → Branch field: \`{{python_result.result.should_continue}}\`
- When connecting downstream nodes, you must specify "true" or "false" via the sourceHandle parameter of the wf_connect_nodes tool
- sourceHandle="true" represents the Truthy branch, sourceHandle="false" represents the Falsy branch
- Downstream nodes can directly reference any upstream node's output via {{}}, the branch node does not pass through data`;

const NODE_TYPE_WEB_SEARCH = `### Web Search (web_search)

Web search node that calls the globally configured search engine to search for keywords, saving results as a Markdown file.

**Config:**
- \`keywords\`: string — Search keywords, supports \`{{}}\` template variables
- \`outputVariable\`: string — Output variable name

**Output:**
- \`markdownPath\`: string — Path to the search results Markdown file
- \`totalResults\`: number — Number of search results

**Inputs:** The keywords field supports {{}} template variables and can reference upstream string outputs.
**Outputs:** markdownPath (markdownFile), totalResults (number)
**Downstream reference examples:** {{search_result.markdownPath}}

**Tips:**
- Search engine type and parameters are configured in global settings; the node itself does not need search engine configuration
- The output Markdown file can be passed to downstream LLM nodes via {{webSearchNode.markdownPath}}`;

const NODE_TYPE_GUIDES: Record<string, string> = {
  sql: NODE_TYPE_SQL,
  python: NODE_TYPE_PYTHON,
  llm: NODE_TYPE_LLM,
  email: NODE_TYPE_EMAIL,
  branch: NODE_TYPE_BRANCH,
  web_search: NODE_TYPE_WEB_SEARCH,
};

export function buildSharedTempWorkdirGuidelines(tempWorkdir: string): string {
  return `## Temp Workdir

- Current temp directory: \`${tempWorkdir}\`
- generated files must be written under this directory
- Do not write directly under \`${config.work_folder}\`
- Use short English snake_case filenames such as \`query_result.csv\`, \`report.md\`, or \`chart.png\`
- Python \`WORKSPACE\` points to the node execution temp directory at runtime and should be used for file writes in Python nodes
- Build file paths with \`os.path.join(WORKSPACE, 'filename')\` so files stay inside the runtime workspace`;
}

export function getSharedNodeTypeGuide(nodeType: string): string {
  return NODE_TYPE_GUIDES[nodeType] ?? `### Node Guide

No specific guide available for node type "${nodeType}".`;
}

export function getSharedNodeTypeDescriptions(configStatus: ConfigStatusResponse): string {
  const sections = [NODE_TYPE_SQL, NODE_TYPE_PYTHON];
  if (configStatus.llm) sections.push(NODE_TYPE_LLM);
  if (configStatus.smtp) sections.push(NODE_TYPE_EMAIL);
  sections.push(NODE_TYPE_BRANCH);
  if (configStatus.webSearch) sections.push(NODE_TYPE_WEB_SEARCH);

  return ['## Node Type Reference', ...sections].join('\n\n---\n\n');
}
