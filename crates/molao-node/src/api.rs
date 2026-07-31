//! The read-only HTTP API, and the router that serves it alongside the UI.
//!
//! # Shape of the thing
//!
//! Everything here is a `GET`. There is no authentication, no session, no
//! cookie, and no write path — not as a simplification to be revisited, but
//! because this is public law and a node that could be written to over HTTP
//! would be a node whose corpus you could not trust. Ingest happens through the
//! CLI, against a database file, by whoever holds the file.
//!
//! CORS is permissive for the same reason. Anyone may embed, mirror, or query a
//! node from anywhere; there is nothing to protect from cross-origin reads
//! because there is nothing here that is not already public.
//!
//! # Never 500 on user input
//!
//! A malformed id, an absurd `depth`, a query full of FTS5 operators, a
//! negative offset — all of them are 404 or a clamped value, never a 500. The
//! only 500s that can escape are genuine internal failures (a corrupt database),
//! and they carry no detail, because the error text of a failed query is not
//! something to hand a stranger.
//!
//! # Honest status in the payload
//!
//! [`status`] reports `verified` — and it reports `false` when no release and
//! signer set have been loaded, rather than omitting the field or defaulting to
//! something reassuring. The node verifies *bytes and signatures*. It has no
//! opinion about whether a judgment is good law, and no field here should ever
//! be read as claiming otherwise.
//!
//! # Two layers, and the payload keeps them apart
//!
//! `/api/case/{id}/treatment` returns two sibling objects that never mix.
//!
//! `mechanical` is who cited whom, at which paragraph. It is extracted from the
//! text by a pinned extractor and **recomputable**: anyone holding the same
//! judgments derives the same edges, which is why the citation graph can be
//! checked rather than believed.
//!
//! `interpretive` is what somebody *says* those citations mean. It is not
//! recomputable and never will be, so every claim in it carries the key that
//! signed it, that signature having been checked against those exact bytes at
//! read time. A client that flattened the two into one list would be
//! reintroducing the headnote problem the design exists to avoid, so they are
//! separate objects with separate `kind` tags rather than a flag on a row.
//!
//! Each attestation additionally reports whether the mechanical edge it talks
//! about is one this node actually holds. An attestation asserting that A
//! overruled B, where A does not cite B in the text here, is not suppressed —
//! it is shown, labelled, and left to the reader.
//!
//! # There is still no write path
//!
//! Attestations enter through the CLI against a database file, exactly like
//! judgments. Accepting a signed attestation over HTTP would be a write path,
//! and a node whose corpus a stranger can add to is a node whose corpus you
//! cannot trust — the signature on the attestation does not change that, it
//! only tells you who filled your disk.

use axum::extract::{Path, Query, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use molao_core::{DocId, ProvenanceClass, SignedRelease, SignerSet};
use molao_corpus::{Corpus, SearchFilters};
use molao_graph::treatment::{self, Conflict, TrustPolicy, Verified, VerifiedSet};
use molao_graph::Graph;
use molao_index::{HttpConfig, Index, IndexError};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

/// Everything a request handler needs.
///
/// The corpus is behind a `Mutex` because a `rusqlite::Connection` is not
/// `Sync`. Queries against a local SQLite file are sub-millisecond, so holding
/// the lock across one is cheap; if a node ever serves a corpus large enough
/// for that to matter, the fix is a connection pool rather than a redesign.
pub struct AppState {
    corpus: Mutex<Corpus>,
    graph: Graph,
    /// Computed once at startup — it scans every id, and it cannot change while
    /// the server is running because there is no write path.
    corpus_root: String,
    release: Option<SignedRelease>,
    signers: Option<SignerSet>,
    /// Whether the loaded release met its signer set's threshold. `false` when
    /// no release is loaded — absence of a claim, not a passed check.
    verified: bool,
    /// The optional RAG index. `None` when no index has been built — the node
    /// still serves keyword search and everything else, and `/api/rag/search`
    /// says plainly that no index is present rather than pretending to one.
    ///
    /// Behind a `Mutex` for the same reason as the corpus: a `rusqlite`
    /// connection is not `Sync`, and a query against a local file is quick
    /// enough that holding the lock across one is free.
    index: Option<Mutex<Index>>,
    /// Serve-time configuration for an OpenAI-compatible embedding endpoint,
    /// used to embed queries against an index built with the HTTP embedder. The
    /// node ships no model; this is how an operator points it at one. Absent for
    /// a fake-embedder index, which needs no configuration at all.
    http_embedder: Option<HttpConfig>,
    /// The node operator's own reading of which attestation signers to weigh.
    ///
    /// A *default*, never an authority: any request may replace it with
    /// `?trust=`, and the payload always says which of the two it used. Empty
    /// unless an operator sets one, because a signer list shipped by this
    /// project would make this project the authority that treatments exist to
    /// avoid needing.
    trust: TrustPolicy,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("nodes", &self.graph.nodes().len())
            .field("edges", &self.graph.edges().len())
            .field("verified", &self.verified)
            .field("has_index", &self.index.is_some())
            .finish_non_exhaustive()
    }
}

impl AppState {
    /// Build state from a corpus, computing the graph once.
    ///
    /// The graph is built at startup rather than per request: it is pure
    /// function of the corpus, the corpus cannot change while serving, and
    /// rebuilding it per request would make `/api/case/:id/graph` quadratic in
    /// traffic for no benefit.
    pub fn new(corpus: Corpus) -> molao_corpus::Result<Self> {
        let graph = Graph::build(&corpus)?;
        let corpus_root = corpus.corpus_root()?;
        Ok(AppState {
            corpus: Mutex::new(corpus),
            graph,
            corpus_root,
            release: None,
            signers: None,
            verified: false,
            index: None,
            http_embedder: None,
            trust: TrustPolicy::empty(),
        })
    }

    /// Set the node's default trust policy for treatment attestations.
    ///
    /// This is the operator saying "these are the signers *I* weigh", and it is
    /// reported to clients as `trust.source == "node"` so a reader can tell
    /// whose judgment they are looking through. A request that sends its own
    /// `?trust=` overrides it entirely rather than merging, because a merged
    /// policy would silently reintroduce the operator's weights into a reading
    /// the reader thought was theirs.
    ///
    /// **Not wired to the CLI.** Nothing loads a policy from a file today, so
    /// this is reachable only by code embedding the node.
    pub fn with_trust_policy(mut self, trust: TrustPolicy) -> Self {
        self.trust = trust;
        self
    }

    /// Attach a RAG index, and optionally the endpoint used to embed queries
    /// against it.
    ///
    /// The index is the unsigned, rebuildable cache described in `docs/RAG.md`.
    /// It is optional in every sense: the node runs and serves without one, and
    /// attaching one changes nothing about verification or the corpus. The
    /// `http` config is needed only when the index was built with a remote model
    /// — a fake-embedder index reconstructs its query embedder from the
    /// descriptor and needs no configuration.
    pub fn with_index(mut self, index: Index, http: Option<HttpConfig>) -> Self {
        self.index = Some(Mutex::new(index));
        self.http_embedder = http;
        self
    }

