//! The law-report series registry.
//!
//! A reported citation looks like `2020 (3) SA 123 (SCA)`. The `SA` is the
//! series. Without an explicit registry, a parser matching "capitalised word
//! between a volume and a page number" pulls in enormous quantities of ordinary
//! prose — judgments are full of constructions like `section 3 (1) Act 123 of
//! 1998`. Enumerating the series is the difference between a citation extractor
//! and a random-number detector.

/// A law-report series.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Series {
    /// Abbreviation as cited, e.g. `SA`.
    pub abbr: &'static str,
    /// Full title.
    pub name: &'static str,
    /// True for series that predate the volume-numbered format and are cited
    /// as `1936 AD 123` — year, series, page, with no `(volume)`.
    pub no_volume: bool,
}

/// Series recognised by the parser.
///
/// Ordered longest-abbreviation-first where prefixes overlap (`All SA` before
/// `SA`, `SACR` before `SA`) — the matcher takes the first hit, so a shorter
/// abbreviation listed first would shadow a longer one.
pub const SERIES: &[Series] = &[
    // ---- Modern general series ------------------------------------------
    Series {
        abbr: "All SA",
        name: "All South African Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "SACR",
        name: "South African Criminal Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "SATC",
        name: "South African Tax Cases",
        no_volume: false,
    },
    Series {
        abbr: "SALLR",
        name: "South African Labour Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "SA",
        name: "South African Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "BCLR",
        name: "Butterworths Constitutional Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "BLLR",
        name: "Butterworths Labour Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "BPIR",
        name: "Butterworths Personal Injury Reports",
        no_volume: false,
    },
    Series {
        abbr: "ILJ",
        name: "Industrial Law Journal",
        no_volume: false,
    },
    Series {
        abbr: "JOL",
        name: "Judgments Online",
        no_volume: false,
    },
    Series {
        abbr: "JDR",
        name: "Juta's Daily Reports",
        no_volume: false,
    },
    Series {
        abbr: "NR",
        name: "Namibian Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "BLR",
        name: "Botswana Law Reports",
        no_volume: false,
    },
    Series {
        abbr: "LLR",
        name: "Lesotho Law Reports",
        no_volume: false,
    },
    // ---- Historical series, cited without a volume number ---------------
    Series {
        abbr: "AD",
        name: "Appellate Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "CPD",
        name: "Cape Provincial Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "TPD",
        name: "Transvaal Provincial Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "WLD",
        name: "Witwatersrand Local Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "NPD",
        name: "Natal Provincial Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "OPD",
        name: "Orange Free State Provincial Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "EDL",
        name: "Eastern Districts Local Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "GWL",
        name: "Griqualand West Local Division Reports",
        no_volume: true,
    },
    Series {
        abbr: "SR",
        name: "Southern Rhodesia Reports",
        no_volume: true,
    },
    Series {
        abbr: "PH",
        name: "Prentice Hall Weekly Legal Service",
        no_volume: true,
    },
];

/// Look up a series by abbreviation. Case-sensitive: series abbreviations are
/// upper-case by convention and lowering the bar here readmits the prose false
/// positives the registry exists to exclude.
pub fn lookup(abbr: &str) -> Option<&'static Series> {
    SERIES.iter().find(|s| s.abbr == abbr)
}

/// Alternation of every abbreviation, regex-escaped, longest first — for
/// building the reported-citation pattern.
pub fn alternation(no_volume: bool) -> String {
    let mut abbrs: Vec<&str> = SERIES
        .iter()
        .filter(|s| s.no_volume == no_volume)
        .map(|s| s.abbr)
        .collect();
    // Longest first so `All SA` wins over `SA` and `SACR` over `SA`.
    abbrs.sort_by_key(|a| std::cmp::Reverse(a.len()));
    abbrs
        .iter()
        .map(|a| regex::escape(a))
        .collect::<Vec<_>>()
        .join("|")
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
}
