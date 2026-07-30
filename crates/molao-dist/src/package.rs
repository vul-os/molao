//! Content-addressed release packaging.
//!
//! A release is a set of files plus a signed manifest — transport-agnostic
//! by construction, because nothing about "these bytes hash to this address"
//! depends on how the bytes arrived. This module builds that set: it turns a
//! corpus (documents plus the derived citation graph) into content-addressed
//! blobs, a [`FileIndex`] describing them, and a [`molao_core::release::Manifest`]
//! that pins their roots. Packaging is what makes *any* transport safe —
//! iroh, BitTorrent, a plain HTTP mirror, a USB stick handed across a border
//! — because the receiver never has to trust the transport, only recompute
//! hashes against the manifest it already trusts (see [`crate::verify`]).
//!
//! ## What gets verified here, and what does not
//!
//! Both roots come from `molao_core::roots`, which is the single definition
//! every crate in the workspace calls. This module used to carry its own
//! transcription of `corpus_root`, kept in sync with molao-corpus's by hand;
//! it no longer does, because two hand-synchronised hash definitions are two
//! hash definitions.
//!
//! `graph_root` is now checked here, which it previously was not. That became
//! possible when the graph blob was defined to *be* the `graph_root` preimage
//! (`molao_core::roots::graph_bytes`): content-addressing the graph file and
//! checking `graph_root` are the same operation, so this module gets the
//! check for free and without depending on molao-graph. It also parses the
//! blob and rejects a non-canonical encoding, and rejects a graph whose edges
//! name documents the release does not carry.
//!
//! What that still does **not** prove is that the graph is the *correct*
//! graph for this corpus. A graph that is internally consistent, canonically
//! encoded, references only documents in the release, and is missing half the
//! edges a real extraction would have produced passes everything here. Only
//! re-running the pinned `extractor_version` over the documents and comparing
//! catches that, and it needs molao-cite and a resolver — that is
//! `molao verify` step 6 in molao-node, not this crate. See the test
//! `a_semantically_wrong_but_well_formed_graph_still_passes_here`, which pins
//! the remaining gap so it cannot silently widen.

use molao_core::doc::DocId;
use molao_core::release::Manifest;
use molao_core::roots::{self, GraphEdge};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use crate::layout::{self, LayoutError};

/// Root hash over a set of document ids.
///
/// Re-exported from `molao_core::roots` so callers holding only molao-dist do
/// not have to reach past it, and so there is exactly one implementation.
pub use molao_core::roots::corpus_root;

/// One document going into a release: its id and the exact canonical bytes
/// that must hash to it.
///
/// `id` is not trusted on its own — [`pack`] recomputes `DocId::of_canonical`
/// over `bytes` and rejects the input if they disagree. That check is what
/// makes it safe to build a release from documents assembled by code this
/// crate does not control.
#[derive(Debug, Clone)]
pub struct DocumentInput {
    pub id: DocId,
    /// Canonical text bytes (UTF-8) — the same bytes `DocId::of_canonical`
    /// was computed over.
    pub bytes: Vec<u8>,
}

/// The derived citation graph going into a release, as edges.
///
/// Edges rather than a blob-plus-a-root, deliberately: when the caller
/// supplied both, nothing stopped it supplying a root that did not belong to
/// the bytes, and a manifest naming a `graph_root` no file in the release
/// hashes to is unverifiable by anyone. [`pack`] derives both the blob and
/// the root from these edges, so the two cannot disagree. A caller holding an
/// already-encoded blob decodes it with `molao_core::roots::parse_graph_bytes`
/// first — which is the validation it should be doing regardless.
#[derive(Debug, Clone, Default)]
pub struct GraphInput {
    pub edges: Vec<GraphEdge>,
}

