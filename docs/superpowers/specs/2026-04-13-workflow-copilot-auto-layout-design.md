# Workflow Copilot Auto Layout Design

## Overview

Improve workflow layout quality after Copilot edits so generated workflows no longer collapse into a single vertical column. The new layout keeps the main flow top-to-bottom, spreads sibling nodes horizontally by layer, and only runs when the current round is primarily Copilot-driven structural work.

## Problem

Current Copilot node creation uses a fixed placement rule in `wf_add_node`: `positionX = 200` and `positionY = maxY + 120`. That guarantees a readable insertion order but wastes canvas width and produces long, unattractive "telephone pole" workflows for any medium-length chain.

This is especially poor for workflows created through Copilot because:

- Copilot often creates several nodes in one round
- Copilot can add branch and merge structures that need horizontal space
- Users expect AI-generated workflows to look intentionally organized, not merely appended

## Goals

- Replace single-column Copilot output with a layered top-to-bottom layout
- Keep the visual reading direction top-to-bottom
- Reflow the whole workflow after a Copilot round when that round is primarily structural
- Avoid overriding workflows that clearly reflect user hand-arranged layout with only minor Copilot edits
- Keep layout logic deterministic, testable, and isolated from the canvas renderer

## Non-Goals

- Do not change manual drag-and-drop behavior in the editor
- Do not add a user-facing "auto layout" button in this change
- Do not animate complex layout transitions
- Do not pursue mathematically optimal graph layout
- Do not introduce a third-party DAG layout library in this change

## Selected Approach

Use an in-project enhanced layered layout engine designed for this workflow editor.

Why this approach:

- It matches the product need better than the current append-only behavior
- It keeps the reading direction users already have
- It handles typical workflow shapes better than a lightweight heuristic while avoiding the cost and tuning burden of a general-purpose layout library
- It allows layout policy to reflect product rules such as "protect user-owned layouts" and "only reflow after Copilot-driven structural changes"

## Alternatives Considered

### 1. Staggered snake layout

Alternate nodes left and right while keeping a single main column.

Pros:

- Fastest to implement
- Very small change from current behavior

Cons:

- Still looks like a decorated single column
- Poor fit for branch and merge structures
- Not credible as a full workflow auto-layout system

### 2. Enhanced layered layout

Assign nodes to layers by topology, keep main flow vertical, spread same-layer nodes horizontally, and apply a small number of product-specific cleanup rules.

Pros:

- Best balance of quality, control, and implementation cost
- Fits typical workflow DAG shapes
- Produces layouts that feel intentional

Cons:

- Requires custom layout code and tests
- Needs explicit rules for ownership and fallback

### 3. External DAG layout library

Use a library such as `dagre` or `elk` to compute node positions.

Pros:

- Mature graph layout algorithms
- Stronger baseline for complicated graphs

Cons:

- Adds dependency and tuning overhead
- Layout output may not match current card sizes and visual expectations
- Harder to encode product-specific behavior cleanly

## User-Validated Decisions

- Layout style: layered layout
- Reading direction: top-to-bottom
- Trigger timing: after a Copilot round completes, not after every individual node insertion
- Reflow scope: whole workflow when Copilot primarily drove structural changes in the round
- Protection rule: do not aggressively reflow layouts that are clearly user-arranged when Copilot only made light edits

## Functional Design

### 1. Layout Engine

Add a dedicated workflow layout module, for example under `backend/src/workflow/layout/`.

The layout engine input is:

- workflow nodes with current dimensions/positions
- workflow edges
- layout options and spacing constants

The output is:

- new `{ nodeId, positionX, positionY }` values for all nodes selected for layout

The engine should be deterministic for identical graph input and options.

### 2. Layer Assignment

Treat the workflow as a DAG and assign a vertical layer to each node from topological order:

- root nodes occupy the top layer
- a node's layer is at least one more than the maximum layer of its upstream dependencies
- disconnected nodes are handled separately in an isolated area below or beside the main graph cluster

This keeps upstream nodes visually above downstream nodes and preserves the current reading direction.

### 3. Horizontal Placement

Within each layer:

- nodes are arranged horizontally
- sibling nodes are spaced using a minimum same-layer gap
- layer width is centered relative to the dominant main chain when possible
- branch expansions are pushed outward from the center line
- merge targets are pulled back toward the center line where possible

This makes branch-heavy workflows use available width instead of stacking everything on one axis.

### 4. Crossing Reduction

Use a light reordering pass for nodes in the same layer to reduce obvious edge crossings:

- prefer upstream-order consistency
- preserve stable order where possible
- avoid expensive global optimization

The objective is not perfect minimization. The objective is to remove obvious visual tangles while keeping results predictable.

### 5. Spacing Rules

Use separate constants for:

- layer gap on the Y axis
- node gap on the X axis
- minimum canvas padding
- isolated-node region gap

These should be defined in one place so future tuning does not require algorithm edits.

### 6. Main Chain Preference

The main chain should remain visually centered when identifiable. This can be approximated by:

- longest-path preference, or
- preserving the current dominant vertical chain if it exists

