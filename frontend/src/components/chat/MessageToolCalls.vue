<template>
  <div v-if="toolCalls.length > 0" class="message-tool-calls">
    <span class="message-tool-calls__label">{{ t('chat.toolUsed') }}:</span>
    <div class="message-tool-calls__list">
      <div
        v-for="tool in toolCalls"
        :key="tool.id"
        class="message-tool-calls__item"
        :class="{ 'message-tool-calls__item--error': tool.status === 'error' }"
      >
        <el-icon class="message-tool-calls__status">
          <WarningFilled v-if="tool.status === 'error'" />
          <SuccessFilled v-else />
        </el-icon>
        <span class="message-tool-calls__name">{{ tool.name }}</span>
        <span v-if="getToolParamSummary(tool)" class="message-tool-calls__params">
          {{ getToolParamSummary(tool) }}
        </span>
        <span v-if="tool.status === 'error' && tool.error" class="message-tool-calls__error">
          {{ t('chat.toolCall.errorPrefix') }}{{ truncateText(tool.error, 60) }}
        </span>
        <span v-else-if="tool.resultSummary" class="message-tool-calls__result">
          {{ tool.resultSummary }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { SuccessFilled, WarningFilled } from '@element-plus/icons-vue';
import type { ToolCallInfo } from '@/stores/toolCallStore';

defineProps<{
  toolCalls: ToolCallInfo[];
}>();

const { t } = useI18n();

const toolParamKeyMap: Record<string, string> = {
  bash: 'command',
  sql: 'sql',
  glob: 'pattern',
  grep: 'pattern',
  read_file: 'absolute_path',
  write_file: 'file_path',
  edit: 'file_path',
  web_search: 'query',
};

function getToolParamSummary(tool: ToolCallInfo): string | undefined {
  if (!tool.parameters) return undefined;
  const key = toolParamKeyMap[tool.name];
  if (!key) return undefined;
  const value = tool.parameters[key];
  if (typeof value !== 'string') return undefined;
  return truncateText(value, 80);
}

function truncateText(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.message-tool-calls {
  margin-top: $spacing-sm;

  &__label {
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__item {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    padding: 6px 10px;
    font-size: 11px;
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: $radius-sm;

    &--error {
      background-color: var(--error-bg-subtle);
    }
  }

  &__status {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--success);

    .message-tool-calls__item--error & {
      color: var(--error);
    }
  }

  &__name {
    flex-shrink: 0;
    font-family: $font-family-dm-mono;
    font-weight: $font-weight-medium;
    color: var(--accent);
  }

  &__params {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-dm-mono;
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  &__result {
    flex-shrink: 0;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  &__error {
    flex-shrink: 0;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--error);
    white-space: nowrap;
  }
}
</style>
