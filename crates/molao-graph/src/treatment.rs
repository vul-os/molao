//! Treatment attestations — signed claims about how one judgment treated
//! another.
//!
//! # Status
//!
//! Built: the vocabulary, the canonical signing bytes, Ed25519 verification on
//! both the write and the read path, ingest of a signed bundle through
//! [`molao_corpus`], a reader-side [`TrustPolicy`], conflict grouping, and a
//! currency signal derived from attestations rather than guessed.
//!
//! Not built: see [Not built, specifically](#not-built-specifically) below,
//! which is kept precise rather than reassuring. Nothing here produces an
//! attestation on its own — there is no extractor and there will not be one.
//!
//! # Why it is modelled this way
//!
//! [`molao_cite`] answers "does A cite B?" — a fact, recomputable by anyone
//! from the text, which is why the citation graph can be verified rather than
//! trusted.
//!
//! "Did A *follow* B, or *distinguish* it, or *overrule* it?" is a different
//! kind of claim. It is an interpretation. Two competent lawyers read the same
//! paragraph and disagree, and no amount of re-running an extractor settles it.
//! A classifier that emitted treatments as if they were facts would be the most
//! dangerous thing in this system: silently wrong headnotes are how a
//! practitioner cites overruled authority to a court.
//!
//! So treatments are **signed attestations**, not derived data. Somebody puts
//! their name to the claim. The record carries who said it, and a reader can
//! weigh a Law Faculty's attestation differently from an anonymous key's. The
//! graph can hold contradictory attestations about the same pair without being
//! broken — because that is the actual state of the law when practitioners
//! disagree, and flattening it to one answer would be a lie.
//!
//! This is also why treatments are deliberately **excluded from the release
//! root**: a release must be reproducible from the corpus by recomputation, and
//! attestations are not recomputable. They travel as their own signed objects.
//!
//! # Verification happens twice, and the second time is the one that matters
//!
//! [`ingest`] refuses any attestation whose signature does not verify, so
//! nothing unchecked enters through the front door. That check is a courtesy to
//! the importer; it is not a security property, because the corpus is a SQLite
//! file that anybody can open and write to, and the table it lives in is
//! excluded from the release root — **no outer signature covers these rows**.
//!
//! So [`verified_about`] verifies again, at read time, over the bytes it just
//! read, and drops what fails. That is the load-bearing check. A row inserted
//! behind the ingest gate is never shown to a reader.
//!
//! Both [`VerifiedSet`] and [`IngestReport`] carry an `examined` count, so a
//! verification pass that silently examined nothing is visible as a zero rather
//! than passing for "all clear".
//!
//! # Conflicts are shown, never resolved
//!
//! [`conflicts`] groups contradictory attestations about the same pair and
//! returns them together with their signers. There is deliberately **no
//! function in this module that picks a winner**, no ranking by weight, and no
//! majority rule. [`TrustPolicy`] attaches the reader's own weight to each
//! claim, and does not reorder or filter anything: ordering is the corpus's
//! stable display order, identical for every reader, so that two readers
//! looking at the same judgment see the same claims in the same sequence and
//! differ only in what they choose to make of them.
//!
//! # What a missing warning does not mean
//!
//! [`CurrencySignal`] has no variant meaning "good law", and it never will.
//! The most it says is that this node holds no adverse attestation — which is a
//! statement about this node's attestation set, not about the judgment. A node
//! holding none at all reports [`CurrencySignal::NoAttestationsHeld`], which the
//! API renders as *not yet available* rather than as an empty list.
//!
//! # Not built, specifically
//!
//! - **No gossip.** Attestations move only by [`ingest`] of a bundle somebody
//!   hands you — a file, a URL you fetched yourself, a USB stick. There is no
//!   peer exchange, no subscription to a signer, and no discovery of who has
//!   attested to what. A node's attestation set is exactly what has been
//!   imported into it, and nothing tells a reader what exists elsewhere.
//! - **No authoring path.** Nothing in this repository signs an attestation.
//!   [`Attestation::signing_bytes`] is public and the format is fixed, so an
//!   attestor can produce one with any Ed25519 tooling, but there is no
//!   `molao attest sign` command and no key management.
//! - **No CLI wiring.** There is no `molao attest import`; [`ingest`] and
//!   [`ingest_bundle`] are library calls. A node's default [`TrustPolicy`] can
//!   be attached to the server state in code, but no flag loads one from a
//!   file, so today a policy reaches the node only per request.
//! - **No signer directory.** A [`TrustPolicy`] names keys the reader already
//!   knows. Nothing maps a key to an institution, verifies that mapping, or
//!   distributes it, and a key's `name` in a policy is whatever the reader
//!   typed.
//! - **No revocation.** An attestor cannot withdraw a claim. Deleting the row
//!   locally is the only remedy, and there is no signed retraction object.
//! - **No time model.** `created_at` is the attestor's own unchecked string.
//!   Nothing orders claims by when the *judgments* were delivered, so an
//!   attestation about an overruling can be older than the overruling.
//! - **No UI.** The endpoints exist; the web interface does not render them.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use molao_core::DocId;
use molao_corpus::{AttestationRow, Corpus};
use serde::{Deserialize, Serialize};

/// How a later judgment treated an earlier one.
///
/// The five terms South African practice actually uses. Deliberately not
/// extensible into vaguer categories ("considered", "referred to") — those add
/// no information a citation edge does not already carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Treatment {
    /// Treated as binding and applied to like facts.
    Followed,
    /// Its principle extended to different facts.
    Applied,
    /// Held not to govern, on the facts. Not a criticism.
    Distinguished,
    /// Doubted or disapproved, but not displaced.
    Criticised,
    /// Deprived of authority by a court competent to do so.
    ///
    /// The one that matters most and the one a wrong answer is most costly on,
    /// which is the whole argument for attestations over classifiers.
    Overruled,
}

impl Treatment {
    /// Stable wire string. Matches the `serde` representation; both are part of
    /// the storage format, so they must not drift.
    pub fn as_str(self) -> &'static str {
        match self {
            Treatment::Followed => "followed",
            Treatment::Applied => "applied",
            Treatment::Distinguished => "distinguished",
            Treatment::Criticised => "criticised",
            Treatment::Overruled => "overruled",
        }
    }

    /// Parse a stored value. `None` for anything unrecognised — a future
    /// version's vocabulary must not crash this one.
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "followed" => Treatment::Followed,
            "applied" => Treatment::Applied,
            "distinguished" => Treatment::Distinguished,
            "criticised" | "criticized" => Treatment::Criticised,
            "overruled" => Treatment::Overruled,
            _ => return None,
        })
    }

    /// Does this claim say the cited judgment's authority is reduced?
    ///
    /// `Overruled` and `Criticised` only. `Distinguished` is expressly not
    /// adverse — a court holding that a case does not govern *these* facts has
    /// said nothing against it, and treating that as a warning would fire on a
    /// large share of perfectly good authority and train readers to ignore the
    /// signal.
    pub fn is_adverse(self) -> bool {
        matches!(self, Treatment::Overruled | Treatment::Criticised)
    }
}

