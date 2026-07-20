//! Guarantees that the embedded-UI directory exists before compilation.
//!
//! `rust-embed` reads `apps/web/dist` at compile time and fails the build if it
//! is missing. That directory is produced by the web build, which is a separate
//! toolchain — so a clean clone, a CI job that only runs Rust, or a contributor
//! who does not have Node installed would all hit a build failure in a crate
//! that has nothing to do with the UI.
//!
//! `cargo build` must never fail because a JavaScript bundle has not been built.
//! So: if the directory has no `index.html`, write a placeholder page that
//! explains how to build the real one. If one already exists it is left
//! completely alone — this must never clobber a real UI build.

use std::path::Path;

const PLACEHOLDER: &str = r#"<!doctype html>
<meta charset="utf-8">
<title>molao</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark light; }
  body {
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 42rem; margin: 12vh auto; padding: 0 1.5rem;
    background: #0A0A0A; color: #D4D4D8;
  }
  h1 { font-weight: 600; letter-spacing: -0.02em; color: #FAFAFA; margin-bottom: 0.25rem; }
  .accent { color: #E9A23B; }
  code { background: #18181B; padding: 0.15em 0.4em; border-radius: 3px; color: #FAFAFA; }
  a { color: #E9A23B; }
  .note { border-left: 2px solid #26262B; padding-left: 1rem; color: #A1A1AA; }
</style>
<h1>molao</h1>
<p class="accent">The law, held in common.</p>
<div class="note">
  <p>
    This node is running, but the web interface has not been built. This is a
    placeholder page written by the Rust build so that <code>cargo build</code>
    works without the JavaScript toolchain.
  </p>
  <p>To build the real interface:</p>
  <p><code>cd apps/web &amp;&amp; npm install &amp;&amp; npm run build</code></p>
  <p>Then rebuild the node. The API is available regardless:</p>
  <p><code>curl localhost:8737/api/status</code></p>
</div>
"#;

fn main() {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("cargo always sets this");
    let dist = Path::new(&manifest).join("../../apps/web/dist");

    println!("cargo:rerun-if-changed={}", dist.display());

    let index = dist.join("index.html");
    if index.exists() {
        return; // a real UI build is present; leave it untouched
    }

    if let Err(e) = std::fs::create_dir_all(&dist) {
        // Not fatal on its own — report it and let rust-embed produce the real
        // error if the directory genuinely cannot be read.
        println!("cargo:warning=could not create {}: {e}", dist.display());
        return;
    }
    if let Err(e) = std::fs::write(&index, PLACEHOLDER) {
        println!("cargo:warning=could not write {}: {e}", index.display());
    }
}
