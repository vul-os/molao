//! BitTorrent v2 (BEP 52) `.torrent` export.
//!
//! The founder decision behind this crate is that a release is a
//! content-addressed file set plus a signed manifest, and transports are
//! interchangeable and untrusted. That choice makes a `.torrent` almost
//! free: BitTorrent v2 already identifies files by a per-file BLAKE3-*sized*
//! merkle root over content, so exporting one is mostly a matter of
//! re-expressing hashes we already have in BEP 52's bencoded shape. This
//! module does exactly that and nothing more — **it is an export, not a
//! torrent client.** No peer wire protocol, no tracker, no DHT, no piece
//! selection. Universities that already run torrent infrastructure can seed
//! the corpus with tools they already trust and operate; this crate does not
//! need to become one of those tools to make that possible.
//!
//! ## Why v2, and why it needs its own hash
//!
//! BEP 52 mandates **SHA-256**, not BLAKE3, for its merkle tree. That is a
//! real, separate cryptographic dependency (`sha2` in Cargo.toml) from the
//! BLAKE3 content addressing used everywhere else in this crate — it is not
//! an inconsistency, it is what the format requires for interoperability
//! with real BitTorrent v2 clients. A `.torrent`'s piece hashes are
//! therefore never used as this crate's trust root; the signed manifest and
//! its BLAKE3 addresses (`package.rs`) remain that. The `.torrent` is a
//! derived, disposable view for a specific transport, exactly like
//! `transport::fs` or the (scaffold) `transport::iroh` adapter.
//!
//! ## Reproducibility
//!
//! BEP 52's `creation date` field is optional and this module never writes
//! it. Packaging the same release twice therefore produces byte-identical
//! `.torrent` output — and, since the info-hash is computed over that same
//! `info` dict, an identical info-hash. Two independent mirrors packaging
//! the same signed release converge on the same swarm without coordinating,
//! which matters for a corpus with no single publisher.

use crate::bencode::{BValue, BencodeError};
use crate::package::FileIndex;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// BEP 52's fixed leaf block size. Not configurable — it is part of the
/// format, not a tuning knob.
pub const BLOCK_SIZE: usize = 16 * 1024;

