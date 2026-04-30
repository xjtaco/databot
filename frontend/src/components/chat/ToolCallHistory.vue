<template>
  <div v-if="hasCalls" class="tool-history" @click="toggleExpanded">
    <div class="tool-history__badge">
      <el-icon class="tool-history__icon">
        <SetUp />
      </el-icon>
      <span class="tool-history__count">{{ t('chat.toolCall.callsCount', { n: callCount }) }}</span>
    </div>
  </div>

  <el-drawer
    v-model="isExpanded"
    :title="t('chat.toolCall.historyTitle')"
    direction="rtl"
    size="400px"
    append-to-body
  >
    <div class="tool-history-list">
      <div
        v-for="call in reversedCalls"
        :key="call.id"
        class="tool-history-item"
        :class="{ 'tool-history-item--expanded': expandedItems.has(call.id) }"
      >
        <div class="tool-history-item__header" @click="toggleItem(call.id)">
          <el-icon
            class="tool-history-item__icon"
            :class="{ 'tool-history-item__icon--error': call.status === 'error' }"
          >
            <WarningFilled v-if="call.status === 'error'" />
            <Check v-else-if="call.status === 'completed'" />
            <Loading v-else class="spinning" />
          </el-icon>
          <span class="tool-history-item__name">{{ call.name }}</span>
          <span class="tool-history-item__time">{{ formatTime(call.timestamp) }}</span>
          <el-icon class="tool-history-item__expand">
            <ArrowDown v-if="expandedItems.has(call.id)" />
            <ArrowRight v-else />
          </el-icon>
        </div>
        <div v-if="expandedItems.has(call.id) && call.metadata" class="tool-history-item__details">
          <pre class="tool-history-item__metadata">{{ formatMetadata(call.metadata) }}</pre>
        </div>
      </div>
      <div v-if="calls.length === 0" class="tool-history-empty">
        {{ t('chat.toolCall.noTools') }}
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  SetUp,
  ArrowRight,
  ArrowDown,
  Check,
  Loading,
  WarningFilled,
} from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useToolCallStore } from '@/stores';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const toolCallStore = useToolCallStore();

const { calls, isExpanded, hasCalls, callCount } = storeToRefs(toolCallStore);
const { toggleExpanded } = toolCallStore;

const expandedItems = ref<Set<string>>(new Set());

const reversedCalls = computed(() => [...calls.value].reverse());

function toggleItem(id: string) {
  const newSet = new Set(expandedItems.value);
  if (newSet.has(id)) {
    newSet.delete(id);
  } else {
    newSet.add(id);
  }
  expandedItems.value = newSet;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata, null, 2);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.tool-history {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  cursor: pointer;
  background-color: var(--accent-tint10);
  border-radius: 100px;

  &__badge {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--accent);
  }

  &__icon {
    font-size: 14px;
    color: var(--accent);
  }

  &__count {
    font-weight: 500;
  }
}

.tool-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
}

.tool-history-item {
  overflow: hidden;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 8px;

  &__header {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  &__icon {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--success);

    &--error {
      color: var(--error);
    }
  }

  &__name {
    flex: 1;
    font-family: $font-family-dm-mono;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__time {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  &__expand {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__details {
    padding: 0 14px 12px;
    border-top: 1px solid var(--border-primary);
  }

  &__metadata {
    max-height: 200px;
    padding: 8px;
    margin: 0;
    overflow: auto;
    font-family: $font-family-dm-mono;
    font-size: 11px;
    color: var(--text-secondary);
    word-break: break-all;
    white-space: pre-wrap;
    background-color: var(--bg-tertiary);
    border-radius: 4px;
  }

  &--expanded {
    .tool-history-item__header {
      background-color: var(--bg-hover);
    }
  }
}

.tool-history-empty {
  padding: 24px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.spinning {
  color: var(--accent);
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
