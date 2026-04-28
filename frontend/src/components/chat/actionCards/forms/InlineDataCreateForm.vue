<template>
  <div class="inline-data-create-form">
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
          :disabled="isSubmitting"
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

    <!-- Inline error/success message -->
    <div v-if="feedbackMessage" class="form-feedback" :class="feedbackType">
      {{ feedbackMessage }}
    </div>

    <div class="form-actions">
      <el-button :loading="isTesting" :disabled="isSubmitting" @click="handleTestConnection">
        {{ t('chat.actionCard.inlineForm.testConnection') }}
      </el-button>
      <div class="form-actions__right">
        <el-button :disabled="isSubmitting" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="isSubmitting" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInstance, FormRules } from 'element-plus';
import { useDatafileStore } from '@/stores';
import type { DatabaseType } from '@/types/datafile';
import type { DatabaseConnectionConfig } from '@/api/datasource';
import type { UiActionCardPayload } from '@/types/actionCard';

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

const props = defineProps<{ payload: UiActionCardPayload }>();

const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();
const formRef = ref<FormInstance>();

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
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('error');

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

// Pre-fill from payload params
function prefillFromPayload(): void {
  const params = props.payload.params;
  if (!params) return;

  if (params.type) {
    const dbType = params.type as DatabaseType;
    formData.dbType = dbType;
    formData.port = DEFAULT_PORTS[dbType] ?? 5432;
  }
  if (params.host) formData.host = String(params.host);
  if (params.port) formData.port = Number(params.port);
  if (params.database) formData.database = String(params.database);
  if (params.username) formData.user = String(params.username);
  if (params.user) formData.user = String(params.user);
  if (params.password) formData.password = String(params.password);
}

// Auto-fill port when dbType changes (only if not set from payload)
watch(
  () => formData.dbType,
  (newType) => {
    if (newType) {
      formData.port = DEFAULT_PORTS[newType as DatabaseType];
    }
  }
);

// Initialize from payload on mount
prefillFromPayload();

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

  feedbackMessage.value = '';
  isTesting.value = true;
  try {
    await datafileStore.testDatasourceConnection(buildConfig());
    feedbackMessage.value = t('chat.actionCard.inlineForm.testSuccess');
    feedbackType.value = 'success';
  } catch (error) {
    feedbackMessage.value =
      error instanceof Error ? error.message : t('chat.actionCard.inlineForm.testFailed');
    feedbackType.value = 'error';
  } finally {
    isTesting.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  feedbackMessage.value = '';
  isSubmitting.value = true;
  try {
    const config = buildConfig();
    await datafileStore.createDatasource(config);
    emit('submit', 'succeeded', {
      resultSummary: t('chat.actionCard.inlineForm.createSuccess'),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : t('chat.actionCard.inlineForm.createFailed');
    feedbackMessage.value = errorMessage;
    feedbackType.value = 'error';
    emit('submit', 'failed', { error: errorMessage });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-data-create-form {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.form-feedback {
  padding: $spacing-sm $spacing-md;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  border-radius: $radius-sm;

  &.success {
    color: $success;
    background: $success-tint;
  }

  &.error {
    color: $error;
    background: $error-tint;
  }
}

.form-actions {
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

@media (max-width: $breakpoint-md) {
  .form-actions {
    flex-direction: column;
    gap: $spacing-sm;

    &__right {
      display: flex;
      gap: $spacing-sm;
      width: 100%;

      .el-button {
        flex: 1;
      }
    }

    > .el-button:first-child {
      width: 100%;
    }
  }
}
</style>