/// Everything [`pack`] needs to build one release.
#[derive(Debug, Clone)]
pub struct CorpusInput {
    pub documents: Vec<DocumentInput>,
    pub graph: GraphInput,
    pub release: u64,
    pub previous: Option<String>,
    pub created_at: String,
    pub extractor_version: String,
    /// `SignerSet::fingerprint()` of the set this release will be signed
    /// under. Required at packaging time, not at signing time: it is inside
    /// the manifest's signing bytes, so it has to be decided before there is
    /// anything to sign.
    pub signer_set: String,
}

/// One entry in a [`FileIndex`]: a content address, where the file lives
/// relative to the release root, and its size.
///
/// Size is carried alongside the hash rather than left for a receiver to
/// discover, so a transport can plan a fetch (or refuse one that would
/// exceed a budget) before pulling any bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    /// BLAKE3 hash of the file's bytes, hex-encoded — the content address.
    pub hash: String,
    /// Path relative to the release root: exactly `documents/<hash>` or
    /// `graph/<hash>`. Never trusted, and never used to classify anything —
    /// [`verify_file_set`] decides what a file is from its content address and
    /// then checks the path *against* that, so an index that files a document
    /// under some other prefix to keep it out of the corpus-root computation is
    /// rejected rather than obeyed.
    pub path: String,
    pub size: u64,
}

/// Hash → path → size for every file in a release. The manifest says what a
/// release *means*; the index says what bytes to go fetch to have it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIndex {
    pub files: Vec<FileEntry>,
}

impl FileIndex {
    pub fn get(&self, hash: &str) -> Option<&FileEntry> {
        self.files.iter().find(|f| f.hash == hash)
    }

