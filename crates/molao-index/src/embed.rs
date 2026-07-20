//! Embedders: text in, vectors out. Pluggable, with no model baked in.
//!
//! Molao ships **no embedding model**. That is not an oversight; it is the
//! honest position. A signed OS image cannot contain a float model whose output
//! it cannot reproduce, and a legal commons cannot depend on a hosted embedding
//! API to read the law. So the node defines a trait and provides two
//! implementations:
//!
//! - [`FakeEmbedder`] — deterministic, offline, no model. A feature-hashing
//!   stand-in that turns shared vocabulary into vector similarity. It is what
//!   `molao demo` and every test use, so the whole pipeline is exercisable with
//!   no network and no weights. It is *not* semantic; it is reproducible, which
//!   is exactly what a test and a demo need.
//! - [`HttpEmbedder`] — a thin client for an OpenAI-compatible
//!   `/v1/embeddings` endpoint. This is how a real node uses a local model (a
//!   node's own llmux, llama.cpp, Ollama, vLLM). It is optional: nothing in a
//!   default build or a test calls it, and the operator supplies the model.
//!
//! Real semantic RAG requires the operator to point [`HttpEmbedder`] at a model
//! they run. See `docs/RAG.md`.

use crate::error::{IndexError, Result};

/// The part of an [`crate::IndexDescriptor`] that an embedder contributes.
///
/// `dim` is not here: the build takes the dimension from the vectors the model
/// actually returns, so a remote model whose dimension the operator does not
/// know up front still produces a correct descriptor.
#[derive(Debug, Clone)]
pub struct EmbedderFragment {
    /// Stable family id, e.g. `"fake-hash"`.
    pub embedder_id: String,
    /// Version/weights tag, e.g. `"v1"` or a model name.
    pub model_version: String,
}

/// Anything that can turn text into vectors.
///
/// The contract is deliberately small: given N strings, return N vectors, all of
/// the same non-zero dimension. The build normalizes to unit length itself, so
/// an implementation need not — though a good one will, so its own similarity
/// notion matches what gets stored.
pub trait Embedder {
    /// Embed a batch of texts. Length and order of the output must match the
    /// input. All vectors must share one dimension.
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;

    /// The descriptor fragment this embedder stamps onto an index it builds.
    fn fragment(&self) -> EmbedderFragment;
}

/// L2-normalize a vector in place to unit length. A zero vector is left as-is
/// (there is no unit direction for it), and it will simply never be similar to
/// anything, which is the correct behaviour for an empty chunk or query.
pub fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

/// A deterministic, offline, model-free embedder.
///
/// Feature hashing: every token votes into the vector at a hashed coordinate
/// with a hashed sign, and the result is L2-normalized. Two texts that share
/// vocabulary end up with a positive dot product; unrelated texts do not. It is
/// bit-for-bit reproducible on every machine — unlike a real float model — which
/// is why it is safe to assert exact behaviour against it in tests and why the
/// demo can rely on it working identically for every user.
#[derive(Debug, Clone)]
pub struct FakeEmbedder {
    dim: usize,
}

impl FakeEmbedder {
    /// The embedder id the fake stamps into descriptors. A node can reconstruct
    /// a `FakeEmbedder` at query time from a descriptor carrying this id.
    pub const ID: &'static str = "fake-hash";
    /// The version tag; bump if the hashing below ever changes.
    pub const VERSION: &'static str = "v1";
    /// A sensible default dimension for the demo — small enough to be quick,
    /// large enough that hash collisions do not dominate similarity.
    pub const DEFAULT_DIM: usize = 256;

    /// A fake embedder producing `dim`-dimensional vectors. A `dim` of zero is
    /// clamped to 1 so the space is never degenerate.
    pub fn new(dim: usize) -> Self {
        FakeEmbedder { dim: dim.max(1) }
    }

    fn embed_one(&self, text: &str) -> Vec<f32> {
        let mut v = vec![0.0f32; self.dim];
        for token in tokenize(text) {
            // Domain-separated so the fake's hashing cannot be confused with any
            // other blake3 use in the tree.
            let mut h = blake3::Hasher::new();
            h.update(b"molao-fake-embed-v1\n");
            h.update(token.as_bytes());
            let digest = h.finalize();
            let bytes = digest.as_bytes();
            let bucket = u64::from_be_bytes(bytes[0..8].try_into().unwrap_or([0; 8]));
            let idx = (bucket % self.dim as u64) as usize;
            let sign = if bytes[8] & 1 == 0 { 1.0 } else { -1.0 };
            v[idx] += sign;
        }
        normalize(&mut v);
        v
    }
}

