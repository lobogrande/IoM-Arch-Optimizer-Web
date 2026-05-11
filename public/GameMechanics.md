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
Combat is a micro-tick simulated timeline. Damage resolution strictly follows a specific order of operations, and critically, **Armor acts differently depending on the damage source.**

*   **Stamina is Health:** Hitting a block costs 1.0 Stamina. Spawning an ore costs 0.0 Stamina. The run ends when Stamina hits 0.
*   **Compounding Critical Hits:** Crits roll sequentially, not exclusively. 
    *   Normal Hit ➔ rolls Crit Chance.
    *   If Crit ➔ rolls Super Crit Chance.
    *   If Super Crit ➔ rolls Ultra Crit Chance.
    *   *Multipliers Compound:* An Ultra Crit mathematically compounds all three tiers: `base_crit_dmg * super_crit_dmg * ultra_crit_dmg`.
*   **Melee & Quake Damage Resolution (Crit AFTER Armor):** 
    1.  Determine Base Damage (Enrage acts as an additive multiplier in the base formula, not an after-the-fact buff).
    2.  Calculate Effective Armor: `max(0, Block_Armor - Armor_Penetration)`.
    3.  Subtract Effective Armor from Base Damage.
    4.  **Multiply by Crit Multiplier:** `(Base_Dmg - Eff_Armor) * Crit_Mult`. 
    5.  **Minimum Floor:** If the final result is ≤ 0, it is hard-capped to exactly 1.0 damage.
*   **Crosshair Damage Resolution:** 
    *   Crosshairs spawn independently on a fixed timer and cost 0 Stamina.
    *   Crosshairs follow the exact same order of operations as Melee hits (Crit applied AFTER Armor). If a Gold Crosshair triggers, its specific `Gold_Mult` acts as an additional multiplier compounded alongside the standard crits: `(Base_Dmg - Eff_Armor) * Gold_Mult * Crit_Mult`.
*   **Quake (AoE):** Splashes damage to all remaining blocks on the active floor path. It inherits Enrage base damage, but rolls its own independent Critical Hits and interacts with the specific armor of each individual background block hit.
*   **Overkill is Wasted:** Any damage dealt beyond a block's remaining HP is completely discarded. It does not carry over.

## 3. BLOCK SPAWNING, SCALING, & MODIFIERS
*   **Spawning Hierarchy:** The 24-slot grid is generated sequentially using top-down probability checks. It attempts to roll the highest unlocked rarity first (Divine ➔ Mythic ➔ down to Dirt). If a rarity succeeds its 1-in-X chance, it spawns. 
*   **Ascension Failsafes:** Pre-Ascension 1, any rolled Divine blocks are forcefully downgraded to Mythic. Pre-Ascension 2, Tier 4 blocks are downgraded to Tier 3.
*   **Floor Scaling & Known Bugs:** Base HP strictly doubles and Armor multiplies by 1.5 at fixed intervals (Floors 100, 150, 200, 250, etc.). *Note: The math contains known GameMaker bugs: Floor 150 skips the armor scale, and Floor 300 triggers the HP/Armor doubling twice.*
*   **Gleaming Floors (Ascension 2+ Only):** Entire floors have a chance to spawn as "Gleaming," applying a global multiplier (`gleaming_multi`) to all XP and Loot gained from blocks on that specific floor. This mechanic relies on two distinct player stats: **Gleaming Chance** and **Gleaming Multiplier**. Both stats start at a baseline and can be significantly scaled through specific Upgrades (e.g., Upgrades 19 and 46) and Infernal Card bonuses (e.g., Mythic 1, Divine 2, Dirt 4).
*   **Modifiers (Mods) Mechanics:**
    *   Mods are predetermined properties attached to the block the exact moment it spawns.
    *   A block rolls independently for each of the 4 Mod types (Exp, Loot, Stamina, Speed) based on the player's respective Mod Chance stats.
    *   A block can have a **maximum of 1 of each type** of mod.
    *   A block **can** have multiple *different* mods at the same time (e.g., both an Exp Mod and a Loot Mod on the same block).
    *   If no mod rolls for a given block, killing it simply yields its standard baseline rewards.
*   **The Anti-Milking Rule:** Modifiers are **ONLY** evaluated and applied when the block's HP reaches 0. You cannot "milk" a block by hitting it multiple times to repeatedly trigger an attached mod.

## 4. SKILLS, COOLDOWNS, & INSTA-CHARGING
Skills are enabled in the simulator via Upgrade 8 (which also unlocks the in-game auto-cast feature, assumed always-on for idle simulation). They have distinct trigger mechanisms and can freely overlap, creating massive burst-damage windows.
*   **Skill Effects & Triggers:** 
    *   **Flurry** is *time-based*. It runs on a duration timer (base 5s) and ticks down in real-time. It grants a multiplicative attack speed boost and instantly refunds a flat amount of Stamina upon casting.
    *   **Enrage** is *charge-based* (base 5 charges). It applies an additive multiplier to the player's base damage, and crucially, provides a massive secondary boost to the Critical Damage multiplier. Charges only deplete when a hit actually lands.
    *   **Quake** is *charge-based* (base 5 charges). When a hit lands, it consumes a charge to trigger an AoE splash attack, dealing a percentage of the player's base damage to all remaining blocks on the active floor path. Quake hits roll their own independent critical strikes and interact individually with the effective armor of each background block.
*   **Skill Synergies:** Because they do not block each other, an active Flurry (faster attack speed) will rapidly accelerate the consumption of Enrage and Quake charges, concentrating their burst damage. 
*   **Cooldowns & Enhancements:**
    *   Base cooldowns are 60s (Enrage), 120s (Flurry), and 180s (Quake).
    *   These timers are reduced additively by various internal upgrades and external skill tree nodes (Avada Keda- Skill).
    *   **Arch Ability Misc Card:** Provides a global, *multiplicative* cooldown reduction to all three skills simultaneously (applied after additive upgrade reductions).
    *   *(Bug Note: Upgrade 32 is intended only for Enrage cooldown reduction, but currently applies to Flurry and Quake as well).*
*   **Insta-Charge RNG:** When a skill goes off cooldown and Auto-Casts, it rolls against the `ability_insta_charge` stat. If successful, its cooldown instantly resets to 0.0. This check repeats independently, allowing a skill to theoretically cast itself multiple times in a single micro-tick.
*   **The Ability Fairy:** Unlocked via Upgrade 27. While completely ignored by the autonomous simulator, this is a manual-player feature where a fairy periodically appears on screen. Clicking it instantly resets all 3 skill cooldowns to zero and triggers them simultaneously.