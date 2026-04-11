import { createPinia } from 'pinia';

export const pinia = createPinia();

export { useConnectionStore } from './connectionStore';
export { useChatStore } from './chatStore';
export { useToolCallStore } from './toolCallStore';
export { useTodosStore } from './todosStore';
export { useDatafileStore } from './datafileStore';
export { useKnowledgeStore } from './knowledgeStore';
export { useGlobalConfigStore } from './globalConfigStore';
export { useChatSessionStore } from './chatSessionStore';
export { useWorkflowStore } from './workflowStore';
export { useCopilotStore } from './copilotStore';
export { useScheduleStore } from './scheduleStore';
export { useDebugCopilotStore } from './debugCopilotStore';
export { useAuthStore } from './authStore';
export { useUserManagementStore } from './userManagementStore';
export { useAuditLogStore } from './auditLogStore';
