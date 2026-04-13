# Agent Temp Workdir And Output Filenames Design

## Goal

Ensure all agent-generated workflow files are written under the current agent or execution temporary work directory instead of the workfolder root, and eliminate degraded filenames such as `_______output.csv` by enforcing English filenames and adding runtime fallbacks.

## Problem

Current behavior is inconsistent across agents:

- `CoreAgentSession` creates a per-session temp directory under `config.work_folder`, but it does not use the `wf_` naming convention used elsewhere in workflow execution.
- `CopilotAgent` tells the model to use the work folder or Python `WORKSPACE`, but does not inject the current temp directory path into the system prompt.
- `DebugAgent` executes nodes in temp directories named `databot_debug_<id>`, which diverges from the `wf_<id>` convention.
- SQL / Web Search / Python executors derive output filenames from sanitized node names. When the node name is Chinese or otherwise collapses during sanitization, filenames can degrade into low-information names like `_______output.csv`.

This leads to two user-visible failures:

1. Files are sometimes written to `/app/databot/workfolder` root instead of a per-run or per-agent subdirectory.
2. Output filenames are sometimes unreadable or unstable when the source node name is not ASCII-friendly.

## Scope

This design covers:

- Prompt-level path and filename rules for `CopilotAgent`, `DebugAgent`, and `CoreAgentSession`
- Runtime temp directory naming alignment
- Runtime filename fallback logic in workflow node executors
- Tests for prompt content, temp directory naming, and filename fallback behavior

This design does not cover:

- Changing workflow execution semantics
- New file management APIs
- Retrofitting historical run records

## Requirements

### Functional Requirements

1. Every agent must have a clearly defined temporary working directory under `/app/databot/workfolder`.
2. Temporary directories used by `CoreAgentSession`, workflow execution, and debug execution must use the `wf_<id>` naming convention.
3. System prompts for `CopilotAgent`, `DebugAgent`, and `CoreAgentSession` must explicitly tell the model:
   - the absolute current temporary work directory
   - that generated files must be written inside that directory by default
   - that `/app/databot/workfolder` root must not be used for file output
   - that generated filenames must use short English `snake_case`
4. Python node guidance must continue to instruct the model to use `WORKSPACE`, and the prompt must clarify that `WORKSPACE` maps to the current execution temp directory.
5. SQL, Web Search, and Python node executors must avoid degraded filenames when node names are non-English or sanitize poorly.
6. Executor-generated files must remain inside the current execution `workFolder`.

### Non-Functional Requirements

- Changes must preserve existing workflow behavior except for temp directory naming and filename generation.
- The prompt language must be direct and specific enough to reduce LLM ambiguity.
- Filename fallback logic must be deterministic and easy to read in logs.

## Options Considered

### Option 1: Prompt-only fix

Inject the current temp directory into prompts and add filename rules, but keep existing runtime directory naming and executor filename behavior.

Pros:

- Smallest code change

Cons:

- Leaves `wf_<id>` vs `databot_debug_<id>` inconsistency in place
- Does not prevent degraded filenames at runtime
- Over-relies on LLM compliance

### Option 2: Runtime-only fix

Fix temp directory naming and executor filename fallback, but keep prompts mostly generic.

Pros:

- Strong runtime guarantees

Cons:

- Does not improve LLM path selection when generating Python or SQL-related file references
- Root-cause ambiguity remains in prompts

### Option 3: Unified prompt + runtime fix

Align temp directory naming, inject explicit temp directory paths into prompts, and add runtime filename fallback in executors.

Pros:

- Prompt and runtime behavior become consistent
- Solves both wrong-directory output and degraded filename issues
- Applies uniformly to `copilot`, `debug`, and `coreAgent`

Cons:

- Touches more files and tests than the narrower options

### Chosen Approach

Choose Option 3.

This is the smallest complete fix. It removes the path ambiguity at the prompt layer while adding executor-side fallbacks so behavior remains correct even if the model ignores naming guidance.

## Design

### 1. Temporary Workdir Model

Treat the temp workdir as a first-class execution context.

- `CoreAgentSession` temp workdir changes from `<work_folder>/<shortId>` to `<work_folder>/wf_<shortId>`
- `InMemoryWorkflowAccessor` debug execution temp workdir changes from `<work_folder>/databot_debug_<id>` to `<work_folder>/wf_<id>`
- Normal workflow execution already uses `<work_folder>/wf_<id>` and remains unchanged

Result:

- All three paths follow the same visible convention
- Logs, prompts, and user expectations align on one directory pattern

### 2. Prompt Builder Changes

#### Copilot Prompt

Change `buildSystemPrompt(...)` to accept an explicit absolute temp workdir string and include a dedicated section such as:

- Current temporary work directory: `/app/databot/workfolder/wf_xxxx`
- All generated files must be written under this directory
- Never write generated files directly under `/app/databot/workfolder`
- Filenames must use short English `snake_case`

For Python-node guidance:

- Keep the existing `WORKSPACE` guidance
- Add that `WORKSPACE` is the current execution temp directory and is the correct base for file writes