    /// Attach a release and its signer set, recording whether it verifies.
    ///
    /// Verification failure is not an error here: a node that refused to start
    /// because its release did not verify would be a node that cannot show a
    /// reader that something is wrong. It serves, and it reports
    /// `verified: false`.
    pub fn with_release(mut self, release: SignedRelease, signers: SignerSet) -> Self {
        self.verified = match release.verify(&signers) {
            Ok(count) => {
                tracing::info!(signatures = count, "release verified");
                true
            }
            Err(e) => {
                tracing::warn!(error = %e, "release did NOT verify; serving it as unverified");
                false
            }
        };
        self.release = Some(release);
        self.signers = Some(signers);
        self
    }

    fn corpus(&self) -> std::sync::MutexGuard<'_, Corpus> {
        // A poisoned lock means a handler panicked mid-query. The data is a
        // read-only SQLite file that the panic cannot have corrupted, so
        // recovering beats taking the whole node down.
        self.corpus.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// An API error, rendered as `{ "error": "..." }` with a status.
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl ApiError {
    fn not_found(what: &str) -> Self {
        ApiError(StatusCode::NOT_FOUND, format!("no such {what}"))
    }

    /// An internal failure. The detail is logged, never returned — a stranger
    /// gets "internal error" and the operator gets the SQL.
    fn internal(e: impl std::fmt::Display) -> Self {
        tracing::error!(error = %e, "internal error serving a request");
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error".to_string(),
        )
    }
}

type ApiResult = Result<Json<Value>, ApiError>;

/// Build the router: the API, plus the embedded UI on everything else.
pub fn router(state: Arc<AppState>) -> Router {
    // Permissive, and only for reads. `Any` origin is correct for public law;
    // there are no credentials to leak because there are none at all.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::HEAD])
        .allow_headers(Any);

    Router::new()
        .route("/api/version", get(version))
        .route("/api/status", get(status))
        .route("/api/courts", get(courts))
        .route("/api/search", get(search))
        .route("/api/rag/search", get(rag_search))
        .route("/api/case/{id}", get(case))
        .route("/api/case/{id}/citations", get(case_citations))
        .route("/api/case/{id}/graph", get(case_graph))
        .route("/api/case/{id}/treatment", get(case_treatment))
        .route("/api/treatment/conflicts", get(treatment_conflicts))
        .fallback(get(crate::assets::serve))
        .layer(cors)
        .with_state(state)
}

/// `GET /api/version`
async fn version(State(state): State<Arc<AppState>>) -> ApiResult {
    Ok(Json(json!({
        "name": "molao",
        "version": env!("CARGO_PKG_VERSION"),
        "extractor_version": molao_cite::EXTRACTOR_VERSION,
        // Both halves of what makes a graph reproducible. The version pins the
        // grammar, the profile pins the registry it matched against; a client
        // comparing only the first would think two nodes agreed when they do
        // not. See molao_core::release::Manifest::region_profile.
        "region_profile": molao_cite::extraction_profile_fingerprint(),
        "region_profile_code": molao_cite::extraction_profile().code,
        "release": state.release.as_ref().map(|r| r.manifest.release),
        "corpus_root": if state.corpus_root.is_empty() { Value::Null } else { json!(state.corpus_root) },
    })))
}

/// `GET /api/status`
async fn status(State(state): State<Arc<AppState>>) -> ApiResult {
    let stats = state.corpus().stats().map_err(ApiError::internal)?;
    Ok(Json(json!({
        "docs": stats.docs,
        "edges": stats.edges,
        "unresolved": stats.unresolved,
        "release": state.release.as_ref().map(|r| r.manifest.release),
        "signers": state.signers.as_ref().map_or(0, |s| s.signers.len()),
        "threshold": state.signers.as_ref().map_or(0, |s| s.threshold),
        "provenance": {
            "corroborated": stats.corroborated,
            "single": stats.single,
            "manual": stats.manual,
        },
        "courts": stats.courts,
        // Which jurisdictions this corpus actually holds. Molao is
        // region-agnostic; a node may serve more than one profile at once.
        "regions": stats.regions.iter()
            .map(|(code, count)| json!({ "code": code, "doc_count": count }))
            .collect::<Vec<_>>(),
        "verified": state.verified,
        // What the interpretive layer holds. Separate from every count above
        // it, because everything above is recomputable from the corpus and
        // nothing here is.
        "treatments": treatment_status(&state),
        // The RAG index state. Reported honestly: which model-tagged descriptors
        // are present, how many chunks each holds, and — the load-bearing field —
        // whether each is stale against the corpus the node actually serves. A
        // stale index is one built from a different corpus_root; it must be
        // rebuilt before its results can be relied on. The index is never signed
        // and never part of a release; this block describes a local cache.
        "index": index_status(&state),
    })))
}

/// Build the `index` block of `/api/status`.
fn index_status(state: &AppState) -> Value {
    let Some(index) = &state.index else {
        return json!({
            "present": false,
            "descriptors": [],
            "note": "no local search index; run `molao index build` (or `molao demo`) to build one",
        });
    };
    let descriptors = match index
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .descriptors()
    {
        Ok(d) => d,
        // A failure reading the index must not take down the whole status page;
        // the corpus is what matters and it is fine.
        Err(e) => {
            tracing::error!(error = %e, "reading index descriptors for status");
            return json!({ "present": false, "descriptors": [], "note": "index present but unreadable" });
        }
    };
    json!({
        "present": true,
        "corpus_root": state.corpus_root,
        "descriptors": descriptors.iter().map(|d| json!({
            "descriptor_id": d.descriptor_id,
            "embedder_id": d.descriptor.embedder_id,
            "model_version": d.descriptor.model_version,
            "dim": d.descriptor.dim,
            "metric": d.descriptor.metric,
            "chunker_id": d.descriptor.chunker_id,
            "chunk_count": d.chunk_count,
            "built_at": d.built_at,
            "corpus_root": d.descriptor.corpus_root,
            "stale": d.descriptor.is_stale_against(&state.corpus_root),
        })).collect::<Vec<_>>(),
    })
}

/// `GET /api/courts`
async fn courts(State(state): State<Arc<AppState>>) -> ApiResult {
    let courts = state.corpus().courts().map_err(ApiError::internal)?;
    Ok(Json(json!(courts
        .into_iter()
        .map(|c| json!({
            "code": c.code,
            "name": c.name,
            "tier": c.tier,
            "seat": c.seat,
            "doc_count": c.doc_count,
        }))
        .collect::<Vec<_>>())))
}

/// Query parameters, taken as raw strings and parsed leniently.
///
/// Typed `serde` deserialisation is not used here, deliberately. Given
/// `?limit=abc`, a typed extractor rejects the whole request with a 400 and a
/// plain-text body — which breaks the contract that every error is
/// `{ "error": ... }` JSON, and means a stray character in a URL a user pasted
/// produces an error page instead of results.
///
/// So every parameter is read as a string and parsed with a fallback. A value
/// that makes no sense is treated as absent. Nothing a client can put in a
/// query string can turn into a 4xx.
type Params = std::collections::HashMap<String, String>;

