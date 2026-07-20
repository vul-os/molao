//! The difference between two releases, as content hashes.
//!
//! A node that already holds release N and wants release N+1 does not need
//! N+1's full file set. A release only adds and occasionally corrects
//! judgments; most documents carry over byte-for-byte. Diffing two
//! [`FileIndex`]es by hash — not by path, since a path can be reused for
//! different content but a content hash cannot — tells a node exactly which
//! blobs it is missing and which it can now drop, over any transport,
//! without either side inspecting judgment content or trusting the other's
//! bookkeeping. This is what makes incremental sync possible at all in a
//! network with no central index of "who has what."

use crate::package::{FileEntry, FileIndex};
use std::collections::BTreeSet;

/// What changed between an old release's file set and a new one.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReleaseDelta {
    /// Present in the new release, absent from the old one — what a node
    /// holding only the old release must fetch to reach the new one.
    pub added: Vec<FileEntry>,
    /// Present in the old release, absent from the new one — safe to
    /// garbage-collect once the new release is adopted, for a node that has
    /// no reason to keep serving the old one to peers still on it.
    pub removed: Vec<FileEntry>,
}

impl ReleaseDelta {
    pub fn added_bytes(&self) -> u64 {
        self.added.iter().map(|f| f.size).sum()
    }

    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.removed.is_empty()
    }
}

/// Compute the delta from `old` to `new`.
pub fn delta(old: &FileIndex, new: &FileIndex) -> ReleaseDelta {
    let old_hashes: BTreeSet<&str> = old.files.iter().map(|f| f.hash.as_str()).collect();
    let new_hashes: BTreeSet<&str> = new.files.iter().map(|f| f.hash.as_str()).collect();

    let added = new
        .files
        .iter()
        .filter(|f| !old_hashes.contains(f.hash.as_str()))
        .cloned()
        .collect();
    let removed = old
        .files
        .iter()
        .filter(|f| !new_hashes.contains(f.hash.as_str()))
        .cloned()
        .collect();

    ReleaseDelta { added, removed }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(hash: &str, path: &str, size: u64) -> FileEntry {
        FileEntry {
            hash: hash.to_string(),
            path: path.to_string(),
            size,
        }
    }

    fn toy_release_n() -> FileIndex {
        FileIndex {
            files: vec![
                entry("h1", "documents/h1", 100),
                entry("h2", "documents/h2", 200),
                entry("hg", "graph/hg", 50),
            ],
        }
    }

    fn toy_release_n_plus_1() -> FileIndex {
        FileIndex {
            files: vec![
                entry("h1", "documents/h1", 100), // unchanged, carries over
                entry("h3", "documents/h3", 300), // new document
                entry("hg2", "graph/hg2", 60),    // regenerated graph
            ],
        }
    }

    #[test]
    fn delta_finds_added_and_removed_by_hash() {
        let d = delta(&toy_release_n(), &toy_release_n_plus_1());
        let added_hashes: BTreeSet<&str> = d.added.iter().map(|f| f.hash.as_str()).collect();
        let removed_hashes: BTreeSet<&str> = d.removed.iter().map(|f| f.hash.as_str()).collect();
        assert_eq!(added_hashes, BTreeSet::from(["h3", "hg2"]));
        assert_eq!(removed_hashes, BTreeSet::from(["h2", "hg"]));
    }

    #[test]
    fn unchanged_files_are_neither_added_nor_removed() {
        let d = delta(&toy_release_n(), &toy_release_n_plus_1());
        assert!(!d.added.iter().any(|f| f.hash == "h1"));
        assert!(!d.removed.iter().any(|f| f.hash == "h1"));
    }

    #[test]
    fn identical_releases_have_an_empty_delta() {
        let d = delta(&toy_release_n(), &toy_release_n());
        assert!(d.is_empty());
    }

    #[test]
    fn added_bytes_sums_only_the_added_files() {
        let d = delta(&toy_release_n(), &toy_release_n_plus_1());
        assert_eq!(d.added_bytes(), 300 + 60);
    }

    #[test]
    fn a_path_reused_for_different_content_is_treated_as_changed() {
        // Same path, different hash: must show up as both added and
        // removed, never treated as "unchanged" just because the path
        // matches.
        let old = FileIndex {
            files: vec![entry("h-old", "documents/same-path", 10)],
        };
        let new = FileIndex {
            files: vec![entry("h-new", "documents/same-path", 20)],
        };
        let d = delta(&old, &new);
        assert_eq!(d.added, vec![entry("h-new", "documents/same-path", 20)]);
        assert_eq!(d.removed, vec![entry("h-old", "documents/same-path", 10)]);
    }
}
