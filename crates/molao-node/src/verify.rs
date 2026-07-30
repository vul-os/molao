//! Release verification for `molao verify` — all seven steps.
//!
//! Verification answers a bounded question: **is the corpus on this disk the
//! one a quorum of the signer set signed?** It says nothing about whether the
//! judgments are accurate, whether the signers are trustworthy, or whether the
//! law is correctly stated. A node verifies bytes and signatures. Wording
//! anywhere near this code must not suggest more.
//!
//! The signer set is supplied by the reader, not read out of the release. A
//! release that carried its own list of who may sign it would be a release that
//! authorised itself, and the k-of-n guarantee would mean nothing. What the
//! release *does* carry is a fingerprint of the set it was signed under, which
//! is a commitment rather than a list — see step 2.
//!
//! ## Seven steps, reported one by one
//!
//! [`docs/RELEASES.md`](../../../docs/RELEASES.md) describes the flow a reader
//! should follow. These are its mechanical parts. It listed six; step 2 is a
//! seventh that became checkable when `Manifest::signer_set` was added.
//!
//! | # | Step | Needs |
//! |---|---|---|
//! | 1 | the signer set is one that can deliver a quorum | the signer set |
//! | 2 | the release was signed under *this* signer set | release + signer set |
//! | 3 | a quorum actually signed this manifest | release + signer set |
//! | 4 | the release chains onto the head you already hold | `--previous`, or a genesis release |
//! | 5 | every document re-hashes to the id it claims | `--db` |
//! | 6 | `corpus_root` and `doc_count` match the documents held | `--db` |
//! | 7 | re-running the pinned extractor reproduces `graph_root` | `--db` |
//!
//! A step is reported `PASS`, `FAIL`, or `SKIP`, and **`SKIP` is not a pass**.
//! Running three checks and printing OK is the exact failure this per-step
//! reporting exists to prevent, so an incomplete run exits 2 rather than 0 —
//! see [`Outcome`].
//!
//! Step 1 has an un-automatable half. Confirming the set you hold is the set
//! the signing organisations published is a human comparing two values out of
//! band; all this code can do is print [`SignerSet::fingerprint`] and say so.
//! Step 2 is the in-band half of the same question, and answers only the part
//! that can be answered mechanically: whether the roster you hold is the roster
//! the signers said they were acting for.
//!
//! Steps 2 and 3 are deliberately separate calls —
//! [`SignerSet::check_binds`] and [`SignedRelease::verify_signatures`] — rather
//! than one call to `SignedRelease::verify`, which does both. If step 3 went
//! through the composed function, a break in step 2 could never be observed on
//! its own: the composed check would catch it and step 2 would look alive while
//! being dead. Each step must be able to go red by itself.
//!
//! ## Why step 7 is not "compare two strings"
//!
//! `graph_root` is only worth anything because the graph is reproducible: the
//! manifest pins an `extractor_version`, and anyone can re-run that version over
//! the same text and must get byte-identical output. So step 7 does exactly
//! that — it re-extracts every citation from the stored paragraph text with
//! `molao-cite`, resolves them, rebuilds the edge set, and recomputes the root.
//! It never reads the stored citation table for its answer; it *also* rebuilds
//! from that table and requires the two to agree, so a corpus whose citation
//! rows were edited underneath its paragraph text fails rather than verifying
//! against its own tampering.
//!
//! A binary whose extractor is not the pinned one cannot perform this step and
//! says so. It does not compare the roots anyway and call it a pass.

use anyhow::{Context, Result};
use molao_core::doc::DocId;
use molao_core::roots::{self, GraphEdge};
use molao_core::{Manifest, SignedRelease, SignerSet};
use molao_corpus::Corpus;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

/// How many steps a full verification has. A [`Report`] that does not carry
/// exactly this many, numbered 1 to `STEP_COUNT`, is a bug in this module and
/// is rejected rather than printed — a verifier that quietly dropped a step
/// would report a narrower check under a wider name.
pub const STEP_COUNT: usize = 7;

/// The result of one step.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepStatus {
    Pass,
    Fail(String),
    /// The step could not run, with the reason. Never a pass.
    Skip(String),
}

impl StepStatus {
    pub fn label(&self) -> &'static str {
        match self {
            StepStatus::Pass => "PASS",
            StepStatus::Fail(_) => "FAIL",
            StepStatus::Skip(_) => "SKIP",
        }
    }

    pub fn message(&self) -> Option<&str> {
        match self {
            StepStatus::Pass => None,
            StepStatus::Fail(m) | StepStatus::Skip(m) => Some(m),
        }
    }
}

/// One numbered step, its verdict, and the evidence behind it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    pub number: usize,
    pub name: &'static str,
    pub status: StepStatus,
    /// What was actually examined — counts, roots, fingerprints. Printed on a
    /// pass as well as a failure, because "PASS" over nothing is exactly what a
    /// reader needs to be able to catch.
    pub detail: String,
}

/// A step's verdict before it is numbered.
///
/// Steps do not name or number themselves. They used to, and ten of them were
/// silently wrong on their failure paths — a step that passed reported `5` and
/// the same step failing reported `4`, because the number was hand-written at
/// every `return` and the tests only ever exercised the passing branch. The
/// numbering now comes from [`STEP_NAMES`] in [`verify`], in order, so the two
/// cannot disagree and no future branch can carry the wrong label.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub status: StepStatus,
    pub detail: String,
}

fn finding(status: StepStatus, detail: impl Into<String>) -> Finding {
    Finding {
        status,
        detail: detail.into(),
    }
}

/// The steps, in order. The index is the step number minus one.
const STEP_NAMES: [&str; STEP_COUNT] = [
    "signer set",
    "signer-set binding",
    "signatures",
    "chain",
    "documents",
    "corpus root",
    "graph root",
];