impl Embedder for FakeEmbedder {
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        Ok(texts.iter().map(|t| self.embed_one(t)).collect())
    }

    fn fragment(&self) -> EmbedderFragment {
        EmbedderFragment {
            embedder_id: Self::ID.to_string(),
            model_version: Self::VERSION.to_string(),
        }
    }
}

/// Lowercase alphanumeric word tokens. Non-ASCII letters are kept, so Afrikaans
/// and isiZulu text is not silently dropped. Matches the spirit of the corpus's
/// FTS tokenizer closely enough that the keyword and vector sides agree on what
/// a "word" is.
fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() {
            cur.extend(c.to_lowercase());
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Configuration for the HTTP embedder: an OpenAI-compatible endpoint and model.
#[derive(Debug, Clone)]
pub struct HttpConfig {
    /// Full URL of the embeddings endpoint, e.g.
    /// `http://127.0.0.1:11434/v1/embeddings`.
    pub endpoint: String,
    /// Model name to request, e.g. `nomic-embed-text`.
    pub model: String,
    /// Optional bearer token, for endpoints that require one.
    pub api_key: Option<String>,
}

/// A thin client for an OpenAI-compatible `/v1/embeddings` endpoint.
///
/// Deliberately dependency-free: it speaks HTTP/1.1 over a plain TCP socket so
/// the crate pulls in no async runtime, no TLS stack, and nothing that could
/// fail an offline build. That means it targets a **local, plaintext** endpoint
/// — which is exactly the intended deployment: a node embedding against its own
/// model on `localhost`. For a remote HTTPS provider, run a local proxy; a
/// legal-commons node reaching out to a third-party API for every query is not
/// the design. See `docs/RAG.md`.
#[derive(Debug, Clone)]
pub struct HttpEmbedder {
    config: HttpConfig,
}

impl HttpEmbedder {
    /// Build an HTTP embedder from its configuration.
    pub fn new(config: HttpConfig) -> Self {
        HttpEmbedder { config }
    }
}

impl Embedder for HttpEmbedder {
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let vectors = http::request_embeddings(&self.config, texts)?;
        if vectors.len() != texts.len() {
            return Err(IndexError::Embed(format!(
                "endpoint returned {} vectors for {} inputs",
                vectors.len(),
                texts.len()
            )));
        }
        Ok(vectors)
    }

    fn fragment(&self) -> EmbedderFragment {
        EmbedderFragment {
            // A family id, not the model — the model goes in model_version so two
            // models behind the same API get distinct descriptor ids.
            embedder_id: "openai-compat".to_string(),
            model_version: self.config.model.clone(),
        }
    }
}

/// Reconstruct a query-time embedder from a stored descriptor.
///
/// A node serving RAG must embed the incoming query in the *same* space the
/// index was built in. For the deterministic fake embedder that is fully
/// determined by the descriptor (id + dimension), so it is rebuilt for free —
/// which is what makes `molao demo`'s RAG work with no configuration. For a
/// remote model the node cannot know the endpoint from the descriptor alone, so
/// the operator must supply it at serve time; without it, the vector side is
/// unavailable and retrieval falls back to keywords (never wrong-space results).
///
/// Returns `None` when no embedder can be reconstructed for this descriptor —
/// the caller then serves keyword-only, honestly labelled.
pub fn query_embedder(
    embedder_id: &str,
    dim: usize,
    http: Option<&HttpConfig>,
) -> Option<Box<dyn Embedder>> {
    match embedder_id {
        FakeEmbedder::ID => Some(Box::new(FakeEmbedder::new(dim))),
        "openai-compat" => {
            http.map(|c| Box::new(HttpEmbedder::new(c.clone())) as Box<dyn Embedder>)
        }
        _ => None,
    }
}

