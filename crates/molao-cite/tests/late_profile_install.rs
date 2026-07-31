//! What `extraction_profile()` reports when the extractor and the resolver
//! disagree.
//!
//! `molao_cite::extract` binds its profile on **first use** and caches the
//! compiled patterns. `molao_core::region::install` can be called after that —
//! nothing prevents it, and `molao` itself only avoids it by installing
//! `--profiles` before it touches a corpus. In a process where that ordering
//! slips, `region::default_profile()` answers with the newly installed profile
//! while every citation the process extracts is still being parsed against the
//! old one.
//!
//! A release manifest records the profile its graph was extracted under. If it
//! recorded the resolver's answer, it would name a registry that produced none
//! of the edges in the release, and `molao verify` step 7 would confirm a graph
//! against a profile that never ran — a check that reports the wrong thing
//! while looking healthy. So the manifest records
//! [`molao_cite::extraction_profile`], which is the extractor's own profile.
//!
//! **One test, its own file, on purpose.** Both the extractor's binding and the
//! installed profile set are process-global and settable once; a second test in
//! this binary would inherit whichever one ran first. Integration test files are
//! separate binaries, so this one gets a process to itself.

use molao_core::region;

/// A profile that will be installed under the default region code, with a court
/// registry deliberately unlike the built-in one so the two cannot fingerprint
/// alike by accident.
const SHADOWING_ZA: &str = "code = \"ZA\"\nname = \"South Africa (operator registry)\"\n\n\
     [[courts]]\ncode = \"ZAZZ\"\nname = \"A court the built-in profile has never heard of\"\n\
     tier = \"apex\"\n\n\
     [[series]]\nabbr = \"ZZR\"\nname = \"Zed Reports\"\n";

#[test]
fn the_recorded_profile_is_the_one_the_extractor_bound_not_the_one_resolved_later() {
    // 1. Extract first. This is what binds the cached extractor.
    let found = molao_cite::extract("S v Makwanyane [1995] ZACC 3 at para 87");
    assert_eq!(found.len(), 1, "the fixture must extract something");
    let bound_before = molao_cite::extraction_profile_fingerprint();
    assert_eq!(bound_before, region::default_profile().fingerprint());

    // 2. Install a different registry under the default code, too late.
    let dir = std::env::temp_dir().join(format!("molao-late-install-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    std::fs::write(dir.join("za.toml"), SHADOWING_ZA).expect("writing the profile");
    let set = region::ProfileSet::load_dir(&dir).expect("the profile set loads");
    assert_eq!(set.len(), 1);
    region::install(set).expect("nothing has installed in this process yet");

    // 3. The resolver has moved. The extractor has not.
    let resolved = region::default_profile().fingerprint();
    assert_ne!(
        resolved, bound_before,
        "the installed profile must actually differ, or this test proves nothing"
    );
    assert_eq!(
        molao_cite::extraction_profile_fingerprint(),
        bound_before,
        "extraction_profile must report the profile the extractor bound; reporting the \
         resolver's answer would put a registry in the manifest that produced none of the \
         graph's edges"
    );
    assert_ne!(molao_cite::extraction_profile_fingerprint(), resolved);

    // And the extractor really is still using the old registry: ZACC is a known
    // code under the built-in profile and unknown under the installed one, so a
    // rebound extractor would flag this citation differently.
    assert_eq!(
        molao_cite::extract("S v Makwanyane [1995] ZACC 3 at para 87"),
        found,
        "the cached extractor must not have moved either"
    );
    assert!(!region::default_profile().is_known_code("ZACC"));
    assert!(molao_cite::extraction_profile().is_known_code("ZACC"));

    let _ = std::fs::remove_dir_all(&dir);
}