    pub fn hashes(&self) -> BTreeSet<&str> {
        self.files.iter().map(|f| f.hash.as_str()).collect()
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PackageError {
    #[error("document bytes for {0} are not valid UTF-8 canonical text")]
    NotUtf8(DocId),
    #[error("document declares id {declared} but its bytes hash to {computed}")]
    DocumentIdMismatch { declared: DocId, computed: DocId },
    #[error("document {0} appears more than once in the corpus input")]
    DuplicateDocument(DocId),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IntegrityError {
    #[error("file {path} (declared hash {hash}) is missing from the fetched content")]
    Missing { hash: String, path: String },
    #[error("file {path} does not hash to its declared address {hash}")]
    HashMismatch { hash: String, path: String },
    #[error("manifest doc_count {manifest} does not match {actual} document file(s) in the index")]
    DocCountMismatch { manifest: u64, actual: u64 },
    #[error("manifest corpus_root does not match the root recomputed from the document files")]
    CorpusRootMismatch,
    #[error("release contains no file hashing to the manifest's graph_root")]
    MissingGraph,
    #[error("the graph file is not a canonical graph blob: {0}")]
    GraphNotCanonical(String),
    #[error("the graph cites document {0}, which this release does not contain")]
    GraphReferencesUnknownDocument(DocId),
    #[error("file {hash} is filed at {path}, not at the layout path its content requires")]
    UnexpectedPath { hash: String, path: String },
}

/// A packaged release, held in memory: the manifest packaging computed, the
/// index describing its files, and the file bytes themselves.
#[derive(Debug)]
pub struct PackagedRelease {
    pub manifest: Manifest,
    pub index: FileIndex,
    blobs: BTreeMap<String, Vec<u8>>,
}

impl PackagedRelease {
    pub fn blob(&self, hash: &str) -> Option<&[u8]> {
        self.blobs.get(hash).map(Vec::as_slice)
    }

    /// The packaging-time self-check: every file hashes to its declared
    /// address, and the manifest's roots (the parts this crate can compute —
    /// see the module docs) match the file set. Run this before publishing;
    /// [`crate::verify::verify_received`] runs the same check plus signature
    /// verification on the receiving end.
    pub fn verify_integrity(&self) -> Result<(), IntegrityError> {
        verify_file_set(&self.manifest, &self.index, |h| self.blobs.get(h).cloned())
    }

    /// Write the release to disk in the layout [`crate::layout`] describes:
    /// content-addressed objects, the file index, and the unsigned manifest.
    pub fn write_to(&self, dir: &Path) -> Result<(), LayoutError> {
        for (hash, bytes) in &self.blobs {
            layout::write_blob(dir, hash, bytes)?;
        }
        layout::write_index(dir, &self.index)?;
        layout::write_manifest(dir, &self.manifest)?;
        Ok(())
    }
}

/// Package a corpus into content-addressed files plus a manifest.
///
/// Fails closed: a document whose declared id does not match its bytes, or
/// that appears twice, aborts packaging rather than silently dropping or
/// renumbering anything. A release with a wrong `doc_count` because
/// packaging quietly ate a duplicate is exactly the kind of corruption this
/// crate exists to prevent — it must not introduce its own version of it.
pub fn pack(corpus: &CorpusInput) -> Result<PackagedRelease, PackageError> {
    let mut ids: Vec<DocId> = Vec::with_capacity(corpus.documents.len());
    let mut blobs: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    let mut files = Vec::with_capacity(corpus.documents.len() + 1);
    let mut seen: BTreeSet<DocId> = BTreeSet::new();

    for doc in &corpus.documents {
        let text = std::str::from_utf8(&doc.bytes).map_err(|_| PackageError::NotUtf8(doc.id))?;
        let computed = DocId::of_canonical(text);
        if computed != doc.id {
            return Err(PackageError::DocumentIdMismatch {
                declared: doc.id,
                computed,
            });
        }
        if !seen.insert(doc.id) {
            return Err(PackageError::DuplicateDocument(doc.id));
        }

        // A document's content address and its DocId are the same value:
        // both are `hex(blake3(canonical_text))`. That equality is not a
        // coincidence of this implementation, it is why documents can be
        // named by id at all — see molao_core::doc::DocId.
        let hash = doc.id.to_string();
        files.push(FileEntry {
            hash: hash.clone(),
            path: format!("documents/{hash}"),
            size: doc.bytes.len() as u64,
        });
        blobs.insert(hash, doc.bytes.clone());
        ids.push(doc.id);
    }

    // The graph blob *is* the graph_root preimage, so its content address and
    // the manifest's graph_root are one value, not two that have to agree.
    let graph_bytes = roots::graph_bytes(&corpus.graph.edges);
    let graph_root = roots::root_of_graph_bytes(&graph_bytes);
    files.push(FileEntry {
        hash: graph_root.clone(),
        path: format!("graph/{graph_root}"),
        size: graph_bytes.len() as u64,
    });
    blobs.insert(graph_root.clone(), graph_bytes);

    let manifest = Manifest {
        release: corpus.release,
        previous: corpus.previous.clone(),
        created_at: corpus.created_at.clone(),
        corpus_root: corpus_root(&ids),
        doc_count: ids.len() as u64,
        graph_root,
        extractor_version: corpus.extractor_version.clone(),
        signer_set: corpus.signer_set.clone(),
    };

    Ok(PackagedRelease {
        manifest,
        index: FileIndex { files },
        blobs,
    })
}

/// The shared core of "does this file set actually match this manifest?" —
/// used both by [`PackagedRelease::verify_integrity`] (packaging-time
/// self-check) and by [`crate::verify::verify_received`] (receiver-side,
/// layered under signature verification). `fetch` abstracts over where bytes
/// come from: an in-memory map while packaging, a transport while receiving.
///
/// Checks, in order:
/// 1. every entry's bytes are present and hash to its declared address
/// 2. the release contains a file hashing to `manifest.graph_root`, and that
///    file decodes as a canonical graph blob
/// 3. every other entry is a document, filed at exactly `documents/<hash>`
/// 4. `manifest.doc_count` matches the number of document files
/// 5. `manifest.corpus_root` matches [`corpus_root`] recomputed from the
///    document files' ids
/// 6. every document the graph cites is one this release carries
///
/// Nothing here trusts `path`. A path is checked *against* the content
/// address, never used in place of it — an index that files a document under
/// some other prefix to hide it from the corpus-root computation is rejected
/// rather than quietly obeyed.
///
/// What this still does not prove: that the graph is the *right* graph for
/// these documents. See the module docs.
pub fn verify_file_set(
    manifest: &Manifest,
    index: &FileIndex,
    fetch: impl Fn(&str) -> Option<Vec<u8>>,
) -> Result<(), IntegrityError> {
    // Cheapest check first, and the one whose absence would otherwise surface
    // as a confusing path error: the index must contain the graph the manifest
    // names. Everything below classifies files by content address, so a release
    // with no file at `graph_root` would leave the real graph file looking like
    // a document filed under the wrong prefix.
    if !index.files.iter().any(|f| f.hash == manifest.graph_root) {
        return Err(IntegrityError::MissingGraph);
    }

    let mut doc_ids: Vec<DocId> = Vec::new();
    let mut graph_edges: Option<Vec<GraphEdge>> = None;

    for entry in &index.files {
        let bytes = fetch(&entry.hash).ok_or_else(|| IntegrityError::Missing {
            hash: entry.hash.clone(),
            path: entry.path.clone(),
        })?;
        if bytes.len() as u64 != entry.size {
            return Err(IntegrityError::HashMismatch {
                hash: entry.hash.clone(),
                path: entry.path.clone(),
            });
        }
        let actual = hex::encode(blake3::hash(&bytes).as_bytes());
        if actual != entry.hash {
            return Err(IntegrityError::HashMismatch {
                hash: entry.hash.clone(),
                path: entry.path.clone(),
            });
        }

        // The graph is identified by its content address matching the signed
        // graph_root — not by its path, which nobody has any reason to trust.
        if entry.hash == manifest.graph_root {
            if entry.path != format!("graph/{}", entry.hash) {
                return Err(IntegrityError::UnexpectedPath {
                    hash: entry.hash.clone(),
                    path: entry.path.clone(),
                });
            }
            let edges = roots::parse_graph_bytes(&bytes)
                .map_err(|e| IntegrityError::GraphNotCanonical(e.to_string()))?;
            graph_edges = Some(edges);
            continue;
        }

        if entry.path != format!("documents/{}", entry.hash) {
            return Err(IntegrityError::UnexpectedPath {
                hash: entry.hash.clone(),
                path: entry.path.clone(),
            });
        }
        // A document's content address and its DocId are the same value, so a
        // hash that does not parse as an id cannot be a document.
        let id = entry
            .hash
            .parse::<DocId>()
            .map_err(|_| IntegrityError::UnexpectedPath {
                hash: entry.hash.clone(),
                path: entry.path.clone(),
            })?;
        doc_ids.push(id);
    }

    let Some(edges) = graph_edges else {
        return Err(IntegrityError::MissingGraph);
    };

    if doc_ids.len() as u64 != manifest.doc_count {
        return Err(IntegrityError::DocCountMismatch {
            manifest: manifest.doc_count,
            actual: doc_ids.len() as u64,
        });
    }

    if corpus_root(&doc_ids) != manifest.corpus_root {
        return Err(IntegrityError::CorpusRootMismatch);
    }

    let held: BTreeSet<DocId> = doc_ids.into_iter().collect();
    for edge in &edges {
        for id in [edge.from, edge.to] {
            if !held.contains(&id) {
                return Err(IntegrityError::GraphReferencesUnknownDocument(id));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(text: &str) -> DocumentInput {
        DocumentInput {
            id: DocId::of_canonical(text),
            bytes: text.as_bytes().to_vec(),
        }
    }

    fn toy_corpus() -> CorpusInput {
        let documents = vec![
            doc("appeal upheld\n"),
            doc("appeal dismissed\n"),
            doc("appeal postponed\n"),
        ];
        // A graph over exactly the documents in the release: anything else is
        // now a rejection, which is the point.
        let edges = vec![
            GraphEdge::new(documents[0].id, documents[1].id, 2),
            GraphEdge::new(documents[2].id, documents[0].id, 1),
        ];
        CorpusInput {
            documents,
            graph: GraphInput { edges },
            release: 1,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            extractor_version: "molao-cite@0.1.0".into(),
            signer_set: "5e".repeat(32),
        }
    }

    #[test]
    fn packaging_produces_a_verifiable_release() {
        let packaged = pack(&toy_corpus()).unwrap();
        assert_eq!(packaged.manifest.doc_count, 3);
        assert_eq!(packaged.index.files.len(), 4); // 3 docs + 1 graph
        packaged.verify_integrity().unwrap();
    }

    #[test]
    fn corpus_root_is_order_independent() {
        let a = toy_corpus();
        let mut b = toy_corpus();
        b.documents.reverse();
        assert_eq!(
            pack(&a).unwrap().manifest.corpus_root,
            pack(&b).unwrap().manifest.corpus_root
        );
    }

    #[test]
    fn corpus_root_changes_when_a_document_changes() {
        let a = pack(&toy_corpus()).unwrap();
        let mut input = toy_corpus();
        input.documents.push(doc("a fourth judgment\n"));
        let b = pack(&input).unwrap();
        assert_ne!(a.manifest.corpus_root, b.manifest.corpus_root);
    }

    #[test]
    fn a_document_with_a_wrong_declared_id_is_rejected() {
        let mut input = toy_corpus();
        input.documents[0].id = DocId::of_canonical("something else entirely\n");
        let err = pack(&input).unwrap_err();
        assert!(matches!(err, PackageError::DocumentIdMismatch { .. }));
    }

    #[test]
    fn a_duplicate_document_is_rejected() {
        let mut input = toy_corpus();
        let first = input.documents[0].clone();
        input.documents.push(first);
        let err = pack(&input).unwrap_err();
        assert!(matches!(err, PackageError::DuplicateDocument(_)));
    }

    #[test]
    fn non_utf8_document_bytes_are_rejected_not_panicking() {
        let mut input = toy_corpus();
        let bad_bytes = vec![0xff, 0xfe, 0xfd];
        input.documents[0].id = DocId::of_canonical("placeholder\n");
        input.documents[0].bytes = bad_bytes;
        let err = pack(&input).unwrap_err();
        assert!(matches!(err, PackageError::NotUtf8(_)));
    }

    #[test]
    fn tampering_with_a_fetched_file_is_rejected() {
        let packaged = pack(&toy_corpus()).unwrap();
        let doc_hash = packaged.index.files[0].hash.clone();
        let err = verify_file_set(&packaged.manifest, &packaged.index, |h| {
            if h == doc_hash {
                Some(b"tampered bytes".to_vec())
            } else {
                packaged.blob(h).map(<[u8]>::to_vec)
            }
        })
        .unwrap_err();
        assert!(matches!(err, IntegrityError::HashMismatch { .. }));
    }

    #[test]
    fn a_missing_file_is_rejected() {
        let packaged = pack(&toy_corpus()).unwrap();
        let missing_hash = packaged.index.files[0].hash.clone();
        let err = verify_file_set(&packaged.manifest, &packaged.index, |h| {
            if h == missing_hash {
                None
            } else {
                packaged.blob(h).map(<[u8]>::to_vec)
            }
        })
        .unwrap_err();
        assert!(matches!(err, IntegrityError::Missing { .. }));
    }

    #[test]
    fn a_manifest_with_a_wrong_corpus_root_is_rejected() {
        let mut packaged = pack(&toy_corpus()).unwrap();
        packaged.manifest.corpus_root = "ff".repeat(32);
        let err = packaged.verify_integrity().unwrap_err();
        assert_eq!(err, IntegrityError::CorpusRootMismatch);
    }

    #[test]
    fn a_manifest_with_a_wrong_doc_count_is_rejected() {
        let mut packaged = pack(&toy_corpus()).unwrap();
        packaged.manifest.doc_count = 99;
        let err = packaged.verify_integrity().unwrap_err();
        assert!(matches!(err, IntegrityError::DocCountMismatch { .. }));
    }

    /// `graph_root` used to be carried through opaque and checked against
    /// nothing, not even against the graph blob the same release carried; the
    /// test that stood here pinned that gap open. It is now checked, because
    /// the graph blob was defined to *be* the `graph_root` preimage — so this
    /// is the same assertion inverted.
    #[test]
    fn a_manifest_naming_a_graph_root_no_file_hashes_to_is_rejected() {
        let mut packaged = pack(&toy_corpus()).unwrap();
        packaged.manifest.graph_root = "ff".repeat(32); // arbitrary, matches nothing
        assert_eq!(
            packaged.verify_integrity().unwrap_err(),
            IntegrityError::MissingGraph,
            "a graph_root naming no file in the release must not verify"
        );
    }

    #[test]
    fn a_tampered_graph_blob_is_rejected() {
        let packaged = pack(&toy_corpus()).unwrap();
        let graph_hash = packaged.manifest.graph_root.clone();
        let original = packaged.blob(&graph_hash).unwrap().to_vec();
        // Same length, so the cheap length guard cannot be what catches it.
        let mut tampered = original.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 0x01; // one paragraph count off by one
        assert_eq!(tampered.len(), original.len());
        let err = verify_file_set(&packaged.manifest, &packaged.index, |h| {
            if h == graph_hash {
                Some(tampered.clone())
            } else {
                packaged.blob(h).map(<[u8]>::to_vec)
            }
        })
        .unwrap_err();
        assert!(matches!(err, IntegrityError::HashMismatch { .. }));
    }

    /// The remaining, real gap, pinned so it cannot silently widen: a graph
    /// that is canonically encoded, references only documents in the release,
    /// and is simply **wrong** — here, missing an edge a real extraction would
    /// have produced — passes everything this crate can check. Nothing in
    /// molao-dist re-runs the extractor, so nothing here can tell a complete
    /// graph from a truncated one. That is `molao verify` step 6 in
    /// molao-node, which re-extracts from the document text and compares.
    #[test]
    fn a_semantically_wrong_but_well_formed_graph_still_passes_here() {
        let mut input = toy_corpus();
        input.graph.edges.pop(); // silently drop a citation edge
        let packaged = pack(&input).unwrap();
        assert!(
            packaged.verify_integrity().is_ok(),
            "if this now fails, molao-dist gained a way to tell a correct graph \
             from an incomplete one — describe how in the module docs; do not \
             restore the old opaque-string graph_root check to make it pass"
        );
        // And it is genuinely a different release from the complete one.
        assert_ne!(
            packaged.manifest.graph_root,
            pack(&toy_corpus()).unwrap().manifest.graph_root
        );
    }

    #[test]
    fn a_graph_citing_a_document_the_release_does_not_carry_is_rejected() {
        let mut input = toy_corpus();
        let stranger = DocId::of_canonical("a judgment held by nobody\n");
        input
            .graph
            .edges
            .push(GraphEdge::new(input.documents[0].id, stranger, 1));
        let packaged = pack(&input).unwrap();
        assert_eq!(
            packaged.verify_integrity().unwrap_err(),
            IntegrityError::GraphReferencesUnknownDocument(stranger)
        );
    }

    #[test]
    fn a_non_canonically_encoded_graph_blob_is_rejected() {
        // Hand-encode the same edges in the wrong order. It is a perfectly
        // valid content address for its own bytes; it is not a graph blob.
        let input = toy_corpus();
        let mut edges = input.graph.edges.clone();
        edges.sort();
        edges.reverse();
        let mut blob = Vec::from(molao_core::roots::GRAPH_ROOT_DOMAIN);
        for e in &edges {
            blob.extend_from_slice(e.from.as_bytes());
            blob.extend_from_slice(e.to.as_bytes());
            blob.extend_from_slice(&e.paragraph_count.to_be_bytes());
        }
        let hash = molao_core::roots::root_of_graph_bytes(&blob);

        let packaged = pack(&input).unwrap();
        let mut manifest = packaged.manifest.clone();
        let old_root = manifest.graph_root.clone();
        manifest.graph_root = hash.clone();
        let mut index = packaged.index.clone();
        for f in &mut index.files {
            if f.hash == old_root {
                f.hash = hash.clone();
                f.path = format!("graph/{hash}");
                f.size = blob.len() as u64;
            }
        }
        let err = verify_file_set(&manifest, &index, |h| {
            if h == hash {
                Some(blob.clone())
            } else {
                packaged.blob(h).map(<[u8]>::to_vec)
            }
        })
        .unwrap_err();
        assert!(matches!(err, IntegrityError::GraphNotCanonical(_)), "{err}");
    }

    #[test]
    fn a_document_hidden_under_another_path_prefix_is_rejected() {
        // Renaming a document's path is how an index would try to drop it from
        // the corpus-root computation while still shipping the bytes.
        let packaged = pack(&toy_corpus()).unwrap();
        let mut index = packaged.index.clone();
        let victim = index
            .files
            .iter_mut()
            .find(|f| f.path.starts_with("documents/"))
            .unwrap();
        victim.path = format!("attachments/{}", victim.hash);
        let err = verify_file_set(&packaged.manifest, &index, |h| {
            packaged.blob(h).map(<[u8]>::to_vec)
        })
        .unwrap_err();
        assert!(
            matches!(err, IntegrityError::UnexpectedPath { .. }),
            "{err}"
        );
    }

    #[test]
    fn a_release_missing_a_graph_file_is_rejected() {
        let packaged = pack(&toy_corpus()).unwrap();
        let mut index = packaged.index.clone();
        index.files.retain(|f| !f.path.starts_with("graph/"));
        let err = verify_file_set(&packaged.manifest, &index, |h| {
            packaged.blob(h).map(<[u8]>::to_vec)
        })
        .unwrap_err();
        assert_eq!(err, IntegrityError::MissingGraph);
    }

    #[test]
    fn packing_is_deterministic_so_two_builders_can_compare_one_line() {
        // The reproducibility claim, at the packaging layer: same inputs, same
        // manifest, same index, same bytes — no timestamps, no map iteration
        // order, nothing else leaking in.
        let a = pack(&toy_corpus()).unwrap();
        let mut shuffled = toy_corpus();
        shuffled.documents.reverse();
        shuffled.graph.edges.reverse();
        let b = pack(&shuffled).unwrap();
        assert_eq!(a.manifest, b.manifest);
        let mut a_files = a.index.files.clone();
        let mut b_files = b.index.files.clone();
        a_files.sort_by(|x, y| x.hash.cmp(&y.hash));
        b_files.sort_by(|x, y| x.hash.cmp(&y.hash));
        assert_eq!(a_files, b_files);
        for f in &a_files {
            assert_eq!(a.blob(&f.hash), b.blob(&f.hash));
        }
    }

    #[test]
    fn write_to_and_read_back_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let packaged = pack(&toy_corpus()).unwrap();
        packaged.write_to(dir.path()).unwrap();

        let index = layout::read_index(dir.path()).unwrap();
        assert_eq!(index, packaged.index);
        let manifest = layout::read_manifest(dir.path()).unwrap();
        assert_eq!(manifest, packaged.manifest);
        for entry in &index.files {
            let bytes = layout::read_blob(dir.path(), &entry.hash).unwrap();
            assert_eq!(bytes, packaged.blob(&entry.hash).unwrap());
        }
    }
}
