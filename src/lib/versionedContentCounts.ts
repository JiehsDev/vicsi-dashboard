export interface VersionedContentCount {
  id: string;
  groundTruthVersion: string | null;
  count: number;
}

/** Shared IDs can change meaning between answer keys. Never merge their labels. */
export function countVersionedContent(
  rows: ReadonlyArray<{ id: string; groundTruthVersion?: string | null }>,
  limit?: number,
): VersionedContentCount[] {
  const counts = new Map<string, VersionedContentCount>();
  for (const row of rows) {
    const groundTruthVersion = row.groundTruthVersion ?? null;
    const key = JSON.stringify([row.id, groundTruthVersion]);
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { id: row.id, groundTruthVersion, count: 1 });
  }
  const result = [...counts.values()].sort((a, b) => b.count - a.count);
  return limit === undefined ? result : result.slice(0, limit);
}
