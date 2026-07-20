//! The index store: chunks, vectors, and a chunk-level FTS5 index in one
//! SQLite file, plus hybrid retrieval over them.
//!
//! # Why a sidecar SQLite file
//!
//! A node already *is* a SQLite file, so the most natural place for an index is
//! another one right next to it. The corpus database is the verifiable artifact
//! and stays untouched; the index is a separate file that can be deleted and
//! rebuilt at any time without risk to the corpus. That separation is the
//! design made physical: the signed thing and the unsigned cache are different
//! files, and nothing in the corpus depends on the index existing.
//!
//! # Why exact cosine, not an ANN index
//!
//! A legal-commons corpus is small — thousands of judgments, tens of thousands
//! of paragraph chunks. Brute-force cosine over that is sub-millisecond, and it
//! is *exact and deterministic*. An approximate-nearest-neighbour index would
//! add a second source of non-reproducibility (graph build order) on top of the
//! one we cannot remove (float inference), which would weaken the
//! rebuild-and-check verification story for no speed that matters at this scale.
//! If a corpus ever grows past what exact search handles, an ANN index is a
//! drop-in behind this same interface — but it is not needed now, and adding it
//! now would be complexity that makes the cache harder to verify.
//!
//! # Hybrid retrieval
//!
//! Keyword (FTS5 bm25) and vector (cosine) each produce a ranked list, and the
//! two are fused by Reciprocal Rank Fusion. RRF needs no score calibration
//! between the two very different scales, which is exactly the property we want:
//! bm25 scores and cosine similarities are not comparable numbers, but their
//! *ranks* are.

use crate::chunk::{Chunk, CHUNKER_ID, CHUNKER_PARAMS};
use crate::descriptor::{IndexDescriptor, METRIC_COSINE, NORMALIZATION_UNIT_L2, QUANTIZATION_NONE};
use crate::embed::{normalize, Embedder};
use crate::error::{IndexError, Result};
use molao_corpus::Corpus;
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

/// Schema version of the index file. Independent of the corpus schema — the
/// index is its own thing with its own lifecycle.
const SCHEMA_VERSION: i64 = 1;

/// The RRF constant. 60 is the value from the original RRF paper and the de
/// facto default; it damps the influence of any single list's top ranks so a
/// document strong in both lists beats one that merely tops one.
const RRF_K: f64 = 60.0;

/// How many candidates to pull from each list before fusing. Generous relative
/// to `k`, so a document ranked modestly in both lists can still surface above
/// one ranked highly in only one.
fn candidate_count(k: usize) -> usize {
    (k * 8).max(64)
}

/// A descriptor as stored, with the counts a status view needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredDescriptor {
    /// The descriptor itself.
    pub descriptor: IndexDescriptor,
    /// Its model-space id (see [`IndexDescriptor::descriptor_id`]).
    pub descriptor_id: String,
    /// Number of chunks indexed under it.
    pub chunk_count: u64,
    /// When the index was last built, RFC 3339.
    pub built_at: String,
}

/// Which retrieval paths actually ran for a query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetrievalMode {
    /// Both keyword and vector contributed. The normal case.
    Hybrid,
    /// Only keyword search ran — no query embedder was available for this
    /// descriptor. Honestly reported, never silently degraded.
    KeywordOnly,
    /// Only vector search ran — the query had no keyword terms.
    VectorOnly,
}

impl RetrievalMode {
    /// A stable string for the API payload.
    pub fn as_str(self) -> &'static str {
        match self {
            RetrievalMode::Hybrid => "hybrid",
            RetrievalMode::KeywordOnly => "keyword-only",
            RetrievalMode::VectorOnly => "vector-only",
        }
    }
}

/// One retrieved chunk.
#[derive(Debug, Clone, PartialEq)]
pub struct RagHit {
    /// Hex `DocId` of the judgment the chunk belongs to.
    pub doc_id: String,
    /// Zero-based paragraph index — the pinpoint into the judgment.
    pub para_index: u32,
    /// Printed paragraph number, if any.
    pub para_number: Option<String>,
    /// The chunk text.
    pub text: String,
    /// Fused RRF score. Higher is better.
    pub score: f64,
    /// Cosine similarity to the query, if the vector path ran.
    pub vector_score: Option<f32>,
    /// One-based rank in the keyword list, if it appeared there.
    pub keyword_rank: Option<usize>,
    /// One-based rank in the vector list, if it appeared there.
    pub vector_rank: Option<usize>,
}