/// The overall answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// All seven steps ran and passed.
    Verified,
    /// At least one step failed.
    Failed,
    /// Nothing failed, but at least one step could not run. Not a pass: the
    /// release may be perfectly good and this node has not checked it.
    Incomplete,
}

impl Outcome {
    /// Process exit code. Distinct codes so a script can tell "this release is
    /// bad" from "you did not give me enough to tell".
    pub fn exit_code(self) -> i32 {
        match self {
            Outcome::Verified => 0,
            Outcome::Failed => 1,
            Outcome::Incomplete => 2,
        }
    }
}

/// What verification found, step by step.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    pub release: u64,
    pub steps: Vec<Step>,
}

impl Report {
    pub fn outcome(&self) -> Outcome {
        if self
            .steps
            .iter()
            .any(|s| matches!(s.status, StepStatus::Fail(_)))
        {
            Outcome::Failed
        } else if self
            .steps
            .iter()
            .any(|s| matches!(s.status, StepStatus::Skip(_)))
        {
            Outcome::Incomplete
        } else {
            Outcome::Verified
        }
    }

    pub fn passed(&self) -> usize {
        self.steps
            .iter()
            .filter(|s| s.status == StepStatus::Pass)
            .count()
    }

    pub fn ok(&self) -> bool {
        self.outcome() == Outcome::Verified
    }

    /// Reject a report that is not a full seven numbered 1..=7, exactly once
    /// each. Called before anything renders or acts on one.
    pub fn check_shape(&self) -> Result<()> {
        anyhow::ensure!(
            self.steps.len() == STEP_COUNT,
            "verification produced {} step(s), not {STEP_COUNT}",
            self.steps.len()
        );
        let numbers: Vec<usize> = self.steps.iter().map(|s| s.number).collect();
        anyhow::ensure!(
            numbers == (1..=STEP_COUNT).collect::<Vec<_>>(),
            "verification steps are numbered {numbers:?}, not 1..={STEP_COUNT}"
        );
        Ok(())
    }
}

/// Everything a full verification can look at. The optional fields are optional
/// because a reader may genuinely not have them yet — not because they are
/// optional to a conclusion.
#[derive(Debug)]
pub struct Inputs<'a> {
    pub release: &'a SignedRelease,
    pub signers: &'a SignerSet,
    /// The manifest of the head this reader already trusts, for step 4.
    pub previous: Option<&'a Manifest>,
    /// The corpus this node holds, for steps 5, 6 and 7.
    pub corpus: Option<&'a Corpus>,
}

/// Load a release and a signer set from disk and verify what is available.
///
/// Missing or malformed files are errors, not a failed verdict: "this file is
/// not a release" and "this release is not signed" are different problems, and
/// collapsing them would let a typo in a path read as a verification failure.
pub fn verify_files(
    release_path: &Path,
    signers_path: &Path,
    previous_path: Option<&Path>,
    db_path: Option<&Path>,
) -> Result<Report> {
    let release: SignedRelease = read_json(release_path, "release")?;
    let signers: SignerSet = read_json(signers_path, "signer set")?;
    let previous: Option<Manifest> = match previous_path {
        Some(p) => Some(read_json(p, "previous manifest")?),
        None => None,
    };
    let corpus = match db_path {
        Some(p) => {
            Some(Corpus::open(p).with_context(|| format!("opening corpus {}", p.display()))?)
        }
        None => None,
    };

    Ok(verify(&Inputs {
        release: &release,
        signers: &signers,
        previous: previous.as_ref(),
        corpus: corpus.as_ref(),
    }))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path, what: &str) -> Result<T> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("reading {what} {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("parsing {what} {}", path.display()))
}