/// One signer's claim about how one judgment treated another.
///
/// The signature covers the claim, not the judgment — the attestor is saying
/// "I, this key, assert this reading", and takes responsibility for it.
///
/// An `Attestation` is **unchecked**. Call [`Attestation::verify`] to get a
/// [`Verified`], which is the only thing the storage and display paths accept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attestation {
    /// The later judgment doing the treating.
    pub from_doc: DocId,
    /// The earlier judgment being treated.
    pub to_doc: DocId,
    /// The claim.
    pub treatment: Treatment,
    /// Paragraph of the citing judgment the claim rests on, if pinpointed.
    pub from_para: Option<u32>,
    /// Free-text reasoning. Short, and shown next to the claim so a reader can
    /// judge it rather than take it.
    pub note: Option<String>,
    /// Ed25519 public key of the attestor, hex.
    pub signer: String,
    /// Ed25519 signature over [`Attestation::signing_bytes`], hex.
    pub signature: String,
    /// RFC 3339 timestamp. The attestor's own string; nothing checks it.
    pub created_at: String,
}

impl Attestation {
    /// Canonical bytes an attestor signs.
    ///
    /// Length-prefixed and fixed-order for the same reason as
    /// [`molao_core::Manifest::signing_bytes`]: without length prefixes, moving
    /// a character across a field boundary yields identical bytes and one
    /// claim's signature would validate another.
    ///
    /// Every field except `signature` is covered. Changing any of them — the
    /// pair, the claim, the pinpoint, the note, the key, the timestamp —
    /// invalidates the signature, so an edited attestation cannot be passed off
    /// as the attestor's.
    pub fn signing_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"molao-treatment-v1\n");
        let mut field = |b: &[u8]| {
            out.extend_from_slice(&(b.len() as u64).to_be_bytes());
            out.extend_from_slice(b);
        };
        field(self.from_doc.to_string().as_bytes());
        field(self.to_doc.to_string().as_bytes());
        field(self.treatment.as_str().as_bytes());
        field(
            self.from_para
                .map(|p| p.to_string())
                .unwrap_or_default()
                .as_bytes(),
        );
        field(self.note.as_deref().unwrap_or("").as_bytes());
        field(self.signer.as_bytes());
        field(self.created_at.as_bytes());
        out
    }

    /// Check the signature against the key the attestation names.
    ///
    /// This is self-authentication and nothing more: it proves the holder of
    /// `signer` produced this exact claim. It says nothing about whether that
    /// key belongs to anyone worth listening to — that is the reader's call,
    /// through [`TrustPolicy`], and the two must not be conflated.
    ///
    /// Fails closed at every step: a malformed key, a malformed signature and a
    /// wrong signature are all refusals, never a shrug.
    pub fn verify(self) -> Result<Verified, AttestationError> {
        let key = parse_key(&self.signer)?;
        let sig = parse_signature(&self.signature)?;
        key.verify(&self.signing_bytes(), &sig)
            .map_err(|_| AttestationError::BadSignature)?;
        Ok(Verified(self))
    }

    /// The storage row for this claim.
    fn to_row(&self) -> AttestationRow {
        AttestationRow {
            from_doc: self.from_doc.to_string(),
            to_doc: self.to_doc.to_string(),
            treatment: self.treatment.as_str().to_string(),
            from_para: self.from_para,
            note: self.note.clone(),
            signer: self.signer.clone(),
            signature: self.signature.clone(),
            created_at: self.created_at.clone(),
        }
    }

    /// Rebuild a claim from a stored row, without checking its signature.
    ///
    /// Private on purpose: an unverified `Attestation` must not be reachable
    /// from a corpus read. [`verified_about`] is the only caller, and it
    /// verifies what this returns.
    fn from_row(row: &AttestationRow) -> Result<Attestation, AttestationError> {
        let from_doc = row
            .from_doc
            .parse::<DocId>()
            .map_err(|_| AttestationError::MalformedDocId)?;
        let to_doc = row
            .to_doc
            .parse::<DocId>()
            .map_err(|_| AttestationError::MalformedDocId)?;
        let treatment = Treatment::parse(&row.treatment)
            .ok_or_else(|| AttestationError::UnknownTreatment(row.treatment.clone()))?;
        Ok(Attestation {
            from_doc,
            to_doc,
            treatment,
            from_para: row.from_para,
            note: row.note.clone(),
            signer: row.signer.clone(),
            signature: row.signature.clone(),
            created_at: row.created_at.clone(),
        })
    }
}

/// An attestation whose signature has been checked against its own signer key.
///
/// The wrapper exists so that "verified" is a property of the *type* rather
/// than a boolean somebody has to remember to read. There is no public
/// constructor: the only way to hold one is [`Attestation::verify`], so a
/// function taking a `&Verified` cannot be handed unchecked input by mistake.
///
/// It still says nothing about whether the claim is *true*, or whether its
/// signer is anyone in particular.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verified(Attestation);

impl Verified {
    /// The claim inside.
    pub fn attestation(&self) -> &Attestation {
        &self.0
    }

    /// Unwrap, dropping the verification.
    pub fn into_inner(self) -> Attestation {
        self.0
    }
}

impl std::ops::Deref for Verified {
    type Target = Attestation;
    fn deref(&self) -> &Attestation {
        &self.0
    }
}

/// Why an attestation was refused.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AttestationError {
    /// `signer` is not 32 hex-encoded bytes forming a valid Ed25519 key.
    #[error("malformed signer key")]
    MalformedSignerKey,
    /// `signature` is not 64 hex-encoded bytes.
    #[error("malformed signature")]
    MalformedSignature,
    /// Well-formed, and not this signer's signature over this claim.
    #[error("signature does not verify against the signer key")]
    BadSignature,
    /// A stored `from_doc` or `to_doc` is not a document id.
    #[error("malformed document id")]
    MalformedDocId,
    /// A vocabulary term this build does not know. Not fatal — a newer node's
    /// term is read past, not treated as corruption.
    #[error("unknown treatment term: {0}")]
    UnknownTreatment(String),
}

fn parse_key(hex_key: &str) -> Result<VerifyingKey, AttestationError> {
    let bytes = hex::decode(hex_key).map_err(|_| AttestationError::MalformedSignerKey)?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| AttestationError::MalformedSignerKey)?;
    VerifyingKey::from_bytes(&arr).map_err(|_| AttestationError::MalformedSignerKey)
}

fn parse_signature(hex_sig: &str) -> Result<Signature, AttestationError> {
    let bytes = hex::decode(hex_sig).map_err(|_| AttestationError::MalformedSignature)?;
    let arr: [u8; 64] = bytes
        .try_into()
        .map_err(|_| AttestationError::MalformedSignature)?;
    Ok(Signature::from_bytes(&arr))
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/// Store a verified attestation. `false` if the node already held it.
///
/// Takes a [`Verified`], so there is no signature of this function that could
/// accept an unchecked claim.
pub fn store(corpus: &Corpus, a: &Verified) -> molao_corpus::Result<bool> {
    corpus.insert_attestation_row(&a.to_row())
}

/// Verified attestations, with the counts that prove the check ran.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VerifiedSet {
    /// The attestations that verified, in the corpus's stable display order.
    ///
    /// Contradictory claims sit side by side here, deliberately.
    pub attestations: Vec<Verified>,
    /// Rows read and put through the check.
    ///
    /// Reported so that a pass which examined nothing is visible as a zero. A
    /// verification step nobody can see run is indistinguishable from one that
    /// was removed.
    pub examined: usize,
    /// Rows dropped because their signature did not verify.
    ///
    /// Non-zero means somebody wrote to this corpus's `treatments` table
    /// outside [`ingest`] — worth surfacing, not worth failing on.
    pub rejected: usize,
    /// Rows dropped because this build could not read them: an unknown
    /// vocabulary term, or an unparseable id.
    pub unreadable: usize,
}