fn param<'a>(params: &'a Params, key: &str) -> Option<&'a str> {
    params.get(key).map(|s| s.trim()).filter(|s| !s.is_empty())
}

/// Parse a numeric parameter, treating anything unparseable as absent.
fn number<T: std::str::FromStr>(params: &Params, key: &str) -> Option<T> {
    param(params, key)?.parse().ok()
}

/// `GET /api/search`
async fn search(State(state): State<Arc<AppState>>, Query(params): Query<Params>) -> ApiResult {
    let filters = SearchFilters {
        court: param(&params, "court").map(str::to_string),
        region: param(&params, "region").map(str::to_string),
        year_from: number(&params, "year_from"),
        year_to: number(&params, "year_to"),
    };
    // The corpus clamps the limit; 20 matches the documented default.
    let (total, hits) = state
        .corpus()
        .search(
            param(&params, "q").unwrap_or_default(),
            &filters,
            number(&params, "limit").unwrap_or(20),
            number(&params, "offset").unwrap_or(0),
        )
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "total": total,
        "hits": hits.into_iter().map(|h| json!({
            "id": h.id,
            "title": h.title,
            "court": h.court,
            "court_name": h.court_name,
            "region": h.region,
            "date": h.date,
            "neutral_citation": h.neutral_citation,
            "snippet": h.snippet,
            "authority": h.authority,
            "cited_by_count": h.cited_by_count,
        })).collect::<Vec<_>>(),
    })))
}

