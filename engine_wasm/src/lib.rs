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
pub mod combat_loop;
pub mod floor_map;
pub mod player;
pub mod project_config;
pub mod rng;
pub mod skills;
pub mod state;

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
/// in the format defined by `state::serialize_player` / consumed by
/// `state::deserialize_player`.  `seed` is the MT19937 seed.
///
/// Returns a pointer to the result buffer in WASM linear memory (format per
/// `state::serialize_result`).  Length is available via
/// `engine_last_result_len()`.  The result remains valid until the next
/// `engine_run_simulation` call (which frees the previous result) or until
/// `engine_free` is called on the returned pointer.
///
/// Returns null on schema mismatch or input too short.
///
/// # Safety
/// `state_ptr` must point to `state_len` valid bytes if `state_len > 0`.
#[no_mangle]
pub unsafe extern "C" fn engine_run_simulation(
    state_ptr: *const u8,
    state_len: usize,
    seed: u32,
) -> *mut u8 {
    // Free the previous result first.
    let prev_ptr = LAST_RESULT_PTR.swap(0, Ordering::SeqCst);
    let prev_len = LAST_RESULT_LEN.swap(0, Ordering::SeqCst);
    if prev_ptr != 0 && prev_len != 0 {
        let layout = Layout::array::<u8>(prev_len).expect("free layout");
        dealloc(prev_ptr as *mut u8, layout);
    }

    if state_ptr.is_null() || state_len == 0 {
        return std::ptr::null_mut();
    }
    let input = std::slice::from_raw_parts(state_ptr, state_len);
    let player = match crate::state::deserialize_player(input) {
        Ok(p) => p,
        Err(_) => return std::ptr::null_mut(),
    };

    // Run the full simulation.
    let mut sim = crate::combat_loop::CombatSimulator::new(player);
    let mut rng = crate::rng::Mt19937::new(seed);
    let result = sim.run_simulation(&mut rng);

    // Serialize and hand back ownership of a fresh heap allocation.
    let bytes = crate::state::serialize_result(&result);
    let len = bytes.len();
    let layout = Layout::array::<u8>(len).expect("result layout");
    let ptr = alloc(layout);
    if ptr.is_null() {
        return std::ptr::null_mut();
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);

    LAST_RESULT_PTR.store(ptr as usize, Ordering::SeqCst);
    LAST_RESULT_LEN.store(len, Ordering::SeqCst);
    ptr
}

/// Length in bytes of the most recent `engine_run_simulation` result.
#[no_mangle]
pub extern "C" fn engine_last_result_len() -> usize {
    LAST_RESULT_LEN.load(Ordering::SeqCst)
}
