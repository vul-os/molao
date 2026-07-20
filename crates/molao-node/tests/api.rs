//! End-to-end tests against the real router.
//!
//! These boot the actual `axum` router over an in-memory demo corpus and drive
//! it with `tower::ServiceExt::oneshot`, so what is asserted is the JSON a
//! client really receives — routing, extractors, serialisation and all. A test
//! that called the handler functions directly would pass while the route was
//! misspelled.
//!
//! The contract in `BUILD-SPEC.md` is the specification here: the web UI is
//! written against these exact field names, so a rename is a breakage.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use molao_corpus::Corpus;
use molao_node::api;
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

/// A router over the demo corpus — the same data a first-time user sees.
fn app() -> axum::Router {
    let mut corpus = Corpus::open_in_memory().expect("in-memory corpus");
    molao_node::demo::seed(&mut corpus).expect("seeding the demo corpus");
    molao_graph::Graph::build(&corpus)
        .expect("graph")
        .write_authority(&corpus)
        .expect("authority");
    api::router(Arc::new(api::AppState::new(corpus).expect("state")))
}

/// Issue a GET and return `(status, parsed JSON)`.
async fn get(uri: &str) -> (StatusCode, Value) {
    let response = app()
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

/// The id of a judgment known to be well cited in the demo corpus.
async fn foundational_id() -> String {
    let (_, body) = get("/api/search?q=legality").await;
    let hits = body["hits"].as_array().expect("hits array");
    hits.iter()
        .find(|h| h["court"] == "ZACC")
        .expect("a ZACC judgment in the demo corpus")["id"]
        .as_str()
        .unwrap()
        .to_string()
}

// ---- /api/version --------------------------------------------------------

#[tokio::test]
async fn version_has_the_documented_shape() {
    let (status, body) = get("/api/version").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "molao");
    assert!(body["version"].is_string());
    assert!(body["extractor_version"]
        .as_str()
        .unwrap()
        .starts_with("molao-cite@"));
    // No release is loaded in a demo node, and it must say so rather than
    // inventing a number.
    assert!(body["release"].is_null());
    assert!(body["corpus_root"].is_string());
}

// ---- /api/status ---------------------------------------------------------

#[tokio::test]
async fn status_reports_counts_provenance_and_honest_verification() {
    let (status, body) = get("/api/status").await;
    assert_eq!(status, StatusCode::OK);

    assert!(body["docs"].as_u64().unwrap() >= 10);
    assert!(body["edges"].as_u64().unwrap() >= 15);
    assert!(body["courts"].as_u64().unwrap() >= 4);

    let provenance = &body["provenance"];
    for key in ["corroborated", "single", "manual"] {
        assert!(provenance[key].is_u64(), "provenance.{key} missing");
    }
    // The demo deliberately exercises all three classes.
    assert!(provenance["corroborated"].as_u64().unwrap() > 0);
    assert!(provenance["single"].as_u64().unwrap() > 0);
    assert!(provenance["manual"].as_u64().unwrap() > 0);

    // Nothing was verified, so nothing may claim to have been.
    assert_eq!(body["verified"], false);
    assert_eq!(body["release"], Value::Null);
    assert_eq!(body["signers"], 0);
    assert_eq!(body["threshold"], 0);
}

#[tokio::test]
async fn status_reports_which_region_profiles_the_corpus_holds() {
    let (_, body) = get("/api/status").await;
    let regions = body["regions"].as_array().expect("regions array");
    assert_eq!(regions.len(), 1);
    assert_eq!(regions[0]["code"], "ZA");
    assert!(regions[0]["doc_count"].as_u64().unwrap() >= 10);
}

// ---- /api/courts ---------------------------------------------------------

#[tokio::test]
async fn courts_lists_the_hierarchy_with_counts() {
    let (status, body) = get("/api/courts").await;
    assert_eq!(status, StatusCode::OK);
    let courts = body.as_array().expect("an array");
    assert!(courts.len() >= 4);

    for c in courts {
        for key in ["code", "name", "tier", "doc_count"] {
            assert!(!c[key].is_null(), "court missing {key}: {c}");
        }
    }
    // Ordered by hierarchy: the apex court comes first.
    assert_eq!(courts[0]["tier"], "apex");
    assert_eq!(courts[0]["name"], "Constitutional Court of South Africa");
}

// ---- /api/search ---------------------------------------------------------

#[tokio::test]
async fn search_returns_hits_with_marked_snippets() {
    let (status, body) = get("/api/search?q=eviction").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["total"].as_u64().unwrap() >= 1);

    let hit = &body["hits"][0];
    for key in [
        "id",
        "title",
        "court",
        "court_name",
        "region",
        "date",
        "neutral_citation",
        "snippet",
        "authority",
        "cited_by_count",
    ] {
        assert!(!hit[key].is_null(), "hit missing {key}: {hit}");
    }
    assert!(
        hit["snippet"].as_str().unwrap().contains("<mark>"),
        "no highlight: {}",
        hit["snippet"]
    );
}

