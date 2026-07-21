//! `Content-Signal:` parsing, and the corpus-eligibility gate it feeds.
//!
//! A growing number of legal-information sites publish a machine-readable
//! statement of *what a robot may do with their content*, distinct from the
//! `Disallow` question of *whether a robot may fetch it at all*. It rides in
//! `robots.txt` as a line such as:
//!
//! ```text
//! Content-Signal: ai-train=no, search=yes, ai-input=no
//! ```
//!
//! read as: you may build a **search** index (`search=yes`), you may **not**
//! train a model on this content (`ai-train=no`), and you may **not** feed it
//! as **input** to an AI model (`ai-input=no`). A related form,
//! `use=reference`, says the content is for reference/citation only.
//!
//! This matters to Molao specifically because Molao's corpus is not a plain
//! search index: it feeds a **retrieval-augmented-generation (RAG)** index,
//! which is exactly the "input content into an AI model" that `ai-input=no`
//! forbids. A source that signals `ai-input=no` (or `use=reference` without an
//! explicit `ai-input=yes`) therefore **must not be ingested into the corpus**
//! — honouring that is the point of this module. See `docs/CONTENT-SIGNALS.md`.
//!
//! ## What a signal does and does not gate
//!
//! The gate keys on **`ai-input`** and **`use`** only. `ai-train=no` on its own
//! does *not* block Molao: RAG grounding is inference-time input, not model
//! training, and Molao trains nothing. Reading `ai-train=no` as a bar on RAG
//! would be dishonest in the over-cautious direction — claiming a restriction
//! the site did not write. The gate refuses exactly what the signal refuses.

use std::fmt;

/// A single tri-state answer within a `Content-Signal` line. `Unset` means the
/// site did not mention this key at all — which is not the same as `No`, and is
/// treated differently by the gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Signal {
    /// The site explicitly permits this use.
    Yes,
    /// The site explicitly forbids this use.
    No,
    /// The site said nothing about this use.
    #[default]
    Unset,
}

impl Signal {
    /// `"yes"`/`"no"` for a set value, `None` for `Unset` — for rendering a
    /// signal back into the `key=value` form it was written in.
    fn as_str(self) -> Option<&'static str> {
        match self {
            Signal::Yes => Some("yes"),
            Signal::No => Some("no"),
            Signal::Unset => None,
        }
    }
}

/// The most-restrictive combination of two answers for the same key, used when
/// a `robots.txt` carries more than one `Content-Signal` line, or repeats a key
/// within one line. A `No` anywhere wins (fail closed toward the site's
/// stricter wish); otherwise an explicit `Yes` beats silence.
fn combine(a: Signal, b: Signal) -> Signal {
    match (a, b) {
        (Signal::No, _) | (_, Signal::No) => Signal::No,
        (Signal::Yes, _) | (_, Signal::Yes) => Signal::Yes,
        _ => Signal::Unset,
    }
}

fn parse_signal(value: &str) -> Signal {
    match value {
        "yes" => Signal::Yes,
        "no" => Signal::No,
        // An unrecognised value ("maybe", a typo) is not evidence either way:
        // treat it as if the key were unset rather than guessing.
        _ => Signal::Unset,
    }
}

/// A parsed `Content-Signal` directive set.
///
/// `use_reference` is a `bool` rather than a [`Signal`] because `use` names a
/// *purpose* (`use=reference`) rather than answering yes/no: its presence is
/// itself the restriction. Molao treats **any** `use=<value>` directive as a
/// reference-only restriction for AI purposes — the observed value is
/// `reference`, and a purpose-limiting `use` key with any other value is still
/// a limitation, so reading it as "reference-only unless `ai-input=yes` says
/// otherwise" is the safe interpretation. This is a documented judgement call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ContentSignal {
    pub ai_input: Signal,
    pub ai_train: Signal,
    pub search: Signal,
    pub use_reference: bool,
}