/// Run every step that can be run, and report the rest as skipped.
///
/// No step short-circuits another. A release with a bad signature still has its
/// corpus root checked, because "which properties hold" is more useful to
/// whoever has to fix it than "the first one that did not".
pub fn verify(inputs: &Inputs<'_>) -> Report {
    let manifest = &inputs.release.manifest;
    let findings = [
        step_1_signer_set(inputs.signers),
        step_2_signer_set_binding(manifest, inputs.signers),
        step_3_signatures(inputs.release, inputs.signers),
        step_4_chain(inputs.release, inputs.previous),
        step_5_documents(inputs.corpus),
        step_6_corpus_root(manifest, inputs.corpus),
        step_7_graph_root(manifest, inputs.corpus),
    ];
    Report {
        release: manifest.release,
        steps: findings
            .into_iter()
            .zip(STEP_NAMES)
            .enumerate()
            .map(|(i, (f, name))| Step {
                number: i + 1,
                name,
                status: f.status,
                detail: f.detail,
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------
// Step 1 — the signer set
// ---------------------------------------------------------------------------

fn step_1_signer_set(signers: &SignerSet) -> Finding {
    let fingerprint = signers.fingerprint();
    let detail = format!(
        "threshold {} of {} signer(s), epoch {}, set fingerprint {}",
        signers.threshold,
        signers.signers.len(),
        signers.epoch,
        &fingerprint[..16]
    );
    let status = match signers.validate() {
        Ok(()) => StepStatus::Pass,
        Err(e) => StepStatus::Fail(e.to_string()),
    };
    finding(status, detail)
}

// ---------------------------------------------------------------------------
// Step 2 — the release names this signer set
// ---------------------------------------------------------------------------

fn step_2_signer_set_binding(manifest: &Manifest, signers: &SignerSet) -> Finding {
    let held = signers.fingerprint();
    let detail = format!(
        "release names signer set {}, this node holds {}",
        short(&manifest.signer_set),
        short(&held)
    );
    // Deliberately NOT `SignedRelease::verify`, which composes this check with
    // the signature check. Going through the composed call would make a break
    // here invisible behind step 3.
    let status = match signers.check_binds(manifest) {
        Ok(()) => StepStatus::Pass,
        Err(e) => StepStatus::Fail(e.to_string()),
    };
    finding(status, detail)
}

/// First 16 characters of a hex digest — enough to compare by eye, and the
/// whole value is in the release and the signer set for anyone who wants it.
fn short(hex: &str) -> &str {
    &hex[..hex.len().min(16)]
}

// ---------------------------------------------------------------------------
// Step 3 — a quorum signed this manifest
// ---------------------------------------------------------------------------

fn step_3_signatures(release: &SignedRelease, signers: &SignerSet) -> Finding {
    match release.verify_signatures(signers) {
        Ok(count) => finding(
            StepStatus::Pass,
            format!(
                "{count} distinct valid signature(s) over the manifest, threshold {}",
                signers.threshold
            ),
        ),
        Err(e) => finding(
            StepStatus::Fail(e.to_string()),
            format!(
                "{} signature(s) offered, threshold {}",
                release.signatures.len(),
                signers.threshold
            ),
        ),
    }
}

// ---------------------------------------------------------------------------
// Step 4 — the chain
// ---------------------------------------------------------------------------

fn step_4_chain(release: &SignedRelease, previous: Option<&Manifest>) -> Finding {
    let m = &release.manifest;
    let describe = |p: &Manifest| format!("release {} onto release {}", m.release, p.release);

    let (status, detail) = match previous {
        Some(prev) => {
            if release.chains_onto(prev) {
                (
                    StepStatus::Pass,
                    format!("{}, previous = {}", describe(prev), prev.hash()),
                )
            } else {
                (
                    StepStatus::Fail(format!(
                        "release {} does not chain onto release {}: it names previous = {:?}, \
                         but that manifest hashes to {}",
                        m.release,
                        prev.release,
                        m.previous.as_deref().unwrap_or("(none)"),
                        prev.hash()
                    )),
                    describe(prev),
                )
            }
        }
        // Nothing to chain onto was supplied. Release 0 with no predecessor is
        // the one case that needs nothing: it is the start of the chain.
        None if m.release == 0 && m.previous.is_none() => (
            StepStatus::Pass,
            "genesis release 0, no predecessor to chain onto".into(),
        ),
        // A non-genesis release that names no predecessor is broken on its own
        // terms, and that is checkable with no extra input at all.
        None if m.previous.is_none() => (
            StepStatus::Fail(format!(
                "release {} names no previous manifest; only release 0 may do that",
                m.release
            )),
            format!("release {}, previous = (none)", m.release),
        ),
        None => (
            StepStatus::Skip(
                "no previous manifest supplied — pass --previous <manifest.json> for the head \
                 you already trust"
                    .into(),
            ),
            format!(
                "release {} names previous = {}",
                m.release,
                m.previous.as_deref().unwrap_or("(none)")
            ),
        ),
    };
    finding(status, detail)
}

// ---------------------------------------------------------------------------
// Step 5 — every document re-hashes to its own id
// ---------------------------------------------------------------------------

fn step_5_documents(corpus: Option<&Corpus>) -> Finding {
    let Some(corpus) = corpus else {
        return finding(skip_no_db(), "not examined");
    };
    match rehash_documents(corpus) {
        Err(e) => finding(StepStatus::Fail(format!("{e:#}")), "not examined"),
        Ok((examined, bad)) => {
            let detail = format!("{examined} document(s) re-hashed from their stored text");
            if bad.is_empty() {
                finding(StepStatus::Pass, detail)
            } else {
                finding(
                    StepStatus::Fail(format!(
                        "{} document(s) do not hash to the id they are stored under, first: {}",
                        bad.len(),
                        bad[0]
                    )),
                    detail,
                )
            }
        }
    }
}

/// Re-hash every document, returning how many were examined and which failed.
///
/// The count is returned rather than discarded so the caller can report it: a
/// document check that silently examined nothing is indistinguishable from one
/// that examined everything and found nothing wrong.
fn rehash_documents(corpus: &Corpus) -> Result<(usize, Vec<DocId>)> {
    let mut examined = 0usize;
    let mut bad = Vec::new();
    for node in corpus.nodes().context("listing documents")? {
        let id: DocId = node
            .id
            .parse()
            .with_context(|| format!("stored document id {:?} is not an id", node.id))?;
        let judgment = corpus
            .judgment(&id)
            .with_context(|| format!("reading document {id}"))?
            .with_context(|| format!("document {id} is listed but cannot be read"))?;
        examined += 1;
        if !judgment.verify_id() {
            bad.push(id);
        }
    }
    Ok((examined, bad))
}

// ---------------------------------------------------------------------------
// Step 6 — corpus root
// ---------------------------------------------------------------------------

fn step_6_corpus_root(manifest: &Manifest, corpus: Option<&Corpus>) -> Finding {
    let Some(corpus) = corpus else {
        return finding(skip_no_db(), "not examined");
    };
    let ids = match document_ids(corpus) {
        Ok(ids) => ids,
        Err(e) => return finding(StepStatus::Fail(format!("{e:#}")), "not examined"),
    };
    let computed = roots::corpus_root(&ids);
    let detail = format!("{} document(s), recomputed root {computed}", ids.len());

    if ids.len() as u64 != manifest.doc_count {
        return finding(
            StepStatus::Fail(format!(
                "manifest claims {} document(s); this corpus holds {}",
                manifest.doc_count,
                ids.len()
            )),
            detail,
        );
    }
    if computed != manifest.corpus_root {
        return finding(
            StepStatus::Fail(format!(
                "manifest corpus_root is {}, this corpus computes {computed}",
                manifest.corpus_root
            )),
            detail,
        );
    }
    finding(StepStatus::Pass, detail)
}

fn document_ids(corpus: &Corpus) -> Result<Vec<DocId>> {
    corpus
        .nodes()
        .context("listing documents")?
        .into_iter()
        .map(|n| {
            n.id.parse::<DocId>()
                .with_context(|| format!("stored document id {:?} is not an id", n.id))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Step 7 — graph root, by re-running the pinned extractor
// ---------------------------------------------------------------------------

fn step_7_graph_root(manifest: &Manifest, corpus: Option<&Corpus>) -> Finding {
    // A binary that is not the pinned extractor cannot perform this step. It
    // must say so rather than compare roots anyway: agreeing by accident and
    // agreeing by reproduction are not the same claim.
    if manifest.extractor_version != molao_cite::EXTRACTOR_VERSION {
        return finding(
            StepStatus::Skip(format!(
                "the manifest pins {}, this binary is {} — re-run with the pinned extractor",
                manifest.extractor_version,
                molao_cite::EXTRACTOR_VERSION
            )),
            "not examined",
        );
    }
    let Some(corpus) = corpus else {
        return finding(skip_no_db(), "not examined");
    };

    let reextracted = match reextract_edges(corpus) {
        Ok(e) => e,
        Err(e) => return finding(StepStatus::Fail(format!("{e:#}")), "not examined"),
    };
    let stored = match stored_edges(corpus) {
        Ok(e) => e,
        Err(e) => return finding(StepStatus::Fail(format!("{e:#}")), "not examined"),
    };

    let computed = roots::graph_root(&reextracted);
    let profile = molao_core::region::default_profile();
    let detail = format!(
        "{} edge(s) re-extracted with {} under region profile {} ({}), recomputed root {computed}",
        reextracted.len(),
        molao_cite::EXTRACTOR_VERSION,
        profile.code,
        &profile.fingerprint()[..16],
    );

    // The stored citation table must say the same thing the text does. If it
    // does not, the corpus has been edited underneath its own paragraphs, and
    // whichever of the two happens to match the manifest is not the point.
    if roots::graph_bytes(&stored) != roots::graph_bytes(&reextracted) {
        return finding(
            StepStatus::Fail(format!(
                "the stored citation graph ({} edge(s), root {}) is not what re-running {} over \
                 this corpus's text produces ({} edge(s)) — the citation table and the paragraph \
                 text disagree",
                stored.len(),
                roots::graph_root(&stored),
                molao_cite::EXTRACTOR_VERSION,
                reextracted.len(),
            )),
            detail,
        );
    }
    if computed != manifest.graph_root {
        return finding(
            StepStatus::Fail(format!(
                "manifest graph_root is {}, re-extraction computes {computed}",
                manifest.graph_root
            )),
            detail,
        );
    }
    finding(StepStatus::Pass, detail)
}

/// Rebuild the citation edge set **from the paragraph text**, by running the
/// pinned extractor again. This reads no citation rows; it produces them.
pub fn reextract_edges(corpus: &Corpus) -> Result<Vec<GraphEdge>> {
    let mut paragraphs_citing: BTreeMap<(DocId, DocId), BTreeSet<u32>> = BTreeMap::new();
    // Cache key → target: the same citation key recurs constantly across a real
    // corpus, and each miss is a SQL round trip.
    let mut resolved: BTreeMap<String, Option<DocId>> = BTreeMap::new();

    for para in corpus.paragraphs().context("reading paragraph text")? {
        let from: DocId = para
            .doc_id
            .parse()
            .with_context(|| format!("stored document id {:?} is not an id", para.doc_id))?;
        for found in molao_cite::extract(&para.text) {
            let key = found.citation.key();
            let target = match resolved.get(&key) {
                Some(t) => *t,
                None => {
                    let t = corpus
                        .resolve(&key)
                        .with_context(|| format!("resolving citation {key}"))?;
                    resolved.insert(key, t);
                    t
                }
            };
            // An unresolved citation is not an edge — the corpus does not hold
            // what it points at. A self-citation is not one either.
            let Some(to) = target else { continue };
            if to == from {
                continue;
            }
            paragraphs_citing
                .entry((from, to))
                .or_default()
                .insert(para.index);
        }
    }

    Ok(paragraphs_citing
        .into_iter()
        .map(|((from, to), paras)| GraphEdge::new(from, to, paras.len() as u32))
        .collect())
}

/// The edge set as the corpus's own citation table records it.
fn stored_edges(corpus: &Corpus) -> Result<Vec<GraphEdge>> {
    Ok(corpus
        .resolved_edges()
        .context("reading stored citation edges")?
        .into_iter()
        .map(|e| GraphEdge::new(e.from, e.to, e.paragraph_count))
        .collect())
}

fn skip_no_db() -> StepStatus {
    StepStatus::Skip("no corpus supplied — pass --db <corpus.db> to check it".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer as _;
    use molao_core::release::ManifestSignature;
    use molao_core::{Judgment, Paragraph, Signer};

    fn keypair(seed: u8) -> (ed25519_dalek::SigningKey, String) {
        let sk = ed25519_dalek::SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    /// A 2-of-3 set. Never 1-of-1: `threshold >= 2` is enforced in code and is
    /// not relaxed for tests, so tests that need a valid set build a real one.
    fn signer_set() -> (SignerSet, Vec<(ed25519_dalek::SigningKey, String)>) {
        let pairs: Vec<_> = (1..=3u8).map(keypair).collect();
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: pairs
                .iter()
                .enumerate()
                .map(|(i, (_, pk))| Signer {
                    name: format!("institution-{i}"),
                    key: pk.clone(),
                })
                .collect(),
        };
        (set, pairs)
    }

    fn sign(
        m: &Manifest,
        pairs: &[(ed25519_dalek::SigningKey, String)],
        n: usize,
    ) -> SignedRelease {
        SignedRelease {
            manifest: m.clone(),
            signatures: pairs[..n]
                .iter()
                .map(|(sk, pk)| ManifestSignature {
                    key: pk.clone(),
                    signature: hex::encode(sk.sign(&m.signing_bytes()).to_bytes()),
                })
                .collect(),
        }
    }

    fn judgment(court: &str, cite: &str, paragraphs: &[&str]) -> Judgment {
        let mut j = Judgment {
            id: DocId::of_canonical("placeholder"),
            court: court.into(),
            title: format!("Matter of {cite}"),
            neutral_citation: Some(cite.into()),
            reported_citations: vec![],
            case_numbers: vec![],
            date: Some("2026-01-01".into()),
            judges: vec![],
            paragraphs: paragraphs
                .iter()
                .enumerate()
                .map(|(i, t)| Paragraph {
                    index: i as u32,
                    number: Some((i + 1).to_string()),
                    text: molao_core::canonicalise(t).trim_end().to_string(),
                })
                .collect(),
        };
        j.id = DocId::of_canonical(&j.canonical_text());
        j
    }

    /// A corpus of two judgments, the second citing the first twice.
    fn corpus() -> Corpus {
        let mut c = Corpus::open_in_memory().unwrap();
        let first = judgment("ZACC", "[2020] ZACC 1", &["The appeal is upheld."]);
        let second = judgment(
            "ZASCA",
            "[2021] ZASCA 2",
            &[
                "We follow [2020] ZACC 1 at para 4.",
                "Nothing in this paragraph cites anything.",
                "Again, [2020] ZACC 1 is decisive.",
            ],
        );
        c.insert_judgment(&first, &[]).unwrap();
        c.insert_judgment(&second, &[]).unwrap();
        c.relink().unwrap();
        c
    }

    /// Every document id in the corpus, sorted — the same order step 6 uses.
    fn corpus_ids(c: &Corpus) -> Vec<DocId> {
        let mut ids = document_ids(c).unwrap();
        ids.sort();
        ids
    }

    fn manifest_for(c: &Corpus) -> Manifest {
        manifest_bound_to(c, &signer_set().0)
    }

    fn manifest_bound_to(c: &Corpus, set: &SignerSet) -> Manifest {
        Manifest {
            release: 0,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            corpus_root: c.corpus_root().unwrap(),
            doc_count: c.nodes().unwrap().len() as u64,
            graph_root: roots::graph_root(&reextract_edges(c).unwrap()),
            extractor_version: molao_cite::EXTRACTOR_VERSION.to_string(),
            signer_set: set.fingerprint(),
        }
    }

    fn full(c: &Corpus) -> Report {
        let (set, pairs) = signer_set();
        let release = sign(&manifest_for(c), &pairs, 2);
        verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(c),
        })
    }

    // -- shape ------------------------------------------------------------

    #[test]
    fn a_report_is_always_exactly_seven_numbered_steps() {
        let c = corpus();
        let report = full(&c);
        report.check_shape().expect("well-formed report");
        assert_eq!(report.steps.len(), STEP_COUNT);
        assert_eq!(
            report.steps.iter().map(|s| s.number).collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5, 6, 7]
        );
        assert_eq!(
            report.steps.iter().map(|s| s.name).collect::<Vec<_>>(),
            vec![
                "signer set",
                "signer-set binding",
                "signatures",
                "chain",
                "documents",
                "corpus root",
                "graph root"
            ]
        );
    }

    /// Every step, driven into every branch it has, with the shape checked each
    /// time.
    ///
    /// This exists because it did not, and ten steps were numbered wrongly on
    /// their failure paths without one test noticing: the passing branch of a
    /// step said `5` and its failing branch said `4`. Tests asserted
    /// `steps[4]` by index and were happy, and `check_shape` — the guard that
    /// would have caught it — was only ever called on a report where everything
    /// passed. It surfaced when the real binary was run against a tampered
    /// corpus, which is far too late for a verifier.
    ///
    /// Numbering is now assigned centrally from `STEP_NAMES` and cannot be
    /// hand-written, so that class is gone. This covers the branches anyway,
    /// because the real lesson is "the guard was never run on the interesting
    /// input", and that can recur in any shape.
    #[test]
    fn every_branch_of_every_step_produces_a_well_formed_report() {
        let (set, pairs) = signer_set();
        let good = corpus();

        // A corpus edited underneath its own ids: steps 5 and 7 both fail.
        let broken = corpus();
        let victim = corpus_ids(&broken)[0];
        broken
            .connection()
            .execute(
                "UPDATE paragraphs SET text = 'tampered' WHERE doc_id = ?1 AND idx = 0",
                [victim.to_string()],
            )
            .unwrap();

        // A corpus holding a different set of documents: intact, just not the
        // one the manifest names. Editing text does not change the *id set*, so
        // step 6 needs this rather than `broken`.
        let mut smaller = Corpus::open_in_memory().unwrap();
        smaller
            .insert_judgment(
                &judgment("ZACC", "[2020] ZACC 1", &["The appeal is upheld."]),
                &[],
            )
            .unwrap();

        let mut wrong_roster = set.clone();
        wrong_roster.epoch = 42;
        let mut unreachable = set.clone();
        unreachable.threshold = 99;

        let head = manifest_for(&good);
        let mut successor = manifest_for(&good);
        successor.release = 4;
        successor.previous = Some("ab".repeat(32));
        let mut forked = manifest_for(&good);
        forked.release = 4;
        forked.previous = Some("ff".repeat(32));
        let mut old_extractor = manifest_for(&good);
        old_extractor.extractor_version = "molao-cite@0.0.1".into();

        let scenarios: Vec<(&str, Report)> = vec![
            ("all pass", full(&good)),
            (
                // Non-genesis, no head supplied, no corpus: every skippable
                // step skips at once.
                "everything skippable skipped",
                verify(&Inputs {
                    release: &sign(&successor, &pairs, 2),
                    signers: &set,
                    previous: None,
                    corpus: None,
                }),
            ),
            (
                "unusable signer set",
                verify(&Inputs {
                    release: &sign(&manifest_for(&good), &pairs, 2),
                    signers: &unreachable,
                    previous: None,
                    corpus: Some(&good),
                }),
            ),
            (
                "wrong roster",
                verify(&Inputs {
                    release: &sign(&manifest_for(&good), &pairs, 2),
                    signers: &wrong_roster,
                    previous: None,
                    corpus: Some(&good),
                }),
            ),
            (
                "too few signatures",
                verify(&Inputs {
                    release: &sign(&manifest_for(&good), &pairs, 1),
                    signers: &set,
                    previous: None,
                    corpus: Some(&good),
                }),
            ),
            (
                "forked chain",
                verify(&Inputs {
                    release: &sign(&forked, &pairs, 2),
                    signers: &set,
                    previous: Some(&head),
                    corpus: Some(&good),
                }),
            ),
            (
                "tampered corpus",
                verify(&Inputs {
                    release: &sign(&manifest_for(&good), &pairs, 2),
                    signers: &set,
                    previous: None,
                    corpus: Some(&broken),
                }),
            ),
            (
                "a different corpus entirely",
                verify(&Inputs {
                    release: &sign(&manifest_for(&good), &pairs, 2),
                    signers: &set,
                    previous: None,
                    corpus: Some(&smaller),
                }),
            ),
            (
                "extractor not pinned to this binary",
                verify(&Inputs {
                    release: &sign(&old_extractor, &pairs, 2),
                    signers: &set,
                    previous: None,
                    corpus: Some(&good),
                }),
            ),
        ];

        // Covering nothing must not read as passing.
        assert_eq!(scenarios.len(), 9, "the scenario matrix lost entries");

        let mut seen_pass = [false; STEP_COUNT];
        let mut seen_fail = [false; STEP_COUNT];
        let mut seen_skip = [false; STEP_COUNT];
        for (what, report) in &scenarios {
            report
                .check_shape()
                .unwrap_or_else(|e| panic!("{what}: {e}"));
            for (i, step) in report.steps.iter().enumerate() {
                assert_eq!(step.number, i + 1, "{what}: step {i} mis-numbered");
                assert_eq!(step.name, STEP_NAMES[i], "{what}: step {i} mis-named");
                match step.status {
                    StepStatus::Pass => seen_pass[i] = true,
                    StepStatus::Fail(_) => seen_fail[i] = true,
                    StepStatus::Skip(_) => seen_skip[i] = true,
                }
            }
        }

        // Every step must have been seen passing *and* failing somewhere above,
        // or a branch went unexercised — which is exactly how the numbering bug
        // survived.
        for (i, seen) in seen_pass.iter().enumerate() {
            assert!(seen, "step {} was never seen passing", i + 1);
        }
        for (i, seen) in seen_fail.iter().enumerate() {
            assert!(seen, "step {} was never seen failing", i + 1);
        }
        // Steps 4 to 7 are the ones that can be skipped.
        for (i, seen) in seen_skip.iter().enumerate().skip(3) {
            assert!(seen, "step {} was never seen skipped", i + 1);
        }
    }

    #[test]
    fn check_shape_rejects_a_report_that_lost_a_step() {
        let c = corpus();
        let mut report = full(&c);
        report.steps.remove(4);
        assert!(report.check_shape().is_err());
    }

    #[test]
    fn a_good_release_against_its_own_corpus_passes_all_seven() {
        let c = corpus();
        let report = full(&c);
        assert_eq!(report.passed(), STEP_COUNT, "{:#?}", report.steps);
        assert_eq!(report.outcome(), Outcome::Verified);
        assert_eq!(report.outcome().exit_code(), 0);
    }

    #[test]
    fn every_step_reports_what_it_examined_not_just_that_it_passed() {
        let c = corpus();
        for step in full(&c).steps {
            assert!(
                !step.detail.is_empty() && step.detail != "not examined",
                "step {} passed with no evidence of what it looked at",
                step.number
            );
        }
    }

    // -- skips are not passes ---------------------------------------------

    #[test]
    fn a_release_with_no_corpus_is_incomplete_not_verified() {
        let (set, pairs) = signer_set();
        let c = corpus();
        let release = sign(&manifest_for(&c), &pairs, 2);
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: None,
        });
        assert_eq!(report.outcome(), Outcome::Incomplete);
        assert_eq!(report.outcome().exit_code(), 2);
        assert!(
            !report.ok(),
            "an unchecked release must not read as verified"
        );
        // Exactly the three corpus steps are skipped.
        let skipped: Vec<usize> = report
            .steps
            .iter()
            .filter(|s| matches!(s.status, StepStatus::Skip(_)))
            .map(|s| s.number)
            .collect();
        assert_eq!(skipped, vec![5, 6, 7]);
    }

    #[test]
    fn a_failure_outranks_a_skip() {
        let (set, pairs) = signer_set();
        let c = corpus();
        let release = sign(&manifest_for(&c), &pairs, 1); // one short
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: None,
        });
        assert_eq!(report.outcome(), Outcome::Failed);
        assert_eq!(report.outcome().exit_code(), 1);
    }

    // -- step 1 ------------------------------------------------------------

    #[test]
    fn step_1_fails_a_single_signer_set_however_valid_its_signature() {
        let (sk, pk) = keypair(9);
        let c = corpus();
        let m = manifest_for(&c);
        let release = SignedRelease {
            signatures: vec![ManifestSignature {
                key: pk.clone(),
                signature: hex::encode(sk.sign(&m.signing_bytes()).to_bytes()),
            }],
            manifest: m,
        };
        let set = SignerSet {
            threshold: 1,
            epoch: 1,
            signers: vec![Signer {
                name: "sole operator".into(),
                key: pk,
            }],
        };
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert!(matches!(report.steps[0].status, StepStatus::Fail(_)));
        assert_eq!(report.outcome(), Outcome::Failed);
    }

    #[test]
    fn step_1_prints_a_fingerprint_a_reader_can_compare_out_of_band() {
        let (set, _) = signer_set();
        let step = step_1_signer_set(&set);
        assert!(step.detail.contains(&set.fingerprint()[..16]), "{step:?}");
    }

    // -- step 2 ------------------------------------------------------------

    #[test]
    fn step_2_fails_when_the_release_was_signed_under_a_different_roster() {
        // A full, cryptographically sound quorum of a superseded set.
        let (old_set, pairs) = signer_set();
        let mut rotated = old_set.clone();
        rotated.epoch = 2;

        let c = corpus();
        let m = manifest_bound_to(&c, &old_set);
        let release = sign(&m, &pairs, 2);

        let report = verify(&Inputs {
            release: &release,
            signers: &rotated,
            previous: None,
            corpus: Some(&c),
        });
        assert!(
            matches!(report.steps[1].status, StepStatus::Fail(_)),
            "{:#?}",
            report.steps[1]
        );
        assert_eq!(report.outcome(), Outcome::Failed);
        // The evidence names both values, so a reader can see which roster to
        // go and fetch.
        assert!(report.steps[1]
            .detail
            .contains(&old_set.fingerprint()[..16]));
        assert!(report.steps[1]
            .detail
            .contains(&rotated.fingerprint()[..16]));
    }

    #[test]
    fn step_2_and_step_3_fail_independently_neither_backstops_the_other() {
        let (set, pairs) = signer_set();
        let c = corpus();

        // Binding wrong, signatures a genuine quorum over what was signed.
        let mut other = set.clone();
        other.epoch = 9;
        let m = manifest_bound_to(&c, &other);
        let release = sign(&m, &pairs, 2);
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert!(matches!(report.steps[1].status, StepStatus::Fail(_)));
        assert_eq!(
            report.steps[2].status,
            StepStatus::Pass,
            "step 3 must judge signatures alone: {:#?}",
            report.steps[2]
        );

        // Binding right, signatures short.
        let m = manifest_bound_to(&c, &set);
        let release = sign(&m, &pairs, 1);
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert_eq!(report.steps[1].status, StepStatus::Pass);
        assert!(matches!(report.steps[2].status, StepStatus::Fail(_)));
    }

    // -- step 3 ------------------------------------------------------------

    #[test]
    fn step_3_fails_when_the_manifest_was_altered_after_signing() {
        let (set, pairs) = signer_set();
        let c = corpus();
        let mut m = manifest_for(&c);
        let signatures = sign(&m, &pairs, 3).signatures;
        m.corpus_root = "cc".repeat(32);
        let release = SignedRelease {
            manifest: m,
            signatures,
        };
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert!(matches!(report.steps[2].status, StepStatus::Fail(_)));
        // And step 6 independently notices the root does not match the corpus:
        // no step leans on another's answer.
        assert!(matches!(report.steps[5].status, StepStatus::Fail(_)));
    }

    // -- step 4 ------------------------------------------------------------

    #[test]
    fn step_4_passes_for_a_genuine_successor_and_fails_for_a_fork() {
        let c = corpus();
        let first = manifest_for(&c);
        let mut second = first.clone();
        second.release = 1;
        second.previous = Some(first.hash());
        let (set, pairs) = signer_set();

        let good = sign(&second, &pairs, 2);
        let report = verify(&Inputs {
            release: &good,
            signers: &set,
            previous: Some(&first),
            corpus: Some(&c),
        });
        assert_eq!(
            report.steps[3].status,
            StepStatus::Pass,
            "{:#?}",
            report.steps[3]
        );

        let mut forked = second.clone();
        forked.previous = Some("ff".repeat(32));
        let bad = sign(&forked, &pairs, 2);
        let report = verify(&Inputs {
            release: &bad,
            signers: &set,
            previous: Some(&first),
            corpus: Some(&c),
        });
        assert!(matches!(report.steps[3].status, StepStatus::Fail(_)));
    }

    #[test]
    fn step_4_fails_a_non_genesis_release_that_names_no_predecessor_even_with_no_head_supplied() {
        let c = corpus();
        let mut m = manifest_for(&c);
        m.release = 7;
        m.previous = None;
        let (set, pairs) = signer_set();
        let release = sign(&m, &pairs, 2);
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert!(
            matches!(report.steps[3].status, StepStatus::Fail(_)),
            "{:#?}",
            report.steps[3]
        );
    }

    #[test]
    fn step_4_skips_rather_than_passes_when_no_head_is_supplied() {
        let c = corpus();
        let mut m = manifest_for(&c);
        m.release = 7;
        m.previous = Some("ab".repeat(32));
        let (set, pairs) = signer_set();
        let release = sign(&m, &pairs, 2);
        let report = verify(&Inputs {
            release: &release,
            signers: &set,
            previous: None,
            corpus: Some(&c),
        });
        assert!(matches!(report.steps[3].status, StepStatus::Skip(_)));
        assert_eq!(report.outcome(), Outcome::Incomplete);
    }

    // -- step 5 ------------------------------------------------------------

    #[test]
    fn step_5_examines_every_document_and_says_how_many() {
        let c = corpus();
        let (examined, bad) = rehash_documents(&c).unwrap();
        assert_eq!(examined, 2);
        assert!(bad.is_empty());
        assert!(full(&c).steps[4].detail.contains("2 document(s)"));
    }

    #[test]
    fn step_5_fails_when_stored_text_no_longer_hashes_to_its_id() {
        let c = corpus();
        // Edit a paragraph directly, leaving the id row alone — exactly what a
        // tampered database looks like.
        let victim = corpus_ids(&c)[0];
        let changed = c
            .connection()
            .execute(
                "UPDATE paragraphs SET text = 'The appeal is dismissed.' \
                 WHERE doc_id = ?1 AND idx = 0",
                [victim.to_string()],
            )
            .unwrap();
        assert_eq!(changed, 1, "the fixture did not edit exactly one paragraph");
        let (examined, bad) = rehash_documents(&c).unwrap();
        assert_eq!(examined, 2, "both documents are still examined");
        assert_eq!(bad, vec![victim], "the edited document must not re-hash");
        assert!(matches!(full(&c).steps[4].status, StepStatus::Fail(_)));
    }

    // -- step 6 ------------------------------------------------------------

    #[test]
    fn step_6_agrees_with_the_corpus_crates_own_root() {
        // molao-corpus computes corpus_root over a SQL query; molao-core
        // computes it over a slice. They are two code paths and must produce
        // one value, or a release verifies only where it was built.
        let c = corpus();
        assert_eq!(
            c.corpus_root().unwrap(),
            roots::corpus_root(&document_ids(&c).unwrap())
        );
    }

    #[test]
    fn step_6_fails_on_a_wrong_root_and_on_a_wrong_count() {
        let c = corpus();
        let mut m = manifest_for(&c);
        m.corpus_root = "ab".repeat(32);
        assert!(matches!(
            step_6_corpus_root(&m, Some(&c)).status,
            StepStatus::Fail(_)
        ));

        let mut m = manifest_for(&c);
        m.doc_count += 1;
        let step = step_6_corpus_root(&m, Some(&c));
        assert!(matches!(step.status, StepStatus::Fail(_)));
        assert!(step.status.message().unwrap().contains("document(s)"));
    }

    // -- step 7 ------------------------------------------------------------

    #[test]
    fn step_7_agrees_with_the_graph_crates_own_root() {
        // molao-graph computes graph_root from the stored edge table; this
        // module recomputes it from re-extracted text through molao-core. Three
        // code paths, one value — otherwise `extractor_version` pins nothing.
        let c = corpus();
        let graph = molao_graph::Graph::build(&c).unwrap();
        assert_eq!(
            graph.graph_root(),
            roots::graph_root(&reextract_edges(&c).unwrap())
        );
    }

    #[test]
    fn step_7_counts_paragraphs_not_citations() {
        // The fixture cites [2020] ZACC 1 from two of three paragraphs.
        let c = corpus();
        let edges = reextract_edges(&c).unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].paragraph_count, 2);
    }

    #[test]
    fn step_7_fails_when_the_manifest_names_a_different_graph() {
        let c = corpus();
        let mut m = manifest_for(&c);
        m.graph_root = "ab".repeat(32);
        let step = step_7_graph_root(&m, Some(&c));
        assert!(matches!(step.status, StepStatus::Fail(_)), "{step:?}");
        assert!(step.detail.contains("re-extracted"));
    }

    #[test]
    fn step_7_fails_when_the_citation_table_disagrees_with_the_paragraph_text() {
        // Delete a stored citation row. The paragraph text still cites, so
        // re-extraction still finds the edge — and the two must disagree.
        let c = corpus();
        let m = manifest_for(&c);
        assert_eq!(step_7_graph_root(&m, Some(&c)).status, StepStatus::Pass);
        c.connection()
            .execute("DELETE FROM citations WHERE from_para = 2", [])
            .unwrap();
        let step = step_7_graph_root(&m, Some(&c));
        assert!(matches!(step.status, StepStatus::Fail(_)), "{step:?}");
        assert!(
            step.status.message().unwrap().contains("disagree"),
            "{step:?}"
        );
    }

    #[test]
    fn step_7_skips_rather_than_guesses_when_the_pinned_extractor_is_not_this_one() {
        let c = corpus();
        let mut m = manifest_for(&c);
        m.extractor_version = "molao-cite@0.0.1-not-this-binary".into();
        let step = step_7_graph_root(&m, Some(&c));
        assert!(matches!(step.status, StepStatus::Skip(_)), "{step:?}");
        assert!(step.status.message().unwrap().contains("molao-cite@"));
    }

    #[test]
    fn re_extraction_is_stable_across_repeated_runs_in_one_process() {
        // Cheap half of the determinism claim. The half that matters — that two
        // *processes* agree, so no hash-map iteration order can leak in — is in
        // tests/cli.rs, which runs the binary twice and compares.
        let c = corpus();
        let first = roots::graph_root(&reextract_edges(&c).unwrap());
        for _ in 0..16 {
            assert_eq!(roots::graph_root(&reextract_edges(&c).unwrap()), first);
        }
    }

    // -- file loading -------------------------------------------------------

    #[test]
    fn a_missing_file_is_an_error_not_a_failed_verdict() {
        assert!(verify_files(
            Path::new("/nonexistent/release.json"),
            Path::new("/nonexistent/signers.json"),
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn files_round_trip_through_verification() {
        let dir = std::env::temp_dir().join(format!("molao-verify-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let c = corpus();
        let (set, pairs) = signer_set();
        let release = sign(&manifest_for(&c), &pairs, 2);
        let rp = dir.join("release.json");
        let sp = dir.join("signers.json");
        std::fs::write(&rp, serde_json::to_string(&release).unwrap()).unwrap();
        std::fs::write(&sp, serde_json::to_string(&set).unwrap()).unwrap();

        // No corpus: signatures verify, corpus steps are skipped, and that is
        // reported as incomplete rather than as a pass.
        let report = verify_files(&rp, &sp, None, None).unwrap();
        assert_eq!(report.outcome(), Outcome::Incomplete);

        // A file that is JSON but not a release is a parse error.
        std::fs::write(&rp, "{}").unwrap();
        assert!(verify_files(&rp, &sp, None, None).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
