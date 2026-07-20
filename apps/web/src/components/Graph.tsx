/**
 * The 1-hop citation neighbourhood, drawn by hand.
 *
 * No d3 and no layout library: the node embeds this UI in its binary and every
 * kilobyte is a kilobyte a mirror has to carry. It is also a small enough
 * problem to solve honestly — a seeded arc layout relaxed by a few hundred
 * iterations of repulsion and spring attraction, which for a dozen nodes is
 * both stable and legible.
 *
 * The layout carries meaning: judgments that cite the focus sit above it,
 * judgments the focus cites sit below. Time runs downward into authority.
 */

import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import type { GraphEdge, GraphNode } from '../api';
import { ErrorState, Loading, Note } from './atoms';
import { useCourts } from '../registry';
import { href } from '../router';
import { useApi } from '../useAsync';
import type { CourtRow } from '../api';

/** Beyond this the picture stops being a picture and becomes a hairball. */
const MAX_NODES = 15;

const H = 400;

interface Placed extends GraphNode {
  x: number;
  y: number;
  r: number;
  band: -1 | 0 | 1; // -1 above (cites the focus), 0 focus, 1 below (cited by the focus)
}

export function CitationGraph({ id }: { id: string }): JSX.Element {
  const graph = useApi(`graph|${id}`, (client) => client.graph(id, 1));
  const courts = useCourts();

  const layout = useMemo(() => (graph.data ? place(graph.data.nodes, graph.data.edges, id) : null), [
    graph.data,
    id,
  ]);

  if (graph.error) return <ErrorState title="Graph unavailable" detail={graph.error} />;
  if (!layout) return <Loading label="laying out neighbourhood…" />;

  const { nodes, edges, hidden, bounds } = layout;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <>
      <figure class="graph-wrap" style="margin:0">
        <svg
          viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
          width="100%"
          height={H}
          role="img"
          aria-label={`Citation neighbourhood: ${nodes.length} judgments, ${edges.length} citations, one hop from the focus.`}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L8 4 L0 8 z" fill="var(--dim)" />
            </marker>
          </defs>

          <g>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const touchesFocus = a.band === 0 || b.band === 0;
              return (
                <path
                  d={arc(a, b)}
                  fill="none"
                  stroke="var(--dim)"
                  stroke-width={touchesFocus ? 1.4 : 1}
                  opacity={touchesFocus ? 0.85 : 0.42}
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

        <figcaption class="graph-legend">
          <span class="legend-item">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="1.5" />
            </svg>
            apex court
          </span>
          <span class="legend-item">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" fill="var(--panel-2)" stroke="var(--line-strong)" stroke-width="1.5" />
            </svg>
            other courts
          </span>
          <span class="legend-item">node size = authority</span>
          <span class="legend-item">above = cites the focus</span>
          <span class="legend-item">below = cited by the focus</span>
          <span class="legend-item" style="margin-left:auto">
            {nodes.length} nodes · {edges.length} edges
            {hidden > 0 ? ` · ${hidden} hidden` : ''}
          </span>
        </figcaption>
      </figure>

      {hidden > 0 && (
        <p class="mono dim" style="margin:10px 2px 0">
          {hidden} lower-authority neighbour{hidden === 1 ? ' is' : 's are'} not drawn. The full edge list is on the
          Citations tab.
        </p>
      )}

      <div style="margin-top:16px">
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

function Node({ node, court }: { node: Placed; court: CourtRow | undefined }): JSX.Element {
  const apex = court?.tier === 'apex';
  const focus = node.band === 0;
  const short = shortTitle(node.title);
  const year = node.date?.slice(0, 4) ?? '';

  return (
    <a class="gnode" href={href(`case/${node.id}`)} aria-label={`${node.title}, ${node.court} ${year}`}>
      <title>{`${node.title} — ${court?.name ?? node.court}${year ? `, ${year}` : ''}`}</title>
      {focus && (
        <circle cx={node.x} cy={node.y} r={node.r + 6} fill="none" stroke="var(--accent)" stroke-width="1" opacity="0.4" />
      )}
      <circle
        cx={node.x}
        cy={node.y}
        r={node.r}
        fill={apex ? 'color-mix(in srgb, var(--accent) 25%, var(--panel))' : 'var(--panel-2)'}
        stroke={apex ? 'var(--accent)' : 'var(--dim)'}
        stroke-width={focus ? 2.2 : 1.5}
      />
      <text class="gnode-label" x={node.x} y={node.y + node.r + 15} text-anchor="middle">
        {short}
      </text>
      <text class="gnode-sub" x={node.x} y={node.y + node.r + 27} text-anchor="middle">
        {node.court} {year}
      </text>
    </a>
  );
}

/** `Nkosi v Minister of Police` -> `Nkosi`. Falls back to a truncation. */
function shortTitle(title: string): string {
  const first = title.split(/\s+v\s+/)[0] ?? title;
  const cleaned = first.replace(/\s*\(Pty\)\s*Ltd/i, '').replace(/\s+NO$/, '').trim();
  return cleaned.length > 22 ? `${cleaned.slice(0, 21)}…` : cleaned;
}

/** A gentle bow, so parallel edges between the same bands stay distinguishable. */
function arc(a: Placed, b: Placed): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Stop short of the target so the arrowhead lands on the rim, not the centre.
  const ux = dx / len;
  const uy = dy / len;
  const sx = a.x + ux * (a.r + 2);
  const sy = a.y + uy * (a.r + 2);
  const ex = b.x - ux * (b.r + 7);
  const ey = b.y - uy * (b.r + 7);
  const mx = (sx + ex) / 2 - uy * len * 0.09;
  const my = (sy + ey) / 2 + ux * len * 0.09;
  return `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

interface Layout {
  nodes: Placed[];
  edges: GraphEdge[];
  hidden: number;
  bounds: { x: number; y: number; w: number; h: number };
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

  // Two arcs: judgments that cite the focus above it, judgments it cites below.
  const above = keep.filter((n) => citesFocus.has(n.id));
  const below = keep.filter((n) => !citesFocus.has(n.id));

  const nodes: Placed[] = [];
  if (focus) {
    nodes.push({ ...focus, x: 0, y: 0, r: radius(focus.authority) + 2, band: 0 });
  }
  nodes.push(...fan(above, -1));
  nodes.push(...fan(below, 1));

  relax(nodes, edges);

  // Fit to the drawing itself, with room for the two label lines under each
  // node. Fitting to a fixed frame instead would strand a small neighbourhood
  // in the middle of a large empty box.
  const pad = 26;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - 74);
    maxX = Math.max(maxX, n.x + 74);
    minY = Math.min(minY, n.y - n.r - 10);
    maxY = Math.max(maxY, n.y + n.r + 32);
  }
  if (!Number.isFinite(minX)) {
    minX = -100;
    maxX = 100;
    minY = -100;
    maxY = 100;
  }
  return {
    nodes,
    edges,
    hidden,
    bounds: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 },
  };
}

function radius(authority: number): number {
  return 7 + Math.max(0, Math.min(1, authority)) * 13;
}

/** Seed a group onto an arc, staggering radius so labels do not collide. */
function fan(group: GraphNode[], sign: -1 | 1): Placed[] {
  const k = group.length;
  return group.map((n, i) => {
    const t = k === 1 ? 0.5 : i / (k - 1);
    const theta = (Math.PI / 180) * (168 - t * 156); // 168° .. 12°
    const r = 200 + (i % 2) * 62 + (k > 6 ? 18 : 0);
    return {
      ...n,
      x: Math.cos(theta) * r * 1.35,
      y: sign * Math.abs(Math.sin(theta)) * r * 0.72,
      r: radius(n.authority),
      band: sign,
    };
  });
}

/**
 * Repulsion plus springs, with each node held in its own band. Deterministic:
 * no randomness anywhere, so the same neighbourhood always draws the same way
 * and a screenshot is reproducible.
 */
function relax(nodes: Placed[], edges: GraphEdge[]): void {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const ITERATIONS = 260;

  for (let step = 0; step < ITERATIONS; step += 1) {
    const cool = 1 - step / ITERATIONS;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        // Labels are wider than nodes, so repel on a label-sized footprint.
        const want = a.r + b.r + 96;
        if (d < want) {
          const push = ((want - d) / d) * 0.34 * cool;
          if (a.band !== 0) {
            a.x -= dx * push;
            a.y -= dy * push * 0.55;
          }
          if (b.band !== 0) {
            b.x += dx * push;
            b.y += dy * push * 0.55;
          }
        }
      }
    }

    for (const e of edges) {
      const ai = index.get(e.from);
      const bi = index.get(e.to);
      if (ai === undefined || bi === undefined) continue;
      const a = nodes[ai];
      const b = nodes[bi];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = ((d - 250) / d) * 0.02 * cool;
      if (a.band !== 0) {
        a.x += dx * pull;
      }
      if (b.band !== 0) {
        b.x -= dx * pull;
      }
    }

    for (const n of nodes) {
      if (n.band === 0) continue;
      // Hold the band separation: never let a node drift across the focus row.
      const floor = 118;
      if (n.band === -1) n.y = Math.min(n.y, -floor);
      else n.y = Math.max(n.y, floor);
      // Mild centring so the picture does not wander off to one side.
      n.x *= 1 - 0.004 * cool;
    }
  }
}
