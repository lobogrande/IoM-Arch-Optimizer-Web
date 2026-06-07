//! Port of `public/engine/combat_loop.py`.
//!
//! `CombatSimulator::run_simulation` walks the player through floors, slot
//! by slot, hit by hit, until stamina hits zero.  RunState collects all the
//! per-sim totals that the JS metrics dict will eventually read.
//!
//! RNG consumption order — this is the single most important property of the
//! port.  Per micro-tick, RNG calls happen in this exact sequence:
//!   - 1+ `random()` per crosshair spawn while above the interval
//!     (auto-tap, then maybe gold-crit + 1-3 roll_crit calls)
//!   - skill tick (0+ insta-charge `random()` per ability cascade)
//!   - 1-3 `random()` for melee crit
//!   - per quake-AoE'd bg block: 1-3 `random()` for q_crit
//!
//! One off-by-one anywhere here and the rest of the sim diverges entirely.

use crate::block::Block;
use crate::floor_map::FloorGenerator;
use crate::player::Player;
use crate::project_config::BlockId;
use crate::rng::Mt19937;
use crate::skills::{SkillConfig, SkillManager};

/// Slot-visit order on a 24-block floor.  Mirrors PATH_ORDER in combat_loop.py.
pub const PATH_ORDER: [usize; 24] = [
    0, 1, 2, 3, 4, 5,
    11, 10, 9, 8, 7, 6,
    12, 13, 14, 15, 16, 17,
    23, 22, 21, 20, 19, 18,
];

const STAMINA_COST_PER_ORE: f64 = 0.0;
const STAMINA_COST_PER_HIT: f64 = 1.0;
const CROSSHAIR_SPAWN_INTERVAL: f64 = 3.5;

/// Full sim output — every field the JS metrics dict will read at the end.
#[derive(Debug)]
pub struct RunState {
    // Live timers / pools
    pub stamina: f64,
    pub speed_pool: f64,
    pub total_time: f64,
    pub total_stamina_spent: f64,
    pub stamina_refunded_flurry: f64,
    pub stamina_refunded_mods: f64,
    pub stamina_wasted_overcap: f64,
    pub crosshair_timer: f64,

    // Reward tallies
    pub total_xp: f64,
    pub total_frags: [f64; 7], // by frag_type 0..=6
    pub blocks_mined: u32,
    pub specific_blocks_mined: [u32; BlockId::COUNT],
    pub specific_blocks_frags: [f64; BlockId::COUNT],

    // Damage / spawn telemetry
    pub crosshair_spawns: u32,
    pub crosshair_damage: f64,
    pub melee_damage: f64,
    pub quake_damage: f64,
    pub overkill_damage: f64,

    // Divine tier tracking (div1..div4)
    pub div_tier_kills: [u32; 4],
    pub div_tier_frags: [f64; 4],

    // Progression + crit histogram
    pub highest_floor: u32,
    /// Indexed [normal, crit, super, ultra].
    pub hit_counts: [u32; 4],

    // Per-slot telemetry snapshots
    pub history_floor: Vec<u32>,
    pub history_stamina: Vec<f64>,

    // Skill totals (populated from SkillManager at sim end)
    pub total_enrage_casts: u32,
    pub total_flurry_casts: u32,
    pub total_quake_casts: u32,
    pub total_instacharges: u32,
}

impl RunState {
    fn new(starting_stamina: f64, starting_speed_pool: f64) -> Self {
        Self {
            stamina: starting_stamina,
            speed_pool: starting_speed_pool,
            total_time: 0.0,
            total_stamina_spent: 0.0,
            stamina_refunded_flurry: 0.0,
            stamina_refunded_mods: 0.0,
            stamina_wasted_overcap: 0.0,
            crosshair_timer: 0.0,
            total_xp: 0.0,
            total_frags: [0.0; 7],
            blocks_mined: 0,
            specific_blocks_mined: [0; BlockId::COUNT],
            specific_blocks_frags: [0.0; BlockId::COUNT],
            crosshair_spawns: 0,
            crosshair_damage: 0.0,
            melee_damage: 0.0,
            quake_damage: 0.0,
            overkill_damage: 0.0,
            div_tier_kills: [0; 4],
            div_tier_frags: [0.0; 4],
            highest_floor: 1,
            hit_counts: [0; 4],
            history_floor: Vec::new(),
            history_stamina: Vec::new(),
            total_enrage_casts: 0,
            total_flurry_casts: 0,
            total_quake_casts: 0,
            total_instacharges: 0,
        }
    }