impl ContentSignal {
    /// A signal that restricts nothing — what "no `Content-Signal` at all"
    /// means, and the value the gate reads as [`CorpusEligibility::RagPermitted`].
    pub const fn none() -> Self {
        ContentSignal {
            ai_input: Signal::Unset,
            ai_train: Signal::Unset,
            search: Signal::Unset,
            use_reference: false,
        }
    }

    /// A `const`-constructible signal, for expressing a registry's recorded
    /// expectation for a host. The live `robots.txt` remains authoritative;
    /// this is only a hint (see [`crate::peachjam`]).
    pub const fn new(
        ai_input: Signal,
        ai_train: Signal,
        search: Signal,
        use_reference: bool,
    ) -> Self {
        ContentSignal {
            ai_input,
            ai_train,
            search,
            use_reference,
        }
    }

    /// Parse one `Content-Signal:` line's value (everything after the colon).
    pub fn parse(value: &str) -> Self {
        let mut signal = Self::none();
        signal.merge_line(value);
        signal
    }

    /// Merge one `Content-Signal:` line's value into `self`, most-restrictive
    /// wins. Robust to both spacing styles seen in the wild —
    /// `ai-input=no`, `ai-train=no,search=yes,use=reference`, and
    /// `ai-train=no, search=yes, ai-input=no` — because it splits on any run of
    /// commas and whitespace. Keys and values are compared case-insensitively;
    /// unknown keys are ignored, never an error.
    pub fn merge_line(&mut self, value: &str) {
        for token in value.split(|c: char| c == ',' || c.is_whitespace()) {
            let token = token.trim();
            if token.is_empty() {
                continue;
            }
            let Some((key, val)) = token.split_once('=') else {
                continue;
            };
            let key = key.trim().to_ascii_lowercase();
            let val = val.trim().to_ascii_lowercase();
            match key.as_str() {
                "ai-input" => self.ai_input = combine(self.ai_input, parse_signal(&val)),
                "ai-train" => self.ai_train = combine(self.ai_train, parse_signal(&val)),
                "search" => self.search = combine(self.search, parse_signal(&val)),
                "use" => {
                    // Any purpose-limiting `use` directive is a reference-only
                    // restriction for AI purposes (see the struct docs).
                    if !val.is_empty() {
                        self.use_reference = true;
                    }
                }
                // Anything a site invents beyond these keys: not our concern,
                // and not an error.
                _ => {}
            }
        }
    }

    /// Did the site say anything at all?
    pub fn is_none(&self) -> bool {
        *self == Self::none()
    }

    /// The corpus-eligibility class this signal implies. This is the gate.
    ///
    /// Rules:
    /// - `ai-input=yes` explicitly permits AI input ⇒ [`RagPermitted`].
    /// - `ai-input=no`, or a `use=...` reference restriction (without
    ///   `ai-input=yes`), forbids AI input ⇒ **not** `RagPermitted`. Which
    ///   weaker class applies then depends on `search`:
    ///   - `search=yes` ⇒ [`SearchOnly`] (a non-RAG search index would be
    ///     permitted; Molao's corpus is a RAG index, so it still is not a
    ///     corpus source),
    ///   - `search=no` ⇒ [`Forbidden`] (no automated indexing at all),
    ///   - `search` unset ⇒ [`CitationOnly`] (Molao links to it; a reader
    ///     follows the link).
    /// - Anything else (no `ai-input` restriction, no `use` restriction) ⇒
    ///   [`RagPermitted`]. In particular `ai-train=no` **alone** is
    ///   `RagPermitted`: RAG is inference input, not training.
    ///
    /// [`RagPermitted`]: CorpusEligibility::RagPermitted
    /// [`SearchOnly`]: CorpusEligibility::SearchOnly
    /// [`CitationOnly`]: CorpusEligibility::CitationOnly
    /// [`Forbidden`]: CorpusEligibility::Forbidden
    pub fn eligibility(&self) -> CorpusEligibility {
        // An explicit permission to input content to an AI model overrides a
        // reference restriction — a site that writes both means the reference
        // note as guidance, not a bar on the thing it just permitted.
        if self.ai_input == Signal::Yes {
            return CorpusEligibility::RagPermitted;
        }
        let rag_forbidden = self.ai_input == Signal::No || self.use_reference;
        if !rag_forbidden {
            return CorpusEligibility::RagPermitted;
        }
        match self.search {
            Signal::Yes => CorpusEligibility::SearchOnly,
            Signal::No => CorpusEligibility::Forbidden,
            Signal::Unset => CorpusEligibility::CitationOnly,
        }
    }

