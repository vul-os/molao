//! # molao-graph
//!
//! The citation graph: which judgments cite which, how strongly, and what that
//! implies about authority.
//!
//! Nodes are judgments held by the corpus. Edges are *resolved* citations —
//! citations whose target is also held. Citations to cases the corpus does not
//! have are kept by [`molao_corpus`] and shown in the UI, but they cannot be
//! edges, because an edge needs two ends.
//!
//! # The authority score
//!
//! ## What it is
//!
//! A weighted PageRank. The intuition PageRank encodes — *importance flows from
//! important things* — fits precedent well, because it is close to how lawyers
//! already reason: a case relied on by the Constitutional Court matters more
//! than one relied on by nobody, and a case relied on by *that* case inherits
//! some of it.
//!
//! Two departures from plain PageRank, both because citation is not hyperlinking:
//!
//! **Edges are weighted by the citing court.** An SCA judgment relying on a case
//! says more about that case than a magistrate does. The multiplier comes from
//! [`molao_core::court::authority_weight`] — apex 1.00 down to lower courts 0.10.
//!
//! **Edges are weighted by depth of engagement.** A case discussed across ten
//! paragraphs is being *used*; a case dropped into a string cite of twelve
//! authorities is being gestured at. Both are one edge in a naive graph. Here
//! the edge carries the number of distinct citing paragraphs, and:
//!
//! ```text
//! depth_factor(n) = 1 + DEPTH_STEP * min(n - 1, DEPTH_CAP)     // 1.00 … 2.00
//! w(u → v)        = authority_weight(court(u)) * depth_factor(paras)
//! ```
//!
//! The factor is capped: past a handful of paragraphs, more paragraphs mean the
//! judgment is long, not that the authority is stronger.
//!
//! Then the usual iteration, with each node's outbound weight normalised:
//!
//! ```text
//! W(u)       = Σ_x w(u → x)
//! s₀(v)      = 1/N
//! s_{k+1}(v) = (1 - D)/N  +  D * ( Σ_{u → v} s_k(u) * w(u → v)/W(u)  +  dangling_k/N )
//! ```
//!
//! where `dangling_k` is the mass held by nodes with no outbound edges,
//! redistributed uniformly so it is not lost. Scores are finally divided by the
//! maximum, so the leading case in a corpus scores 1.0 and everything else is a
//! readable fraction of it.
//!
//! ## What it is not
//!
//! **The constants are coarse heuristics and should be read as such.** `D`,
//! [`DEPTH_STEP`], [`DEPTH_CAP`], the tier weights — none are derived from
//! anything. They were chosen because they order a demo corpus the way a lawyer
//! would, which is evidence of nothing. There is no ground truth for "authority"
//! to fit against, and this crate should not pretend otherwise.
//!
//! Known biases, stated rather than buried:
//!
//! - **It measures citation, not correctness.** A frequently-distinguished case
//!   and a frequently-followed one score alike. Fixing that needs treatment
//!   attestations, which are [designed and not built](treatment).
//! - **It is biased toward the old.** A judgment delivered last week cannot have
//!   been cited yet. No recency correction is applied, because every available
//!   one is a fudge factor with its own bias.
//! - **It inherits the corpus's gaps.** Divisions that publish badly are cited
//!   less here than in life.
//!
//! Authority is an aid to finding cases, never a statement about the law.
//!
//! # Determinism
//!
//! Scores and [`Graph::graph_root`] are reproducible byte-for-byte on the same
//! corpus. That is a hard requirement — a release manifest pins `graph_root`,
//! and a graph that varied between runs would make verification meaningless.
//!
//! - Nodes come from the corpus already sorted by id; edges sorted by
//!   `(from, to)`.
//! - No `HashMap` iteration reaches a result or a summation order. Floating
//!   point addition is not associative, so *the order edges are summed in is
//!   part of the answer* — this is the subtle way a graph like this goes
//!   non-deterministic, and it is why accumulation walks the sorted edge list.
//! - A fixed [`ITERATIONS`] count, not a convergence threshold: "iterate until
//!   it stops moving" makes the answer depend on floating-point noise.
//! - [`Graph::graph_root`] hashes only ids and integers — never a float — so it
//!   is stable across architectures with different floating-point behaviour.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]
#![warn(missing_docs)]

