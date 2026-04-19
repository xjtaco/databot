# Copilot Template Fields Design

## Problem

Copilot can create an upstream Python node, execute it successfully, and then create downstream templates that reference fields the upstream node did not actually expose. A typical failure looks like:

```text
Template field not found: ecommerce_monthly.months
Available output variables and their fields:
  - ecommerce_monthly: { csvPath, stderr, raw_output }
```

The upstream node executed, but its real template fields are only `csvPath`, `stderr`, and `raw_output`. Fields such as `months` or `total_sales_qty` were inferred from Copilot's intended script logic, not from the actual workflow output contract.

The existing result-flattening change makes correct Python outputs easy to reference:

```python
result = {"months": months}
```

can be referenced as:

```text
{{ecommerce_monthly.months}}
```

However, if the Python script prints data instead of assigning it to `result`, the engine exposes `raw_output`, not structured business fields. Copilot needs an explicit tool-level signal that tells it when upstream output must be fixed before downstream templates are generated.

## Goals

- Expose real template-referenceable fields from workflow execution results.
- Mark Python raw-output fallbacks with `needsUpstreamFix: true`.
- Teach Copilot to reference only fields listed by the tool result.
- Make unresolved-template errors explain why `raw_output` cannot be used as inferred structured fields.
- Keep the first implementation small and deterministic; no hard-coded automatic repair state machine.

## Non-Goals

- Do not block all downstream node creation at the tool layer.
- Do not parse `raw_output` to infer fields.
- Do not introduce a new Python execution protocol.
- Do not change existing template syntax.
- Do not remove node-name compatibility from the resolver, although prompts should prefer `outputVariable`.

## Design

### Template Field Summary

Add a pure helper in a new file:

```text
backend/src/workflow/templateFields.ts
```

It builds a summary from an already-flattened output record.

```ts
export interface TemplateFieldSummary {
  fields: string[];
  hasRawOutput: boolean;
  needsUpstreamFix: boolean;
  warnings: string[];
}
```

Rules:

- `fields` includes own enumerable keys whose value is not `undefined`.
- Internal metadata fields should not be recommended as template fields, such as `_sanitized`.
- `hasRawOutput` is true when the output has a `raw_output` key.
- `needsUpstreamFix` is true when `hasRawOutput` is true.
- `warnings` explains that printed stdout is not split into template fields and that downstream values must be assigned to Python `result`.

Example raw-output summary:

```json
{
  "fields": ["csvPath", "stderr", "raw_output"],
  "hasRawOutput": true,
  "needsUpstreamFix": true,
  "warnings": [
    "Python node returned raw_output. Values printed to stdout are not template fields. Fix the upstream Python script by assigning downstream fields to result, then re-execute it."
  ]
}
```

Example structured-output summary:

```json
{
  "fields": ["months", "total_sales_qty", "stderr"],
  "hasRawOutput": false,
  "needsUpstreamFix": false,
  "warnings": []
}
```

### Copilot Tool Results

Enhance `wf_execute_node` so the returned data includes the executed node's template-field summary.

Suggested shape:

```json
{
  "runId": "run-id",
  "output": {
    "csvPath": "/tmp/out.csv",
    "stderr": "",
    "raw_output": "..."
  },
  "templateFields": {
    "fields": ["csvPath", "stderr", "raw_output"],
    "hasRawOutput": true,
    "needsUpstreamFix": true,
    "warnings": ["..."]
  }
}
```

For `wf_get_run_result`, run details may include many node runs. Return a run-level wrapper with per-node field summaries:

```json
{
  "run": {},
  "nodeTemplateFields": [
    {
      "nodeId": "node-id",
      "nodeName": "process_ecommerce_monthly",
      "outputVariable": "ecommerce_monthly",
      "fields": ["csvPath", "stderr", "raw_output"],
      "hasRawOutput": true,
      "needsUpstreamFix": true,
      "warnings": ["..."]
    }
  ]
}
```

Apply normal LLM sanitization after adding these summaries. The summary should remain small and should not include raw values.

### Error Messages

When unresolved template validation fails, keep the existing available-fields block and append a diagnostic note for any output that contains `raw_output`.

Example:

```text
Note: ecommerce_monthly has raw_output and needs upstream fix. Printed stdout is not split into template fields. Set result["months"] or result = {"months": ...} in the upstream Python node, then re-run it.
```

This helps both users and Copilot distinguish between a wrong downstream field name and an upstream Python output contract problem.

### Prompt Rules

Update Copilot's system prompt with hard rules:

```text
After executing any upstream node, inspect templateFields.fields before creating downstream templates.

Only reference fields explicitly listed in templateFields.fields.

If templateFields.needsUpstreamFix is true, do not create or keep downstream references to inferred business fields. Fix the upstream Python node first so required fields are assigned to result, re-execute it, and continue only after needsUpstreamFix is false.
```

Update Python node guidance:

```text
Values needed by downstream templates must be assigned to result. print() output is exposed only as raw_output and is not split into template fields.
```

## Data Flow

1. Copilot creates or updates an upstream node.
2. Copilot runs the node with `wf_execute_node`.
3. The tool returns `templateFields`.
4. If `needsUpstreamFix` is false, Copilot may use fields listed in `templateFields.fields`.
5. If `needsUpstreamFix` is true, Copilot must fix the upstream Python node so required values are assigned to `result`.
6. Copilot re-runs the upstream node and checks that the needed fields now appear.
7. Copilot creates downstream templates using only confirmed fields.

## Error Handling

- Missing template fields still fail before executor execution.
- `raw_output` diagnostics do not suppress or downgrade failures.
- Tool results with `needsUpstreamFix` remain successful executions. The flag describes output contract quality, not process failure.
- Sanitization should not remove the `templateFields` summary.

## Tests

Add focused tests for:

- `buildTemplateFieldSummary()` returns `needsUpstreamFix: true` for outputs with `raw_output`.
- `buildTemplateFieldSummary()` returns `needsUpstreamFix: false` for structured flattened outputs.
- `wf_execute_node` includes `templateFields`.
- `wf_get_run_result` includes `nodeTemplateFields`.
- unresolved-template errors include the raw-output upstream-fix note.
- Copilot prompt includes the `templateFields` and `needsUpstreamFix` rules.

Recommended verification commands:

```bash
pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/copilotTools.test.ts tests/workflow/templateResolver.test.ts tests/workflow/executionEngine.test.ts
pnpm run typecheck
```

## Implementation Notes

- Build summaries from flattened outputs, not raw executor outputs.
- Keep the helper pure and independent from Copilot code so workflow errors and Copilot tools share identical behavior.
- Preserve existing resolver compatibility with node names, but continue prompting Copilot to generate `outputVariable` references.
- Do not infer structured template fields from `raw_output`; requiring explicit `result` assignment is the contract.
