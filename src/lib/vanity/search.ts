/** Search helpers shared by the catalog and results screens. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  return fields.some((field) => normalizeSearchText(field ?? "").includes(normalized));
}
