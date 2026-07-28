//! Tests that run the real `molao` binary.
//!
//! The build spec says every documented command must actually execute from a
//! clean clone. Unit tests on `clap` structs prove the arguments parse; only
//! running the binary proves the command *works* and exits with the right code.
//! `molao verify` in particular is worth this: a verifier that printed FAILED
//! and exited zero would be useless in a script, and no in-process test catches
//! that.

use ed25519_dalek::{Signer, SigningKey};
use molao_core::release::ManifestSignature;
use molao_core::{Manifest, SignedRelease, Signer as SetSigner, SignerSet};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Path to the binary cargo just built for this test.
const MOLAO: &str = env!("CARGO_BIN_EXE_molao");

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("molao-cli-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn manifest() -> Manifest {
    Manifest {
        release: 3,
        previous: None,
        created_at: "2026-07-20T10:00:00Z".into(),
        corpus_root: "aa".repeat(32),
        doc_count: 15,
        graph_root: "bb".repeat(32),
        extractor_version: molao_cite::EXTRACTOR_VERSION.to_string(),
    }
}

/// Write a release signed by `signing` members of a 3-member, threshold-2 set.
fn write_release(dir: &Path, signing: usize) -> (PathBuf, PathBuf) {
    let keys: Vec<SigningKey> = (1..=3u8)
        .map(|s| SigningKey::from_bytes(&[s; 32]))
        .collect();
    let set = SignerSet {
        threshold: 2,
        epoch: 1,
        signers: keys
            .iter()
            .enumerate()
            .map(|(i, k)| SetSigner {
                name: format!("institution-{i}"),
                key: hex::encode(k.verifying_key().to_bytes()),
            })
            .collect(),
    };
    let m = manifest();
    let release = SignedRelease {
        signatures: keys[..signing]
            .iter()
            .map(|k| ManifestSignature {
                key: hex::encode(k.verifying_key().to_bytes()),
                signature: hex::encode(k.sign(&m.signing_bytes()).to_bytes()),
            })
            .collect(),
        manifest: m,
    };

    let rp = dir.join("release.json");
    let sp = dir.join("signers.json");
    std::fs::write(&rp, serde_json::to_string_pretty(&release).unwrap()).unwrap();
    std::fs::write(&sp, serde_json::to_string_pretty(&set).unwrap()).unwrap();
    (rp, sp)
}