    /// Convenience: may this source be ingested into Molao's RAG corpus?
    pub fn permits_rag(&self) -> bool {
        self.eligibility().permits_rag()
    }
}

impl fmt::Display for ContentSignal {
    /// Render back to the `key=value, key=value` form, listing only the
    /// directives the site actually set. An empty signal renders as `none`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts: Vec<String> = Vec::new();
        if let Some(v) = self.ai_input.as_str() {
            parts.push(format!("ai-input={v}"));
        }
        if let Some(v) = self.ai_train.as_str() {
            parts.push(format!("ai-train={v}"));
        }
        if let Some(v) = self.search.as_str() {
            parts.push(format!("search={v}"));
        }
        if self.use_reference {
            parts.push("use=reference".to_string());
        }
        if parts.is_empty() {
            write!(f, "none")
        } else {
            write!(f, "{}", parts.join(", "))
        }
    }
}

/// What Molao is allowed to do with a source, decided from its `Content-Signal`.
///
/// Only [`RagPermitted`](Self::RagPermitted) clears a source for the corpus.
/// Every other class refuses corpus ingestion; they differ in what weaker,
/// non-corpus use the source's own signal still allows, which the operator
/// message surfaces so the refusal is explained rather than silent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CorpusEligibility {
    /// May be ingested into the corpus (which feeds the RAG index).
    RagPermitted,
    /// A search index is permitted but AI input is not. Molao's corpus is a RAG
    /// index, so this source is still not a corpus source.
    SearchOnly,
    /// Reference/citation only: link to it, do not ingest or index it.
    CitationOnly,
    /// No automated use at all — neither AI input nor a search index.
    Forbidden,
}

impl CorpusEligibility {
    /// Only this class clears a source for the RAG corpus.
    pub fn permits_rag(self) -> bool {
        self == CorpusEligibility::RagPermitted
    }

    /// May a non-RAG search index be built from this source? True for
    /// `RagPermitted` and `SearchOnly`. Molao does not currently build a
    /// separate search-only index, so this is informational — the corpus gate
    /// still refuses everything but `RagPermitted`.
    pub fn permits_search_index(self) -> bool {
        matches!(
            self,
            CorpusEligibility::RagPermitted | CorpusEligibility::SearchOnly
        )
    }

    /// A one-line operator-facing explanation of what the class means.
    pub fn explain(self) -> &'static str {
        match self {
            CorpusEligibility::RagPermitted => {
                "no Content-Signal restriction on AI input; this source may be ingested into the corpus"
            }
            CorpusEligibility::SearchOnly => {
                "the site permits a search index but forbids AI input; Molao's corpus is a RAG index, so it is not a corpus source"
            }
            CorpusEligibility::CitationOnly => {
                "the site permits reference/citation only, not AI input; Molao links to it but does not ingest it"
            }
            CorpusEligibility::Forbidden => {
                "the site forbids automated indexing and AI input; Molao neither ingests nor indexes it"
            }
        }
    }
}

