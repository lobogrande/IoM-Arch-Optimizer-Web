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

/// `random.randint(1, chance)` parity — validates the `_randbelow` /
/// `getrandbits` rejection loop matches CPython byte-for-byte.  Fixture
/// runs through a mix of chance values that span the bit_length boundaries
/// (3 needs 2 bits, 7 needs 3, 15 needs 4, 50 needs 6, etc.); any divergence
/// in the retry path would surface here as a single mismatched result.
#[test]
fn mt_randint_seed_42() {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests"); p.push("fixtures"); p.push("randint_seed42.bin");
    let bytes = std::fs::read(&p)
        .unwrap_or_else(|e| panic!("missing randint fixture: {e} — run regenerate.py"));
    assert_eq!(bytes.len() % 8, 0, "fixture bytes not multiple of 8");

    let mut rng = Mt19937::new(42);
    for (i, chunk) in bytes.chunks_exact(8).enumerate() {
        let chance = u32::from_le_bytes(chunk[0..4].try_into().unwrap());
        let py_result = u32::from_le_bytes(chunk[4..8].try_into().unwrap());
        let rust_result = rng.randint(1, chance as i64) as u32;
        assert_eq!(
            rust_result, py_result,
            "iter {i} randint(1, {chance}): rust={rust_result} vs py={py_result}",
        );
    }
}