#[test]
fn verify_exits_zero_on_a_quorum() {
    let dir = workdir("verify-ok");
    let (release, signers) = write_release(&dir, 2);

    let out = Command::new(MOLAO)
        .args(["verify"])
        .arg(&release)
        .arg("--signers")
        .arg(&signers)
        .output()
        .expect("running molao verify");

    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "exit {:?}: {stdout}",
        out.status.code()
    );
    assert!(stdout.contains("OK"), "{stdout}");
    // The honest-status line must not be quietly dropped: a verifier that reads
    // as blessing the law is the failure mode that matters here.
    assert!(
        stdout.contains("not that the law is correctly stated"),
        "the caveat is missing: {stdout}"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn verify_exits_non_zero_when_the_threshold_is_not_met() {
    let dir = workdir("verify-short");
    let (release, signers) = write_release(&dir, 1);

    let out = Command::new(MOLAO)
        .args(["verify"])
        .arg(&release)
        .arg("--signers")
        .arg(&signers)
        .output()
        .expect("running molao verify");

    assert!(!out.status.success(), "a short release exited zero");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("FAILED"), "{stderr}");

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn verify_exits_non_zero_on_a_tampered_manifest() {
    let dir = workdir("verify-tampered");
    let (release, signers) = write_release(&dir, 3);

    // Swap in a different corpus root, leaving the signatures in place.
    let text = std::fs::read_to_string(&release).unwrap();
    let tampered = text.replace(&"aa".repeat(32), &"cc".repeat(32));
    assert_ne!(text, tampered, "the test fixture did not change");
    std::fs::write(&release, tampered).unwrap();

    let out = Command::new(MOLAO)
        .args(["verify"])
        .arg(&release)
        .arg("--signers")
        .arg(&signers)
        .output()
        .expect("running molao verify");

    assert!(!out.status.success(), "a tampered release exited zero");

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn verify_exits_non_zero_on_a_missing_file() {
    let out = Command::new(MOLAO)
        .args([
            "verify",
            "/nonexistent/release.json",
            "--signers",
            "/nonexistent/signers.json",
        ])
        .output()
        .expect("running molao verify");
    assert!(!out.status.success());
}

#[test]
fn demo_seeds_a_corpus_and_stats_reports_it() {
    // The two commands a first-time user runs, executed for real.
    let dir = workdir("demo");
    let db = dir.join("demo.db");

    let out = Command::new(MOLAO)
        .args(["demo", "--no-serve", "--db"])
        .arg(&db)
        .output()
        .expect("running molao demo");
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("fictional"), "{stdout}");
    assert!(db.exists(), "the demo did not write a database");

    let out = Command::new(MOLAO)
        .args(["stats", "--db"])
        .arg(&db)
        .output()
        .expect("running molao stats");
    assert!(out.status.success());
    let stats = String::from_utf8_lossy(&out.stdout);
    for expected in [
        "judgments",
        "citation edges",
        "corpus root",
        "corroborated",
        "single source",
        "manually entered",
        "regions",
    ] {
        assert!(
            stats.contains(expected),
            "stats missing {expected:?}: {stats}"
        );
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn ingest_of_akoma_ntoso_lands_in_the_right_region() {
    // The licensed-bulk path: an Akoma Ntoso judgment from a non-ZA
    // jurisdiction must land under that jurisdiction's region, derived from the
    // court code's country prefix (UGSC -> UG), and as Manual provenance
    // because a file import is not a witnessed fetch.
    let dir = workdir("akn");
    let db = dir.join("akn.db");
    let xml = dir.join("ugsc_2024_4.xml");
    // A minimal but structurally real Akoma Ntoso judgment. Invented content.
    std::fs::write(
        &xml,
        r##"<?xml version="1.0" encoding="UTF-8"?>
<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"
            xmlns:akn="https://laws.africa/akn">
  <judgment name="judgment" contains="originalVersion">
    <meta>
      <identification source="#laws-africa">
        <FRBRWork>
          <FRBRthis value="/akn/ug/judgment/ugsc/2024/4/main"/>
          <FRBRuri value="/akn/ug/judgment/ugsc/2024/4"/>
          <FRBRalias value="Okello v Attorney General" name="title"/>
          <FRBRdate date="2024-05-10" name="Judgment"/>
          <FRBRauthor href="#ugsc"/>
          <FRBRcountry value="ug"/>
        </FRBRWork>
      </identification>
      <references source="#this">
        <TLCOrganization eId="ugsc" href="/ontology/organization/ug/ugsc" showAs="Supreme Court of Uganda"/>
      </references>
      <proprietary source="#laws-africa">
        <akn:neutralCitation>[2024] UGSC 4</akn:neutralCitation>
      </proprietary>
    </meta>
    <judgmentBody>
      <decision>
        <p eId="dec__p_1"><num>1</num> This appeal turns on a single question of statutory interpretation.</p>
      </decision>
    </judgmentBody>
  </judgment>
</akomaNtoso>
"##,
    )
    .expect("write akn fixture");

    let out = Command::new(MOLAO)
        .args(["ingest"])
        .arg(&xml)
        .arg("--db")
        .arg(&db)
        .output()
        .expect("running molao ingest");
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("Akoma Ntoso"), "{stdout}");

    let out = Command::new(MOLAO)
        .args(["stats", "--db"])
        .arg(&db)
        .output()
        .expect("running molao stats");
    let stats = String::from_utf8_lossy(&out.stdout);
    // Landed under UG, not the ZA default, and Manual because unwitnessed.
    assert!(stats.contains("UG"), "expected UG region: {stats}");
    assert!(
        stats.contains("manually entered"),
        "expected manual provenance: {stats}"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn ingest_reports_bad_records_and_exits_non_zero() {
    let dir = workdir("ingest");
    let input = dir.join("in");
    std::fs::create_dir_all(&input).unwrap();
    std::fs::write(
        input.join("good.jsonl"),
        r#"{"court":"ZACC","title":"Ndlovu v Minister","neutral_citation":"[2026] ZACC 1","text":"[1] The application succeeds."}"#,
    )
    .unwrap();
    std::fs::write(input.join("bad.jsonl"), "{ this is not json }\n").unwrap();

    let out = Command::new(MOLAO)
        .args(["ingest"])
        .arg(&input)
        .arg("--db")
        .arg(dir.join("c.db"))
        .output()
        .expect("running molao ingest");

    // The good record still lands; the bad one is reported; the exit code says
    // something went wrong.
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stdout.contains("ingested 1 judgment"), "{stdout}");
    assert!(stderr.contains("bad.jsonl:1"), "{stderr}");
    assert!(!out.status.success(), "a failed record exited zero");

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn index_builds_a_cache_and_info_reports_it() {
    // Build a corpus, build a fake index over it, and read it back — the two
    // commands a node operator runs to get local search working with no model.
    let dir = workdir("index");
    let db = dir.join("c.db");

    let demo = Command::new(MOLAO)
        .args(["demo", "--no-serve", "--db"])
        .arg(&db)
        .output()
        .expect("running molao demo");
    assert!(
        demo.status.success(),
        "{}",
        String::from_utf8_lossy(&demo.stderr)
    );

    let build = Command::new(MOLAO)
        .args(["index", "build", "--db"])
        .arg(&db)
        .output()
        .expect("running molao index build");
    assert!(
        build.status.success(),
        "{}",
        String::from_utf8_lossy(&build.stderr)
    );
    let out = String::from_utf8_lossy(&build.stdout);
    assert!(out.contains("built index"), "{out}");
    assert!(out.contains("fake-hash"), "{out}");
    assert!(
        out.contains("UNSIGNED"),
        "the honesty line about an unsigned cache is missing: {out}"
    );
    // The sidecar file must actually exist next to the corpus.
    assert!(
        db.with_file_name("c.db.index").exists(),
        "no sidecar index file was written"
    );

    let info = Command::new(MOLAO)
        .args(["index", "info", "--db"])
        .arg(&db)
        .output()
        .expect("running molao index info");
    assert!(info.status.success());
    let info = String::from_utf8_lossy(&info.stdout);
    assert!(info.contains("descriptor"), "{info}");
    // Built from the corpus it is being checked against, so it is current.
    assert!(
        info.contains("current"),
        "a fresh index should read as current: {info}"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn index_build_with_http_requires_an_endpoint() {
    // The HTTP embedder is optional and needs an operator-supplied model; asking
    // for it without an endpoint must fail clearly, not silently.
    let dir = workdir("index-http");
    let db = dir.join("c.db");
    let demo = Command::new(MOLAO)
        .args(["demo", "--no-serve", "--db"])
        .arg(&db)
        .output()
        .expect("running molao demo");
    assert!(demo.status.success());

    let out = Command::new(MOLAO)
        .args(["index", "build", "--embedder", "http", "--db"])
        .arg(&db)
        .output()
        .expect("running molao index build --embedder http");
    assert!(
        !out.status.success(),
        "http build without an endpoint must fail"
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("endpoint"), "{stderr}");

    std::fs::remove_dir_all(&dir).unwrap();
}

/// Every top-level subcommand the binary offers.
///
/// Hand-written, and a hand-written list is the thing that silently stops
/// covering the eleventh command — so it is not the only guard:
/// `every_subcommand_has_help` in `src/main.rs` asserts the same list against
/// clap's own metadata and fails, naming this constant, the moment a command is
/// added or renamed.
const TOP_LEVEL_COMMANDS: &[&str] = &[
    "serve", "ingest", "demo", "verify", "stats", "index", "fetch", "crawl", "sources", "regions",
];

#[test]
fn every_documented_command_has_working_help() {
    // "Documented commands must execute" starts with --help not erroring.
    let mut args: Vec<Vec<&str>> = vec![vec!["--help"]];
    args.extend(TOP_LEVEL_COMMANDS.iter().map(|c| vec![*c, "--help"]));
    args.push(vec!["index", "build", "--help"]);
    args.push(vec!["index", "info", "--help"]);

    // Covering nothing must not read as passing.
    assert_eq!(
        args.len(),
        TOP_LEVEL_COMMANDS.len() + 3,
        "the help matrix lost entries"
    );

    for args in &args {
        let out = Command::new(MOLAO)
            .args(args)
            .output()
            .unwrap_or_else(|e| panic!("running molao {args:?}: {e}"));
        assert!(out.status.success(), "molao {args:?} failed");
        assert!(!out.stdout.is_empty(), "molao {args:?} printed no help");
        // `--profiles` is global: every command must accept it, or the flag is
        // documented as global and is not.
        assert!(
            String::from_utf8_lossy(&out.stdout).contains("--profiles"),
            "molao {args:?} does not offer the global --profiles flag"
        );
    }
}

/// The claim under test: **region profiles are data a node loads, and the
/// compiled-in profiles are the fallback.** Nothing short of running the binary
/// proves it — an in-process test could not tell a loaded registry from the
/// constant it happens to equal.
///
/// Two observable consequences, both through the real CLI:
///
/// 1. A law-report series that exists only in a loaded profile changes what the
///    citation extractor finds on the **default** ingest path. This is the one
///    that matters: a `--profiles` directory that did not reach `molao ingest`
///    would be decoration.
/// 2. A jurisdiction that exists only in a loaded profile files judgments under
///    its own region instead of falling back to the corpus default.
#[test]
fn loaded_region_profiles_change_what_a_node_extracts_and_where_it_files() {
    let dir = workdir("profiles");
    let profiles = dir.join("profiles");
    std::fs::create_dir_all(&profiles).unwrap();

    // A ZA registry with one court and one law-report series that the built-in
    // ZA profile does not carry.
    std::fs::write(
        profiles.join("za.toml"),
        "code = \"ZA\"\nname = \"South Africa (operator registry)\"\n\n\
         [[courts]]\ncode = \"ZACC\"\n\
         name = \"Constitutional Court of South Africa\"\ntier = \"apex\"\n\n\
         [[series]]\nabbr = \"XYZ\"\nname = \"Invented Reports\"\n",
    )
    .unwrap();
    // And a jurisdiction that is not compiled in at all.
    std::fs::write(
        profiles.join("xx.toml"),
        "code = \"XX\"\nname = \"Nowhere\"\n\n\
         [[courts]]\ncode = \"XXSC\"\nname = \"Supreme Court of Nowhere\"\ntier = \"apex\"\n",
    )
    .unwrap();

    // One judgment citing a report series only the loaded profile knows.
    let input = dir.join("in.jsonl");
    std::fs::write(
        &input,
        r#"{"court":"ZACC","title":"Ndlovu v Minister","neutral_citation":"[2026] ZACC 1","text":"[1] See the discussion reported in 2020 (3) XYZ 45."}"#,
    )
    .unwrap();

    let unresolved = |db: &Path, with_profiles: bool| -> String {
        for stage in ["ingest", "stats"] {
            let mut cmd = Command::new(MOLAO);
            if with_profiles {
                cmd.arg("--profiles").arg(&profiles);
            }
            cmd.arg(stage);
            if stage == "ingest" {
                cmd.arg(&input);
            }
            let out = cmd
                .arg("--db")
                .arg(db)
                .output()
                .unwrap_or_else(|e| panic!("running molao {stage}: {e}"));
            assert!(
                out.status.success(),
                "molao {stage} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            if stage == "stats" {
                return String::from_utf8_lossy(&out.stdout).into_owned();
            }
        }
        unreachable!()
    };

    // Built-in ZA has no XYZ series, so the reported citation is not a citation.
    let plain = unresolved(&dir.join("plain.db"), false);
    assert!(
        plain.contains("unresolved cites   0"),
        "the built-in profile must not find a series it does not enumerate:\n{plain}"
    );

    // The loaded profile enumerates it, so the same bytes yield a citation.
    let loaded = unresolved(&dir.join("loaded.db"), true);
    assert!(
        loaded.contains("unresolved cites   1"),
        "a loaded profile must reach the default ingest path:\n{loaded}"
    );

    // A jurisdiction that exists only on disk files under its own region.
    let akn = dir.join("xxsc.xml");
    std::fs::write(
        &akn,
        r##"<?xml version="1.0" encoding="UTF-8"?>
<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"
            xmlns:akn="https://laws.africa/akn">
  <judgment name="judgment" contains="originalVersion">
    <meta>
      <identification source="#laws-africa">
        <FRBRWork>
          <FRBRthis value="/akn/xx/judgment/xxsc/2024/1/main"/>
          <FRBRuri value="/akn/xx/judgment/xxsc/2024/1"/>
          <FRBRalias value="Someone v Another" name="title"/>
          <FRBRdate date="2024-05-10" name="Judgment"/>
          <FRBRauthor href="#xxsc"/>
          <FRBRcountry value="xx"/>
        </FRBRWork>
      </identification>
      <references source="#this">
        <TLCOrganization eId="xxsc" href="/ontology/organization/xx/xxsc" showAs="Supreme Court of Nowhere"/>
      </references>
      <proprietary source="#laws-africa">
        <akn:neutralCitation>[2024] XXSC 1</akn:neutralCitation>
      </proprietary>
    </meta>
    <judgmentBody>
      <decision>
        <p eId="dec__p_1"><num>1</num> The appeal is dismissed.</p>
      </decision>
    </judgmentBody>
  </judgment>
</akomaNtoso>
"##,
    )
    .unwrap();

    for (db, args, expected) in [
        ("fallback.db", vec![], "ZA"),
        ("profiled.db", vec!["--profiles"], "XX"),
    ] {
        let db = dir.join(db);
        let mut cmd = Command::new(MOLAO);
        for a in &args {
            cmd.arg(a).arg(&profiles);
        }
        let out = cmd
            .arg("ingest")
            .arg(&akn)
            .arg("--db")
            .arg(&db)
            .output()
            .expect("running molao ingest");
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );

        let mut cmd = Command::new(MOLAO);
        for a in &args {
            cmd.arg(a).arg(&profiles);
        }
        let stats = cmd
            .arg("stats")
            .arg("--db")
            .arg(&db)
            .output()
            .expect("running molao stats");
        let stats = String::from_utf8_lossy(&stats.stdout);
        assert!(
            stats.contains(&format!("  {expected:<16} 1")),
            "expected the judgment filed under {expected}:\n{stats}"
        );
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

/// `molao regions` is how an operator checks what their node actually resolves.
/// It has to distinguish loaded from compiled-in, or it answers the wrong
/// question.
#[test]
fn regions_reports_loaded_profiles_apart_from_compiled_in_ones() {
    let dir = workdir("regions");
    let profiles = dir.join("profiles");
    std::fs::create_dir_all(&profiles).unwrap();
    std::fs::write(
        profiles.join("ke.toml"),
        "code = \"KE\"\nname = \"Kenya (operator registry)\"\n\n\
         [[courts]]\ncode = \"KESC\"\nname = \"Supreme Court of Kenya\"\ntier = \"apex\"\n",
    )
    .unwrap();

    let plain = Command::new(MOLAO)
        .arg("regions")
        .output()
        .expect("running molao regions");
    assert!(plain.status.success());
    let plain = String::from_utf8_lossy(&plain.stdout);
    assert!(plain.contains("built-in"), "{plain}");
    assert!(
        !plain
            .lines()
            .any(|l| l.split_whitespace().nth(1) == Some("loaded")),
        "nothing was loaded, so no row may claim it was:\n{plain}"
    );
    assert!(
        plain.contains("every profile above is compiled in"),
        "{plain}"
    );

    let out = Command::new(MOLAO)
        .arg("--profiles")
        .arg(&profiles)
        .arg("regions")
        .output()
        .expect("running molao --profiles regions");
    assert!(out.status.success());
    let out = String::from_utf8_lossy(&out.stdout);
    assert!(out.contains("ke.toml"), "the file must be named: {out}");
    assert!(out.contains("loaded"), "{out}");
    // The shadowed built-in KE must not also be listed as if the node used it.
    assert_eq!(
        out.lines()
            .filter(|l| l.trim_start().starts_with("KE "))
            .count(),
        1,
        "KE must appear once, as the loaded profile:\n{out}"
    );
    // Untouched jurisdictions still resolve, from the constants.
    assert!(out.contains("ZA"), "{out}");
    assert!(
        out.contains("compiled-in profile(s) remain as the fallback"),
        "{out}"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

/// Loading is fail-closed. A node that quietly ran the compiled-in registry
/// while its operator believed it was running theirs is the failure this whole
/// mechanism has to not have.
#[test]
fn a_bad_profiles_directory_stops_the_node_rather_than_falling_back() {
    let dir = workdir("profiles-bad");

    // A path that is not there.
    let out = Command::new(MOLAO)
        .arg("--profiles")
        .arg(dir.join("nope"))
        .arg("regions")
        .output()
        .expect("running molao --profiles");
    assert!(!out.status.success(), "a missing directory must fail");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("region profiles"), "{stderr}");

    // A directory with no profiles in it: a typo, not a request for defaults.
    let empty = dir.join("empty");
    std::fs::create_dir_all(&empty).unwrap();
    let out = Command::new(MOLAO)
        .arg("--profiles")
        .arg(&empty)
        .arg("regions")
        .output()
        .expect("running molao --profiles");
    assert!(!out.status.success(), "an empty directory must fail");
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("no *.toml"),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    // A malformed profile, named in the error.
    let broken = dir.join("broken");
    std::fs::create_dir_all(&broken).unwrap();
    std::fs::write(broken.join("oops.toml"), "code = \"OO\"\n# no name\n").unwrap();
    let out = Command::new(MOLAO)
        .arg("--profiles")
        .arg(&broken)
        .arg("regions")
        .output()
        .expect("running molao --profiles");
    assert!(!out.status.success(), "a malformed profile must fail");
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("oops.toml"),
        "the error must name the file: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    std::fs::remove_dir_all(&dir).unwrap();
}
