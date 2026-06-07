//! Mersenne Twister 19937, bit-identical to CPython's `random` module.
//!
//! Ports CPython 3.11's `Modules/_randommodule.c`:
//! - `init_genrand` / `init_by_array`: state initialization (Matsumoto-Nishimura)
//! - `genrand_uint32`: 32-bit MT output
//! - `random`: 53-bit f64 in [0, 1) — `(a*2^26 + b) / 2^53` from two MT outputs
//!
//! Validation lives in `tests/rng_parity.rs`, which loads raw-f64 byte
//! sequences emitted by Python and asserts every value matches.

pub const N: usize = 624;
const M: usize = 397;
const MATRIX_A: u32 = 0x9908_b0df;
const UPPER_MASK: u32 = 0x8000_0000;
const LOWER_MASK: u32 = 0x7fff_ffff;

pub struct Mt19937 {
    state: [u32; N],
    index: usize,
}

impl Mt19937 {
    /// Seed with a single 32-bit positive integer, matching
    /// `random.seed(int_value)` in CPython for any non-negative `int < 2^32`.
    /// CPython's seed path computes `key_length = max(1, (bits + 31) / 32)`;
    /// for any u32 (including 0) that's `key_length = 1, key = [seed]`.
    pub fn new(seed: u32) -> Self {
        let mut rng = Mt19937 { state: [0u32; N], index: N };
        rng.init_by_array(&[seed]);
        rng
    }

    /// CPython's `init_genrand`. Seeds the state array from a single u32.
    fn init_genrand(&mut self, s: u32) {
        self.state[0] = s;
        for i in 1..N {
            // mt[i] = 1812433253 * (mt[i-1] ^ (mt[i-1] >> 30)) + i
            let prev = self.state[i - 1];
            self.state[i] = 1_812_433_253u32
                .wrapping_mul(prev ^ (prev >> 30))
                .wrapping_add(i as u32);
        }
        self.index = N;
    }

    /// CPython's `init_by_array`. Two passes over the state mix in the key
    /// material; the trailing `mt[0] = 0x80000000` is the Matsumoto-Nishimura
    /// "non-zero initial state" guard.
    fn init_by_array(&mut self, key: &[u32]) {
        self.init_genrand(19_650_218);
        let key_length = key.len();
        let mut i: usize = 1;
        let mut j: usize = 0;
        let mut k: usize = if N > key_length { N } else { key_length };
        while k > 0 {
            let prev = self.state[i - 1];
            self.state[i] = (self.state[i] ^ (prev ^ (prev >> 30)).wrapping_mul(1_664_525))
                .wrapping_add(key[j])
                .wrapping_add(j as u32);
            i += 1;
            j += 1;
            if i >= N {
                self.state[0] = self.state[N - 1];
                i = 1;
            }
            if j >= key_length {
                j = 0;
            }
            k -= 1;
        }
        let mut k: usize = N - 1;
        while k > 0 {
            let prev = self.state[i - 1];
            self.state[i] = (self.state[i] ^ (prev ^ (prev >> 30)).wrapping_mul(1_566_083_941))
                .wrapping_sub(i as u32);
            i += 1;
            if i >= N {
                self.state[0] = self.state[N - 1];
                i = 1;
            }
            k -= 1;
        }
        self.state[0] = 0x8000_0000;
        self.index = N; // forces a regenerate on first genrand_u32() call
    }

    /// One 32-bit MT output. Internally re-fills the 624-word state buffer
    /// every N draws via the standard twisting recurrence.
    pub fn genrand_u32(&mut self) -> u32 {
        if self.index >= N {
            let mag01 = [0u32, MATRIX_A];
            for kk in 0..(N - M) {
                let y = (self.state[kk] & UPPER_MASK) | (self.state[kk + 1] & LOWER_MASK);
                self.state[kk] = self.state[kk + M] ^ (y >> 1) ^ mag01[(y & 1) as usize];
            }
            for kk in (N - M)..(N - 1) {
                let y = (self.state[kk] & UPPER_MASK) | (self.state[kk + 1] & LOWER_MASK);
                self.state[kk] =
                    self.state[kk + M - N] ^ (y >> 1) ^ mag01[(y & 1) as usize];
            }
            let y = (self.state[N - 1] & UPPER_MASK) | (self.state[0] & LOWER_MASK);
            self.state[N - 1] = self.state[M - 1] ^ (y >> 1) ^ mag01[(y & 1) as usize];
            self.index = 0;
        }
        let mut y = self.state[self.index];
        self.index += 1;
        // Tempering — the four magic xor-shifts at the heart of MT19937.
        y ^= y >> 11;
        y ^= (y << 7) & 0x9d2c_5680;
        y ^= (y << 15) & 0xefc6_0000;
        y ^= y >> 18;
        y
    }

    /// CPython's `random.random()`: 53-bit IEEE-754 double in [0.0, 1.0).
    /// Composed from two `genrand_u32` outputs — a 27-bit high half and a
    /// 26-bit low half, combined into a 53-bit mantissa.
    pub fn random(&mut self) -> f64 {
        let a = self.genrand_u32() >> 5; // 27 bits
        let b = self.genrand_u32() >> 6; // 26 bits
        (a as f64 * 67_108_864.0 + b as f64) * (1.0 / 9_007_199_254_740_992.0)
    }
}