impl fmt::Display for CorpusEligibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            CorpusEligibility::RagPermitted => "RAG-permitted",
            CorpusEligibility::SearchOnly => "search-only",
            CorpusEligibility::CitationOnly => "citation-only",
            CorpusEligibility::Forbidden => "forbidden",
        };
        f.write_str(label)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_ai_input_no_parses() {
        let s = ContentSignal::parse("ai-input=no");
        assert_eq!(s.ai_input, Signal::No);
        assert_eq!(s.ai_train, Signal::Unset);
        assert_eq!(s.search, Signal::Unset);
        assert!(!s.use_reference);
    }

    #[test]
    fn the_comma_space_spacing_style_parses() {
        // The full real form, "spacing style two".
        let s = ContentSignal::parse("ai-train=no, search=yes, ai-input=no");
        assert_eq!(s.ai_train, Signal::No);
        assert_eq!(s.search, Signal::Yes);
        assert_eq!(s.ai_input, Signal::No);
    }

    #[test]
    fn the_comma_only_spacing_style_parses() {
        let s = ContentSignal::parse("ai-train=no,search=yes,use=reference");
        assert_eq!(s.ai_train, Signal::No);
        assert_eq!(s.search, Signal::Yes);
        assert!(s.use_reference);
    }

    #[test]
    fn keys_and_values_are_case_insensitive() {
        let s = ContentSignal::parse("AI-Input=NO, Search=Yes");
        assert_eq!(s.ai_input, Signal::No);
        assert_eq!(s.search, Signal::Yes);
    }

    #[test]
    fn unknown_keys_are_ignored_not_errors() {
        let s = ContentSignal::parse("ai-input=no, tdm=yes, nonsense");
        assert_eq!(s.ai_input, Signal::No);
        // No panic, no spurious keys set.
        assert_eq!(s.ai_train, Signal::Unset);
    }

    #[test]
    fn an_unrecognised_value_is_treated_as_unset() {
        let s = ContentSignal::parse("ai-input=maybe");
        assert_eq!(s.ai_input, Signal::Unset);
    }

    #[test]
    fn no_signal_is_rag_permitted() {
        assert_eq!(
            ContentSignal::none().eligibility(),
            CorpusEligibility::RagPermitted
        );
        assert!(ContentSignal::none().is_none());
    }

    #[test]
    fn ai_input_no_is_not_rag_permitted() {
        let s = ContentSignal::parse("ai-input=no");
        assert_eq!(s.eligibility(), CorpusEligibility::CitationOnly);
        assert!(!s.permits_rag());
    }

    #[test]
    fn ai_input_no_with_search_yes_is_search_only() {
        let s = ContentSignal::parse("ai-train=no, search=yes, ai-input=no");
        assert_eq!(s.eligibility(), CorpusEligibility::SearchOnly);
        assert!(!s.permits_rag());
        assert!(s.eligibility().permits_search_index());
    }

    #[test]
    fn use_reference_is_not_rag_permitted() {
        let s = ContentSignal::parse("use=reference");
        assert_eq!(s.eligibility(), CorpusEligibility::CitationOnly);
        assert!(!s.permits_rag());
    }

    #[test]
    fn ai_train_no_alone_is_rag_permitted_because_rag_is_not_training() {
        let s = ContentSignal::parse("ai-train=no");
        assert_eq!(s.eligibility(), CorpusEligibility::RagPermitted);
        assert!(s.permits_rag());
    }

    #[test]
    fn an_explicit_ai_input_yes_overrides_a_reference_note() {
        let s = ContentSignal::parse("ai-input=yes, use=reference");
        assert_eq!(s.eligibility(), CorpusEligibility::RagPermitted);
    }

    #[test]
    fn everything_forbidden_is_forbidden() {
        let s = ContentSignal::parse("ai-input=no, search=no, ai-train=no");
        assert_eq!(s.eligibility(), CorpusEligibility::Forbidden);
        assert!(!s.eligibility().permits_search_index());
    }

    #[test]
    fn multiple_lines_take_the_most_restrictive() {
        let mut s = ContentSignal::parse("search=yes");
        s.merge_line("ai-input=no");
        assert_eq!(s.eligibility(), CorpusEligibility::SearchOnly);
        // A later, more permissive line does not un-forbid a No.
        s.merge_line("ai-input=yes");
        assert_eq!(s.ai_input, Signal::No);
    }

    #[test]
    fn display_round_trips_the_set_directives() {
        let s = ContentSignal::parse("ai-input=no, search=yes");
        assert_eq!(s.to_string(), "ai-input=no, search=yes");
        assert_eq!(ContentSignal::none().to_string(), "none");
        assert_eq!(
            ContentSignal::parse("use=reference").to_string(),
            "use=reference"
        );
    }
}
