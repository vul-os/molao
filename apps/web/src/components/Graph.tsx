/**
 * The 1-hop citation neighbourhood, drawn by hand.
 *
 * No d3 and no layout library: the node embeds this UI in its binary and every
 * kilobyte is a kilobyte a mirror has to carry.
 *
 * The layout is layered rather than force-directed, because a citation graph is
 * not a cloud of springs — it is time-ordered. Judgments that cite the focus sit
 * in the lane above it; judgments the focus cites sit in the lane below. Later
 * law is higher; the authority it rests on is lower. Within a lane, nodes sit on
 * a fixed column pitch wide enough for their labels, ordered by date and then
 * swept by barycentre so that edges between the lanes cross as little as
 * possible.
 *
 * That geometry buys three things a relaxation could not: labels cannot collide,
 * because the pitch is wider than a label; labels cannot be crossed by edges,
 * because every label sits on the outside of its lane and every edge runs in the
 * corridor between lanes; and the drawing is deterministic, so a screenshot is
 * reproducible.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { GraphEdge, GraphNode } from '../api';
import { ErrorState, Loading, Note } from './atoms';
import { useCourts } from '../registry';
import { href } from '../router';
import { useApi } from '../useAsync';
import type { CourtRow } from '../api';

/** Beyond this the picture stops being a picture and becomes a hairball. */
const MAX_NODES = 15;

/** Column pitch. Wider than the widest label, which is what stops collisions. */
const COL_W = 158;
/** Distance between lane centres. */
const LANE_GAP = 158;
/** Side padding. The left side carries the lane captions, so it gets enough
    room for one to sit clear of the leftmost node in its lane — a caption that
    touches a circle is exactly the collision this layout exists to avoid. */
const PAD_L = 104;
const PAD_R = 30;
/** Vertical clearance of a caption from its lane line: further than the largest
    node radius, so a caption can never land inside a circle. */
const CAP_DY = 27;

type Band = -1 | 0 | 1;

interface Placed extends GraphNode {
  x: number;
  y: number;
  r: number;
  band: Band;
  short: string;
  sub: string;
}

const LANE_CAPTION: Record<string, string> = {
  '-1': 'cites this',
  '0': 'this judgment',
  '1': 'cited by this',
};

export function CitationGraph({ id }: { id: string }): JSX.Element {
  const graph = useApi(`graph|${id}`, (client) => client.graph(id, 1));
  const courts = useCourts();

  const layout = useMemo(
    () => (graph.data ? place(graph.data.nodes, graph.data.edges, id) : null),
    [graph.data, id],
  );

  // When the picture is wider than the screen the interesting part is the
  // focus, not the left margin. Open the scroll on it.
  const wrap = useRef<HTMLDivElement | null>(null);
  const box = layout?.box;
  useEffect(() => {
    const el = wrap.current;
    if (!el || !box) return;
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 0) return;
    const focusFraction = (0 - box.x) / box.w;
    el.scrollLeft = Math.max(0, Math.min(over, focusFraction * el.scrollWidth - el.clientWidth / 2));
  }, [box]);

  if (graph.error) return <ErrorState title="Graph unavailable" detail={graph.error} />;
  if (!layout) return <Loading label="laying out neighbourhood…" />;

  const { nodes, edges, hidden, lanes, box: view } = layout;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <>
      <figure class="graph-wrap">
        <div class="graph-scroll" ref={wrap}>
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          width={view.w}
          height={view.h}
          /* Grow to fill a wide panel rather than sit marooned in the middle of
             it, but only so far — past about a third over life size the labels
             start to look like a poster. */
          style={`max-width:${Math.round(view.w * 1.32)}px`}
          role="img"
          aria-label={`Citation neighbourhood: ${nodes.length} judgments, ${edges.length} citations, one hop from the focus.`}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L8 4 L0 8 z" fill="var(--dim)" />
            </marker>
          </defs>

          {/* Lanes, drawn first so everything else sits on top of them. */}
          <g aria-hidden="true">
            {lanes.map((band) => (
              <g>
                <line
                  x1={view.x + 10}
                  y1={band * LANE_GAP}
                  x2={view.x + view.w - 10}
                  y2={band * LANE_GAP}
                  stroke="var(--line)"
                  stroke-width="1"
                  stroke-dasharray="2 5"
                />
                {/* Captions sit on the corridor side of their lane, where the
                    node labels never go, so they cannot be collided with. */}
                <text
                  class="glane-cap"
                  x={view.x + 12}
                  y={band * LANE_GAP + (band === -1 ? CAP_DY : -CAP_DY)}
                >
                  {LANE_CAPTION[String(band)]}
                </text>
              </g>
            ))}
          </g>

          <g>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const touchesFocus = a.band === 0 || b.band === 0;
              return (
                <path
                  d={route(a, b)}
                  fill="none"
                  stroke="var(--dim)"
                  stroke-width={touchesFocus ? 1.5 : 1}
                  opacity={touchesFocus ? 0.8 : 0.36}
                  marker-end="url(#arrow)"
                />
              );
            })}
          </g>

          <g>
            {nodes.map((n) => (
              <Node node={n} court={courts.get(n.court)} />
            ))}
          </g>
        </svg>
        </div>

        <figcaption class="graph-legend">
          <span class="legend-item">
            <svg width="14" height="14" aria-hidden="true">
              <circle
                cx="7"
                cy="7"
                r="5.5"
                fill="var(--accent)"
                opacity="0.25"
                stroke="var(--accent)"
                stroke-width="1.5"
              />
            </svg>
            apex court
          </span>
          <span class="legend-item">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="1.5" />
            </svg>
            other courts
          </span>
          <span class="legend-item">node size = authority</span>
          <span class="legend-item" style="margin-left:auto">
            {nodes.length} nodes · {edges.length} edges
            {hidden > 0 ? ` · ${hidden} hidden` : ''}
          </span>
        </figcaption>
      </figure>

      {/* The same neighbourhood, as grouped lists.
          A lane of four nodes cannot fit a 390px screen, so on a phone the
          drawing has to scroll sideways and clips its outer nodes at rest —
          legible, but a picture you have to drag is a poor way to read a
          citation list. The lanes carry the identical information (which
          judgments cite this one, which it cites) in a form a thumb can
          actually use. CSS shows exactly one of the two, never both. */}
      <LaneList nodes={nodes} courts={courts} />

      {hidden > 0 && (
        <p class="mono dim hint">
          {hidden} lower-authority neighbour{hidden === 1 ? ' is' : 's are'} not drawn. The full edge list is on the
          Citations tab.
        </p>
      )}

      <div style="margin-top:18px">
        <Note>
          <span>
            Edges are citations extracted by the pinned extractor and nothing more. An arrow means one judgment
            referred to another; it does not mean it agreed with it. <b>Treatment signals are not yet available</b>,
            so an overruled judgment looks exactly like an approved one here.
          </span>
        </Note>
      </div>
    </>
  );
}

