//! The embedded web UI.
//!
//! The whole interface is compiled into the binary by `rust-embed`, so a node is
//! one file with no asset directory to lose, no CDN to depend on, and nothing to
//! fetch at runtime. That matters more here than convenience: a corpus of case
//! law that stops working when a hosted asset disappears is not a commons, it is
//! a client for somebody else's server.
//!
//! `apps/web/dist` is produced by a separate toolchain. `build.rs` guarantees the
//! directory exists with at least a placeholder page, so a Rust-only build never
//! fails for want of a JavaScript bundle.
//!
//! Unknown paths fall back to `index.html` so client-side routes reload
//! correctly — with one exception: anything under `/api/` that reached this
//! handler is a genuinely unknown endpoint, and answering it with a page of HTML
//! would turn a typo in an API path into a confusing parse error in a client.
//! Those get a JSON 404 in the same shape as every other API error.

use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rust_embed::RustEmbed;
use serde_json::json;

/// The built UI. Absent-directory handling lives in `build.rs`.
#[derive(RustEmbed)]
#[folder = "../../apps/web/dist"]
struct Assets;

/// Serve an embedded asset, falling back to `index.html` for client routes.
pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    if let Some(response) = lookup(path) {
        return response;
    }

    // An unmatched /api/ path is a bad endpoint, not a UI route.
    if uri.path().starts_with("/api/") {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "no such endpoint" })),
        )
            .into_response();
    }

    match lookup("index.html") {
        Some(response) => response,
        // Only reachable if the embedded bundle is empty, which build.rs
        // prevents. Say so plainly rather than serving a blank page.
        None => (
            StatusCode::NOT_FOUND,
            "molao: no web interface is embedded in this build",
        )
            .into_response(),
    }
}

fn lookup(path: &str) -> Option<Response> {
    if path.is_empty() {
        return lookup("index.html");
    }
    let asset = Assets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Some(
        (
            [(header::CONTENT_TYPE, mime.as_ref())],
            asset.data.into_owned(),
        )
            .into_response(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_index_page_is_always_embedded() {
        // build.rs guarantees this; without it every UI route 404s and the
        // failure would only show up in a browser.
        assert!(Assets::get("index.html").is_some());
    }

    #[tokio::test]
    async fn the_root_path_serves_the_index() {
        let response = serve(Uri::from_static("/")).await;
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn an_unknown_client_route_falls_back_to_the_index() {
        let response = serve(Uri::from_static("/case/abc123")).await;
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn an_unknown_api_path_is_a_json_404_not_a_page_of_html() {
        let response = serve(Uri::from_static("/api/nonsense")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        assert!(ct.contains("application/json"), "content-type was {ct}");
    }

    #[tokio::test]
    async fn a_traversal_attempt_does_not_escape_the_bundle() {
        // rust-embed serves from a compiled-in map, so there is no filesystem
        // to traverse — but the behaviour is asserted rather than assumed.
        for attack in [
            "/../../../../etc/passwd",
            "/%2e%2e%2f%2e%2e%2fetc/passwd",
            "/....//....//etc/passwd",
        ] {
            let uri: Uri = attack.parse().unwrap();
            let response = serve(uri).await;
            // Falls back to the index; never a file from outside the bundle.
            assert_eq!(response.status(), StatusCode::OK);
        }
    }
}
