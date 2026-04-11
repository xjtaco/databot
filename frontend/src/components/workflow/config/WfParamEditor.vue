<template>
  <div class="wf-param-editor">
    <div
      v-for="(entry, index) in normalizedEntries"
      :key="index"
      class="wf-param-editor__param-row"
    >
      <el-input
        :model-value="entry.key"
        size="small"
        :placeholder="t('workflow.config.paramKey')"
        class="wf-param-editor__key-input"
        @change="(newKey: string) => handleKeyChange(index, newKey)"
      />
      <el-select
        :model-value="entry.def.type"
        size="small"
        class="wf-param-editor__type-select"
        @change="(newType: ParamValueType) => handleTypeChange(index, newType)"
      >
        <el-option
          v-for="typeOpt in PARAM_VALUE_TYPES"
          :key="typeOpt"
          :label="typeOpt"
          :value="typeOpt"
        />
      </el-select>
      <div class="wf-param-editor__value-row">
        <el-input
          v-if="entry.def.type === 'text'"
          :model-value="String(entry.def.value)"
          size="small"
          :placeholder="t('workflow.config.paramValue')"
          class="wf-param-editor__value-input"
          @change="(val: string) => handleValueChange(index, val)"
        />
        <el-input
          v-else-if="entry.def.type === 'password'"
          :model-value="String(entry.def.value)"
          type="password"
          show-password
          size="small"
          :placeholder="t('workflow.config.paramValue')"
          class="wf-param-editor__value-input"
          @change="(val: string) => handleValueChange(index, val)"
        />
        <el-input-number
          v-else-if="entry.def.type === 'number'"
          :model-value="Number(entry.def.value)"
          size="small"
          class="wf-param-editor__value-input"
          @change="(val: number | undefined) => handleValueChange(index, val ?? 0)"
        />
        <el-checkbox
          v-else-if="entry.def.type === 'checkbox'"
          :model-value="Boolean(entry.def.value)"
          class="wf-param-editor__value-input"
          @change="(val: string | number | boolean) => handleValueChange(index, Boolean(val))"
        />
        <el-radio-group
          v-else-if="entry.def.type === 'radio'"
          :model-value="String(entry.def.value)"
          size="small"
          class="wf-param-editor__value-input"
          @change="
            (val: string | number | boolean | undefined) =>
              handleValueChange(index, String(val ?? ''))
          "
        >
          <el-radio v-for="opt in entry.def.options ?? []" :key="opt" :value="opt">
            {{ opt }}
          </el-radio>
        </el-radio-group>
        <el-select
          v-else-if="entry.def.type === 'select'"
          :model-value="String(entry.def.value)"
          size="small"
          class="wf-param-editor__value-input"
          @change="(val: string) => handleValueChange(index, val)"
        >
          <el-option v-for="opt in entry.def.options ?? []" :key="opt" :label="opt" :value="opt" />
        </el-select>
        <button class="wf-param-editor__param-delete" @click="handleDelete(index)">
          <Trash2 :size="14" />
        </button>
      </div>
      <el-input
        v-if="entry.def.type === 'radio' || entry.def.type === 'select'"
        :model-value="(entry.def.options ?? []).join(',')"
        size="small"
        :placeholder="t('workflow.config.paramOptions')"
        class="wf-param-editor__options-input"
        @change="(val: string) => handleOptionsChange(index, val)"
      />
    </div>
    <el-button size="small" text @click="handleAdd">
      <Plus :size="14" />
      {{ t('workflow.config.addParam') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Trash2 } from 'lucide-vue-next';
import type { ParamDefinition, ParamValueType } from '@/types/workflow';

const PARAM_VALUE_TYPES: ParamValueType[] = [
  'text',
  'password',
  'number',
  'checkbox',
  'radio',
  'select',
];

interface NormalizedEntry {
  key: string;
  def: ParamDefinition;
}

const props = defineProps<{
  params: Record<string, string | ParamDefinition>;
}>();

const emit = defineEmits<{
  'update:params': [value: Record<string, string | ParamDefinition>];
}>();

const { t } = useI18n();

function normalize(val: string | ParamDefinition): ParamDefinition {
  if (typeof val === 'string') {
    return { value: val, type: 'text' };
  }
  return val;
}

const normalizedEntries = computed<NormalizedEntry[]>(() =>
  Object.entries(props.params).map(([key, val]) => ({
    key,
    def: normalize(val),
  }))
);

function buildUpdated(entries: NormalizedEntry[]): Record<string, string | ParamDefinition> {
  const result: Record<string, string | ParamDefinition> = {};
  for (const entry of entries) {
    result[entry.key] = entry.def;
  }
  return result;
}

function handleKeyChange(index: number, newKey: string): void {
  const entries = normalizedEntries.value.map((e) => ({ ...e, def: { ...e.def } }));
  entries[index] = { ...entries[index], key: newKey };
  emit('update:params', buildUpdated(entries));
}

function handleTypeChange(index: number, newType: ParamValueType): void {
  const entries = normalizedEntries.value.map((e) => ({ ...e, def: { ...e.def } }));
  const current = entries[index].def;
  let newValue: string | number | boolean = '';
  if (newType === 'number') {
    newValue = 0;
  } else if (newType === 'checkbox') {
    newValue = false;
  }
  entries[index] = {
    ...entries[index],
    def: { ...current, type: newType, value: newValue },
  };
  emit('update:params', buildUpdated(entries));
}

function handleValueChange(index: number, val: string | number | boolean): void {
  const entries = normalizedEntries.value.map((e) => ({ ...e, def: { ...e.def } }));
  entries[index] = { ...entries[index], def: { ...entries[index].def, value: val } };
  emit('update:params', buildUpdated(entries));
}

function handleOptionsChange(index: number, val: string): void {
  const entries = normalizedEntries.value.map((e) => ({ ...e, def: { ...e.def } }));
  const options = val
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  entries[index] = { ...entries[index], def: { ...entries[index].def, options } };
  emit('update:params', buildUpdated(entries));
}

function handleDelete(index: number): void {
  const entries = normalizedEntries.value
    .map((e) => ({ ...e, def: { ...e.def } }))
    .filter((_, i) => i !== index);
  emit('update:params', buildUpdated(entries));
}

function handleAdd(): void {
  const keys = new Set(normalizedEntries.value.map((e) => e.key));
  let i = 1;
  while (keys.has(`param${i}`)) i++;
  const newEntry: NormalizedEntry = { key: `param${i}`, def: { value: '', type: 'text' } };
  const entries = [...normalizedEntries.value.map((e) => ({ ...e, def: { ...e.def } })), newEntry];
  emit('update:params', buildUpdated(entries));
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-param-editor {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  width: 100%;

  &__param-row {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
    align-items: center;
  }

  &__key-input {
    flex-shrink: 0;
    width: 100px;
  }

  &__type-select {
    flex-shrink: 0;
    width: 110px;
  }

  &__value-row {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    width: 100%;
  }

  &__value-input {
    flex: 1;
    min-width: 0;
  }

  &__options-input {
    flex: 1;
    min-width: 80px;
  }

  &__param-delete {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $error;
      background-color: $error-tint;
    }
  }
}
</style>
