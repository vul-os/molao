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
fn every_documented_command_has_working_help() {
    // "Documented commands must execute" starts with --help not erroring.
    for args in [
        vec!["--help"],
        vec!["serve", "--help"],
        vec!["ingest", "--help"],
        vec!["demo", "--help"],
        vec!["verify", "--help"],
        vec!["stats", "--help"],
    ] {
        let out = Command::new(MOLAO)
            .args(&args)
            .output()
            .unwrap_or_else(|e| panic!("running molao {args:?}: {e}"));
        assert!(out.status.success(), "molao {args:?} failed");
        assert!(!out.stdout.is_empty(), "molao {args:?} printed no help");
    }
}
