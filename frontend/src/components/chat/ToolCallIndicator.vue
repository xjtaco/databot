<template>
  <div v-if="isAgentRunning && hasCalls" class="tool-indicator">
    <div class="tool-indicator__bar">
      <el-icon class="tool-indicator__icon spinning">
        <Loading />
      </el-icon>
      <div class="tool-indicator__scroll">
        <span
          v-for="call in recentCalls"
          :key="call.id"
          class="tool-indicator__name"
          :class="{ 'tool-indicator__name--running': call.status === 'running' }"
        >
          {{ call.name }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue';
import { useToolCallStore } from '@/stores';
import { storeToRefs } from 'pinia';

const toolCallStore = useToolCallStore();

const { isAgentRunning, hasCalls, recentCalls } = storeToRefs(toolCallStore);
</script>

<style scoped lang="scss">
.tool-indicator {
  flex-shrink: 0;
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border-color);

  &__bar {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 16px;
  }

  &__icon {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--accent);
  }

  &__scroll {
    display: flex;
    flex: 1;
    gap: 8px;
    overflow: hidden;
  }

  &__name {
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: 12px;
    color: var(--text-secondary);
    background-color: var(--bg-secondary);
    border-radius: 4px;

    &--running {
      color: var(--accent);
      background-color: var(--accent-tint10);
    }
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
