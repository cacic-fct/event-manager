/** Accent-insensitive matching for complete, already-loaded admin catalogs. */
export function matchesWorkspaceText(query: string, values: readonly (string | null | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const text = normalize(values.filter(Boolean).join(' '));
  return terms.every((term) => text.includes(term));
}