Exact critical-path semantics are not required. The layout only needs a stable approximation good enough for visual hierarchy.

## Trigger Rules

Layout reflow runs only at the end of a Copilot round, never after each individual tool call.

Trigger the reflow when the round contains structural modifications such as:

- node creation
- node deletion
- edge creation
- edge deletion
- node type replacement

Do not trigger whole-graph reflow for configuration-only changes by default.

## Layout Ownership and Protection

Before reflowing, classify the current workflow layout as one of:

- Copilot-owned
- mixed
- user-owned

This classification determines whether a round should reflow the whole graph.

### Signals for user-owned or mixed layout

Use the following signals:

- recent node drag activity in the frontend, if already available
- node coordinates that do not resemble known auto-layout spacing
- obvious local arrangements that diverge from the engine's canonical grid

The first implementation may use coordinate heuristics if persistent drag metadata is not already available. Do not add large new persistence machinery unless required by existing architecture.

### Reflow policy by ownership

- Copilot-owned: if the round has structural changes, reflow the whole workflow
- Mixed: reflow only when the structural changes are substantial
- User-owned: do not whole-graph reflow for minor Copilot edits

### What counts as substantial structural change

Examples:

- adding or deleting multiple nodes
- changing the main chain shape
- adding a branch/merge region
- replacing a node type in a way that alters graph structure or dependency layout

Pure text/config updates do not count.

## Stability Rules

Even when whole-graph reflow is allowed, preserve visual continuity where practical:

- keep unaffected subgraphs in roughly consistent relative order
- keep stable main-chain ranking when dependencies did not change
- avoid large horizontal flips for nodes with unchanged structural role
- keep unconnected nodes in a separate secondary zone

The result should look improved, not random.

## Failure and Fallback

Before applying auto-layout:

- snapshot existing node positions

After computing new positions:

- validate no obvious node overlap beyond tolerated bounds
- validate coordinates are finite and within sane canvas ranges
- optionally reject layouts with visibly worse structural quality than the previous arrangement

If validation fails:

- discard the computed layout
- restore the previous node positions
- emit a transparent Copilot status message such as "Kept the existing layout because auto-layout was unstable for this round."

## Backend Changes

### `backend/src/copilot/copilotTools.ts`

- Stop treating `wf_add_node` placement as final layout
- Keep temporary insertion coordinates only as an interim fallback
- Continue returning node details as today

### `backend/src/copilot/copilotAgent.ts`

- Track structural workflow mutations across the current round
- At round completion, evaluate whether auto-layout should run
- If allowed, call a workflow layout/reflow service before final round completion
- Ensure Copilot status updates can mention reflow success or fallback

### New layout module

Expected responsibilities:

- graph normalization
- topological layering
- same-layer ordering
- coordinate generation
- validation helpers

Keep this module independent from WebSocket/session code.

### Workflow service layer

Add a service entry point that:

- fetches the latest workflow graph
- computes the new layout
- writes updated coordinates in one save/update path

This keeps coordinate persistence inside existing workflow save semantics rather than scattering writes across Copilot code.

## Frontend Changes

The frontend should remain mostly passive for layout:

- continue rendering positions from workflow data
- refresh canvas when updated coordinates arrive
- optionally fit the view after a Copilot-triggered reflow if that behavior already exists or fits current UX

If frontend drag state is already tracked, it may be reused as an ownership signal. Do not make the frontend responsible for graph layout decisions.

## Data Flow

1. Copilot performs one round of workflow changes using existing tools.
2. The agent accumulates a round-level structural change summary.
3. At round end, the agent determines layout ownership and reflow eligibility.
4. If eligible, the backend layout module computes new coordinates for the workflow.
5. The workflow service persists the new positions.
6. The frontend reloads/rerenders the updated workflow graph.

## Testing Strategy

### Unit tests for layout engine

Cover:

- simple single-chain workflow
- branch and merge workflow
- multiple roots
- disconnected nodes
- stable deterministic output for identical input
- no overlap in standard cases

### Unit tests for reflow policy

Cover:

- structural Copilot round triggers reflow
- config-only Copilot round does not trigger reflow
- user-owned layout with light edits does not whole-graph reflow
- mixed layout with major structural changes does reflow
- fallback restores prior positions on invalid layout output

### Integration tests

Cover:

- Copilot adds several nodes in one round and final workflow is layered instead of single-column
- Copilot adds branch structure and sibling nodes spread horizontally
- Copilot modifies configuration only and existing positions remain stable

## Acceptance Criteria

- A single-chain workflow produced by Copilot no longer collapses into a single narrow vertical column
- The main flow remains top-to-bottom
- Branch/merge workflows are visually layered and use horizontal space
- Whole-graph reflow occurs only after Copilot rounds with qualifying structural changes
- User-arranged workflows are not aggressively overridden by light Copilot edits
- Invalid auto-layout results revert to prior coordinates safely

## Out of Scope Follow-Ups

- user-facing manual auto-layout command
- layout animation
- switching to left-to-right workflow reading
- third-party graph layout engines
- persistent layout ownership metadata if heuristics are sufficient