impl VerifiedSet {
    /// Distinct signer keys present, sorted.
    pub fn signers(&self) -> Vec<&str> {
        let mut keys: Vec<&str> = self
            .attestations
            .iter()
            .map(|a| a.signer.as_str())
            .collect();
        keys.sort_unstable();
        keys.dedup();
        keys
    }
}

fn verify_rows(rows: Vec<AttestationRow>) -> VerifiedSet {
    let mut set = VerifiedSet {
        examined: rows.len(),
        ..Default::default()
    };
    for row in rows {
        let claim = match Attestation::from_row(&row) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(error = %e, "skipping an unreadable treatment attestation");
                set.unreadable += 1;
                continue;
            }
        };
        match claim.verify() {
            Ok(v) => set.attestations.push(v),
            Err(e) => {
                // Loud, because a corpus is not supposed to contain these: the
                // ingest gate refuses them, so one here was written around it.
                tracing::warn!(signer = %row.signer, error = %e, "dropping an attestation that does not verify");
                set.rejected += 1;
            }
        }
    }
    set
}

/// Every attestation about a judgment whose signature verifies **now**, over
/// the bytes just read.
///
/// This is the read-time check described in the module docs, and it is the one
/// that matters: the `treatments` table is excluded from the release root, so
/// nothing else covers these bytes.
pub fn verified_about(corpus: &Corpus, to_doc: &DocId) -> molao_corpus::Result<VerifiedSet> {
    Ok(verify_rows(
        corpus.attestation_rows_about(&to_doc.to_string())?,
    ))
}

/// Every attestation the node holds whose signature verifies.
pub fn verified_all(corpus: &Corpus) -> molao_corpus::Result<VerifiedSet> {
    Ok(verify_rows(corpus.attestation_rows()?))
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

/// What an import did, per record.
///
/// Every counter is reported, including the boring ones, because "imported 40"
/// with nothing else said hides both a bundle that was half rejected and a
/// bundle that was entirely duplicates.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IngestReport {
    /// Non-blank records read.
    pub examined: usize,
    /// Attestations verified and newly stored.
    pub accepted: usize,
    /// Verified, and already held.
    pub duplicates: usize,
    /// Records refused, as `(1-based record number, why)`.
    ///
    /// Kept individually rather than counted, so an importer can tell a
    /// contributor which line to fix.
    pub rejected: Vec<(usize, AttestationError)>,
    /// Records that were not valid JSON for an attestation, as record numbers.
    pub malformed: Vec<usize>,
}

impl IngestReport {
    /// Did every record land?
    pub fn clean(&self) -> bool {
        self.rejected.is_empty() && self.malformed.is_empty()
    }
}

/// Import a bundle of attestations: JSON Lines, one [`Attestation`] per line.
///
/// One bad record does not abort the import — a bundle from a stranger is
/// expected to contain junk, and refusing the whole file would let one bad line
/// deny a reader forty good ones. Everything refused is reported.
///
/// Unsigned and badly-signed records are refused here. That is a courtesy, not
/// a security boundary: see the module docs on why the read path checks again.
pub fn ingest_bundle(corpus: &Corpus, jsonl: &str) -> molao_corpus::Result<IngestReport> {
    let mut report = IngestReport::default();
    for (n, line) in jsonl.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        report.examined += 1;
        let record = n + 1;
        let Ok(claim) = serde_json::from_str::<Attestation>(line) else {
            report.malformed.push(record);
            continue;
        };
        match claim.verify() {
            Ok(v) => {
                if store(corpus, &v)? {
                    report.accepted += 1;
                } else {
                    report.duplicates += 1;
                }
            }
            Err(e) => report.rejected.push((record, e)),
        }
    }
    Ok(report)
}

/// Import a bundle from a file. See [`ingest_bundle`].
pub fn ingest(
    corpus: &Corpus,
    path: impl AsRef<std::path::Path>,
) -> molao_corpus::Result<IngestReport> {
    let text = std::fs::read_to_string(path)?;
    ingest_bundle(corpus, &text)
}

// ---------------------------------------------------------------------------
// Reader-side trust
// ---------------------------------------------------------------------------

/// A signer this reader has decided to weigh, and by how much.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrustedSigner {
    /// Ed25519 public key, hex.
    pub key: String,
    /// What the reader calls this key. Display only, and unverified — nothing
    /// maps a key to an institution.
    #[serde(default)]
    pub name: Option<String>,
    /// Weight in `0.0..=1.0`, clamped on construction.
    pub weight: f64,
}

/// Which signers *this reader* weighs.
///
/// # Why this is not a global setting
///
/// There is no authority in Molao entitled to say whose reading of a judgment
/// counts. A law faculty, a bar association, a practitioner and an anonymous
/// key can all publish attestations, and which of them a reader takes seriously
/// is the reader's own judgment — the same call they already make when deciding
/// whether to rely on a textbook. A node that shipped a default list of
/// respected signers would be that authority in all but name, so no default
/// list ships and [`TrustPolicy::empty`] is the starting point.
///
/// # What a policy does and does not do
///
/// It **attaches** a weight to each claim, and it drives one threshold in
/// [`currency`]. It does **not** filter: an attestation from a key the reader
/// has never heard of is still returned, still shown, still readable, with a
/// weight of [`TrustPolicy::unlisted_weight`]. Hiding it would be the system
/// deciding what a reader is allowed to see, and would make an attestation
/// disappear precisely when the reader has no context for it.
///
/// It also does **not** reorder anything. Display order is the corpus's, so
/// every reader sees the same claims in the same sequence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrustPolicy {
    /// The reader's list.
    pub signers: Vec<TrustedSigner>,
    /// Weight for a signer not on the list.
    ///
    /// `0.0` by default: an unknown key's claim is shown, and carries no weight
    /// toward a currency warning, until the reader says otherwise. A reader who
    /// wants the opposite — everything counts unless I say it does not — sets
    /// this above zero.
    pub unlisted_weight: f64,
}

impl Default for TrustPolicy {
    fn default() -> Self {
        TrustPolicy::empty()
    }
}

impl TrustPolicy {
    /// A reader who has named nobody. Everything is shown; nothing is weighed.
    pub fn empty() -> Self {
        TrustPolicy {
            signers: Vec::new(),
            unlisted_weight: 0.0,
        }
    }

    /// Add a signer. Weight is clamped to `0.0..=1.0`.
    pub fn trusting(mut self, key: &str, name: Option<&str>, weight: f64) -> Self {
        self.signers.push(TrustedSigner {
            key: key.trim().to_lowercase(),
            name: name.map(str::to_string),
            weight: clamp_weight(weight),
        });
        self
    }

    /// Set the weight given to signers the reader has not named.
    pub fn unlisted(mut self, weight: f64) -> Self {
        self.unlisted_weight = clamp_weight(weight);
        self
    }