pub mod treatment;

pub use treatment::{Attestation, Treatment};

use molao_core::DocId;
use molao_corpus::{Corpus, Result};
use std::collections::HashMap;

/// PageRank damping factor. The conventional 0.85; nothing about citation
/// argues for a different value, and inventing one would be false precision.
pub const DAMPING: f64 = 0.85;

/// Fixed iteration count. Well past convergence for any realistic corpus, and
/// fixed rather than threshold-based so the result cannot depend on
/// floating-point noise near a threshold.
pub const ITERATIONS: usize = 50;

/// Extra edge weight per additional citing paragraph.
pub const DEPTH_STEP: f64 = 0.25;

/// Maximum additional paragraphs that increase the weight. Beyond this a
/// judgment is long, not more persuaded.
pub const DEPTH_CAP: u32 = 4;

/// Deepest neighbourhood the API will expand.
///
/// Three hops from a well-cited judgment already reaches a large part of the
/// corpus; the limit is what stops an unauthenticated `?depth=` from being a
/// denial-of-service.
pub const MAX_DEPTH: u32 = 3;

/// A judgment as a graph node.
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    /// Judgment id.
    pub id: DocId,
    /// Style of cause.
    pub title: String,
    /// Court code.
    pub court: String,
    /// Region profile, e.g. `ZA`.
    pub region: String,
    /// ISO 8601 date of judgment.
    pub date: Option<String>,
    /// Normalised authority, `0.0`–`1.0`. Read the module docs before trusting it.
    pub authority: f64,
}

/// A resolved citation edge with its computed weight.
#[derive(Debug, Clone, PartialEq)]
pub struct Edge {
    /// Citing judgment.
    pub from: DocId,
    /// Cited judgment.
    pub to: DocId,
    /// Distinct citing paragraphs — the structural fact behind `weight`.
    pub paragraph_count: u32,
    /// Court weight times depth factor. Derived; not part of `graph_root`.
    pub weight: f64,
}

/// The whole citation graph, held in memory.
#[derive(Debug, Clone, Default)]
pub struct Graph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    /// Id to index in `nodes`. A `HashMap` is safe here because it is only ever
    /// used for lookup — nothing iterates it, so no result depends on its order.
    index: HashMap<DocId, usize>,
}

/// A neighbourhood: the nodes within `depth` hops of a judgment, and the edges
/// among them.
#[derive(Debug, Clone, PartialEq)]
pub struct Neighbourhood {
    /// Nodes, each tagged with its hop distance from the centre (`0`).
    pub nodes: Vec<(Node, u32)>,
    /// Edges with both ends in `nodes`.
    pub edges: Vec<Edge>,
}

/// Depth factor for an edge cited across `paragraphs` distinct paragraphs.
///
/// `1.0` for a single mention, rising by [`DEPTH_STEP`] per extra paragraph to a
/// ceiling of `1.0 + DEPTH_STEP * DEPTH_CAP`.
pub fn depth_factor(paragraphs: u32) -> f64 {
    let extra = paragraphs.saturating_sub(1).min(DEPTH_CAP);
    1.0 + DEPTH_STEP * f64::from(extra)
}

