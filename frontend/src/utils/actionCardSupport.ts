const INLINE_FORM_ACTION_KEYS = new Set([
  'data:datasource_create',
  'data:file_upload',
  'knowledge:folder_create',
  'knowledge:folder_rename',
  'knowledge:folder_move',
  'knowledge:folder_delete',
  'knowledge:file_create',
  'knowledge:file_upload',
  'knowledge:file_move',
  'knowledge:file_delete',
  'schedule:create',
  'schedule:update',
  'schedule:delete',
]);

export function getActionCardKey(domain: string, action: string): string {
  return `${domain}:${action}`;
}

export function isInlineFormSupported(domain: string, action: string): boolean {
  return INLINE_FORM_ACTION_KEYS.has(getActionCardKey(domain, action));
}
