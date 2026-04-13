# Copilot And Debug Tool Output Sanitization Design

## Overview

Prevent Copilot and debug-agent workflow tools from flooding LLM context when they read node configuration or execution results containing large payloads. The first priority is protecting against oversized text fields and embedded base64 content such as `data:image/...;base64,...`, while keeping enough structure and preview data for debugging.

## Problem

The current workflow-facing tools return raw objects:

- `wf_get_node` returns the full node definition and config
- `wf_get_run_result` returns the full workflow run detail or in-memory run output
- `wf_execute_node` executes a node and returns the same raw run result immediately

These results can contain:

- very long prompt or script fields
- large execution outputs from Python or markdown-producing nodes
- arrays and nested objects large enough to dominate model context
- base64 data URIs or long standalone base64 strings, especially image content

The file-oriented tools already defend against this pattern:

- `readFileTool` sanitizes long base64 content
- `readFileTool` truncates large line payloads
- `grepTool` also sanitizes base64-heavy lines

The workflow tools do not have an equivalent object-level safeguard, so a single tool call can consume a disproportionate share of the LLM token budget.

## Goals

- Add a reusable object-level sanitizer for data returned to LLMs
- Preserve overall result structure so agents can still reason about field paths
- Replace oversized fields with stable summary objects instead of raw payloads
- Treat text and base64 differently:
  - text keeps a small readable preview
  - base64 and image payloads keep type and size only
- Apply the sanitizer to Copilot and debug-agent workflow tools that expose node config and run outputs
- Keep the underlying persisted workflow/run data unchanged

## Non-Goals

- Do not change database persistence or stored workflow run records
- Do not change ordinary API responses intended for the frontend unless they explicitly opt into the sanitizer later
- Do not replace the existing `readFileTool` and `grepTool` sanitization path in this change
- Do not introduce field-specific business rules for every node type in the first iteration

## Selected Approach

Introduce a generic `sanitizeForLlm(value, options?)` utility that recursively walks JSON-like data and returns an LLM-safe copy. The workflow tools that directly expose node configs or execution results call this utility before returning data to the agent.

This keeps the protection reusable and centralized while preserving a clear boundary:

- raw accessors and services still return raw data
- LLM-facing tools explicitly request a safe view

## Alternatives Considered

### 1. Tool-specific hand-written truncation in each workflow tool

Pros:

- smallest initial patch
- minimal design work

Cons:

- duplicated logic across `wf_get_node`, `wf_get_run_result`, and `wf_execute_node`
- inconsistent behavior as more tools adopt similar protections
- no clean reuse for other agent-facing interfaces

### 2. Reusable object sanitizer plus explicit tool-level adoption

Pros:

- single set of rules for LLM-safe object summarization
- easy to reuse for future agent tools, WebSocket events, or prompt assembly
- keeps responsibilities clear between raw data access and safe LLM presentation

Cons:

- slightly more design and testing work up front

### 3. Sanitize inside accessor or service methods by default

Pros:

- strongest global guardrail

Cons:

- blurs the boundary between domain data and presentation-for-LLM
- increases risk that future non-LLM callers accidentally receive summarized data instead of raw content

## User-Validated Decisions

- Summary style: keep structure, but replace large fields with summary metadata instead of raw payloads
- Reuse target: implement the sanitizer as a general object-level utility, not a one-off workflow patch
- Summary detail:
  - text fields keep a short prefix preview plus size
  - base64 and embedded images keep type and size only

## Functional Design

### 1. Sanitizer Module

Add a reusable utility module for JSON-like value sanitization. A suitable location is near the existing tool sanitization helpers, for example:

- `backend/src/infrastructure/tools/objectSanitizer.ts`

It should export a focused entry point:

```ts
sanitizeForLlm(value: unknown, options?: SanitizerOptions): SanitizedValue
```

The utility operates on returned data only. It must not mutate the original object.

### 2. Output Shape

The sanitizer should preserve the original container structure whenever practical. Oversized fields are replaced in place with summary objects.

Example:

```json
{
  "config": {
    "prompt": {
      "_summary": {
        "kind": "text",
        "chars": 12840,
        "preview": "Summarize the following records..."
      }
    },
    "image": {
      "_summary": {
        "kind": "base64",
        "mimeType": "image/png",
        "chars": 248331
      }
    }
  }
}
```

In addition, the top-level sanitized payload should include one metadata object indicating that summarization occurred, for example:

```json
{
  "_sanitized": {
    "applied": true,
    "reasons": ["large_text", "base64", "array_truncated"]
  }
}
```

This metadata appears only at the returned root object, not on every nested object.

### 3. Summary Rules By Value Type

#### Strings

Short strings remain unchanged.

Long ordinary text strings are replaced with:

- `kind: "text"`
- original character length
- a short prefix preview

The preview exists to keep debugging useful without returning the entire text body.

#### Base64 And Data URIs

If a string matches long base64 content or a base64 data URI:

- replace it with `kind: "base64"`
- include character length
- include MIME type when detectable from a data URI
- do not include any preview of the original payload

This is the critical safeguard for image-heavy content and must be stricter than ordinary text handling.

#### Arrays

Arrays should preserve item order but keep only the first N sanitized items once the configured item cap is reached. The array should then expose a summary marker describing:

- total item count
- kept item count
- that additional items were omitted

The exact encoding may be either:

- a trailing summary object in the array, or
- replacing the whole array with a summary object plus a small `items` preview field

The implementation should choose one representation and use it consistently. The preferred representation for the first version is to replace the whole array with a summary wrapper when truncation is required, because it is less ambiguous than mixing data items and metadata entries in one array.

#### Objects

Objects should be recursively sanitized field by field while preserving keys when within budget. When key-count, depth, or total-budget limits are exceeded, a nested object may be replaced with an object summary containing:

- `kind: "object"`
- key count when known
- optional note that child fields were omitted due to budget

#### Unsupported Or Exceptional Values

If the sanitizer encounters:

- circular references
- non-plain objects that do not serialize cleanly
- values that throw during inspection

it should replace them with a stable summary object such as `kind: "unsupported"` or `kind: "circular"` instead of throwing.

### 4. Budget Model

The sanitizer must enforce multiple limits instead of relying on a single string threshold.

Recommended default controls:

- maximum characters for one text field before summarization
- maximum preview characters for summarized text
- maximum array items preserved before array summarization
- maximum object depth
- maximum keys per object before summarization of a sub-tree
- maximum total output budget for the sanitized root

The total-budget rule matters because a result can still be too large even if no single field is extreme.

When the total budget is exceeded, the sanitizer should continue compressing lower-priority content in this order:

1. reduce long text fields to summaries
2. summarize large arrays
3. summarize large nested objects
4. if needed, reduce preview size further

This gives predictable behavior while preserving as much useful structure as possible.

### 5. Detection Rules

Base64 detection should reuse the same conceptual rules already present in `contentSanitizer.ts`:

- detect `data:<mime>;base64,<payload>`
- detect long standalone base64 runs

The new sanitizer may either reuse shared helpers directly or extract shared detection primitives so file tools and object tools do not drift apart.

The behavior must remain consistent with existing file-tool expectations:

- short base64-like strings stay untouched
- long image/data payloads are summarized

### 6. Tool Adoption

Adopt the sanitizer in the workflow tools most likely to expose large payloads to the LLM:

- `wf_get_node`
- `wf_get_run_result`
- `wf_execute_node`

These tools should return the sanitized view on success.

The tool descriptions should also mention that large fields may be summarized for LLM safety so the agent does not assume all content is always raw.

### 7. Boundary Between Raw Data And Safe View

The sanitizer applies only at the point where results are returned to the agent. It must not alter:

- saved workflow node configuration in storage
- saved workflow run outputs in storage
- in-memory run results stored by `InMemoryWorkflowAccessor`
- frontend API responses that do not explicitly opt in

This boundary keeps the system debuggable and avoids contaminating domain data with presentation-specific summaries.

## Data Flow

### `wf_get_node`

1. Tool loads the workflow node from the accessor
2. Tool sanitizes the node payload
3. Tool returns the sanitized node to the agent

### `wf_get_run_result`

1. Tool loads the run result from the accessor
2. Tool sanitizes the run detail or in-memory output object
3. Tool returns the sanitized payload to the agent

### `wf_execute_node`

1. Tool executes the target node
2. Tool loads the resulting run result
3. Tool sanitizes the run result before returning it

## Error Handling

- Sanitization is best-effort and should not introduce a new user-visible failure mode for otherwise successful tool calls
- If a value cannot be inspected safely, summarize it as unsupported content instead of throwing
- Existing tool error behavior remains unchanged for missing node IDs, missing run IDs, execution failures, and workflow lookup failures

## Testing Strategy

### Unit Tests For The Sanitizer

Add focused tests covering:

- short strings remain unchanged
- long text strings become text summaries with preview
- data URI base64 becomes base64 summaries with MIME type
- standalone long base64 becomes base64 summaries without preview
- nested object sanitization preserves structure where possible
- oversized arrays are summarized consistently
- depth and key-count limits summarize sub-trees
- total-budget pressure triggers additional compaction
- circular or unsupported values become stable summary objects

### Tool-Level Tests

Add or extend tests covering:

- `wf_get_node` sanitizes oversized config fields
- `wf_get_run_result` sanitizes oversized outputs and embedded base64 payloads
- `wf_execute_node` returns the same sanitized shape as `wf_get_run_result`
- small payloads still return in near-original form without unnecessary summary noise

### Regression Coverage

Keep existing `readFileTool` and `grepTool` behavior unchanged unless shared helper extraction requires minor internal refactoring. Their current base64 sanitization expectations must still pass.

## Open Implementation Decisions

The following implementation choices should be finalized during planning and kept consistent in code:

- exact default thresholds for text, arrays, depth, and total budget
- whether shared base64 detection stays in `contentSanitizer.ts` or moves to a lower-level helper
- the exact representation for summarized arrays when truncation occurs

These are implementation details, not product-facing requirements. The design requires only that the representation be stable, testable, and consistent across tools.

## Success Criteria

- Copilot and debug-agent workflow tools no longer return raw large base64 payloads to the LLM
- Large text and nested results are summarized before reaching model context
- Agents still receive enough structure and preview content to reason about node configs and run failures
- The sanitization logic is reusable for future LLM-facing interfaces
