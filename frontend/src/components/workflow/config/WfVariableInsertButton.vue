<template>
  <div ref="wrapperRef" v-click-outside="closePopover" class="wf-variable-insert-btn">
    <el-tooltip
      :content="t('workflow.config.noUpstreamNodes')"
      :disabled="upstreamGroups.length > 0"
      placement="top"
    >
      <el-button
        :disabled="disabled || upstreamGroups.length === 0"
        size="small"
        @click.stop="togglePopover"
      >
        {{ buttonLabel }}
      </el-button>
    </el-tooltip>

    <div v-if="popoverVisible" class="wf-variable-insert-btn__dropdown" :style="dropdownStyle">
      <el-scrollbar max-height="280px">
        <div
          v-for="group in upstreamGroups"
          :key="group.nodeId"
          class="wf-variable-insert-btn__group"
        >
          <div class="wf-variable-insert-btn__group-header">
            <span class="wf-variable-insert-btn__node-name">{{ group.nodeName }}</span>
            <el-tag size="small" type="info" effect="plain">
              {{ t(`workflow.nodeTypes.${group.nodeType}`) }}
            </el-tag>
          </div>
          <div
            v-for="field in group.fields"
            :key="field.template"
            class="wf-variable-insert-btn__field"
            @click="handleSelect(field.template)"
          >
            <span class="wf-variable-insert-btn__field-template">{{ field.template }}</span>
            <el-tag size="small" effect="plain">{{ field.type }}</el-tag>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import { ClickOutside as vClickOutside } from 'element-plus';
import { useWorkflowStore } from '@/stores';
import { NODE_OUTPUT_FIELDS } from '@/constants/workflow';
import type { WorkflowNodeType } from '@/types/workflow';

interface FieldEntry {
  template: string;
  type: string;
}

export interface UpstreamGroup {
  nodeId: string;
  nodeName: string;
  nodeType: WorkflowNodeType;
  fields: FieldEntry[];
}

const props = defineProps<{
  nodeId: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  insert: [template: string];
}>();

const DROPDOWN_WIDTH = 320;

const { t } = useI18n();
const store = useWorkflowStore();
const wrapperRef = ref<HTMLElement | null>(null);
const popoverVisible = ref(false);
const dropdownStyle = ref<CSSProperties>({});
const buttonLabel = computed(
  () => `\u007B\u007B\u007D\u007D ${t('workflow.config.insertVariable')}`
);

function togglePopover(): void {
  popoverVisible.value = !popoverVisible.value;
  if (popoverVisible.value) {
    updateDropdownPosition();
  }
}

function updateDropdownPosition(): void {
  if (!wrapperRef.value) return;
  const rect = wrapperRef.value.getBoundingClientRect();
  const spaceRight = window.innerWidth - rect.left;
  if (spaceRight < DROPDOWN_WIDTH + 16) {
    dropdownStyle.value = { right: '0', left: 'auto' };
  } else {
    dropdownStyle.value = { left: '0', right: 'auto' };
  }
}

function getUpstreamNodeIds(currentNodeId: string): string[] {
  const wf = store.editorWorkflow;
  if (!wf) return [];

  const visited = new Set<string>();
  const queue: string[] = [currentNodeId];

  while (queue.length > 0) {
    const nid = queue.shift()!;
    for (const edge of wf.edges) {
      if (edge.targetNodeId === nid && !visited.has(edge.sourceNodeId)) {
        visited.add(edge.sourceNodeId);
        queue.push(edge.sourceNodeId);
      }
    }
  }

  return [...visited];
}

const upstreamGroups = computed<UpstreamGroup[]>(() => {
  const wf = store.editorWorkflow;
  if (!wf) return [];

  const upstreamIds = getUpstreamNodeIds(props.nodeId);
  const groups: UpstreamGroup[] = [];

  for (const upId of upstreamIds) {
    const node = wf.nodes.find((n) => n.id === upId);
    if (!node) continue;

    const outputFields = NODE_OUTPUT_FIELDS[node.type];
    if (!outputFields || outputFields.length === 0) continue;

    const outputVariable = node.config.outputVariable;
    if (!outputVariable) continue;

    const fields: FieldEntry[] = outputFields.map((f) => ({
      template: `{{${outputVariable}.${f.field}}}`,
      type: f.type,
    }));

    groups.push({
      nodeId: upId,
      nodeName: node.name,
      nodeType: node.type,
      fields,
    });
  }

  return groups;
});

function closePopover(): void {
  popoverVisible.value = false;
}

function handleSelect(template: string): void {
  emit('insert', template);
  popoverVisible.value = false;
}

defineExpose({ upstreamGroups, getUpstreamNodeIds });
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-variable-insert-btn {
  position: relative;
  display: inline-block;

  &__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    z-index: 100;
    width: 320px;
    padding: $spacing-sm;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
  }

  &__group {
    &:not(:last-child) {
      padding-bottom: $spacing-sm;
      margin-bottom: $spacing-sm;
      border-bottom: 1px solid $border-dark;
    }
  }

  &__group-header {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    padding: $spacing-xs 0;
    margin-bottom: $spacing-xs;
  }

  &__node-name {
    font-size: $font-size-xs;
    font-weight: 600;
    color: $text-primary-color;
  }

  &__field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-xs $spacing-sm;
    cursor: pointer;
    border-radius: $radius-sm;
    transition: background-color 0.15s;

    &:hover {
      background-color: $bg-elevated;
    }
  }

  &__field-template {
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-secondary-color;
  }
}
</style>
