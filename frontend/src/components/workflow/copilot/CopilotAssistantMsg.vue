<template>
  <div class="copilot-assistant-msg">
    <div class="copilot-assistant-msg__avatar">
      <span>D</span>
    </div>
    <div class="copilot-assistant-msg__bubble">
      <div class="copilot-assistant-msg__content markdown-content" v-html="renderedContent"></div>
      <span v-if="!done" class="copilot-assistant-msg__cursor" aria-hidden="true"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from '@/utils/markdown';

const props = defineProps<{
  content: string;
  done: boolean;
}>();

const renderedContent = computed(() => renderMarkdown(props.content));
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-assistant-msg {
  display: flex;
  gap: $spacing-xs;
  align-items: flex-start;
  justify-content: flex-start;
  margin: $spacing-sm 0;

  &__avatar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--accent-gradient);
    border-radius: $radius-sm;

    span {
      font-size: 12px;
      font-weight: $font-weight-semibold;
      line-height: 1;
      color: var(--text-on-accent);
    }
  }

  &__bubble {
    max-width: 80%;
    padding: $spacing-sm 12px;
    font-size: $font-size-sm;
    line-height: $line-height-normal;
    color: #1a1a2e;
    overflow-wrap: break-word;
    background-color: #f5f5f5;
    border-radius: $radius-lg;
  }

  &__content {
    // Override global markdown-content styles for light bubble background
    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5),
    :deep(h6) {
      color: #1a1a2e;
    }

    :deep(a) {
      color: $accent;
    }

    :deep(blockquote) {
      color: #4a4a5a;
    }

    :deep(code) {
      color: #1a1a2e;
      background-color: rgb(0 0 0 / 8%);
    }

    :deep(pre) {
      color: #e0e0e0;
      background-color: #1a1a2e;

      code {
        color: inherit;
        background-color: transparent;
      }
    }

    :deep(table) {
      th,
      td {
        border-color: #d0d0d4;
      }

      th {
        background-color: #e0e0e4;
      }

      tr:nth-child(even) {
        background-color: #eaeaee;
      }
    }

    :deep(p:last-child) {
      margin-bottom: 0;
    }

    :deep(p:first-child) {
      margin-top: 0;
    }
  }

  &__cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background-color: #1a1a2e;
    animation: copilot-blink 1s step-end infinite;
  }
}

@keyframes copilot-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
