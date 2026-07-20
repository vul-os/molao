import type { ComponentChildren, JSX } from 'preact';
import { ErrorState, Loading, Note } from '../components/atoms';
import { TIER_LABEL } from '../registry';
import { href } from '../router';
import { useApi } from '../useAsync';

export function Status(): JSX.Element {
  const status = useApi('status', (client) => client.status());
  const version = useApi('version', (client) => client.version());
  const courts = useApi('courts', (client) => client.courts());

  if (status.error) return <ErrorState title="Node unavailable" detail={status.error} />;
  if (!status.data) return <Loading label="reading node status…" />;

  const s = status.data;
  const total = Math.max(1, s.provenance.corroborated + s.provenance.single + s.provenance.manual);

  return (
    <>
      <div class="page-head">
        <h1>Node status</h1>
        <span class="mono dim">
          {version.data ? `${version.data.name} ${version.data.version} · ${version.data.extractor_version}` : '—'}
        </span>
      </div>

      <div class="stats">
        <Stat label="Judgments" value={s.docs.toLocaleString('en')} sub="in this corpus" />
        <Stat label="Citation edges" value={s.edges.toLocaleString('en')} sub="extracted, not curated" />
        <Stat label="Courts" value={String(s.courts)} sub="with at least one judgment" />
        {s.regions && s.regions.length > 0 && (
          <Stat
            label={s.regions.length === 1 ? 'Region profile' : 'Region profiles'}
            value={s.regions.join(' · ')}
            sub={s.regions.length === 1 ? 'this corpus holds one' : 'held in one corpus'}
          />
        )}
        <Stat
          label="Release"
          value={s.release === null ? '—' : `#${s.release}`}
          sub={s.release === null ? 'no release loaded' : 'threshold-signed'}
          accent
        />
        <Stat
          label="Signatures"
          value={`${s.threshold}`}
          unit={` of ${s.signers}`}
          sub="k-of-n required to publish"
        />
      </div>

      {s.docs === 0 && (
        <Note>
          <span>
            <b>This node is empty.</b> There is no bundled corpus: a node starts with nothing and you either
            ingest judgments yourself or fetch a signed release. That is deliberate — a corpus that shipped
            inside the binary would have exactly one publisher.
          </span>
        </Note>
      )}

      <section class="section">
        <h2>Provenance</h2>
        <div class="panel prov-bars">
          <ProvRow
            label="Corroborated"
            hint="independent witnesses agreed on the bytes"
            n={s.provenance.corroborated}
            total={total}
            kind="corroborated"
          />
          <ProvRow
            label="Single source"
            hint="one witness only, marked as such"
            n={s.provenance.single}
            total={total}
            kind="single"
          />
          <ProvRow
            label="Manually entered"
            hint="no online source; keyed in and reviewed"
            n={s.provenance.manual}
            total={total}
            kind="manual"
          />
        </div>
        <div style="margin-top:12px">
          <Note>
            <span>
              Verification here means <b>bytes and signatures</b>: that the text hashes to the id it claims, and
              that the release carries {s.threshold} valid signatures. It is not a statement that a judgment is
              accurate, current, or good law.
            </span>
          </Note>
        </div>
      </section>

      <section class="section">
        <h2>Court coverage</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Court</th>
                <th>Tier</th>
                <th>Seat</th>
                <th class="num">Judgments</th>
              </tr>
            </thead>
            <tbody>
              {(courts.data ?? []).map((c) => (
                <tr>
                  <td class="code">
                    <a href={href('', { court: c.code })}>{c.code}</a>
                  </td>
                  <td>{c.name}</td>
                  <td class="mono dim">{TIER_LABEL[c.tier]}</td>
                  <td class="mono dim">{c.seat ?? '—'}</td>
                  <td class="num">{c.doc_count}</td>
                </tr>
              ))}
              {courts.data?.length === 0 && (
                <tr>
                  <td colSpan={5} class="dim" style="text-align:center;padding:22px">
                    No courts represented — this node has no judgments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p class="mono dim" style="margin:9px 2px 0">
          Courts, tiers and seats are reported by this node from its region profile — the UI holds no registry of
          its own. Coverage is what this node holds, not what the courts have handed down: absence here means this
          corpus lacks it.
        </p>
      </section>

      <section class="section">
        <h2>Designed, not built</h2>
        <div style="display:grid;gap:9px">
          <Note>
            <span>
              <b>Treatment attestations</b> — followed, distinguished, criticised, overruled. The data model
              exists; nothing populates it, and no treatment flag is shown anywhere in this UI.
            </span>
          </Note>
          <Note>
            <span>
              <b>Peer-to-peer distribution.</b> Releases are plain signed files today. There is no swarm, no
              tracker and no DHT yet — mirroring is copying a file.
            </span>
          </Note>
          <Note>
            <span>
              <b>Semantic search is deliberately out of scope.</b> Embeddings cannot be recomputed identically by
              another node from the same text, so a release containing them could not be verified by
              recomputation. Search is full text, and stays that way until that changes.
            </span>
          </Note>
        </div>
      </section>

      {version.data && (
        <section class="section">
          <h2>Build</h2>
          <div class="table-wrap">
            <table>
              <tbody>
                <BuildRow label="Node version" value={version.data.version} />
                <BuildRow label="Extractor version" value={version.data.extractor_version} />
                <BuildRow
                  label="Corpus root"
                  value={version.data.corpus_root ?? 'none — no release loaded'}
                />
                <BuildRow label="Release" value={version.data.release === null ? 'none' : `#${version.data.release}`} />
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div class={`panel stat${accent ? ' accent' : ''}`}>
      <span class="label">{label}</span>
      <span class="n">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <span class="sub">{sub}</span>
    </div>
  );
}

function ProvRow({
  label,
  hint,
  n,
  total,
  kind,
}: {
  label: string;
  hint: string;
  n: number;
  total: number;
  kind: 'corroborated' | 'single' | 'manual';
}): JSX.Element {
  const pct = Math.round((n / total) * 100);
  return (
    <div class="prov-row">
      <div>
        <div style="font-size:12.5px;font-weight:550">{label}</div>
        <div class="dim" style="font-size:11px">
          {hint}
        </div>
      </div>
      <div class="prov-track" role="img" aria-label={`${label}: ${n} of ${total} judgments, ${pct} percent`}>
        <div class={`prov-fill ${kind}`} style={`width:${Math.max(n > 0 ? 2 : 0, pct)}%`} />
      </div>
      <div class="mono" style="text-align:right">
        {n} <span class="dim">{pct}%</span>
      </div>
    </div>
  );
}

function BuildRow({ label, value }: { label: string; value: ComponentChildren }): JSX.Element {
  return (
    <tr>
      <td style="width:190px" class="label">
        {label}
      </td>
      <td class="mono" style="overflow-wrap:anywhere">
        {value}
      </td>
    </tr>
  );
}