/// `GET /api/rag/search`
///
/// Hybrid retrieval over the local index: FTS5 keywords fused with cosine
/// vectors, returning chunks with the judgment id and paragraph index that make
/// each passage citable, plus the index descriptor the results came from — so a
/// client building a RAG prompt knows exactly which model's space it is reading.
///
/// `model` selects the descriptor (for a node holding several models at once);
/// omitted, it uses the most recently built. When no query embedder is available
/// for the chosen descriptor — a remote-model index on a node started without
/// the endpoint — retrieval falls back to keywords and says so in `retrieval`,
/// rather than returning results from the wrong space.
async fn rag_search(State(state): State<Arc<AppState>>, Query(params): Query<Params>) -> ApiResult {
    let query = param(&params, "q").unwrap_or_default().to_string();
    let k = number::<u32>(&params, "k").unwrap_or(5).clamp(1, 100) as usize;
    let requested_model = param(&params, "model");

    let Some(index_mutex) = &state.index else {
        // No index at all: not an error, but say plainly what is missing.
        return Ok(Json(json!({
            "query": query,
            "k": k,
            "hits": [],
            "descriptor": Value::Null,
            "retrieval": "none",
            "note": "no local search index; run `molao index build` (or `molao demo`)",
        })));
    };

    let index = index_mutex.lock().unwrap_or_else(|e| e.into_inner());

    // Choose the descriptor: the requested one, else the most recent.
    let stored = match requested_model {
        Some(id) => index
            .descriptor(id)
            .map_err(index_error)?
            .ok_or_else(|| ApiError::not_found("index descriptor"))?,
        None => index
            .descriptors()
            .map_err(index_error)?
            .pop()
            .ok_or_else(|| ApiError::not_found("index descriptor"))?,
    };

    // Embed the query in the descriptor's own space. A missing or failing
    // embedder is not a 500: it degrades to keyword-only, honestly labelled.
    let embedder = molao_index::query_embedder(
        &stored.descriptor.embedder_id,
        stored.descriptor.dim,
        state.http_embedder.as_ref(),
    );
    let query_vec: Option<Vec<f32>> =
        embedder.and_then(|e| match e.embed(std::slice::from_ref(&query)) {
            Ok(mut v) => v.pop(),
            Err(err) => {
                tracing::warn!(error = %err, "query embedding failed; serving keyword-only");
                None
            }
        });

    let result = index
        .search(&stored.descriptor_id, &query, query_vec.as_deref(), k)
        .map_err(index_error)?;
    drop(index);

    // Enrich each hit with just enough judgment metadata to render a result
    // without a second request; the full case is one hop away at /api/case/:id.
    let corpus = state.corpus();
    let meta: std::collections::HashMap<String, molao_corpus::NodeRow> = corpus
        .nodes()
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|n| (n.id.clone(), n))
        .collect();

    let hits = result
        .hits
        .iter()
        .map(|h| {
            let m = meta.get(&h.doc_id);
            let court = m.map(|m| m.court.clone()).unwrap_or_default();
            json!({
                "doc_id": h.doc_id,
                "para_index": h.para_index,
                "para_number": h.para_number,
                "title": m.map(|m| m.title.clone()),
                "court": court,
                "court_name": molao_core::court::lookup(&court).map(|c| c.name.to_string()),
                "region": m.map(|m| m.region.clone()),
                "date": m.and_then(|m| m.date.clone()),
                "text": h.text,
                "score": h.score,
                "vector_score": h.vector_score,
                "keyword_rank": h.keyword_rank,
                "vector_rank": h.vector_rank,
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({
        "query": query,
        "k": k,
        "retrieval": result.mode.as_str(),
        // The descriptor the results came from — the "which model" answer.
        "descriptor": {
            "descriptor_id": result.descriptor_id,
            "embedder_id": result.descriptor.embedder_id,
            "model_version": result.descriptor.model_version,
            "dim": result.descriptor.dim,
            "metric": result.descriptor.metric,
            "quantization": result.descriptor.quantization,
            "normalization": result.descriptor.normalization,
            "chunker_id": result.descriptor.chunker_id,
            "chunker_params": result.descriptor.chunker_params,
            "corpus_root": result.descriptor.corpus_root,
            "stale": result.descriptor.is_stale_against(&state.corpus_root),
        },
        "hits": hits,
    })))
}

/// Map an index failure onto an API error, distinguishing bad input from an
/// internal fault — a query for an absent descriptor is a 404, a wrong-space
/// vector or a broken embedder endpoint is a 400, and only a storage fault is a
/// 500 with no detail leaked.
fn index_error(e: IndexError) -> ApiError {
    match e {
        IndexError::NoSuchDescriptor(_) => ApiError::not_found("index descriptor"),
        IndexError::DimMismatch { .. } | IndexError::Http(_) | IndexError::Embed(_) => {
            ApiError(StatusCode::BAD_REQUEST, e.to_string())
        }
        IndexError::Db(_) | IndexError::Json(_) | IndexError::Corpus(_) => ApiError::internal(e),
    }
}

/// Parse a path id, treating anything malformed as "not found".
///
/// A 400 would be more literally accurate, but a garbage id and an id we do not
/// hold are the same thing to a reader, and 404 keeps the contract's promise
/// that unknown ids get `{ "error": ... }` with one status.
fn parse_id(raw: &str) -> Result<DocId, ApiError> {
    raw.parse::<DocId>()
        .map_err(|_| ApiError::not_found("judgment"))
}

/// `GET /api/case/:id`
async fn case(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult {
    let id = parse_id(&id)?;
    let corpus = state.corpus();

    let judgment = corpus
        .judgment(&id)
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("judgment"))?;

    let class = corpus
        .provenance_class(&id)
        .map_err(ApiError::internal)?
        .unwrap_or(ProvenanceClass::Manual);

    Ok(Json(json!({
        "judgment": judgment,
        "court_name": molao_core::court::lookup(&judgment.court)
            .map_or(judgment.court.clone(), |c| c.name.to_string()),
        "region": corpus.region(&id).map_err(ApiError::internal)?,
        "provenance_class": class,
        "cites_count": corpus.cites_count(&id).map_err(ApiError::internal)?,
        "cited_by_count": corpus.cited_by_count(&id).map_err(ApiError::internal)?,
        "authority": corpus.authority(&id).map_err(ApiError::internal)?,
        "reported_citations": judgment.reported_citations,
    })))
}

/// `GET /api/case/:id/citations`
async fn case_citations(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult {
    let id = parse_id(&id)?;
    let corpus = state.corpus();
    if !corpus.contains(&id).map_err(ApiError::internal)? {
        return Err(ApiError::not_found("judgment"));
    }

    let cites = corpus.citations_from(&id).map_err(ApiError::internal)?;
    let cited_by = corpus.cited_by(&id).map_err(ApiError::internal)?;

    Ok(Json(json!({
        // Unresolved citations are included and flagged, never hidden: on any
        // real corpus most cited cases are not held, and a "cites" list that
        // silently omitted them would misrepresent the judgment.
        "cites": cites.iter().map(|c| json!({
            "to_id": c.to_id,
            "citation_key": c.citation_key,
            "as_written": c.as_written,
            "canonical": c.canonical,
            "from_para": c.from_para,
            "pinpoint": c.pinpoint,
            "resolved": c.resolved(),
        })).collect::<Vec<_>>(),
        "cited_by": cited_by.iter().map(|c| json!({
            "from_id": c.from_id,
            "title": c.title,
            "court": c.court,
            "date": c.date,
            "as_written": c.as_written,
            "from_para": c.from_para,
            "pinpoint": c.pinpoint,
        })).collect::<Vec<_>>(),
    })))
}

/// `GET /api/case/:id/graph`
async fn case_graph(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<Params>,
) -> ApiResult {
    let id = parse_id(&id)?;
    // Clamped, so `?depth=4294967295` is `depth=MAX_DEPTH` rather than an
    // attempt to walk the whole corpus.
    let depth = number(&params, "depth")
        .unwrap_or(1)
        .min(molao_graph::MAX_DEPTH);

    let hood = state
        .graph
        .neighbourhood(&id, depth)
        .ok_or_else(|| ApiError::not_found("judgment"))?;

    Ok(Json(json!({
        "depth": depth,
        "nodes": hood.nodes.iter().map(|(n, d)| json!({
            "id": n.id.to_string(),
            "title": n.title,
            "court": n.court,
            "region": n.region,
            "date": n.date,
            "authority": n.authority,
            "depth": d,
        })).collect::<Vec<_>>(),
        "edges": hood.edges.iter().map(|e| json!({
            "from": e.from.to_string(),
            "to": e.to.to_string(),
            "weight": e.weight,
            "paragraph_count": e.paragraph_count,
        })).collect::<Vec<_>>(),
    })))
}

// ---------------------------------------------------------------------------
// Treatment: the interpretive layer
// ---------------------------------------------------------------------------

/// What the node says when it holds no attestations at all.
///
/// The wording is the point. "No treatments found" would be read as *this case
/// is fine*, which is a claim nobody has made and this node is in no position
/// to make. What is actually true is that the feature has nothing in it here.
const NOT_AVAILABLE: &str = "not yet available: this node holds no treatment attestations. \
     That is a fact about this node's attestation set, not about the law — it is not evidence \
     that nothing has been overruled. Check currency yourself.";

/// What the node says when it holds attestations, but none about this judgment.
const NONE_ABOUT_THIS: &str = "this node holds attestations, none of them about this judgment. \
     Only what has been imported here is visible; there is no gossip, so nothing tells this node \
     what has been attested elsewhere.";

/// The standing description of the mechanical layer.
const MECHANICAL_NOTE: &str = "Who cited whom, at which paragraph. Extracted from the judgment \
     text by the pinned extractor below and reproducible byte-for-byte by anyone holding the \
     same judgments. Nobody asserted any of this; it is recomputed.";

/// The standing description of the interpretive layer.
const INTERPRETIVE_NOTE: &str = "What named parties say those citations mean. Not recomputable \
     and never will be: every claim carries the key that signed it, and that signature was \
     checked against these exact bytes when they were read. Contradictory claims are returned \
     together and are not ranked.";

/// Gossip does not exist, and the payload says so on every request rather than
/// letting a thin attestation set look like a complete one.
fn gossip_block() -> Value {
    json!({
        "available": false,
        "note": "not yet available: attestations move only by importing a bundle somebody hands \
                 you. There is no peer exchange and no discovery, so this node cannot tell you \
                 what has been attested anywhere else.",
    })
}

/// The reader's trust policy for this request, and where it came from.
///
/// `?trust=` wins outright over the node's default. Merging them would blend
/// the operator's weights into a reading the reader believes is their own,
/// which is exactly the confusion a reader-side policy exists to prevent.
fn reader_policy(state: &AppState, params: &Params) -> (TrustPolicy, &'static str) {
    match param(params, "trust") {
        Some(spec) => {
            let mut policy = TrustPolicy::parse(spec);
            if let Some(w) = number::<f64>(params, "unlisted") {
                policy = policy.unlisted(w);
            }
            (policy, "request")
        }
        None if !state.trust.is_empty() => (state.trust.clone(), "node"),
        None => (state.trust.clone(), "none"),
    }
}

/// How the reader's policy describes one signer.
fn trust_block(policy: &TrustPolicy, signer: &str) -> Value {
    json!({
        "listed": policy.is_listed(signer),
        "weight": policy.weight_for(signer),
        // The reader's own label. Nothing maps a key to an institution, so this
        // is whatever the reader typed and is never evidence of identity.
        "name": policy.name_for(signer),
    })
}

/// Whether the citation this attestation talks about is one the node can see.
///
/// The one honest cross-check available between the two layers: a claim that A
/// overruled B is checkable at least this far — does A cite B in the text held
/// here? A "no" is not proof the claim is wrong (this node's copy of A may be
/// partial, or the treatment may be implicit), so it is reported, not enforced.
fn mechanical_support(state: &AppState, a: &Verified) -> &'static str {
    if state.graph.node(&a.from_doc).is_none() {
        return "citing_judgment_not_held";
    }
    if state.graph.node(&a.to_doc).is_none() {
        return "cited_judgment_not_held";
    }
    if state
        .graph
        .edges()
        .iter()
        .any(|e| e.from == a.from_doc && e.to == a.to_doc)
    {
        "edge"
    } else {
        "no_edge_in_this_corpus"
    }
}

/// One attestation, rendered.
fn attestation_json(state: &AppState, a: &Verified, policy: &TrustPolicy) -> Value {
    json!({
        "from_doc": a.from_doc.to_string(),
        "to_doc": a.to_doc.to_string(),
        "treatment": a.treatment.as_str(),
        "adverse": a.treatment.is_adverse(),
        "from_para": a.from_para,
        "note": a.note,
        "signer": a.signer,
        "signature": a.signature,
        "created_at": a.created_at,
        // Always true, because nothing that failed reaches this function. Stated
        // rather than implied: a client must be able to see the check happened.
        "signature_verified": true,
        "mechanical_support": mechanical_support(state, a),
        "reader": trust_block(policy, &a.signer),
    })
}

/// The counts that prove the read-time check ran over something.
fn verification_json(set: &VerifiedSet) -> Value {
    json!({
        "examined": set.examined,
        "verified": set.attestations.len(),
        "rejected": set.rejected,
        "unreadable": set.unreadable,
        "note": "every row was re-checked against its own signer key when it was read. \
                 `rejected` above zero means something wrote to this corpus's attestation \
                 table outside the import path.",
    })
}

fn conflict_json(state: &AppState, c: &Conflict, policy: &TrustPolicy) -> Value {
    json!({
        "from_doc": c.from_doc.to_string(),
        "to_doc": c.to_doc.to_string(),
        "terms": c.terms.iter().map(|t| t.as_str()).collect::<Vec<_>>(),
        "attestations": c.attestations.iter()
            .map(|a| attestation_json(state, a, policy))
            .collect::<Vec<_>>(),
        "resolved": false,
        "note": "two signers read the same paragraph differently. Both are here, in the \
                 corpus's own order, and this node does not pick between them.",
    })
}

/// `GET /api/case/:id/treatment`
///
/// The mechanical layer and the interpretive layer, side by side and never
/// merged. See the module docs.
async fn case_treatment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<Params>,
) -> ApiResult {
    let id = parse_id(&id)?;
    let (policy, source) = reader_policy(&state, &params);

    let corpus = state.corpus();
    if !corpus.contains(&id).map_err(ApiError::internal)? {
        return Err(ApiError::not_found("judgment"));
    }
    let cited_by = corpus.cited_by(&id).map_err(ApiError::internal)?;
    let view = treatment::about(&corpus, &id, &policy).map_err(ApiError::internal)?;
    drop(corpus);

    let currency = &view.currency;
    Ok(Json(json!({
        "id": id.to_string(),

        // ---- recomputable -------------------------------------------------
        "mechanical": {
            "kind": "recomputable",
            "note": MECHANICAL_NOTE,
            "extractor_version": molao_cite::EXTRACTOR_VERSION,
            "region_profile": molao_cite::extraction_profile_fingerprint(),
            "graph_root": state.graph.graph_root(),
            "cited_by_count": cited_by.len(),
            "cited_by": cited_by.iter().map(|c| json!({
                "from_id": c.from_id,
                "title": c.title,
                "court": c.court,
                "date": c.date,
                "as_written": c.as_written,
                "from_para": c.from_para,
                "pinpoint": c.pinpoint,
            })).collect::<Vec<_>>(),
        },

        // ---- asserted by somebody -----------------------------------------
        "interpretive": {
            "kind": "attested",
            "available": view.available,
            "note": if view.available { INTERPRETIVE_NOTE } else { NOT_AVAILABLE },
            // `null`, not `[]`, when the node holds nothing. An empty array
            // renders as "we looked and there is nothing", which is a claim
            // this node cannot make.
            "attestations": if view.available {
                json!(view.set.attestations.iter()
                    .map(|a| attestation_json(&state, a, &policy))
                    .collect::<Vec<_>>())
            } else {
                Value::Null
            },
            "empty_reason": if !view.available {
                json!(NOT_AVAILABLE)
            } else if view.set.attestations.is_empty() {
                json!(NONE_ABOUT_THIS)
            } else {
                Value::Null
            },
            "verification": verification_json(&view.set),
            "conflicts": view.conflicts.iter()
                .map(|c| conflict_json(&state, c, &policy))
                .collect::<Vec<_>>(),
            "currency": {
                "signal": currency.signal.as_str(),
                "attestations": currency.attestations,
                "adverse": currency.adverse,
                "overruled": currency.overruled,
                "weighted_adverse": currency.weighted_adverse,
                "weighted_total": currency.weighted_total,
                "contested": currency.contested,
                "signers": currency.signers,
                "note": "derived only from signed claims held here and from your own weights. \
                         No signal means good law; the most this can say is that no adverse \
                         attestation reached this node.",
            },
            "trust": {
                "source": source,
                "signers_named": policy.signers.len(),
                "unlisted_weight": policy.unlisted_weight,
                "note": "your policy, not this node's ranking. It attaches a weight and drives \
                         the currency signal; it never hides, filters or reorders a claim.",
            },
            "gossip": gossip_block(),
            "in_release_root": false,
        },
    })))
}

