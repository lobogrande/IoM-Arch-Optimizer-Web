// commit: docs(mechanics): generate initial true game mechanics summary document

# Idle Obelisk Miner - True Game Mechanics Summary
**Current Version:** 1.0 (Based on reverse-engineered source code)
**Purpose:** AI Handoff & Context Alignment. Strictly bypasses generic RPG assumptions.

## 1. THE STAT SYSTEM (Mathematical Realities)
The game does not use standard RPG stat definitions. Stats often dual-scale and have heavily intertwined formulas. **Crucially, stat utility evolves; many stats gain entirely new modifiers or massively increased scaling coefficients later in the game via specific upgrades or Ascensions.**

*   **Strength (Str):** Double-dips into Damage. Early on, it provides a base additive damage increase and a small multiplier. Later (via Upgrades 25, 36, 47, and 51), its multiplier scaling drastically increases, and it begins significantly compounding `crit_dmg_mult`.
*   **Agility (Agi):** The primary source of Max Stamina. Also provides minor Crit Chance and Speed Mod Chance. Its base stamina yield (`5 * Agi`) is heavily amplified later by Upgrade 26 (`Max Sta/Mod Chance`).
*   **Perception (Per):** Increases Armor Penetration, Fragment/Loot Gain Multipliers, and Loot Mod Chance. Upgrade 33 vastly amplifies its base Armor Penetration and Mod Chance coefficients.
*   **Intelligence (Int):** Increases Armor Penetration Multiplier, Exp Gain Multiplier, and Exp Mod Chance. Upgrade 35 buffs its Exp scaling and Mod Chance coefficients.
*   **Luck (Luck):** The "Universal Trigger" stat. Increases Crit Chance, Gold Crosshair Chance, and ALL Mod Chances (Exp, Loot, Speed, Stamina). It generally scales linearly without complex upgrade dependencies.
*   **Divinity (Div):** **(Locked pre-Ascension 1).** Acts as a secondary Strength. Provides massive base additive damage, Super Crit Chance, and Crosshair Auto-Tap Chance. Upgrade 34 (`Buff Divinity`) specifically exists to amplify all of these base coefficients.
*   **Corruption (Corr):** **(Locked pre-Ascension 2).** The Ultimate Endgame Stat. 
    *   *The Buff:* Provides a massive damage multiplier (`0.06 * Corr` base, explicitly boosted by Upgrade 52) AND multiplies the yield of all Triggered Mods (`exp_mod_gain`, `loot_mod_gain`, etc.).
    *   *The Curse:* Reduces `max_sta` by 3% per point (`1 - 0.03 * Corr`).

## 2. THE COMBAT LOOP & DAMAGE RESOLUTION
Combat is a micro-tick simulated timeline, not a turn-based system.
*   **Stamina is Health:** Hitting a block costs 1.0 Stamina. Spawning an ore costs 0.0 Stamina. The run ends when Stamina hits 0.
*   **Effective Armor & Minimum Damage:** Damage subtracted by block armor is `max(0, armor - armor_pen)`. Hits ALWAYS deal a minimum of 1.0 damage regardless of armor (`max(1.0, dmg - eff_armor)`).
*   **Compounding Critical Hits:** Crits roll sequentially, not exclusively. 
    *   Normal Hit -> rolls Crit Chance.
    *   If Crit -> rolls Super Crit Chance.
    *   If Super Crit -> rolls Ultra Crit Chance.
    *   *Ultra Crits mathematically compound the multipliers of all three tiers.*
*   **Crosshairs:** Spawn independently of attack speed on a fixed timer. They deal "free" damage (no stamina cost) and can randomly Auto-Tap and/or trigger a Golden Multiplier (acting as a separate critical hit).
*   **Quake (AoE):** Splashes damage to all remaining blocks on the active floor path.

## 3. BLOCK SPAWNING & MODIFIERS (The Anti-Milking Rule)
*   **Spawns:** The 24-slot grid is generated top-down based on a hardcoded 1-in-X chance array per floor tier.
*   **Modifiers (Mods):** `exp_multi`, `loot_multi`, `stamina_gain`, and `speed_gain` are rolled *at the exact moment the block is spawned*, based on the player's Mod Chance stats.
*   **Kill Rewards:** Modifiers are **ONLY** applied when the block's HP reaches 0 (`_process_kill_rewards`). **You cannot "milk" a block by hitting it multiple times.** 

## 4. THE PHASE 3 ENDGAME META (Why Str drops for Corr)
In Phase 3 (farming lower-tier blocks), the engine intentionally drops `Str` to near zero and maximizes `Corr`. 
*   Because lower-tier blocks have low HP, high `Str` results in "Overkill Damage" which is entirely wasted.
*   Because `Corr` provides its own massive damage multiplier, the engine can still 1-shot or 2-shot weak blocks using `Corr` alone.
*   By shifting points from `Str` to `Corr`, the engine maintains clear speed while massively multiplying the `loot_mod_gain` triggered upon block death.
*   The only mathematical constraint on this strategy is ensuring `Agi` is high enough to offset `Corr`'s 3% Max Stamina penalty.

## 5. SKILLS & INSTA-CHARGING
*   **Enrage:** Additive multiplier to base damage and crit damage.
*   **Flurry:** Flat attack speed boost and instantly refunds flat Stamina upon casting.
*   **Quake:** Consumes charges per hit to trigger the AoE splash.
*   **Insta-Charge RNG:** When a skill Auto-Casts, it rolls against `ability_insta_charge` chance. If successful, its cooldown instantly resets to 0.0. Because the RNG loop checks this repeatedly, skills can theoretically cast themselves dozens of times in a single micro-tick.