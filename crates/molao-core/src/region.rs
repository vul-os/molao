//! Region profiles: jurisdiction as data, not as code.
//!
//! The citation *grammar* is the same across the free-access-to-law world — a
//! bracketed year, a court code, a number. What differs is **which court codes
//! and which report series exist**. That difference is the only thing a new
//! jurisdiction should have to supply, so it lives here as data a node picks up,
//! never as a branch in the parser.
//!
//! A [`RegionProfile`] carries a court registry (which is what gives authority
//! ranking its meaning — see [`crate::court`]) and a law-report series registry
//! (which is what stops the reported-citation parser matching ordinary prose —
//! see [`Series`]). Two profiles ship built in:
//!
//! - [`ZA`] — South Africa, fully populated. It is the reference profile and the
//!   default, and it is the default only because it is the first one anybody
//!   filled in. Nothing in the parser knows it is South African.
//! - [`GENERIC`] — no courts, no series. This is what makes Molao usable in a
//!   jurisdiction nobody has written a profile for yet: neutral citations are
//!   still found by their shape and flagged as unknown-court, and case numbers
//!   are still found. Reported citations are **not** found, because no series
//!   are enumerated and guessing them would readmit exactly the prose false
//!   positives the registry exists to exclude. That is a real limitation of the
//!   generic profile, honestly stated, not a placeholder for missing code.
//!
//! ## Why `&'static str` and `Copy`
//!
//! Built-in profiles are compile-time constants, so their strings are already
//! `'static`. A profile loaded at runtime with [`RegionProfile::from_toml`]
//! earns the same lifetime by leaking: it is parsed once at start-up and read
//! for the rest of the process, so its allocation genuinely does live forever
//! and `Box::leak` states that fact rather than paying for `Arc` traffic or
//! threading a lifetime parameter through every consumer of a court lookup. The
//! leak is bounded by the number of profiles a node loads, which is a small
//! constant chosen by its operator — it is not reachable from ingest, from a
//! query, or from anything a peer sends.
//!
//! ## Changing profile data changes the graph
//!
//! Court codes decide whether a neutral citation is flagged known; series decide
//! whether a reported citation is found at all. Both are extraction output, and
//! extraction output is pinned by `molao_cite::EXTRACTOR_VERSION`. Editing a
//! profile is therefore a version bump, not a data tweak.

use crate::court::{Court, Tier};
use serde::Deserialize;

/// A law-report series.
///
/// A reported citation looks like `2020 (3) SA 123 (SCA)`; the `SA` is the
/// series. Without an explicit registry, a parser matching "capitalised word
/// between a volume and a page number" pulls in enormous quantities of ordinary
/// prose — judgments are full of constructions like `section 3 (1) Act 123 of
/// 1998`. Enumerating the series is the difference between a citation extractor
/// and a random-number detector.
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

/// One jurisdiction's citation data.
///
/// Everything jurisdiction-specific is in here. Adding a jurisdiction means
/// adding one of these, and nothing else; if a jurisdiction cannot be expressed
/// as this data, that is a gap in the model and should be reported as one rather
/// than special-cased in the parser.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RegionProfile {
    /// Jurisdiction identifier. The ISO country code is the convention.
    pub code: &'static str,
    /// Human-readable name, for display only.
    pub name: &'static str,
    /// The court registry. May be empty — see [`GENERIC`].
    pub courts: &'static [Court],
    /// The law-report series registry. May be empty — see [`GENERIC`].
    pub series: &'static [Series],
}

impl RegionProfile {
    /// Look a court up by its neutral-citation code. Case-insensitive, because
    /// converters and typists are not.
    pub fn court(&self, code: &str) -> Option<&'static Court> {
        self.courts
            .iter()
            .find(|c| c.code.eq_ignore_ascii_case(code))
    }

    /// Is this a code this profile knows? The citation parser uses it to decide
    /// whether a `[YYYY] XXX NN` match is a real neutral citation or a false
    /// positive that merely looks like one.
    pub fn is_known_code(&self, code: &str) -> bool {
        self.court(code).is_some()
    }

    /// Authority weight for a code, defaulting to the [`Tier::Lower`] weight for
    /// codes this profile does not know. Unknown does not mean unimportant — it
    /// means we have no basis to weight it up, so it gets the floor rather than
    /// a guess. Under [`GENERIC`] every code takes this path.
    pub fn authority_weight(&self, code: &str) -> f64 {
        self.court(code)
            .map_or(Tier::Lower.authority_weight(), |c| {
                c.tier.authority_weight()
            })
    }

    /// Look up a series by abbreviation. Case-**sensitive**: series
    /// abbreviations are upper-case by convention, and lowering the bar here
    /// readmits the prose false positives the registry exists to exclude.
    pub fn series(&self, abbr: &str) -> Option<&'static Series> {
        self.series.iter().find(|s| s.abbr == abbr)
    }

    /// Alternation of every abbreviation in the requested group, regex-escaped,
    /// longest first — for building the reported-citation pattern.
    ///
    /// Longest-first is load-bearing: the matcher takes the first hit, so a
    /// shorter abbreviation listed first would shadow a longer one and `All SA`
    /// would be read as bare `SA`. The empty string is returned for a profile
    /// with no series in the group; callers must treat that as "do not build a
    /// pattern", since an empty alternation matches everywhere.
    pub fn series_alternation(&self, no_volume: bool) -> String {
        let mut abbrs: Vec<&str> = self
            .series
            .iter()
            .filter(|s| s.no_volume == no_volume)
            .map(|s| s.abbr)
            .collect();
        abbrs.sort_by_key(|a| std::cmp::Reverse(a.len()));
        abbrs
            .iter()
            .map(|a| regex::escape(a))
            .collect::<Vec<_>>()
            .join("|")
    }
}

