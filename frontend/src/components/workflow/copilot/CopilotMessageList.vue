<template>
  <div ref="listRef" class="copilot-message-list">
    <div v-for="(msg, index) in messages" :key="index" class="copilot-message-list__item">
      <CopilotUserMsg v-if="msg.type === 'user'" :content="msg.content" />
      <CopilotAssistantMsg
        v-else-if="msg.type === 'assistant'"
        :content="msg.content"
        :done="msg.done"
      />
      <CopilotToolStatus
        v-else-if="msg.type === 'tool_status'"
        :status="msg.status"
        :summary="msg.summary"
      />
      <CopilotNodeCard
        v-else-if="msg.type === 'node_config_card'"
        :node-id="msg.nodeId"
        :node-name="msg.nodeName"
        :node-type="msg.nodeType"
        :config="msg.config"
        @config-updated="
          (nodeId: string, updates: Partial<NodeConfig>) => $emit('configUpdated', nodeId, updates)
        "
        @close="$emit('removeMessage', index)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import type { CopilotMessage } from '@/stores/copilotStore';
import type { NodeConfig } from '@/types/workflow';
import CopilotUserMsg from './CopilotUserMsg.vue';
import CopilotAssistantMsg from './CopilotAssistantMsg.vue';
import CopilotToolStatus from './CopilotToolStatus.vue';
import CopilotNodeCard from './CopilotNodeCard.vue';

const props = defineProps<{
  messages: CopilotMessage[];
}>();

defineEmits<{
  configUpdated: [nodeId: string, updates: Partial<NodeConfig>];
  removeMessage: [index: number];
}>();

const listRef = ref<HTMLDivElement | null>(null);

function scrollToBottom(): void {
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

onMounted(async () => {
  await nextTick();
  scrollToBottom();
});

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    scrollToBottom();
  }
);
</script>

<style scoped lang="scss">
.copilot-message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  overflow-y: auto;
}
</style>
