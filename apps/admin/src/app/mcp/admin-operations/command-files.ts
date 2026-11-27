/** Only server-owned same-origin routes are built from validated immutable IDs. */
export function commandFileLinks(proposalId: string, args: unknown): { id: string; href: string }[] {
  const ids = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(proposalId)) return [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, hash] of [
      ['artifactId', 'sha256'],
      ['documentArtifactId', 'documentSha256'],
    ]) {
      const id = record[key];
      if (
        typeof id === 'string' &&
        uuid.test(id) &&
        typeof record[hash] === 'string' &&
        /^[a-f0-9]{64}$/.test(record[hash])
      )
        ids.add(id);
    }
    Object.values(record).forEach(visit);
  };
  visit(args);
  return [...ids].map((id) => ({ id, href: `/api/admin/mcp/operations/proposals/${proposalId}/files/${id}` }));
}
