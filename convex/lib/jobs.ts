// convex/lib/jobs.ts
// shared helpers for bounded status fan-out lookups

export const firstActiveStatusRow = async <Status extends string, Row>(
  statuses: readonly Status[],
  loadRows: (status: Status) => Promise<readonly Row[]>
): Promise<Row | null> =>
{
  const matches = await Promise.all(statuses.map((status) => loadRows(status)))
  return matches.flat()[0] ?? null
}