impl Graph {
    /// Build the graph from a corpus and score it.
    ///
    /// Reads only; call [`Graph::write_authority`] to persist the scores.
    pub fn build(corpus: &Corpus) -> Result<Self> {
        let rows = corpus.nodes()?;
        let mut nodes: Vec<Node> = Vec::with_capacity(rows.len());
        let mut index = HashMap::with_capacity(rows.len());

        for row in rows {
            // Ids come from our own writes; an unparseable one means database
            // corruption, and dropping the node beats aborting the graph.
            let Ok(id) = row.id.parse::<DocId>() else {
                tracing::warn!(id = %row.id, "skipping node with an unparseable id");
                continue;
            };
            index.insert(id, nodes.len());
            nodes.push(Node {
                id,
                title: row.title,
                court: row.court,
                region: row.region,
                date: row.date,
                authority: 0.0,
            });
        }

        let mut edges: Vec<Edge> = Vec::new();
        for e in corpus.resolved_edges()? {
            // Both ends must be nodes. `resolved_edges` guarantees it, but an
            // edge to a missing node would silently corrupt the scoring, so it
            // is checked rather than assumed.
            let Some(&from_ix) = index.get(&e.from) else {
                continue;
            };
            if !index.contains_key(&e.to) {
                continue;
            }
            let court_weight = molao_core::court::authority_weight(&nodes[from_ix].court);
            edges.push(Edge {
                from: e.from,
                to: e.to,
                paragraph_count: e.paragraph_count,
                weight: court_weight * depth_factor(e.paragraph_count),
            });
        }

        let mut graph = Graph {
            nodes,
            edges,
            index,
        };
        graph.score();
        Ok(graph)
    }

    /// Nodes, sorted by id.
    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    /// Edges, sorted by `(from, to)`.
    pub fn edges(&self) -> &[Edge] {
        &self.edges
    }

    /// Look a node up by id.
    pub fn node(&self, id: &DocId) -> Option<&Node> {
        self.index.get(id).map(|&i| &self.nodes[i])
    }

    /// Run the weighted PageRank and store the results on the nodes.
    ///
    /// See the module docs for the formula and for what the numbers do not mean.
    fn score(&mut self) {
        let n = self.nodes.len();
        if n == 0 {
            return;
        }
        let n_f = n as f64;

        // Outbound weight per node, accumulated in sorted edge order.
        let mut out_weight = vec![0.0f64; n];
        for e in &self.edges {
            if let Some(&i) = self.index.get(&e.from) {
                out_weight[i] += e.weight;
            }
        }

        let mut score = vec![1.0 / n_f; n];
        let mut next = vec![0.0f64; n];

        for _ in 0..ITERATIONS {
            // Mass held by nodes that cite nothing would simply vanish each
            // iteration; spreading it uniformly keeps the total at 1 and stops
            // a corpus of mostly-uncited leaves from decaying toward zero.
            let mut dangling = 0.0;
            for (i, w) in out_weight.iter().enumerate() {
                if *w == 0.0 {
                    dangling += score[i];
                }
            }

            let base = (1.0 - DAMPING) / n_f + DAMPING * dangling / n_f;
            next.iter_mut().for_each(|s| *s = base);

            // Sorted edge order: float addition is not associative, so this
            // loop's order is part of the answer.
            for e in &self.edges {
                let (Some(&from), Some(&to)) = (self.index.get(&e.from), self.index.get(&e.to))
                else {
                    continue;
                };
                if out_weight[from] > 0.0 {
                    next[to] += DAMPING * score[from] * e.weight / out_weight[from];
                }
            }

            std::mem::swap(&mut score, &mut next);
        }

        // Normalise so the leading case is 1.0. Purely for readability — the
        // ordering is unchanged.
        let max = score.iter().copied().fold(0.0f64, f64::max);
        let divisor = if max > 0.0 { max } else { 1.0 };
        for (node, s) in self.nodes.iter_mut().zip(score.iter()) {
            node.authority = s / divisor;
        }
    }

    /// Write the computed scores back to the corpus.
    pub fn write_authority(&self, corpus: &Corpus) -> Result<()> {
        for node in &self.nodes {
            corpus.set_authority(&node.id, node.authority)?;
        }
        Ok(())
    }