/// A reasonable default piece length: large enough that a corpus of many
/// small judgment files does not produce an enormous piece layer, small
/// enough that a partial fetch is still useful. Callers packaging very large
/// releases may want a larger power of two.
pub const DEFAULT_PIECE_LENGTH: u32 = 256 * 1024;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TorrentError {
    #[error("piece length {0} must be a power of two of at least {BLOCK_SIZE} (16 KiB)")]
    InvalidPieceLength(u32),
    #[error(transparent)]
    Bencode(#[from] BencodeError),
    #[error("malformed torrent: {0}")]
    Malformed(&'static str),
    #[error("no bytes available for {0}")]
    MissingBytes(String),
    #[error("piece hashes for {0} do not match the supplied file")]
    HashMismatch(String),
}

/// One file to include in the export: its path within the release (matching
/// [`crate::package::FileEntry::path`], forward-slash separated) and its
/// bytes.
#[derive(Debug, Clone, Copy)]
pub struct TorrentFile<'a> {
    pub path: &'a str,
    pub bytes: &'a [u8],
}

/// Export a `.torrent` for an arbitrary named file set.
///
/// `piece_length` must be a power of two of at least [`BLOCK_SIZE`] — the
/// same constraint BEP 52 imposes on real clients, checked here rather than
/// left to fail confusingly deep in a client that opens the resulting file.
pub fn export(
    name: &str,
    piece_length: u32,
    files: &[TorrentFile<'_>],
) -> Result<Vec<u8>, TorrentError> {
    if piece_length < BLOCK_SIZE as u32 || !piece_length.is_power_of_two() {
        return Err(TorrentError::InvalidPieceLength(piece_length));
    }

    let mut file_tree = BTreeMap::new();
    let mut piece_layers = BTreeMap::new();

    for f in files {
        let (root, layer) = file_merkle(f.bytes, piece_length as usize);
        let mut leaf = BTreeMap::new();
        leaf.insert(b"length".to_vec(), BValue::Int(f.bytes.len() as i64));
        if let Some(root) = root {
            leaf.insert(b"pieces root".to_vec(), BValue::Bytes(root.to_vec()));
            if let Some(layer_bytes) = layer {
                piece_layers.insert(root.to_vec(), BValue::Bytes(layer_bytes));
            }
        }
        let mut file_dict = BTreeMap::new();
        file_dict.insert(Vec::new(), BValue::Dict(leaf));
        insert_path(&mut file_tree, f.path, BValue::Dict(file_dict))?;
    }

    let mut info = BTreeMap::new();
    info.insert(b"name".to_vec(), BValue::bytes(name));
    info.insert(b"piece length".to_vec(), BValue::Int(piece_length as i64));
    info.insert(b"meta version".to_vec(), BValue::Int(2));
    info.insert(b"file tree".to_vec(), BValue::Dict(file_tree));

    let mut top = BTreeMap::new();
    top.insert(b"info".to_vec(), BValue::Dict(info));
    top.insert(b"piece layers".to_vec(), BValue::Dict(piece_layers));
    // Deliberately absent: "creation date" (reproducibility, see module
    // docs) and "announce" (export only — no tracker is assumed).

    Ok(BValue::Dict(top).encode())
}

/// Export directly from a packaged release's index and blobs — the usual
/// entry point once [`crate::package::pack`] has run.
pub fn export_release(
    name: &str,
    piece_length: u32,
    index: &FileIndex,
    blobs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<u8>, TorrentError> {
    let mut files = Vec::with_capacity(index.files.len());
    for entry in &index.files {
        let bytes = blobs
            .get(&entry.hash)
            .ok_or_else(|| TorrentError::MissingBytes(entry.path.clone()))?;
        files.push(TorrentFile {
            path: &entry.path,
            bytes,
        });
    }
    export(name, piece_length, &files)
}

/// SHA-256 of the info dict — the value a magnet link or a real client would
/// call the v2 info-hash. Exposed mainly so tests (and callers who want to
/// confirm reproducibility) do not have to re-derive it from raw bytes.
pub fn info_hash(torrent_bytes: &[u8]) -> Result<[u8; 32], TorrentError> {
    let top = BValue::decode(torrent_bytes)?;
    let top = top
        .as_dict()
        .ok_or(TorrentError::Malformed("top-level value is not a dict"))?;
    let info = top
        .get(b"info".as_slice())
        .ok_or(TorrentError::Malformed("missing info dict"))?;
    let mut hasher = Sha256::new();
    hasher.update(info.encode());
    Ok(hasher.finalize().into())
}

fn insert_path(
    root: &mut BTreeMap<Vec<u8>, BValue>,
    path: &str,
    leaf: BValue,
) -> Result<(), TorrentError> {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.is_empty() {
        return Err(TorrentError::Malformed("empty file path"));
    }
    let mut cursor = root;
    for (i, seg) in segments.iter().enumerate() {
        if i + 1 == segments.len() {
            cursor.insert(seg.as_bytes().to_vec(), leaf);
            return Ok(());
        }
        let entry = cursor
            .entry(seg.as_bytes().to_vec())
            .or_insert_with(|| BValue::Dict(BTreeMap::new()));
        cursor = match entry {
            BValue::Dict(m) => m,
            _ => {
                return Err(TorrentError::Malformed(
                    "file path collides with another file",
                ))
            }
        };
    }
    Ok(())
}

/// Per-file BEP 52 merkle computation.
///
/// Returns `(pieces_root, piece_layer_bytes)`:
/// - empty file: `(None, None)` — BEP 52 gives empty files no `pieces root`.
/// - file no larger than one piece: `(Some(root), None)` — a single piece
///   *is* the whole file, so there is nothing to store in `piece layers`.
/// - larger file: `(Some(root), Some(concatenated 32-byte piece hashes))`.
fn file_merkle(bytes: &[u8], piece_length: usize) -> (Option<[u8; 32]>, Option<Vec<u8>>) {
    if bytes.is_empty() {
        return (None, None);
    }

    let leaves = pad_to_power_of_two(block_hashes(bytes));
    if bytes.len() <= piece_length {
        return (Some(fold_to_root(&leaves)), None);
    }

    let leaves_per_piece = piece_length / BLOCK_SIZE;
    let piece_hashes = fold_to_layer(&leaves, leaves_per_piece);
    let root = fold_to_root(&piece_hashes);
    let mut layer_bytes = Vec::with_capacity(piece_hashes.len() * 32);
    for h in &piece_hashes {
        layer_bytes.extend_from_slice(h);
    }
    (Some(root), Some(layer_bytes))
}

fn block_hashes(bytes: &[u8]) -> Vec<[u8; 32]> {
    bytes
        .chunks(BLOCK_SIZE)
        .map(|chunk| {
            let mut hasher = Sha256::new();
            hasher.update(chunk);
            hasher.finalize().into()
        })
        .collect()
}

/// SHA-256 of one all-zero 16 KiB block — BEP 52's padding leaf for files
/// whose block count is not already a power of two.
fn pad_hash() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([0u8; BLOCK_SIZE]);
    hasher.finalize().into()
}

fn pad_to_power_of_two(mut leaves: Vec<[u8; 32]>) -> Vec<[u8; 32]> {
    let target = leaves.len().next_power_of_two();
    if target > leaves.len() {
        leaves.resize(target, pad_hash());
    }
    leaves
}

fn pair_hash(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(a);
    hasher.update(b);
    hasher.finalize().into()
}

/// Fold a power-of-two leaf list down to the layer where each node covers
/// `group_size` leaves. `group_size` must itself be a power of two dividing
/// `leaves.len()` — guaranteed by callers because both piece length and file
/// size are powers of two (of `BLOCK_SIZE`) by construction.
fn fold_to_layer(leaves: &[[u8; 32]], group_size: usize) -> Vec<[u8; 32]> {
    let mut layer = leaves.to_vec();
    let mut covered = 1;
    while covered < group_size && layer.len() > 1 {
        layer = layer
            .chunks_exact(2)
            .map(|p| pair_hash(&p[0], &p[1]))
            .collect();
        covered *= 2;
    }
    layer
}

fn fold_to_root(leaves: &[[u8; 32]]) -> [u8; 32] {
    let mut layer = leaves.to_vec();
    while layer.len() > 1 {
        layer = layer
            .chunks_exact(2)
            .map(|p| pair_hash(&p[0], &p[1]))
            .collect();
    }
    layer.first().copied().unwrap_or_else(pad_hash)
}

// --- parsing, for round-trip verification -------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedFile {
    pub length: u64,
    pub pieces_root: Option<[u8; 32]>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTorrent {
    pub name: String,
    pub piece_length: u32,
    pub files: BTreeMap<String, ParsedFile>,
    pub piece_layers: BTreeMap<[u8; 32], Vec<[u8; 32]>>,
}

/// Parse a `.torrent` back into a structure `verify_against` can check. This
/// is deliberately not a general BEP 52 parser (no v1 hybrid fields, no
/// `announce-list`) — just enough to round-trip what [`export`] writes and
/// let a test prove the two agree.
pub fn parse(bytes: &[u8]) -> Result<ParsedTorrent, TorrentError> {
    let top = BValue::decode(bytes)?;
    let top = top
        .as_dict()
        .ok_or(TorrentError::Malformed("top-level value is not a dict"))?;
    let info = top
        .get(b"info".as_slice())
        .and_then(BValue::as_dict)
        .ok_or(TorrentError::Malformed("missing info dict"))?;

    let name_bytes = info
        .get(b"name".as_slice())
        .and_then(BValue::as_bytes)
        .ok_or(TorrentError::Malformed("missing name"))?;
    let name = String::from_utf8(name_bytes.to_vec())
        .map_err(|_| TorrentError::Malformed("name is not UTF-8"))?;

    let piece_length = info
        .get(b"piece length".as_slice())
        .and_then(BValue::as_int)
        .ok_or(TorrentError::Malformed("missing piece length"))?;
    let piece_length = u32::try_from(piece_length)
        .map_err(|_| TorrentError::Malformed("piece length out of range"))?;

    let file_tree = info
        .get(b"file tree".as_slice())
        .and_then(BValue::as_dict)
        .ok_or(TorrentError::Malformed("missing file tree"))?;
    let mut files = BTreeMap::new();
    walk_file_tree(file_tree, String::new(), &mut files)?;

    let mut piece_layers = BTreeMap::new();
    if let Some(layers) = top
        .get(b"piece layers".as_slice())
        .and_then(BValue::as_dict)
    {
        for (root_bytes, value) in layers {
            let root = to_hash32(root_bytes)?;
            let raw = value
                .as_bytes()
                .ok_or(TorrentError::Malformed("piece layer value is not bytes"))?;
            if raw.len() % 32 != 0 {
                return Err(TorrentError::Malformed(
                    "piece layer is not a multiple of 32 bytes",
                ));
            }
            let hashes = raw
                .chunks(32)
                .map(to_hash32)
                .collect::<Result<Vec<_>, _>>()?;
            piece_layers.insert(root, hashes);
        }
    }

    Ok(ParsedTorrent {
        name,
        piece_length,
        files,
        piece_layers,
    })
}

fn walk_file_tree(
    tree: &BTreeMap<Vec<u8>, BValue>,
    prefix: String,
    out: &mut BTreeMap<String, ParsedFile>,
) -> Result<(), TorrentError> {
    for (name_bytes, value) in tree {
        let name = String::from_utf8(name_bytes.clone())
            .map_err(|_| TorrentError::Malformed("path segment is not UTF-8"))?;
        let dict = value
            .as_dict()
            .ok_or(TorrentError::Malformed("file tree entry is not a dict"))?;

        if let Some(leaf) = dict.get(b"".as_slice()) {
            let leaf = leaf
                .as_dict()
                .ok_or(TorrentError::Malformed("file leaf is not a dict"))?;
            let length = leaf
                .get(b"length".as_slice())
                .and_then(BValue::as_int)
                .ok_or(TorrentError::Malformed("file leaf missing length"))?;
            let length =
                u64::try_from(length).map_err(|_| TorrentError::Malformed("negative length"))?;
            let pieces_root = match leaf.get(b"pieces root".as_slice()) {
                Some(v) => Some(to_hash32(
                    v.as_bytes()
                        .ok_or(TorrentError::Malformed("pieces root is not bytes"))?,
                )?),
                None => None,
            };
            let path = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            out.insert(
                path,
                ParsedFile {
                    length,
                    pieces_root,
                },
            );
        } else {
            let path = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            walk_file_tree(dict, path, out)?;
        }
    }
    Ok(())
}

fn to_hash32(bytes: &[u8]) -> Result<[u8; 32], TorrentError> {
    bytes
        .try_into()
        .map_err(|_| TorrentError::Malformed("expected a 32-byte hash"))
}

/// Check a parsed `.torrent` against the actual files it claims to describe:
/// recomputes every file's merkle tree from its real bytes and compares
/// against what parsing found. This is the round-trip half of "the piece
/// hashes match the files."
pub fn verify_against(
    parsed: &ParsedTorrent,
    files: &[TorrentFile<'_>],
) -> Result<(), TorrentError> {
    for f in files {
        let entry = parsed
            .files
            .get(f.path)
            .ok_or_else(|| TorrentError::MissingBytes(f.path.to_string()))?;
        if entry.length != f.bytes.len() as u64 {
            return Err(TorrentError::HashMismatch(f.path.to_string()));
        }

        let (root, layer) = file_merkle(f.bytes, parsed.piece_length as usize);
        if root != entry.pieces_root {
            return Err(TorrentError::HashMismatch(f.path.to_string()));
        }

        if let (Some(root), Some(layer_bytes)) = (root, layer) {
            let stored = parsed
                .piece_layers
                .get(&root)
                .ok_or(TorrentError::Malformed("missing piece layer entry"))?;
            let recomputed = layer_bytes
                .chunks(32)
                .map(to_hash32)
                .collect::<Result<Vec<_>, _>>()?;
            if stored != &recomputed {
                return Err(TorrentError::HashMismatch(f.path.to_string()));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_file_has_no_pieces_root() {
        let (root, layer) = file_merkle(b"", DEFAULT_PIECE_LENGTH as usize);
        assert!(root.is_none());
        assert!(layer.is_none());
    }

    #[test]
    fn a_file_smaller_than_one_piece_has_a_root_but_no_layer() {
        let (root, layer) = file_merkle(b"small judgment text", DEFAULT_PIECE_LENGTH as usize);
        assert!(root.is_some());
        assert!(layer.is_none());
    }

    #[test]
    fn a_file_spanning_multiple_pieces_has_root_and_layer() {
        let bytes = vec![7u8; DEFAULT_PIECE_LENGTH as usize * 3 + 100];
        let (root, layer) = file_merkle(&bytes, DEFAULT_PIECE_LENGTH as usize);
        assert!(root.is_some());
        let layer = layer.unwrap();
        assert_eq!(layer.len() % 32, 0);
        assert!(layer.len() / 32 >= 4); // padded up to the next power of two
    }

    #[test]
    fn invalid_piece_lengths_are_rejected() {
        assert_eq!(
            export("x", 100, &[]),
            Err(TorrentError::InvalidPieceLength(100))
        );
        assert_eq!(
            export("x", 1024, &[]),
            Err(TorrentError::InvalidPieceLength(1024))
        );
    }

    fn sample_files() -> Vec<(String, Vec<u8>)> {
        vec![
            (
                "documents/aaaa".to_string(),
                b"the first judgment, quite short".to_vec(),
            ),
            (
                "documents/bbbb".to_string(),
                vec![9u8; DEFAULT_PIECE_LENGTH as usize * 2 + 4096],
            ),
            ("graph/cccc".to_string(), b"edge list bytes".to_vec()),
            ("empty/dddd".to_string(), Vec::new()),
        ]
    }

    #[test]
    fn a_torrent_round_trips_and_piece_hashes_match_the_files() {
        let owned = sample_files();
        let files: Vec<TorrentFile<'_>> = owned
            .iter()
            .map(|(p, b)| TorrentFile { path: p, bytes: b })
            .collect();

        let torrent = export("molao-release-1", DEFAULT_PIECE_LENGTH, &files).unwrap();
        let parsed = parse(&torrent).unwrap();

        assert_eq!(parsed.name, "molao-release-1");
        assert_eq!(parsed.piece_length, DEFAULT_PIECE_LENGTH);
        assert_eq!(parsed.files.len(), files.len());

        verify_against(&parsed, &files).unwrap();
    }

    #[test]
    fn export_is_reproducible_with_no_creation_date() {
        let owned = sample_files();
        let files: Vec<TorrentFile<'_>> = owned
            .iter()
            .map(|(p, b)| TorrentFile { path: p, bytes: b })
            .collect();
        let a = export("molao-release-1", DEFAULT_PIECE_LENGTH, &files).unwrap();
        let b = export("molao-release-1", DEFAULT_PIECE_LENGTH, &files).unwrap();
        assert_eq!(a, b);
        assert_eq!(info_hash(&a).unwrap(), info_hash(&b).unwrap());
        // The raw bytes must not contain a "creation date" key at all.
        assert!(!a.windows(13).any(|w| w == b"creation date"));
    }

    #[test]
    fn tampering_with_a_file_after_export_fails_verification() {
        let owned = sample_files();
        let mut files: Vec<TorrentFile<'_>> = owned
            .iter()
            .map(|(p, b)| TorrentFile { path: p, bytes: b })
            .collect();
        let torrent = export("molao-release-1", DEFAULT_PIECE_LENGTH, &files).unwrap();
        let parsed = parse(&torrent).unwrap();

        let tampered = b"a different first judgment entirely, altered".to_vec();
        files[0] = TorrentFile {
            path: &owned[0].0,
            bytes: &tampered,
        };
        let err = verify_against(&parsed, &files).unwrap_err();
        assert!(matches!(err, TorrentError::HashMismatch(_)));
    }

    #[test]
    fn a_file_missing_from_the_torrent_is_rejected_not_panicking() {
        let owned = sample_files();
        let files: Vec<TorrentFile<'_>> = owned
            .iter()
            .map(|(p, b)| TorrentFile { path: p, bytes: b })
            .collect();
        let torrent = export("molao-release-1", DEFAULT_PIECE_LENGTH, &files).unwrap();
        let parsed = parse(&torrent).unwrap();

        let extra_bytes = b"not part of the release".to_vec();
        let extra = TorrentFile {
            path: "documents/not-in-torrent",
            bytes: &extra_bytes,
        };
        let err = verify_against(&parsed, &[extra]).unwrap_err();
        assert!(matches!(err, TorrentError::MissingBytes(_)));
    }

    #[test]
    fn export_release_uses_the_file_index() {
        let mut blobs = BTreeMap::new();
        blobs.insert("h1".to_string(), b"doc one".to_vec());
        blobs.insert("h2".to_string(), b"graph bytes".to_vec());
        let index = FileIndex {
            files: vec![
                crate::package::FileEntry {
                    hash: "h1".into(),
                    path: "documents/h1".into(),
                    size: 7,
                },
                crate::package::FileEntry {
                    hash: "h2".into(),
                    path: "graph/h2".into(),
                    size: 11,
                },
            ],
        };
        let torrent = export_release("release", DEFAULT_PIECE_LENGTH, &index, &blobs).unwrap();
        let parsed = parse(&torrent).unwrap();
        assert_eq!(parsed.files.len(), 2);
    }

    #[test]
    fn export_release_reports_a_missing_blob_instead_of_panicking() {
        let blobs = BTreeMap::new();
        let index = FileIndex {
            files: vec![crate::package::FileEntry {
                hash: "missing".into(),
                path: "documents/missing".into(),
                size: 1,
            }],
        };
        let err = export_release("release", DEFAULT_PIECE_LENGTH, &index, &blobs).unwrap_err();
        assert!(matches!(err, TorrentError::MissingBytes(_)));
    }

    #[test]
    fn garbage_torrent_bytes_are_rejected_not_panicking() {
        assert!(parse(b"not bencode").is_err());
        assert!(parse(&BValue::Int(1).encode()).is_err());
    }
}
