//! A seeded demo corpus, so `molao demo` gives a working node with no setup.
//!
//! # Why this exists
//!
//! There is no bundled corpus — a real node starts empty and you ingest a
//! release. That is correct, and it also means the first thing a new user sees
//! is an empty search box, which demonstrates nothing. `molao demo` fills that
//! gap: one command, a running node, a corpus dense enough that search,
//! "cited by", authority ranking, and the citation graph all show real
//! behaviour rather than an empty state.
//!
//! # These judgments are fictional
//!
//! Every party, judge, and passage below is invented. No real judgment text is
//! reproduced anywhere in this file. What is *real* is the shape: South African
//! neutral citations, the court hierarchy, paragraph numbering, parallel
//! reported citations, and a citation network with the structure a real one has
//! — a handful of foundational apex judgments that everything leans on, SCA
//! judgments that engage with them across several paragraphs, High Court
//! judgments that string-cite them, and citations pointing out of the corpus to
//! cases it does not hold.
//!
//! The invented style of cause is deliberate. Seeding with real judgments would
//! make a demo corpus indistinguishable from a real one at a glance, and a user
//! must never be able to mistake demonstration data for the law.
//!
//! # This is the ZA demo profile
//!
//! Molao is region-agnostic; South Africa is the first region profile. This
//! corpus is filed under `ZA` and is *demo data for that profile*, not a
//! statement that the system is South African.
//!
//! # Deliberate imperfections
//!
//! Some judgments carry two witnesses (corroborated), some one (single source),
//! and some none (manually entered), because the UI must show all three classes
//! and a demo where everything is corroborated would hide that. Several
//! citations point at judgments outside the corpus, because that is the normal
//! state of any real corpus and unresolved citations must be visible.

use molao_core::{DocId, Judgment, Paragraph, Provenance};
use molao_corpus::{Corpus, Result};

/// Region profile the demo corpus is filed under.
pub const DEMO_REGION: &str = "ZA";

/// One judgment in the seed, before ids are computed.
struct Seed {
    neutral: &'static str,
    court: &'static str,
    title: &'static str,
    date: &'static str,
    case_number: &'static str,
    judges: &'static [&'static str],
    reported: &'static [&'static str],
    /// Number of distinct witnesses to fabricate: 2 corroborated, 1 single,
    /// 0 manual.
    witnesses: usize,
    paragraphs: &'static [&'static str],
}

