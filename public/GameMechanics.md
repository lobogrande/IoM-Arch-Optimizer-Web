// commit: docs(mechanics): generate initial true game mechanics summary document

# Idle Obelisk Miner - True Game Mechanics Summary
**Current Version:** 1.0 (Based on reverse-engineered source code)
**Purpose:** AI Handoff & Context Alignment. Strictly bypasses generic RPG assumptions.

## 1. THE STAT SYSTEM (Mathematical Realities)
The game does not use standard RPG stat definitions. Stats often dual-scale and have heavily intertwined formulas. **Crucially, stat utility evolves; many stats gain entirely new modifiers or massively increased scaling coefficients later in the game via specific upgrades or Ascensions.**

*   **Stat Budget Acquisition:** I receive 1 allocatable stat point for every Arch Level gained. Additionally, Upgrade 12 ("Stat Points") grants up to +5 extra stat points (+1 per level). However, Upgrade 12 is entirely locked during Ascension 0 and only becomes available once Ascension 1 is reached.
*   **Stat Caps:** Stats have strict maximum allocations. The base caps are: `Str` and `Agi` = 50; `Int`, `Per`, and `Luck` = 25; `Div` and `Corr` = 10.
*   **Cap Expansion:** Upgrade 45 ("Exp Gain/All Stat Cap Inc.") is a single-level purchase that provides a global +5 increase to all stat caps, establishing the true endgame maximums: `Str` and `Agi` = 55; `Int`, `Per`, and `Luck` = 30; `Div` and `Corr` = 15. Unlike Upgrade 12, Upgrade 45 is **not** Ascension-locked; it is available in all Ascension states once Floor 42 is reached.
*   **Strength (Str):** Double-dips into Damage. Early on, it provides a base additive damage increase and a small multiplier. Later (via Upgrades 25, 36, 47, and 51), its multiplier scaling drastically increases, and it begins significantly compounding `crit_dmg_mult`.
*   **Agility (Agi):** The primary source of Max Stamina. Also provides minor Crit Chance and Speed Mod Chance. Its base stamina yield (`5 * Agi`) is heavily amplified later by Upgrade 26 (`Max Sta/Mod Chance`).
*   **Perception (Per):** Increases Armor Penetration, Fragment/Loot Gain Multipliers, and Loot Mod Chance. Upgrade 33 vastly amplifies its base Armor Penetration and Mod Chance coefficients.
*   **Intelligence (Int):** Increases Armor Penetration Multiplier, Exp Gain Multiplier, and Exp Mod Chance. Upgrade 35 buffs its Exp scaling and Mod Chance coefficients.
*   **Luck (Luck):** The "Universal Trigger" stat. Increases Crit Chance, Gold Crosshair Chance, and ALL Mod Chances (Exp, Loot, Speed, Stamina). It generally scales linearly without complex upgrade dependencies.
*   **Divinity (Div):** **(Locked pre-Ascension 1).** Acts as a secondary Strength. Provides massive base additive damage, Super Crit Chance, and Crosshair Auto-Tap Chance. Upgrade 34 (`Buff Divinity`) specifically exists to amplify all of these base coefficients.
*   **Corruption (Corr):** **(Locked pre-Ascension 2).** The Ultimate Endgame Stat. 
    *   *The Buff:* Provides a massive damage multiplier (`0.06 * Corr` base, explicitly boosted by Upgrade 52) AND multiplies the yield of all Triggered Mods (`exp_mod_gain`, `loot_mod_gain`, etc.).
    *   *The Curse:* Reduces `max_sta` by 3% per point (`1 - 0.03 * Corr`).
*   **Float Drift & Banker's Rounding:** The game natively calculates stats using 32-bit floating-point math. To maintain perfect accuracy, the simulator forcefully replicates GameMaker's memory drift: Max Stamina, Enrage values, and Base Damage all artificially drift *upward* before rounding. This ensures calculated breakpoint math never misses by a rounding error of 1.

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
*   **Block Types & Fragments:** There are exactly 7 distinct block rarities: Dirt, Common, Rare, Epic, Legendary, Mythic, and Divine. Correspondingly, there are only 6 fragment types used as currency, because **Dirt blocks drop no fragments** (they yield only XP).
*   **Boss/Gauntlet Floor Overrides:** Before the standard RNG runs, the game checks a hardcoded list of Boss/Gauntlet floors. These specific floors completely bypass normal probability brackets and forcefully spawn predetermined block tiers or "mixed" layouts. **Crucially, all Boss/Gauntlet floors are guaranteed to have a full grid (all 24 slots are populated with blocks).**
*   **Spawning Hierarchy:** For normal floors, the 24-slot grid is generated sequentially using top-down probability checks. It attempts to roll the highest unlocked rarity first (Divine ➔ Mythic ➔ down to Dirt). If a rarity succeeds its 1-in-X chance, it spawns.
*   **Ascension Failsafes:** Pre-Ascension 1, any rolled Divine blocks are forcefully downgraded to Mythic. Pre-Ascension 2, Tier 4 blocks are downgraded to Tier 3.
*   **Floor Scaling & Known Bugs:** Base HP strictly doubles and Armor multiplies by 1.5 at fixed intervals (Floors 100, 150, 200, 250, etc.). *Note: The math contains known GameMaker bugs: Floor 150 skips the armor scale, and Floor 300 triggers the HP/Armor doubling twice.*
*   **Gleaming Floors (Ascension 2+ Only):** Entire floors have a chance to spawn as "Gleaming," applying a global multiplier (`gleaming_multi`) to all XP and Loot gained from blocks on that specific floor. This mechanic relies on two distinct player stats: **Gleaming Chance** and **Gleaming Multiplier**. Both stats start at a baseline and can be significantly scaled through specific Upgrades (e.g., Upgrades 19 and 46) and Infernal Card bonuses (e.g., Mythic 1, Divine 2, Dirt 4).
*   **Modifiers (Mods) Mechanics:**
    *   Mods are predetermined properties attached to the block the exact moment it spawns.
    *   A block rolls independently for each of the 4 Mod types (Exp, Loot, Stamina, Speed) based on the player's respective Mod Chance stats.
    *   A block can have a **maximum of 1 of each type** of mod.
    *   A block **can** have multiple *different* mods at the same time (e.g., both an Exp Mod and a Loot Mod on the same block).
    *   **The Speed Pool:** The Speed Mod does *not* grant a timed buff. Instead, when triggered upon block kill, it adds charges to a "Speed Pool." Every subsequent attack consumes 1 charge from this pool to attack at double speed.
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

