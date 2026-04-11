import { getConfigsByCategory } from '../globalConfig/globalConfig.repository';
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from './authService';

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const rows = await getConfigsByCategory('password_policy');
  if (rows.length === 0) return DEFAULT_PASSWORD_POLICY;

  const configMap = new Map(rows.map((r) => [r.configKey, r.configValue]));
  return {
    minLength: parseInt(
      configMap.get('minLength') || String(DEFAULT_PASSWORD_POLICY.minLength),
      10
    ),
    requireUppercase: configMap.get('requireUppercase') === 'true',
    requireLowercase: configMap.get('requireLowercase') === 'true',
    requireNumbers: configMap.get('requireNumbers') === 'true',
    requireSpecialChars: configMap.get('requireSpecialChars') === 'true',
  };
}
