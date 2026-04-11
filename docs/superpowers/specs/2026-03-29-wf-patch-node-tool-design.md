# wf_patch_node Copilot Tool Design

## Problem

When the copilot builds SQL or Python nodes and the script has errors, fixing them currently requires `wf_update_node` to rewrite the entire `sql` or `script` field. This wastes LLM tokens and risks introducing new errors in previously correct parts of the content.

## Solution

Add a new copilot tool `wf_patch_node` that performs targeted string replacement within a node's text content field, inspired by the `editTool` pattern used for file editing. Unlike the file-level `editTool` which replaces all occurrences via `split/join`, `wf_patch_node` replaces a single targeted occurrence to minimize unintended changes — a safer default for LLM-driven editing.

## Scope

- **Phase 1 (this spec):** Error fixing scenario — copilot uses `wf_patch_node` to partially fix SQL/Python/Prompt content after execution failures.
- **Phase 2 (future):** General editing — extend to any modification scenario (user-requested logic changes, query optimization, etc.)

## Tool Interface

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Target node ID |
| `old_string` | string | Yes | Exact text fragment to replace |
| `new_string` | string | Yes | Replacement text (empty string is valid — acts as deletion) |
| `occurrence` | number | No | Which match to replace (1-based, default: 1, minimum: 1) |

### Target Field Auto-Detection

The tool automatically determines which config field to edit based on `nodeType`:

| Node Type | Target Field |
|-----------|-------------|
| `sql` | `config.sql` |
| `python` | `config.script` |
| `llm` | `config.prompt` |
| `email` | Not supported (error) |

Email nodes are excluded because their text fields (`to`, `subject`, `body`) are short and better served by `wf_update_node`.

### Return Value

Same structure as `wf_update_node`:

```typescript
{
  success: true,
  data: {
    id: string,
    name: string,
    type: string,
    config: NodeConfig
  }
}
```

## Core Logic

1. Validate parameters: `nodeId`, `old_string`, `new_string` required; `old_string !== new_string`; `old_string` non-empty; `occurrence >= 1` if provided
2. Load workflow from database, find target node by `nodeId`
3. Determine target field from `nodeType`; reject `email` nodes with error
4. Scan target field content for all occurrences of `old_string` using `indexOf` loop
5. If zero matches found: return error `old_string not found in node content`
6. If `occurrence` exceeds total match count: return error `occurrence N exceeds total matches (M found)`
7. Replace the Nth occurrence by locating its start index and concatenating `before + new_string + after`
8. Write the patched content back to the config field
9. Save workflow via `service.saveWorkflow()`
10. Return updated node info

### Nth-Occurrence Replacement Algorithm

```
function replaceNthOccurrence(content, oldString, newString, occurrence):
  position = 0
  for i = 1 to occurrence:
    index = content.indexOf(oldString, position)
    if index === -1: error "not found"
    if i === occurrence:
      return content.slice(0, index) + newString + content.slice(index + oldString.length)
    position = index + oldString.length
```

## Integration Points

All changes are within the backend. No frontend changes required.

### copilotTools.ts

1. Insert `'wf_patch_node'` after `'wf_update_node'` in the `COPILOT_TOOL_NAMES` array
2. Add `WfPatchNodeTool` class after `WfUpdateNodeTool` (same pattern: extends `Tool`, constructor takes `workflowId`)
3. Register `new WfPatchNodeTool(workflowId)` in `createCopilotToolRegistry`

### copilotPrompt.ts

1. Update `TOOL_USAGE_GUIDELINES` to instruct the copilot:

   > When fixing SQL/Python/Prompt content in nodes, prefer `wf_patch_node` for targeted replacement over `wf_update_node` full rewrite. Only provide the erroneous fragment and its correction.

2. Update `WORKFLOW_BUILD_GUIDELINES` validation rule to include `wf_patch_node` alongside `wf_update_node`:

   > Every time you add (`wf_add_node`) or modify (`wf_update_node` / `wf_patch_node`) a node config, you must use `wf_execute_node` to validate it.

## Error Cases

| Scenario | Error Message |
|----------|--------------|
| `nodeId` not found | `Node '{nodeId}' not found` |
| Email node type | `wf_patch_node does not support email nodes. Use wf_update_node instead.` |
| `old_string` not in content | `old_string not found in node content` |
| `occurrence` out of range | `occurrence {N} exceeds total matches ({M} found)` |
| `old_string === new_string` | `old_string and new_string cannot be the same` |
| `old_string` empty | `old_string cannot be empty` |
| `occurrence` < 1 | `occurrence must be a positive integer` |
| `nodeId` missing/empty | `nodeId is required` |

## Unit Tests

Test file: `backend/tests/wfPatchNodeTool.test.ts` (follows existing flat convention alongside `copilotTools.test.ts`)

1. **Normal replacement** — replace first (default) occurrence in a SQL node's `sql` field
2. **Specified occurrence** — replace the 2nd occurrence when `old_string` appears multiple times
3. **Python script** — patch `config.script` field of a Python node
4. **LLM prompt** — patch `config.prompt` field of an LLM node
5. **Multiline old_string** — patch a multi-line SQL fragment
6. **Deletion via empty new_string** — replace `old_string` with `""` to delete a fragment
7. **old_string not found** — returns error
8. **occurrence out of range** — returns error when occurrence exceeds match count
9. **occurrence < 1** — returns error for zero or negative values
10. **Email node rejected** — returns error for email node type
11. **old_string equals new_string** — returns error
12. **nodeId missing/empty** — returns error

## Files Changed

| File | Change |
|------|--------|
| `backend/src/copilot/copilotTools.ts` | Add `WfPatchNodeTool` class, register in factory, update tool name list |
| `backend/src/copilot/copilotPrompt.ts` | Add `wf_patch_node` guidance in tool usage and workflow build guidelines |
| `backend/tests/wfPatchNodeTool.test.ts` | New test file |
| `backend/tests/copilotTools.test.ts` | Update workflow tool count assertion and add `wf_patch_node` to name check |