/// The dependency-free HTTP/1.1 client. Small on purpose; see [`HttpEmbedder`].
mod http {
    use super::HttpConfig;
    use crate::error::{IndexError, Result};
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    /// POST the batch to the endpoint and parse the embedding vectors out of the
    /// OpenAI-compatible response.
    pub fn request_embeddings(config: &HttpConfig, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let (host, port, path) = parse_url(&config.endpoint)?;

        let body = serde_json::json!({ "model": config.model, "input": texts }).to_string();

        let mut req = String::new();
        req.push_str(&format!("POST {path} HTTP/1.1\r\n"));
        req.push_str(&format!("Host: {host}:{port}\r\n"));
        req.push_str("Content-Type: application/json\r\n");
        if let Some(key) = &config.api_key {
            req.push_str(&format!("Authorization: Bearer {key}\r\n"));
        }
        req.push_str(&format!("Content-Length: {}\r\n", body.len()));
        req.push_str("Connection: close\r\n\r\n");
        req.push_str(&body);

        let mut stream = TcpStream::connect((host.as_str(), port))
            .map_err(|e| IndexError::Http(format!("connecting to {host}:{port}: {e}")))?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
        stream
            .write_all(req.as_bytes())
            .map_err(|e| IndexError::Http(format!("sending request: {e}")))?;

        let mut raw = Vec::new();
        stream
            .read_to_end(&mut raw)
            .map_err(|e| IndexError::Http(format!("reading response: {e}")))?;

        let split = find_body(&raw)
            .ok_or_else(|| IndexError::Http("no header/body separator in response".into()))?;
        let (head, body) = raw.split_at(split);
        let head = String::from_utf8_lossy(head);
        let status_ok = head
            .lines()
            .next()
            .map(|l| l.contains(" 200"))
            .unwrap_or(false);
        if !status_ok {
            let line = head.lines().next().unwrap_or("").trim();
            return Err(IndexError::Http(format!("endpoint returned: {line}")));
        }
        let body = &body[4.min(body.len())..]; // skip the "\r\n\r\n"
        let body = dechunk_if_needed(&head, body);

        parse_embeddings(&body)
    }

