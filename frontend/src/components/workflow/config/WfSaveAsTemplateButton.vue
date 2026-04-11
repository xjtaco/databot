<template>
  <span>
    <el-button @click="showDialog = true">
      {{ t('workflow.customNode.saveAs') }}
    </el-button>

    <el-dialog v-model="showDialog" :title="t('workflow.customNode.saveTitle')" width="420px">
      <el-form label-position="top">
        <el-form-item :label="t('workflow.customNode.saveName')" label-for="save-tpl-name">
          <el-input id="save-tpl-name" v-model="templateName" />
        </el-form-item>
        <el-form-item :label="t('workflow.customNode.saveDesc')" label-for="save-tpl-desc">
          <el-input id="save-tpl-desc" v-model="templateDesc" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!templateName.trim()" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useWorkflowStore } from '@/stores';

const props = defineProps<{
  nodeId: string;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const showDialog = ref(false);
const templateName = ref('');
const templateDesc = ref('');

async function handleSave(): Promise<void> {
  if (!props.nodeId) return;
  await store.saveNodeAsTemplate(
    props.nodeId,
    templateName.value.trim(),
    templateDesc.value.trim() || undefined
  );
  showDialog.value = false;
  templateName.value = '';
  templateDesc.value = '';
  ElMessage.success(t('common.success'));
}
</script>