/** The lane bands in reading order, with captions that read as sentences. */
const LANE_SECTIONS: { band: Band; caption: string }[] = [
  { band: -1, caption: 'Cites this judgment' },
  { band: 0, caption: 'This judgment' },
  { band: 1, caption: 'Cited by this judgment' },
];

function LaneList({ nodes, courts }: { nodes: Placed[]; courts: Map<string, CourtRow> }): JSX.Element {
  return (
    <div class="graph-lanes">
      {LANE_SECTIONS.map(({ band, caption }) => {
        const items = nodes.filter((n) => n.band === band);
        if (items.length === 0) return null;
        return (
          <section class="lane" key={band}>
            <h3 class="lane-caption mono">
              {caption}
              <span class="dim"> {items.length}</span>
            </h3>
            <ul class="lane-list">
              {items.map((n) => {
                const apex = courts.get(n.court)?.tier === 'apex';
                const focus = n.band === 0;
                return (
                  <li key={n.id}>
                    {focus ? (
                      <span class="lane-item is-focus">
                        <LaneFace node={n} apex={apex} />
                      </span>
                    ) : (
                      <a class="lane-item" href={href(`case/${n.id}`)}>
                        <LaneFace node={n} apex={apex} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function LaneFace({ node, apex }: { node: Placed; apex: boolean }): JSX.Element {
  return (
    <>
      <span class={`lane-dot${apex ? ' is-apex' : ''}`} aria-hidden="true" />
      <span class="lane-text">
        <span class="lane-title">{node.title}</span>
        <span class="lane-sub mono dim">{node.sub}</span>
      </span>
    </>
  );
}

function Node({ node, court }: { node: Placed; court: CourtRow | undefined }): JSX.Element {
  const apex = court?.tier === 'apex';
  const focus = node.band === 0;

  // Labels always face outward, away from the corridor the edges run in: the
  // top lane labels upward, the bottom lane downward, and the focus — which has
  // corridors on both sides — labels to its right.
  const label = focus
    ? { x: node.x + node.r + 13, y: node.y - 1, subY: node.y + 12, anchor: 'start' as const }
    : node.band === -1
      ? { x: node.x, y: node.y - node.r - 24, subY: node.y - node.r - 11, anchor: 'middle' as const }
      : { x: node.x, y: node.y + node.r + 20, subY: node.y + node.r + 33, anchor: 'middle' as const };

  return (
    <a class="gnode" href={href(`case/${node.id}`)} aria-label={`${node.title}, ${node.sub}`}>
      <title>{`${node.title} — ${court?.name ?? node.court}`}</title>
      {focus && (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r + 7}
          fill="none"
          stroke="var(--accent)"
          stroke-width="1"
          opacity="0.45"
        />
      )}
      <circle
        cx={node.x}
        cy={node.y}
        r={node.r}
        fill={apex ? 'color-mix(in srgb, var(--accent) 30%, var(--surface))' : 'var(--surface-2)'}
        stroke={apex ? 'var(--accent)' : 'var(--dim)'}
        stroke-width={focus ? 2.4 : 1.5}
      />
      <text class="gnode-label" x={label.x} y={label.y} text-anchor={label.anchor}>
        {node.short}
      </text>
      <text class="gnode-sub" x={label.x} y={label.subY} text-anchor={label.anchor}>
        {node.sub}
      </text>
    </a>
  );
}

/** `Nkosi v Minister of Police` -> `Nkosi`. Falls back to a truncation. */
function shortTitle(title: string): string {
  const first = title.split(/\s+v\s+/)[0] ?? title;
  const cleaned = first.replace(/\s*\(Pty\)\s*Ltd/i, '').replace(/\s+NO$/, '').trim();
  return cleaned.length > 20 ? `${cleaned.slice(0, 19)}…` : cleaned;
}

// ---- edge routing ---------------------------------------------------------

/**
 * Three cases, each chosen so the path stays out of the label bands.
 *
 * Between neighbouring lanes: a vertical cubic, leaving the rim of one node and
 * arriving at the rim of the next, entirely inside the corridor. Within a lane:
 * a bow toward the focus, because the outside of a lane is where its labels
 * live. Across both lanes: a bow around the outside of the focus, so the arc
 * never runs through the middle of the picture.
 */
function route(a: Placed, b: Placed): string {
  const span = Math.abs(b.band - a.band);
  if (span === 0) return sameLane(a, b);
  if (span === 2) return bypass(a, b);
  return corridor(a, b);
}

function corridor(a: Placed, b: Placed): string {
  const dir = b.y > a.y ? 1 : -1;
  const sy = a.y + dir * a.r;
  const ey = b.y - dir * (b.r + 6);
  const k = Math.abs(ey - sy) * 0.45;
  return `M${f(a.x)} ${f(sy)} C${f(a.x)} ${f(sy + dir * k)} ${f(b.x)} ${f(ey - dir * k)} ${f(b.x)} ${f(ey)}`;
}

function sameLane(a: Placed, b: Placed): string {
  // Toward the focus lane: for the top lane that is downward, for the bottom
  // lane upward. The focus lane holds at most one node, so it never gets here.
  const inward = a.band === -1 ? 1 : -1;
  const dist = Math.abs(b.x - a.x) || 1;
  const bow = Math.min(74, 30 + dist * 0.16);
  const sign = b.x > a.x ? 1 : -1;
  const sx = a.x + sign * a.r * 0.72;
  const sy = a.y + inward * a.r * 0.72;
  const ex = b.x - sign * (b.r + 5) * 0.72;
  const ey = b.y + inward * (b.r + 5) * 0.72;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2 + inward * bow;
  return `M${f(sx)} ${f(sy)} Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`;
}

function bypass(a: Placed, b: Placed): string {
  const side = a.x + b.x >= 0 ? 1 : -1;
  const dir = b.y > a.y ? 1 : -1;
  const sx = a.x + side * a.r * 0.6;
  const sy = a.y + dir * a.r * 0.8;
  const ex = b.x + side * b.r * 0.6;
  const ey = b.y - dir * (b.r + 6) * 0.8;
  const bow = 104;
  return `M${f(sx)} ${f(sy)} C${f(sx + side * bow)} ${f(sy + dir * 46)} ${f(ex + side * bow)} ${f(
    ey - dir * 46,
  )} ${f(ex)} ${f(ey)}`;
}

function f(n: number): string {
  return n.toFixed(1);
}

// ---- layout ---------------------------------------------------------------

interface Layout {
  nodes: Placed[];
  edges: GraphEdge[];
  hidden: number;
  lanes: Band[];
  box: { x: number; y: number; w: number; h: number };
}

function place(allNodes: GraphNode[], allEdges: GraphEdge[], focusId: string): Layout {
  const focus = allNodes.find((n) => n.id === focusId);
  const others = allNodes
    .filter((n) => n.id !== focusId)
    .sort((a, b) => b.authority - a.authority || (b.date ?? '').localeCompare(a.date ?? ''));

  const keep = others.slice(0, MAX_NODES - 1);
  const hidden = others.length - keep.length;
  const kept = new Set(keep.map((n) => n.id));
  if (focus) kept.add(focus.id);

  const edges = allEdges.filter((e) => kept.has(e.from) && kept.has(e.to));
  const citesFocus = new Set(allEdges.filter((e) => e.to === focusId).map((e) => e.from));

  const byDate = (a: GraphNode, b: GraphNode): number =>
    (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id);

  let top = keep.filter((n) => citesFocus.has(n.id)).sort(byDate);
  let bottom = keep.filter((n) => !citesFocus.has(n.id)).sort(byDate);

  // Barycentre sweeps: pull each node toward the average position of the nodes
  // it shares an edge with in the other lane, which is the cheapest honest way
  // to stop the cross-lane edges from plaiting.
  for (let pass = 0; pass < 4; pass += 1) {
    top = sweep(top, bottom, edges);
    bottom = sweep(bottom, top, edges);
  }

  const nodes: Placed[] = [];
  if (focus) nodes.push(dress(focus, 0, 0, 0, 3));
  top.forEach((n, i) => nodes.push(dress(n, lanePos(i, top.length), -LANE_GAP, -1, 0)));
  bottom.forEach((n, i) => nodes.push(dress(n, lanePos(i, bottom.length), LANE_GAP, 1, 0)));

  const lanes: Band[] = [];
  if (top.length) lanes.push(-1);
  if (focus) lanes.push(0);
  if (bottom.length) lanes.push(1);

  return { nodes, edges, hidden, lanes, box: fit(nodes, edges) };
}

function lanePos(i: number, n: number): number {
  return (i - (n - 1) / 2) * COL_W;
}

function dress(n: GraphNode, x: number, y: number, band: Band, grow: number): Placed {
  const year = n.date?.slice(0, 4) ?? '';
  return {
    ...n,
    x,
    y,
    band,
    r: radius(n.authority) + grow,
    short: shortTitle(n.title),
    sub: `${n.court}${year ? ` ${year}` : ''}`,
  };
}

function radius(authority: number): number {
  return 8 + Math.max(0, Math.min(1, authority)) * 12;
}

/** One barycentre pass of `lane` against the fixed order of `other`. */
function sweep(lane: GraphNode[], other: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const rank = new Map(other.map((n, i) => [n.id, i]));
  const scored = lane.map((n, i) => {
    let sum = 0;
    let count = 0;
    for (const e of edges) {
      const peer = e.from === n.id ? e.to : e.to === n.id ? e.from : null;
      if (peer === null) continue;
      const r = rank.get(peer);
      if (r === undefined) continue;
      sum += r;
      count += 1;
    }
    // Unconnected nodes keep their place rather than being flung to the front.
    const key = count > 0 ? (sum / count) * (lane.length / Math.max(1, other.length)) : i;
    return { n, key, i };
  });
  scored.sort((a, b) => a.key - b.key || a.i - b.i);
  return scored.map((s) => s.n);
}

/**
 * Fit the viewBox to the drawing, including the room each label needs on its
 * own side. A fixed frame would strand a small neighbourhood in a large empty
 * box, which is the one thing this picture must not do.
 */
function fit(nodes: Placed[], edges: GraphEdge[]): { x: number; y: number; w: number; h: number } {
  if (nodes.length === 0) return { x: -200, y: -120, w: 400, h: 240 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    let l = n.x - n.r;
    let r = n.x + n.r;
    let t = n.y - n.r;
    let b = n.y + n.r;
    if (n.band === 0) {
      r = Math.max(r, n.x + n.r + 13 + textWidth(n));
      t = Math.min(t, n.y - 14);
      b = Math.max(b, n.y + 18);
    } else if (n.band === -1) {
      l = Math.min(l, n.x - COL_W / 2 + 8);
      r = Math.max(r, n.x + COL_W / 2 - 8);
      t = n.y - n.r - 32;
    } else {
      l = Math.min(l, n.x - COL_W / 2 + 8);
      r = Math.max(r, n.x + COL_W / 2 - 8);
      b = n.y + n.r + 40;
    }
    minX = Math.min(minX, l);
    maxX = Math.max(maxX, r);
    minY = Math.min(minY, t);
    maxY = Math.max(maxY, b);
  }

  // The bypass arcs swing outside the node extents; give them room.
  const bands = new Map(nodes.map((n) => [n.id, n.band]));
  const hasBypass = edges.some((e) => {
    const a = bands.get(e.from);
    const b = bands.get(e.to);
    return a !== undefined && b !== undefined && Math.abs(a - b) === 2;
  });
  if (hasBypass) {
    const mid = (minX + maxX) / 2;
    if (mid >= 0) maxX += 92;
    else minX -= 92;
  }

  const padY = 22;
  return {
    x: minX - PAD_L,
    y: minY - padY,
    w: maxX - minX + PAD_L + PAD_R,
    h: maxY - minY + padY * 2,
  };
}

/** Rough advance width; the labels only need room, not kerning. */
function textWidth(n: Placed): number {
  return Math.max(n.short.length * 6.9, n.sub.length * 6.1);
}
