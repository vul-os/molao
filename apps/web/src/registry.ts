/**
 * Court metadata, as reported by the node.
 *
 * Molao is region-agnostic. The UI holds no table of courts: the corpus a node
 * serves may be South African, or it may not, and a hardcoded registry would be
 * wrong the first time someone loads another region's release. Codes, names,
 * tiers and seats all arrive from `/api/courts`, cached once per session so
 * that every badge does not re-fetch it.
 *
 * The tier *vocabulary* is protocol, not regional — every profile ranks its
 * courts into the same shape — so labels for it live here.
 */

import { useEffect, useState } from 'preact/hooks';
import { api, type CourtRow, type Tier } from './api';

let cache: CourtRow[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(rows: CourtRow[]) => void>();

function load(): void {
  if (cache || inflight) return;
  inflight = api()
    .then((client) => client.courts())
    .then((rows) => {
      cache = rows;
      for (const listener of listeners) listener(rows);
    })
    .catch(() => {
      // A node that cannot list its courts still serves judgments; badges fall
      // back to the bare code rather than blocking the page.
      cache = [];
    });
}

/** Court metadata by code. Empty until the first `/api/courts` reply lands. */
export function useCourts(): Map<string, CourtRow> {
  const [rows, setRows] = useState<CourtRow[]>(cache ?? []);
  useEffect(() => {
    if (cache) {
      setRows(cache);
      return;
    }
    listeners.add(setRows);
    load();
    return () => {
      listeners.delete(setRows);
    };
  }, []);
  return new Map(rows.map((row) => [row.code, row]));
}

export const TIER_LABEL: Record<Tier, string> = {
  apex: 'Apex',
  appellate: 'Appellate',
  specialist_appellate: 'Specialist appellate',
  high_court: 'High Court',
  specialist_high: 'Specialist High Court',
  tribunal: 'Tribunal',
  lower: 'Lower court',
};

/**
 * Region codes are ISO 3166-1 alpha-2. The UI deliberately shows the code
 * rather than a country name: naming a region is a political act in a way that
 * printing the code the release declares is not, and the list of profiles is
 * open.
 */
export function regionLabel(region: string | null | undefined): string {
  return (region ?? '').toUpperCase();
}
