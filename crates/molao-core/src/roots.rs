//! The two roots a release manifest pins: `corpus_root` and `graph_root`.
//!
//! A manifest asserts "as of release N, these are the judgments and this is the
//! citation graph derived from them". Those two claims are carried by two hex
//! strings, and a hex string is only worth anything if a reader can recompute it
//! from artifacts they hold. This module is that recomputation, and it is
//! deliberately in `molao-core` — the crate every other crate already depends on
//! — so there is exactly **one** definition of each root rather than one per
//! consumer.
//!
//! That mattered: before this module existed, `corpus_root` was implemented
//! twice (in `molao_corpus::Corpus::corpus_root`, over a SQL query, and again in
//! `molao_dist::package::corpus_root`, over a slice) with a comment
//! acknowledging that "the two copies must be kept in sync by hand". Two hand-
//! synchronised hash definitions are two hash definitions; the moment they drift
//! a release verifies on the machine that built it and nowhere else.
//!
//! ## Preimages are public, and are the file format
//!
//! Each root is BLAKE3 over a domain-separated, length-unambiguous byte string,
//! and that byte string is exposed ([`corpus_root_bytes`], [`graph_bytes`])
//! rather than hidden inside the hasher. For the graph this is load-bearing:
//! **the graph blob shipped in a release *is* the `graph_root` preimage**, so a
//! receiver checking the graph file against its content address has thereby
//! checked it against `graph_root`, with no second format and no second parser
//! to disagree with the first.
//!
//! ## What recomputing a root does and does not prove
//!
//! Recomputing `corpus_root` proves the set of document ids you hold is the set
//! the manifest names. Recomputing `graph_root` from a graph blob proves the
//! blob is the one the manifest names. Neither proves the graph is the
//! *correct* graph for that corpus — that needs re-running the pinned extractor
//! over the documents and comparing, which is a different and strictly stronger
//! check (`molao verify` step 6, in `molao-node`).

use crate::doc::DocId;

/// Domain separator for [`corpus_root`]. A corpus root must never collide with
/// a graph root computed over structurally similar bytes.
pub const CORPUS_ROOT_DOMAIN: &[u8] = b"molao-corpus-root-v1\n";

/// Domain separator for [`graph_root`], and the first bytes of every graph blob.
pub const GRAPH_ROOT_DOMAIN: &[u8] = b"molao-graph-root-v1\n";

/// Bytes per encoded edge in a graph blob: 32-byte `from`, 32-byte `to`,
/// 4-byte big-endian paragraph count. Fixed width, so no separator or length
/// prefix is needed and none can be ambiguous.
pub const EDGE_ENCODED_LEN: usize = 32 + 32 + 4;

/// One citation edge, in the only form that reaches a root.
///
/// Structure only — no weights and no scores. Weights are floats derived from
/// this structure by a formula that may be retuned, and hashing a float would
/// make a release depend on the architecture's floating-point behaviour.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct GraphEdge {
    pub from: DocId,
    pub to: DocId,
    /// How many distinct paragraphs of `from` cite `to`. At least 1: an edge
    /// that no paragraph produced is not an edge.
    pub paragraph_count: u32,
}

impl GraphEdge {
    pub fn new(from: DocId, to: DocId, paragraph_count: u32) -> Self {
        GraphEdge {
            from,
            to,
            paragraph_count,
        }
    }
}

/// The exact preimage [`corpus_root`] hashes.
///
/// Domain separator, then each id — sorted, as its 64-character hex string,
/// each preceded by an 8-byte big-endian length. The length prefix is redundant
/// while every id is 32 bytes and stays there so the encoding cannot become
/// ambiguous if a future id form is ever shorter or longer.
pub fn corpus_root_bytes(ids: &[DocId]) -> Vec<u8> {
    let mut sorted: Vec<&DocId> = ids.iter().collect();
    sorted.sort_unstable();
    let mut out = Vec::with_capacity(CORPUS_ROOT_DOMAIN.len() + sorted.len() * 72);
    out.extend_from_slice(CORPUS_ROOT_DOMAIN);
    for id in sorted {
        let s = id.to_string();
        out.extend_from_slice(&(s.len() as u64).to_be_bytes());
        out.extend_from_slice(s.as_bytes());
    }
    out
}

/// Root hash over a set of document ids.
///
/// Order-independent: the ids are sorted before hashing, so two nodes holding
/// the same judgments agree byte-for-byte regardless of ingest order.
pub fn corpus_root(ids: &[DocId]) -> String {
    hex::encode(blake3::hash(&corpus_root_bytes(ids)).as_bytes())
}

