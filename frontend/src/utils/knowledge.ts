import type { KnowledgeFolder } from '@/types/knowledge';

/**
 * Returns array of folder names from root to the target folder.
 * Returns empty array if targetId is null (root selected).
 */
export function getFolderPath(folders: KnowledgeFolder[], targetId: string | null): string[] {
  if (targetId === null) return [];

  function findPath(nodes: KnowledgeFolder[], id: string): string[] | null {
    for (const node of nodes) {
      if (node.id === id) return [node.name];
      const childPath = findPath(node.children, id);
      if (childPath) return [node.name, ...childPath];
    }
    return null;
  }

  return findPath(folders, targetId) ?? [];
}