#[tokio::test]
async fn search_filters_by_court_year_and_region() {
    let (_, all) = get("/api/search?q=").await;
    let total = all["total"].as_u64().unwrap();

    let (_, zacc) = get("/api/search?q=&court=ZACC").await;
    assert!(zacc["total"].as_u64().unwrap() < total);
    assert!(zacc["hits"]
        .as_array()
        .unwrap()
        .iter()
        .all(|h| h["court"] == "ZACC"));

    let (_, recent) = get("/api/search?q=&year_from=2020").await;
    assert!(recent["total"].as_u64().unwrap() < total);

    let (_, za) = get("/api/search?q=&region=ZA").await;
    assert_eq!(za["total"].as_u64().unwrap(), total);

    let (_, elsewhere) = get("/api/search?q=&region=KE").await;
    assert_eq!(elsewhere["total"], 0);
}

#[tokio::test]
async fn an_empty_search_browses_rather_than_erroring() {
    for uri in ["/api/search", "/api/search?q=", "/api/search?q=%20%20"] {
        let (status, body) = get(uri).await;
        assert_eq!(status, StatusCode::OK, "{uri}");
        assert!(body["total"].as_u64().unwrap() > 0, "{uri}");
    }
}

#[tokio::test]
async fn hostile_search_input_never_produces_a_500() {
    // Each is either an injection attempt or valid FTS5 syntax that would be a
    // hard error if it reached SQLite unmodified.
    let attacks = [
        "%27%3B%20DROP%20TABLE%20judgments%3B%20--",
        "NEAR%28a%20b%2C%2099999%29",
        "%28%28%28%28%28",
        "title%3A*",
        "%22unterminated",
        "%5E%5E%5E",
    ];
    for attack in attacks {
        let (status, body) = get(&format!("/api/search?q={attack}")).await;
        assert_eq!(status, StatusCode::OK, "q={attack} gave {body}");
        assert!(body["total"].is_u64(), "q={attack} gave {body}");
    }
}

#[tokio::test]
async fn nonsense_pagination_is_clamped_not_rejected() {
    for uri in [
        "/api/search?q=&limit=0",
        "/api/search?q=&limit=999999",
        "/api/search?q=&offset=999999",
        // Unparseable values fall back to the defaults rather than 400-ing.
        "/api/search?q=&limit=abc",
        "/api/search?q=&year_from=notayear",
    ] {
        let (status, _) = get(uri).await;
        assert_eq!(status, StatusCode::OK, "{uri}");
    }

    let (_, body) = get("/api/search?q=&limit=999999").await;
    assert!(body["hits"].as_array().unwrap().len() <= molao_corpus::MAX_LIMIT as usize);
}

// ---- /api/case/:id -------------------------------------------------------

#[tokio::test]
async fn a_case_has_the_documented_shape() {
    let id = foundational_id().await;
    let (status, body) = get(&format!("/api/case/{id}")).await;
    assert_eq!(status, StatusCode::OK);

    for key in [
        "judgment",
        "court_name",
        "region",
        "provenance_class",
        "cites_count",
        "cited_by_count",
        "authority",
        "reported_citations",
    ] {
        assert!(!body[key].is_null(), "case missing {key}");
    }

    // The judgment itself is the molao-core shape, paragraphs included.
    let j = &body["judgment"];
    assert_eq!(j["id"], id);
    assert!(j["paragraphs"].as_array().unwrap().len() > 1);
    assert!(j["neutral_citation"].is_string());
    assert!(j["court"].is_string());

    // A well-cited judgment must actually report inbound citations.
    assert!(body["cited_by_count"].as_u64().unwrap() > 0);
    assert!(
        ["corroborated", "single", "manual"].contains(&body["provenance_class"].as_str().unwrap())
    );
}

#[tokio::test]
async fn unknown_and_malformed_ids_are_404_with_an_error_body() {
    for id in [
        &"ff".repeat(32),   // well-formed, not held
        "not-hex-at-all",   // not hex
        "abcd",             // right alphabet, wrong length
        "../../etc/passwd", // traversal-shaped
    ] {
        let (status, body) = get(&format!("/api/case/{id}")).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "id={id} gave {body}");
        assert!(body["error"].is_string(), "id={id} gave {body}");
    }
}

// ---- /api/case/:id/citations ---------------------------------------------

