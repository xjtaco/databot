<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderMarkdown } from '@/utils/markdown';

const { t } = useI18n();

const props = defineProps<{
  content: string;
  loading?: boolean;
}>();

const renderedContent = computed(() => {
  if (!props.content) return '';
  return renderMarkdown(props.content);
});
</script>

<template>
  <div class="dictionary-preview">
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      {{ t('common.loading') }}
    </div>

    <div v-else-if="!content" class="empty-state">
      {{ t('datafile.noDictionary') }}
    </div>

    <div v-else class="markdown-body" v-html="renderedContent"></div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.dictionary-preview {
  min-height: 200px;
  overflow-x: auto;
}

.loading-state,
.empty-state {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: $text-muted;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-dark;
  border-top-color: $accent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.markdown-body {
  display: flex;
  flex-direction: column;
  gap: 24px;

  @media (max-width: $breakpoint-md) {
    gap: 16px;
  }

  // H1 — Instrument Serif style
  :deep(h1) {
    padding: 0;
    margin: 0;
    font-family: $font-family-serif;
    font-size: $font-size-3xl;
    font-weight: $font-weight-normal;
    color: $text-primary-color;
    letter-spacing: -1px;
    border: none;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-2xl;
    }
  }

  // H2
  :deep(h2) {
    margin: 0;
    font-family: $font-family-sans;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-md;
    }
  }

  // H3
  :deep(h3) {
    margin: 0;
    font-family: $font-family-sans;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  // Paragraphs
  :deep(p) {
    margin: 0;
    font-family: $font-family-sans;
    font-size: $font-size-sm;
    font-weight: $font-weight-normal;
    line-height: 1.4;
    color: $text-secondary-color;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-xs;
      line-height: 1.5;
    }
  }

  // Lists
  :deep(ul),
  :deep(ol) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 16px;
    margin: 0;
    list-style: none;

    @media (max-width: $breakpoint-md) {
      gap: 6px;
      padding-left: 8px;
    }
  }

  :deep(li) {
    display: flex;
    gap: 8px;
    font-family: $font-family-sans;
    font-size: $font-size-sm;
    font-weight: $font-weight-normal;
    line-height: 1.4;
    color: $text-secondary-color;

    &::before {
      flex-shrink: 0;
      color: $accent;
      content: '\2022';
    }

    @media (max-width: $breakpoint-md) {
      gap: 6px;
      font-size: $font-size-xs;
    }
  }

  :deep(ol) {
    counter-reset: list-counter;

    li {
      counter-increment: list-counter;

      &::before {
        font-weight: $font-weight-medium;
        color: $accent;
        content: counter(list-counter) '.';
      }
    }
  }

  // Inline code
  :deep(code) {
    padding: 2px 6px;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $accent-light;
    background: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;
  }

  // Code blocks
  :deep(pre) {
    padding: 16px;
    margin: 0;
    overflow-x: auto;
    background: $bg-deeper;
    border: 1px solid $border-dark;
    border-radius: $radius-lg;

    @media (max-width: $breakpoint-md) {
      padding: 12px;
      border-radius: $radius-md;
    }

    code {
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
      color: $text-secondary-color;
      background: none;
      border: none;
      border-radius: 0;

      @media (max-width: $breakpoint-md) {
        font-size: $font-size-xs;
      }
    }
  }

  // Tables
  :deep(table) {
    display: table;
    width: 100%;
    margin: 0;
    overflow: hidden;
    border-spacing: 0;
    border-collapse: separate;
    border: 1px solid $border-dark;
    border-radius: $radius-lg;

    @media (max-width: $breakpoint-md) {
      display: block;
      overflow-x: auto;
    }
  }

  :deep(thead) {
    background: $bg-elevated;
  }

  :deep(th) {
    padding: 12px 16px;
    font-family: $font-family-sans;
    font-size: 11px;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    border-bottom: 1px solid $border-dark;

    @media (max-width: $breakpoint-md) {
      padding: 10px 12px;
      font-size: 10px;
    }
  }

  :deep(td) {
    padding: 12px 16px;
    font-family: $font-family-sans;
    font-size: $font-size-xs;
    color: $text-secondary-color;
    text-align: left;
    border-bottom: 1px solid $border-dark;

    @media (max-width: $breakpoint-md) {
      padding: 10px 12px;
      font-size: 11px;
    }
  }

  :deep(tr:last-child td) {
    border-bottom: none;
  }

  :deep(tbody tr) {
    transition: background-color $transition-fast;

    &:hover {
      background: rgba($bg-elevated, 0.5);
    }
  }

  // Blockquotes
  :deep(blockquote) {
    padding: 12px 16px;
    margin: 0;
    background: rgba($accent, 0.04);
    border-left: 3px solid $accent;
    border-radius: 0 $radius-md $radius-md 0;

    p {
      color: $text-secondary-color;
    }
  }

  // Horizontal rules
  :deep(hr) {
    height: 1px;
    margin: 0;
    background: $border-dark;
    border: none;
  }

  // Strong / Bold
  :deep(strong) {
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  // Links
  :deep(a) {
    color: $accent;
    text-decoration: none;
    transition: opacity $transition-fast;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
