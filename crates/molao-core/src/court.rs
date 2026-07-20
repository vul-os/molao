//! Courts and the hierarchy that gives authority ranking its meaning.
//!
//! Every neutral citation carries a court code (`[2026] ZACC 26` → `ZACC`). A
//! registry maps that code to a court, and — more importantly — to a place in
//! the hierarchy. Authority ranking in [`molao_graph`] is meaningless without
//! it: a Constitutional Court judgment citing a case is not the same event as a
//! magistrate citing it.
//!
//! ## What lives here, and what does not
//!
//! This module owns the *shape* of a court and the tier model, both of which are
//! jurisdiction-neutral: every common-law hierarchy has an apex court, a general
//! appellate court, specialist appellate courts, first-instance superior courts,
//! specialist courts of equivalent standing, tribunals of record, and inferior
//! courts.
//!
//! The *registries* — which codes exist, what they are called, where they sit —
//! are jurisdiction-specific and therefore data, not code. They live in
//! [`crate::region`] as region profiles.
//!
//! The functions below are the convenience layer over
//! [`region::default_profile`]. They exist because most callers work in one
//! jurisdiction and threading a profile through every lookup would buy them
//! nothing. A caller that serves more than one jurisdiction, or that loads a
//! profile from disk, should hold a [`RegionProfile`](crate::region::RegionProfile)
//! and call its methods directly.
//!
//! [`molao_graph`]: https://docs.rs/molao-graph

use crate::region::{self, RegionProfile};
use serde::{Deserialize, Serialize};

/// Where a court sits in the hierarchy. Ordered: `Apex` binds everything below.
///
/// The tiers are deliberately shared across jurisdictions. A profile need not
/// populate every one — it maps its own courts onto the tiers that fit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Apex court — binds every other court in the jurisdiction. In South
    /// Africa, the Constitutional Court.
    Apex,
    /// General appellate court. In South Africa, the Supreme Court of Appeal.
    Appellate,
    /// Specialist appellate courts (Labour Appeal, Competition Appeal).
    SpecialistAppellate,
    /// First-instance superior courts. Binding on lower courts in their own
    /// division, persuasive across divisions.
    HighCourt,
    /// Courts with superior status in a specialist jurisdiction
    /// (Labour Court, Land Claims Court, Tax Court, Electoral Court).
    SpecialistHigh,
    /// Tribunals of record whose decisions are cited but do not bind courts.
    Tribunal,
    /// Inferior courts — magistrates' and regional courts. Rarely reported;
    /// never binding.
    Lower,
}

impl Tier {
    /// Multiplier applied to citation edges when scoring authority.
    ///
    /// These are deliberately coarse. They encode "an appellate judgment relying
    /// on a case says more about that case than a first-instance judgment does"
    /// — not a precise theory of precedent, which no constant can capture.
    pub fn authority_weight(self) -> f64 {
        match self {
            Tier::Apex => 1.00,
            Tier::Appellate => 0.80,
            Tier::SpecialistAppellate => 0.65,
            Tier::HighCourt => 0.50,
            Tier::SpecialistHigh => 0.45,
            Tier::Tribunal => 0.20,
            Tier::Lower => 0.10,
        }
    }
}

/// A court in a profile's registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Court {
    /// Neutral-citation code, e.g. `ZACC`.
    pub code: &'static str,
    /// Full name as it appears on the judgment.
    pub name: &'static str,
    /// Position in the hierarchy.
    pub tier: Tier,
    /// Seat or division, where the code distinguishes one.
    pub seat: Option<&'static str>,
}

/// The default profile's court registry.
///
/// Retained as a name because callers and tests refer to it; it is the ZA
/// profile's registry, not a separate table. See [`region::ZA_COURTS`].
pub const COURTS: &[Court] = region::ZA_COURTS;

/// The profile these convenience functions read. See the module docs.
fn profile() -> &'static RegionProfile {
    region::default_profile()
}

/// Look a court up by its neutral-citation code in the default profile.
/// Case-insensitive.
pub fn lookup(code: &str) -> Option<&'static Court> {
    profile().court(code)
}

/// Is this a code the default profile knows? Used by the citation parser to
/// decide whether a `[YYYY] XXX NN` match is a real neutral citation or a false
/// positive that merely looks like one.
pub fn is_known_code(code: &str) -> bool {
    profile().is_known_code(code)
}

/// Authority weight for a code, defaulting to the `Lower` weight for codes the
/// default profile does not know. Unknown does not mean unimportant — it means
/// we have no basis to weight it up, so it gets the floor.
pub fn authority_weight(code: &str) -> f64 {
    profile().authority_weight(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apex_outranks_everything() {
        for court in COURTS {
            assert!(
                Tier::Apex.authority_weight() >= court.tier.authority_weight(),
                "{} outranked the Constitutional Court",
                court.code
            );
        }
    }

    #[test]
    fn lookup_is_case_insensitive() {
        assert_eq!(lookup("zacc").unwrap().code, "ZACC");
        assert_eq!(lookup("ZaCc").unwrap().code, "ZACC");
    }

    #[test]
    fn unknown_codes_get_the_floor_not_a_panic() {
        assert!(lookup("ZZNOTACOURT").is_none());
        assert_eq!(
            authority_weight("ZZNOTACOURT"),
            Tier::Lower.authority_weight()
        );
    }

    #[test]
    fn codes_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for court in COURTS {
            assert!(
                seen.insert(court.code),
                "duplicate court code {}",
                court.code
            );
        }
    }

    #[test]
    fn tier_ordering_matches_hierarchy() {
        assert!(Tier::Apex < Tier::Appellate);
        assert!(Tier::Appellate < Tier::HighCourt);
        assert!(Tier::HighCourt < Tier::Lower);
    }

    #[test]
    fn the_free_functions_agree_with_the_default_profile() {
        // These wrappers are the public API; if they ever stop tracking the
        // profile, every consumer silently reads a stale registry.
        for court in COURTS {
            assert_eq!(
                lookup(court.code),
                region::default_profile().court(court.code)
            );
            assert!(is_known_code(court.code));
            assert_eq!(authority_weight(court.code), court.tier.authority_weight());
        }
    }
}
