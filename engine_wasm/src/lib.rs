//! engine_wasm — Rust port of the IoM Archaeology combat engine, compiled to
//! WebAssembly.  Replaces Pyodide entirely when the `useWasmEngine` flag is set.
//!
//! Coarse C ABI — one `engine_run_simulation` call per sim, no JS↔WASM chatter
//! during the sim. State + result are packed binary buffers passed via WASM
//! linear memory; JS allocates input via `engine_alloc`, reads result via the
//! pointer returned from `engine_run_simulation`, then `engine_free`s both.
//!
//! Phase 1: scaffold only.  `engine_run_simulation` writes a stub result so the
//! end-to-end pipeline (engine_worker.js / Node harness → WASM → JS) can be
//! verified before the math port begins in Phase 2.

pub mod block;
pub mod player;
pub mod project_config;
pub mod rng;
pub mod skills;

use std::alloc::{alloc, dealloc, Layout};
use std::sync::atomic::{AtomicUsize, Ordering};

// Most-recent run_simulation result.  Single-threaded WASM, but AtomicUsize
// is the cleanest safe API and lowers to a plain load/store in WASM.
static LAST_RESULT_PTR: AtomicUsize = AtomicUsize::new(0);
static LAST_RESULT_LEN: AtomicUsize = AtomicUsize::new(0);

/// Schema version of the packed binary in/out format.  JS asserts this matches
/// before parsing so a stale `.wasm` can't silently produce wrong results.
#[no_mangle]
pub extern "C" fn engine_schema_version() -> u32 {
    1
}

/// Allocate `size` bytes in WASM linear memory.  JS writes input state bytes
/// here, then calls `engine_run_simulation`.  Returns null on size=0.
#[no_mangle]
pub extern "C" fn engine_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    let layout = Layout::array::<u8>(size).expect("alloc layout");
    // SAFETY: layout has nonzero size; alloc is the standard allocator.
    unsafe { alloc(layout) }
}

/// Free a buffer previously returned by `engine_alloc`.  No-op on null/0.
///
/// # Safety
/// Caller must pass the exact `ptr` + `size` returned by `engine_alloc`.
#[no_mangle]
pub unsafe extern "C" fn engine_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    let layout = Layout::array::<u8>(size).expect("free layout");
    dealloc(ptr, layout);
}

/// Run one simulation.  `state_ptr`/`state_len` point to a packed player state
/// (format defined in state.rs in later phases).  `seed` is the MT19937 seed.
///
/// Returns a pointer to the result buffer in WASM linear memory.  Length is
/// available via `engine_last_result_len()`.  The result remains valid until
/// the next `engine_run_simulation` call (which frees the previous result) or
/// until `engine_free` is called on the returned pointer.
///
/// # Safety
/// `state_ptr` must point to `state_len` valid bytes if `state_len > 0`.
///
/// Phase 1: stub.  Returns a 64-byte buffer with a recognizable header so the
/// JS pipeline can verify round-trip integrity without depending on the real
/// math port (which lands in Phase 6).
#[no_mangle]
pub unsafe extern "C" fn engine_run_simulation(
    _state_ptr: *const u8,
    _state_len: usize,
    seed: u32,
) -> *mut u8 {
    // Free the previous result first (single-buffer ownership; simplest model
    // for our one-sim-at-a-time worker).
    let prev_ptr = LAST_RESULT_PTR.swap(0, Ordering::SeqCst);
    let prev_len = LAST_RESULT_LEN.swap(0, Ordering::SeqCst);
    if prev_ptr != 0 && prev_len != 0 {
        let layout = Layout::array::<u8>(prev_len).expect("free layout");
        dealloc(prev_ptr as *mut u8, layout);
    }

    // Stub result.  64 bytes: schema_version (u8) + pad (3) + highest_floor
    // (i32, XORed with seed so different seeds produce different stub values
    // — useful for round-trip sanity checking) + total_time (f64, = 42.0) +
    // padding to 64 bytes.
    const STUB_LEN: usize = 64;
    let layout = Layout::array::<u8>(STUB_LEN).expect("result layout");
    let ptr = alloc(layout);
    if ptr.is_null() {
        return std::ptr::null_mut();
    }
    let slice = std::slice::from_raw_parts_mut(ptr, STUB_LEN);
    for b in slice.iter_mut() {
        *b = 0;
    }
    slice[0] = 1; // schema_version
    let stub_floor: i32 = 42i32 ^ (seed as i32);
    slice[4..8].copy_from_slice(&stub_floor.to_le_bytes());
    slice[8..16].copy_from_slice(&42.0f64.to_le_bytes());

    LAST_RESULT_PTR.store(ptr as usize, Ordering::SeqCst);
    LAST_RESULT_LEN.store(STUB_LEN, Ordering::SeqCst);
    ptr
}

/// Length in bytes of the most recent `engine_run_simulation` result.
#[no_mangle]
pub extern "C" fn engine_last_result_len() -> usize {
    LAST_RESULT_LEN.load(Ordering::SeqCst)
}