## 5. BLOCK CARDS, BONUSES, & DROP RNG
Block Cards provide massive multiplicative bonuses to specific blocks, reducing their HP while simultaneously increasing their Exp and Fragment yields. Cards drop exclusively from block kills.
*   **Card Levels & Base Effects:**
    *   **Level 1:** -10% HP, +10% Exp/Loot.
    *   **Level 2:** -20% HP, +20% Exp/Loot.
    *   **Level 3 (Polychrome):** -35% HP, +35% Exp/Loot. (The base 35% can be further enhanced by Upgrade 41).
    *   **Level 4 (Infernal):** Retains Polychrome block bonuses AND grants a unique global stat bonus (e.g., global damage, gleaming chance). This global bonus is scaled heavily by the "Infernal Multiplier" (driven by total collected Infernal Cards and the Hades Idol).
*   **Drop Rates & Requirements:**
    *   **Base Card (Level 1):** Requires 1 drop. Odds: 1 in 1,500 (Tier 1-3) | 1 in 15,000 (Tier 4).
    *   **Polychrome Fragments (Level 3):** Requires 10 fragments. Odds: 1 in 7,500 (Tier 1-3) | 1 in 75,000 (Tier 4).
    *   **Infernal Fragments (Level 4):** Requires 10 fragments. Odds: 1 in 200,000 (All blocks, flat rate).
*   **Ascension Restrictions:** Tier 4 blocks (`*4`) cannot drop cards and card bonuses do not apply to them unless Ascension 2 is unlocked.
*   **Simulator RNG Math (Gamma Distribution):** When predicting the Time-to-Milestone or Opportunity Cost for fragment farming, the simulator uses a **Gamma Distribution**. Because higher-tier cards require collecting multiple fragments, the Gamma distribution accurately models that hunting for multiple drops mathematically smooths out RNG variance. Thus, the expected time to secure 10 drops is significantly less punishing than 10x the maximum RNG variance of a single drop.

## 6. UPGRADES, COST SCALING, & PROGRESSION
The internal upgrade system is strictly gated by progression milestones and features complex cost inflation logic. *(Note: Upgrade IDs like "Upgrade 8" or "Upgrade 55" are strictly internal to my codebase architecture. The actual game and my UI only expose the Upgrade Names to the user).*
*   **The Ascension Reset:** When a player Ascends, they undergo a hard reset of their current run progress. All fragment pools are wiped to 0, Arch Level resets to 1, the Max Floor reached resets, and all previously purchased internal upgrades are reset back to Level 0.
*   **Unlock Requirements & Gem Gating:** Most upgrades only become available in the shop based on the player's current Max Floor reached (e.g., Upgrade 20 unlocks at Floor 9, Upgrade 55 unlocks at Floor 92). Because of the Ascension Reset, players must climb floors to re-unlock the shop UI tiers on every new Ascension.
    *   *The Gem Exception:* Unlike all other internal upgrades, the three foundational Gem upgrades (Upgrades 3, 4, 5) are available immediately at Floor 1. However, their maximum purchasable level is dynamically capped by the formula: **Base (5) + Arch Level - 1**, which equals **Arch Level + 4** (e.g., at Arch Level 1, the cap is 5; at Arch Level 10, the cap is 14). This allows Gem upgrades to scale slightly ahead of the player's level progression.
*   **Ascension Restrictions:** Entire upgrade nodes are physically locked from the player based on their Ascension state.
    *   *Pre-Ascension 1 Locks:* Upgrades 12, 17, 24, 32, 40, 47-51, 53, 54.
    *   *Pre-Ascension 2 Locks:* Upgrades 19, 27, 34, 46, 52, 55.