/// The seed corpus: fifteen fictional judgments across five courts.
const SEEDS: &[Seed] = &[
    // ---- Constitutional Court: the foundational layer --------------------
    Seed {
        neutral: "[1996] ZACC 12",
        court: "ZACC",
        title: "Mahlangu v Minister of Home Affairs",
        date: "1996-09-27",
        case_number: "CCT 14/96",
        judges: &["Mahlangu J", "Coetzee J", "Ngwenya J"],
        reported: &["1996 (4) SA 411 (CC)"],
        witnesses: 2,
        paragraphs: &[
            "MAHLANGU J:",
            "[1] This matter concerns the exercise of a statutory discretion by an official who gave no reasons for the decision, and who now says none were owed.",
            "[2] The exercise of public power is not a private matter. Every exercise of it must be authorised by law, and the person affected is entitled to know on what basis it was exercised. That is the principle of legality, and it is the foundation of the constitutional order.",
            "[3] It follows that a decision-maker who declines to give reasons has not merely been discourteous. The absence of reasons deprives the affected person of the means to challenge the decision at all, and so renders the right to just administrative action illusory.",
            "[4] We do not decide today what form reasons must take, or how promptly they must be furnished. Those questions are left open for a case in which they arise.",
            "[5] The decision is set aside and remitted for reconsideration. The respondent is to pay the applicant's costs.",
        ],
    },
    Seed {
        neutral: "[2003] ZACC 5",
        court: "ZACC",
        title: "Ntuli v Member of the Executive Council for Health, Gauteng",
        date: "2003-04-11",
        case_number: "CCT 41/02",
        judges: &["Ntuli DCJ", "Mahlangu J", "Van Der Merwe J"],
        reported: &["2003 (6) SA 88 (CC)", "2003 (9) BCLR 991 (CC)"],
        witnesses: 2,
        paragraphs: &[
            "NTULI DCJ:",
            "[1] The applicants are residents of an informal settlement who were refused access to a primary health-care clinic on the ground that they could not produce proof of address.",
            "[2] The State's obligation is one of reasonable measures within available resources. Reasonableness is not a licence for inaction, and a measure that excludes precisely those most in need of the service cannot be reasonable however carefully it is budgeted.",
            "[3] The reasoning in Mahlangu v Minister of Home Affairs [1996] ZACC 12 at para 2 applies with equal force here: the exercise of public power must be justified to those it affects, and a policy which cannot be explained to the people it excludes has not been justified at all.",
            "[4] We emphasise that this Court does not design health policy. It asks whether what has been designed meets the constitutional standard. This one does not.",
            "[5] The proof-of-address requirement is declared inconsistent with the Constitution and invalid.",
        ],
    },
    Seed {
        neutral: "[2011] ZACC 19",
        court: "ZACC",
        title: "Sibeko v Minister of Police",
        date: "2011-06-30",
        case_number: "CCT 88/10",
        judges: &["Sibeko J", "Ntuli DCJ", "Petersen AJ"],
        reported: &["2011 (5) SA 320 (CC)"],
        witnesses: 2,
        paragraphs: &[
            "SIBEKO J:",
            "[1] The applicant was arrested without a warrant, held for three days, and released without ever being charged. He seeks damages.",
            "[2] Deprivation of liberty is presumptively unlawful. Once the arrest is admitted, the burden falls on the arrestor to justify it, and that burden is not discharged by showing that the officer suspected something. The suspicion must be reasonable, and it must be shown to have been held on grounds the officer can articulate.",
            "[3] This allocation of the burden is not a technicality of pleading. It follows from the principle in Mahlangu v Minister of Home Affairs [1996] ZACC 12 at para 2 that the exercise of public power must be justified by the person exercising it, rather than disproved by the person subjected to it.",
            "[4] We reject the submission that a lower standard applies to arrests made at night or in areas the police consider dangerous. The Constitution does not have a geography.",
            "[5] The arrest was unlawful. The matter is remitted to the High Court for the assessment of damages.",
        ],
    },
    Seed {
        neutral: "[2018] ZACC 31",
        court: "ZACC",
        title: "Adams NO v Zwelitsha Municipality",
        date: "2018-10-04",
        case_number: "CCT 202/17",
        judges: &["Adams J", "Sibeko J", "Fourie J", "Ndlela AJ"],
        reported: &["2018 (11) BCLR 1301 (CC)", "2019 (1) SA 12 (CC)"],
        witnesses: 2,
        paragraphs: &[
            "ADAMS J:",
            "[1] This appeal concerns an eviction order granted against some four hundred occupiers of municipal land, without any inquiry into where they would go.",
            "[2] An eviction that renders people homeless is not simply the enforcement of a property right. The court granting it is itself exercising public power, and must satisfy itself that the order is just and equitable in all the circumstances.",
            "[3] What is just and equitable cannot be determined without knowing the circumstances. A court which grants an eviction without meaningful information about the occupiers' situation has not applied the standard; it has recited it.",
            "[4] The approach in Ntuli v Member of the Executive Council for Health, Gauteng [2003] ZACC 5 at paras 2-3 governs. A measure that excludes those most in need of protection cannot be reasonable, and an eviction process which is at its least searching where the occupiers are poorest is such a measure.",
            "[5] Mahlangu v Minister of Home Affairs [1996] ZACC 12 requires no less: the occupiers were entitled to know the basis on which their homes were to be taken.",
            "[6] The eviction order is set aside. The municipality is directed to engage meaningfully with the occupiers and to report to the High Court within four months.",
        ],
    },
    // ---- Supreme Court of Appeal -----------------------------------------
    Seed {
        neutral: "[2005] ZASCA 44",
        court: "ZASCA",
        title: "Van Wyk v Reliance Assurance Society Ltd",
        date: "2005-05-27",
        case_number: "233/2004",
        judges: &["Van Wyk JA", "Bekker JA", "Mothibe AJA"],
        reported: &["2005 (4) SA 501 (SCA)"],
        witnesses: 2,
        paragraphs: &[
            "VAN WYK JA:",
            "[1] The dispute is about the meaning of an exclusion clause in a policy of insurance, and about how far a court may look beyond the words to the circumstances in which they were used.",
            "[2] Interpretation is a unitary exercise. The words, the document as a whole, and the circumstances attending its making are considered together from the outset. The old approach, which admitted context only once ambiguity had been demonstrated, required a court to pretend to a certainty about meaning that it did not have.",
            "[3] That does not license rewriting. Context illuminates the words chosen; it does not license substituting words the parties did not choose because they would produce a more commercially sensible result.",
            "[4] On any reading, the exclusion does not extend to the loss claimed. The appeal succeeds.",
        ],
    },
    Seed {
        neutral: "[2012] ZASCA 88",
        court: "ZASCA",
        title: "Motaung v Road Accident Fund",
        date: "2012-05-31",
        case_number: "612/2011",
        judges: &["Motaung JA", "Van Wyk JA", "Dlomo AJA"],
        reported: &["2012 (5) SA 177 (SCA)"],
        witnesses: 1,
        paragraphs: &[
            "MOTAUNG JA:",
            "[1] The appellant sustained a spinal injury in a collision and was awarded general damages which he says are far too low.",
            "[2] Comparable awards are a guide and never a tariff. A court which reduces the assessment of general damages to arithmetic between decided cases has abandoned the exercise it is required to perform.",
            "[3] The trial court's award is so far out of line with the evidence of the appellant's circumstances that this Court is entitled to interfere.",
            "[4] The award of general damages is set aside and substituted with one of R1 400 000.",
        ],
    },
    Seed {
        neutral: "[2019] ZASCA 102",
        court: "ZASCA",
        title: "Pretorius NO v Blaauwberg Fisheries (Pty) Ltd",
        date: "2019-08-15",
        case_number: "1044/2018",
        judges: &["Pretorius JA", "Motaung JA", "Sithole AJA"],
        reported: &["2019 (6) SA 455 (SCA)"],
        witnesses: 1,
        paragraphs: &[
            "PRETORIUS JA:",
            "[1] This appeal concerns the removal of a business rescue practitioner on the application of a creditor who says the rescue plan was never viable.",
            "[2] The threshold for removal is high, and deliberately so. A practitioner who could be removed whenever a creditor was dissatisfied would be unable to do the job at all.",
            "[3] The correct approach to the statutory language is that set out in Van Wyk v Reliance Assurance Society Ltd [2005] ZASCA 44 at para 2: the words, the statute as a whole, and the purpose of the rescue provisions are considered together.",
            "[4] Applying Van Wyk v Reliance Assurance Society Ltd [2005] ZASCA 44, the phrase relied on by the creditor cannot bear the meaning contended for without depriving the section of any function.",
            "[5] The appeal is dismissed with costs.",
        ],
    },
    Seed {
        neutral: "[2021] ZASCA 61",
        court: "ZASCA",
        title: "Naicker v Ethekwini Metropolitan Municipality",
        date: "2021-05-14",
        case_number: "377/2020",
        judges: &["Naicker JA", "Pretorius JA", "Khoza AJA"],
        reported: &["2021 (5) SA 233 (SCA)", "[2021] 3 All SA 200 (SCA)"],
        witnesses: 2,
        paragraphs: &[
            "NAICKER JA:",
            "[1] The appellant's tender was disqualified for a defect that the municipality's own officials had told her did not matter.",
            "[2] A tender process is an exercise of public power and is reviewable as such. The principle in Mahlangu v Minister of Home Affairs [1996] ZACC 12 at para 2 is not confined to decisions about persons; it applies wherever an organ of state decides something that affects rights.",
            "[3] The municipality's answer is that the appellant should have known the requirement was mandatory despite what she was told. That answer inverts the burden. As Sibeko v Minister of Police [2011] ZACC 19 at para 2 makes plain, it is for the public body to justify its exercise of power, not for the affected person to anticipate it.",
            "[4] We add that the reasoning in Sibeko v Minister of Police [2011] ZACC 19 is not confined to arrests. It states a general rule about who must justify what.",
            "[5] The disqualification is reviewed and set aside. The tender is remitted for reconsideration.",
        ],
    },
    // ---- Labour Appeal Court ---------------------------------------------
    Seed {
        neutral: "[2017] ZALAC 7",
        court: "ZALAC",
        title: "Sikhosana v Blue Ridge Mining (Pty) Ltd",
        date: "2017-03-22",
        case_number: "JA 55/2016",
        judges: &["Sikhosana JA", "Adams AJA"],
        reported: &["(2017) 38 ILJ 1120 (LAC)"],
        witnesses: 1,
        paragraphs: &[
            "SIKHOSANA JA:",
            "[1] The appellant was dismissed after a disciplinary hearing at which he was given the charge sheet on the morning of the hearing itself.",
            "[2] Procedural fairness in the workplace is not a lesser standard because the employer is a private party. What it requires is that the employee know the case against him in time to answer it.",
            "[3] The reasoning in Mahlangu v Minister of Home Affairs [1996] ZACC 12 at para 3 is instructive by analogy: a process which withholds the basis for a decision until it is too late to contest it is not a process at all.",
            "[4] The dismissal was procedurally unfair. Compensation equivalent to six months' remuneration is awarded.",
        ],
    },
    // ---- High Court divisions --------------------------------------------
    Seed {
        neutral: "[2014] ZAGPJHC 210",
        court: "ZAGPJHC",
        title: "Dlamini v City of Johannesburg",
        date: "2014-08-19",
        case_number: "2013/44120",
        judges: &["Dlamini J"],
        reported: &[],
        witnesses: 1,
        paragraphs: &[
            "DLAMINI J:",
            "[1] The applicants occupy a derelict building in the inner city and face eviction on the application of the owner, with the City joined as a party.",
            "[2] The City's report says only that alternative accommodation is unavailable. It does not say what was investigated, or when.",
            "[3] Ntuli v Member of the Executive Council for Health, Gauteng [2003] ZACC 5 at para 2 requires reasonable measures, and a report which records a conclusion without the enquiry behind it does not demonstrate any.",
            "[4] The eviction application is postponed. The City is directed to file a further report within sixty days.",
        ],
    },
    Seed {
        neutral: "[2016] ZAWCHC 88",
        court: "ZAWCHC",
        title: "Pieterse v Overberg District Municipality",
        date: "2016-07-11",
        case_number: "14882/2015",
        judges: &["Pieterse J", "Solomons AJ"],
        reported: &[],
        witnesses: 2,
        paragraphs: &[
            "PIETERSE J:",
            "[1] The applicant seeks review of a decision to refuse her application for a business licence, taken without notice to her and without reasons.",
            "[2] Mahlangu v Minister of Home Affairs [1996] ZACC 12 at paras 2-3 disposes of the first ground. No reasons were given, and the respondent does not suggest that any were owed.",
            "[3] Counsel for the respondent relied on Standard Bank v Verwoerd 1998 (2) SA 44 (SCA), a judgment not before us in full, for the proposition that a licensing decision is administrative only once a right has vested. We do not read it that way, but in any event Mahlangu v Minister of Home Affairs [1996] ZACC 12 is binding on this Court and settles the point.",
            "[4] The decision is reviewed and set aside.",
        ],
    },
    Seed {
        neutral: "[2020] ZAGPJHC 55",
        court: "ZAGPJHC",
        title: "Khoza v Minister of Police",
        date: "2020-03-06",
        case_number: "2018/31007",
        judges: &["Khoza J"],
        reported: &[],
        witnesses: 0,
        paragraphs: &[
            "KHOZA J:",
            "[1] The plaintiff was arrested at a roadblock and detained overnight. The defendant pleads that the arrest was lawful but leads no evidence about what the arresting officer suspected.",
            "[2] Sibeko v Minister of Police [2011] ZACC 19 at para 2 is directly in point. The onus rests on the defendant, and on this record it has not been discharged.",
            "[3] The defendant's argument that Sibeko v Minister of Police [2011] ZACC 19 applies only where the detention exceeds forty-eight hours finds no support in that judgment.",
            "[4] I am also referred to Mahlangu v Minister of Home Affairs [1996] ZACC 12, which underpins the allocation of the onus.",
            "[5] The plaintiff is awarded damages of R180 000 together with costs.",
        ],
    },
    Seed {
        neutral: "[2022] ZAWCHC 141",
        court: "ZAWCHC",
        title: "Abrahams v Cape Peninsula Housing Company NPC",
        date: "2022-11-08",
        case_number: "9912/2021",
        judges: &["Abrahams J"],
        reported: &["2023 (2) SA 61 (WCC)"],
        witnesses: 2,
        paragraphs: &[
            "ABRAHAMS J:",
            "[1] The respondents are elderly tenants of a social housing scheme who have fallen into arrears and face eviction.",
            "[2] Adams NO v Zwelitsha Municipality [2018] ZACC 31 at paras 2-3 requires this Court to satisfy itself that an eviction is just and equitable, on information about the occupiers rather than assertions about them.",
            "[3] Applying Adams NO v Zwelitsha Municipality [2018] ZACC 31, the papers before me disclose nothing about where the respondents would go, and the applicant accepts that it made no enquiry.",
            "[4] Ntuli v Member of the Executive Council for Health, Gauteng [2003] ZACC 5 at para 2 is to the same effect in the context of access to services.",
            "[5] The application is dismissed. The applicant may renew it on properly supplemented papers.",
        ],
    },
    Seed {
        neutral: "[2023] ZAGPJHC 12",
        court: "ZAGPJHC",
        title: "Moloi v Standard Trust Bank Ltd",
        date: "2023-01-30",
        case_number: "2021/58803",
        judges: &["Moloi AJ"],
        reported: &[],
        witnesses: 1,
        paragraphs: &[
            "MOLOI AJ:",
            "[1] The plaintiff says the bank's standard-form guarantee does not cover the debt for which it now holds him liable.",
            "[2] Van Wyk v Reliance Assurance Society Ltd [2005] ZASCA 44 at para 2 sets out the approach: the words, the document as a whole, and the circumstances of its making, considered together.",
            "[3] Applying Van Wyk v Reliance Assurance Society Ltd [2005] ZASCA 44 at para 3, I may not rewrite the clause because the bank would have preferred a wider one.",
            "[4] I was also referred to Pretorius NO v Blaauwberg Fisheries (Pty) Ltd [2019] ZASCA 102, which applies the same approach to a statute.",
            "[5] The guarantee does not cover the debt. Absolution is refused and judgment is granted for the plaintiff.",
        ],
    },
    Seed {
        neutral: "[2024] ZAWCHC 9",
        court: "ZAWCHC",
        title: "Solomons v Minister of Human Settlements",
        date: "2024-02-14",
        case_number: "1123/2023",
        judges: &["Solomons J", "Abrahams J"],
        reported: &[],
        witnesses: 1,
        paragraphs: &[
            "SOLOMONS J:",
            "[1] The applicants were removed from a housing waiting list without notice when the department revised its allocation criteria.",
            "[2] Adams NO v Zwelitsha Municipality [2018] ZACC 31 at para 2 establishes that a decision of this kind is an exercise of public power attracting the duty to act justly and equitably.",
            "[3] Ntuli v Member of the Executive Council for Health, Gauteng [2003] ZACC 5 at paras 2-3 requires that the measure be reasonable, and one which removes the longest-waiting applicants first is not.",
            "[4] Abrahams v Cape Peninsula Housing Company NPC [2022] ZAWCHC 141 at para 2 applied Adams NO v Zwelitsha Municipality [2018] ZACC 31 in a comparable setting and I respectfully follow it.",
            "[5] Mahlangu v Minister of Home Affairs [1996] ZACC 12 at para 2 completes the picture: no reasons were given to the applicants at all.",
            "[6] I record that Ex parte Meintjies 1975 (3) SA 12 (C), on which the respondent relied, predates the Constitution and does not assist.",
            "[7] The removal of the applicants from the waiting list is reviewed and set aside.",
        ],
    },
];