    /// Root hash over the edge list, for a release manifest's `graph_root`.
    ///
    /// Hashes the sorted `(from, to, paragraph_count)` triples — **structure
    /// only, no weights and no scores**. That is deliberate: weights are floats
    /// derived from the structure by a formula that may be retuned, and hashing
    /// a float would make the root depend on the architecture's floating-point
    /// behaviour. Everything hashed here is an id or an integer, so two nodes on
    /// different hardware agree, and retuning [`DEPTH_STEP`] does not invalidate
    /// a release whose graph is unchanged.
    ///
    /// Domain-separated, so it cannot collide with a corpus root over similar
    /// bytes.
    pub fn graph_root(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update(b"molao-graph-root-v1\n");
        // Edges arrive sorted from the corpus; sorting again makes the guarantee
        // local rather than an assumption about a caller.
        let mut triples: Vec<(&DocId, &DocId, u32)> = self
            .edges
            .iter()
            .map(|e| (&e.from, &e.to, e.paragraph_count))
            .collect();
        triples.sort();
        for (from, to, paragraphs) in triples {
            hasher.update(from.as_bytes());
            hasher.update(to.as_bytes());
            hasher.update(&paragraphs.to_be_bytes());
        }
        hex::encode(hasher.finalize().as_bytes())
    }

