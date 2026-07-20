//! Search behaviour against a real FTS5 index.
//!
//! The unit tests in `molao_corpus::search` prove that [`sanitise_query`]
//! *cannot emit* an operator. These prove the other half: that the resulting
//! expressions actually run against SQLite without erroring, return what a
//! lawyer would expect, and that no input — however hostile — turns into an
//! error or a lost table. Both halves are needed; a sanitiser that produces
//! safe-but-invalid expressions would pass the unit tests and break the site.

use molao_corpus::ingest::test_support::judgment;
use molao_corpus::{Corpus, SearchFilters};

fn corpus() -> Corpus {
    let mut c = Corpus::open_in_memory().unwrap();
    let mut add = |court: &str, neutral: &str, title: &str, date: &str, paras: &[&str]| {
        let mut j = judgment(court, neutral, title, paras);
        j.date = Some(date.to_string());
        c.insert_judgment(&j, &[]).unwrap();
    };

    add(
        "ZACC",
        "[2019] ZACC 11",
        "Sithole v Minister of Police",
        "2019-05-14",
        &[
            "The applicant claims damages for unlawful arrest and detention.",
            "Section 12 of the Constitution guarantees freedom and security of the person.",
        ],
    );
    add(
        "ZASCA",
        "[2021] ZASCA 40",
        "Naidoo v Road Accident Fund",
        "2021-04-01",
        &["The claim for general damages arises from a collision on the N3."],
    );
    add(
        "ZAWCHC",
        "[2023] ZAWCHC 7",
        "Petersen v City of Cape Town",
        "2023-02-20",
        &["An eviction application brought against unlawful occupiers."],
    );
    c.relink().unwrap();
    c
}

#[test]
fn a_plain_search_finds_the_right_judgment_and_marks_the_match() {
    let c = corpus();
    let (total, hits) = c
        .search("eviction", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 1);
    assert_eq!(hits[0].title, "Petersen v City of Cape Town");
    assert!(
        hits[0].snippet.contains("<mark>"),
        "no highlight in {:?}",
        hits[0].snippet
    );
    assert_eq!(
        hits[0].court_name,
        "High Court of South Africa, Western Cape Division"
    );
}

#[test]
fn multiple_terms_are_a_conjunction_across_the_whole_judgment() {
    let c = corpus();
    // These two words are in different paragraphs of the same judgment: the
    // search must still find it, which is why the FTS unit is the judgment.
    let (total, hits) = c
        .search("detention Constitution", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 1, "{hits:?}");
    assert_eq!(hits[0].neutral_citation.as_deref(), Some("[2019] ZACC 11"));

    // A term that appears in no single judgment alongside the other.
    let (total, _) = c
        .search("eviction collision", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 0);
}

#[test]
fn the_title_is_searchable_as_well_as_the_text() {
    let c = corpus();
    let (total, hits) = c
        .search("Naidoo", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 1);
    assert_eq!(hits[0].court, "ZASCA");
}

#[test]
fn hostile_and_malformed_queries_never_error_and_never_damage_the_corpus() {
    let c = corpus();
    let before = c.stats().unwrap();

    // SQL injection attempts, FTS5 expression attacks, syntax that would be a
    // hard error if passed through, and assorted junk.
    let attacks = [
        "'; DROP TABLE judgments; --",
        "\" OR 1=1 --",
        "damages'); DELETE FROM citations; --",
        "NEAR(damages arrest, 100000)",
        "((((((((((",
        "))))",
        "title:*",
        "* * *",
        "AND OR NOT NEAR",
        "^damages",
        "-",
        "\"unterminated",
        "damages OR (arrest AND NOT detention)",
        "a\0b",
        "%_%",
        "\\",
        "文字",
        &"a ".repeat(500),
    ];

    for attack in attacks {
        let result = c.search(attack, &SearchFilters::default(), 20, 0);
        assert!(result.is_ok(), "query {attack:?} errored: {result:?}");
    }

    assert_eq!(c.stats().unwrap(), before, "the corpus was modified");
    // And the tables are all still there.
    assert_eq!(
        c.search("eviction", &SearchFilters::default(), 20, 0)
            .unwrap()
            .0,
        1
    );
}

#[test]
fn an_empty_query_browses_by_authority_rather_than_erroring() {
    let c = corpus();
    let (total, hits) = c.search("", &SearchFilters::default(), 20, 0).unwrap();
    assert_eq!(total, 3);
    assert_eq!(hits.len(), 3);
    assert!(hits.iter().all(|h| h.snippet.is_empty()));
}

