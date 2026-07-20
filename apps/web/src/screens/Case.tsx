import type { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { CaseResponse, CitationsResponse, CiteIn, CiteOut, Paragraph } from '../api';
import {
  Authority,
  CourtBadge,
  ErrorState,
  Loading,
  Note,
  ProvenanceBadge,
  RegionChip,
  Sep,
  formatDate,
  formatPinpoint,
} from '../components/atoms';
import { CitationGraph } from '../components/Graph';
import { href } from '../router';
import { useApi } from '../useAsync';

interface Props {
  id: string;
  tab: 'judgment' | 'citations' | 'graph';
  para: number | null;
}

export function Case({ id, tab, para }: Props): JSX.Element {
  const detail = useApi(`case|${id}`, (client) => client.case(id));
  const citations = useApi(`citations|${id}`, (client) => client.citations(id));

  if (detail.error) {
    return <ErrorState title="Judgment not found" detail={detail.error} />;
  }
  if (!detail.data) {
    return <Loading label="loading judgment…" />;
  }

  const c = detail.data;
  const cites = citations.data?.cites ?? [];

  return (
    <>
      <Header detail={c} />

      <nav class="tabs" aria-label="Judgment views">
        <a href={href(`case/${id}`)} aria-current={tab === 'judgment' ? 'page' : undefined}>
          Judgment <span class="count">{c.judgment.paragraphs.length} paras</span>
        </a>
        <a href={href(`case/${id}/citations`)} aria-current={tab === 'citations' ? 'page' : undefined}>
          Citations <span class="count">{c.cites_count} / {c.cited_by_count}</span>
        </a>
        <a href={href(`case/${id}/graph`)} aria-current={tab === 'graph' ? 'page' : undefined}>
          Graph <span class="count">1 hop</span>
        </a>
      </nav>

      {tab === 'judgment' && <Body judgment={c.judgment} cites={cites} highlight={para} />}
      {tab === 'citations' && (
        <Citations
          data={citations.data}
          loading={citations.loading}
          error={citations.error}
          title={c.judgment.title}
        />
      )}
      {tab === 'graph' && <CitationGraph id={id} />}
    </>
  );
}

function Header({ detail }: { detail: CaseResponse }): JSX.Element {
  const j = detail.judgment;
  return (
    <header class="panel jhead">
      <h1>{j.title}</h1>
      <div class="citeline mono">
        {j.neutral_citation && (
          <>
            <span class="neutral">{j.neutral_citation}</span>
            <Sep />
          </>
        )}
        <span>{detail.court_name}</span>
        <Sep />
        <span title={j.date ?? ''}>{formatDate(j.date)}</span>
      </div>

      <div class="badges">
        <RegionChip region={j.region} />
        <CourtBadge code={j.court} />
        <ProvenanceBadge value={detail.provenance_class} />
        <span class="badge" title="Authority: how much this judgment is relied on, weighted by the standing of the courts relying on it.">
          authority
          <Authority value={detail.authority} />
        </span>
        <span class="badge" title="BLAKE3 of the canonical text. This is the judgment's identity on every node.">
          id <span style="color:var(--ink-2)">{j.id.slice(0, 12)}</span>
        </span>
      </div>

      <dl class="facts">
        <Fact label="Case number">
          <span class="value">{j.case_numbers.length ? j.case_numbers.join(', ') : '—'}</span>
        </Fact>
        <Fact label="Coram">
          <span class="value sans">{j.judges.length ? j.judges.join(', ') : '—'}</span>
        </Fact>
        <Fact label="Reported at">
          <span class="value">
            {detail.reported_citations.length ? detail.reported_citations.join('; ') : 'Not reported'}
          </span>
        </Fact>
        <Fact label="Citations">
          <span class="value">
            {detail.cites_count} out · {detail.cited_by_count} in
          </span>
        </Fact>
      </dl>
    </header>
  );
}

function Fact({ label, children }: { label: string; children: ComponentChildren }): JSX.Element {
  return (
    <div class="fact">
      <dt class="label">{label}</dt>
      <dd style="margin:0">{children}</dd>
    </div>
  );
}

// ---- judgment body --------------------------------------------------------

function Body({
  judgment,
  cites,
  highlight,
}: {
  judgment: { paragraphs: Paragraph[] };
  cites: CiteOut[];
  highlight: number | null;
}): JSX.Element {
  useEffect(() => {
    if (highlight === null) return;
    const el = document.getElementById(`para-${highlight}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [highlight]);

  const byPara = new Map<number, CiteOut[]>();
  for (const cite of cites) {
    if (cite.from_para === null) continue;
    const list = byPara.get(cite.from_para) ?? [];
    list.push(cite);
    byPara.set(cite.from_para, list);
  }

  return (
    <div class="paras">
      {judgment.paragraphs.map((p) => (
        <div
          class={`para${p.number === null ? ' coram' : ''}`}
          id={`para-${p.index}`}
          style={highlight === p.index ? 'background:var(--mark-bg);border-radius:4px' : undefined}
        >
          <div class="num" aria-hidden={p.number === null}>
            {p.number ?? ''}
          </div>
          <p class="text">
            <ParagraphText text={p.text} cites={byPara.get(p.index) ?? []} />
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Splice the extracted citations back into the paragraph text.
 *
 * Positions come from finding `as_written` — the extractor's own record of what
 * the judgment says — moving left to right so repeated citations land in the
 * right places. Text is rendered as text nodes throughout; nothing from the
 * server is interpreted as markup.
 */
function ParagraphText({ text, cites }: { text: string; cites: CiteOut[] }): JSX.Element {
  if (cites.length === 0) return <>{text}</>;

  const out: ComponentChildren[] = [];
  let cursor = 0;
  for (const cite of cites) {
    const at = text.indexOf(cite.as_written, cursor);
    if (at < 0) continue;
    if (at > cursor) out.push(text.slice(cursor, at));
    out.push(<InlineCite cite={cite} />);
    cursor = at + cite.as_written.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

function InlineCite({ cite }: { cite: CiteOut }): JSX.Element {
  if (cite.resolved && cite.to_id) {
    const target =
      cite.pinpoint?.kind === 'paragraph'
        ? href(`case/${cite.to_id}`, { para: pinpointToIndex(cite.pinpoint.value) })
        : href(`case/${cite.to_id}`);
    return (
      <a class="cite" href={target} title={`${cite.canonical} — in this corpus`}>
        {cite.as_written}
      </a>
    );
  }
  return (
    <span
      class="cite unresolved"
      title={`${cite.canonical} is cited here but is not in this corpus. The citation is shown as written; it is not hidden.`}
    >
      {cite.as_written}
    </span>
  );
}

/**
 * Printed paragraph numbers and array indices are not the same thing —
 * judgments skip and restart numbers. The demo corpus numbers from 1 after an
 * unnumbered coram line, so index = number. A node that stores printed numbers
 * should resolve this server-side; until it does, this is a best-effort jump
 * and the paragraph number remains visible so the reader can correct it.
 */
function pinpointToIndex(value: string): string {
  const first = /\d+/.exec(value);
  return first ? first[0] : '';
}

// ---- citations panel ------------------------------------------------------

function Citations({
  data,
  loading,
  error,
  title,
}: {
  data: CitationsResponse | null;
  loading: boolean;
  error: string | null;
  title: string;
}): JSX.Element {
  if (error) return <ErrorState title="Citations unavailable" detail={error} />;
  if (!data && loading) return <Loading label="loading citations…" />;
  if (!data) return <ErrorState title="Citations unavailable" detail="No response from the node." />;

  const unresolved = data.cites.filter((c) => !c.resolved).length;

  return (
    <>
      <div class="cols">
        <section class="col">
          <h2>
            Cites
            <span class="mono dim">{data.cites.length}</span>
            <span class="label" style="margin-left:auto">judgments this one relies on</span>
          </h2>
          <ul class="citelist">
            {data.cites.length === 0 && <li class="empty">This judgment cites nothing in the corpus.</li>}
            {data.cites.map((cite) => (
              <li>
                <CiteOutRow cite={cite} />
              </li>
            ))}
          </ul>
          {unresolved > 0 && (
            <p class="mono dim" style="margin:9px 2px 0">
              {unresolved} of {data.cites.length} could not be resolved to a judgment in this corpus.
            </p>
          )}
        </section>

        <section class="col">
          <h2>
            Cited by
            <span class="mono dim">{data.cited_by.length}</span>
            <span class="label" style="margin-left:auto">judgments relying on this one</span>
          </h2>
          <ul class="citelist">
            {data.cited_by.length === 0 && (
              <li class="empty">Nothing in this corpus cites this judgment yet.</li>
            )}
            {data.cited_by.map((cite) => (
              <li>
                <CiteInRow cite={cite} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div style="margin-top:18px">
        <Note>
          <span>
            <b>Treatment signals are not yet available.</b> This panel shows that a later judgment cited{' '}
            {title}, and where. It does not show whether that judgment followed, distinguished, criticised or
            overruled it. Treatment attestations are designed but not built, and Molao will not guess at them —
            a citation is evidence of reliance, not of approval.
          </span>
        </Note>
      </div>
    </>
  );
}

function CiteOutRow({ cite }: { cite: CiteOut }): JSX.Element {
  const pin = formatPinpoint(cite.pinpoint);
  const inner = (
    <>
      <div class="rowtop">
        <span class="name">{cite.resolved ? cite.canonical : cite.as_written.split(' at ')[0]}</span>
        {pin && <span class="pin mono">{pin}</span>}
      </div>
      <div class="rowmeta mono">
        <span>{cite.citation_key}</span>
        <Sep />
        {cite.resolved ? (
          <span class="dim">in corpus</span>
        ) : (
          <span class="dim">unresolved — not in this corpus</span>
        )}
        {cite.from_para !== null && (
          <>
            <Sep />
            <span class="dim">from para {cite.from_para}</span>
          </>
        )}
      </div>
      {!cite.resolved && (
        <div class="quoted">Shown as written: “{cite.as_written}”</div>
      )}
    </>
  );

  return cite.resolved && cite.to_id ? (
    <a class="citerow" href={href(`case/${cite.to_id}`)}>
      {inner}
    </a>
  ) : (
    <div class="citerow">{inner}</div>
  );
}

function CiteInRow({ cite }: { cite: CiteIn }): JSX.Element {
  const pin = formatPinpoint(cite.pinpoint);
  return (
    <a
      class="citerow"
      href={href(`case/${cite.from_id}`, cite.from_para !== null ? { para: String(cite.from_para) } : {})}
    >
      <div class="rowtop">
        <span class="name">{cite.title}</span>
        {pin && <span class="pin mono">{pin}</span>}
      </div>
      <div class="rowmeta mono">
        <span>{cite.court}</span>
        <Sep />
        <span class="dim">{formatDate(cite.date)}</span>
        {cite.from_para !== null && (
          <>
            <Sep />
            <span class="dim">at its para {cite.from_para}</span>
          </>
        )}
      </div>
      <div class="quoted">Cited as “{cite.as_written}”</div>
    </a>
  );
}