    /// Nodes within `depth` hops of `centre`, and the edges among them.
    ///
    /// Traversal follows citations in **both** directions: what a case relies on
    /// and what relies on it are both part of understanding it, and a one-way
    /// view of a leading judgment would be nearly empty.
    ///
    /// `depth` is clamped to [`MAX_DEPTH`]; a depth of `0` is the judgment
    /// alone. Returns `None` if the centre is not in the graph.
    ///
    /// Output is sorted by `(depth, id)`, so the same query always yields the
    /// same JSON.
    pub fn neighbourhood(&self, centre: &DocId, depth: u32) -> Option<Neighbourhood> {
        let &centre_ix = self.index.get(centre)?;
        let depth = depth.min(MAX_DEPTH);

        // BFS by index, so a node reached twice keeps its shortest distance.
        let mut distance: Vec<Option<u32>> = vec![None; self.nodes.len()];
        distance[centre_ix] = Some(0);
        let mut frontier = vec![centre_ix];

        for hop in 1..=depth {
            let mut next = Vec::new();
            for e in &self.edges {
                let (Some(&from), Some(&to)) = (self.index.get(&e.from), self.index.get(&e.to))
                else {
                    continue;
                };
                for (a, b) in [(from, to), (to, from)] {
                    if frontier.contains(&a) && distance[b].is_none() {
                        distance[b] = Some(hop);
                        next.push(b);
                    }
                }
            }
            next.sort_unstable();
            next.dedup();
            if next.is_empty() {
                break;
            }
            frontier = next;
        }

        let mut nodes: Vec<(Node, u32)> = distance
            .iter()
            .enumerate()
            .filter_map(|(i, d)| d.map(|d| (self.nodes[i].clone(), d)))
            .collect();
        nodes.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.id.cmp(&b.0.id)));

        let edges: Vec<Edge> = self
            .edges
            .iter()
            .filter(|e| {
                let inside =
                    |id: &DocId| self.index.get(id).is_some_and(|&i| distance[i].is_some());
                inside(&e.from) && inside(&e.to)
            })
            .cloned()
            .collect();

        Some(Neighbourhood { nodes, edges })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use molao_corpus::ingest::test_support::judgment;

    /// A corpus where a foundational ZACC case is relied on by an SCA judgment
    /// across several paragraphs, and by a High Court judgment in passing.
    fn sample() -> (Corpus, DocId, DocId, DocId) {
        let mut c = Corpus::open_in_memory().unwrap();
        let foundational = judgment(
            "ZACC",
            "[1995] ZACC 3",
            "Sithole v Minister of Justice",
            &["The principle of legality applies to all exercises of public power."],
        );
        let sca = judgment(
            "ZASCA",
            "[2010] ZASCA 20",
            "Khumalo v MEC for Education",
            &[
                "We must begin with [1995] ZACC 3.",
                "The reasoning in [1995] ZACC 3 at para 1 governs this appeal.",
                "Applying [1995] ZACC 3, the decision was unlawful.",
            ],
        );
        let high = judgment(
            "ZAGPJHC",
            "[2015] ZAGPJHC 5",
            "Botha v City of Johannesburg",
            &["See [1995] ZACC 3 and [2010] ZASCA 20 among many others."],
        );
        for j in [&foundational, &sca, &high] {
            c.insert_judgment(j, &[]).unwrap();
        }
        c.relink().unwrap();
        (c, foundational.id, sca.id, high.id)
    }

    #[test]
    fn the_graph_has_the_expected_shape() {
        let (c, foundational, sca, high) = sample();
        let g = Graph::build(&c).unwrap();
        assert_eq!(g.nodes().len(), 3);
        assert_eq!(g.edges().len(), 3, "{:?}", g.edges());
        assert!(g
            .edges()
            .iter()
            .any(|e| e.from == sca && e.to == foundational && e.paragraph_count == 3));
        assert!(g.edges().iter().any(|e| e.from == high && e.to == sca));
    }

    #[test]
    fn a_case_relied_on_outranks_the_cases_relying_on_it() {
        let (c, foundational, sca, high) = sample();
        let g = Graph::build(&c).unwrap();
        let a = |id: &DocId| g.node(id).unwrap().authority;
        assert!(
            a(&foundational) > a(&sca),
            "the foundational case must lead"
        );
        assert!(
            a(&sca) > a(&high),
            "a cited case must outrank an uncited one"
        );
        assert!(
            (a(&foundational) - 1.0).abs() < 1e-12,
            "the top case normalises to 1.0"
        );
    }

    #[test]
    fn depth_of_engagement_outweighs_a_bare_mention() {
        // Two corpora identical but for how many paragraphs engage with the
        // target. The one genuinely discussed must weigh more.
        let build = |paras: &[&str]| {
            let mut c = Corpus::open_in_memory().unwrap();
            let target = judgment("ZACC", "[1995] ZACC 3", "Target", &["The rule."]);
            let citing = judgment("ZASCA", "[2010] ZASCA 1", "Citing", paras);
            c.insert_judgment(&target, &[]).unwrap();
            c.insert_judgment(&citing, &[]).unwrap();
            c.relink().unwrap();
            let g = Graph::build(&c).unwrap();
            let e = g
                .edges()
                .iter()
                .find(|e| e.to == target.id)
                .unwrap()
                .clone();
            (e.weight, e.paragraph_count)
        };

        let (bare, n_bare) = build(&["A string cite: [1995] ZACC 3."]);
        let (deep, n_deep) = build(&[
            "We start with [1995] ZACC 3.",
            "Further on [1995] ZACC 3.",
            "And again [1995] ZACC 3.",
        ]);
        assert_eq!(n_bare, 1);
        assert_eq!(n_deep, 3);
        assert!(deep > bare, "depth of engagement did not raise the weight");
    }

    #[test]
    fn the_citing_courts_rank_changes_the_weight() {
        let weight_from = |court: &str, neutral: &str| {
            let mut c = Corpus::open_in_memory().unwrap();
            let target = judgment("ZACC", "[1995] ZACC 3", "Target", &["The rule."]);
            let citing = judgment(court, neutral, "Citing", &["Per [1995] ZACC 3."]);
            c.insert_judgment(&target, &[]).unwrap();
            c.insert_judgment(&citing, &[]).unwrap();
            c.relink().unwrap();
            Graph::build(&c).unwrap().edges()[0].weight
        };
        // Apex > appellate > high court, straight from the registry.
        assert!(weight_from("ZACC", "[2010] ZACC 1") > weight_from("ZASCA", "[2010] ZASCA 1"));
        assert!(
            weight_from("ZASCA", "[2010] ZASCA 1") > weight_from("ZAGPJHC", "[2010] ZAGPJHC 1")
        );
    }

    #[test]
    fn depth_factor_is_bounded_and_monotonic() {
        assert_eq!(depth_factor(0), 1.0);
        assert_eq!(depth_factor(1), 1.0);
        assert_eq!(depth_factor(2), 1.25);
        let ceiling = 1.0 + DEPTH_STEP * f64::from(DEPTH_CAP);
        assert_eq!(depth_factor(5), ceiling);
        // Past the cap it must not keep climbing with judgment length.
        assert_eq!(depth_factor(500), ceiling);
        assert_eq!(depth_factor(u32::MAX), ceiling);
    }

    #[test]
    fn scores_are_identical_across_repeated_builds() {
        let (c, ..) = sample();
        let first: Vec<f64> = Graph::build(&c)
            .unwrap()
            .nodes()
            .iter()
            .map(|n| n.authority)
            .collect();
        for _ in 0..32 {
            let again: Vec<f64> = Graph::build(&c)
                .unwrap()
                .nodes()
                .iter()
                .map(|n| n.authority)
                .collect();
            // Bit-for-bit, not approximately: a release pins these.
            assert_eq!(again, first);
        }
    }

    #[test]
    fn scores_do_not_depend_on_the_order_judgments_were_ingested() {
        let judgments = || {
            vec![
                judgment("ZACC", "[1995] ZACC 3", "Target", &["The rule."]),
                judgment("ZASCA", "[2010] ZASCA 1", "Middle", &["Per [1995] ZACC 3."]),
                judgment(
                    "ZAGPJHC",
                    "[2015] ZAGPJHC 5",
                    "Leaf",
                    &["Per [2010] ZASCA 1."],
                ),
            ]
        };

        let scores = |order: Vec<usize>| {
            let mut c = Corpus::open_in_memory().unwrap();
            let js = judgments();
            for i in order {
                c.insert_judgment(&js[i], &[]).unwrap();
            }
            c.relink().unwrap();
            let g = Graph::build(&c).unwrap();
            // Keyed by id, since node order follows id, not insertion order.
            let mut out: Vec<(String, f64)> = g
                .nodes()
                .iter()
                .map(|n| (n.id.to_string(), n.authority))
                .collect();
            out.sort_by(|a, b| a.0.cmp(&b.0));
            out
        };

        let forward = scores(vec![0, 1, 2]);
        assert_eq!(scores(vec![2, 1, 0]), forward);
        assert_eq!(scores(vec![1, 2, 0]), forward);
    }

    #[test]
    fn an_empty_corpus_scores_without_panicking() {
        let c = Corpus::open_in_memory().unwrap();
        let g = Graph::build(&c).unwrap();
        assert!(g.nodes().is_empty());
        assert!(g.edges().is_empty());
        // A stable root for "no edges" — it is what an empty release commits to.
        assert_eq!(g.graph_root().len(), 64);
    }

    #[test]
    fn a_corpus_with_no_edges_scores_every_node_equally() {
        let mut c = Corpus::open_in_memory().unwrap();
        for n in 1..=3 {
            c.insert_judgment(
                &judgment(
                    "ZACC",
                    &format!("[2026] ZACC {n}"),
                    &format!("Case {n}"),
                    &[&format!("Reasoning {n}.")],
                ),
                &[],
            )
            .unwrap();
        }
        let g = Graph::build(&c).unwrap();
        assert!(g.nodes().iter().all(|n| (n.authority - 1.0).abs() < 1e-9));
    }

    #[test]
    fn graph_root_is_byte_stable_and_order_independent() {
        let (c, ..) = sample();
        let root = Graph::build(&c).unwrap().graph_root();
        assert_eq!(root.len(), 64);
        for _ in 0..16 {
            assert_eq!(Graph::build(&c).unwrap().graph_root(), root);
        }

        // Same judgments, rebuilt from scratch, same root.
        let (c2, ..) = sample();
        assert_eq!(Graph::build(&c2).unwrap().graph_root(), root);
    }

    #[test]
    fn graph_root_changes_when_an_edge_changes() {
        let (c, ..) = sample();
        let before = Graph::build(&c).unwrap().graph_root();

        let mut c2 = Corpus::open_in_memory().unwrap();
        let target = judgment(
            "ZACC",
            "[1995] ZACC 3",
            "Sithole v Minister of Justice",
            &["The principle of legality applies to all exercises of public power."],
        );
        let citing = judgment(
            "ZASCA",
            "[2010] ZASCA 20",
            "Khumalo",
            &["Per [1995] ZACC 3."],
        );
        c2.insert_judgment(&target, &[]).unwrap();
        c2.insert_judgment(&citing, &[]).unwrap();
        c2.relink().unwrap();
        assert_ne!(Graph::build(&c2).unwrap().graph_root(), before);
    }

    #[test]
    fn graph_root_ignores_the_weighting_constants() {
        // The property that lets the formula be retuned without invalidating a
        // release: the root commits to structure, not to derived floats.
        let (c, ..) = sample();
        let g = Graph::build(&c).unwrap();
        let root = g.graph_root();
        let mut retuned = g.clone();
        for e in &mut retuned.edges {
            e.weight *= 3.7;
        }
        assert_eq!(retuned.graph_root(), root);
    }

    #[test]
    fn a_neighbourhood_expands_in_both_directions() {
        let (c, foundational, sca, high) = sample();
        let g = Graph::build(&c).unwrap();

        let n0 = g.neighbourhood(&foundational, 0).unwrap();
        assert_eq!(n0.nodes.len(), 1);
        assert_eq!(n0.nodes[0].1, 0);

        // One hop from the foundational case reaches both judgments citing it.
        let n1 = g.neighbourhood(&foundational, 1).unwrap();
        assert_eq!(n1.nodes.len(), 3);
        assert!(n1.nodes.iter().any(|(n, d)| n.id == sca && *d == 1));
        assert!(n1.nodes.iter().any(|(n, d)| n.id == high && *d == 1));
    }

    #[test]
    fn neighbourhood_depth_is_capped() {
        let (c, foundational, ..) = sample();
        let g = Graph::build(&c).unwrap();
        let capped = g.neighbourhood(&foundational, MAX_DEPTH).unwrap();
        // Anything past the cap must be identical, not larger.
        for absurd in [MAX_DEPTH + 1, 50, u32::MAX] {
            assert_eq!(g.neighbourhood(&foundational, absurd).unwrap(), capped);
        }
    }

    #[test]
    fn a_neighbourhood_only_contains_edges_with_both_ends_inside_it() {
        let (c, foundational, ..) = sample();
        let g = Graph::build(&c).unwrap();
        let n = g.neighbourhood(&foundational, 1).unwrap();
        let ids: Vec<DocId> = n.nodes.iter().map(|(node, _)| node.id).collect();
        for e in &n.edges {
            assert!(ids.contains(&e.from) && ids.contains(&e.to));
        }
    }

    #[test]
    fn a_neighbourhood_of_an_unknown_judgment_is_none_not_a_panic() {
        let (c, ..) = sample();
        let g = Graph::build(&c).unwrap();
        assert!(g
            .neighbourhood(&DocId::of_raw("never ingested"), 2)
            .is_none());
    }

    #[test]
    fn neighbourhood_output_is_deterministic() {
        let (c, foundational, ..) = sample();
        let g = Graph::build(&c).unwrap();
        let first = g.neighbourhood(&foundational, 2).unwrap();
        for _ in 0..16 {
            assert_eq!(g.neighbourhood(&foundational, 2).unwrap(), first);
        }
        // Sorted by (depth, id).
        assert!(first
            .nodes
            .windows(2)
            .all(|w| (w[0].1, w[0].0.id) < (w[1].1, w[1].0.id)));
    }

    #[test]
    fn scores_written_back_are_what_search_ranks_on() {
        let (c, foundational, ..) = sample();
        let g = Graph::build(&c).unwrap();
        g.write_authority(&c).unwrap();
        assert!((c.authority(&foundational).unwrap() - 1.0).abs() < 1e-12);
        let (_, hits) = c
            .search("", &molao_corpus::SearchFilters::default(), 10, 0)
            .unwrap();
        assert_eq!(hits[0].id, foundational.to_string());
    }
}