    /// Parse a compact policy: `key:weight` pairs separated by commas.
    ///
    /// `weight` may be omitted, meaning `1.0`. Parsed leniently, like every
    /// other query parameter the node accepts: a malformed pair is skipped
    /// rather than turned into a 400, so a stray character in a URL a reader
    /// pasted costs them one signer, not the whole page.
    ///
    /// Names cannot be expressed here — a URL is not where a reader writes down
    /// who a key belongs to. [`TrustPolicy`] deserialises from JSON for that.
    pub fn parse(spec: &str) -> Self {
        let mut policy = TrustPolicy::empty();
        for part in spec.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let (key, weight) = match part.split_once(':') {
                Some((k, w)) => match w.trim().parse::<f64>() {
                    Ok(w) if w.is_finite() => (k, w),
                    // A key with an unreadable weight is still a key the reader
                    // named, so it is kept at full weight rather than dropped.
                    _ => (k, 1.0),
                },
                None => (part, 1.0),
            };
            let key = key.trim().to_lowercase();
            // 64 hex characters or it is not a key; anything else would put a
            // weight on a string no attestation can ever carry.
            if key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit()) {
                policy.signers.push(TrustedSigner {
                    key,
                    name: None,
                    weight: clamp_weight(weight),
                });
            }
        }
        policy
    }

    /// Has the reader named anybody?
    pub fn is_empty(&self) -> bool {
        self.signers.is_empty()
    }

    fn entry(&self, signer: &str) -> Option<&TrustedSigner> {
        let signer = signer.to_lowercase();
        self.signers.iter().find(|s| s.key == signer)
    }

    /// The reader's weight for a signer.
    pub fn weight_for(&self, signer: &str) -> f64 {
        self.entry(signer)
            .map_or(self.unlisted_weight, |s| s.weight)
    }

    /// Whether the reader named this signer at all — distinct from weighing it
    /// zero, which is a deliberate "I know this key and discount it".
    pub fn is_listed(&self, signer: &str) -> bool {
        self.entry(signer).is_some()
    }

    /// The reader's own label for a signer, if they gave one.
    pub fn name_for(&self, signer: &str) -> Option<&str> {
        self.entry(signer).and_then(|s| s.name.as_deref())
    }
}