/// `GET /api/treatment/conflicts`
///
/// Every pair this node holds contradictory attestations about. The list a
/// reader should look at before relying on anything here.
async fn treatment_conflicts(
    State(state): State<Arc<AppState>>,
    Query(params): Query<Params>,
) -> ApiResult {
    let (policy, source) = reader_policy(&state, &params);
    let corpus = state.corpus();
    let available = corpus.attestation_stats().map_err(ApiError::internal)?.rows > 0;
    let set = treatment::verified_all(&corpus).map_err(ApiError::internal)?;
    drop(corpus);
    let found = treatment::conflicts(&set);

    Ok(Json(json!({
        "available": available,
        "note": if available {
            "pairs whose signers disagree. Shown, never resolved."
        } else {
            NOT_AVAILABLE
        },
        "conflicts": if available {
            json!(found.iter().map(|c| conflict_json(&state, c, &policy)).collect::<Vec<_>>())
        } else {
            Value::Null
        },
        "verification": verification_json(&set),
        "trust": { "source": source, "signers_named": policy.signers.len() },
        "gossip": gossip_block(),
    })))
}

/// Build the `treatments` block of `/api/status`.
fn treatment_status(state: &AppState) -> Value {
    let corpus = state.corpus();
    let stored = match corpus.attestation_stats() {
        Ok(s) => s,
        // The corpus is what matters and it is fine; do not take the status
        // page down over the interpretive layer.
        Err(e) => {
            tracing::error!(error = %e, "reading attestation stats for status");
            return json!({ "available": false, "note": "attestation table unreadable" });
        }
    };
    let set = match treatment::verified_all(&corpus) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "verifying attestations for status");
            return json!({ "available": false, "note": "attestation table unreadable" });
        }
    };
    drop(corpus);

    json!({
        "available": stored.rows > 0,
        "stored": stored.rows,
        "verified": set.attestations.len(),
        "rejected": set.rejected,
        "unreadable": set.unreadable,
        "signers": set.signers().len(),
        "conflicts": treatment::conflicts(&set).len(),
        // Stated on the status page because it is the reason a release stays
        // reproducible: attestations are not recomputable, so they are not in
        // the root a release commits to, and they travel as their own objects.
        "in_release_root": false,
        "gossip": gossip_block(),
        "note": if stored.rows > 0 {
            "signed claims by named parties, checked against their own keys on every read. \
             Never part of the release root."
        } else {
            NOT_AVAILABLE
        },
    })
}