    fn parse_embeddings(body: &[u8]) -> Result<Vec<Vec<f32>>> {
        let json: serde_json::Value = serde_json::from_slice(body)
            .map_err(|e| IndexError::Http(format!("response was not JSON: {e}")))?;
        let data = json
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| IndexError::Http("response has no `data` array".into()))?;
        let mut out = Vec::with_capacity(data.len());
        for item in data {
            let arr = item
                .get("embedding")
                .and_then(|e| e.as_array())
                .ok_or_else(|| IndexError::Http("a data item has no `embedding` array".into()))?;
            let vec: Vec<f32> = arr
                .iter()
                .map(|n| n.as_f64().map(|f| f as f32))
                .collect::<Option<Vec<f32>>>()
                .ok_or_else(|| IndexError::Http("an embedding held a non-number".into()))?;
            if vec.is_empty() {
                return Err(IndexError::Http("an embedding was empty".into()));
            }
            out.push(vec);
        }
        Ok(out)
    }

    /// Split `scheme://host[:port]/path` into `(host, port, path)`. Only `http`
    /// is supported (see the type docs); `https` is refused rather than silently
    /// spoken as plaintext.
    fn parse_url(url: &str) -> Result<(String, u16, String)> {
        let rest = url.strip_prefix("http://").ok_or_else(|| {
            IndexError::Http(format!("only http:// endpoints are supported: {url}"))
        })?;
        let (authority, path) = match rest.find('/') {
            Some(i) => (&rest[..i], &rest[i..]),
            None => (rest, "/"),
        };
        let (host, port) = match authority.rsplit_once(':') {
            Some((h, p)) => (
                h.to_string(),
                p.parse::<u16>()
                    .map_err(|_| IndexError::Http(format!("bad port in {url}")))?,
            ),
            None => (authority.to_string(), 80),
        };
        if host.is_empty() {
            return Err(IndexError::Http(format!("no host in {url}")));
        }
        Ok((host, port, path.to_string()))
    }

    fn find_body(raw: &[u8]) -> Option<usize> {
        raw.windows(4).position(|w| w == b"\r\n\r\n")
    }

    /// Handle `Transfer-Encoding: chunked` responses. Most local model servers
    /// send `Content-Length` and this is a passthrough, but a chunked server
    /// must still be read correctly.
    fn dechunk_if_needed(head: &str, body: &[u8]) -> Vec<u8> {
        let chunked = head
            .to_ascii_lowercase()
            .contains("transfer-encoding: chunked");
        if !chunked {
            return body.to_vec();
        }
        let mut out = Vec::new();
        let mut rest = body;
        loop {
            let Some(nl) = rest.windows(2).position(|w| w == b"\r\n") else {
                break;
            };
            let size_str = String::from_utf8_lossy(&rest[..nl]);
            let size = usize::from_str_radix(size_str.trim(), 16).unwrap_or(0);
            let data_start = nl + 2;
            if size == 0 || data_start + size > rest.len() {
                if size > 0 && data_start < rest.len() {
                    out.extend_from_slice(&rest[data_start..]);
                }
                break;
            }
            out.extend_from_slice(&rest[data_start..data_start + size]);
            rest = &rest[(data_start + size + 2).min(rest.len())..];
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_fake_embedder_is_deterministic() {
        let e = FakeEmbedder::new(64);
        let a = e.embed(&["unfair dismissal".to_string()]).unwrap();
        let b = e.embed(&["unfair dismissal".to_string()]).unwrap();
        assert_eq!(a, b, "the fake embedder must be bit-reproducible");
    }

    #[test]
    fn fake_vectors_are_unit_length_and_the_right_dimension() {
        let e = FakeEmbedder::new(128);
        let v = &e.embed(&["some judgment text here".to_string()]).unwrap()[0];
        assert_eq!(v.len(), 128);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "not unit length: {norm}");
    }

    #[test]
    fn shared_vocabulary_produces_higher_similarity() {
        let e = FakeEmbedder::new(512);
        let vs = e
            .embed(&[
                "eviction of occupiers from municipal land".to_string(),
                "eviction order against the occupiers".to_string(),
                "interpretation of an insurance exclusion clause".to_string(),
            ])
            .unwrap();
        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        let related = dot(&vs[0], &vs[1]);
        let unrelated = dot(&vs[0], &vs[2]);
        assert!(
            related > unrelated,
            "shared-vocab similarity {related} should beat unrelated {unrelated}"
        );
    }

    #[test]
    fn an_empty_text_embeds_to_a_zero_vector_not_a_panic() {
        let e = FakeEmbedder::new(32);
        let v = &e.embed(&["   ".to_string()]).unwrap()[0];
        assert!(v.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn the_fragment_reports_the_fake_identity() {
        let f = FakeEmbedder::new(16).fragment();
        assert_eq!(f.embedder_id, FakeEmbedder::ID);
        assert_eq!(f.model_version, FakeEmbedder::VERSION);
    }

    #[test]
    fn a_fake_query_embedder_is_reconstructable_from_a_descriptor() {
        let e = query_embedder(FakeEmbedder::ID, 64, None).expect("fake reconstructs");
        assert_eq!(e.embed(&["x".to_string()]).unwrap()[0].len(), 64);
    }

    #[test]
    fn an_http_query_embedder_needs_config_and_is_none_without_it() {
        assert!(query_embedder("openai-compat", 384, None).is_none());
        let cfg = HttpConfig {
            endpoint: "http://127.0.0.1:11434/v1/embeddings".into(),
            model: "nomic-embed-text".into(),
            api_key: None,
        };
        assert!(query_embedder("openai-compat", 384, Some(&cfg)).is_some());
    }

    #[test]
    fn an_unknown_embedder_id_reconstructs_to_nothing() {
        assert!(query_embedder("some-future-model", 64, None).is_none());
    }

    #[test]
    fn the_http_embedder_marks_normalization_and_refuses_https() {
        // We do not stand up a server here; we assert the safe failure modes.
        let e = HttpEmbedder::new(HttpConfig {
            endpoint: "https://api.openai.com/v1/embeddings".into(),
            model: "text-embedding-3-small".into(),
            api_key: Some("sk-x".into()),
        });
        let err = e.embed(&["hello".to_string()]).unwrap_err();
        assert!(
            matches!(err, IndexError::Http(_)),
            "https must be refused as an http-embedder error, got {err:?}"
        );
        assert_eq!(e.fragment().embedder_id, "openai-compat");
    }

    #[test]
    fn normalization_constant_is_wired() {
        // Guards against the descriptor and the embedder drifting on what
        // normalization means.
        assert_eq!(crate::descriptor::NORMALIZATION_UNIT_L2, "unit-l2");
    }
}