/// The canonical graph blob — the bytes a release ships as its graph file, and
/// the exact preimage [`graph_root`] hashes.
///
/// Edges are sorted and deduplicated by `(from, to)`; a repeated pair keeps the
/// **largest** paragraph count, because the only way one pair legitimately
/// appears twice is a caller that split the same edge across two batches, and
/// silently keeping whichever arrived last would make the blob depend on
/// arrival order. Self-edges are dropped: a judgment citing itself is not a
/// citation edge, and every producer in this workspace already excludes them.
pub fn graph_bytes(edges: &[GraphEdge]) -> Vec<u8> {
    let mut sorted: Vec<GraphEdge> = edges
        .iter()
        .copied()
        .filter(|e| e.from != e.to && e.paragraph_count > 0)
        .collect();
    sorted.sort_unstable_by(|a, b| {
        (a.from, a.to)
            .cmp(&(b.from, b.to))
            .then(b.paragraph_count.cmp(&a.paragraph_count))
    });
    sorted.dedup_by(|a, b| a.from == b.from && a.to == b.to);

    let mut out = Vec::with_capacity(GRAPH_ROOT_DOMAIN.len() + sorted.len() * EDGE_ENCODED_LEN);
    out.extend_from_slice(GRAPH_ROOT_DOMAIN);
    for e in &sorted {
        out.extend_from_slice(e.from.as_bytes());
        out.extend_from_slice(e.to.as_bytes());
        out.extend_from_slice(&e.paragraph_count.to_be_bytes());
    }
    out
}

/// Root hash over a citation edge set.
///
/// Equal to `blake3` of [`graph_bytes`], which is the same thing as the content
/// address of the graph file in a packaged release. That equality is the point:
/// a receiver that has content-addressed the graph blob has already verified
/// `graph_root`.
pub fn graph_root(edges: &[GraphEdge]) -> String {
    root_of_graph_bytes(&graph_bytes(edges))
}

/// The root of an already-encoded graph blob.
///
/// Does **not** check that `blob` is well-formed — use [`parse_graph_bytes`]
/// for that. A blob that hashes to the root a quorum signed is the blob they
/// signed; whether it decodes to a sane edge list is a separate question, and
/// conflating the two would let a malformed blob be reported as a hash failure.
pub fn root_of_graph_bytes(blob: &[u8]) -> String {
    hex::encode(blake3::hash(blob).as_bytes())
}

/// Why a graph blob is not a graph blob.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum GraphBytesError {
    #[error("graph blob does not start with the {expected:?} domain separator")]
    WrongDomain { expected: &'static str },
    #[error(
        "graph blob body is {len} byte(s), not a whole number of {EDGE_ENCODED_LEN}-byte edges"
    )]
    TrailingBytes { len: usize },
    #[error("graph blob edge {index} is not strictly after edge {}: the encoding is not canonical", index - 1)]
    NotSorted { index: usize },
    #[error("graph blob edge {index} is a self-edge")]
    SelfEdge { index: usize },
    #[error("graph blob edge {index} has a paragraph count of zero")]
    ZeroParagraphs { index: usize },
}

