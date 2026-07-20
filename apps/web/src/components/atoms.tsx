/** Small shared pieces: the mark, meters, badges, and the honest-status note. */

import type { ComponentChildren, JSX } from 'preact';
import type { Pinpoint, ProvenanceClass } from '../api';
import { TIER_LABEL, regionLabel, useCourts } from '../registry';

/** The kgotla ring, inline so it costs no request and inherits `currentColor`. */
export function Mark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <g stroke="currentColor" stroke-width="1.15" stroke-linecap="round" opacity="0.45" fill="none">
        <path d="M20 5 L30.61 30.61" />
        <path d="M20 5 L9.39 30.61" />
        <path d="M30.61 9.39 L5 20" />
        <path d="M9.39 9.39 L20 35" />
      </g>
      <g fill="currentColor">
        <circle cx="30.61" cy="9.39" r="2.5" />
        <circle cx="35" cy="20" r="2.5" />
        <circle cx="30.61" cy="30.61" r="2.5" />
        <circle cx="20" cy="35" r="2.5" />
        <circle cx="9.39" cy="30.61" r="2.5" />
        <circle cx="5" cy="20" r="2.5" />
        <circle cx="9.39" cy="9.39" r="2.5" />
      </g>
      <circle cx="20" cy="5" r="3.4" fill="#E9A23B" />
    </svg>
  );
}

export function Sep(): JSX.Element {
  return <span class="sep" aria-hidden="true">·</span>;
}

/**
 * Render an FTS5 snippet.
 *
 * The server sends plain text containing `<mark>` and nothing else. We parse
 * those two tags explicitly and render every other character as a text node, so
 * the browser never interprets server text as markup. This is deliberately not
 * `dangerouslySetInnerHTML` over a sanitiser: an allow-list of exactly one tag,
 * applied by construction, is smaller to reason about than a sanitiser.
 */
export function Snippet({ text }: { text: string }): JSX.Element {
  const out: ComponentChildren[] = [];
  const re = /<mark>([\s\S]*?)<\/mark>/g;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark>{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Authority as five segments. The number stays visible; the bars are the glance. */
export function Authority({ value, showValue = true }: { value: number; showValue?: boolean }): JSX.Element {
  const filled = Math.max(0, Math.min(5, Math.round(value * 5)));
  return (
    <span class="authority" title={`Authority ${value.toFixed(2)} of 1.00`}>
      <span class="bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i class={i < filled ? 'on' : ''} />
        ))}
      </span>
      {showValue && <span class="mono dim">{value.toFixed(2)}</span>}
      <span class="sr-only">{`Authority ${value.toFixed(2)} of 1.00`}</span>
    </span>
  );
}

const PROVENANCE_LABEL: Record<ProvenanceClass, string> = {
  corroborated: 'Corroborated',
  single: 'Single source',
  manual: 'Manually entered',
};

const PROVENANCE_TITLE: Record<ProvenanceClass, string> = {
  corroborated: 'Independent witnesses fetched this judgment and agreed on the bytes.',
  single: 'One witness only. Included, and marked as such.',
  manual: 'No online source; entered by hand and reviewed by a named person.',
};

export function ProvenanceBadge({ value }: { value: ProvenanceClass }): JSX.Element {
  return (
    <span class={`badge prov-${value}`} title={PROVENANCE_TITLE[value]}>
      <span class="dot" aria-hidden="true" />
      {PROVENANCE_LABEL[value]}
    </span>
  );
}

/**
 * A court's code and, when the node has told us one, its tier. Nothing about
 * the court is known to the UI a priori — an unrecognised code renders as
 * itself rather than being coerced into a hierarchy it may not belong to.
 */
export function CourtBadge({ code }: { code: string }): JSX.Element {
  const court = useCourts().get(code);
  return (
    <span
      class={`badge${court?.tier === 'apex' ? ' apex' : ''}`}
      title={court?.name ?? 'This node did not report metadata for this court code.'}
    >
      {code}
      {court && <span class="dim">{TIER_LABEL[court.tier]}</span>}
    </span>
  );
}

/**
 * Region profile. Shown only when the judgment declares one: a corpus from a
 * node that predates region support says nothing about jurisdiction, and an
 * invented default would be a claim we cannot support.
 */
export function RegionChip({ region }: { region: string | null | undefined }): JSX.Element | null {
  if (!region) return null;
  return (
    <span class="badge" title={`Region profile ${regionLabel(region)}. Molao is region-agnostic; a corpus declares the profile its judgments belong to.`}>
      <span class="dim">region</span>
      {regionLabel(region)}
    </span>
  );
}

/**
 * The honest-status device. Used wherever a feature is designed but not built —
 * the space says what is missing rather than being left empty, which would read
 * as "nothing to report".
 */
export function Note({ children }: { children: ComponentChildren }): JSX.Element {
  return <p class="note">{children}</p>;
}

export function formatPinpoint(pin: Pinpoint | null): string {
  if (!pin) return '';
  if (pin.kind === 'paragraph') {
    return /[–-]/.test(pin.value) ? `at paras ${pin.value}` : `at para ${pin.value}`;
  }
  return `at ${pin.value}`;
}

/** ISO date to `12 June 2025`, with the ISO form kept in the title attribute. */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m?.[1] || !m[2] || !m[3]) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

export function SearchIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" stroke-width="1.5" />
      <path d="M10.5 10.5 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

export function Loading({ label }: { label: string }): JSX.Element {
  return (
    <div class="state" role="status" aria-live="polite">
      <p class="mono dim">{label}</p>
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail: string }): JSX.Element {
  return (
    <div class="state" role="alert">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