    #[inline]
    fn record_telemetry(&mut self) {
        self.history_floor.push(self.highest_floor);
        self.history_stamina.push(self.stamina);
    }
}

pub struct CombatSimulator {
    player: Player,
    generator: FloorGenerator,
    // ---- Cached player @properties — same scalars combat_loop.py hoists ----
    p_max_sta: f64,
    p_atk_spd: f64,
    p_speed_mod_atk_rate: f64,
    p_flurry_bonus_atk_spd: f64,
    p_damage: f64,
    p_enraged_damage: f64,
    p_armor_pen: f64,
    p_quake_dmg_to_all: f64,
    p_crosshair_auto_tap: f64,
    p_gold_crosshair_chance: f64,
    p_gold_crosshair_mult: f64,
    // Crit cache
    p_u_crit_ch: f64,
    p_u_crit_dmg: f64,
    p_s_crit_ch: f64,
    p_s_crit_dmg: f64,
    p_crit_ch: f64,
    p_crit_dmg: f64,
    p_enraged_crit_dmg: f64,
    // Skill config (built once)
    skill_cfg: SkillConfig,
}

impl CombatSimulator {
    pub fn new(mut player: Player) -> Self {
        // Per Python: cache infernal bonuses ONCE at sim start.  After this,
        // every player.inf(block) is a flat array read.
        player.cache_infernal_bonuses();

        let skill_cfg = SkillConfig::from_player(&player);

        let p_max_sta = player.max_sta();
        let p_atk_spd = player.atk_spd();
        let p_speed_mod_atk_rate = player.speed_mod_attack_rate();
        let p_flurry_bonus_atk_spd = player.flurry_bonus_atk_spd();
        let p_damage = player.damage();
        let p_enraged_damage = player.enraged_damage();
        let p_armor_pen = player.armor_pen();
        let p_quake_dmg_to_all = player.quake_dmg_to_all();
        let p_crosshair_auto_tap = player.crosshair_auto_tap();
        let p_gold_crosshair_chance = player.gold_crosshair_chance();
        let p_gold_crosshair_mult = player.gold_crosshair_mult();
        let p_u_crit_ch = player.ultra_crit_chance();
        let p_u_crit_dmg = player.ultra_crit_dmg_mult();
        let p_s_crit_ch = player.super_crit_chance();
        let p_s_crit_dmg = player.super_crit_dmg_mult();
        let p_crit_ch = player.crit_chance();
        let p_crit_dmg = player.crit_dmg_mult();
        let p_enraged_crit_dmg = player.enraged_crit_dmg_mult();

        Self {
            generator: FloorGenerator::new(),
            player,
            p_max_sta, p_atk_spd, p_speed_mod_atk_rate, p_flurry_bonus_atk_spd,
            p_damage, p_enraged_damage, p_armor_pen, p_quake_dmg_to_all,
            p_crosshair_auto_tap, p_gold_crosshair_chance, p_gold_crosshair_mult,
            p_u_crit_ch, p_u_crit_dmg, p_s_crit_ch, p_s_crit_dmg,
            p_crit_ch, p_crit_dmg, p_enraged_crit_dmg,
            skill_cfg,
        }
    }

    /// Mirrors the `roll_crit` closure in combat_loop.py.  Hit-counts mutated
    /// in place; returns the crit multiplier.  RNG consumes 1, 2, or 3 calls
    /// depending on which crit tier lands.
    #[inline]
    fn roll_crit(&self, is_enrage: bool, hit_counts: &mut [u32; 4], rng: &mut Mt19937) -> f64 {
        if rng.random() < self.p_crit_ch {
            let base = if is_enrage { self.p_enraged_crit_dmg } else { self.p_crit_dmg };
            if rng.random() < self.p_s_crit_ch {
                if rng.random() < self.p_u_crit_ch {
                    hit_counts[3] += 1; // ultra
                    return base * self.p_s_crit_dmg * self.p_u_crit_dmg;
                }
                hit_counts[2] += 1; // super
                return base * self.p_s_crit_dmg;
            }
            hit_counts[1] += 1; // crit
            return base;
        }
        hit_counts[0] += 1; // normal
        1.0
    }