*   **Currencies:**
    *   Early foundational upgrades (Upgrades 3, 4, 5) cost Gems.
    *   All other upgrades cost a specific tier of Fragment (Common through Divine).
*   **Cost Scaling & Multipliers:**
    *   Multi-level upgrades scale exponentially. Most fragment upgrades scale at a `1.2x` cost multiplier per level. A select few scale at steeper rates (e.g., Upgrades 17 and 27 use `1.35x`, Upgrade 12 uses `2.0x`).
    *   Certain endgame nodes (like Upgrades 41-45, 47) are single-purchase only and require massive flat lump-sum fragment payments.
*   **Ascension Cost Inflation:** An upgrade's base cost fundamentally inflates when transitioning to a new Ascension. The engine tracks an array of base costs `[ Asc0, Asc1, Asc2 ]`. An upgrade might cost 150 Common fragments at Asc1, but inflate to 300 at Asc2. Upgrades that do not exist in a previous ascension are handled as `null` until the correct ascension array index is reached.
*   **Rounding Math:** Gem upgrade costs round to the nearest whole integer (with a special `Math.floor` exception exclusively for Ascension 0). Fragment upgrade costs strictly retain float precision, rounding to exactly two decimal places (`Math.round(amount * 100) / 100`).

## 7. IDOLS & THE DILUTION MECHANIC
Idols are external systems that profoundly impact the Arch simulator. Upgrading an idol requires spending a specific tier of fragment. **Crucially, level-ups are random within a fragment category.** If I have multiple idols unlocked that share the same fragment cost, each level-up randomly selects among them, diluting my chances of hitting the idol I actually want.

*   **Aggregate Cost Scaling (Non-Divine):** For non-Divine idols, the fragment cost formula is NOT based on an individual idol's level. Instead, it evaluates `L` as the **aggregate sum of all idol levels** that share that specific fragment tier. 
*   **The Quadratic Formula:** The exact cost at aggregate level `L` follows an arithmetic progression, mathematically expressed as a quadratic curve: `Cost = min(999, 0.005 * L² + 0.085 * L + 0.91)`. 
    *   *The Anti-Drift Math:* Factoring out the scaling decimals gives `0.005 * (L² + 17L) + 0.91`. For any whole number `L`, the result of `(L² + 17L)` is *always* an even integer. Multiplying an even integer by `0.005` guarantees a perfect multiple of `0.01`. Adding the `0.91` constant perfectly preserves this, ensuring the final output naturally possesses exactly two decimal places, completely bypassing GameMaker's IEEE-754 floating-point drift.
    *   *The 999 Plateau:* Because the cost scales quadratically against the *aggregate* level, Asc1 and Asc2 idols often start at the maximum cost. The formula hits the 999 cap around `L = 439`. Therefore, if my previous 6 Common fragment idols are maxed out (totaling an aggregate level of 1903), the engine evaluates `L = 1904` when I unlock Hestia. The starting Idol cost is already hard-capped at exactly 999 Common Fragments per level from the very first purchase.

*   **Hestia (Ascension 1):** 
    *   **Cost:** Common Fragments.
    *   **Max Level:** 3000.
    *   **Unlock Req:** Arch Level 10 & Generator Level 30.
    *   **Effect:** Unlocks Infernal Misc cards (including the crucial Arch Ability Misc card). Provides +0.01% Fragment Gain per level.
*   **Theseus (Ascension 2):** 
    *   **Cost:** Rare Fragments.
    *   **Max Level:** 3000.
    *   **Unlock Req:** Arch Level 40 & Golden Lantern unlocked.
    *   **Effect:** Immediately increases Banked Lootbug Cap by +15. Provides +0.01% Lootbug Loot Multiplier per level.
*   **Hades (Ascension 1):** 
    *   **Cost:** Divine Fragments.
    *   **Max Level:** 6666.
    *   **Unlock Req:** Arch Level 85 & Blackened Basker Legendary Fish Tribute 2.
    *   **Effect:** Immediately unlocks access to Infernal Arch block cards. Increases ALL Infernal Card bonuses by +0.0045% per level (up to a massive 30% max bonus).
*   **Prometheus (Ascension 2):** 
    *   **Cost:** Divine Fragments.
    *   **Max Level:** 1000.
    *   **Unlock Req:** Arch Level 80 & W4 9th Statue built.
    *   **Effect:** Has no direct impact on Arch math. *Its sole purpose in the simulator is to dilute the Divine Fragment pool.*
*   **Sisyphus (Ascension 2):** 
    *   **Cost:** Divine Fragments.
    *   **Max Level:** 7777.
    *   **Unlock Req:** Arch Level 90 & Rank 7 Butterfly Skin Quest complete.
    *   **Effect:** Has no direct impact on Arch math. *Serves to dilute the Divine Fragment pool.*

**The Divine Pool Trap:** In Ascension 2, because Prometheus and Sisyphus unlock at similar milestones to Hades, they effectively cut the Hades level-up efficiency down to 1/3. The simulator's mathematical Opportunity Cost for maxing Hades skyrockets because I am forced to pay for the other two idols simultaneously due to the RNG selection.