/// Why a profile was rejected.
///
/// Every variant is a condition that would silently corrupt extraction if it
/// were tolerated, so loading fails loudly at start-up rather than producing a
/// graph nobody can reproduce.
#[derive(Debug, thiserror::Error)]
pub enum RegionError {
    /// The bytes were not the TOML this expects.
    #[error("malformed region profile: {0}")]
    Malformed(#[from] toml::de::Error),
    /// A profile with no code cannot be selected or named in a manifest.
    #[error("region profile has an empty code")]
    EmptyCode,
    /// Two courts claiming one code make the lookup order-dependent, and lookup
    /// order is not something a citation graph may depend on.
    #[error("duplicate court code {0:?} in region profile")]
    DuplicateCourtCode(String),
    /// Same reasoning for series.
    #[error("duplicate series abbreviation {0:?} in region profile")]
    DuplicateSeries(String),
    /// An empty or absurd abbreviation/code would either match everywhere or
    /// blow the regex size limit when the series alternation is compiled.
    #[error("invalid {field} {value:?} in region profile")]
    InvalidField { field: &'static str, value: String },
    /// The profile is individually well-formed but its series cannot be
    /// compiled into a pattern. Caught here so the extractor, which is built
    /// after loading, has nothing left to fail on.
    #[error("region profile series do not compile into a pattern: {0}")]
    UncompilablePattern(String),
}

/// Upper bounds on a loaded profile.
///
/// Not a policy about how many courts a country may have — a bound that stops a
/// malformed or hostile file turning into an unbounded leak and a regex the
/// engine refuses to compile. The real registries are two orders of magnitude
/// below this.
const MAX_ENTRIES: usize = 4096;
/// Longest accepted court code or series abbreviation.
const MAX_TOKEN: usize = 64;

#[derive(Deserialize)]
struct RawProfile {
    code: String,
    name: String,
    #[serde(default)]
    courts: Vec<RawCourt>,
    #[serde(default)]
    series: Vec<RawSeries>,
}

#[derive(Deserialize)]
struct RawCourt {
    code: String,
    name: String,
    tier: Tier,
    #[serde(default)]
    seat: Option<String>,
}

#[derive(Deserialize)]
struct RawSeries {
    abbr: String,
    name: String,
    #[serde(default)]
    no_volume: bool,
}

fn leak_str(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

fn check_token(field: &'static str, value: &str) -> Result<(), RegionError> {
    if value.is_empty() || value.len() > MAX_TOKEN {
        return Err(RegionError::InvalidField {
            field,
            value: value.to_string(),
        });
    }
    Ok(())
}

impl RegionProfile {
    /// Parse a profile from TOML, validate it, and give it the `'static`
    /// lifetime every consumer expects.
    ///
    /// See the module docs for why leaking is the right call here. Errors are
    /// returned, never panicked: this is the one path in the profile system
    /// reachable from a file an operator did not write.
    pub fn from_toml(src: &str) -> Result<&'static RegionProfile, RegionError> {
        let raw: RawProfile = toml::from_str(src)?;

        if raw.code.trim().is_empty() {
            return Err(RegionError::EmptyCode);
        }
        if raw.courts.len() > MAX_ENTRIES {
            return Err(RegionError::InvalidField {
                field: "courts",
                value: format!("{} entries", raw.courts.len()),
            });
        }
        if raw.series.len() > MAX_ENTRIES {
            return Err(RegionError::InvalidField {
                field: "series",
                value: format!("{} entries", raw.series.len()),
            });
        }

        let mut seen_courts = std::collections::HashSet::new();
        let mut courts = Vec::with_capacity(raw.courts.len());
        for c in raw.courts {
            check_token("court code", &c.code)?;
            if !seen_courts.insert(c.code.to_uppercase()) {
                return Err(RegionError::DuplicateCourtCode(c.code));
            }
            courts.push(Court {
                code: leak_str(c.code),
                name: leak_str(c.name),
                tier: c.tier,
                seat: c.seat.map(leak_str),
            });
        }

        let mut seen_series = std::collections::HashSet::new();
        let mut series = Vec::with_capacity(raw.series.len());
        for s in raw.series {
            check_token("series abbreviation", &s.abbr)?;
            if !seen_series.insert(s.abbr.clone()) {
                return Err(RegionError::DuplicateSeries(s.abbr));
            }
            series.push(Series {
                abbr: leak_str(s.abbr),
                name: leak_str(s.name),
                no_volume: s.no_volume,
            });
        }

        let profile = RegionProfile {
            code: leak_str(raw.code),
            name: leak_str(raw.name),
            courts: Box::leak(courts.into_boxed_slice()),
            series: Box::leak(series.into_boxed_slice()),
        };

        // Prove the series compile now, while we can still return an error, so
        // that building an extractor from this profile later cannot fail.
        for no_volume in [false, true] {
            let alt = profile.series_alternation(no_volume);
            if alt.is_empty() {
                continue;
            }
            regex::Regex::new(&format!("({alt})"))
                .map_err(|e| RegionError::UncompilablePattern(e.to_string()))?;
        }

        Ok(Box::leak(Box::new(profile)))
    }
}

// ---------------------------------------------------------------------------
// Built-in profiles
// ---------------------------------------------------------------------------

/// The generic profile: no courts, no series.
///
/// Usable in any jurisdiction on day one. Under it, every court code is unknown,
/// so every neutral citation is kept and flagged rather than dropped, and the
/// parser falls back to the shape rule (upper-case, at least three characters).
/// Reported citations are not extracted at all — there is no series list to
/// match against, and inventing one would be worse than finding nothing.
pub static GENERIC: RegionProfile = RegionProfile {
    code: "GENERIC",
    name: "Generic (no court or series registry)",
    courts: &[],
    series: &[],
};

/// South Africa. The reference profile.
pub static ZA: RegionProfile = RegionProfile {
    code: "ZA",
    name: "South Africa",
    courts: ZA_COURTS,
    series: ZA_SERIES,
};

/// The South African court registry.
///
/// Codes follow the LII convention used by SAFLII and AfricanLII, which is the
/// de-facto standard for South African neutral citation. It covers the courts
/// that publish neutral citations; it is not exhaustive of every tribunal in the
/// Republic, and unknown codes are handled rather than assumed away.
pub const ZA_COURTS: &[Court] = &[
    // ---- Apex ------------------------------------------------------------
    Court {
        code: "ZACC",
        name: "Constitutional Court of South Africa",
        tier: Tier::Apex,
        seat: Some("Johannesburg"),
    },
    // ---- Appellate -------------------------------------------------------
    Court {
        code: "ZASCA",
        name: "Supreme Court of Appeal of South Africa",
        tier: Tier::Appellate,
        seat: Some("Bloemfontein"),
    },
    // ---- Specialist appellate -------------------------------------------
    Court {
        code: "ZALAC",
        name: "Labour Appeal Court of South Africa",
        tier: Tier::SpecialistAppellate,
        seat: None,
    },
    Court {
        code: "ZACAC",
        name: "Competition Appeal Court of South Africa",
        tier: Tier::SpecialistAppellate,
        seat: None,
    },
    // ---- High Court divisions -------------------------------------------
    Court {
        code: "ZAGPPHC",
        name: "High Court of South Africa, Gauteng Division",
        tier: Tier::HighCourt,
        seat: Some("Pretoria"),
    },
    Court {
        code: "ZAGPJHC",
        name: "High Court of South Africa, Gauteng Local Division",
        tier: Tier::HighCourt,
        seat: Some("Johannesburg"),
    },
    Court {
        code: "ZAWCHC",
        name: "High Court of South Africa, Western Cape Division",
        tier: Tier::HighCourt,
        seat: Some("Cape Town"),
    },
    Court {
        code: "ZAKZDHC",
        name: "High Court of South Africa, KwaZulu-Natal Local Division",
        tier: Tier::HighCourt,
        seat: Some("Durban"),
    },
    Court {
        code: "ZAKZPHC",
        name: "High Court of South Africa, KwaZulu-Natal Division",
        tier: Tier::HighCourt,
        seat: Some("Pietermaritzburg"),
    },
    Court {
        code: "ZAECGHC",
        name: "High Court of South Africa, Eastern Cape Division",
        tier: Tier::HighCourt,
        seat: Some("Grahamstown"),
    },
    Court {
        code: "ZAECPEHC",
        name: "High Court of South Africa, Eastern Cape Local Division",
        tier: Tier::HighCourt,
        seat: Some("Gqeberha"),
    },
    Court {
        code: "ZAECBHC",
        name: "High Court of South Africa, Eastern Cape Local Division",
        tier: Tier::HighCourt,
        seat: Some("Bhisho"),
    },
    Court {
        code: "ZAECMHC",
        name: "High Court of South Africa, Eastern Cape Local Division",
        tier: Tier::HighCourt,
        seat: Some("Mthatha"),
    },
    Court {
        code: "ZAFSHC",
        name: "High Court of South Africa, Free State Division",
        tier: Tier::HighCourt,
        seat: Some("Bloemfontein"),
    },
    Court {
        code: "ZANWHC",
        name: "High Court of South Africa, North West Division",
        tier: Tier::HighCourt,
        seat: Some("Mahikeng"),
    },
    Court {
        code: "ZANCHC",
        name: "High Court of South Africa, Northern Cape Division",
        tier: Tier::HighCourt,
        seat: Some("Kimberley"),
    },
    Court {
        code: "ZALMPPHC",
        name: "High Court of South Africa, Limpopo Division",
        tier: Tier::HighCourt,
        seat: Some("Polokwane"),
    },
    Court {
        code: "ZALMPTHC",
        name: "High Court of South Africa, Limpopo Local Division",
        tier: Tier::HighCourt,
        seat: Some("Thohoyandou"),
    },
    Court {
        code: "ZAMPMBHC",
        name: "High Court of South Africa, Mpumalanga Division",
        tier: Tier::HighCourt,
        seat: Some("Mbombela"),
    },
    Court {
        code: "ZAMPMHC",
        name: "High Court of South Africa, Mpumalanga Local Division",
        tier: Tier::HighCourt,
        seat: Some("Middelburg"),
    },
    // ---- Specialist courts of High Court status --------------------------
    Court {
        code: "ZALC",
        name: "Labour Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
    Court {
        code: "ZALCJHB",
        name: "Labour Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: Some("Johannesburg"),
    },
    Court {
        code: "ZALCCT",
        name: "Labour Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: Some("Cape Town"),
    },
    Court {
        code: "ZALCD",
        name: "Labour Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: Some("Durban"),
    },
    Court {
        code: "ZALCPE",
        name: "Labour Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: Some("Gqeberha"),
    },
    Court {
        code: "ZALCC",
        name: "Land Claims Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
    Court {
        code: "ZATC",
        name: "Tax Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
    Court {
        code: "ZAEC",
        name: "Electoral Court of South Africa",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
    // ---- Tribunals -------------------------------------------------------
    Court {
        code: "ZACT",
        name: "Competition Tribunal of South Africa",
        tier: Tier::Tribunal,
        seat: None,
    },
    Court {
        code: "ZAWT",
        name: "Water Tribunal of South Africa",
        tier: Tier::Tribunal,
        seat: None,
    },
    Court {
        code: "ZACGSO",
        name: "Companies Tribunal of South Africa",
        tier: Tier::Tribunal,
        seat: None,
    },
    Court {
        code: "ZAICT",
        name: "Information Regulator of South Africa",
        tier: Tier::Tribunal,
        seat: None,
    },
];

/// The South African law-report series registry.
///
/// Order within the list is presentational only — [`RegionProfile::series_alternation`]
/// sorts longest-first when it builds the pattern, so a shorter abbreviation
/// cannot shadow a longer one however this list is arranged.
pub const ZA_SERIES: &[Series] = &[
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

// ---------------------------------------------------------------------------
// Pan-African profiles
// ---------------------------------------------------------------------------
//
// Each of these ships both as a built-in constant here and as `profiles/<cc>.toml`,
// and a test asserts the two are byte-for-byte the same profile so they cannot
// drift. Court codes are the neutral-citation designators the relevant AfricanLII
// member publishes; the source URLs are in each TOML file's header.
//
// These profiles are *not* the default and are not read by the free `extract`
// function — adding them changes no existing extraction output, so it is not an
// `EXTRACTOR_VERSION` bump. A node serving one of these jurisdictions selects it
// with `region::builtin("KE")` (etc.) and holds an `Extractor::for_profile`.
//
// Completeness is stated honestly, per profile: most cover the apex, appellate
// and principal superior courts, which is what a citation graph needs to rank
// authority. `NG` (Nigeria) is a deliberate *seed* — see its note.

/// Kenya. Complete for the superior courts.
pub static KE: RegionProfile = RegionProfile {
    code: "KE",
    name: "Kenya",
    courts: KE_COURTS,
    series: KE_SERIES,
};

const KE_COURTS: &[Court] = &[
    Court {
        code: "KESC",
        name: "Supreme Court of Kenya",
        tier: Tier::Apex,
        seat: Some("Nairobi"),
    },
    Court {
        code: "KECA",
        name: "Court of Appeal of Kenya",
        tier: Tier::Appellate,
        seat: None,
    },
    Court {
        code: "KEHC",
        name: "High Court of Kenya",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "KEELRC",
        name: "Employment and Labour Relations Court of Kenya",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
    Court {
        code: "KEELC",
        name: "Environment and Land Court of Kenya",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
];

const KE_SERIES: &[Series] = &[Series {
    abbr: "KLR",
    name: "Kenya Law Reports",
    no_volume: false,
}];

/// Uganda. Complete for the principal courts.
pub static UG: RegionProfile = RegionProfile {
    code: "UG",
    name: "Uganda",
    courts: UG_COURTS,
    series: &[],
};

const UG_COURTS: &[Court] = &[
    Court {
        code: "UGSC",
        name: "Supreme Court of Uganda",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "UGCA",
        name: "Court of Appeal of Uganda",
        tier: Tier::Appellate,
        seat: None,
    },
    Court {
        code: "UGHC",
        name: "High Court of Uganda",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "UGHCCD",
        name: "High Court of Uganda (Civil Division)",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "UGHCCRD",
        name: "High Court of Uganda (Criminal Division)",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Tanzania. Complete for the principal courts. Apex is the Court of Appeal.
pub static TZ: RegionProfile = RegionProfile {
    code: "TZ",
    name: "Tanzania",
    courts: TZ_COURTS,
    series: &[],
};

const TZ_COURTS: &[Court] = &[
    Court {
        code: "TZCA",
        name: "Court of Appeal of Tanzania",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "TZHC",
        name: "High Court of Tanzania",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "TZHCLandD",
        name: "High Court of Tanzania (Land Division)",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "TZHCComD",
        name: "High Court of Tanzania (Commercial Division)",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "TZHCLD",
        name: "High Court of Tanzania (Labour Division)",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Zimbabwe. Complete for the principal courts. Two apex courts (constitutional
/// and general), each final in its own sphere.
pub static ZW: RegionProfile = RegionProfile {
    code: "ZW",
    name: "Zimbabwe",
    courts: ZW_COURTS,
    series: ZW_SERIES,
};

const ZW_COURTS: &[Court] = &[
    Court {
        code: "ZWCC",
        name: "Constitutional Court of Zimbabwe",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "ZWSC",
        name: "Supreme Court of Zimbabwe",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "ZWHHC",
        name: "High Court of Zimbabwe",
        tier: Tier::HighCourt,
        seat: Some("Harare"),
    },
    Court {
        code: "ZWBHC",
        name: "High Court of Zimbabwe",
        tier: Tier::HighCourt,
        seat: Some("Bulawayo"),
    },
    Court {
        code: "ZWMSVHC",
        name: "High Court of Zimbabwe",
        tier: Tier::HighCourt,
        seat: Some("Masvingo"),
    },
    Court {
        code: "ZWCHHC",
        name: "High Court of Zimbabwe",
        tier: Tier::HighCourt,
        seat: Some("Chinhoyi"),
    },
    Court {
        code: "ZWMTHC",
        name: "High Court of Zimbabwe",
        tier: Tier::HighCourt,
        seat: Some("Mutare"),
    },
    Court {
        code: "ZWLC",
        name: "Labour Court of Zimbabwe",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
];

const ZW_SERIES: &[Series] = &[Series {
    abbr: "ZLR",
    name: "Zimbabwe Law Reports",
    no_volume: false,
}];

/// Namibia. Complete for the principal courts.
pub static NA: RegionProfile = RegionProfile {
    code: "NA",
    name: "Namibia",
    courts: NA_COURTS,
    series: NA_SERIES,
};

const NA_COURTS: &[Court] = &[
    Court {
        code: "NASC",
        name: "Supreme Court of Namibia",
        tier: Tier::Apex,
        seat: Some("Windhoek"),
    },
    Court {
        code: "NAHCMD",
        name: "High Court of Namibia, Main Division",
        tier: Tier::HighCourt,
        seat: Some("Windhoek"),
    },
    Court {
        code: "NAHCNLD",
        name: "High Court of Namibia, Northern Local Division",
        tier: Tier::HighCourt,
        seat: Some("Oshakati"),
    },
    Court {
        code: "NALCMD",
        name: "Labour Court of Namibia, Main Division",
        tier: Tier::SpecialistHigh,
        seat: Some("Windhoek"),
    },
];

const NA_SERIES: &[Series] = &[Series {
    abbr: "NR",
    name: "Namibian Law Reports",
    no_volume: false,
}];

/// Botswana. Complete for the principal courts. Apex is the Court of Appeal.
pub static BW: RegionProfile = RegionProfile {
    code: "BW",
    name: "Botswana",
    courts: BW_COURTS,
    series: BW_SERIES,
};

const BW_COURTS: &[Court] = &[
    Court {
        code: "BWCA",
        name: "Court of Appeal of Botswana",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "BWHC",
        name: "High Court of Botswana",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "BWIC",
        name: "Industrial Court of Botswana",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
];

const BW_SERIES: &[Series] = &[Series {
    abbr: "BLR",
    name: "Botswana Law Reports",
    no_volume: false,
}];

/// Ghana. Complete for the superior courts of record.
pub static GH: RegionProfile = RegionProfile {
    code: "GH",
    name: "Ghana",
    courts: GH_COURTS,
    series: &[],
};

const GH_COURTS: &[Court] = &[
    Court {
        code: "GHASC",
        name: "Supreme Court of Ghana",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "GHACA",
        name: "Court of Appeal of Ghana",
        tier: Tier::Appellate,
        seat: None,
    },
    Court {
        code: "GHAHC",
        name: "High Court of Ghana",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Nigeria. PARTIAL / SEED — only `NGSC` was verified against a published
/// judgment, and Nigerian citation practice runs mainly on reported series this
/// extractor does not model. See `profiles/ng.toml` for the full caveat.
pub static NG: RegionProfile = RegionProfile {
    code: "NG",
    name: "Nigeria",
    courts: NG_COURTS,
    series: &[],
};

const NG_COURTS: &[Court] = &[
    Court {
        code: "NGSC",
        name: "Supreme Court of Nigeria",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "NGCA",
        name: "Court of Appeal of Nigeria",
        tier: Tier::Appellate,
        seat: None,
    },
    Court {
        code: "NGHC",
        name: "High Court (Nigeria)",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Malawi. Complete for the principal courts. Apex is the Supreme Court of Appeal.
pub static MW: RegionProfile = RegionProfile {
    code: "MW",
    name: "Malawi",
    courts: MW_COURTS,
    series: &[],
};

const MW_COURTS: &[Court] = &[
    Court {
        code: "MWSC",
        name: "Malawi Supreme Court of Appeal",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "MWHC",
        name: "High Court of Malawi",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Zambia. Complete for the principal courts. Two apex courts (general and
/// constitutional), each final in its own sphere.
pub static ZM: RegionProfile = RegionProfile {
    code: "ZM",
    name: "Zambia",
    courts: ZM_COURTS,
    series: &[],
};

const ZM_COURTS: &[Court] = &[
    Court {
        code: "ZMSC",
        name: "Supreme Court of Zambia",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "ZMCC",
        name: "Constitutional Court of Zambia",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "ZMCA",
        name: "Court of Appeal of Zambia",
        tier: Tier::Appellate,
        seat: None,
    },
    Court {
        code: "ZMHC",
        name: "High Court of Zambia",
        tier: Tier::HighCourt,
        seat: None,
    },
];

/// Lesotho. Complete for the principal courts. Apex is the Court of Appeal.
pub static LS: RegionProfile = RegionProfile {
    code: "LS",
    name: "Lesotho",
    courts: LS_COURTS,
    series: LS_SERIES,
};

const LS_COURTS: &[Court] = &[
    Court {
        code: "LSCA",
        name: "Court of Appeal of Lesotho",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "LSLAC",
        name: "Labour Appeal Court of Lesotho",
        tier: Tier::SpecialistAppellate,
        seat: None,
    },
    Court {
        code: "LSHC",
        name: "High Court of Lesotho",
        tier: Tier::HighCourt,
        seat: None,
    },
];

const LS_SERIES: &[Series] = &[Series {
    abbr: "LLR",
    name: "Lesotho Law Reports",
    no_volume: false,
}];

/// Eswatini (formerly Swaziland). Complete for the principal courts.
pub static SZ: RegionProfile = RegionProfile {
    code: "SZ",
    name: "Eswatini",
    courts: SZ_COURTS,
    series: &[],
};

const SZ_COURTS: &[Court] = &[
    Court {
        code: "SZSC",
        name: "Supreme Court of eSwatini",
        tier: Tier::Apex,
        seat: None,
    },
    Court {
        code: "SZICA",
        name: "Industrial Court of Appeal of eSwatini",
        tier: Tier::SpecialistAppellate,
        seat: None,
    },
    Court {
        code: "SZHC",
        name: "High Court of eSwatini",
        tier: Tier::HighCourt,
        seat: None,
    },
    Court {
        code: "SZIC",
        name: "Industrial Court of eSwatini",
        tier: Tier::SpecialistHigh,
        seat: None,
    },
];

static BUILTIN: &[&RegionProfile] = &[
    &ZA, &KE, &UG, &TZ, &ZW, &NA, &BW, &GH, &NG, &MW, &ZM, &LS, &SZ, &GENERIC,
];

/// Every profile compiled into this build.
pub fn all_builtin() -> &'static [&'static RegionProfile] {
    BUILTIN
}

/// Look up a built-in profile by code. Case-insensitive.
pub fn builtin(code: &str) -> Option<&'static RegionProfile> {
    all_builtin()
        .iter()
        .copied()
        .find(|p| p.code.eq_ignore_ascii_case(code))
}

/// The profile used when a node has not chosen one.
///
/// This returns [`ZA`], and the reason is historical rather than architectural:
/// South Africa is simply the first profile anybody populated, and the corpus
/// this code was first run against is South African. It is not a statement that
/// Molao is a South African system. A node serving another jurisdiction selects
/// its own profile — or [`GENERIC`] — and no code path changes.
pub fn default_profile() -> &'static RegionProfile {
    &ZA
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The ZA profile shipped as TOML at the repository root. Parsing this and
    /// comparing it to the constant is what proves profiles really are data:
    /// if the two can drift, then the "data" file is decoration and the code is
    /// still the source of truth.
    const ZA_TOML: &str = include_str!("../../../profiles/za.toml");
    const GENERIC_TOML: &str = include_str!("../../../profiles/generic.toml");

    #[test]
    fn shipped_za_toml_matches_the_builtin_profile() {
        let loaded = RegionProfile::from_toml(ZA_TOML).expect("za.toml must parse");
        assert_eq!(loaded.code, ZA.code);
        assert_eq!(loaded.name, ZA.name);
        assert_eq!(
            loaded.courts, ZA.courts,
            "profiles/za.toml has drifted from region::ZA"
        );
        assert_eq!(
            loaded.series, ZA.series,
            "profiles/za.toml has drifted from region::ZA"
        );
        assert_eq!(*loaded, ZA);
    }

    #[test]
    fn shipped_generic_toml_matches_the_builtin_profile() {
        let loaded = RegionProfile::from_toml(GENERIC_TOML).expect("generic.toml must parse");
        assert_eq!(*loaded, GENERIC);
    }

    /// Every pan-African profile ships as both a built-in constant and a TOML
    /// file. This proves the two are the same profile — the same guarantee the
    /// ZA test gives, extended to each jurisdiction so a hand-edit to either
    /// side cannot pass unnoticed.
    #[test]
    fn every_shipped_toml_matches_its_builtin_profile() {
        let pairs: &[(&RegionProfile, &str)] = &[
            (&KE, include_str!("../../../profiles/ke.toml")),
            (&UG, include_str!("../../../profiles/ug.toml")),
            (&TZ, include_str!("../../../profiles/tz.toml")),
            (&ZW, include_str!("../../../profiles/zw.toml")),
            (&NA, include_str!("../../../profiles/na.toml")),
            (&BW, include_str!("../../../profiles/bw.toml")),
            (&GH, include_str!("../../../profiles/gh.toml")),
            (&NG, include_str!("../../../profiles/ng.toml")),
            (&MW, include_str!("../../../profiles/mw.toml")),
            (&ZM, include_str!("../../../profiles/zm.toml")),
            (&LS, include_str!("../../../profiles/ls.toml")),
            (&SZ, include_str!("../../../profiles/sz.toml")),
        ];
        for (builtin, toml) in pairs {
            let loaded = RegionProfile::from_toml(toml)
                .unwrap_or_else(|e| panic!("{} profile TOML must parse: {e}", builtin.code));
            assert_eq!(
                loaded.courts,
                builtin.courts,
                "profiles/{}.toml courts have drifted from the built-in",
                builtin.code.to_lowercase()
            );
            assert_eq!(
                loaded.series,
                builtin.series,
                "profiles/{}.toml series have drifted from the built-in",
                builtin.code.to_lowercase()
            );
            assert_eq!(
                *loaded,
                **builtin,
                "profiles/{}.toml has drifted from the built-in",
                builtin.code.to_lowercase()
            );
        }
    }

    /// Every pan-African profile is reachable by its ISO code, and the reference
    /// codes the extractor tests lean on really do resolve to the tier we claim.
    #[test]
    fn pan_african_profiles_resolve_their_apex_codes() {
        let cases: &[(&str, &str)] = &[
            ("KE", "KESC"),
            ("UG", "UGSC"),
            ("TZ", "TZCA"),
            ("ZW", "ZWCC"),
            ("NA", "NASC"),
            ("BW", "BWCA"),
            ("GH", "GHASC"),
            ("NG", "NGSC"),
            ("MW", "MWSC"),
            ("ZM", "ZMSC"),
            ("LS", "LSCA"),
            ("SZ", "SZSC"),
        ];
        for (cc, apex) in cases {
            let profile = builtin(cc).unwrap_or_else(|| panic!("{cc} must be built in"));
            assert!(
                profile.is_known_code(apex),
                "{apex} must be a known code under {cc}"
            );
            assert_eq!(
                profile.court(apex).unwrap().tier,
                Tier::Apex,
                "{apex} must be the apex court of {cc}"
            );
            assert_eq!(
                profile.authority_weight(apex),
                Tier::Apex.authority_weight(),
                "{apex} must carry apex authority weight under {cc}"
            );
        }
    }

    /// The specific case the brief calls out: `[2020] UGSC 4` must resolve under
    /// the Uganda profile. `UGSC` is the apex code; an unknown code in the same
    /// citation shape still gets the `Lower` floor rather than a guess.
    #[test]
    fn ug_profile_resolves_the_supreme_court_and_floors_the_unknown() {
        let ug = builtin("UG").expect("UG is built in");
        let ugsc = ug.court("UGSC").expect("[2020] UGSC 4 -> UGSC is known");
        assert_eq!(ugsc.tier, Tier::Apex);
        assert!(!ug.is_known_code("UGXX"));
        assert_eq!(ug.authority_weight("UGXX"), Tier::Lower.authority_weight());
    }

    #[test]
    fn alternation_is_longest_first_within_a_group() {
        let alt = ZA.series_alternation(false);
        let all_sa = alt.find("All SA").expect("All SA present");
        let sa = alt.find("SA|").expect("SA present");
        assert!(all_sa < sa, "All SA must precede SA: {alt}");
    }

    #[test]
    fn generic_profile_knows_nothing_and_still_answers() {
        assert!(GENERIC.court("ZACC").is_none());
        assert!(!GENERIC.is_known_code("ZACC"));
        assert_eq!(
            GENERIC.authority_weight("ZACC"),
            Tier::Lower.authority_weight()
        );
        assert!(GENERIC.series_alternation(false).is_empty());
        assert!(GENERIC.series_alternation(true).is_empty());
    }

    #[test]
    fn unknown_codes_get_the_floor_in_every_profile() {
        for profile in all_builtin() {
            assert!(profile.court("ZZNOTACOURT").is_none());
            assert_eq!(
                profile.authority_weight("ZZNOTACOURT"),
                Tier::Lower.authority_weight(),
                "profile {}",
                profile.code
            );
        }
    }

    #[test]
    fn court_codes_are_unique_within_every_profile() {
        for profile in all_builtin() {
            let mut seen = std::collections::HashSet::new();
            for court in profile.courts {
                assert!(
                    seen.insert(court.code.to_uppercase()),
                    "duplicate court code {} in profile {}",
                    court.code,
                    profile.code
                );
            }
        }
    }

    #[test]
    fn series_abbreviations_are_unique_within_every_profile() {
        for profile in all_builtin() {
            let mut seen = std::collections::HashSet::new();
            for s in profile.series {
                assert!(
                    seen.insert(s.abbr),
                    "duplicate series {} in profile {}",
                    s.abbr,
                    profile.code
                );
            }
        }
    }

    #[test]
    fn no_court_outranks_the_apex_in_any_profile() {
        for profile in all_builtin() {
            for court in profile.courts {
                assert!(
                    Tier::Apex.authority_weight() >= court.tier.authority_weight(),
                    "{} outranked the apex court in {}",
                    court.code,
                    profile.code
                );
            }
        }
    }

    #[test]
    fn builtin_lookup_is_case_insensitive() {
        assert_eq!(builtin("za").map(|p| p.code), Some("ZA"));
        assert_eq!(builtin("Generic").map(|p| p.code), Some("GENERIC"));
        assert!(builtin("XX").is_none());
    }

    #[test]
    fn default_is_za() {
        assert_eq!(default_profile().code, "ZA");
    }

    // ---- loading must fail, never panic ----------------------------------

    #[test]
    fn malformed_toml_is_an_error_not_a_panic() {
        let err = RegionProfile::from_toml("this is not = = toml").unwrap_err();
        assert!(matches!(err, RegionError::Malformed(_)), "{err}");
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn a_profile_missing_required_fields_is_an_error() {
        let err = RegionProfile::from_toml("name = \"No code\"").unwrap_err();
        assert!(matches!(err, RegionError::Malformed(_)), "{err}");
    }

    #[test]
    fn an_empty_code_is_rejected() {
        let err = RegionProfile::from_toml("code = \"  \"\nname = \"x\"").unwrap_err();
        assert!(matches!(err, RegionError::EmptyCode), "{err}");
    }

    #[test]
    fn duplicate_court_codes_are_rejected() {
        let src = r#"
code = "XX"
name = "Example"
[[courts]]
code = "XXSC"
name = "Supreme Court"
tier = "apex"
[[courts]]
code = "xxsc"
name = "Supreme Court again"
tier = "apex"
"#;
        let err = RegionProfile::from_toml(src).unwrap_err();
        assert!(matches!(err, RegionError::DuplicateCourtCode(_)), "{err}");
    }

    #[test]
    fn duplicate_series_are_rejected() {
        let src = r#"
code = "XX"
name = "Example"
[[series]]
abbr = "XR"
name = "Example Reports"
[[series]]
abbr = "XR"
name = "Example Reports, again"
"#;
        let err = RegionProfile::from_toml(src).unwrap_err();
        assert!(matches!(err, RegionError::DuplicateSeries(_)), "{err}");
    }

    #[test]
    fn an_empty_series_abbreviation_is_rejected() {
        // An empty alternation branch matches everywhere; it must never reach
        // the pattern builder.
        let src =
            "code = \"XX\"\nname = \"Example\"\n[[series]]\nabbr = \"\"\nname = \"Nothing\"\n";
        let err = RegionProfile::from_toml(src).unwrap_err();
        assert!(
            matches!(err, RegionError::InvalidField { field, .. } if field == "series abbreviation"),
            "{err}"
        );
    }

    #[test]
    fn an_unknown_tier_is_an_error() {
        let src = "code = \"XX\"\nname = \"Example\"\n[[courts]]\ncode = \"XXSC\"\nname = \"S\"\ntier = \"emperor\"\n";
        assert!(RegionProfile::from_toml(src).is_err());
    }

    #[test]
    fn a_minimal_profile_loads() {
        let loaded = RegionProfile::from_toml("code = \"XX\"\nname = \"Example\"")
            .expect("a profile with no courts and no series is legitimate");
        assert_eq!(loaded.code, "XX");
        assert!(loaded.courts.is_empty());
        assert!(loaded.series.is_empty());
    }

    #[test]
    fn regex_metacharacters_in_an_abbreviation_are_escaped_not_executed() {
        let src =
            "code = \"XX\"\nname = \"Example\"\n[[series]]\nabbr = \"A.(B\"\nname = \"Odd\"\n";
        let loaded = RegionProfile::from_toml(src).expect("escaping must make this safe");
        let alt = loaded.series_alternation(false);
        assert!(regex::Regex::new(&format!("({alt})")).is_ok(), "{alt}");
    }
}