fn clamp_weight(w: f64) -> f64 {
    if w.is_finite() {
        w.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/// Contradictory attestations about one ordered pair of judgments.
///
/// "Contradictory" means only that two signers named different terms for the
/// same pair. It does not mean one is wrong. Two lawyers can read the same
/// paragraph as *distinguished* and as *overruled* and both be arguing in good
/// faith, and which reading a court would take is the question, not the answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
    /// The later judgment.
    pub from_doc: DocId,
    /// The earlier judgment.
    pub to_doc: DocId,
    /// The distinct terms claimed, sorted. Always at least two.
    pub terms: Vec<Treatment>,
    /// Every attestation about the pair, in the corpus's display order.
    ///
    /// All of them, including the ones that agree with each other. A reader
    /// shown only the disagreeing pair would not be able to see that four
    /// signers said one thing and one said another — which is information, and
    /// is not the same as a verdict.
    pub attestations: Vec<Verified>,
}

/// Group a set into the pairs its signers disagree about.
///
/// Returns only pairs carrying more than one distinct term. Sorted by
/// `(to_doc, from_doc)` so the list is stable.
///
/// **Nothing here resolves anything.** There is no companion function that
/// returns "the" treatment for a pair, and adding one would be the failure this
/// whole design exists to avoid.
pub fn conflicts(set: &VerifiedSet) -> Vec<Conflict> {
    let mut pairs: Vec<(DocId, DocId)> = set
        .attestations
        .iter()
        .map(|a| (a.to_doc, a.from_doc))
        .collect();
    pairs.sort();
    pairs.dedup();

    let mut out = Vec::new();
    for (to_doc, from_doc) in pairs {
        let attestations: Vec<Verified> = set
            .attestations
            .iter()
            .filter(|a| a.to_doc == to_doc && a.from_doc == from_doc)
            .cloned()
            .collect();
        let mut terms: Vec<Treatment> = attestations.iter().map(|a| a.treatment).collect();
        terms.sort();
        terms.dedup();
        if terms.len() > 1 {
            out.push(Conflict {
                from_doc,
                to_doc,
                terms,
                attestations,
            });
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/// What this node's attestations say about a judgment's continued authority.
///
/// **No variant means "good law".** The strongest thing this enum can say is
/// that no adverse attestation is held, which is a fact about this node's
/// attestation set and not about the judgment. Given how little gets attested
/// today, the honest reading of every variant below is "check currency
/// yourself".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CurrencySignal {
    /// This node holds no attestations at all — about anything.
    ///
    /// The feature is *not yet available* on this node, which is different from
    /// "nothing has been said about this judgment" and must be rendered
    /// differently. An empty list here would read as reassurance.
    NoAttestationsHeld,
    /// The node holds attestations, and none is about this judgment.
    NoneAboutThisJudgment,
    /// Attestations about this judgment exist, none of them adverse.
    NoAdverseAttestation,
    /// An adverse attestation exists, and this reader weighs none of its
    /// signers above zero.
    ///
    /// Shown, not suppressed: the reader is told the claim exists and that it
    /// comes from a key they have not weighed.
    AdverseUnweighted,
    /// An adverse attestation exists from a signer this reader weighs.
    AdverseWeighted,
}

impl CurrencySignal {
    /// Wire string; also the `serde` representation.
    pub fn as_str(self) -> &'static str {
        match self {
            CurrencySignal::NoAttestationsHeld => "no_attestations_held",
            CurrencySignal::NoneAboutThisJudgment => "none_about_this_judgment",
            CurrencySignal::NoAdverseAttestation => "no_adverse_attestation",
            CurrencySignal::AdverseUnweighted => "adverse_unweighted",
            CurrencySignal::AdverseWeighted => "adverse_weighted",
        }
    }
}

/// The currency picture for one judgment, derived entirely from signed claims.
///
/// Every number here is a count of attestations or a sum of the reader's own
/// weights. Nothing is inferred from the citation graph, from dates, or from
/// how a judgment reads — which is the whole point: a warning a reader cannot
/// trace to a named signer is a guess wearing a warning's clothes.
#[derive(Debug, Clone, PartialEq)]
pub struct CurrencyReport {
    /// The headline.
    pub signal: CurrencySignal,
    /// Verified attestations about this judgment.
    pub attestations: usize,
    /// Of those, how many are adverse ([`Treatment::is_adverse`]).
    pub adverse: usize,
    /// Of those, how many say `overruled` specifically.
    pub overruled: usize,
    /// Sum of the reader's weights over the adverse attestations.
    pub weighted_adverse: f64,
    /// Sum of the reader's weights over every attestation about the judgment.
    pub weighted_total: f64,
    /// Whether some signer says adverse and another says not, about the same
    /// pair. A contested warning is still a warning, and is labelled as
    /// contested rather than averaged away.
    pub contested: bool,
    /// Distinct signers who attested about this judgment, hex, sorted.
    pub signers: Vec<String>,
}

/// Build the currency picture for one judgment.
///
/// `holds_any` is whether the node holds an attestation set at all; it is what
/// separates *not yet available* from *nothing said about this case*. Callers
/// get it from [`molao_corpus::Corpus::attestation_stats`], or use
/// [`about`], which does both.
pub fn currency(set: &VerifiedSet, holds_any: bool, policy: &TrustPolicy) -> CurrencyReport {
    let adverse: Vec<&Verified> = set
        .attestations
        .iter()
        .filter(|a| a.treatment.is_adverse())
        .collect();
    let weighted_adverse: f64 = adverse.iter().map(|a| policy.weight_for(&a.signer)).sum();
    let weighted_total: f64 = set
        .attestations
        .iter()
        .map(|a| policy.weight_for(&a.signer))
        .sum();

    let signal = if set.attestations.is_empty() {
        if holds_any {
            CurrencySignal::NoneAboutThisJudgment
        } else {
            CurrencySignal::NoAttestationsHeld
        }
    } else if adverse.is_empty() {
        CurrencySignal::NoAdverseAttestation
    } else if weighted_adverse > 0.0 {
        CurrencySignal::AdverseWeighted
    } else {
        CurrencySignal::AdverseUnweighted
    };

    // Contested means: about one pair, somebody said adverse and somebody said
    // not. Two signers who both said adverse but named different terms are not
    // in conflict about currency.
    let contested = conflicts(set)
        .iter()
        .any(|c| c.terms.iter().any(|t| t.is_adverse()) && c.terms.iter().any(|t| !t.is_adverse()));

    CurrencyReport {
        signal,
        attestations: set.attestations.len(),
        adverse: adverse.len(),
        overruled: set
            .attestations
            .iter()
            .filter(|a| a.treatment == Treatment::Overruled)
            .count(),
        weighted_adverse,
        weighted_total,
        contested,
        signers: set.signers().into_iter().map(str::to_string).collect(),
    }
}

/// Everything the interpretive layer has to say about one judgment.
///
/// One call, because a caller that fetched the attestations and the currency
/// separately could render a warning built from a different read than the list
/// underneath it.
#[derive(Debug, Clone, PartialEq)]
pub struct TreatmentView {
    /// Does this node hold any attestations at all?
    ///
    /// `false` means the feature is **not yet available on this node** — a
    /// caller must say that, and must not render an empty list, which reads as
    /// "nothing has been said about this case".
    pub available: bool,
    /// Verified attestations about this judgment, with the coverage counts.
    pub set: VerifiedSet,
    /// The pairs its signers disagree about.
    pub conflicts: Vec<Conflict>,
    /// The currency picture under this reader's policy.
    pub currency: CurrencyReport,
}

/// Read, verify, group and weigh in one pass.
pub fn about(
    corpus: &Corpus,
    to_doc: &DocId,
    policy: &TrustPolicy,
) -> molao_corpus::Result<TreatmentView> {
    let available = corpus.attestation_stats()?.rows > 0;
    let set = verified_about(corpus, to_doc)?;
    let conflicts = conflicts(&set);
    let currency = currency(&set, available, policy);
    Ok(TreatmentView {
        available,
        set,
        conflicts,
        currency,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer as _, SigningKey};

    fn doc(seed: &str) -> DocId {
        DocId::of_raw(seed)
    }

    fn key(seed: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    /// An unsigned claim, with the signature field left empty.
    fn claim(t: Treatment) -> Attestation {
        Attestation {
            from_doc: doc("later judgment"),
            to_doc: doc("earlier judgment"),
            treatment: t,
            from_para: Some(41),
            note: Some("The reasoning is expressly departed from.".into()),
            signer: String::new(),
            signature: String::new(),
            created_at: "2026-07-20T09:00:00Z".into(),
        }
    }

    /// A genuinely signed claim from the key with this seed.
    fn signed(t: Treatment, seed: u8) -> Attestation {
        let (sk, pk) = key(seed);
        let mut a = claim(t);
        a.signer = pk;
        a.signature = hex::encode(sk.sign(&a.signing_bytes()).to_bytes());
        a
    }

    fn verified(t: Treatment, seed: u8) -> Verified {
        signed(t, seed).verify().expect("a signed claim verifies")
    }

    fn corpus() -> Corpus {
        Corpus::open_in_memory().unwrap()
    }

    // ---- vocabulary ------------------------------------------------------

    #[test]
    fn treatment_strings_round_trip() {
        for t in [
            Treatment::Followed,
            Treatment::Applied,
            Treatment::Distinguished,
            Treatment::Criticised,
            Treatment::Overruled,
        ] {
            assert_eq!(Treatment::parse(t.as_str()), Some(t));
        }
        assert_eq!(Treatment::parse("criticized"), Some(Treatment::Criticised));
        assert_eq!(Treatment::parse("considered"), None);
    }

    #[test]
    fn only_overruled_and_criticised_are_adverse() {
        assert!(Treatment::Overruled.is_adverse());
        assert!(Treatment::Criticised.is_adverse());
        // Distinguished is not a criticism, and treating it as one would fire a
        // warning on a large share of perfectly good authority.
        assert!(!Treatment::Distinguished.is_adverse());
        assert!(!Treatment::Followed.is_adverse());
        assert!(!Treatment::Applied.is_adverse());
    }

    // ---- signing bytes ---------------------------------------------------

    #[test]
    fn signing_bytes_are_unambiguous_across_field_boundaries() {
        let mut a = claim(Treatment::Followed);
        let mut b = claim(Treatment::Followed);
        a.note = Some("ab".into());
        a.signer = "c".into();
        b.note = Some("a".into());
        b.signer = "bc".into();
        assert_ne!(a.signing_bytes(), b.signing_bytes());
    }

    #[test]
    fn changing_the_claim_changes_the_signed_bytes() {
        assert_ne!(
            claim(Treatment::Followed).signing_bytes(),
            claim(Treatment::Overruled).signing_bytes()
        );
    }

    #[test]
    fn every_signed_field_is_actually_covered() {
        // A field left out of signing_bytes could be edited after signing and
        // the signature would still check out. Each mutation below must change
        // the bytes.
        let base = claim(Treatment::Followed);
        let mutations: Vec<(&str, Attestation)> = vec![
            ("from_doc", {
                let mut a = base.clone();
                a.from_doc = doc("a different citing judgment");
                a
            }),
            ("to_doc", {
                let mut a = base.clone();
                a.to_doc = doc("a different cited judgment");
                a
            }),
            ("treatment", {
                let mut a = base.clone();
                a.treatment = Treatment::Overruled;
                a
            }),
            ("from_para", {
                let mut a = base.clone();
                a.from_para = Some(42);
                a
            }),
            ("from_para=None", {
                let mut a = base.clone();
                a.from_para = None;
                a
            }),
            ("note", {
                let mut a = base.clone();
                a.note = Some("something else entirely".into());
                a
            }),
            ("signer", {
                let mut a = base.clone();
                a.signer = "ff".repeat(32);
                a
            }),
            ("created_at", {
                let mut a = base.clone();
                a.created_at = "2030-01-01T00:00:00Z".into();
                a
            }),
        ];
        assert_eq!(mutations.len(), 8, "every signable field must be exercised");
        for (field, mutated) in mutations {
            assert_ne!(
                base.signing_bytes(),
                mutated.signing_bytes(),
                "{field} is not covered by signing_bytes"
            );
        }
    }

    // ---- verification ----------------------------------------------------

    #[test]
    fn a_genuine_signature_verifies() {
        assert!(signed(Treatment::Overruled, 1).verify().is_ok());
    }

    #[test]
    fn a_tampered_claim_does_not_verify() {
        // The attack this stops: take a real attestation saying "followed",
        // change one word, and republish it as the same signer's.
        let mut a = signed(Treatment::Followed, 1);
        a.treatment = Treatment::Overruled;
        assert_eq!(a.verify(), Err(AttestationError::BadSignature));
    }

    #[test]
    fn a_tampered_note_does_not_verify() {
        let mut a = signed(Treatment::Followed, 1);
        a.note = Some("words the attestor never wrote".into());
        assert_eq!(a.verify(), Err(AttestationError::BadSignature));
    }

    #[test]
    fn one_signers_signature_cannot_be_reattributed_to_another() {
        let real = signed(Treatment::Overruled, 1);
        let (_, other) = key(2);
        let mut stolen = real.clone();
        stolen.signer = other;
        assert_eq!(stolen.verify(), Err(AttestationError::BadSignature));
    }

    #[test]
    fn a_signature_over_a_different_claim_does_not_transfer() {
        let followed = signed(Treatment::Followed, 1);
        let mut overruled = signed(Treatment::Overruled, 1);
        overruled.signature = followed.signature.clone();
        assert_eq!(overruled.verify(), Err(AttestationError::BadSignature));
    }

    #[test]
    fn malformed_keys_and_signatures_are_refused_not_shrugged_off() {
        let mut a = signed(Treatment::Followed, 1);
        let good = a.clone();

        a.signer = "not hex".into();
        assert_eq!(
            a.clone().verify(),
            Err(AttestationError::MalformedSignerKey)
        );

        a.signer = "aa".into(); // hex, wrong length
        assert_eq!(
            a.clone().verify(),
            Err(AttestationError::MalformedSignerKey)
        );

        a = good.clone();
        a.signature = "zz".repeat(64);
        assert_eq!(
            a.clone().verify(),
            Err(AttestationError::MalformedSignature)
        );

        a.signature = "aabb".into();
        assert_eq!(a.verify(), Err(AttestationError::MalformedSignature));

        // An empty signature is the commonest shape of "nobody signed this".
        let mut unsigned = claim(Treatment::Overruled);
        unsigned.signer = good.signer;
        assert_eq!(unsigned.verify(), Err(AttestationError::MalformedSignature));
    }

    // ---- known-answer vectors -------------------------------------------
    //
    // Every test above signs with the same code it verifies with, so all of
    // them would still pass if the signing encoding changed wholesale — and a
    // changed encoding silently invalidates every attestation anybody has ever
    // published. These vectors are the fixed point: literal bytes, computed
    // once, never regenerated from the code under test.
    //
    // If one fails, `molao-treatment-v1` has changed and needs a new format
    // tag, not a new constant here.

    /// Fixed values, deliberately not the ones the other tests use.
    fn vector_claim() -> Attestation {
        Attestation {
            from_doc: doc("vector: the later judgment"),
            to_doc: doc("vector: the earlier judgment"),
            treatment: Treatment::Overruled,
            from_para: Some(87),
            note: Some("Expressly departed from at para 87.".into()),
            signer: VECTOR_SIGNER.into(),
            signature: String::new(),
            created_at: "2026-07-20T10:00:00Z".into(),
        }
    }

    /// Ed25519 public key from seed `[7; 32]`.
    const VECTOR_SIGNER: &str = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";

    /// `signing_bytes` of [`vector_claim`], hex.
    const VECTOR_SIGNING_BYTES: &str = "\
6d6f6c616f2d74726561746d656e742d76310a0000000000000040316639653233363636396439333832643536646638\
643935633433346539643135393039323139633663656235653732613433613839313762623461326234300000000000\
000040303363393862616166323864626439333437346139613131343534393438366531653032363063383162316535\
3639663633626230346563373066333837303600000000000000096f76657272756c6564000000000000000238370000\
000000000023457870726573736c792064657061727465642066726f6d20617420706172612038372e00000000000000\
406561346136633633653239633532306162656635353037623133326563356639393534373736616562656265376239\
32343231656561363931343436643232630000000000000014323032362d30372d32305431303a30303a30305a";

    /// The signature over those bytes by the key with seed `[7; 32]`.
    const VECTOR_SIGNATURE: &str = "\
33a64c656a48019fc8ede6c452d5f756dc73e4bc27aaf4569ee402746881be2ab642ca71e0a66f94e924fda789a7db10\
c6b1a8ff031924a6c9238a6df594ce0c";

    fn unwrap_hex(s: &str) -> String {
        s.chars().filter(|c| !c.is_whitespace()).collect()
    }

    #[test]
    fn vector_signing_bytes_are_unchanged() {
        assert_eq!(
            hex::encode(vector_claim().signing_bytes()),
            unwrap_hex(VECTOR_SIGNING_BYTES),
            "the molao-treatment-v1 signing encoding has changed; every \
             attestation ever published is now unverifiable"
        );
    }

    #[test]
    fn a_recorded_signature_still_verifies() {
        // The property that matters across versions: an attestation signed by
        // yesterday's tooling must still verify under today's code.
        let mut a = vector_claim();
        a.signature = unwrap_hex(VECTOR_SIGNATURE);
        assert!(
            a.verify().is_ok(),
            "a recorded signature over recorded bytes must verify"
        );
    }

    #[test]
    fn the_recorded_signature_does_not_verify_over_a_different_claim() {
        // Proves the test above checks the bytes and not merely the key.
        let mut a = vector_claim();
        a.signature = unwrap_hex(VECTOR_SIGNATURE);
        a.from_para = Some(88);
        assert_eq!(a.verify(), Err(AttestationError::BadSignature));
    }

    // ---- storage and the read-time check ---------------------------------

    #[test]
    fn a_verified_attestation_round_trips_through_the_store() {
        let c = corpus();
        let v = verified(Treatment::Overruled, 1);
        assert!(store(&c, &v).unwrap());
        let set = verified_about(&c, &doc("earlier judgment")).unwrap();
        assert_eq!(set.examined, 1);
        assert_eq!(set.rejected, 0);
        assert_eq!(set.unreadable, 0);
        assert_eq!(set.attestations, vec![v]);
    }

    #[test]
    fn contradictory_attestations_both_survive() {
        // The design commitment: disagreement is data, not corruption.
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Followed, 2)).unwrap();

        let set = verified_about(&c, &doc("earlier judgment")).unwrap();
        assert_eq!(set.attestations.len(), 2);
        assert!(set
            .attestations
            .iter()
            .any(|a| a.treatment == Treatment::Overruled));
        assert!(set
            .attestations
            .iter()
            .any(|a| a.treatment == Treatment::Followed));
    }

    #[test]
    fn a_row_written_around_ingest_never_reaches_a_reader() {
        // THE load-bearing check. The treatments table is excluded from the
        // release root, so nothing signs these rows; anybody who can open the
        // file can write one. The read path is the only thing standing between
        // a forged "overruled" and a practitioner.
        let c = corpus();
        let good = verified(Treatment::Followed, 1);
        store(&c, &good).unwrap();

        let mut forged = signed(Treatment::Overruled, 2);
        forged.signature = "ab".repeat(64); // well-formed, wrong
        c.insert_attestation_row(&forged.to_row()).unwrap();

        let set = verified_about(&c, &doc("earlier judgment")).unwrap();
        assert_eq!(set.examined, 2, "both rows must be examined");
        assert_eq!(
            set.rejected, 1,
            "the forged row must be counted as rejected"
        );
        assert_eq!(set.attestations, vec![good]);
    }

    #[test]
    fn a_row_edited_in_place_is_dropped_at_read_time() {
        // Store something genuine, then edit the note with raw SQL, the way an
        // attacker with the file would.
        let c = corpus();
        store(&c, &verified(Treatment::Followed, 1)).unwrap();
        c.connection()
            .execute("UPDATE treatments SET treatment = 'overruled'", [])
            .unwrap();
        let set = verified_about(&c, &doc("earlier judgment")).unwrap();
        assert_eq!(set.examined, 1);
        assert_eq!(set.rejected, 1);
        assert!(set.attestations.is_empty());
    }

    #[test]
    fn a_row_with_an_unknown_treatment_is_skipped_not_fatal() {
        let c = corpus();
        let mut newer = signed(Treatment::Followed, 2).to_row();
        newer.treatment = "invented-by-a-newer-build".into();
        c.insert_attestation_row(&newer).unwrap();
        store(&c, &verified(Treatment::Followed, 1)).unwrap();

        let set = verified_about(&c, &doc("earlier judgment")).unwrap();
        assert_eq!(set.examined, 2);
        assert_eq!(set.unreadable, 1);
        assert_eq!(set.attestations.len(), 1);
    }

    #[test]
    fn an_empty_corpus_examines_nothing_and_says_so() {
        // The counter that makes a dead guard visible: a check that examined
        // zero rows must report zero rather than look like a clean pass.
        let set = verified_about(&corpus(), &doc("earlier judgment")).unwrap();
        assert_eq!(set.examined, 0);
        assert!(set.attestations.is_empty());
    }

    #[test]
    fn verified_all_walks_the_whole_table() {
        let c = corpus();
        store(&c, &verified(Treatment::Followed, 1)).unwrap();
        let mut elsewhere = claim(Treatment::Applied);
        elsewhere.to_doc = doc("a third judgment");
        let (sk, pk) = key(3);
        elsewhere.signer = pk;
        elsewhere.signature = hex::encode(sk.sign(&elsewhere.signing_bytes()).to_bytes());
        store(&c, &elsewhere.verify().unwrap()).unwrap();

        let set = verified_all(&c).unwrap();
        assert_eq!(set.examined, 2);
        assert_eq!(set.attestations.len(), 2);
        assert_eq!(set.signers().len(), 2);
    }

    // ---- ingest ----------------------------------------------------------

    fn line(a: &Attestation) -> String {
        serde_json::to_string(a).unwrap()
    }

    #[test]
    fn a_bundle_imports_and_reports_what_it_did() {
        let c = corpus();
        let bundle = format!(
            "{}\n\n{}\n",
            line(&signed(Treatment::Overruled, 1)),
            line(&signed(Treatment::Followed, 2))
        );
        let report = ingest_bundle(&c, &bundle).unwrap();
        assert_eq!(report.examined, 2, "blank lines are not records");
        assert_eq!(report.accepted, 2);
        assert_eq!(report.duplicates, 0);
        assert!(report.clean());
        assert_eq!(verified_all(&c).unwrap().attestations.len(), 2);
    }

    #[test]
    fn re_importing_a_bundle_adds_nothing() {
        let c = corpus();
        let bundle = line(&signed(Treatment::Overruled, 1));
        assert_eq!(ingest_bundle(&c, &bundle).unwrap().accepted, 1);
        let again = ingest_bundle(&c, &bundle).unwrap();
        assert_eq!(again.accepted, 0);
        assert_eq!(again.duplicates, 1);
        assert_eq!(verified_all(&c).unwrap().attestations.len(), 1);
    }

    #[test]
    fn an_unsigned_record_is_refused_and_named() {
        let c = corpus();
        let mut forged = signed(Treatment::Overruled, 1);
        forged.note = Some("edited after signing".into());
        let bundle = format!(
            "{}\n{}\n",
            line(&signed(Treatment::Followed, 2)),
            line(&forged)
        );
        let report = ingest_bundle(&c, &bundle).unwrap();
        assert_eq!(report.accepted, 1);
        assert_eq!(report.rejected, vec![(2, AttestationError::BadSignature)]);
        assert!(!report.clean());
        // And the refusal is real: it is not in the store.
        assert_eq!(verified_all(&c).unwrap().attestations.len(), 1);
    }

    #[test]
    fn one_junk_line_does_not_lose_the_rest_of_the_bundle() {
        let c = corpus();
        let bundle = format!(
            "not json at all\n{}\n{{\"partial\": true}}\n{}\n",
            line(&signed(Treatment::Followed, 1)),
            line(&signed(Treatment::Overruled, 2))
        );
        let report = ingest_bundle(&c, &bundle).unwrap();
        assert_eq!(report.examined, 4);
        assert_eq!(report.accepted, 2);
        assert_eq!(report.malformed, vec![1, 3]);
    }

    #[test]
    fn an_empty_bundle_is_not_an_error() {
        let report = ingest_bundle(&corpus(), "\n  \n").unwrap();
        assert_eq!(report, IngestReport::default());
        assert!(report.clean());
    }

    // ---- trust policy ----------------------------------------------------

    #[test]
    fn an_empty_policy_weighs_nothing_and_hides_nothing() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        // Shown.
        assert_eq!(view.set.attestations.len(), 1);
        // Unweighed.
        assert_eq!(view.currency.weighted_adverse, 0.0);
        assert_eq!(view.currency.signal, CurrencySignal::AdverseUnweighted);
    }

    #[test]
    fn a_reader_weighs_a_named_signer_and_not_a_stranger() {
        let (_, faculty) = key(1);
        let policy = TrustPolicy::empty().trusting(&faculty, Some("A Law Faculty"), 1.0);
        assert_eq!(policy.weight_for(&faculty), 1.0);
        assert_eq!(policy.name_for(&faculty), Some("A Law Faculty"));
        assert!(policy.is_listed(&faculty));

        let (_, stranger) = key(9);
        assert_eq!(policy.weight_for(&stranger), 0.0);
        assert!(!policy.is_listed(&stranger));
        assert_eq!(policy.name_for(&stranger), None);
    }

    #[test]
    fn weighing_a_signer_zero_is_not_the_same_as_never_naming_them() {
        let (_, known) = key(1);
        let policy = TrustPolicy::empty().trusting(&known, Some("discounted"), 0.0);
        assert!(policy.is_listed(&known), "the reader named this key");
        assert_eq!(policy.weight_for(&known), 0.0);
    }

    #[test]
    fn weights_are_clamped_rather_than_trusted() {
        let (_, k) = key(1);
        let policy = TrustPolicy::empty()
            .trusting(&k, None, 400.0)
            .trusting("aa", None, -7.0)
            .trusting("bb", None, f64::NAN)
            .trusting("cc", None, f64::INFINITY);
        assert_eq!(policy.weight_for(&k), 1.0);
        assert_eq!(policy.weight_for("aa"), 0.0);
        assert_eq!(policy.weight_for("bb"), 0.0);
        assert_eq!(policy.weight_for("cc"), 0.0);
    }

    #[test]
    fn a_policy_parses_from_a_query_string_leniently() {
        let (_, a) = key(1);
        let (_, b) = key(2);
        let spec = format!("{a}:0.9, {b} , not-a-key:1.0, :0.5, ,{a}:oops");
        let policy = TrustPolicy::parse(&spec);
        assert_eq!(policy.weight_for(&a), 0.9, "first listing wins");
        assert_eq!(policy.weight_for(&b), 1.0, "a bare key means full weight");
        assert_eq!(
            policy.signers.len(),
            3,
            "only 64-hex-character keys become entries"
        );
        // Nothing a reader can paste turns into an error.
        assert!(TrustPolicy::parse("").is_empty());
        assert!(TrustPolicy::parse("$$$$").is_empty());
    }

    #[test]
    fn a_policy_key_is_matched_case_insensitively() {
        let (_, k) = key(1);
        let policy = TrustPolicy::parse(&k.to_uppercase());
        assert_eq!(policy.weight_for(&k), 1.0);
    }

    #[test]
    fn a_reader_can_choose_to_weigh_signers_they_have_not_named() {
        let policy = TrustPolicy::empty().unlisted(0.25);
        let (_, stranger) = key(9);
        assert_eq!(policy.weight_for(&stranger), 0.25);
    }

    #[test]
    fn the_policy_changes_no_attestation_and_no_ordering() {
        // A trust policy must not be able to make a claim disappear or move.
        let c = corpus();
        for seed in 1..=3 {
            store(&c, &verified(Treatment::Overruled, seed)).unwrap();
        }
        let neutral = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        let (_, one) = key(1);
        let opinionated = about(
            &c,
            &doc("earlier judgment"),
            &TrustPolicy::empty().trusting(&one, Some("weighed"), 1.0),
        )
        .unwrap();
        assert_eq!(neutral.set, opinionated.set);
        assert_eq!(neutral.conflicts, opinionated.conflicts);
        // Only the weighing differs.
        assert_ne!(
            neutral.currency.weighted_adverse,
            opinionated.currency.weighted_adverse
        );
    }

    // ---- conflicts -------------------------------------------------------

    #[test]
    fn agreement_is_not_a_conflict() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Overruled, 2)).unwrap();
        let set = verified_all(&c).unwrap();
        assert!(conflicts(&set).is_empty());
    }

    #[test]
    fn a_conflict_carries_every_claim_and_every_signer() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Distinguished, 2)).unwrap();
        store(&c, &verified(Treatment::Distinguished, 3)).unwrap();

        let set = verified_all(&c).unwrap();
        let found = conflicts(&set);
        assert_eq!(found.len(), 1);
        let conflict = &found[0];
        assert_eq!(conflict.to_doc, doc("earlier judgment"));
        assert_eq!(conflict.from_doc, doc("later judgment"));
        assert_eq!(
            conflict.terms,
            vec![Treatment::Distinguished, Treatment::Overruled]
        );
        // Every claim, including the two that agree with each other: a reader
        // needs to see that it is one against two, without being told who wins.
        assert_eq!(conflict.attestations.len(), 3);
        let mut signers: Vec<&str> = conflict
            .attestations
            .iter()
            .map(|a| a.signer.as_str())
            .collect();
        signers.sort_unstable();
        signers.dedup();
        assert_eq!(signers.len(), 3);
    }

    #[test]
    fn disagreement_about_different_pairs_is_not_one_conflict() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        let mut other = claim(Treatment::Followed);
        other.to_doc = doc("a third judgment");
        let (sk, pk) = key(2);
        other.signer = pk;
        other.signature = hex::encode(sk.sign(&other.signing_bytes()).to_bytes());
        store(&c, &other.verify().unwrap()).unwrap();

        assert!(conflicts(&verified_all(&c).unwrap()).is_empty());
    }

    #[test]
    fn conflict_output_is_deterministic() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Followed, 2)).unwrap();
        let set = verified_all(&c).unwrap();
        let first = conflicts(&set);
        for _ in 0..16 {
            assert_eq!(conflicts(&verified_all(&c).unwrap()), first);
        }
    }

    // ---- currency --------------------------------------------------------

    #[test]
    fn a_node_holding_nothing_says_not_available_rather_than_nothing_found() {
        let c = corpus();
        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        assert!(!view.available);
        assert_eq!(view.currency.signal, CurrencySignal::NoAttestationsHeld);
    }

    #[test]
    fn a_node_holding_attestations_about_other_cases_says_so_differently() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        let view = about(
            &c,
            &doc("a judgment nobody attested about"),
            &TrustPolicy::empty(),
        )
        .unwrap();
        assert!(view.available);
        assert_eq!(view.currency.signal, CurrencySignal::NoneAboutThisJudgment);
        assert_eq!(view.currency.attestations, 0);
    }

    #[test]
    fn no_variant_of_the_signal_claims_a_judgment_is_good_law() {
        // A blunt guard on the vocabulary itself: the moment somebody adds a
        // "sound"/"good_law"/"current" variant, this fails.
        for signal in [
            CurrencySignal::NoAttestationsHeld,
            CurrencySignal::NoneAboutThisJudgment,
            CurrencySignal::NoAdverseAttestation,
            CurrencySignal::AdverseUnweighted,
            CurrencySignal::AdverseWeighted,
        ] {
            let s = signal.as_str();
            for banned in ["good", "sound", "current", "valid", "safe", "clean"] {
                assert!(
                    !s.contains(banned),
                    "{s} reads as a clean bill of health, which no attestation set can give"
                );
            }
        }
    }

    #[test]
    fn a_favourable_attestation_set_still_only_says_no_adverse_attestation() {
        let c = corpus();
        store(&c, &verified(Treatment::Followed, 1)).unwrap();
        store(&c, &verified(Treatment::Applied, 2)).unwrap();
        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        assert_eq!(view.currency.signal, CurrencySignal::NoAdverseAttestation);
        assert_eq!(view.currency.adverse, 0);
    }

    #[test]
    fn an_overruling_from_a_weighed_signer_raises_the_signal() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        let (_, faculty) = key(1);
        let policy = TrustPolicy::empty().trusting(&faculty, Some("A Law Faculty"), 1.0);
        let view = about(&c, &doc("earlier judgment"), &policy).unwrap();
        assert_eq!(view.currency.signal, CurrencySignal::AdverseWeighted);
        assert_eq!(view.currency.overruled, 1);
        assert_eq!(view.currency.adverse, 1);
        assert_eq!(view.currency.weighted_adverse, 1.0);
    }

    #[test]
    fn the_same_overruling_is_unweighted_for_a_reader_who_discounts_the_signer() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        let (_, signer) = key(1);
        let policy = TrustPolicy::empty().trusting(&signer, Some("discounted"), 0.0);
        let view = about(&c, &doc("earlier judgment"), &policy).unwrap();
        // Still counted, still shown; the reader has simply not weighed it.
        assert_eq!(view.currency.signal, CurrencySignal::AdverseUnweighted);
        assert_eq!(view.currency.adverse, 1);
        assert_eq!(view.set.attestations.len(), 1);
    }

    #[test]
    fn a_contested_warning_is_labelled_contested_rather_than_averaged() {
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Followed, 2)).unwrap();
        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        assert!(view.currency.contested);
        // The warning survives the disagreement — it is not cancelled out.
        assert_eq!(view.currency.adverse, 1);
        assert_eq!(view.conflicts.len(), 1);
    }

    #[test]
    fn two_adverse_readings_that_differ_are_not_contested_currency() {
        // "Overruled" versus "criticised" is a conflict about the term, and
        // both agree the authority is reduced. That is not a contested warning.
        let c = corpus();
        store(&c, &verified(Treatment::Overruled, 1)).unwrap();
        store(&c, &verified(Treatment::Criticised, 2)).unwrap();
        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        assert_eq!(view.conflicts.len(), 1, "the terms do differ");
        assert!(!view.currency.contested);
        assert_eq!(view.currency.adverse, 2);
    }

    #[test]
    fn currency_counts_only_what_verified() {
        // A forged adverse row must not be able to raise a warning.
        let c = corpus();
        store(&c, &verified(Treatment::Followed, 1)).unwrap();
        let mut forged = signed(Treatment::Overruled, 2);
        forged.signature = "ab".repeat(64);
        c.insert_attestation_row(&forged.to_row()).unwrap();

        let view = about(&c, &doc("earlier judgment"), &TrustPolicy::empty()).unwrap();
        assert_eq!(view.set.rejected, 1);
        assert_eq!(view.currency.adverse, 0);
        assert_eq!(view.currency.signal, CurrencySignal::NoAdverseAttestation);
    }
}
