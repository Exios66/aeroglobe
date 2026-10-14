import type { Catalog, CatalogDay } from './types';

/**
 * Merge one freshly built day into the catalog and apply the rolling window.
 * Pure: `existing` is never mutated. Featured days are always kept and do not
 * count toward `window`; the newest `window` non-featured days are kept.
 */
export function mergeCatalog(
  existing: Catalog | null,
  day: CatalogDay,
  opts: { window: number; now: Date },
): { catalog: Catalog; removed: CatalogDay[] } {
  const others = (existing?.days ?? []).filter((d) => d.date !== day.date);
  const newestFirst = [...others, day].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const kept: CatalogDay[] = [];
  const removed: CatalogDay[] = [];
  let nonFeatured = 0;
  for (const d of newestFirst) {
    if (d.featured) kept.push(d);
    else if (nonFeatured < opts.window) {
      nonFeatured++;
      kept.push(d);
    } else removed.push(d);
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
