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

use axum::extract::{Path, Query, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use molao_core::{DocId, ProvenanceClass, SignedRelease, SignerSet};
use molao_corpus::{Corpus, SearchFilters};
use molao_graph::Graph;
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
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("nodes", &self.graph.nodes().len())
            .field("edges", &self.graph.edges().len())
            .field("verified", &self.verified)
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
        })
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
        .route("/api/case/{id}", get(case))
        .route("/api/case/{id}/citations", get(case_citations))
        .route("/api/case/{id}/graph", get(case_graph))
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
    })))
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
