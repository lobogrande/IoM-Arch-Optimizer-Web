//! Bit-identity test for the MT19937 port vs CPython's `random` module.
//!
//! Fixtures (`engine_wasm/tests/fixtures/mt_seed{N}.bin`) are raw little-endian
//! f64 byte streams from Python's `random.random()` after `random.seed(N)`.
//! For each fixture we assert that every f64 produced by `Mt19937::random()`
//! matches the Python value byte-for-byte.
//!
//! Run with: `cargo test --manifest-path engine_wasm/Cargo.toml`
//! Regenerate fixtures with: `python3 engine_wasm/tests/fixtures/regenerate.py`

use engine_wasm::rng::Mt19937;
use std::fs;
use std::path::PathBuf;

fn fixture_path(seed: u32) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests");
    p.push("fixtures");
    p.push(format!("mt_seed{seed}.bin"));
    p
}

fn load_golden(seed: u32) -> Vec<f64> {
    let bytes = fs::read(fixture_path(seed))
        .unwrap_or_else(|e| panic!("missing fixture for seed {seed}: {e} — run regenerate.py"));
    assert_eq!(
        bytes.len() % 8,
        0,
        "fixture for seed {seed} has bad length {} (not multiple of 8)",
        bytes.len()
    );
    bytes
        .chunks_exact(8)
        .map(|c| f64::from_le_bytes(c.try_into().unwrap()))
        .collect()
}

fn assert_bit_identical(seed: u32) {
    let golden = load_golden(seed);
    let mut rng = Mt19937::new(seed);
    for (i, expected) in golden.iter().enumerate() {
        let got = rng.random();
        assert_eq!(
            got.to_bits(),
            expected.to_bits(),
            "seed {seed} iter {i}: rust={got:.17e} ({:#x}) vs py={expected:.17e} ({:#x})",
            got.to_bits(),
            expected.to_bits(),
        );
    }
}

#[test]
fn mt_seed_0() {
    assert_bit_identical(0);
}

#[test]
fn mt_seed_42() {
    assert_bit_identical(42);
}

#[test]
fn mt_seed_1000() {
    assert_bit_identical(1000);
}

#[test]
fn mt_seed_1499() {
    assert_bit_identical(1499);
}

#[test]
fn mt_seed_max_i32() {
    // 2^31 - 1 = 2147483647 — covers high bit boundary in the seeding step.
    assert_bit_identical(2_147_483_647);
}