/// Build the demo judgments, with correctly computed ids.
fn build() -> Vec<(Judgment, Vec<Provenance>)> {
    let mut out = Vec::with_capacity(SEEDS.len());
    for seed in SEEDS {
        let paragraphs: Vec<Paragraph> = seed
            .paragraphs
            .iter()
            .enumerate()
            .map(|(i, text)| {
                // The coram line carries no paragraph number; the rest are
                // numbered as printed, in the `[n]` style South African
                // judgments use.
                let (number, body) = match text.strip_prefix('[') {
                    Some(rest) => match rest.split_once(']') {
                        Some((n, b)) => (Some(n.to_string()), b.trim()),
                        None => (None, *text),
                    },
                    None => (None, *text),
                };
                Paragraph {
                    index: i as u32,
                    number,
                    text: body.to_string(),
                }
            })
            .collect();

        // Must match Judgment::canonical_text exactly.
        let body = paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let id = DocId::of_raw(&body);

        // Fabricated witnesses. The signatures are placeholders and would not
        // verify — nothing in the node checks them today, and the demo must not
        // be the reason someone believes otherwise.
        let provenance = (0..seed.witnesses)
            .map(|w| Provenance {
                doc_id: id,
                source_url: format!(
                    "https://example.invalid/demo/{}",
                    seed.neutral.replace(['[', ']', ' '], "-").trim_matches('-')
                ),
                fetched_at: "2026-07-20T08:00:00Z".to_string(),
                raw_hash: hex_seed(&id, w),
                witness: format!("demo-witness-{w}"),
                signature: "00".repeat(64),
            })
            .collect();

        out.push((
            Judgment {
                id,
                neutral_citation: Some(seed.neutral.to_string()),
                court: seed.court.to_string(),
                title: seed.title.to_string(),
                case_numbers: vec![seed.case_number.to_string()],
                date: Some(seed.date.to_string()),
                judges: seed.judges.iter().map(|s| s.to_string()).collect(),
                reported_citations: seed.reported.iter().map(|s| s.to_string()).collect(),
                paragraphs,
            },
            provenance,
        ));
    }
    out
}

