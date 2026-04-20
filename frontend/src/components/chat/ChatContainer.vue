<template>
  <div class="chat-container">
    <ChatHeader
      :show-menu-button="showMenuButton"
      @toggle-sidebar="$emit('toggle-sidebar')"
      @toggle-chat-list="handleToggleChatList"
      @new-chat="handleNewChat"
    >
      <template #status>
        <UsageReportBadge />
        <ToolCallHistory />
        <TodosStatusBar scope="chat" />
      </template>
    </ChatHeader>
    <ChatListDrawer
      v-if="isDesktop"
      @select-session="handleSelectSession"
      @new-chat="handleNewChat"
    />
    <ChatListBottomSheet v-else @select-session="handleSelectSession" @new-chat="handleNewChat" />
    <ChatMessageList />
    <ToolCallIndicator />
    <ChatInput :can-send="canSend" @send="handleSend" @stop="handleStop" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useWebSocket, useChat, useResponsive } from '@/composables';
import { useChatStore, useChatSessionStore, useToolCallStore, useAuthStore } from '@/stores';
import { getSessionMessages } from '@/api/chatSession';
import ChatHeader from './ChatHeader.vue';
import ChatMessageList from './ChatMessageList.vue';
import ChatInput from './ChatInput.vue';
import UsageReportBadge from './UsageReportBadge.vue';
import ToolCallHistory from './ToolCallHistory.vue';
import TodosStatusBar from './TodosStatusBar.vue';
import ToolCallIndicator from './ToolCallIndicator.vue';
import ChatListDrawer from './ChatListDrawer.vue';
import ChatListBottomSheet from './ChatListBottomSheet.vue';

defineProps<{
  showMenuButton?: boolean;
}>();

defineEmits<{
  'toggle-sidebar': [];
}>();

const chatStore = useChatStore();
const chatSessionStore = useChatSessionStore();
const toolCallStore = useToolCallStore();
const authStore = useAuthStore();
const { isDesktop } = useResponsive();

// Build WS URL with optional sessionId
function buildWsUrl(sessionId?: string | null): string {
  const wsUrl = import.meta.env.VITE_WS_URL || '/ws';
  const base = wsUrl.startsWith('/')
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${wsUrl}/agent`
    : `${wsUrl}/agent`;
  return sessionId ? `${base}?sessionId=${sessionId}` : base;
}

// Initialize WebSocket connection with auth token
const websocket = useWebSocket({
  url: buildWsUrl(),
  token: authStore.accessToken,
  autoConnect: true,
});

// Initialize chat functionality
const { sendMessage, stopGeneration, clearChat, canSend } = useChat({
  websocket,
});

function handleSend(content: string) {
  sendMessage(content);
}

function handleStop() {
  stopGeneration();
}

function handleToggleChatList() {
  chatSessionStore.toggleDrawer();
}

async function handleSelectSession(id: string) {
  chatSessionStore.switchSession(id);
  clearChat();
  // Load historical messages and tool calls into the chat UI
  try {
    const records = await getSessionMessages(id);
    chatStore.loadHistoricalMessages(records, (tc) => {
      toolCallStore.addToolCall({
        id: tc.id,
        name: tc.name,
        timestamp: tc.timestamp,
        status: tc.status === 'error' ? 'error' : 'completed',
        resultSummary: tc.resultSummary,
        error: tc.error,
        parameters: tc.parameters,
      });
    });
  } catch {
    // Session messages failed to load — chat starts empty
  }
  websocket.reconnectWithUrl(buildWsUrl(id));
}

function handleNewChat() {
  chatSessionStore.closeDrawer();
  clearChat();
  websocket.reconnectWithUrl(buildWsUrl());
}

onMounted(() => {
  chatSessionStore.fetchSessions();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.chat-container {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background:
    var(--bg-console-grid) 0 0 / 28px 28px,
    radial-gradient(circle at 72% 0%, rgb(255 106 42 / 5%), transparent 24%),
    var(--bg-console);
}
</style>