/// The result of a hybrid search.
#[derive(Debug, Clone, PartialEq)]
pub struct RagResult {
    /// The descriptor whose space these results came from.
    pub descriptor: IndexDescriptor,
    /// Its id.
    pub descriptor_id: String,
    /// Which paths ran.
    pub mode: RetrievalMode,
    /// The ranked hits, best first.
    pub hits: Vec<RagHit>,
}

/// The index store: a SQLite file (or in-memory database) of chunks and vectors.
#[derive(Debug)]
pub struct Index {
    conn: Connection,
}

impl Index {
    /// Open (creating if needed) an index at `path`, applying migrations.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;
        migrate(&conn)?;
        Ok(Index { conn })
    }

    /// Open a private in-memory index. Used by `molao demo` when the corpus is
    /// in memory, and by tests.
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        migrate(&conn)?;
        Ok(Index { conn })
    }

    /// The conventional index path for a corpus database path: the same name
    /// with `.index` appended. Keeps the cache beside the corpus and obviously
    /// derived from it, so it is easy to find and safe to delete.
    pub fn sidecar_path(corpus_db: &Path) -> std::path::PathBuf {
        let mut name = corpus_db.as_os_str().to_os_string();
        name.push(".index");
        std::path::PathBuf::from(name)
    }

    /// Build (or rebuild) the index for a set of chunks with a chosen embedder,
    /// recording the descriptor.
    ///
    /// Rebuilds in place: any existing index under the same descriptor id is
    /// replaced wholesale, so re-running a build never accumulates stale
    /// vectors. A build under a *different* descriptor leaves other descriptors
    /// alone — several models coexist in one file.
    ///
    /// The dimension is taken from the vectors the embedder actually produced,
    /// not asserted in advance, so a remote model of unknown width still yields
    /// a correct descriptor. Every vector is L2-normalized before storage, so
    /// search can treat cosine as a dot product.
    pub fn build(
        &mut self,
        chunks: &[Chunk],
        embedder: &dyn Embedder,
        corpus_root: &str,
    ) -> Result<IndexDescriptor> {
        let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
        let mut vectors = embedder.embed(&texts)?;
        if vectors.len() != chunks.len() {
            return Err(IndexError::Embed(format!(
                "embedder returned {} vectors for {} chunks",
                vectors.len(),
                chunks.len()
            )));
        }

        // Dimension is whatever the model produced, and every vector must agree.
        let dim = vectors.first().map(|v| v.len()).unwrap_or(0);
        if dim == 0 && !chunks.is_empty() {
            return Err(IndexError::Embed(
                "embedder produced zero-dimensional vectors".into(),
            ));
        }
        for v in &mut vectors {
            if v.len() != dim {
                return Err(IndexError::Embed(format!(
                    "embedder returned vectors of differing dimension ({} vs {dim})",
                    v.len()
                )));
            }
            normalize(v);
        }

        let fragment = embedder.fragment();
        let descriptor = IndexDescriptor {
            embedder_id: fragment.embedder_id,
            model_version: fragment.model_version,
            dim,
            metric: METRIC_COSINE.to_string(),
            quantization: QUANTIZATION_NONE.to_string(),
            normalization: NORMALIZATION_UNIT_L2.to_string(),
            chunker_id: CHUNKER_ID.to_string(),
            chunker_params: CHUNKER_PARAMS.to_string(),
            corpus_root: corpus_root.to_string(),
        };
        let descriptor_id = descriptor.descriptor_id();
        let built_at = now_rfc3339();
        let descriptor_json = serde_json::to_string(&descriptor)?;

        let tx = self.conn.transaction()?;
        // Drop any previous build of this descriptor, FTS rows first (by rowid,
        // which is the only reliable way to delete from an FTS5 table).
        {
            let mut old = tx.prepare("SELECT chunk_id FROM chunks WHERE descriptor_id = ?1")?;
            let ids: Vec<i64> = old
                .query_map([&descriptor_id], |r| r.get(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let mut del_fts = tx.prepare("DELETE FROM chunks_fts WHERE rowid = ?1")?;
            for id in ids {
                del_fts.execute([id])?;
            }
        }
        tx.execute(
            "DELETE FROM chunks WHERE descriptor_id = ?1",
            [&descriptor_id],
        )?;
        tx.execute(
            "DELETE FROM index_descriptors WHERE descriptor_id = ?1",
            [&descriptor_id],
        )?;

        {
            let mut ins_chunk = tx.prepare(
                "INSERT INTO chunks (descriptor_id, doc_id, para_index, para_number, text, vector) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            let mut ins_fts = tx.prepare(
                "INSERT INTO chunks_fts (rowid, text, descriptor_id) VALUES (?1, ?2, ?3)",
            )?;
            for (chunk, vector) in chunks.iter().zip(vectors.iter()) {
                ins_chunk.execute(rusqlite::params![
                    &descriptor_id,
                    &chunk.doc_id,
                    chunk.para_index,
                    &chunk.para_number,
                    &chunk.text,
                    vector_to_blob(vector),
                ])?;
                let rowid = tx.last_insert_rowid();
                ins_fts.execute(rusqlite::params![rowid, &chunk.text, &descriptor_id])?;
            }
        }

        tx.execute(
            "INSERT INTO index_descriptors \
               (descriptor_id, descriptor_json, corpus_root, dim, chunk_count, built_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                &descriptor_id,
                &descriptor_json,
                &descriptor.corpus_root,
                dim as i64,
                chunks.len() as i64,
                &built_at,
            ],
        )?;

        tx.commit()?;
        tracing::info!(
            descriptor = %descriptor_id,
            chunks = chunks.len(),
            dim,
            "built index"
        );
        Ok(descriptor)
    }

    /// Build the index straight from a corpus, chunking its paragraphs.
    ///
    /// The convenience the CLI uses: pulls the corpus's paragraphs and current
    /// `corpus_root`, chunks, and builds. The `corpus_root` it records is the
    /// one the corpus reports *now*, which is what staleness is later checked
    /// against.
    pub fn build_from_corpus(
        &mut self,
        corpus: &Corpus,
        embedder: &dyn Embedder,
    ) -> Result<IndexDescriptor> {
        let rows = corpus.paragraphs()?;
        let chunks = crate::chunk::chunk_paragraphs(&rows);
        let corpus_root = corpus.corpus_root()?;
        self.build(&chunks, embedder, &corpus_root)
    }

    /// Every descriptor present in the index.
    pub fn descriptors(&self) -> Result<Vec<StoredDescriptor>> {
        let mut stmt = self.conn.prepare(
            "SELECT descriptor_id, descriptor_json, chunk_count, built_at \
             FROM index_descriptors ORDER BY built_at, descriptor_id",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut out = Vec::with_capacity(rows.len());
        for (id, json, count, built_at) in rows {
            let descriptor: IndexDescriptor = serde_json::from_str(&json)?;
            out.push(StoredDescriptor {
                descriptor,
                descriptor_id: id,
                chunk_count: count.max(0) as u64,
                built_at,
            });
        }
        Ok(out)
    }

    /// The one stored descriptor, if the index holds exactly one — the default
    /// a query with no explicit `model` uses.
    pub fn sole_descriptor(&self) -> Result<Option<StoredDescriptor>> {
        let mut all = self.descriptors()?;
        Ok(if all.len() == 1 { all.pop() } else { None })
    }

    /// A specific descriptor by id.
    pub fn descriptor(&self, descriptor_id: &str) -> Result<Option<StoredDescriptor>> {
        Ok(self
            .descriptors()?
            .into_iter()
            .find(|d| d.descriptor_id == descriptor_id))
    }

    /// Hybrid search within one descriptor's space.
    ///
    /// `query_vec` is the query already embedded in this descriptor's model —
    /// the caller is responsible for using the *right* embedder, and this method
    /// enforces it: a query vector whose dimension does not match the descriptor
    /// is refused with [`IndexError::DimMismatch`] rather than scored against the
    /// wrong space. Pass `None` to run keyword-only (an honest degradation when
    /// no embedder is available), and `query_text` drives the keyword side
    /// regardless.
    pub fn search(
        &self,
        descriptor_id: &str,
        query_text: &str,
        query_vec: Option<&[f32]>,
        k: usize,
    ) -> Result<RagResult> {
        let stored = self
            .descriptor(descriptor_id)?
            .ok_or_else(|| IndexError::NoSuchDescriptor(descriptor_id.to_string()))?;

        // The space check. This is the guard the threat model asks for: a query
        // in the wrong space is refused, never silently answered.
        if let Some(v) = query_vec {
            if v.len() != stored.descriptor.dim {
                return Err(IndexError::DimMismatch {
                    descriptor: descriptor_id.to_string(),
                    expected: stored.descriptor.dim,
                    got: v.len(),
                });
            }
        }

        let k = k.clamp(1, 100);
        let cand = candidate_count(k);

        // Metadata for every candidate we might return, keyed by chunk id.
        let mut meta: HashMap<i64, ChunkMeta> = HashMap::new();

        // ---- keyword list ------------------------------------------------
        let keyword: Vec<i64> = match molao_corpus::sanitise_query(query_text) {
            Some(expr) => self.keyword_candidates(descriptor_id, &expr, cand, &mut meta)?,
            None => Vec::new(),
        };
        let has_keywords = !keyword.is_empty();

        // ---- vector list -------------------------------------------------
        let mut vector_scores: HashMap<i64, f32> = HashMap::new();
        let vector: Vec<i64> = match query_vec {
            Some(v) => {
                let mut normed = v.to_vec();
                normalize(&mut normed);
                self.vector_candidates(descriptor_id, &normed, cand, &mut meta, &mut vector_scores)?
            }
            None => Vec::new(),
        };
        let has_vectors = query_vec.is_some();

        let mode = match (has_vectors, has_keywords || query_vec.is_none()) {
            (true, _) if !has_keywords => RetrievalMode::VectorOnly,
            (true, _) => RetrievalMode::Hybrid,
            (false, _) => RetrievalMode::KeywordOnly,
        };

        // ---- reciprocal rank fusion --------------------------------------
        let mut fused: HashMap<i64, FusedEntry> = HashMap::new();
        for (rank, id) in keyword.iter().enumerate() {
            let e = fused.entry(*id).or_default();
            e.score += 1.0 / (RRF_K + (rank + 1) as f64);
            e.keyword_rank = Some(rank + 1);
        }
        for (rank, id) in vector.iter().enumerate() {
            let e = fused.entry(*id).or_default();
            e.score += 1.0 / (RRF_K + (rank + 1) as f64);
            e.vector_rank = Some(rank + 1);
            e.vector_score = vector_scores.get(id).copied();
        }

        let mut ranked: Vec<(i64, FusedEntry)> = fused.into_iter().collect();
        // Sort by fused score desc, then by a stable tiebreak so results are
        // reproducible: doc id then paragraph index.
        ranked.sort_by(|(ia, a), (ib, b)| {
            b.score
                .total_cmp(&a.score)
                .then_with(|| tiebreak(&meta, *ia, *ib))
        });
        ranked.truncate(k);

        let hits = ranked
            .into_iter()
            .filter_map(|(id, e)| {
                meta.get(&id).map(|m| RagHit {
                    doc_id: m.doc_id.clone(),
                    para_index: m.para_index,
                    para_number: m.para_number.clone(),
                    text: m.text.clone(),
                    score: e.score,
                    vector_score: e.vector_score,
                    keyword_rank: e.keyword_rank,
                    vector_rank: e.vector_rank,
                })
            })
            .collect();

        Ok(RagResult {
            descriptor: stored.descriptor,
            descriptor_id: stored.descriptor_id,
            mode,
            hits,
        })
    }

    /// Keyword candidates: bm25-ranked chunk ids for the descriptor.
    fn keyword_candidates(
        &self,
        descriptor_id: &str,
        expr: &str,
        limit: usize,
        meta: &mut HashMap<i64, ChunkMeta>,
    ) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.chunk_id, c.doc_id, c.para_index, c.para_number, c.text \
             FROM chunks_fts f JOIN chunks c ON c.chunk_id = f.rowid \
             WHERE chunks_fts MATCH ?1 AND f.descriptor_id = ?2 \
             ORDER BY bm25(chunks_fts), c.chunk_id \
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(rusqlite::params![expr, descriptor_id, limit as i64], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                ChunkMeta {
                    doc_id: r.get(1)?,
                    para_index: r.get(2)?,
                    para_number: r.get(3)?,
                    text: r.get(4)?,
                },
            ))
        })?;
        let mut ids = Vec::new();
        for row in rows {
            let (id, m) = row?;
            meta.entry(id).or_insert(m);
            ids.push(id);
        }
        Ok(ids)
    }

    /// Vector candidates: exact cosine over every chunk of the descriptor,
    /// top-`limit` by similarity. Records the similarity of each candidate.
    fn vector_candidates(
        &self,
        descriptor_id: &str,
        query: &[f32],
        limit: usize,
        meta: &mut HashMap<i64, ChunkMeta>,
        scores: &mut HashMap<i64, f32>,
    ) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT chunk_id, doc_id, para_index, para_number, text, vector \
             FROM chunks WHERE descriptor_id = ?1",
        )?;
        let rows = stmt.query_map([descriptor_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                ChunkMeta {
                    doc_id: r.get(1)?,
                    para_index: r.get(2)?,
                    para_number: r.get(3)?,
                    text: r.get(4)?,
                },
                r.get::<_, Vec<u8>>(5)?,
            ))
        })?;

        let mut scored: Vec<(i64, f32)> = Vec::new();
        for row in rows {
            let (id, m, blob) = row?;
            let vector = blob_to_vector(&blob);
            // Vectors are unit-normalized at build and the query is normalized
            // by the caller, so a dot product is the cosine similarity.
            let sim = dot(query, &vector);
            scores.insert(id, sim);
            meta.entry(id).or_insert(m);
            scored.push((id, sim));
        }
        // Descending similarity, stable tiebreak on id for reproducibility.
        scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        scored.truncate(limit);
        Ok(scored.into_iter().map(|(id, _)| id).collect())
    }
}

