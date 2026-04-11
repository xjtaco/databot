// backend/src/copilot/index.ts
export * from './copilot.types';
export { initCopilotWebSocket } from './copilotWebSocket';
export { CopilotAgent } from './copilotAgent';
export { buildSystemPrompt } from './copilotPrompt';
export { createCopilotToolRegistry, COPILOT_TOOL_NAMES } from './copilotTools';
export { initDebugWebSocket } from './debugWebSocket';
export { DebugAgent, createDebugAgent } from './debugAgent';
export { createDebugToolRegistry } from './debugTools';