#[test]
fn filters_narrow_a_search_and_a_browse_alike() {
    let c = corpus();
    let zacc = SearchFilters::default().court("ZACC");

    let (total, hits) = c.search("", &zacc, 20, 0).unwrap();
    assert_eq!(total, 1);
    assert_eq!(hits[0].court, "ZACC");

    let (total, _) = c.search("damages", &zacc, 20, 0).unwrap();
    assert_eq!(total, 1);

    // Court codes are matched case-insensitively.
    let (total, _) = c
        .search("", &SearchFilters::default().court("zacc"), 20, 0)
        .unwrap();
    assert_eq!(total, 1);

    // A court with nothing in it is empty, not an error.
    let (total, hits) = c
        .search("", &SearchFilters::default().court("ZALCC"), 20, 0)
        .unwrap();
    assert_eq!(total, 0);
    assert!(hits.is_empty());
}

#[test]
fn year_ranges_are_inclusive_at_both_ends() {
    let c = corpus();
    let years = |from, to| {
        c.search("", &SearchFilters::default().years(from, to), 20, 0)
            .unwrap()
            .0
    };
    assert_eq!(years(None, None), 3);
    assert_eq!(years(Some(2019), Some(2019)), 1);
    assert_eq!(years(Some(2021), Some(2023)), 2);
    assert_eq!(years(Some(2019), Some(2023)), 3);
    assert_eq!(years(Some(2024), None), 0);
    assert_eq!(years(None, Some(2018)), 0);
    // A reversed range is empty, not an error.
    assert_eq!(years(Some(2023), Some(2019)), 0);
}

#[test]
fn court_and_year_filters_compose() {
    let c = corpus();
    let f = SearchFilters::default()
        .court("ZASCA")
        .years(Some(2021), Some(2021));
    assert_eq!(c.search("damages", &f, 20, 0).unwrap().0, 1);

    let f = SearchFilters::default()
        .court("ZASCA")
        .years(Some(2022), None);
    assert_eq!(c.search("damages", &f, 20, 0).unwrap().0, 0);
}

#[test]
fn paging_walks_the_result_set_without_repeating_or_losing_rows() {
    let c = corpus();
    let (total, first) = c.search("", &SearchFilters::default(), 2, 0).unwrap();
    assert_eq!(total, 3);
    assert_eq!(first.len(), 2);

    let (total, second) = c.search("", &SearchFilters::default(), 2, 2).unwrap();
    assert_eq!(total, 3, "total must be the full count, not the page size");
    assert_eq!(second.len(), 1);

    let mut ids: Vec<&str> = first
        .iter()
        .chain(second.iter())
        .map(|h| h.id.as_str())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), 3);

    // Past the end is empty, not an error.
    assert!(c
        .search("", &SearchFilters::default(), 2, 999)
        .unwrap()
        .1
        .is_empty());
}

#[test]
fn the_limit_is_clamped_so_no_request_can_ask_for_everything() {
    let c = corpus();
    // Zero would otherwise return nothing; u32::MAX would otherwise be a
    // denial-of-service on a large corpus.
    assert_eq!(
        c.search("", &SearchFilters::default(), 0, 0)
            .unwrap()
            .1
            .len(),
        1
    );
    let (_, hits) = c
        .search("", &SearchFilters::default(), u32::MAX, 0)
        .unwrap();
    assert!(hits.len() <= molao_corpus::MAX_LIMIT as usize);
}

#[test]
fn a_prefix_search_matches_word_beginnings() {
    let c = corpus();
    let (total, _) = c
        .search("evict*", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 1);
    // Without the star it is an exact-term match, so the stem alone finds
    // nothing.
    let (total, _) = c.search("evict", &SearchFilters::default(), 20, 0).unwrap();
    assert_eq!(total, 0);
}

#[test]
fn punctuation_a_lawyer_would_actually_type_does_not_break_the_search() {
    let c = corpus();
    // Every one of these contains characters that are FTS5 syntax. Every one
    // must find the case rather than erroring or coming back empty.
    for query in [
        "Sithole v Minister of Police",
        "Sithole v. Minister of Police",
        "unlawful arrest & detention",
        "arrest, detention",
        "\"unlawful arrest\"",
        "(Sithole)",
        "[2019] ZACC 11 arrest",
    ] {
        let (total, _) = c.search(query, &SearchFilters::default(), 20, 0).unwrap();
        assert!(total >= 1, "query {query:?} found nothing");
    }
}