/// Metadata carried alongside a chunk id through fusion.
#[derive(Debug, Clone)]
struct ChunkMeta {
    doc_id: String,
    para_index: u32,
    para_number: Option<String>,
    text: String,
}

/// Accumulator for one chunk across the two ranked lists.
#[derive(Debug, Clone, Default)]
struct FusedEntry {
    score: f64,
    keyword_rank: Option<usize>,
    vector_rank: Option<usize>,
    vector_score: Option<f32>,
}

fn tiebreak(meta: &HashMap<i64, ChunkMeta>, a: i64, b: i64) -> std::cmp::Ordering {
    match (meta.get(&a), meta.get(&b)) {
        (Some(ma), Some(mb)) => ma
            .doc_id
            .cmp(&mb.doc_id)
            .then(ma.para_index.cmp(&mb.para_index)),
        _ => a.cmp(&b),
    }
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn vector_to_blob(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

fn blob_to_vector(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// Apply the index schema. Idempotent; runs on every open.
fn migrate(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS index_meta (schema_version INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS index_descriptors (
             descriptor_id   TEXT PRIMARY KEY,
             descriptor_json TEXT NOT NULL,
             corpus_root     TEXT NOT NULL,
             dim             INTEGER NOT NULL,
             chunk_count     INTEGER NOT NULL,
             built_at        TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS chunks (
             chunk_id       INTEGER PRIMARY KEY,
             descriptor_id  TEXT NOT NULL,
             doc_id         TEXT NOT NULL,
             para_index     INTEGER NOT NULL,
             para_number    TEXT,
             text           TEXT NOT NULL,
             vector         BLOB NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_chunks_descriptor ON chunks(descriptor_id);
         CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
             text,
             descriptor_id UNINDEXED,
             tokenize = 'unicode61 remove_diacritics 2'
         );",
    )?;
    let has_version: Option<i64> = conn
        .query_row("SELECT schema_version FROM index_meta LIMIT 1", [], |r| {
            r.get(0)
        })
        .optional()?;
    if has_version.is_none() {
        conn.execute(
            "INSERT INTO index_meta (schema_version) VALUES (?1)",
            [SCHEMA_VERSION],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embed::FakeEmbedder;

    fn chunk(doc: &str, idx: u32, text: &str) -> Chunk {
        Chunk {
            doc_id: doc.into(),
            para_index: idx,
            para_number: Some((idx + 1).to_string()),
            text: text.into(),
        }
    }

    /// A small, realistic-shaped set of chunks across two topics.
    fn corpus_chunks() -> Vec<Chunk> {
        vec![
            chunk("aa", 0, "The eviction of occupiers from municipal land must be just and equitable."),
            chunk("aa", 1, "A court granting an eviction exercises public power and must consider the circumstances of the occupiers."),
            chunk("bb", 0, "Interpretation of a contract is a unitary exercise of text, context, and purpose."),
            chunk("bb", 1, "Context illuminates the words chosen but does not license rewriting the clause."),
            chunk("cc", 0, "Deprivation of liberty by arrest is presumptively unlawful and must be justified."),
        ]
    }

    fn built() -> (Index, String) {
        let mut index = Index::open_in_memory().unwrap();
        let d = index
            .build(&corpus_chunks(), &FakeEmbedder::new(256), &"aa".repeat(32))
            .unwrap();
        (index, d.descriptor_id())
    }

    #[test]
    fn a_hybrid_search_ranks_the_on_topic_chunk_first() {
        let (index, id) = built();
        let embedder = FakeEmbedder::new(256);
        let qv = &embedder
            .embed(&["eviction of occupiers".to_string()])
            .unwrap()[0];
        let res = index
            .search(&id, "eviction of occupiers", Some(qv), 5)
            .unwrap();
        assert_eq!(res.mode, RetrievalMode::Hybrid);
        assert!(!res.hits.is_empty());
        // The top hit must be one of the two eviction paragraphs, not a contract
        // or arrest one.
        assert_eq!(res.hits[0].doc_id, "aa");
    }

    #[test]
    fn keyword_and_vector_both_populate_ranks() {
        let (index, id) = built();
        let embedder = FakeEmbedder::new(256);
        let qv = &embedder
            .embed(&["interpretation of a contract".to_string()])
            .unwrap()[0];
        let res = index
            .search(&id, "interpretation contract", Some(qv), 5)
            .unwrap();
        let top = &res.hits[0];
        assert_eq!(top.doc_id, "bb");
        assert!(
            top.keyword_rank.is_some(),
            "keyword rank should be recorded"
        );
        assert!(top.vector_rank.is_some(), "vector rank should be recorded");
        assert!(top.vector_score.is_some());
    }

    #[test]
    fn keyword_only_search_still_works_without_a_query_vector() {
        let (index, id) = built();
        let res = index.search(&id, "arrest liberty", None, 5).unwrap();
        assert_eq!(res.mode, RetrievalMode::KeywordOnly);
        assert_eq!(res.hits[0].doc_id, "cc");
        assert!(res.hits[0].vector_score.is_none());
    }

    #[test]
    fn a_query_in_the_wrong_dimension_is_refused_not_answered() {
        // The core threat-model guard: never score a query against the wrong
        // space. A 128-d query against a 256-d index must error, not return
        // confident nonsense.
        let (index, id) = built();
        let wrong = vec![0.1f32; 128];
        let err = index.search(&id, "eviction", Some(&wrong), 5).unwrap_err();
        assert!(matches!(
            err,
            IndexError::DimMismatch {
                expected: 256,
                got: 128,
                ..
            }
        ));
    }

    #[test]
    fn an_unknown_descriptor_is_an_error() {
        let (index, _) = built();
        let err = index
            .search(&"00".repeat(32), "eviction", None, 5)
            .unwrap_err();
        assert!(matches!(err, IndexError::NoSuchDescriptor(_)));
    }

    #[test]
    fn multiple_descriptors_coexist_and_are_searched_independently() {
        let mut index = Index::open_in_memory().unwrap();
        let a = index
            .build(&corpus_chunks(), &FakeEmbedder::new(64), &"aa".repeat(32))
            .unwrap();
        let b = index
            .build(&corpus_chunks(), &FakeEmbedder::new(256), &"aa".repeat(32))
            .unwrap();
        assert_ne!(a.descriptor_id(), b.descriptor_id());

        let descriptors = index.descriptors().unwrap();
        assert_eq!(descriptors.len(), 2, "both models must be present");
        for d in &descriptors {
            assert_eq!(d.chunk_count, corpus_chunks().len() as u64);
        }

        // Each is searchable in its own dimension.
        for (d, dim) in [(&a, 64usize), (&b, 256usize)] {
            let qv = &FakeEmbedder::new(dim)
                .embed(&["eviction".to_string()])
                .unwrap()[0];
            let res = index
                .search(&d.descriptor_id(), "eviction", Some(qv), 3)
                .unwrap();
            assert!(!res.hits.is_empty());
        }
    }

    #[test]
    fn rebuilding_the_same_descriptor_replaces_rather_than_duplicates() {
        let mut index = Index::open_in_memory().unwrap();
        let d = index
            .build(&corpus_chunks(), &FakeEmbedder::new(64), &"aa".repeat(32))
            .unwrap();
        // Rebuild against a changed corpus_root: same descriptor id, updated root.
        let d2 = index
            .build(&corpus_chunks(), &FakeEmbedder::new(64), &"bb".repeat(32))
            .unwrap();
        assert_eq!(d.descriptor_id(), d2.descriptor_id());
        let all = index.descriptors().unwrap();
        assert_eq!(all.len(), 1, "rebuild must not create a second descriptor");
        assert_eq!(all[0].chunk_count, corpus_chunks().len() as u64);
        assert_eq!(all[0].descriptor.corpus_root, "bb".repeat(32));
    }

    #[test]
    fn staleness_is_detected_against_a_changed_corpus_root() {
        let (index, id) = built();
        let stored = index.descriptor(&id).unwrap().unwrap();
        assert!(!stored.descriptor.is_stale_against(&"aa".repeat(32)));
        assert!(stored.descriptor.is_stale_against(&"cc".repeat(32)));
    }

    #[test]
    fn a_hostile_query_never_errors_on_the_keyword_side() {
        let (index, id) = built();
        for q in [
            "'; DROP TABLE chunks; --",
            "NEAR(a b, 99999)",
            "(((((",
            "title:*",
            "\"unterminated",
        ] {
            let res = index.search(&id, q, None, 5);
            assert!(res.is_ok(), "query {q:?} errored: {res:?}");
        }
    }

    #[test]
    fn an_empty_index_searches_to_nothing_not_a_panic() {
        let mut index = Index::open_in_memory().unwrap();
        let d = index
            .build(&[], &FakeEmbedder::new(64), &"aa".repeat(32))
            .unwrap();
        // A zero-chunk build records the descriptor at the embedder's own dim.
        let res = index
            .search(&d.descriptor_id(), "anything", None, 5)
            .unwrap();
        assert!(res.hits.is_empty());
    }

    #[test]
    fn vectors_round_trip_through_the_blob_encoding() {
        let v = vec![0.0f32, 1.0, -0.5, 123.456];
        assert_eq!(blob_to_vector(&vector_to_blob(&v)), v);
    }

    #[test]
    fn the_index_persists_to_a_file_and_reopens() {
        let dir = std::env::temp_dir().join(format!("molao-index-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("c.db.index");

        let id = {
            let mut index = Index::open(&path).unwrap();
            index
                .build(&corpus_chunks(), &FakeEmbedder::new(64), &"aa".repeat(32))
                .unwrap()
                .descriptor_id()
        };
        // Reopen and search — the vectors and FTS must have survived.
        let index = Index::open(&path).unwrap();
        let res = index.search(&id, "eviction", None, 5).unwrap();
        assert!(!res.hits.is_empty());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn sidecar_path_is_the_corpus_path_plus_index() {
        let p = Index::sidecar_path(Path::new("/data/molao.db"));
        assert_eq!(p, Path::new("/data/molao.db.index"));
    }
}