#[tokio::test]
async fn citations_report_both_directions_and_keep_the_unresolved() {
    let id = foundational_id().await;
    let (status, body) = get(&format!("/api/case/{id}/citations")).await;
    assert_eq!(status, StatusCode::OK);

    let cited_by = body["cited_by"].as_array().expect("cited_by array");
    assert!(!cited_by.is_empty(), "the foundational case must be cited");
    for c in cited_by {
        for key in ["from_id", "title", "court", "as_written"] {
            assert!(!c[key].is_null(), "cited_by entry missing {key}: {c}");
        }
    }

    // Somewhere in the corpus there must be a citation that did not resolve —
    // the API must expose it as written rather than hide it.
    let (_, solomons) = get("/api/search?q=waiting%20list").await;
    let solomons_id = solomons["hits"][0]["id"].as_str().unwrap();
    let (_, cites_body) = get(&format!("/api/case/{solomons_id}/citations")).await;
    let cites = cites_body["cites"].as_array().unwrap();
    assert!(!cites.is_empty());
    for c in cites {
        for key in ["citation_key", "as_written", "canonical", "resolved"] {
            assert!(!c[key].is_null(), "cites entry missing {key}: {c}");
        }
        assert!(c["resolved"].is_boolean());
    }
    assert!(
        cites.iter().any(|c| c["resolved"] == false),
        "no unresolved citation surfaced; the demo corpus should have some"
    );
    assert!(cites.iter().any(|c| c["resolved"] == true));
}

#[tokio::test]
async fn citations_for_an_unknown_case_are_404() {
    let (status, body) = get(&format!("/api/case/{}/citations", "ab".repeat(32))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].is_string());
}

// ---- /api/case/:id/graph -------------------------------------------------

#[tokio::test]
async fn the_graph_endpoint_returns_nodes_and_edges() {
    let id = foundational_id().await;
    let (status, body) = get(&format!("/api/case/{id}/graph?depth=1")).await;
    assert_eq!(status, StatusCode::OK);

    let nodes = body["nodes"].as_array().expect("nodes array");
    let edges = body["edges"].as_array().expect("edges array");
    assert!(
        nodes.len() > 1,
        "a well-cited judgment must have neighbours"
    );
    assert!(!edges.is_empty());

    for n in nodes {
        for key in ["id", "title", "court", "date", "authority", "depth"] {
            assert!(!n[key].is_null(), "node missing {key}: {n}");
        }
    }
    for e in edges {
        for key in ["from", "to", "weight"] {
            assert!(!e[key].is_null(), "edge missing {key}: {e}");
        }
    }

    // The centre is at depth 0 and is the only one.
    let centres: Vec<&Value> = nodes.iter().filter(|n| n["depth"] == 0).collect();
    assert_eq!(centres.len(), 1);
    assert_eq!(centres[0]["id"], id);

    // Every edge joins two nodes that are present.
    let ids: Vec<&str> = nodes.iter().map(|n| n["id"].as_str().unwrap()).collect();
    for e in edges {
        assert!(ids.contains(&e["from"].as_str().unwrap()));
        assert!(ids.contains(&e["to"].as_str().unwrap()));
    }
}

#[tokio::test]
async fn graph_depth_is_capped_rather_than_honoured() {
    let id = foundational_id().await;
    let (_, capped) = get(&format!("/api/case/{id}/graph?depth=3")).await;

    for absurd in ["4", "99", "4294967295"] {
        let (status, body) = get(&format!("/api/case/{id}/graph?depth={absurd}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body["depth"], capped["depth"],
            "depth={absurd} was not clamped"
        );
        assert_eq!(
            body["nodes"].as_array().unwrap().len(),
            capped["nodes"].as_array().unwrap().len()
        );
    }

    // depth=0 is the judgment alone.
    let (_, alone) = get(&format!("/api/case/{id}/graph?depth=0")).await;
    assert_eq!(alone["nodes"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn a_graph_for_an_unknown_case_is_404() {
    let (status, body) = get(&format!("/api/case/{}/graph", "cd".repeat(32))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].is_string());
}

// ---- cross-cutting -------------------------------------------------------

#[tokio::test]
async fn responses_are_cors_open_because_this_is_public_law() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/status")
                .header("origin", "https://someone-elses-site.invalid")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("*")
    );
}

#[tokio::test]
async fn an_unknown_api_endpoint_is_a_json_404_not_the_ui() {
    let (status, body) = get("/api/does-not-exist").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn the_ui_is_served_at_the_root() {
    let response = app()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let html = String::from_utf8_lossy(&bytes);
    assert!(html.contains("molao"), "the root did not serve the UI");
}

#[tokio::test]
async fn a_write_method_is_refused_everywhere() {
    // There is no write path at all; the API must not quietly accept one.
    for method in ["POST", "PUT", "DELETE", "PATCH"] {
        let response = app()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri("/api/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::METHOD_NOT_ALLOWED,
            "{method} was not refused"
        );
    }
}