/// A deterministic stand-in for a raw-bytes hash. Not a real digest of
/// anything; it exists so the field is populated and stable between runs.
fn hex_seed(id: &DocId, witness: usize) -> String {
    let mut h = blake3_of(id.as_bytes());
    h.push_str(&format!("{witness:02x}"));
    h.truncate(64);
    h
}

fn blake3_of(bytes: &[u8]) -> String {
    // Reuse molao-core's dependency rather than adding blake3 here for one call.
    molao_core::DocId::of_canonical(&hex_string(bytes)).to_string()
}

fn hex_string(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Seed `corpus` with the demo judgments and relink.
///
/// Idempotent: judgments are content-addressed, so seeding twice is a no-op
/// rather than a duplicate corpus.
pub fn seed(corpus: &mut Corpus) -> Result<usize> {
    let judgments = build();
    for (judgment, provenance) in &judgments {
        corpus.insert_judgment_in_region(judgment, provenance, DEMO_REGION)?;
    }
    corpus.relink()?;
    Ok(judgments.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use molao_graph::Graph;

    #[test]
    fn every_demo_judgment_verifies_against_its_own_id() {
        for (j, _) in build() {
            assert!(j.verify_id(), "{} does not verify", j.title);
        }
    }

    #[test]
    fn the_demo_corpus_seeds_and_is_idempotent() {
        let mut c = Corpus::open_in_memory().unwrap();
        let n = seed(&mut c).unwrap();
        assert_eq!(n, SEEDS.len());
        assert_eq!(c.stats().unwrap().docs, SEEDS.len() as u64);

        seed(&mut c).unwrap();
        assert_eq!(c.stats().unwrap().docs, SEEDS.len() as u64);
    }

    #[test]
    fn the_demo_corpus_is_big_enough_to_be_worth_showing() {
        // The point of the demo is a non-trivial graph. If a future edit thins
        // it out, this fails rather than quietly shipping an empty-looking node.
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        let stats = c.stats().unwrap();
        assert!(stats.docs >= 10, "only {} judgments", stats.docs);
        assert!(stats.edges >= 15, "only {} resolved edges", stats.edges);
        assert!(stats.courts >= 4, "only {} courts", stats.courts);
    }

    #[test]
    fn all_three_provenance_classes_are_represented() {
        // The UI must show all three, so the demo must exercise all three.
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        let s = c.stats().unwrap();
        assert!(s.corroborated > 0, "no corroborated judgments");
        assert!(s.single > 0, "no single-source judgments");
        assert!(s.manual > 0, "no manually-entered judgments");
    }

    #[test]
    fn the_demo_has_unresolved_citations_because_real_corpora_do() {
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        assert!(
            c.stats().unwrap().unresolved > 0,
            "a corpus where every citation resolves is not realistic"
        );
    }

    #[test]
    fn the_demo_graph_ranks_the_foundational_judgment_first() {
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        let g = Graph::build(&c).unwrap();
        let top = g
            .nodes()
            .iter()
            .max_by(|a, b| a.authority.total_cmp(&b.authority))
            .unwrap();
        assert_eq!(top.title, "Mahlangu v Minister of Home Affairs");
        assert_eq!(top.court, "ZACC");
    }

    #[test]
    fn depth_of_engagement_shows_up_in_the_demo_graph() {
        // At least one edge must engage across several paragraphs, or the demo
        // does not actually demonstrate the depth weighting.
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        let g = Graph::build(&c).unwrap();
        assert!(
            g.edges().iter().any(|e| e.paragraph_count >= 2),
            "no multi-paragraph engagement in the demo corpus"
        );
    }

    #[test]
    fn the_demo_is_filed_under_the_za_region_profile() {
        let mut c = Corpus::open_in_memory().unwrap();
        seed(&mut c).unwrap();
        assert_eq!(
            c.stats().unwrap().regions,
            vec![(DEMO_REGION.to_string(), SEEDS.len() as u64)]
        );
    }

    #[test]
    fn demo_parties_are_invented_not_real_cases() {
        // A guard against someone "improving" the demo by pasting in real
        // judgments. These are the styles of cause of well-known South African
        // cases; none of them may appear here.
        let real = [
            "Makwanyane",
            "Grootboom",
            "Fose",
            "Pharmaceutical Manufacturers",
            "Bato Star",
            "Zuma",
            "Glenister",
            "Mazibuko",
            "Endumeni",
            "Natal Joint Municipal Pension",
        ];
        for seed in SEEDS {
            for name in real {
                assert!(
                    !seed.title.contains(name),
                    "demo corpus contains a real case name: {}",
                    seed.title
                );
            }
        }
    }
}
