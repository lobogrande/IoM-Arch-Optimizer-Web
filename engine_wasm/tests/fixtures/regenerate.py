#!/usr/bin/env python3
# Regenerates the RNG golden fixtures consumed by tests/rng_parity.rs.
# These are raw little-endian f64 byte streams of CPython random.random()
# output for various seeds. Re-run only if the test format changes; the
# CPython MT19937 itself is stable across Python versions.
#
# Usage: python3 engine_wasm/tests/fixtures/regenerate.py

import os
import random
import struct

HERE = os.path.dirname(os.path.abspath(__file__))

# (seed, count) tuples — each one becomes a {seed}.bin file with `count`
# little-endian f64 values written sequentially.
SEEDS = [
    (0, 100),
    (42, 1000),
    (1000, 1000),
    (1499, 100),         # last seed in our baseline range
    (2**31 - 1, 100),    # max signed 32-bit
]

for seed, count in SEEDS:
    random.seed(seed)
    values = [random.random() for _ in range(count)]
    path = os.path.join(HERE, f"mt_seed{seed}.bin")
    with open(path, 'wb') as f:
        for v in values:
            f.write(struct.pack('<d', v))
    print(f"  {path}: {count} f64 values ({count * 8} bytes)")

# randint(1, N) parity — a single sequence that hits each spawn-table
# 1-in-X chance value at least once, intermixed.  Captures the rejection-loop
# behavior of CPython's _randbelow (different bit_lengths consume different
# numbers of genrand_uint32 calls per result).
RANDINT_CHANCES = [3, 6, 7, 8, 9, 10, 14, 15, 18, 20, 21, 30, 40, 45, 50, 1]
RANDINT_SEED = 42
RANDINT_COUNT = 500  # cycles through CHANCES list
random.seed(RANDINT_SEED)
randint_results = []
for i in range(RANDINT_COUNT):
    chance = RANDINT_CHANCES[i % len(RANDINT_CHANCES)]
    randint_results.append(random.randint(1, chance))
ri_path = os.path.join(HERE, "randint_seed42.bin")
with open(ri_path, 'wb') as f:
    # 4-byte chance, 4-byte result, repeating
    for i, r in enumerate(randint_results):
        chance = RANDINT_CHANCES[i % len(RANDINT_CHANCES)]
        f.write(struct.pack('<II', chance, r))
print(f"  {ri_path}: {RANDINT_COUNT} (chance, result) pairs")

print("done.")
