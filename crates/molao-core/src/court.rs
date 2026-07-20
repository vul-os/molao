//! The South African court registry.
//!
//! Every neutral citation carries a court code (`[2026] ZACC 26` → `ZACC`). The
//! registry maps that code to a court, and — more importantly — to a place in
//! the hierarchy. Authority ranking in [`molao_graph`] is meaningless without
//! it: a Constitutional Court judgment citing a case is not the same event as a
//! magistrate citing it.
//!
//! Codes follow the LII convention used by SAFLII and AfricanLII, which is the
//! de-facto standard for South African neutral citation.

use serde::{Deserialize, Serialize};

/// Where a court sits in the hierarchy. Ordered: `Apex` binds everything below.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Constitutional Court — binds every other court in the Republic.
    Apex,
    /// Supreme Court of Appeal.
    Appellate,
    /// Specialist appellate courts (Labour Appeal, Competition Appeal).
    SpecialistAppellate,
    /// High Court divisions. Binding on lower courts in their own division,
    /// persuasive across divisions.
    HighCourt,
    /// Courts with High Court status in a specialist jurisdiction
    /// (Labour Court, Land Claims Court, Tax Court, Electoral Court).
    SpecialistHigh,
    /// Tribunals of record whose decisions are cited but do not bind courts.
    Tribunal,
    /// Magistrates' and regional courts. Rarely reported; never binding.
    Lower,
}

impl Tier {
    /// Multiplier applied to citation edges when scoring authority.
    ///
    /// These are deliberately coarse. They encode "an SCA judgment relying on a
    /// case says more about that case than a High Court judgment does" — not a
    /// precise theory of precedent, which no constant can capture.
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

/// A court in the registry.
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

/// The registry. Codes are those used in South African neutral citations.
///
/// This list covers the courts that publish neutral citations. It is not
/// exhaustive of every tribunal in the Republic — unknown codes are handled
/// gracefully by [`lookup`] returning `None`, and the ingest path records them
/// rather than dropping the citation.
pub const COURTS: &[Court] = &[
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

/// Look a court up by its neutral-citation code. Case-insensitive.
pub fn lookup(code: &str) -> Option<&'static Court> {
    COURTS.iter().find(|c| c.code.eq_ignore_ascii_case(code))
}

/// Is this a code the registry knows? Used by the citation parser to decide
/// whether a `[YYYY] XXX NN` match is a real neutral citation or a false
/// positive that merely looks like one.
pub fn is_known_code(code: &str) -> bool {
    lookup(code).is_some()
}

/// Authority weight for a code, defaulting to the `Lower` weight for codes the
/// registry does not know. Unknown does not mean unimportant — it means we have
/// no basis to weight it up, so it gets the floor.
pub fn authority_weight(code: &str) -> f64 {
    lookup(code).map_or(Tier::Lower.authority_weight(), |c| {
        c.tier.authority_weight()
    })
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
}
