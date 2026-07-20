import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { SearchHit } from '../api';
import { Authority, ErrorState, Loading, Note, SearchIcon, Sep, Snippet, formatDate } from '../components/atoms';
import { href, navigate } from '../router';
import { useApi } from '../useAsync';

interface Props {
  q: string;
  court: string;
  region: string;
  yearFrom: string;
  yearTo: string;
}

export function Search({ q, court, region, yearFrom, yearTo }: Props): JSX.Element {
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const courts = useApi('courts', (client) => client.courts());
  const status = useApi('status', (client) => client.status());
  const key = `search|${q}|${court}|${region}|${yearFrom}|${yearTo}`;
  const results = useApi(key, (client) =>
    client.search({ q, court, region, year_from: yearFrom, year_to: yearTo, limit: 20 }),
  );

  // A single-region corpus needs no region filter, and showing one would imply
  // there is something to choose between.
  const regions = status.data?.regions ?? [];
  const multiRegion = regions.length > 1;

  const go = (next: Partial<Props>): void => {
    navigate(
      href('', {
        q: next.q ?? draft,
        court: next.court ?? court,
        region: next.region ?? region,
        year_from: next.yearFrom ?? yearFrom,
        year_to: next.yearTo ?? yearTo,
      }),
    );
  };

  const onSubmit = (e: Event): void => {
    e.preventDefault();
    go({});
  };

  return (
    <>
      <form class="search-form" role="search" onSubmit={onSubmit}>
        <div class="search-field">
          <SearchIcon />
          <input
            type="search"
            name="q"
            value={draft}
            placeholder="Search the full text of every judgment in this corpus"
            aria-label="Search judgments"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary">
            Search
          </button>
        </div>

        <div class="filters">
          <span class="label">Filter</span>
          <label class="filter">
            <span class="chip__k">court</span>
            <select
              aria-label="Filter by court"
              value={court}
              onChange={(e) => go({ court: (e.currentTarget as HTMLSelectElement).value })}
            >
              <option value="">all courts</option>
              {(courts.data ?? []).map((c) => (
                <option value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          {multiRegion && (
            <label class="filter">
              <span class="chip__k">region</span>
              <select
                aria-label="Filter by region profile"
                value={region}
                onChange={(e) => go({ region: (e.currentTarget as HTMLSelectElement).value })}
              >
                <option value="">all regions</option>
                {regions.map((code) => (
                  <option value={code}>{code}</option>
                ))}
              </select>
            </label>
          )}
          <label class="filter">
            <span class="chip__k">from</span>
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max="2100"
              placeholder="1994"
              aria-label="Earliest year"
              value={yearFrom}
              onChange={(e) => go({ yearFrom: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <label class="filter">
            <span class="chip__k">to</span>
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max="2100"
              placeholder="2026"
              aria-label="Latest year"
              value={yearTo}
              onChange={(e) => go({ yearTo: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          {(court || region || yearFrom || yearTo) && (
            <button
              type="button"
              class="btn"
              onClick={() => go({ court: '', region: '', yearFrom: '', yearTo: '' })}
            >
              Clear filters
            </button>
          )}
        </div>
      </form>

      {results.error && <ErrorState title="Search failed" detail={results.error} />}

      {!results.error && (
        <>
          <div class="result-bar">
            <span class="label">{q ? 'Results' : 'Most cited in this corpus'}</span>
            <span class="mono dim">
              {results.data ? `${results.data.total} judgment${results.data.total === 1 ? '' : 's'}` : '—'}
            </span>
            <span class="spacer" />
            <span class="mono dim" title="Search is full text (SQLite FTS5) over canonical judgment text.">
              fts5 · rank by relevance × authority
            </span>
          </div>

          {results.loading && !results.data && <Loading label="searching…" />}

          {results.data && results.data.hits.length === 0 && (
            <div class="state">
              <h2>Nothing matched</h2>
              <p>
                Full-text search matches words as they appear in the judgment. There is no semantic search:
                embeddings cannot be recomputed identically by another node, so they are not part of a release.
              </p>
            </div>
          )}

          {results.data && results.data.hits.length > 0 && (
            <ul class="results">
              {results.data.hits.map((hit) => (
                <li>
                  <Result hit={hit} />
                </li>
              ))}
            </ul>
          )}

          {results.data && results.data.hits.length > 0 && (
            <div style="margin-top:18px">
              <Note>
                <span>
                  Results are ranked by text relevance and by <b>authority</b> — how much this judgment is relied
                  on, weighted by the standing of the courts relying on it. It is not a measure of whether a
                  judgment is still good law: <b>treatment signals are not yet available</b>.
                </span>
              </Note>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Result({ hit }: { hit: SearchHit }): JSX.Element {
  return (
    <a class="result" href={href(`case/${hit.id}`)}>
      <span class="result-title">{hit.title}</span>
      <span class="result-cited">
        <span class="mono dim">cited by </span>
        <span class="mono">{hit.cited_by_count}</span>
      </span>
      <div class="result-meta mono">
        {hit.neutral_citation && (
          <>
            <span style="color:var(--ink-2)">{hit.neutral_citation}</span>
            <Sep />
          </>
        )}
        <span title={hit.court_name}>{hit.court}</span>
        <Sep />
        {hit.region && (
          <>
            <span class="dim" title={`Region profile ${hit.region}`}>
              {hit.region}
            </span>
            <Sep />
          </>
        )}
        <span class="dim" title={hit.date ?? ''}>
          {formatDate(hit.date)}
        </span>
        <Sep />
        <Authority value={hit.authority} />
      </div>
      <p class="result-snippet">
        <Snippet text={hit.snippet} />
      </p>
    </a>
  );
}
