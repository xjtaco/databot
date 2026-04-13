# Copilot And Debug Shared Node Prompt Design

## Goal

Unify the node-type usage guidance used by `CopilotAgent` and `DebugAgent`, remove duplicated prompt text that can drift over time, and strengthen Python-node guidance so large execution results are written to files instead of being dumped into chat responses.

## Problem

The current prompt setup has two separate sources of truth for node guidance:

- `backend/src/copilot/copilotPrompt.ts` contains the main workflow-building node descriptions
- `backend/src/copilot/debugPrompt.ts` contains a second set of single-node debug guides

This causes two concrete problems:

1. Node usage guidance can drift between Copilot and DebugAgent because the text is maintained in two places.
2. Python-node guidance is not explicit enough about handling large outputs. The model may place long reports, large tables, or verbose text directly into result payloads or chat summaries instead of writing them to files and returning file paths.

## Scope

This design covers:

- shared prompt-building code for node-type descriptions and temp-workdir guidance
- Python-node prompt rules for large-result file output
- prompt test updates for both Copilot and DebugAgent

This design does not cover:

- changing workflow tool behavior
- adding new node output fields at runtime
- changing executor semantics or storage format

## Requirements

### Functional Requirements

1. `CopilotAgent` and `DebugAgent` must consume the same shared node-type guidance for overlapping node types.
2. Shared prompt code must support:
   - building a full multi-node description block for `copilotPrompt.ts`
   - building a single-node guide for `debugPrompt.ts`
   - building shared temp-workdir guidance used by both prompts
3. Python-node guidance must explicitly state:
   - small outputs may be returned directly in `result`
   - large outputs must be written to files under `WORKSPACE`
   - when a result can reasonably be output as a file, prefer writing a file and returning the path
   - the final user-facing response should report the result file path instead of pasting large bodies of text
4. Existing node-specific guidance that only belongs to one agent must remain in that agent's prompt file.
5. Existing Copilot config-dependent node filtering behavior must continue to work.

### Non-Functional Requirements

- Shared prompt code should isolate reusable node knowledge from agent-specific workflow instructions.
- Prompt wording should be direct and operational, not aspirational.
- Tests should fail if Python large-result file guidance disappears from either Copilot or Debug prompt assembly.

## Options Considered

### Option 1: Fully shared node prompt module

Create a shared prompt module that owns reusable node descriptions and shared temp-workdir rules. Keep agent role, tools, and workflow instructions inside `copilotPrompt.ts` and `debugPrompt.ts`.

Pros:

- single source of truth for node guidance
- lowest future drift risk
- clean separation between node knowledge and agent behavior

Cons:

- requires prompt code reorganization
- touches both prompt builders and tests

### Option 2: Duplicate text updates in both prompt files

Edit both prompt files directly and add tests asserting both contain the same wording.

Pros:

- smallest immediate patch

Cons:

- duplicated text remains
- future drift remains likely

### Option 3: Partially shared fragments only

Extract only a few shared strings such as Python-node rules and temp-workdir guidance, while keeping the rest of the node descriptions split between the two prompt files.

Pros:

- smaller refactor than full sharing

Cons:

- unclear ownership boundary
- some drift risk remains

## Chosen Approach

Choose Option 1.

The goal is not just to sync wording once. It is to eliminate repeated node guidance as an ongoing maintenance risk. A dedicated shared node-prompt module is the smallest durable fix.

## Design

### 1. Shared Prompt Module Boundary

Add a new shared module under `backend/src/copilot/`:

- `nodePromptShared.ts`

This module owns only reusable node-related prompt content:

- shared temp-workdir guidance
- shared node-type descriptions
- shared Python-node large-result guidance

This module must not own:

- agent role text
- available tool lists
- Copilot workflow-building process guidance
- DebugAgent step-by-step debugging workflow

That boundary keeps responsibilities clear and prevents the shared module from becoming a second full prompt builder.

### 2. Shared APIs

The shared module should expose a small set of builders:

- `buildSharedTempWorkdirGuidelines(tempWorkdir: string): string`
- `getSharedNodeTypeGuide(nodeType: string): string`
- `getSharedNodeTypeDescriptions(configStatus?: ConfigStatusResponse): string`