    /// Mirrors `_process_kill_rewards` in combat_loop.py.  XP / loot / sta /
    /// speed-pool effects + per-block tracking.
    fn process_kill_rewards(&self, block: &Block, gleaming_multi: f64, state: &mut RunState) {
        let mods = &block.modifiers;
        let xp_yield = block.xp * mods.exp_multi * gleaming_multi;
        state.total_xp += xp_yield;

        let loot_yield = block.frag_amt * mods.loot_multi * gleaming_multi;
        let ft = block.frag_type as usize;
        if ft < 7 {
            state.total_frags[ft] += loot_yield;
            // Divine blocks also feed the per-tier divine tracking.
            match block.block_id {
                BlockId::Div1 => { state.div_tier_kills[0] += 1; state.div_tier_frags[0] += loot_yield; }
                BlockId::Div2 => { state.div_tier_kills[1] += 1; state.div_tier_frags[1] += loot_yield; }
                BlockId::Div3 => { state.div_tier_kills[2] += 1; state.div_tier_frags[2] += loot_yield; }
                BlockId::Div4 => { state.div_tier_kills[3] += 1; state.div_tier_frags[3] += loot_yield; }
                _ => {}
            }
        }

        let sta_gain = mods.stamina_gain;
        if sta_gain > 0.0 {
            let actual_gain = (self.p_max_sta - state.stamina).min(sta_gain);
            state.stamina += actual_gain;
            state.stamina_refunded_mods += actual_gain;
            state.stamina_wasted_overcap += sta_gain - actual_gain;
        }

        if mods.speed_active {
            state.speed_pool += mods.speed_gain;
        }

        state.blocks_mined += 1;
        let idx = block.block_id.idx();
        state.specific_blocks_mined[idx] += 1;
        state.specific_blocks_frags[idx] += loot_yield;
    }

