//! The law-report series registry, as seen from the parser.
//!
//! The registry itself moved to [`molao_core::region`], where it belongs: it is
//! profile data, and profile data has to sit in the crate that everything else
//! depends on rather than in one of the consumers. This module stays as the
//! stable name for it and resolves against the default profile.
//!
//! Callers working in more than one jurisdiction should hold a
//! [`RegionProfile`] and use [`RegionProfile::series`] and
//! [`RegionProfile::series_alternation`] instead of these functions.

pub use molao_core::region::Series;

use molao_core::region::{self, RegionProfile};

/// Series recognised by the default profile. See [`region::ZA_SERIES`].
pub const SERIES: &[Series] = region::ZA_SERIES;

fn profile() -> &'static RegionProfile {
    region::default_profile()
}

/// Look up a series by abbreviation in the default profile. Case-sensitive:
/// series abbreviations are upper-case by convention and lowering the bar here
/// readmits the prose false positives the registry exists to exclude.
pub fn lookup(abbr: &str) -> Option<&'static Series> {
    profile().series(abbr)
}

/// Alternation of every abbreviation in the default profile, regex-escaped,
/// longest first — for building the reported-citation pattern.
pub fn alternation(no_volume: bool) -> String {
    profile().series_alternation(no_volume)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abbreviations_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for s in SERIES {
            assert!(seen.insert(s.abbr), "duplicate series {}", s.abbr);
        }
    }

    #[test]
    fn longer_abbreviations_sort_first() {
        let alt = alternation(false);
        let sa = alt.find("SA|").or_else(|| alt.find("SA$"));
        let all_sa = alt.find("All SA");
        assert!(
            all_sa.unwrap() < sa.unwrap_or(usize::MAX),
            "All SA must precede SA"
        );
    }

    #[test]
    fn lookup_is_case_sensitive() {
        assert!(lookup("SA").is_some());
        assert!(lookup("sa").is_none());
    }

    /// The refactor moved this list into a region profile. Extraction output is
    /// pinned by `EXTRACTOR_VERSION`, so the pattern the profile builds must be
    /// the same string the hardcoded table used to build — byte for byte, in
    /// the same order — or every previously published graph becomes
    /// unverifiable.
    #[test]
    fn the_profile_builds_exactly_the_pattern_the_hardcoded_table_did() {
        assert_eq!(
            alternation(false),
            "All SA|SALLR|SACR|SATC|BCLR|BLLR|BPIR|ILJ|JOL|JDR|BLR|LLR|SA|NR"
        );
        assert_eq!(alternation(true), "CPD|TPD|WLD|NPD|OPD|EDL|GWL|AD|SR|PH");
    }
}
