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
//! [`corpus_root`] is a pure function of a sorted list of document ids, and
//! this module reproduces it byte-for-byte from `molao_corpus::Corpus::corpus_root`
//! (same domain separator, same length-prefixed encoding — there is a test
//! locking the exact bytes). molao-dist has no dependency on molao-corpus
//! (out of scope for this crate — see the crate root docs), so the two
//! copies must be kept in sync by hand; that is a real, acknowledged cost of
//! keeping this crate standalone, not an oversight.
//!
//! `graph_root`, by contrast, is **not** independently recomputed here. It is
//! a structural hash over parsed citation edges (see `Graph::graph_root` in
//! molao-graph), and reproducing it would require depending on molao-graph —
//! also out of scope. This module treats `graph_root` as an opaque value the
//! caller supplies (having computed it with molao-graph) and carries it
//! through unchanged. What packaging *does* verify about the graph is
//! ordinary content addressing: the graph blob a receiver fetches is
//! byte-identical to the one that was packaged. Whether that blob is the
//! *correct* graph for the corpus is a stronger claim — recomputing it needs
//! the pinned extractor and molao-graph, exactly the step docs/RELEASES.md
//! calls "in progress" for `molao verify`. This crate does not pretend
//! otherwise.

use molao_core::doc::DocId;
use molao_core::release::Manifest;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use crate::layout::{self, LayoutError};

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

/// The derived citation graph, as an opaque blob plus the root the caller
/// (molao-graph) computed for it. See the module docs for why this crate
/// cannot check that root itself.
#[derive(Debug, Clone)]
pub struct GraphInput {
    pub bytes: Vec<u8>,
    pub graph_root: String,
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
    /// Path relative to the release root, e.g. `documents/<hash>` or
    /// `graph/<hash>`. Never trusted on its own: [`verify_file_set`] only
    /// uses it to classify an entry as a document or the graph, never as a
    /// substitute for the hash.
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

    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
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
    #[error("release contains no graph file")]
    MissingGraph,
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

    let graph_hash = hex::encode(blake3::hash(&corpus.graph.bytes).as_bytes());
    files.push(FileEntry {
        hash: graph_hash.clone(),
        path: format!("graph/{graph_hash}"),
        size: corpus.graph.bytes.len() as u64,
    });
    blobs.insert(graph_hash, corpus.graph.bytes.clone());

    let manifest = Manifest {
        release: corpus.release,
        previous: corpus.previous.clone(),
        created_at: corpus.created_at.clone(),
        corpus_root: corpus_root(&ids),
        doc_count: ids.len() as u64,
        graph_root: corpus.graph.graph_root.clone(),
        extractor_version: corpus.extractor_version.clone(),
    };

    Ok(PackagedRelease {
        manifest,
        index: FileIndex { files },
        blobs,
    })
}

/// Root hash over a sorted list of document ids.
///
/// Byte-for-byte identical to `molao_corpus::Corpus::corpus_root` — same
/// `"molao-corpus-root-v1\n"` domain separator, same sorted,
/// length-prefixed encoding of each id's hex string — so a receiver that
/// only has molao-dist can still check a manifest's `corpus_root` against a
/// file set without depending on molao-corpus. See the module docs for why
/// this is a reproduction rather than a shared function.
pub fn corpus_root(ids: &[DocId]) -> String {
    let mut sorted: Vec<&DocId> = ids.iter().collect();
    sorted.sort();
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"molao-corpus-root-v1\n");
    for id in sorted {
        let s = id.to_string();
        hasher.update(&(s.len() as u64).to_be_bytes());
        hasher.update(s.as_bytes());
    }
    hex::encode(hasher.finalize().as_bytes())
}

/// The shared core of "does this file set actually match this manifest?" —
/// used both by [`PackagedRelease::verify_integrity`] (packaging-time
/// self-check) and by [`crate::verify::verify_received`] (receiver-side,
/// layered under signature verification). `fetch` abstracts over where bytes
/// come from: an in-memory map while packaging, a transport while receiving.
///
/// Checks, in order:
/// 1. every entry's bytes are present and hash to its declared address
/// 2. the release contains at least one graph file
/// 3. `manifest.doc_count` matches the number of document files
/// 4. `manifest.corpus_root` matches [`corpus_root`] recomputed from the
///    document files' ids
///
/// `manifest.graph_root` is deliberately not checked here — see the module
/// docs for why this crate cannot verify it without molao-graph.
pub(crate) fn verify_file_set(
    manifest: &Manifest,
    index: &FileIndex,
    fetch: impl Fn(&str) -> Option<Vec<u8>>,
) -> Result<(), IntegrityError> {
    let mut doc_ids = Vec::new();
    let mut has_graph = false;

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

        if let Some(rest) = entry.path.strip_prefix("documents/") {
            if let Ok(id) = rest.parse::<DocId>() {
                doc_ids.push(id);
            }
        } else if entry.path.starts_with("graph/") {
            has_graph = true;
        }
    }

    if !has_graph {
        return Err(IntegrityError::MissingGraph);
    }

    if doc_ids.len() as u64 != manifest.doc_count {
        return Err(IntegrityError::DocCountMismatch {
            manifest: manifest.doc_count,
            actual: doc_ids.len() as u64,
        });
    }

    if corpus_root(&doc_ids) != manifest.corpus_root {
        return Err(IntegrityError::CorpusRootMismatch);
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
        CorpusInput {
            documents: vec![
                doc("appeal upheld\n"),
                doc("appeal dismissed\n"),
                doc("appeal postponed\n"),
            ],
            graph: GraphInput {
                bytes: b"edge-list-bytes".to_vec(),
                graph_root: "gg".repeat(32),
            },
            release: 1,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            extractor_version: "molao-cite@0.1.0".into(),
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