#[test]
fn a_case_can_be_found_by_its_citation() {
    // The commonest legal lookup there is. The citation is metadata and appears
    // nowhere in the judgment's text, so this only works because it is indexed
    // as its own FTS column.
    let c = corpus();
    for query in ["[2019] ZACC 11", "2019 ZACC 11", "ZACC 11"] {
        let (total, hits) = c.search(query, &SearchFilters::default(), 20, 0).unwrap();
        assert_eq!(total, 1, "query {query:?}");
        assert_eq!(hits[0].title, "Sithole v Minister of Police");
    }
}

#[test]
fn a_case_can_be_found_by_a_parallel_reported_citation_or_case_number() {
    let mut c = Corpus::open_in_memory().unwrap();
    let mut j = judgment(
        "ZASCA",
        "[2021] ZASCA 40",
        "Naidoo v RAF",
        &["General damages."],
    );
    j.reported_citations = vec!["2021 (4) SA 200 (SCA)".into()];
    j.case_numbers = vec!["442/2020".into()];
    c.insert_judgment(&j, &[]).unwrap();

    for query in ["2021 (4) SA 200", "442/2020"] {
        let (total, _) = c.search(query, &SearchFilters::default(), 20, 0).unwrap();
        assert_eq!(total, 1, "query {query:?}");
    }
}

#[test]
fn every_term_must_match_even_when_one_of_them_is_a_court_suffix() {
    // Documents a deliberate choice, because it has a real cost.
    //
    // Terms are ANDed. So pasting a full citation with its court suffix —
    // "Sithole v Minister of Police (CC)" — finds nothing, because the token
    // "CC" appears nowhere in the judgment's text or title.
    //
    // The alternative, falling back to OR when AND finds nothing, was
    // considered and rejected: it silently changes what the query means with
    // no way for the searcher to tell, so a result list that looks like "these
    // judgments discuss both of your terms" would sometimes mean "these
    // judgments discuss one of them". For legal research that is the worse
    // failure. Zero results is honest and the searcher can drop a word.
    let c = corpus();
    let (total, _) = c
        .search(
            "Sithole v Minister of Police (CC)",
            &SearchFilters::default(),
            20,
            0,
        )
        .unwrap();
    assert_eq!(total, 0);
}

#[test]
fn authority_lifts_a_leading_case_above_an_equally_relevant_one() {
    let mut c = Corpus::open_in_memory().unwrap();
    // The texts must differ: identical text means an identical DocId, so the
    // second insert would replace the first rather than sit beside it.
    let leading = judgment(
        "ZACC",
        "[2000] ZACC 1",
        "Leading Case",
        &["A dispute about servitudes over farm land."],
    );
    let obscure = judgment(
        "ZAGPJHC",
        "[2020] ZAGPJHC 1",
        "Obscure Case",
        &["A dispute about servitudes over township erven."],
    );
    c.insert_judgment(&leading, &[]).unwrap();
    c.insert_judgment(&obscure, &[]).unwrap();
    assert_eq!(c.stats().unwrap().docs, 2);
    c.set_authority(&leading.id, 0.9).unwrap();
    c.set_authority(&obscure.id, 0.01).unwrap();

    let (total, hits) = c
        .search("servitudes", &SearchFilters::default(), 20, 0)
        .unwrap();
    assert_eq!(total, 2);
    assert_eq!(hits[0].title, "Leading Case", "ranking ignored authority");
}

#[test]
fn two_judgments_with_identical_text_are_one_judgment() {
    // Not a quirk to work around — it is what content addressing means, and it
    // is how a mirror re-ingesting a release avoids duplicating it.
    let mut c = Corpus::open_in_memory().unwrap();
    let a = judgment(
        "ZACC",
        "[2000] ZACC 1",
        "First Filing",
        &["Identical text."],
    );
    let b = judgment(
        "ZAGPJHC",
        "[2020] ZAGPJHC 1",
        "Second Filing",
        &["Identical text."],
    );
    assert_eq!(a.id, b.id);
    c.insert_judgment(&a, &[]).unwrap();
    c.insert_judgment(&b, &[]).unwrap();
    assert_eq!(c.stats().unwrap().docs, 1);
}

