import type { Catalog, CatalogDay } from './types';

/**
 * Merge one freshly built day into the catalog and apply the rolling window.
 * Pure: `existing` is never mutated. Featured days are always kept and do not
 * count toward `window`. Non-featured days are ranked newest first, and the
 * day being added is ranked like the others. Ranks beyond `window` are removed,
 * except that the day being added is never removed.
 */
export function mergeCatalog(
  existing: Catalog | null,
  day: CatalogDay,
  opts: { window: number; now: Date },
): { catalog: Catalog; removed: CatalogDay[] } {
  if (!Number.isInteger(opts.window) || opts.window < 1) {
    throw new RangeError('window must be an integer >= 1');
  }
  const others = (existing?.days ?? []).filter((d) => d.date !== day.date);
  const newestFirst = [...others, day].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const kept: CatalogDay[] = [];
  const removed: CatalogDay[] = [];
  let nonFeatured = 0;
  for (const d of newestFirst) {
    if (d.featured) {
      kept.push(d);
      continue;
    }
    if (nonFeatured < opts.window || d === day) kept.push(d);
    else removed.push(d);
    nonFeatured++;
  }

  return {
    catalog: {
      schemaVersion: 1,
      generatedAt: opts.now.toISOString(),
      days: kept,
      airportsFile: 'ref/airports.json',
      airlinesFile: 'ref/airlines.json',
      timezonesFile: 'ref/timezones.topo.json',
    },
    removed,
  };
}