    /// Full simulation — runs until stamina hits zero.  Returns the RunState
    /// containing every metric the JS layer will later read.
    pub fn run_simulation(&mut self, rng: &mut Mt19937) -> RunState {
        let mut state = RunState::new(
            self.p_max_sta,
            self.player.starting_speed_pool as f64,
        );
        let mut skills = SkillManager::new();
        let mut current_floor_id: u32 = 1;

        state.record_telemetry();

        while state.stamina > 0.0 {
            let floor = self.generator.generate_floor(current_floor_id, &self.player, rng);
            state.highest_floor = current_floor_id;

            // Move floor into a local Vec so we can hold mutable refs to blocks.
            let mut grid: [Option<Block>; 24] = floor.grid;
            let gleaming_multi = floor.gleaming_multi;

            for (i, &slot_idx) in PATH_ORDER.iter().enumerate() {
                if state.stamina <= 0.0 { break; }
                if grid[slot_idx].is_none() { continue; }
                if grid[slot_idx].as_ref().unwrap().hp <= 0.0 { continue; }

                state.stamina -= STAMINA_COST_PER_ORE;
                state.total_stamina_spent += STAMINA_COST_PER_ORE;

                // ---- Inner micro-tick ----
                // Python's loop is `while target.hp > 0 and state.stamina > 0`.
                // The hp-check at the TOP means an iteration only runs when
                // the target is still alive — critical for matching the count
                // of crosshair spawns / skill ticks / time accumulation.
                'inner: loop {
                    if state.stamina <= 0.0 { break 'inner; }
                    if grid[slot_idx].as_ref().map_or(true, |b| b.hp <= 0.0) {
                        break 'inner;
                    }
                    let is_flurry = skills.is_flurry_active();
                    let is_enrage = skills.is_enrage_active();
                    let flurry_mult = if is_flurry { 1.0 + self.p_flurry_bonus_atk_spd } else { 1.0 };

                    let current_atk_spd = if state.speed_pool > 0.0 {
                        let v = self.p_atk_spd * self.p_speed_mod_atk_rate * flurry_mult;
                        state.speed_pool -= 1.0;
                        v
                    } else {
                        self.p_atk_spd * flurry_mult
                    };

                    let time_passed = 1.0 / current_atk_spd;
                    state.total_time += time_passed;
                    state.crosshair_timer += time_passed;

                    // ---- Crosshair spawn loop ----
                    while state.crosshair_timer >= CROSSHAIR_SPAWN_INTERVAL {
                        state.crosshair_timer -= CROSSHAIR_SPAWN_INTERVAL;
                        state.crosshair_spawns += 1;

                        if rng.random() < self.p_crosshair_auto_tap {
                            let target = grid[slot_idx].as_ref().unwrap();
                            let ch_base_dmg = if is_enrage { self.p_enraged_damage } else { self.p_damage };
                            let ch_eff_armor = (target.armor - self.p_armor_pen).max(0.0);

                            let ch_actual_dmg = if rng.random() < self.p_gold_crosshair_chance {
                                let ch_crit_mult = self.roll_crit(is_enrage, &mut state.hit_counts, rng);
                                ((ch_base_dmg - ch_eff_armor) * self.p_gold_crosshair_mult * ch_crit_mult).max(1.0)
                            } else {
                                (ch_base_dmg - ch_eff_armor).max(1.0)
                            };

                            let target_hp = target.hp;
                            let eff_ch = ch_actual_dmg.min(target_hp);
                            state.overkill_damage += ch_actual_dmg - eff_ch;
                            state.crosshair_damage += ch_actual_dmg;

                            // Mutate target hp through the Option.
                            grid[slot_idx].as_mut().unwrap().hp -= ch_actual_dmg;
                        }
                    }

                    if grid[slot_idx].as_ref().unwrap().hp <= 0.0 {
                        break 'inner;
                    }

                    // ---- Skill tick + flurry refund ----
                    let sta_restored = skills.tick(time_passed, &self.skill_cfg, rng);
                    if sta_restored > 0.0 {
                        let actual_gain = (self.p_max_sta - state.stamina).min(sta_restored);
                        state.stamina += actual_gain;
                        state.stamina_refunded_flurry += actual_gain;
                        state.stamina_wasted_overcap += sta_restored - actual_gain;
                    }

                    // ---- Melee ----
                    let crit_mult = self.roll_crit(is_enrage, &mut state.hit_counts, rng);
                    let base_dmg = if is_enrage { self.p_enraged_damage } else { self.p_damage };
                    let target = grid[slot_idx].as_ref().unwrap();
                    let eff_armor = (target.armor - self.p_armor_pen).max(0.0);
                    let actual_dmg = ((base_dmg - eff_armor) * crit_mult).max(1.0);

                    let eff_melee = actual_dmg.min(target.hp);
                    state.overkill_damage += actual_dmg - eff_melee;
                    state.melee_damage += actual_dmg;

                    grid[slot_idx].as_mut().unwrap().hp -= actual_dmg;
                    state.stamina -= STAMINA_COST_PER_HIT;
                    state.total_stamina_spent += STAMINA_COST_PER_HIT;

                    // ---- Quake AoE ----
                    let quake_triggered = skills.consume_attack();
                    if quake_triggered {
                        let q_base = base_dmg * self.p_quake_dmg_to_all;
                        // Iterate background blocks in PATH_ORDER[i+1..].  We
                        // process them sequentially so kill rewards from
                        // earlier bg blocks can affect later ones.
                        for j in (i + 1)..PATH_ORDER.len() {
                            let bg_idx = PATH_ORDER[j];
                            // Skip empty / dead bg slots
                            if grid[bg_idx].is_none() { continue; }
                            if grid[bg_idx].as_ref().unwrap().hp <= 0.0 { continue; }

                            let q_crit = self.roll_crit(is_enrage, &mut state.hit_counts, rng);
                            let bg_armor = grid[bg_idx].as_ref().unwrap().armor;
                            let bg_eff_armor = (bg_armor - self.p_armor_pen).max(0.0);
                            let q_dmg = ((q_base - bg_eff_armor) * q_crit).max(1.0);

                            let bg_hp = grid[bg_idx].as_ref().unwrap().hp;
                            let q_eff = q_dmg.min(bg_hp);
                            state.overkill_damage += q_dmg - q_eff;
                            state.quake_damage += q_dmg;

                            grid[bg_idx].as_mut().unwrap().hp -= q_dmg;
                            if grid[bg_idx].as_ref().unwrap().hp <= 0.0 {
                                // Take owned ref for reward processing.  We
                                // still need the slot occupied for subsequent
                                // bg checks (hp <= 0 will skip it), so just
                                // borrow.
                                let bg_block = grid[bg_idx].as_ref().unwrap().clone();
                                self.process_kill_rewards(&bg_block, gleaming_multi, &mut state);
                            }
                        }
                    }
                }

                if let Some(block) = grid[slot_idx].as_ref() {
                    if block.hp <= 0.0 {
                        let clone = block.clone();
                        self.process_kill_rewards(&clone, gleaming_multi, &mut state);
                    }
                }

                state.record_telemetry();
            }

            current_floor_id += 1;
        }

        // Flush skill totals into the RunState (combat_loop.py:state.skills_tracker = skills).
        state.total_enrage_casts = skills.total_enrage_casts;
        state.total_flurry_casts = skills.total_flurry_casts;
        state.total_quake_casts = skills.total_quake_casts;
        state.total_instacharges = skills.total_instacharges;

        state
    }
}
