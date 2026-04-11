<template>
  <el-dialog
    v-model="visible"
    :title="
      isEditMode
        ? t('datasource.connectionDialog.editTitle')
        : t('datasource.connectionDialog.createTitle')
    "
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="!isSubmitting"
    @closed="handleClosed"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="120px"
      label-position="left"
    >
      <el-form-item :label="t('datasource.connectionDialog.dbType')" prop="dbType">
        <el-select
          v-model="formData.dbType"
          :placeholder="t('datasource.connectionDialog.dbType')"
          :disabled="isSubmitting || isEditMode"
          class="full-width"
        >
          <el-option
            v-for="dbType in DATABASE_TYPES"
            :key="dbType"
            :label="t(`datasource.types.${dbType}`)"
            :value="dbType"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.host')" prop="host">
        <el-input v-model="formData.host" placeholder="localhost" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.port')" prop="port">
        <el-input-number
          v-model="formData.port"
          :min="1"
          :max="65535"
          :disabled="isSubmitting"
          controls-position="right"
          class="port-input"
        />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.database')" prop="database">
        <el-input v-model="formData.database" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.user')" prop="user">
        <el-input v-model="formData.user" :disabled="isSubmitting" />
      </el-form-item>

      <el-form-item :label="t('datasource.connectionDialog.password')" prop="password">
        <el-input
          v-model="formData.password"
          type="password"
          show-password
          :disabled="isSubmitting"
        />
      </el-form-item>

      <!-- Schema field for databases that support it -->
      <el-form-item
        v-if="showSchemaField"
        :label="t('datasource.connectionDialog.schema')"
        prop="schema"
      >
        <el-input v-model="formData.schema" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Oracle: SID vs Service Name -->
      <el-form-item
        v-if="formData.dbType === 'oracle'"
        :label="t('datasource.oracle.connectionType')"
      >
        <el-radio-group v-model="formData.oracleConnectionType" :disabled="isSubmitting">
          <el-radio value="sid">{{ t('datasource.oracle.sid') }}</el-radio>
          <el-radio value="serviceName">{{ t('datasource.oracle.serviceName') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- SAP HANA: Instance Number -->
      <el-form-item
        v-if="formData.dbType === 'saphana'"
        :label="t('datasource.saphana.instanceNumber')"
      >
        <el-input v-model="formData.saphanaInstanceNumber" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Trino: Catalog -->
      <el-form-item v-if="formData.dbType === 'trino'" :label="t('datasource.trino.catalog')">
        <el-input v-model="formData.trinoCatalog" :disabled="isSubmitting" />
      </el-form-item>

      <!-- PrestoDB: Catalog -->
      <el-form-item v-if="formData.dbType === 'prestodb'" :label="t('datasource.prestodb.catalog')">
        <el-input v-model="formData.prestodbCatalog" :disabled="isSubmitting" />
      </el-form-item>

      <!-- Spark: Transport Protocol -->
      <el-form-item v-if="formData.dbType === 'spark'" :label="t('datasource.spark.transport')">
        <el-select v-model="formData.sparkTransport" :disabled="isSubmitting" class="full-width">
          <el-option label="Binary" value="binary" />
          <el-option label="HTTP" value="http" />
        </el-select>
      </el-form-item>

      <!-- Hive2: Transport Protocol -->
      <el-form-item v-if="formData.dbType === 'hive2'" :label="t('datasource.hive2.transport')">
        <el-select v-model="formData.hive2Transport" :disabled="isSubmitting" class="full-width">
          <el-option label="Binary" value="binary" />
          <el-option label="HTTP" value="http" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button :loading="isTesting" :disabled="isSubmitting" @click="handleTestConnection">
          {{ t('datasource.connectionDialog.testConnection') }}
        </el-button>
        <div class="dialog-footer__right">
          <el-button :disabled="isSubmitting" @click="handleCancel">
            {{ t('common.cancel') }}
          </el-button>
          <el-button type="primary" :loading="isSubmitting" @click="handleSubmit">
            {{ t('common.save') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { useDatafileStore } from '@/stores';
import type { DatabaseType, DatasourceMetadata } from '@/types/datafile';
import type { DatabaseConnectionConfig } from '@/api/datasource';

const DATABASE_TYPES: DatabaseType[] = [
  'mysql',
  'postgresql',
  'sqlserver',
  'mariadb',
  'oracle',
  'db2',
  'saphana',
  'kingbase',
  'clickhouse',
  'spark',
  'hive2',
  'starrocks',
  'trino',
  'prestodb',
  'tidb',
  'dameng',
];

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  mysql: 3306,
  sqlserver: 1433,
  mariadb: 3306,
  oracle: 1521,
  db2: 50000,
  saphana: 30015,
  kingbase: 54321,
  clickhouse: 8123,
  spark: 10000,
  hive2: 10000,
  starrocks: 9030,
  trino: 8080,
  prestodb: 8080,
  tidb: 3306,
  dameng: 5236,
  postgresql: 5432,
};

const SCHEMA_SUPPORTED_TYPES: Set<DatabaseType> = new Set([
  'postgresql',
  'sqlserver',
  'oracle',
  'db2',
  'saphana',
  'kingbase',
  'dameng',
  'trino',
  'prestodb',
]);

const props = defineProps<{
  modelValue: boolean;
  editDatasource?: DatasourceMetadata | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'success'): void;
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();
const formRef = ref<FormInstance>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const isEditMode = computed(() => !!props.editDatasource);

const formData = reactive({
  dbType: '' as DatabaseType | '',
  host: '',
  port: 5432,
  database: '',
  user: '',
  password: '',
  schema: '',
  // Oracle specific
  oracleConnectionType: 'sid' as 'sid' | 'serviceName',
  // SAP HANA specific
  saphanaInstanceNumber: '',
  // Trino specific
  trinoCatalog: '',
  // PrestoDB specific
  prestodbCatalog: '',
  // Spark specific
  sparkTransport: 'binary' as 'binary' | 'http',
  // Hive2 specific
  hive2Transport: 'binary' as 'binary' | 'http',
});

const isTesting = ref(false);
const isSubmitting = ref(false);

const showSchemaField = computed(() => {
  return formData.dbType && SCHEMA_SUPPORTED_TYPES.has(formData.dbType as DatabaseType);
});

const formRules = computed<FormRules>(() => ({
  dbType: [
    { required: true, message: t('datasource.validation.dbTypeRequired'), trigger: 'change' },
  ],
  host: [{ required: true, message: t('datasource.validation.hostRequired'), trigger: 'blur' }],
  port: [
    { required: true, message: t('datasource.validation.portRequired'), trigger: 'blur' },
    {
      type: 'number',
      min: 1,
      max: 65535,
      message: t('datasource.validation.portRange'),
      trigger: 'blur',
    },
  ],
  database: [
    { required: true, message: t('datasource.validation.databaseRequired'), trigger: 'blur' },
  ],
  user: [{ required: true, message: t('datasource.validation.userRequired'), trigger: 'blur' }],
  password: [
    { required: true, message: t('datasource.validation.passwordRequired'), trigger: 'blur' },
  ],
}));

// Auto-fill port when dbType changes
watch(
  () => formData.dbType,
  (newType) => {
    if (newType && !isEditMode.value) {
      formData.port = DEFAULT_PORTS[newType as DatabaseType];
    }
  }
);

// Watch for edit datasource changes to populate form
watch(
  () => props.editDatasource,
  (datasource) => {
    if (datasource) {
      const dbType = datasource.type as DatabaseType;
      formData.dbType = dbType;
      formData.host = datasource.host || '';
      formData.port = datasource.port || DEFAULT_PORTS[dbType] || 5432;
      formData.database = datasource.database || '';
      formData.user = datasource.user || '';
      formData.password = '';
      formData.schema = datasource.schema || '';

      // Parse properties
      const properties = datasource.properties
        ? (JSON.parse(datasource.properties) as Record<string, string>)
        : {};

      if (dbType === 'oracle') {
        formData.oracleConnectionType =
          (properties.connectionType as 'sid' | 'serviceName') || 'sid';
      }
      if (dbType === 'saphana') {
        formData.saphanaInstanceNumber = properties.instanceNumber || '';
      }
      if (dbType === 'trino') {
        formData.trinoCatalog = properties.catalog || '';
      }
      if (dbType === 'prestodb') {
        formData.prestodbCatalog = properties.catalog || '';
      }
      if (dbType === 'spark') {
        formData.sparkTransport = (properties.transport as 'binary' | 'http') || 'binary';
      }
      if (dbType === 'hive2') {
        formData.hive2Transport = (properties.transport as 'binary' | 'http') || 'binary';
      }
    }
  },
  { immediate: true }
);

// Watch visibility to reset form when dialog opens
watch(visible, (isVisible) => {
  if (isVisible && !props.editDatasource) {
    resetForm();
  }
});

function resetForm(): void {
  formData.dbType = '';
  formData.host = '';
  formData.port = 5432;
  formData.database = '';
  formData.user = '';
  formData.password = '';
  formData.schema = '';
  formData.oracleConnectionType = 'sid';
  formData.saphanaInstanceNumber = '';
  formData.trinoCatalog = '';
  formData.prestodbCatalog = '';
  formData.sparkTransport = 'binary';
  formData.hive2Transport = 'binary';
  formRef.value?.clearValidate();
}

function handleClosed(): void {
  resetForm();
}

function handleCancel(): void {
  visible.value = false;
}

function buildConfig(): DatabaseConnectionConfig {
  const dbType = formData.dbType as DatabaseType;
  const config: DatabaseConnectionConfig = {
    dbType,
    host: formData.host,
    port: formData.port,
    database: formData.database,
    user: formData.user,
    password: formData.password,
  };

  if (showSchemaField.value && formData.schema) {
    config.schema = formData.schema;
  }

  const properties: Record<string, string> = {};

  if (dbType === 'oracle') {
    properties.connectionType = formData.oracleConnectionType;
  }
  if (dbType === 'saphana' && formData.saphanaInstanceNumber) {
    properties.instanceNumber = formData.saphanaInstanceNumber;
  }
  if (dbType === 'trino' && formData.trinoCatalog) {
    properties.catalog = formData.trinoCatalog;
  }
  if (dbType === 'prestodb' && formData.prestodbCatalog) {
    properties.catalog = formData.prestodbCatalog;
  }
  if (dbType === 'spark') {
    properties.transport = formData.sparkTransport;
  }
  if (dbType === 'hive2') {
    properties.transport = formData.hive2Transport;
  }

  if (Object.keys(properties).length > 0) {
    config.properties = properties;
  }

  return config;
}

async function handleTestConnection(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  isTesting.value = true;
  try {
    await datafileStore.testDatasourceConnection(buildConfig());
    ElMessage.success(t('datasource.connectionDialog.testSuccess'));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : t('datasource.connectionDialog.testFailed');
    ElMessage.error(errorMessage);
  } finally {
    isTesting.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  isSubmitting.value = true;
  try {
    const config = buildConfig();

    if (isEditMode.value && props.editDatasource) {
      await datafileStore.updateDatasource(props.editDatasource.id, config);
      ElMessage.success(t('datasource.connectionDialog.updateSuccess'));
    } else {
      await datafileStore.createDatasource(config);
      ElMessage.success(t('datasource.connectionDialog.createSuccess'));
    }

    visible.value = false;
    emit('success');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : t('datasource.connectionDialog.testFailed');
    ElMessage.error(errorMessage);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.dialog-footer {
  display: flex;
  gap: $spacing-lg;
  align-items: center;
  justify-content: space-between;

  &__right {
    display: flex;
    gap: $spacing-sm;
  }
}

.port-input {
  width: 100%;

  :deep(.el-input__inner) {
    text-align: left;
  }
}

.full-width {
  width: 100%;
}
</style>