#[cfg(test)]
mod tests {
    //! Driven through the real router with `tower::ServiceExt::oneshot`, so what
    //! is asserted is the JSON a client receives — routing, extractors and
    //! serialisation included. Calling the handlers directly would pass while
    //! the route was misspelled.
    //!
    //! These live in the crate rather than `tests/api.rs` because they need to
    //! write attestations into the corpus before the router is built, which is
    //! a `molao-graph` call the integration harness does not make.

    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use ed25519_dalek::{Signer as _, SigningKey};
    use http_body_util::BodyExt;
    use molao_graph::{Attestation, Treatment};
    use tower::ServiceExt;

    fn seeded() -> Corpus {
        let mut corpus = Corpus::open_in_memory().expect("in-memory corpus");
        crate::demo::seed(&mut corpus).expect("seeding the demo corpus");
        Graph::build(&corpus)
            .expect("graph")
            .write_authority(&corpus)
            .expect("authority");
        corpus
    }

    /// A `(citing, cited)` pair the demo corpus genuinely holds an edge for, so
    /// an attestation about it has real mechanical support underneath.
    fn a_real_edge(corpus: &Corpus) -> (DocId, DocId) {
        let graph = Graph::build(corpus).expect("graph");
        let e = graph.edges().first().expect("the demo corpus has edges");
        (e.from, e.to)
    }