Expected usage:

- `copilotPrompt.ts` uses `getSharedNodeTypeDescriptions(...)` and `buildSharedTempWorkdirGuidelines(...)`
- `debugPrompt.ts` uses `getSharedNodeTypeGuide(node.type)` and `buildSharedTempWorkdirGuidelines(...)`

If the Copilot prompt currently filters node descriptions based on config availability, that filtering should remain at the shared builder boundary so the behavior stays unchanged for callers.

### 3. Python Node Guidance Change

The shared Python-node guide should retain current `WORKSPACE` and file-writing guidance, and add a dedicated large-result rule section.

Required semantics:

- Small structured outputs can still be returned directly in `result`.
- For large outputs such as reports, long text, detailed tables, exported records, or generated artifacts, prefer writing files under `WORKSPACE`.
- When the result can reasonably be represented as a file, prefer returning a file path rather than embedding large text in the output.
- The prompt should encourage returning path fields such as `markdownPath`, `txtPath`, `jsonPath`, or `csvPath` as appropriate to the generated artifact.
- The final user-facing answer should mention the output file path instead of repeating the full file contents in chat.

This is intentionally a medium-strength rule:

- it does not ban direct small outputs
- it does require file output for large results

### 4. Copilot Prompt Integration

`backend/src/copilot/copilotPrompt.ts` remains responsible for:

- role and task framing
- workflow build guidelines
- template syntax reference
- tool usage rules
- auto-fix instructions
- node debugging guidance

It should stop hardcoding per-node descriptions and shared temp-workdir text locally. Instead, it should assemble the final prompt by importing the shared builders and combining them with Copilot-specific sections.

### 5. Debug Prompt Integration

`backend/src/copilot/debugPrompt.ts` remains responsible for:

- single-node debug role
- current-node context block
- available tools list
- debugging workflow
- mockInputs guidance
- output format rules

It should stop maintaining an independent node guide switch with duplicated guidance for overlapping node types. Instead, it should use the shared node-guide builder for the current node type, while retaining debug-only scaffolding around that guide.

### 6. Temp Workdir Guidance Unification

Both prompts already describe temp-workdir rules in nearly identical language. That text should move into the shared module and be rendered identically in both prompts.

This ensures both agents consistently say:

- the current absolute temp directory
- generated files must be written under that directory
- the work-folder root must not be used directly
- Python `WORKSPACE` maps to the runtime node temp directory

### 7. Testing Strategy

#### Shared module tests

Add focused tests for the shared builders:

- Python-node guide includes large-result file-output rules
- shared temp-workdir guidance renders the required directory constraints
- single-node and multi-node builders both reuse the same Python guidance

#### Copilot prompt tests

Update `backend/tests/copilotPrompt.test.ts` to verify:

- the assembled system prompt still includes expected node guidance
- Python-node guidance includes the new large-result file-output rules
- shared temp-workdir rules are present
- config-dependent node filtering still works

#### Debug prompt tests

Update `backend/tests/copilot/debugPrompt.test.ts` to verify:

- Python debug prompt includes the same large-result guidance
- shared temp-workdir rules are present
- debug-only role and workflow instructions still remain in the final prompt

## File Changes

- Add: `backend/src/copilot/nodePromptShared.ts`
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/debugPrompt.ts`
- Add or modify prompt tests under `backend/tests/`

## Acceptance Criteria

- `copilotPrompt.ts` and `debugPrompt.ts` no longer maintain separate duplicated node guidance for shared node types.
- Python-node prompt guidance explicitly requires file output for large results and asks the final response to report file paths.
- Copilot and Debug prompt tests both assert the new Python guidance.
- Existing prompt behavior outside node guidance remains intact.

## Risks And Mitigations

### Risk: Shared builder becomes too broad

Mitigation:

- keep the shared module limited to node knowledge and temp-workdir wording
- keep agent roles, tool lists, and workflows in their current prompt files

### Risk: Config filtering regresses during extraction

Mitigation:

- preserve filtering at the shared multi-node builder boundary
- keep explicit tests for unavailable node types

### Risk: Prompt wording over-constrains Python nodes

Mitigation:

- keep the rule medium-strength: small outputs may still return directly
- only require file output for large results or file-shaped artifacts
