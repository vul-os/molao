/**
 * The demo backend: the node's API, computed over the bundled fixture corpus.
 *
 * Everything derived — edges, authority, "cited by", snippets, the graph — is
 * computed here from the judgment text, the same way the node computes it from
 * the database. Nothing is hard-coded to look good.
 */

import type {
  Api,
  CaseResponse,
  CitationsResponse,
  CiteIn,
  CiteOut,
  CourtRow,
  GraphResponse,
  Judgment,
  SearchHit,
  SearchQuery,
  SearchResponse,
  Status,
  Version,
} from '../api';
import { ApiError } from '../api';
import { COURTS, authorityWeight, courtName } from './courts';
import { CORPUS, DEMO_RELEASE, DEMO_SIGNERS, DEMO_THRESHOLD, type DemoCase } from './corpus';
import { extract } from './extract';

interface Edge {
  fromId: string;
  toId: string | null;
  key: string;
  canonical: string;
  asWritten: string;
  fromPara: number | null;
  pinpoint: CiteOut['pinpoint'];
}

const byId = new Map<string, DemoCase>(CORPUS.map((c) => [c.id, c]));

/** `[2011] ZACC 14` -> `zacc/2011/14`, the resolution key. */
function neutralKey(neutral: string): string {
  const m = /\[(\d{4})\]\s+([A-Z]{2,10})\s+(\d{1,4})/.exec(neutral);
  if (!m?.[1] || !m[2] || !m[3]) return neutral.toLowerCase();
  return `${m[2].toLowerCase()}/${m[1]}/${m[3]}`;
}

const byKey = new Map<string, DemoCase>(CORPUS.map((c) => [neutralKey(c.neutral), c]));

const EDGES: Edge[] = CORPUS.flatMap((c) =>
  c.paragraphs.flatMap((para, index) =>
    extract(para.text)
      // A judgment quoting its own citation is not an edge.
      .filter((e) => e.key !== neutralKey(c.neutral))
      .map<Edge>((e) => ({
        fromId: c.id,
        toId: byKey.get(e.key)?.id ?? null,
        key: e.key,
        canonical: e.canonical,
        asWritten: e.asWritten,
        fromPara: index,
        pinpoint: e.pinpoint,
      })),
  ),
);

const outgoing = new Map<string, Edge[]>();
const incoming = new Map<string, Edge[]>();
for (const e of EDGES) {
  const outs = outgoing.get(e.fromId) ?? [];
  outs.push(e);
  outgoing.set(e.fromId, outs);
  if (e.toId) {
    const ins = incoming.get(e.toId) ?? [];
    ins.push(e);
    incoming.set(e.toId, ins);
  }
}

/**
 * Authority: a judgment's own court sets a floor, and citations lift it in
 * proportion to the authority of the citing court. Coarse on purpose — the same
 * spirit as `Tier::authority_weight`, not a theory of precedent.
 */
const AUTHORITY: Map<string, number> = (() => {
  const raw = new Map<string, number>();
  for (const c of CORPUS) {
    const cited = incoming.get(c.id) ?? [];
    const inbound = cited.reduce((sum, e) => sum + authorityWeight(byId.get(e.fromId)?.court ?? ''), 0);
    raw.set(c.id, inbound);
  }
  const max = Math.max(1, ...raw.values());
  const out = new Map<string, number>();
  for (const c of CORPUS) {
    const own = authorityWeight(c.court);
    const lift = (raw.get(c.id) ?? 0) / max;
    out.set(c.id, Math.min(1, 0.35 * own + 0.65 * lift));
  }
  return out;
})();

function authorityOf(id: string): number {
  return Math.round((AUTHORITY.get(id) ?? 0) * 100) / 100;
}

function citedByCount(id: string): number {
  return new Set((incoming.get(id) ?? []).map((e) => e.fromId)).size;
}

function toJudgment(c: DemoCase): Judgment {
  return {
    id: c.id,
    neutral_citation: c.neutral,
    court: c.court,
    title: c.title,
    case_numbers: c.caseNumbers,
    date: c.date,
    judges: c.judges,
    reported_citations: c.reported,
    region: c.region,
    paragraphs: c.paragraphs.map((para, index) => ({
      index,
      number: para.number,
      text: para.text,
    })),
  };
}

function requireCase(id: string): DemoCase {
  const c = byId.get(id);
  if (!c) throw new ApiError(404, 'No judgment with that id is in this corpus.');
  return c;
}

// ---- search ---------------------------------------------------------------

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

