/**
 * A miniature of `molao-cite`, for the demo backend only.
 *
 * The real extractor is the pinned Rust one; a release's citation graph is
 * whatever it produces. This exists so that the demo's graph is *derived from
 * the demo judgment text* rather than hand-authored alongside it — which means
 * the citations you see in a paragraph and the edges you see in the graph
 * cannot drift apart, and a change to a fixture paragraph changes the graph.
 */

import type { Pinpoint } from '../api';

export interface Extracted {
  /** e.g. `zacc/2011/14` — the join key for resolution. */
  key: string;
  /** e.g. `[2011] ZACC 14` — normalised form. */
  canonical: string;
  /** Exactly as it appears in the paragraph, including the pinpoint. */
  asWritten: string;
  pinpoint: Pinpoint | null;
  /** Character offset of `asWritten` within the paragraph text. */
  start: number;
  end: number;
}

// `[2011] ZACC 14`, optionally followed by `at para 5` / `at paras 4-6` / `at 410B-D`.
const NEUTRAL =
  /\[(\d{4})\]\s+([A-Z]{2,10})\s+(\d{1,4})(\s+at\s+(?:paras?\s+\d+(?:\s*[–-]\s*\d+)?|\d+[A-Z](?:\s*[–-]\s*[A-Z])?))?/g;

const PARA_PINPOINT = /at\s+paras?\s+(\d+(?:\s*[–-]\s*\d+)?)/;
const PAGE_PINPOINT = /at\s+(\d+[A-Z](?:\s*[–-]\s*[A-Z])?)/;

/** Extract neutral citations from one paragraph of judgment text. */
export function extract(text: string): Extracted[] {
  const out: Extracted[] = [];
  NEUTRAL.lastIndex = 0;
  for (let m = NEUTRAL.exec(text); m !== null; m = NEUTRAL.exec(text)) {
    const [whole, year, code, num, tail] = m;
    if (!year || !code || !num) continue;
    out.push({
      key: `${code.toLowerCase()}/${year}/${num}`,
      canonical: `[${year}] ${code} ${num}`,
      asWritten: whole,
      pinpoint: parsePinpoint(tail),
      start: m.index,
      end: m.index + whole.length,
    });
  }
  return out;
}

function parsePinpoint(tail: string | undefined): Pinpoint | null {
  if (!tail) return null;
  const para = PARA_PINPOINT.exec(tail);
  if (para?.[1]) return { kind: 'paragraph', value: para[1].trim() };
  const page = PAGE_PINPOINT.exec(tail);
  if (page?.[1]) return { kind: 'page', value: page[1].replace(/\s+/g, '') };
  return null;
}

/** Human form of a pinpoint, as a lawyer would write it. */
export function formatPinpoint(pin: Pinpoint | null): string {
  if (!pin) return '';
  if (pin.kind === 'paragraph') {
    return /[–-]/.test(pin.value) ? `at paras ${pin.value}` : `at para ${pin.value}`;
  }
  return `at ${pin.value}`;
}