/// Decode a graph blob, rejecting anything not in canonical form.
///
/// Canonical form is not pedantry. Two different encodings of the same edge set
/// hash to two different roots, so a producer emitting a non-canonical blob
/// would publish a `graph_root` nobody else recomputing from the same corpus
/// could ever reproduce — the release would verify only on the machine that
/// built it. Rejecting non-canonical input here is what makes
/// `graph_root == blake3(graph_bytes(edges))` a two-way guarantee rather than a
/// one-way convention.
pub fn parse_graph_bytes(blob: &[u8]) -> Result<Vec<GraphEdge>, GraphBytesError> {
    let body = blob
        .strip_prefix(GRAPH_ROOT_DOMAIN)
        .ok_or(GraphBytesError::WrongDomain {
            expected: "molao-graph-root-v1\\n",
        })?;
    if body.len() % EDGE_ENCODED_LEN != 0 {
        return Err(GraphBytesError::TrailingBytes { len: body.len() });
    }

    let mut edges = Vec::with_capacity(body.len() / EDGE_ENCODED_LEN);
    for (index, chunk) in body.chunks_exact(EDGE_ENCODED_LEN).enumerate() {
        let mut from = [0u8; 32];
        let mut to = [0u8; 32];
        from.copy_from_slice(&chunk[..32]);
        to.copy_from_slice(&chunk[32..64]);
        let paragraph_count = u32::from_be_bytes([chunk[64], chunk[65], chunk[66], chunk[67]]);
        let edge = GraphEdge {
            from: DocId::from_bytes(from),
            to: DocId::from_bytes(to),
            paragraph_count,
        };
        if edge.from == edge.to {
            return Err(GraphBytesError::SelfEdge { index });
        }
        if edge.paragraph_count == 0 {
            return Err(GraphBytesError::ZeroParagraphs { index });
        }
        if let Some(previous) = edges.last() {
            let previous: &GraphEdge = previous;
            if (previous.from, previous.to) >= (edge.from, edge.to) {
                return Err(GraphBytesError::NotSorted { index });
            }
        }
        edges.push(edge);
    }
    Ok(edges)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(text: &str) -> DocId {
        DocId::of_canonical(text)
    }

    fn toy_edges() -> Vec<GraphEdge> {
        vec![
            GraphEdge::new(id("b\n"), id("c\n"), 2),
            GraphEdge::new(id("a\n"), id("b\n"), 1),
            GraphEdge::new(id("a\n"), id("c\n"), 7),
        ]
    }

    // -- corpus root ------------------------------------------------------

    #[test]
    fn corpus_root_is_order_independent() {
        let ids = vec![id("one\n"), id("two\n"), id("three\n")];
        let mut reversed = ids.clone();
        reversed.reverse();
        assert_eq!(corpus_root(&ids), corpus_root(&reversed));
    }

    #[test]
    fn corpus_root_changes_when_the_set_changes() {
        let ids = vec![id("one\n"), id("two\n")];
        let mut more = ids.clone();
        more.push(id("three\n"));
        assert_ne!(corpus_root(&ids), corpus_root(&more));
    }

    #[test]
    fn an_empty_corpus_still_has_a_root_and_it_is_not_the_empty_hash() {
        // A node with nothing in it must not compute the same root as a hash of
        // no bytes at all, or "I have no corpus" and "I have a corpus that
        // hashes to the empty string" become indistinguishable.
        assert_ne!(corpus_root(&[]), hex::encode(blake3::hash(b"").as_bytes()));
        assert_eq!(corpus_root(&[]).len(), 64);
    }

    #[test]
    fn corpus_and_graph_roots_are_domain_separated() {
        // Both roots are BLAKE3 over a byte string. Without distinct domain
        // separators an attacker who controlled either input could look for a
        // corpus whose root equalled some graph's root.
        assert_ne!(CORPUS_ROOT_DOMAIN, GRAPH_ROOT_DOMAIN);
        assert_ne!(corpus_root(&[]), graph_root(&[]));
    }

    // -- graph root -------------------------------------------------------

    #[test]
    fn graph_root_is_order_independent_and_the_blob_is_canonical() {
        let mut shuffled = toy_edges();
        shuffled.reverse();
        assert_eq!(graph_bytes(&toy_edges()), graph_bytes(&shuffled));
        assert_eq!(graph_root(&toy_edges()), graph_root(&shuffled));
    }

    #[test]
    fn graph_root_is_the_content_address_of_the_graph_blob() {
        // The property the whole packaging story rests on: content-addressing
        // the graph file *is* checking graph_root.
        let blob = graph_bytes(&toy_edges());
        assert_eq!(graph_root(&toy_edges()), root_of_graph_bytes(&blob));
        assert_eq!(
            graph_root(&toy_edges()),
            hex::encode(blake3::hash(&blob).as_bytes())
        );
    }

    #[test]
    fn graph_root_changes_when_an_edge_changes() {
        let base = graph_root(&toy_edges());
        let mut heavier = toy_edges();
        heavier[0].paragraph_count += 1;
        assert_ne!(base, graph_root(&heavier));

        let mut redirected = toy_edges();
        redirected[0].to = id("z\n");
        assert_ne!(base, graph_root(&redirected));

        let mut dropped = toy_edges();
        dropped.pop();
        assert_ne!(base, graph_root(&dropped));
    }

    #[test]
    fn self_edges_and_zero_counts_never_reach_the_blob() {
        let mut edges = toy_edges();
        edges.push(GraphEdge::new(id("a\n"), id("a\n"), 4));
        edges.push(GraphEdge::new(id("a\n"), id("z\n"), 0));
        assert_eq!(graph_bytes(&edges), graph_bytes(&toy_edges()));
    }

    #[test]
    fn a_duplicated_pair_keeps_the_largest_count_regardless_of_order() {
        let a = vec![
            GraphEdge::new(id("a\n"), id("b\n"), 1),
            GraphEdge::new(id("a\n"), id("b\n"), 9),
        ];
        let mut b = a.clone();
        b.reverse();
        assert_eq!(graph_bytes(&a), graph_bytes(&b));
        let parsed = parse_graph_bytes(&graph_bytes(&a)).unwrap();
        assert_eq!(parsed, vec![GraphEdge::new(id("a\n"), id("b\n"), 9)]);
    }

    // -- blob parsing -----------------------------------------------------

    #[test]
    fn a_canonical_blob_round_trips() {
        let blob = graph_bytes(&toy_edges());
        let parsed = parse_graph_bytes(&blob).unwrap();
        assert_eq!(graph_bytes(&parsed), blob);
        let mut expected = toy_edges();
        expected.sort();
        let mut got = parsed.clone();
        got.sort();
        assert_eq!(got, expected);
    }

    #[test]
    fn an_empty_edge_set_is_a_valid_blob() {
        let blob = graph_bytes(&[]);
        assert_eq!(blob, GRAPH_ROOT_DOMAIN);
        assert_eq!(parse_graph_bytes(&blob).unwrap(), vec![]);
    }

    #[test]
    fn a_blob_without_the_domain_separator_is_rejected() {
        let blob = graph_bytes(&toy_edges());
        let body = &blob[GRAPH_ROOT_DOMAIN.len()..];
        assert!(matches!(
            parse_graph_bytes(body),
            Err(GraphBytesError::WrongDomain { .. })
        ));
        // Including a blob that is a *corpus* root preimage.
        assert!(matches!(
            parse_graph_bytes(&corpus_root_bytes(&[id("a\n")])),
            Err(GraphBytesError::WrongDomain { .. })
        ));
    }

    #[test]
    fn a_truncated_blob_is_rejected_rather_than_silently_short() {
        let mut blob = graph_bytes(&toy_edges());
        blob.pop();
        assert!(matches!(
            parse_graph_bytes(&blob),
            Err(GraphBytesError::TrailingBytes { .. })
        ));
    }

    #[test]
    fn an_out_of_order_blob_is_rejected() {
        // Hand-build a blob with the same edges in the wrong order: it hashes
        // to a different root than the canonical encoding of the same set, so
        // accepting it would mean two roots for one graph.
        let mut edges = toy_edges();
        edges.sort();
        edges.reverse();
        let mut blob = Vec::from(GRAPH_ROOT_DOMAIN);
        for e in &edges {
            blob.extend_from_slice(e.from.as_bytes());
            blob.extend_from_slice(e.to.as_bytes());
            blob.extend_from_slice(&e.paragraph_count.to_be_bytes());
        }
        assert_ne!(root_of_graph_bytes(&blob), graph_root(&edges));
        assert!(matches!(
            parse_graph_bytes(&blob),
            Err(GraphBytesError::NotSorted { .. })
        ));
    }

    #[test]
    fn a_blob_repeating_a_pair_is_rejected() {
        let mut blob = Vec::from(GRAPH_ROOT_DOMAIN);
        for _ in 0..2 {
            blob.extend_from_slice(id("a\n").as_bytes());
            blob.extend_from_slice(id("b\n").as_bytes());
            blob.extend_from_slice(&1u32.to_be_bytes());
        }
        assert!(matches!(
            parse_graph_bytes(&blob),
            Err(GraphBytesError::NotSorted { .. })
        ));
    }

    #[test]
    fn a_blob_containing_a_self_edge_or_a_zero_count_is_rejected() {
        let mut blob = Vec::from(GRAPH_ROOT_DOMAIN);
        blob.extend_from_slice(id("a\n").as_bytes());
        blob.extend_from_slice(id("a\n").as_bytes());
        blob.extend_from_slice(&1u32.to_be_bytes());
        assert!(matches!(
            parse_graph_bytes(&blob),
            Err(GraphBytesError::SelfEdge { index: 0 })
        ));

        let mut blob = Vec::from(GRAPH_ROOT_DOMAIN);
        blob.extend_from_slice(id("a\n").as_bytes());
        blob.extend_from_slice(id("b\n").as_bytes());
        blob.extend_from_slice(&0u32.to_be_bytes());
        assert!(matches!(
            parse_graph_bytes(&blob),
            Err(GraphBytesError::ZeroParagraphs { index: 0 })
        ));
    }

    // -----------------------------------------------------------------------
    // Known-answer vectors
    //
    // Every test above computes both sides with the code under test, so all of
    // them would still pass if the encoding changed wholesale — and a changed
    // root encoding silently invalidates every manifest anyone has ever signed.
    // These are the fixed point: literal bytes, computed once, never
    // regenerated from the code under test.
    //
    // **If one of these fails, the root format has changed.** That is a
    // breaking change needing a new domain separator (`-v2`), not a new
    // constant here.
    // -----------------------------------------------------------------------

    /// Three deliberately artificial ids — `01…01`, `02…02`, `03…03` — chosen
    /// so the expected preimages below can be read and checked by eye rather
    /// than trusted. They are not the hash of any text, which is the point: a
    /// vector that had to be produced by `DocId::of_canonical` would be pinning
    /// that function rather than this encoding.
    fn vector_ids() -> Vec<DocId> {
        ["01", "02", "03"]
            .iter()
            .map(|b| b.repeat(32).parse().unwrap())
            .collect()
    }

    /// Strip the line-continuation whitespace the constants below use to stay
    /// inside a readable line length.
    fn unwrap_hex(s: &str) -> String {
        s.chars().filter(|c| !c.is_whitespace()).collect()
    }

    /// `corpus_root_bytes(vector_ids())`, hex. Reads as: the ASCII of
    /// `molao-corpus-root-v1\n`, then three times over `0x40` as an 8-byte
    /// big-endian length followed by the 64 ASCII characters of one id.
    const VECTOR_CORPUS_PREIMAGE: &str = "\
6d6f6c616f2d636f727075732d726f6f742d76310a0000000000000040303130313031303130313031303130313031303130\
3130313031303130313031303130313031303130313031303130313031303130313031303130313031303100000000000000\
4030323032303230323032303230323032303230323032303230323032303230323032303230323032303230323032303230\
3230323032303230323032303230320000000000000040303330333033303330333033303330333033303330333033303330\
33303330333033303330333033303330333033303330333033303330333033303330333033";

    /// `graph_bytes` for edges `(01→02, 1)` and `(02→03, 3)`, hex: the ASCII of
    /// `molao-graph-root-v1\n`, then two fixed-width 68-byte records.
    const VECTOR_GRAPH_BLOB: &str = "\
6d6f6c616f2d67726170682d726f6f742d76310a010101010101010101010101010101010101010101010101010101010101\
0101020202020202020202020202020202020202020202020202020202020202020200000001020202020202020202020202\
0202020202020202020202020202020202020202030303030303030303030303030303030303030303030303030303030303\
030300000003";

    /// BLAKE3 of [`VECTOR_CORPUS_PREIMAGE`] and [`VECTOR_GRAPH_BLOB`].
    ///
    /// Both preimages above were built by hand outside this crate, and both
    /// digests were computed with an independent BLAKE3 implementation (the
    /// Python `blake3` module) rather than with the `blake3` crate these
    /// functions call — so a bug shared between the encoder and the hasher in
    /// this repository cannot make these vectors agree with themselves.
    /// Recorded once; never regenerate them from the code under test.
    const VECTOR_CORPUS_ROOT: &str =
        "04accb10c8e9b68e0957ed08ba4aef94ebe5c5e8b6bde506a7e51ff701dbced9";
    const VECTOR_GRAPH_ROOT: &str =
        "b7521d3caa29d5abc834d5a9b98185282ea7b0bc2f661667919501952f5ada1d";

    #[test]
    fn vector_corpus_root_is_unchanged() {
        let ids = vector_ids();
        assert_eq!(
            hex::encode(corpus_root_bytes(&ids)),
            unwrap_hex(VECTOR_CORPUS_PREIMAGE),
            "the molao-corpus-root-v1 encoding has changed; every manifest ever \
             signed now names a corpus root nobody can recompute"
        );
        assert_eq!(
            corpus_root(&ids),
            VECTOR_CORPUS_ROOT,
            "the corpus root of a fixed id set has changed"
        );
    }

    #[test]
    fn vector_graph_root_is_unchanged() {
        let ids = vector_ids();
        let edges = vec![
            GraphEdge::new(ids[1], ids[2], 3),
            GraphEdge::new(ids[0], ids[1], 1),
        ];
        assert_eq!(
            hex::encode(graph_bytes(&edges)),
            unwrap_hex(VECTOR_GRAPH_BLOB),
            "the molao-graph-root-v1 encoding has changed"
        );
        assert_eq!(
            graph_root(&edges),
            VECTOR_GRAPH_ROOT,
            "the graph root of a fixed edge set has changed"
        );
    }
}
