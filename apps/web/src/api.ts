/**
 * The node's HTTP API, typed.
 *
 * Every shape here mirrors the contract the Rust node serves. The demo backend
 * in `./demo` implements exactly the same functions against bundled fixtures,
 * so nothing above this file knows whether a node is running.
 */

export type ProvenanceClass = 'corroborated' | 'single' | 'manual';

export type Tier =
  | 'apex'
  | 'appellate'
  | 'specialist_appellate'
  | 'high_court'
  | 'specialist_high'
  | 'tribunal'
  | 'lower';

export interface Version {
  name: string;
  version: string;
  extractor_version: string;
  release: number | null;
  corpus_root: string | null;
}

export interface Status {
  docs: number;
  edges: number;
  release: number | null;
  signers: number;
  threshold: number;
  provenance: { corroborated: number; single: number; manual: number };
  courts: number;
  verified: boolean;
  /**
   * Region profiles present in this corpus, e.g. `["ZA"]`. Optional: a node
   * predating region support omits it, and the UI then says nothing about
   * jurisdiction rather than guessing at one.
   */
  regions?: string[];
}

export interface CourtRow {
  code: string;
  name: string;
  tier: Tier;
  seat: string | null;
  doc_count: number;
}

export interface SearchHit {
  id: string;
  title: string;
  court: string;
  court_name: string;
  date: string | null;
  neutral_citation: string | null;
  /** FTS5 snippet(): plain text with `<mark>` around matched terms. */
  snippet: string;
  authority: number;
  cited_by_count: number;
  /** Region profile the judgment belongs to, e.g. `ZA`. */
  region?: string | null;
}

export interface SearchResponse {
  total: number;
  hits: SearchHit[];
}

export interface SearchQuery {
  q: string;
  limit?: number;
  offset?: number;
  court?: string;
  region?: string;
  year_from?: string;
  year_to?: string;
}

export interface Paragraph {
  index: number;
  number: string | null;
  text: string;
}

export interface Judgment {
  id: string;
  neutral_citation: string | null;
  court: string;
  title: string;
  case_numbers: string[];
  date: string | null;
  judges: string[];
  reported_citations: string[];
  paragraphs: Paragraph[];
  /** Region profile the judgment belongs to, e.g. `ZA`. */
  region?: string | null;
}

export interface CaseResponse {
  judgment: Judgment;
  court_name: string;
  provenance_class: ProvenanceClass;
  cites_count: number;
  cited_by_count: number;
  authority: number;
  reported_citations: string[];
}

export interface Pinpoint {
  kind: 'paragraph' | 'page';
  value: string;
}

export interface CiteOut {
  to_id: string | null;
  citation_key: string;
  as_written: string;
  canonical: string;
  from_para: number | null;
  pinpoint: Pinpoint | null;
  resolved: boolean;
}

export interface CiteIn {
  from_id: string;
  title: string;
  court: string;
  date: string | null;
  as_written: string;
  from_para: number | null;
  pinpoint: Pinpoint | null;
}

export interface CitationsResponse {
  cites: CiteOut[];
  cited_by: CiteIn[];
}

export interface GraphNode {
  id: string;
  title: string;
  court: string;
  date: string | null;
  authority: number;
  depth: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Thrown for any non-2xx response; carries the node's `{ error }` message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface Api {
  version(): Promise<Version>;
  status(): Promise<Status>;
  courts(): Promise<CourtRow[]>;
  search(q: SearchQuery): Promise<SearchResponse>;
  case(id: string): Promise<CaseResponse>;
  citations(id: string): Promise<CitationsResponse>;
  graph(id: string, depth?: number): Promise<GraphResponse>;
}

/**
 * Demo mode: a build flag, or `?demo=1` on any build. It exists so the UI can
 * be read, screenshotted and reviewed without standing up a node — never as a
 * fallback when a real node is unreachable, which would silently show fiction
 * in place of the law.
 */
export function isDemo(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).has('demo');
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'Could not reach the node. Is it running?');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const httpApi: Api = {
  version: () => get<Version>('/api/version'),
  status: () => get<Status>('/api/status'),
  courts: () => get<CourtRow[]>('/api/courts'),
  search: (q) =>
    get<SearchResponse>(
      `/api/search${qs({
        q: q.q,
        limit: q.limit ?? 20,
        offset: q.offset ?? 0,
        court: q.court,
        region: q.region,
        year_from: q.year_from,
        year_to: q.year_to,
      })}`,
    ),
  case: (id) => get<CaseResponse>(`/api/case/${encodeURIComponent(id)}`),
  citations: (id) => get<CitationsResponse>(`/api/case/${encodeURIComponent(id)}/citations`),
  graph: (id, depth = 1) =>
    get<GraphResponse>(`/api/case/${encodeURIComponent(id)}/graph${qs({ depth })}`),
};

let cached: Api | null = null;

/** The API the app talks to. Resolved once, at first use. */
export async function api(): Promise<Api> {
  if (cached) return cached;
  if (isDemo()) {
    const { demoApi } = await import('./demo/api');
    cached = demoApi;
  } else {
    cached = httpApi;
  }
  return cached;
}
