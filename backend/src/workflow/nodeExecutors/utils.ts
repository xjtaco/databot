/**
 * Sanitize node name for use in file paths.
 * Only allows alphanumeric characters and underscores.
 */
export function sanitizeNodeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Return a readable base name for files generated from a node name.
 * Falls back to the provided English base when sanitization leaves only
 * underscores, digits, or otherwise no readable letters.
 */
export function resolveReadableNodeBaseName(
  nodeName: string,
  fallbackBaseName: string
): { baseName: string; usedFallback: boolean } {
  const sanitized = sanitizeNodeName(nodeName);
  const hasReadableCharacters = /[a-zA-Z]/.test(sanitized);

  if (!hasReadableCharacters) {
    return { baseName: fallbackBaseName, usedFallback: true };
  }

  return { baseName: sanitized, usedFallback: false };
}

/**
 * Build a short suffix from a node id so fallback filenames remain distinct
 * when multiple degraded names share the same work folder.
 */
export function buildNodeIdSuffix(nodeId: string): string {
  const sanitized = sanitizeNodeName(nodeId).replace(/^_+|_+$/g, '');
  const normalized = sanitized.replace(/_+/g, '_');
  const suffix = normalized || 'node';
  return suffix.slice(0, 8);
}