    fn signing_key(seed: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[seed; 32]);
        let key = hex::encode(sk.verifying_key().to_bytes());
        (sk, key)
    }

    /// A genuinely signed attestation from the key with this seed.
    fn attest(from: DocId, to: DocId, t: Treatment, seed: u8) -> Verified {
        let (sk, key) = signing_key(seed);
        let mut a = Attestation {
            from_doc: from,
            to_doc: to,
            treatment: t,
            from_para: Some(12),
            note: Some(format!("Signer {seed} reads it as {}.", t.as_str())),
            signer: key,
            signature: String::new(),
            created_at: format!("2026-07-2{seed}T09:00:00Z"),
        };
        a.signature = hex::encode(sk.sign(&a.signing_bytes()).to_bytes());
        a.verify().expect("a freshly signed attestation verifies")
    }

    fn router_over(corpus: Corpus) -> Router {
        router(Arc::new(AppState::new(corpus).expect("state")))
    }

    async fn get_with(app: Router, uri: &str) -> (StatusCode, Value) {
        let response = app
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .expect("router responded");
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
            panic!(
                "{uri} did not return JSON: {}",
                String::from_utf8_lossy(&bytes)
            )
        });
        (status, json)
    }

    /// A demo node with two signers disagreeing about one real citation edge.
    fn contested() -> (Router, DocId, DocId, String, String) {
        let corpus = seeded();
        let (from, to) = a_real_edge(&corpus);
        let (_, key_a) = signing_key(1);
        let (_, key_b) = signing_key(2);
        treatment::store(&corpus, &attest(from, to, Treatment::Overruled, 1)).unwrap();
        treatment::store(&corpus, &attest(from, to, Treatment::Distinguished, 2)).unwrap();
        (router_over(corpus), from, to, key_a, key_b)
    }

    // ---- the two layers stay apart ---------------------------------------

    #[tokio::test]
    async fn the_mechanical_layer_is_served_even_when_nothing_is_attested() {
        let corpus = seeded();
        let (_, to) = a_real_edge(&corpus);
        let (status, body) =
            get_with(router_over(corpus), &format!("/api/case/{to}/treatment")).await;
        assert_eq!(status, StatusCode::OK);

        let mechanical = &body["mechanical"];
        assert_eq!(mechanical["kind"], "recomputable");
        assert!(mechanical["extractor_version"]
            .as_str()
            .unwrap()
            .starts_with("molao-cite@"));
        assert_eq!(mechanical["graph_root"].as_str().unwrap().len(), 64);
        assert!(
            mechanical["cited_by_count"].as_u64().unwrap() > 0,
            "the chosen judgment is cited in the demo corpus"
        );
        // The recomputable half carries the pinpoint that makes the edge
        // checkable against the text.
        assert!(mechanical["cited_by"][0]["from_para"].is_number());
        assert!(mechanical["cited_by"][0]["as_written"].is_string());
    }

    #[tokio::test]
    async fn the_interpretive_layer_is_a_sibling_object_not_a_flag_on_a_row() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        assert_eq!(body["mechanical"]["kind"], "recomputable");
        assert_eq!(body["interpretive"]["kind"], "attested");
        // Nothing asserted leaks into the recomputable object.
        let mechanical = body["mechanical"].as_object().unwrap();
        for forbidden in [
            "attestations",
            "treatment",
            "currency",
            "conflicts",
            "signer",
        ] {
            assert!(
                !mechanical.contains_key(forbidden),
                "`{forbidden}` must not appear in the recomputable layer"
            );
        }
        // And the interpretive object never claims to be recomputable.
        assert_eq!(body["interpretive"]["in_release_root"], false);
    }

    // ---- "not yet available", never an empty state ------------------------

    #[tokio::test]
    async fn a_node_holding_no_attestations_says_not_yet_available() {
        let corpus = seeded();
        let (_, to) = a_real_edge(&corpus);
        let (_, body) = get_with(router_over(corpus), &format!("/api/case/{to}/treatment")).await;
        let interpretive = &body["interpretive"];
        assert_eq!(interpretive["available"], false);
        // `null`, not `[]`: an empty array renders as "we looked and there is
        // nothing", which is a claim this node cannot make.
        assert!(
            interpretive["attestations"].is_null(),
            "an empty list would read as reassurance"
        );
        assert!(interpretive["note"]
            .as_str()
            .unwrap()
            .starts_with("not yet available"));
        assert_eq!(interpretive["currency"]["signal"], "no_attestations_held");
    }

    #[tokio::test]
    async fn a_judgment_nobody_attested_about_is_distinguished_from_a_bare_node() {
        // The node holds attestations, just not about this judgment. That is a
        // different sentence from "not yet available" and must read differently.
        let corpus = seeded();
        let (from, to) = a_real_edge(&corpus);
        treatment::store(&corpus, &attest(from, to, Treatment::Followed, 1)).unwrap();
        let other = Graph::build(&corpus)
            .unwrap()
            .nodes()
            .iter()
            .map(|n| n.id)
            .find(|id| *id != to && *id != from)
            .expect("a third judgment");

        let (_, body) =
            get_with(router_over(corpus), &format!("/api/case/{other}/treatment")).await;
        let interpretive = &body["interpretive"];
        assert_eq!(interpretive["available"], true);
        assert_eq!(interpretive["attestations"].as_array().unwrap().len(), 0);
        assert_eq!(
            interpretive["currency"]["signal"],
            "none_about_this_judgment"
        );
        assert!(interpretive["empty_reason"]
            .as_str()
            .unwrap()
            .contains("no gossip"));
    }

    #[tokio::test]
    async fn gossip_is_reported_as_unavailable_on_every_treatment_response() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        assert_eq!(body["interpretive"]["gossip"]["available"], false);
        assert!(body["interpretive"]["gossip"]["note"]
            .as_str()
            .unwrap()
            .starts_with("not yet available"));
    }

    // ---- conflicts shown, not resolved ------------------------------------

    #[tokio::test]
    async fn contradictory_attestations_come_back_together_with_their_signers() {
        let (app, from, to, key_a, key_b) = contested();
        let (status, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        assert_eq!(status, StatusCode::OK);

        let attestations = body["interpretive"]["attestations"].as_array().unwrap();
        assert_eq!(attestations.len(), 2);
        let terms: Vec<&str> = attestations
            .iter()
            .map(|a| a["treatment"].as_str().unwrap())
            .collect();
        assert!(terms.contains(&"overruled") && terms.contains(&"distinguished"));
        let signers: Vec<&str> = attestations
            .iter()
            .map(|a| a["signer"].as_str().unwrap())
            .collect();
        assert!(signers.contains(&key_a.as_str()) && signers.contains(&key_b.as_str()));

        let conflicts = body["interpretive"]["conflicts"].as_array().unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0]["from_doc"], from.to_string());
        assert_eq!(conflicts[0]["to_doc"], to.to_string());
        assert_eq!(conflicts[0]["resolved"], false);
        assert_eq!(conflicts[0]["attestations"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn no_field_anywhere_names_a_winning_attestation() {
        // A blunt guard on the payload's vocabulary: the day somebody adds a
        // "preferred"/"consensus"/"best" field, this fails.
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        let text = body.to_string();
        for banned in [
            "\"winner\"",
            "\"preferred\"",
            "\"consensus\"",
            "\"majority\"",
            "\"best\"",
            "\"authoritative\"",
        ] {
            assert!(!text.contains(banned), "{banned} would be picking a winner");
        }
    }

    #[tokio::test]
    async fn the_conflicts_endpoint_lists_every_disputed_pair() {
        let (app, from, to, ..) = contested();
        let (status, body) = get_with(app, "/api/treatment/conflicts").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["available"], true);
        let conflicts = body["conflicts"].as_array().unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0]["from_doc"], from.to_string());
        assert_eq!(conflicts[0]["to_doc"], to.to_string());
        let terms: Vec<&str> = conflicts[0]["terms"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t.as_str().unwrap())
            .collect();
        assert_eq!(terms, ["distinguished", "overruled"]);
    }

    #[tokio::test]
    async fn the_conflicts_endpoint_says_not_yet_available_on_a_bare_node() {
        let (_, body) = get_with(router_over(seeded()), "/api/treatment/conflicts").await;
        assert_eq!(body["available"], false);
        assert!(body["conflicts"].is_null());
        assert!(body["note"]
            .as_str()
            .unwrap()
            .starts_with("not yet available"));
    }

    // ---- verification is visible in the payload ---------------------------

    #[tokio::test]
    async fn every_served_attestation_reports_its_signature_as_checked() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        let attestations = body["interpretive"]["attestations"].as_array().unwrap();
        assert!(!attestations.is_empty());
        for a in attestations {
            assert_eq!(a["signature_verified"], true);
        }
        let verification = &body["interpretive"]["verification"];
        assert_eq!(verification["examined"], 2);
        assert_eq!(verification["verified"], 2);
        assert_eq!(verification["rejected"], 0);
    }

    #[tokio::test]
    async fn a_forged_row_written_straight_into_the_database_never_reaches_a_client() {
        // The attack the read-time check exists for: the treatments table is
        // excluded from the release root, so nothing signs it and anybody with
        // the file can add an "overruled".
        let corpus = seeded();
        let (from, to) = a_real_edge(&corpus);
        treatment::store(&corpus, &attest(from, to, Treatment::Followed, 1)).unwrap();

        let genuine = attest(from, to, Treatment::Overruled, 2);
        let mut forged = genuine.attestation().clone();
        forged.signature = "ab".repeat(64); // well-formed, and not his
        corpus
            .insert_attestation_row(&molao_corpus::AttestationRow {
                from_doc: forged.from_doc.to_string(),
                to_doc: forged.to_doc.to_string(),
                treatment: forged.treatment.as_str().to_string(),
                from_para: forged.from_para,
                note: forged.note.clone(),
                signer: forged.signer.clone(),
                signature: forged.signature.clone(),
                created_at: forged.created_at.clone(),
            })
            .unwrap();

        let (_, body) = get_with(router_over(corpus), &format!("/api/case/{to}/treatment")).await;
        let interpretive = &body["interpretive"];
        assert_eq!(interpretive["verification"]["examined"], 2);
        assert_eq!(interpretive["verification"]["rejected"], 1);
        let attestations = interpretive["attestations"].as_array().unwrap();
        assert_eq!(attestations.len(), 1);
        assert_eq!(attestations[0]["treatment"], "followed");
        // And it raised no warning on the way past.
        assert_eq!(interpretive["currency"]["signal"], "no_adverse_attestation");
        assert_eq!(interpretive["currency"]["adverse"], 0);
    }

    // ---- reader-side trust ------------------------------------------------

    #[tokio::test]
    async fn a_bare_node_weighs_nobody_and_says_so() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        let trust = &body["interpretive"]["trust"];
        assert_eq!(trust["source"], "none");
        assert_eq!(trust["signers_named"], 0);
        // Shown regardless: an unweighed claim is not a hidden one.
        assert_eq!(
            body["interpretive"]["attestations"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            body["interpretive"]["currency"]["signal"],
            "adverse_unweighted"
        );
    }

    #[tokio::test]
    async fn a_reader_supplies_their_own_policy_in_the_request() {
        let (app, _, to, key_a, key_b) = contested();
        let (_, body) = get_with(
            app,
            &format!("/api/case/{to}/treatment?trust={key_a}:1.0,{key_b}:0.2"),
        )
        .await;
        let trust = &body["interpretive"]["trust"];
        assert_eq!(trust["source"], "request");
        assert_eq!(trust["signers_named"], 2);

        let attestations = body["interpretive"]["attestations"].as_array().unwrap();
        let weight_of = |key: &str| {
            attestations.iter().find(|a| a["signer"] == key).unwrap()["reader"]["weight"]
                .as_f64()
                .unwrap()
        };
        assert_eq!(weight_of(&key_a), 1.0);
        assert_eq!(weight_of(&key_b), 0.2);
        // The overruling now comes from a signer this reader weighs.
        assert_eq!(
            body["interpretive"]["currency"]["signal"],
            "adverse_weighted"
        );
    }

    #[tokio::test]
    async fn the_node_operators_policy_is_a_default_a_request_can_replace() {
        let corpus = seeded();
        let (from, to) = a_real_edge(&corpus);
        let (_, key_a) = signing_key(1);
        treatment::store(&corpus, &attest(from, to, Treatment::Overruled, 1)).unwrap();
        let state = AppState::new(corpus)
            .unwrap()
            .with_trust_policy(TrustPolicy::empty().trusting(&key_a, Some("The operator"), 1.0));
        let app = router(Arc::new(state));

        let (_, body) = get_with(app.clone(), &format!("/api/case/{to}/treatment")).await;
        assert_eq!(body["interpretive"]["trust"]["source"], "node");
        assert_eq!(
            body["interpretive"]["attestations"][0]["reader"]["name"],
            "The operator"
        );
        assert_eq!(
            body["interpretive"]["currency"]["signal"],
            "adverse_weighted"
        );

        // A reader who names nobody gets their own reading, not the operator's.
        let (_, mine) = get_with(app, &format!("/api/case/{to}/treatment?trust=deadbeef")).await;
        assert_eq!(mine["interpretive"]["trust"]["source"], "request");
        assert_eq!(
            mine["interpretive"]["attestations"][0]["reader"]["name"],
            Value::Null
        );
        assert_eq!(
            mine["interpretive"]["currency"]["signal"],
            "adverse_unweighted"
        );
    }

    #[tokio::test]
    async fn a_trust_policy_cannot_hide_or_reorder_a_claim() {
        let (app, _, to, key_a, _) = contested();
        let (_, neutral) = get_with(app.clone(), &format!("/api/case/{to}/treatment")).await;
        let (_, weighed) =
            get_with(app, &format!("/api/case/{to}/treatment?trust={key_a}:1.0")).await;

        let terms = |body: &Value| -> Vec<String> {
            body["interpretive"]["attestations"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| a["treatment"].as_str().unwrap().to_string())
                .collect()
        };
        assert_eq!(
            terms(&neutral),
            terms(&weighed),
            "the reader's weights must not filter or reorder anything"
        );
    }

    // ---- currency ---------------------------------------------------------

    #[tokio::test]
    async fn a_contested_warning_is_labelled_rather_than_averaged_away() {
        let (app, _, to, key_a, key_b) = contested();
        let (_, body) = get_with(
            app,
            &format!("/api/case/{to}/treatment?trust={key_a}:1.0,{key_b}:1.0"),
        )
        .await;
        let currency = &body["interpretive"]["currency"];
        assert_eq!(currency["contested"], true);
        // The warning survives the disagreement rather than cancelling out.
        assert_eq!(currency["adverse"], 1);
        assert_eq!(currency["overruled"], 1);
        assert_eq!(currency["signal"], "adverse_weighted");
        assert_eq!(currency["signers"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn no_currency_signal_this_endpoint_can_emit_reads_as_good_law() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        let signal = body["interpretive"]["currency"]["signal"]
            .as_str()
            .unwrap()
            .to_string();
        for banned in ["good", "sound", "current", "valid", "safe", "clean"] {
            assert!(
                !signal.contains(banned),
                "{signal} reads as a clean bill of health"
            );
        }
        assert!(body["interpretive"]["currency"]["note"]
            .as_str()
            .unwrap()
            .contains("No signal means good law"));
    }

    // ---- the cross-check between the layers -------------------------------

    #[tokio::test]
    async fn an_attestation_about_a_citation_this_corpus_cannot_see_is_labelled() {
        let corpus = seeded();
        let graph = Graph::build(&corpus).unwrap();
        // Two held judgments with no edge between them, in either direction.
        let ids: Vec<DocId> = graph.nodes().iter().map(|n| n.id).collect();
        let (from, to) = ids
            .iter()
            .flat_map(|a| ids.iter().map(move |b| (*a, *b)))
            .find(|(a, b)| {
                a != b
                    && !graph
                        .edges()
                        .iter()
                        .any(|e| (e.from == *a && e.to == *b) || (e.from == *b && e.to == *a))
            })
            .expect("two unrelated judgments");
        treatment::store(&corpus, &attest(from, to, Treatment::Overruled, 1)).unwrap();

        let (_, body) = get_with(router_over(corpus), &format!("/api/case/{to}/treatment")).await;
        let a = &body["interpretive"]["attestations"][0];
        assert_eq!(a["mechanical_support"], "no_edge_in_this_corpus");
        // Labelled, not suppressed.
        assert_eq!(a["treatment"], "overruled");
    }

    #[tokio::test]
    async fn an_attestation_backed_by_a_real_edge_says_so() {
        let (app, _, to, ..) = contested();
        let (_, body) = get_with(app, &format!("/api/case/{to}/treatment")).await;
        for a in body["interpretive"]["attestations"].as_array().unwrap() {
            assert_eq!(a["mechanical_support"], "edge");
        }
    }

    // ---- status -----------------------------------------------------------

    #[tokio::test]
    async fn status_reports_the_attestation_set_separately_from_the_corpus() {
        let (app, ..) = contested();
        let (_, body) = get_with(app, "/api/status").await;
        let t = &body["treatments"];
        assert_eq!(t["available"], true);
        assert_eq!(t["stored"], 2);
        assert_eq!(t["verified"], 2);
        assert_eq!(t["rejected"], 0);
        assert_eq!(t["signers"], 2);
        assert_eq!(t["conflicts"], 1);
        // The reason a release stays reproducible, stated on the status page.
        assert_eq!(t["in_release_root"], false);
        assert_eq!(t["gossip"]["available"], false);
    }

    #[tokio::test]
    async fn status_on_a_bare_node_says_not_yet_available() {
        let (_, body) = get_with(router_over(seeded()), "/api/status").await;
        assert_eq!(body["treatments"]["available"], false);
        assert_eq!(body["treatments"]["stored"], 0);
        assert!(body["treatments"]["note"]
            .as_str()
            .unwrap()
            .starts_with("not yet available"));
    }

    // ---- never 500 on user input ------------------------------------------

    #[tokio::test]
    async fn junk_input_is_a_404_or_a_clamp_and_never_a_500() {
        let (app, _, to, ..) = contested();
        for uri in [
            "/api/case/not-an-id/treatment".to_string(),
            format!("/api/case/{to}/treatment?trust=%%%%"),
            format!("/api/case/{to}/treatment?trust="),
            format!("/api/case/{to}/treatment?trust=aa:notanumber&unlisted=wat"),
            format!("/api/case/{to}/treatment?unlisted=-9999"),
            "/api/treatment/conflicts?trust=$$$".to_string(),
        ] {
            let (status, body) = get_with(app.clone(), &uri).await;
            assert_ne!(status, StatusCode::INTERNAL_SERVER_ERROR, "{uri}");
            assert!(
                status == StatusCode::OK || status == StatusCode::NOT_FOUND,
                "{uri} returned {status}"
            );
            if status == StatusCode::NOT_FOUND {
                assert!(body["error"].is_string(), "{uri} must return JSON error");
            }
        }
    }

    #[tokio::test]
    async fn an_unheld_judgment_is_a_404_on_both_treatment_routes() {
        let (app, ..) = contested();
        let absent = DocId::of_raw("a judgment this node has never held");
        let (status, body) = get_with(app, &format!("/api/case/{absent}/treatment")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"], "no such judgment");
    }

    #[tokio::test]
    async fn the_payload_is_byte_identical_across_repeated_requests() {
        // A reader comparing two readings must not see claims move.
        let (app, _, to, ..) = contested();
        let (_, first) = get_with(app.clone(), &format!("/api/case/{to}/treatment")).await;
        for _ in 0..8 {
            let (_, again) = get_with(app.clone(), &format!("/api/case/{to}/treatment")).await;
            assert_eq!(again, first);
        }
    }
}
