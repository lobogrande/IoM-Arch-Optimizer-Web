// public/wasm_state_codec.js
// Shared codec for the engine_wasm extern "C" ABI.  Mirrors the binary
// format defined in engine_wasm/src/state.rs.  Loaded as a classic script
// so the worker can importScripts() it; Node also loads it via vm sandbox
// (see scripts/run_baseline_sims.mjs).
//
// Two entry points:
//   packPlayerState(engineState)             -> 484-byte Uint8Array
//   decodeResult(memory, ptr, len, startSP)  -> metrics dict (Pyodide-shaped)
//
// Off by default. Only invoked when useWasmEngine / WASM_ENGINE=1 is set.

(function (global) {
  'use strict';

  // Card drop odds (centralized from game_data.js)
  // Note: Inline copy needed since this file is loaded via importScripts()
  const CARD_DROP_ODDS = {
    tier_1_3: {
      base_card: 1500,
      poly_fragment: 7500,
      infernal_fragment: 75000
    },
    tier_4: {
      base_card: 5000,
      poly_fragment: 35000,
      infernal_fragment: 75000
    }
  };

  const SCHEMA_VERSION = 1;
  const INPUT_SIZE = 484;

  // Canonical block ordering — must match BlockId enum in project_config.rs.
  const BLOCK_IDS = [
    'dirt1','com1','rare1','epic1','leg1','myth1','div1',
    'dirt2','com2','rare2','epic2','leg2','myth2','div2',
    'dirt3','com3','rare3','epic3','leg3','myth3','div3',
    'dirt4','com4','rare4','epic4','leg4','myth4','div4',
  ];
  const STAT_NAMES = ['Str','Agi','Per','Int','Luck','Div','Corr'];

  // ---- INPUT --------------------------------------------------------------

  /**
   * Pack the engine_state dict (toEngineState shape: snake_case fields,
   * upgrade_levels keyed by integer-or-string IDs, cards keyed by block_id
   * strings, base_stats keyed by Stat name) into the 484-byte buffer
   * engine_wasm expects.
   */
  function packPlayerState(s) {
    const buf = new ArrayBuffer(INPUT_SIZE);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    u8[0] = SCHEMA_VERSION;
    u8[1] = s.asc1_unlocked ? 1 : 0;
    u8[2] = s.asc2_unlocked ? 1 : 0;
    // u8[3] = pad (already 0)

    dv.setUint32(4,  (s.arch_level | 0), true);
    dv.setUint32(8,  (s.current_max_floor | 0), true);
    dv.setUint32(12, (s.hades_idol_level | 0), true);
    dv.setUint32(16, (s.total_infernal_cards | 0), true);
    dv.setUint32(20, (s.starting_speed_pool | 0), true);
    dv.setFloat64(24, parseFloat(s.arch_ability_infernal_bonus) || 0.0, true);

    // base_stats[7] — Str/Agi/Per/Int/Luck/Div/Corr
    const bs = s.base_stats || {};
    for (let i = 0; i < 7; i++) {
      dv.setUint32(32 + i * 4, (bs[STAT_NAMES[i]] | 0), true);
    }

    // upgrade_levels[56]
    const upgs = s.upgrade_levels || {};
    for (let i = 0; i < 56; i++) {
      const v = upgs[i] ?? upgs[String(i)] ?? 0;
      dv.setUint32(60 + i * 4, (v | 0), true);
    }

    // external_levels[22] — IDs 0..21; 0..3 unused but present in the buffer
    // Note: -1 means "not unlocked", 0 means "unlocked but not upgraded"
    const ext = s.external_levels || {};
    for (let i = 0; i < 22; i++) {
      const v = ext[i] ?? ext[String(i)] ?? 0;
      dv.setInt32(284 + i * 4, (v | 0), true);  // Use setInt32 to preserve -1
    }

    // cards[28] — indexed by BlockId
    const cards = s.cards || {};
    for (let i = 0; i < 28; i++) {
      const v = cards[BLOCK_IDS[i]] || 0;
      dv.setUint32(372 + i * 4, (v | 0), true);
    }

    return u8;
  }

  // ---- OUTPUT -------------------------------------------------------------

  /**
   * Decode the WASM result bytes (at `ptr` in `memory.buffer`, `len` bytes
   * long) into a metrics dict matching the shape Pyodide's
   * execute_simulation returns.  `startingSpeedPool` is needed to compute
   * speed_pool_delta_per_min — pass the value that was sent into the sim.
   */
  function decodeResult(memory, ptr, len, startingSpeedPool) {
    const dv = new DataView(memory.buffer, ptr, len);

    const schema = dv.getUint8(0);
    if (schema !== SCHEMA_VERSION) {
      throw new Error('wasm result schema mismatch: got ' + schema);
    }

    const highest_floor       = dv.getUint32(4,  true);
    const blocks_mined        = dv.getUint32(8,  true);
    const crosshair_spawns    = dv.getUint32(12, true);
    const flurry_casts        = dv.getUint32(16, true);
    const enrage_casts        = dv.getUint32(20, true);
    const quake_casts         = dv.getUint32(24, true);
    // const total_instacharges = dv.getUint32(28, true);  // not in metrics dict
    // hit_counts[4] at offset 32 — unused in metrics dict

    const total_time              = dv.getFloat64(48,  true);
    const total_xp                = dv.getFloat64(56,  true);
    const total_stamina_spent     = dv.getFloat64(64,  true);
    const crosshair_damage        = dv.getFloat64(72,  true);
    const melee_damage            = dv.getFloat64(80,  true);
    const quake_damage            = dv.getFloat64(88,  true);
    const overkill_damage         = dv.getFloat64(96,  true);
    const stamina_refunded_flurry = dv.getFloat64(104, true);
    const stamina_refunded_mods   = dv.getFloat64(112, true);
    const stamina_wasted_overcap  = dv.getFloat64(120, true);
    const speed_pool              = dv.getFloat64(128, true);
    // stamina @ 136, crosshair_timer @ 144 — unused in metrics dict

    // total_frags[7] at offset 152
    const total_frags = new Array(7);
    for (let i = 0; i < 7; i++) total_frags[i] = dv.getFloat64(152 + i * 8, true);

    // specific_blocks_mined[28] at offset 256 (u32), _frags at 368 (f64)
    const specific_blocks_mined = new Array(28);
    const specific_blocks_frags = new Array(28);
    for (let i = 0; i < 28; i++) {
      specific_blocks_mined[i] = dv.getUint32(256 + i * 4, true);
      specific_blocks_frags[i] = dv.getFloat64(368 + i * 8, true);
    }

    // history_len at 592, then floor[N] (u32) then stamina[N] (f64)
    const history_len = dv.getUint32(592, true);
    const stamina_floor_off = 596;
    const stamina_off = stamina_floor_off + history_len * 4;
    const history_floor = new Array(history_len);
    const history_stamina = new Array(history_len);
    for (let i = 0; i < history_len; i++) {
      history_floor[i]   = dv.getUint32(stamina_floor_off + i * 4, true);
      history_stamina[i] = dv.getFloat64(stamina_off + i * 8, true);
    }

    // Build the metrics dict in the exact shape execute_simulation returns.
    const arch_mins = total_time > 0 ? total_time / 60.0 : 1.0;
    
    const metrics = {
      highest_floor,
      xp_per_min: total_xp / arch_mins,
      blocks_per_min: blocks_mined / arch_mins,
      total_time,
      stamina_trace_floor: history_floor,
      stamina_trace_stamina: history_stamina,
      gross_swings: total_stamina_spent,
      in_game_time: total_time,
      crosshair_spawns,
      crosshair_damage,
      melee_damage,
      quake_damage,
      overkill_damage,
      flurry_casts,
      enrage_casts,
      quake_casts,
      stamina_refunded_flurry,
      stamina_refunded_mods,
      stamina_wasted_overcap,
      speed_pool_delta_per_min: (speed_pool - (startingSpeedPool || 0)) / arch_mins,
    };

    // frag_{tier}_per_min
    for (let i = 0; i < 7; i++) metrics['frag_' + i + '_per_min'] = total_frags[i] / arch_mins;

    // Per-block metrics — Python emits these for every block_id present in
    // result.specific_blocks_mined / .specific_blocks_frags.  Those dicts
    // get populated together inside _process_kill_rewards, so "block was
    // mined" is the gate for ALL per-block keys (including raw_frag, which
    // may legitimately be 0 for dirt blocks whose frag_amt is 0).
    for (let i = 0; i < 28; i++) {
      const cnt = specific_blocks_mined[i];
      if (cnt === 0) continue;
      const bid = BLOCK_IDS[i];
      const b_pm = cnt / arch_mins;
      metrics['block_' + bid + '_per_min'] = b_pm;
      metrics['raw_block_' + bid] = cnt;
      const is_t4 = bid.charCodeAt(bid.length - 1) === 52; // '4'
      const base_odds = is_t4 ? CARD_DROP_ODDS.tier_4.base_card : CARD_DROP_ODDS.tier_1_3.base_card;
      const poly_odds = is_t4 ? CARD_DROP_ODDS.tier_4.poly_fragment : CARD_DROP_ODDS.tier_1_3.poly_fragment;
      const inf_odds  = is_t4 ? CARD_DROP_ODDS.tier_4.infernal_fragment : CARD_DROP_ODDS.tier_1_3.infernal_fragment;
      metrics['card_base_' + bid + '_per_min'] = b_pm / base_odds;
      metrics['card_poly_' + bid + '_per_min'] = b_pm / poly_odds;
      metrics['card_inf_' + bid + '_per_min']  = b_pm / inf_odds;
      metrics['raw_frag_' + bid] = specific_blocks_frags[i];
    }

    return metrics;
  }

  global.IoMWasmStateCodec = {
    packPlayerState,
    decodeResult,
    INPUT_SIZE,
    SCHEMA_VERSION,
    BLOCK_IDS,
  };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