Because `CopilotAgent` does not own a single long-lived execution directory today, the prompt should describe the current scoped workdir that file outputs must target for the active run context rather than leaving the instruction generic.

#### Debug Prompt

Change `buildDebugSystemPrompt(...)` to accept the current debug temp workdir and add the same directory and naming rules.

This is especially important because debug sessions run isolated single-node executions and currently have the highest chance of path confusion.

#### Core Agent Prompt

Keep the current prompt injection model in `CoreAgentSession`, but strengthen the wording:

- the exact absolute workdir must be shown
- the root workfolder is forbidden for file output
- generated filenames must be short English `snake_case`

### 3. Runtime Filename Fallback

Update filename generation in executors so filenames do not depend entirely on sanitized node names.

#### Shared rule

When a sanitized node name is empty, consists only of underscores, or otherwise has insufficient information value, fall back to a deterministic English base name.

#### SQL executor

Current:

- `${safeName}_output.csv`

New behavior:

- use sanitized node name if valid
- otherwise use `sql_output.csv`
- if collision resistance is needed, allow `sql_<shortNodeId>_output.csv`

#### Web Search executor

Current:

- `${safeName}_search.md`

New behavior:

- use sanitized node name if valid
- otherwise use `web_search_results.md`
- if needed, allow `web_search_<shortNodeId>_results.md`

#### Python executor

Current:

- `${safeName}_params.json`
- `${safeName}.py`
- `${safeName}_output.csv`

New behavior:

- use sanitized node name if valid
- otherwise fall back to:
  - `python_params.json`
  - `python_script.py`
  - `python_output.csv`
- if collision resistance is needed, allow short nodeId variants

### 4. Separation Between Display Name And File Name

Node names are user-facing labels and may remain Chinese or mixed-language.

Generated filenames are operational artifacts and must be optimized for:

- readability
- stability
- shell-friendliness
- log readability

Therefore, filename generation must no longer assume the node name is suitable as the primary filename source.

### 5. Error Handling

Prompt instructions should make root-directory output a rule violation.

Runtime behavior should continue to ensure executor-generated files are always written by joining filenames to `context.workFolder`, so even fallback filenames cannot escape the active execution directory.

No new user-facing error type is required for this change.

## Implementation Outline

1. Update `copilotPrompt.ts` to accept and render the current temp workdir and filename rules.
2. Update `copilotAgent.ts` to pass the temp workdir context into the prompt builder.
3. Update `debugPrompt.ts` to accept and render the current debug temp workdir and filename rules.
4. Update `debugAgent.ts` and/or `InMemoryWorkflowAccessor` so the prompt and runtime use the same `wf_<id>` temp directory convention.
5. Update `coreAgentSession.ts` to create `wf_<id>` directories and strengthen prompt wording.
6. Update SQL, Web Search, and Python executors with English fallback filename generation.
7. Add or update tests.

## Files Expected To Change

- `backend/src/copilot/copilotPrompt.ts`
- `backend/src/copilot/copilotAgent.ts`
- `backend/src/copilot/debugPrompt.ts`
- `backend/src/copilot/debugAgent.ts`
- `backend/src/copilot/workflowAccessor.ts`
- `backend/src/agent/coreAgentSession.ts`
- `backend/src/workflow/nodeExecutors/sqlNodeExecutor.ts`
- `backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts`
- `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts`
- prompt and agent tests under `backend/tests/...`

## Testing Strategy

### Prompt Tests

Add or update tests to verify:

- the prompt includes the absolute current temp workdir
- the prompt forbids writing to the workfolder root
- the prompt requires English `snake_case` filenames
- Python guidance still points to `WORKSPACE`

### Core Agent Tests

Verify:

- created temp directory path uses `wf_` prefix
- system prompt contains the exact absolute temp directory

### Debug Execution Tests

Verify:

- debug temp directories use `wf_` prefix
- debug prompt contains the exact temp directory

### Executor Tests

Verify for Chinese or non-ASCII node names:

- SQL output filename is not degraded to only underscores
- Web Search output filename is not degraded to only underscores
- Python generated artifact filenames are not degraded to only underscores
- all generated files remain within `context.workFolder`

## Acceptance Criteria

- Copilot-generated workflow artifacts are guided to the current `wf_<id>` temp directory rather than `/app/databot/workfolder` root.
- DebugAgent uses the same `wf_<id>` temp directory convention and prompt rules.
- CoreAgentSession uses the same `wf_<id>` temp directory convention and prompt rules.
- Executor-generated filenames no longer degrade into forms like `_______output.csv` or `_______search.md`.
- Existing workflow execution flow continues to work without new path regressions.

## Risks

### Risk: Copilot prompt asks for a directory that is not truly stable across all future executions

Mitigation:

- Keep the instruction framed around the current execution-scoped temp workdir
- Keep runtime enforcement in executors so prompt drift is not fatal

### Risk: Filename fallback causes collisions

Mitigation:

- Start with simple English fallback names
- If tests or existing behavior show collisions in a shared directory, append a short nodeId suffix

### Risk: Partial rollout creates prompt/runtime mismatch

Mitigation:

- Treat prompt changes and temp directory naming changes as one unit of work
- Land executor fallback in the same implementation batch

