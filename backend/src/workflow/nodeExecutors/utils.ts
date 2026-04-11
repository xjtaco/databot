/**
 * Sanitize node name for use in file paths.
 * Only allows alphanumeric characters and underscores.
 */
export function sanitizeNodeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
