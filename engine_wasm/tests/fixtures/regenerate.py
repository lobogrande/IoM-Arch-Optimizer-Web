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

print("done.")