#[test]
fn cited_by_counts_come_back_with_the_hits() {
    let mut c = Corpus::open_in_memory().unwrap();
    let target = judgment(
        "ZACC",
        "[1995] ZACC 3",
        "Foundational Case",
        &["The principle is settled."],
    );
    c.insert_judgment(&target, &[]).unwrap();
    for n in 1..=3 {
        let citing = judgment(
            "ZASCA",
            &format!("[2020] ZASCA {n}"),
            &format!("Applicant {n} v Respondent"),
            &[&format!(
                "Case {n} follows [1995] ZACC 3 on the settled principle."
            )],
        );
        c.insert_judgment(&citing, &[]).unwrap();
    }
    c.relink().unwrap();

    let (_, hits) = c
        .search("settled", &SearchFilters::default(), 20, 0)
        .unwrap();
    let target_hit = hits
        .iter()
        .find(|h| h.title == "Foundational Case")
        .unwrap();
    assert_eq!(target_hit.cited_by_count, 3);
}

// ---- region profiles -----------------------------------------------------
//
// Molao is region-agnostic: a corpus can hold several jurisdictions at once and
// South Africa is simply the first profile. These prove the store does not
// assume otherwise.

#[test]
fn judgments_default_to_the_default_region() {
    let c = corpus();
    let (_, hits) = c.search("", &SearchFilters::default(), 20, 0).unwrap();
    assert!(hits
        .iter()
        .all(|h| h.region == molao_corpus::DEFAULT_REGION));
    assert_eq!(
        c.stats().unwrap().regions,
        vec![(molao_corpus::DEFAULT_REGION.to_string(), 3)]
    );
}

#[test]
fn a_corpus_can_hold_several_regions_at_once() {
    let mut c = Corpus::open_in_memory().unwrap();
    let za = judgment(
        "ZACC",
        "[2020] ZACC 1",
        "Sithole v Minister",
        &["A constitutional claim."],
    );
    let ke = judgment(
        "KESC",
        "[2020] KESC 4",
        "Wanjiku v Attorney General",
        &["A constitutional petition."],
    );
    c.insert_judgment_in_region(&za, &[], "ZA").unwrap();
    c.insert_judgment_in_region(&ke, &[], "KE").unwrap();

    let stats = c.stats().unwrap();
    assert_eq!(stats.docs, 2);
    assert_eq!(
        stats.regions,
        vec![("KE".to_string(), 1), ("ZA".to_string(), 1)]
    );
    assert_eq!(c.region(&ke.id).unwrap().as_deref(), Some("KE"));

    // An unknown court code in a new region must not be dropped.
    assert!(c.courts().unwrap().iter().any(|court| court.code == "KESC"));
}

#[test]
fn the_region_filter_narrows_search_and_browse() {
    let mut c = Corpus::open_in_memory().unwrap();
    let za = judgment(
        "ZACC",
        "[2020] ZACC 1",
        "Sithole v Minister",
        &["A constitutional claim about detention."],
    );
    let ke = judgment(
        "KESC",
        "[2020] KESC 4",
        "Wanjiku v AG",
        &["A constitutional petition about detention."],
    );
    c.insert_judgment_in_region(&za, &[], "ZA").unwrap();
    c.insert_judgment_in_region(&ke, &[], "KE").unwrap();

    assert_eq!(
        c.search("detention", &SearchFilters::default(), 20, 0)
            .unwrap()
            .0,
        2
    );

    let (total, hits) = c
        .search("detention", &SearchFilters::default().region("KE"), 20, 0)
        .unwrap();
    assert_eq!(total, 1);
    assert_eq!(hits[0].region, "KE");

    // Browse honours it too, and the code is case-insensitive.
    assert_eq!(
        c.search("", &SearchFilters::default().region("ke"), 20, 0)
            .unwrap()
            .0,
        1
    );
    // A region holding nothing is empty, not an error.
    assert_eq!(
        c.search("", &SearchFilters::default().region("XX"), 20, 0)
            .unwrap()
            .0,
        0
    );
}

#[test]
fn region_codes_are_normalised_on_the_way_in() {
    let mut c = Corpus::open_in_memory().unwrap();
    let j = judgment("ZACC", "[2020] ZACC 1", "A v B", &["Text."]);
    c.insert_judgment_in_region(&j, &[], "  ke  ").unwrap();
    assert_eq!(c.region(&j.id).unwrap().as_deref(), Some("KE"));

    // An empty region falls back to the default rather than storing "".
    c.insert_judgment_in_region(&j, &[], "").unwrap();
    assert_eq!(
        c.region(&j.id).unwrap().as_deref(),
        Some(molao_corpus::DEFAULT_REGION)
    );
}
