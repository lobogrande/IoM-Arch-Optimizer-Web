//! Port of `public/core/skills.py`.
//!
//! `SkillManager` owns the cooldown/charge/timer state for the three
//! auto-cast abilities (Enrage / Flurry / Quake) plus their insta-charge
//! cascade.  Constructed once per sim from a cached `SkillConfig` to avoid
//! re-reading the player property surface on every tick.

use crate::player::Player;
use crate::rng::Mt19937;

/// Per-sim cached skill configuration.  Populated once at sim start
/// (combat_loop.rs equivalent) so `tick()` doesn't have to re-evaluate
/// Player @properties on every micro-tick.
#[derive(Clone, Copy, Debug)]
pub struct SkillConfig {
    pub ability_insta: f64,
    pub enrage_charges_max: f64,
    pub enrage_cd_max: f64,
    pub flurry_duration_max: f64,
    pub flurry_cd_max: f64,
    pub flurry_sta_cast: f64,
    pub quake_attacks_max: f64,
    pub quake_cd_max: f64,
    pub auto_enrage: bool,
    pub auto_flurry: bool,
    pub auto_quake: bool,
}

impl SkillConfig {
    /// Build the cache directly from a Player.  Mirrors the skill_cache dict
    /// constructed in combat_loop.py:run_simulation.
    pub fn from_player(player: &Player) -> Self {
        let upg8 = player.upgrade_levels[8];
        Self {
            ability_insta: player.ability_insta_charge(),
            enrage_charges_max: player.enrage_charges(),
            enrage_cd_max: player.enrage_cooldown(),
            flurry_duration_max: player.flurry_duration(),
            flurry_cd_max: player.flurry_cooldown(),
            flurry_sta_cast: player.flurry_sta_on_cast(),
            quake_attacks_max: player.quake_attacks(),
            quake_cd_max: player.quake_cooldown(),
            auto_enrage: upg8 >= 1,
            auto_flurry: upg8 >= 2,
            auto_quake: upg8 >= 3,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct SkillManager {
    // Current state timers and counters
    pub enrage_cd: f64,
    pub enrage_charges: f64,

    pub flurry_cd: f64,
    pub flurry_timer: f64,

    pub quake_cd: f64,
    pub quake_charges: f64,

    // Lifetime stats (read by metrics dict at sim end)
    pub total_enrage_casts: u32,
    pub total_flurry_casts: u32,
    pub total_quake_casts: u32,
    pub total_instacharges: u32,
}

impl SkillManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Advance time by `dt` seconds.  Decrements active timers, runs the
    /// auto-cast cascade for each enabled ability, and returns the flat
    /// stamina restored by Flurry casts during this tick.
    pub fn tick(&mut self, dt: f64, cfg: &SkillConfig, rng: &mut Mt19937) -> f64 {
        let mut stamina_restored = 0.0;

        // 1. Advance all active timers
        if self.enrage_cd > 0.0 { self.enrage_cd -= dt; }
        if self.flurry_cd > 0.0 { self.flurry_cd -= dt; }
        if self.quake_cd  > 0.0 { self.quake_cd  -= dt; }

        if self.flurry_timer > 0.0 {
            self.flurry_timer -= dt;
            if self.flurry_timer < 0.0 {
                self.flurry_timer = 0.0;
            }
        }

        // 2. Auto-cast: Enrage
        if cfg.auto_enrage {
            let mut chain = 0u32;
            while self.enrage_cd <= 0.0 && chain < 100 {
                self.enrage_charges += cfg.enrage_charges_max;
                self.enrage_cd = cfg.enrage_cd_max;
                self.total_enrage_casts += 1;

                if rng.random() < cfg.ability_insta {
                    self.enrage_cd = 0.0;
                    self.total_instacharges += 1;
                    chain += 1;
                } else {
                    break;
                }
            }
        }

        // 3. Auto-cast: Flurry
        if cfg.auto_flurry {
            let mut chain = 0u32;
            while self.flurry_cd <= 0.0 && chain < 100 {
                self.flurry_timer += cfg.flurry_duration_max;
                self.flurry_cd = cfg.flurry_cd_max;
                self.total_flurry_casts += 1;

                stamina_restored += cfg.flurry_sta_cast;

                if rng.random() < cfg.ability_insta {
                    self.flurry_cd = 0.0;
                    self.total_instacharges += 1;
                    chain += 1;
                } else {
                    break;
                }
            }
        }

        // 4. Auto-cast: Quake
        if cfg.auto_quake {
            let mut chain = 0u32;
            while self.quake_cd <= 0.0 && chain < 100 {
                self.quake_charges += cfg.quake_attacks_max;
                self.quake_cd = cfg.quake_cd_max;
                self.total_quake_casts += 1;

                if rng.random() < cfg.ability_insta {
                    self.quake_cd = 0.0;
                    self.total_instacharges += 1;
                    chain += 1;
                } else {
                    break;
                }
            }
        }

        stamina_restored
    }

    /// Called on each melee hit.  Decrements an Enrage charge (if any) and
    /// consumes a Quake charge (returning `true` to signal AoE should fire).
    pub fn consume_attack(&mut self) -> bool {
        let mut quake_triggered = false;
        if self.enrage_charges > 0.0 { self.enrage_charges -= 1.0; }
        if self.quake_charges  > 0.0 {
            self.quake_charges -= 1.0;
            quake_triggered = true;
        }
        quake_triggered
    }

    #[inline] pub fn is_enrage_active(&self) -> bool { self.enrage_charges > 0.0 }
    #[inline] pub fn is_flurry_active(&self) -> bool { self.flurry_timer > 0.0 }
    #[inline] pub fn is_quake_active(&self)  -> bool { self.quake_charges  > 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_with_all_autos() -> SkillConfig {
        SkillConfig {
            ability_insta: 0.0,
            enrage_charges_max: 5.0,
            enrage_cd_max: 60.0,
            flurry_duration_max: 5.0,
            flurry_cd_max: 120.0,
            flurry_sta_cast: 5.0,
            quake_attacks_max: 5.0,
            quake_cd_max: 180.0,
            auto_enrage: true,
            auto_flurry: true,
            auto_quake: true,
        }
    }

    #[test]
    fn first_tick_fires_one_cast_per_ability() {
        let mut sm = SkillManager::new();
        let cfg = cfg_with_all_autos();
        let mut rng = Mt19937::new(42);
        let sta = sm.tick(1.0, &cfg, &mut rng);
        assert_eq!(sm.total_enrage_casts, 1);
        assert_eq!(sm.total_flurry_casts, 1);
        assert_eq!(sm.total_quake_casts, 1);
        assert_eq!(sta, 5.0); // one Flurry cast = +5 stamina
        assert_eq!(sm.enrage_charges, 5.0);
        assert_eq!(sm.flurry_timer, 5.0);
        assert_eq!(sm.quake_charges, 5.0);
    }

    #[test]
    fn consume_attack_quake_drops_first() {
        let mut sm = SkillManager::new();
        sm.enrage_charges = 3.0;
        sm.quake_charges = 2.0;
        assert!(sm.consume_attack()); // quake triggered, both decrement
        assert_eq!(sm.enrage_charges, 2.0);
        assert_eq!(sm.quake_charges, 1.0);
        assert!(sm.consume_attack());
        assert_eq!(sm.quake_charges, 0.0);
        // quake empty now
        assert!(!sm.consume_attack());
        assert_eq!(sm.enrage_charges, 0.0);
    }

    #[test]
    fn cooldown_advances_with_dt() {
        let mut sm = SkillManager::new();
        sm.enrage_cd = 30.0;
        let cfg = SkillConfig {
            auto_enrage: false, auto_flurry: false, auto_quake: false,
            ..cfg_with_all_autos()
        };
        let mut rng = Mt19937::new(0);
        sm.tick(5.0, &cfg, &mut rng);
        assert_eq!(sm.enrage_cd, 25.0);
    }
}