/** FTS5 `snippet()`-alike: a window around the best match, matches in `<mark>`. */
function snippet(c: DemoCase, ts: string[]): string {
  const body = c.paragraphs.map((para) => para.text).join(' ');
  if (ts.length === 0) return `${body.slice(0, 220).trim()}…`;

  const lower = body.toLowerCase();
  let best = -1;
  for (const t of ts) {
    const at = lower.indexOf(t);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  if (best < 0) return `${body.slice(0, 220).trim()}…`;

  const from = Math.max(0, body.lastIndexOf(' ', Math.max(0, best - 90)) + 1);
  const to = Math.min(body.length, from + 260);
  let window = body.slice(from, to);
  const cut = window.lastIndexOf(' ');
  if (to < body.length && cut > 0) window = window.slice(0, cut);

  const pattern = new RegExp(`(${ts.map(escapeRegExp).join('|')})`, 'gi');
  const marked = window.replace(pattern, '<mark>$1</mark>');
  return `${from > 0 ? '…' : ''}${marked}${to < body.length ? '…' : ''}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function score(c: DemoCase, ts: string[]): number {
  if (ts.length === 0) return authorityOf(c.id);
  const haystack = `${c.title} ${c.neutral} ${c.paragraphs.map((para) => para.text).join(' ')}`.toLowerCase();
  const title = c.title.toLowerCase();
  let hits = 0;
  for (const t of ts) {
    const matches = haystack.split(t).length - 1;
    if (matches === 0) return -1;
    hits += Math.min(matches, 8) + (title.includes(t) ? 6 : 0);
  }
  return hits + authorityOf(c.id) * 4;
}

// ---- the API --------------------------------------------------------------

export const demoApi: Api = {
  async version(): Promise<Version> {
    return {
      name: 'molao',
      version: '0.1.0-demo',
      extractor_version: 'molao-cite/1',
      release: DEMO_RELEASE,
      corpus_root: 'demo0000000000000000000000000000000000000000000000000000000000',
    };
  },

  async status(): Promise<Status> {
    const provenance = { corroborated: 0, single: 0, manual: 0 };
    for (const c of CORPUS) provenance[c.provenance] += 1;
    return {
      docs: CORPUS.length,
      edges: EDGES.length,
      release: DEMO_RELEASE,
      signers: DEMO_SIGNERS,
      threshold: DEMO_THRESHOLD,
      provenance,
      courts: new Set(CORPUS.map((c) => c.court)).size,
      verified: true,
      regions: [...new Set(CORPUS.map((c) => c.region))].sort(),
    };
  },

  async courts(): Promise<CourtRow[]> {
    const counts = new Map<string, number>();
    for (const c of CORPUS) counts.set(c.court, (counts.get(c.court) ?? 0) + 1);
    return COURTS.filter((c) => counts.has(c.code)).map((c) => ({
      code: c.code,
      name: c.name,
      tier: c.tier,
      seat: c.seat,
      doc_count: counts.get(c.code) ?? 0,
    }));
  },

  async search(query: SearchQuery): Promise<SearchResponse> {
    const ts = terms(query.q);
    const scored = CORPUS.map((c) => ({ c, s: score(c, ts) }))
      .filter(({ c, s }) => {
        if (s < 0) return false;
        if (query.court && c.court !== query.court) return false;
        if (query.region && c.region !== query.region) return false;
        const year = Number(c.date.slice(0, 4));
        if (query.year_from && year < Number(query.year_from)) return false;
        if (query.year_to && year > Number(query.year_to)) return false;
        return true;
      })
      .sort((a, b) => b.s - a.s || b.c.date.localeCompare(a.c.date));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const hits: SearchHit[] = scored.slice(offset, offset + limit).map(({ c }) => ({
      id: c.id,
      title: c.title,
      court: c.court,
      court_name: courtName(c.court),
      date: c.date,
      neutral_citation: c.neutral,
      snippet: snippet(c, ts),
      authority: authorityOf(c.id),
      cited_by_count: citedByCount(c.id),
      region: c.region,
    }));
    return { total: scored.length, hits };
  },

  async case(id: string): Promise<CaseResponse> {
    const c = requireCase(id);
    return {
      judgment: toJudgment(c),
      court_name: courtName(c.court),
      provenance_class: c.provenance,
      cites_count: (outgoing.get(c.id) ?? []).length,
      cited_by_count: citedByCount(c.id),
      authority: authorityOf(c.id),
      reported_citations: c.reported,
    };
  },

  async citations(id: string): Promise<CitationsResponse> {
    const c = requireCase(id);
    const cites: CiteOut[] = (outgoing.get(c.id) ?? []).map((e) => ({
      to_id: e.toId,
      citation_key: e.key,
      as_written: e.asWritten,
      canonical: e.canonical,
      from_para: e.fromPara,
      pinpoint: e.pinpoint,
      resolved: e.toId !== null,
    }));
    const cited_by: CiteIn[] = (incoming.get(c.id) ?? []).map((e) => {
      const from = byId.get(e.fromId);
      return {
        from_id: e.fromId,
        title: from?.title ?? e.fromId,
        court: from?.court ?? '',
        date: from?.date ?? null,
        as_written: e.asWritten,
        from_para: e.fromPara,
        pinpoint: e.pinpoint,
      };
    });
    cited_by.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return { cites, cited_by };
  },

  async graph(id: string, depth = 1): Promise<GraphResponse> {
    const root = requireCase(id);
    const depths = new Map<string, number>([[root.id, 0]]);
    let frontier = [root.id];
    for (let d = 1; d <= Math.max(1, depth); d += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        const neighbours = [
          ...(outgoing.get(current) ?? []).map((e) => e.toId),
          ...(incoming.get(current) ?? []).map((e) => e.fromId),
        ];
        for (const n of neighbours) {
          if (!n || depths.has(n)) continue;
          depths.set(n, d);
          next.push(n);
        }
      }
      frontier = next;
    }

    const nodes = [...depths.entries()].map(([nodeId, d]) => {
      const c = requireCase(nodeId);
      return {
        id: c.id,
        title: c.title,
        court: c.court,
        date: c.date,
        authority: authorityOf(c.id),
        depth: d,
      };
    });

    const seen = new Set<string>();
    const edges = EDGES.filter((e) => e.toId && depths.has(e.fromId) && depths.has(e.toId))
      .filter((e) => {
        const k = `${e.fromId}->${e.toId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((e) => ({
        from: e.fromId,
        to: e.toId as string,
        weight: authorityWeight(byId.get(e.fromId)?.court ?? ''),
      }));

    return { nodes, edges };
  },
};

/** The id the demo opens on: the richest judgment in the fixture corpus. */
export const DEMO_FEATURED_ID = '5941a989115f328d27731cd1c3e9b7eacae10638439bf862d3a9fb2d24f5c051';
