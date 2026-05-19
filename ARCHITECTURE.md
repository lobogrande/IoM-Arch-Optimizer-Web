# IoM Arch Optimizer - Architecture & Design Document

**Version:** 2.0.0  
**Last Updated:** May 17, 2026  
**Purpose:** Comprehensive architecture documentation explaining how the entire IoM Arch Optimizer system works

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Core Architecture](#3-core-architecture)
4. [Backend: Python Simulation Engine](#4-backend-python-simulation-engine)
5. [Frontend: React Application](#5-frontend-react-application)
6. [Optimization Algorithms](#6-optimization-algorithms)
7. [Data Flow & Communication](#7-data-flow--communication)
8. [Performance Optimizations](#8-performance-optimizations)
9. [Hard-Coded Values & Game Constants](#9-hard-coded-values--game-constants)
10. [Trade-Off Decisions](#10-trade-off-decisions)
11. [Known Issues & Technical Debt](#11-known-issues--technical-debt)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Future Improvements & Roadmap](#13-future-improvements--roadmap)
14. [Conclusion](#14-conclusion)

---

## 1. System Overview

### What This Application Does

The IoM Arch Optimizer is a **100% client-side Monte Carlo simulator and AI build optimizer** for the Archaeology mini-game in *Idle Obelisk Miner*. It solves a complex mathematical problem: finding the optimal stat distribution for a player character in a game with:

- **7 base stats** (Str, Agi, Per, Int, Luck, Div, Corr)
- **56 upgrades** with complex interactions
- **28 block cards** across 4 tiers
- **Multiple progression systems** (Ascensions, Idols, Skills)
- **Probabilistic combat** with nested critical hits
- **Procedurally generated floors** with varying block spawns

### Why This Is Hard

The optimization problem is computationally intractable for several reasons:

1. **Combinatorial Explosion**: With 7-8 dimensions (including "Unspent Points"), budget of 50-200+ points, and constraints, the search space contains millions of possible combinations
2. **Non-Linear Interactions**: Stats interact multiplicatively across multiple upgrade menus; small changes can have cascading effects
3. **Stat Plateaus**: Due to 32-bit float drift and whole-hit mechanics, many stat values produce identical results (wasted points)
4. **RNG Variance**: Combat outcomes depend on critical hits, block spawns, and modifier rolls requiring Monte Carlo sampling
5. **Context-Dependent Optima**: The "best" build changes dramatically based on target (farming vs pushing, early vs late game)

### Solution Approach

The system uses a **multi-phase successive halving algorithm** combined with **simulated annealing** to efficiently search the space:

- **Phase 1**: Test ALL candidates with small sample (coarse grid, 15% of iteration budget)
- **Phase 2**: Keep top 20%, test with medium sample (35% of budget)
- **Phase 3**: Keep top 10%, test with full sample (50% of budget)
- **Simulated Annealing**: Random walks from best candidates to escape local minima

This approach runs **entirely in the browser** using WebAssembly (Pyodide) with zero server costs.

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2.4 | UI framework with functional components and hooks |
| **Vite** | 8.0.1 | Build tool and dev server (ultra-fast HMR) |
| **Tailwind CSS** | 4.2.2 | Utility-first styling with custom theme system |
| **Zustand** | 5.0.12 | Lightweight state management (no Redux complexity) |
| **idb-keyval** | Latest | IndexedDB wrapper for persistent storage |
| **Plotly.js** | 3.4.0 | Interactive data visualizations and charts |
| **AG Grid** | Community | High-performance data tables |
| **React Joyride** | 3.1.0 | Interactive guided tours |

### Backend (Python → WebAssembly)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Pyodide** | 0.25.0 | Python runtime compiled to WebAssembly |
| **Python** | 3.11 | Core simulation engine language |
| **Web Workers** | Native | Parallel execution without blocking UI |

### Deployment

| Service | Purpose |
|---------|---------|
| **Cloudflare Pages** | Static site hosting with CDN |
| **GitHub** | Version control and CI/CD triggers |
| **Discord Webhooks** | Feedback form integration |

---

## 3. Core Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                      React UI (Layer 5)                      │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────┐  │
│  │ Welcome  │  Setup   │ Calculated│  Block   │   Sims   │  │
│  │          │          │   Stats   │Compendium│          │  │
│  └──────────┴──────────┴───────────┴──────────┴──────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ Zustand State + IndexedDB
┌───────────────────────────┴─────────────────────────────────┐
│              JavaScript Orchestration Layer                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Auto-Scaling Worker Pool (optimizer.js)             │   │
│  │  • Dynamic CPU profiling                             │   │
│  │  • 3-Phase Successive Halving                        │   │
│  │  • Backtracking grid generation                      │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ postMessage() API
┌───────────────────────────┴─────────────────────────────────┐
│           Pyodide Web Workers (engine_worker.js)             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Python Simulation Engine                            │   │
│  │  • player.py    (stat calculations)                  │   │
│  │  • block.py     (block stats & scaling)              │   │
│  │  • skills.py    (cooldowns & abilities)              │   │
│  │  • floor_map.py (procedural generation)              │   │
│  │  • combat_loop.py (micro-tick simulation)            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Organization

The project follows a **clear separation of concerns**:

```
IoM-Arch-Optimizer-Web/
├── public/
│   ├── core/               # Python core logic
│   │   ├── player.py       # Player stat calculations
│   │   ├── block.py        # Block stat generation
│   │   └── skills.py       # Skill cooldown management
│   ├── engine/             # Python simulation engines
│   │   ├── combat_loop.py  # Micro-tick combat simulator
│   │   └── floor_map.py    # Procedural floor generation
│   ├── calc_worker.js      # Real-time stat calculations
│   ├── engine_worker.js    # Heavy optimization simulations
│   └── assets/             # Images (cards, icons)
├── src/
│   ├── components/         # React UI components
│   │   ├── Welcome.jsx     # Landing page
│   │   ├── PlayerSetup.jsx # Player data input
│   │   ├── CalculatedStats.jsx # Live stats display
│   │   ├── BlockCompendium.jsx # Block database
│   │   ├── About.jsx       # Documentation & feedback
│   │   └── simulations/    # Simulation tabs
│   │       ├── OptimizerTab.jsx
│   │       ├── PathfinderTab.jsx
│   │       ├── ForecasterTab.jsx
│   │       ├── SandboxTab.jsx
│   │       ├── DuelTab.jsx
│   │       └── SynthesisTab.jsx
│   ├── utils/              # JavaScript utilities
│   │   ├── optimizer.js    # Orchestration logic
│   │   └── pathfinder_engine.js # Progression simulator
│   ├── store.js            # Zustand state management
│   ├── ui_config.js        # UI constants
│   └── App.jsx             # Root component
├── ARCHITECTURE.md         # This document
├── GameMechanics.md        # Game mechanics reference
└── README.md               # Public-facing documentation
```

---

## 4. Backend: Python Simulation Engine

> **Note**: For comprehensive game mechanics formulas and detailed rule explanations, see `public/GameMechanics.md`. This section focuses on implementation architecture.

The Python engine is a **1:1 mathematical emulation** of the GameMaker (GML) source code from Idle Obelisk Miner. It runs in the browser via Pyodide (WebAssembly).

### 4.1 Player Stats Engine (`public/core/player.py`)

**Purpose**: Pure mathematical model converting base stats + upgrades → combat properties

**Key Responsibilities**:
- Calculate derived stats from base stats and upgrade levels
- Apply multiplicative bonuses from different systems
- Emulate GameMaker 32-bit float drift
- Handle Ascension-specific unlocks and restrictions

**Critical Formulas**:

#### Damage Calculation

The damage formula combines multiple upgrade sources, stat contributions, and scaling multipliers:

```
BASE DAMAGE (Additive components):
  = "Flat Damage" upgrades (#9, #15, #20, #32, #49)
  + Str stat × (1 + "Flat Dmg/Damage Up" #25 first value)
  + Div stat × (2 + "Buff Divinity" #34)
  + Rare2 Infernal card
  + 10 (base constant)

DAMAGE MULTIPLIERS:
  multiplier_1 = 1 
               + "Dmg Up/Exp Gain" #51 first value
               + "Damage Up/Armor Pen" #36 first value
               + Str stat × (0.01 
                           + "Damage Up/Crit Dmg Up" #47 first value
                           + "Flat Dmg/Damage Up" #25 second value)
               + Div1 Infernal card
  
  multiplier_2 = (0.06 + "[Corruption Buff] Dmg Up / Mod Multi Up" #52 first value) 
               × Corr stat

FLOOR SCALING BONUS:
  = 1 + "Block Bonker (Dmg per Highest Floor)" skill tree 
      × min(100, current_floor)

FINAL DAMAGE:
  = BASE_DAMAGE × (multiplier_1 + multiplier_2) × floor_scaling_bonus
```

**Key Mechanics**: 
- Str stat appears in both base damage AND multipliers (double-dipping effect)
- Corr stat provides massive damage multiplier but reduces max stamina elsewhere
- Small stat changes cascade through multiple formula layers
- Floor scaling bonus comes from the "Block Bonker" skill, which grants bonus damage based on your highest floor reached. However, it caps at floor 100 (using `min(100, current_floor)`), so pushing to floor 150 provides the same bonus as floor 100. This prevents infinite damage scaling in late game.

**Note on Upgrade Numbers**: Many upgrades have two separate effects. For example, upgrade #25 "Flat Dmg/Damage Up" has both a flat damage bonus (first value) and a multiplicative damage bonus (second value). The code internally tracks these as F25 and H25, representing different columns from the original Excel design spreadsheet.

#### Critical Damage Multipliers

Critical hits scale with various upgrade bonuses and infernal cards:

```
NORMAL CRIT DAMAGE:
  inner_scaling = 1 
                + "Crit Chance/Damage" #13 second value
                + "Crit Dmg/Super Crit Dmg" #30 first value
                + (0.03 + "Damage Up/Crit Dmg Up" #47 second value) × Str stat
  
  crit_damage = 1.5 × inner_scaling 
              × (1 + Com1 Infernal card) 
              × (1 + Epic4 Infernal card)

ENRAGED CRIT DAMAGE:
  The "Enrage&Crit Dmg/Enrage Cooldown" #18 bonus applies OUTSIDE 
  the card multipliers (this was recently fixed from a bug)
  
  enraged_crit = 1.5 × (inner_scaling × card_bonuses 
                       + (1 + "Enrage&Crit Dmg/Enrage Cooldown" #18 first value))

SUPER CRIT DAMAGE (compounds with normal crit):
  super_crit = 2.0 × (1 + "Crit Dmg/Super Crit Dmg" #30 second value
                        + "Super Crit Dmg/Exp Mod Gain" #53 first value)
             × (1 + Com2 Infernal card)

ULTRA CRIT DAMAGE (compounds with super AND normal):
  ultra_crit = 3.0 × (1 + "Ultra Crit Dmg/Sta Mod Chance" #40 first value) 
             × (1 + Com3 Infernal card)
```

**Compounding Mechanics**: An Ultra Crit multiplies base damage by `normal_crit × super_crit × ultra_crit`. 

**Real Example** (High-level player with maxed Hades Idol and most Infernals):
- Base Crit: 8.98×
- Super Crit: 3.20×
- Ultra Crit: 5.27×
- **Total Ultra Crit damage**: 8.98 × 3.20 × 5.27 = **~151× base damage**

This multiplicative compounding is why crit-focused builds can deal massive burst damage in late game.

**Note**: Each upgrade has multiple effects listed in its name (e.g., "Crit Chance/Damage" affects both crit chance AND crit damage). The "first value" and "second value" refer to these separate effects.

#### Infernal Card System

Infernal cards (Level 4 cards) provide powerful global bonuses that scale with your collection:

```
INFERNAL MULTIPLIER CALCULATION:
  = (1 + 0.04 × arch_specific_infernal_count 
       + 0.002 × total_infernal_count_all_archs)
  × (1 + hades_idol_bonus)

Each Infernal card's effect = base_effect × infernal_multiplier

HADES IDOL SCALING:
  hades_bonus = 0.000045 × hades_idol_level
  Maximum bonus: 0.3 (30%) at level 6666
```

**Example Calculation**: 
- You have 5 Arch-specific Infernal cards
- You have 20 total Infernal cards across all Archs
- Your Hades Idol is level 3000

Multiplier = (1 + 5×0.04 + 20×0.002) × (1 + 3000×0.000045)
           = (1 + 0.20 + 0.04) × (1 + 0.135)
           = 1.24 × 1.135
           = 1.4074 (40.74% boost to that card's effect)

#### 32-Bit Float Drift Emulation

GameMaker Studio uses 32-bit IEEE-754 floating-point arithmetic, which introduces microscopic rounding errors. The simulator must replicate these exactly to predict hit-to-kill breakpoints:

```
BANKER'S ROUNDING WITH DRIFT:
  1. Add microscopic drift (±0.000001) to the calculated value
  2. Apply banker's rounding (round to nearest even)
  3. Result matches GameMaker's internal calculations

EXAMPLE - Max Stamina:
  Calculated: 245.00000000
  With drift:  245.00000100 (upward drift)
  Rounded:     245
  
  Without drift emulation, we might get 244, causing the 
  simulator to predict failure when the game would succeed!

UI DISPLAY TRUNCATION:
  GameMaker subtracts 0.000001 before truncating to 2 decimals
  This prevents display bugs like "2.00" showing as "2.01"
```

**Why This Exists**: The difference between 244.999999 and 245.000001 can mean the difference between killing a block in 3 hits vs 4 hits. Over 24 blocks per floor, these rounding errors compound significantly.

**Hard-Coded Constraints**:
- **Base stat caps**: Str/Agi = 50, Per/Int/Luck = 25, Div/Corr = 10
- **"Exp Gain/All Stat Cap Inc." upgrade #45**: Raises ALL caps by +5 (single-level purchase)
- **Geoduck Legendary Fish T1 tribute cap**: 
  - Ascension 0: 50% (**TODO**: Need player data confirmation, currently assumed 50%)
  - Ascension 1: 50%
  - Ascension 2: 75%

---

### 4.2 Block Stats Generator (`public/core/block.py`)

**Purpose**: Calculate HP, armor, XP, and fragment yields for each block instance

**Key Responsibilities**:
- Apply floor-based scaling multipliers
- Handle card bonuses (HP reduction, yield increases)
- Apply Ascension restrictions
- Emulate known GameMaker bugs

#### Floor Scaling Algorithm

Block HP and armor scale at specific floor thresholds. The game has **documented bugs** that the simulator preserves for accuracy:

```
FLOOR SCALING SEQUENCE:
  Floor 100: HP ×2, Armor ×1.5
  Floor 150: HP ×2, Armor NOT scaled (BUG - armor should scale here)
  Floor 200: HP ×2, Armor ×1.5
  Floor 250: HP ×2, Armor ×1.5
  Floor 300: HP ×2, Armor ×1.5
  Floor 300: HP ×2, Armor ×1.5 (BUG - this line triggers TWICE! Should be fixed in IoM update v2.2)
  Floor 350: HP ×2, Armor ×1.5
  Floor 400: HP ×2, Armor ×1.5
  Floor 450: HP ×2, Armor ×1.5
  Floor 500: HP ×2, Armor ×1.5
```

**Known Issues**: 
- Floor 150 bug: Armor scaling is skipped (HP doubles but armor stays same) - unclear if intentional
- Floor 300 bug: The scaling code triggers twice (HP quadruples, armor gets ×2.25 instead of ×1.5) - **confirmed bug, will be patched by developer**
- Simulator status: **Preserves both behaviors for accuracy** - Floor 300 fix will be removed when game is patched

#### Card Multipliers

Block cards reduce block HP while increasing rewards:

```
CARD LEVEL EFFECTS:
  Level 1 (Base):       HP ×0.90 (-10%), XP/Loot ×1.10 (+10%)
  Level 2 (Gilded):     HP ×0.80 (-20%), XP/Loot ×1.20 (+20%)
  Level 3 (Polychrome): HP reduced by (35% + "Poly Card Bonus" upgrade #41)
                        XP/Loot increased by same percentage
                        
                        The "Poly Card Bonus" upgrade can add an additional +15%
                        (single-level purchase: +15%)
                        
                        Maximum effect: 50% HP reduction, 50% reward increase
                        
  Level 4 (Infernal):   Keeps all Polychrome block bonuses
                        PLUS adds unique global stat bonus
                        (varies by block type: +damage, +gleaming chance, +crit, etc.)
                        Global bonus scales with Infernal Multiplier system
```

**Progression Impact**: 
- Cards make blocks progressively easier to kill while increasing rewards
- Essential for late-game where block HP becomes astronomical
- The "Poly Card Bonus" upgrade (#41) is one of the highest-impact purchases in the game

---

### 4.3 Skills Manager (`public/core/skills.py`)

**Purpose**: Track ability cooldowns, active durations, and auto-casting

**Key Mechanics**:

#### Ability Instacharge Cascade

When an ability comes off cooldown and auto-casts, it has a chance to instantly recharge and cast again:

```
INSTACHARGE ALGORITHM:
  chain_count = 0
  
  WHILE cooldown is ready AND chain_count < 100:
    1. Ability activates (grants charges)
    2. Cooldown resets to normal duration
    3. Roll against instacharge_chance:
       - SUCCESS: Cooldown instantly resets to 0 → loop continues
       - FAILURE: Break out of loop
    4. chain_count++
  
  END WHILE
```

**Why Hard Cap at 100**: 
- Prevents infinite loops if insta-charge chance reaches 100% through bugs/exploits
- In practice, even 50% insta-charge rarely chains beyond 5-10 casts
- The cap is purely a safety measure

#### Three Abilities

1. **Flurry** (Time-Based)
   - Duration: 5s base
   - Effect: Attack speed multiplier + flat stamina refund on cast
   - Timer: Decrements in real-time

2. **Enrage** (Charge-Based)
   - Charges: 5 base
   - Effect: Additive +20% base damage + crit damage boost
   - Consumption: One charge per hit landed

3. **Quake** (Charge-Based)
   - Charges: 5 base
   - Effect: AoE splash to all remaining blocks on floor
   - Each block rolls independent crits

**Known Bug**: "Flat Dmg/Enrage Cooldown" upgrade #32 is intended only for Enrage but currently applies to all three abilities.

---

### 4.4 Floor Map Generator (`public/engine/floor_map.py`)

**Purpose**: Procedurally generates 24-slot mining floors with probabilistic block spawning

**Algorithm**: Top-Down Binomial Rolling

Each of the 24 slots on a floor independently rolls for blocks, checking highest rarity first:

```
FOR each of 24 slots:
  FOR each rarity in [Divine, Mythic, Legendary, Epic, Rare, Common, Dirt]:
    Roll random number from 1 to spawn_chance
    IF roll == 1:
      Spawn this rarity block
      BREAK (move to next slot)
    ENDIF
  ENDFOR
ENDFOR
```

**Key Points**:
- Higher rarities are checked first, so they "steal" slots from lower rarities
- Each slot has independent rolls (no global "budget" for rarity distribution)
- Slots remain empty if all rarity checks fail
- Only boss/gauntlet floors are guaranteed to have all 24 slots filled (hard-coded layouts)

**Hard-Coded Spawn Rates** (Floor 100-149 example):

The spawn probability arrays are organized by floor brackets. Format: `[Dirt, Common, Rare, Epic, Legendary, Mythic, Divine]` where each number represents a "1-in-X" chance.

**Source**: These exact spawn rates were provided by the IoM game developer (Alex) from the game code after the v2.1.6 fix was released, ensuring 1:1 accuracy with the live game.

```
FLOOR BRACKETS:
  Floor 150+:    [3, 6, 6, 6, 6, 10, 15]
    - Dirt: 1-in-3 (33%)
    - Common: 1-in-6 (16.7%)
    - Divine: 1-in-15 (6.7%)
  
  Floor 100-149: [3, 6, 7, 7, 7, 14, 30]
    - Dirt: 1-in-3 (33%)
    - Common: 1-in-6 (16.7%)
    - Divine: 1-in-30 (3.3%)
  
  ... (12 total brackets from Floor 1 to Floor 150+)
```

**Special Floor Overrides**:
- Boss floors: 11, 17, 34, 49, 74, 99, etc.
- Mixed gauntlet floors with exact predefined layouts
- Always spawn full 24 blocks (no empty slots)

**Ascension Failsafes**:
- Pre-Asc1: Divine blocks downgrade to Mythic
- Pre-Asc2: Tier 4 blocks downgrade to Tier 3

**Performance**: O(24) linear scan per floor. Unavoidable given sequential spawning logic.

---

### 4.5 Combat Simulator (`public/engine/combat_loop.py`)

**Purpose**: Micro-tick combat simulation with hit-by-hit damage calculation

This is the **most performance-critical** component. Runs millions of iterations during optimization.

#### Loop Hoisting Optimization

Before running millions of combat iterations, the simulator caches all calculated player properties into local variables:

```
BEFORE COMBAT LOOP STARTS:
  cached_damage = player.damage (calculated once)
  cached_crit_chance = player.crit_chance (calculated once)
  cached_armor_pen = player.armor_pen (calculated once)
  ... cache ~30 more properties ...

INSIDE COMBAT LOOP (runs millions of times):
  FOR each hit:
    damage_dealt = cached_damage - effective_armor
    IF random() < cached_crit_chance:
      damage_dealt *= cached_crit_multiplier
    ENDIF
  ENDFOR
```

**RNG Implementation**: 
- Uses Python's built-in `random.random()` which implements the Mersenne Twister algorithm
- Each simulation run calls `random.seed()` with no arguments, which seeds from system time/entropy
- This ensures true randomness across all parallel worker simulations
- No pseudo-randomness issues - each of the thousands of Monte Carlo runs has independent, non-repeating RNG

**Impact**: 
- Without caching: Every hit recalculates damage from scratch (30+ dictionary lookups)
- With caching: Every hit uses pre-calculated values (simple variable access)
- **Result**: 3-5× speedup, critical for Monte Carlo simulations

#### Nested Crit System

Critical hits roll sequentially, with each tier checking if it upgrades to the next:

```
FUNCTION roll_crit(is_enrage_active):
  Roll against crit_chance:
    IF SUCCESS:
      crit_multiplier = (enraged_crit IF enrage_active ELSE normal_crit)
      
      Roll against super_crit_chance:
        IF SUCCESS:
          Roll against ultra_crit_chance:
            IF SUCCESS:
              RETURN crit_multiplier × super_mult × ultra_mult, "ULTRA"
            ELSE:
              RETURN crit_multiplier × super_mult, "SUPER"
            ENDIF
        ELSE:
          RETURN crit_multiplier, "CRIT"
        ENDIF
    ELSE:
      RETURN 1.0, "NORMAL"
    ENDIF
END FUNCTION
```

**Key Point**: Crit Damage Multipliers compound multiplicatively. An Ultra Crit with 2× base crit, 2× super, and 3× ultra = 2 × 2 × 3 = **12× damage** in a single hit!

#### Micro-Tick Combat Loop

The combat simulation runs in "true time" with sub-second precision:

```
COMBAT LOOP (while stamina > 0 AND blocks_remaining > 0):

  1. CALCULATE TICK DURATION (happens EVERY HIT):
     time_passed = 1.0 / current_attack_speed
     
  2. ADVANCE TIME (happens EVERY HIT, not just on block death):
     total_time += time_passed
     crosshair_timer += time_passed
     
  3. CROSSHAIR AUTO-TAP (Check if timer threshold reached):
     WHILE crosshair_timer >= CROSSHAIR_SPAWN_INTERVAL:
       crosshair_timer -= CROSSHAIR_SPAWN_INTERVAL
       Roll for auto-tap chance
       IF auto-tap success:
         Roll for gold crosshair (bonus damage + gold multiplier)
         Deal crosshair_damage to current block
       ENDIF
       
       Note: This 3.5s spawn interval is a rough estimate from limited 
       empirical measurements, not from game code. The actual in-game 
       value may differ slightly.
     ENDWHILE
     
     IF block died to crosshair: 
       BREAK (skip melee attack for this tick)
     ENDIF
     
  4. ABILITY COOLDOWNS (tick abilities with time_passed):
     skills.tick(time_passed)
     IF Flurry restored stamina:
       stamina += stamina_restored (capped at max)
     ENDIF
     
  5. PLAYER MELEE ATTACK:
     stamina -= 1.0
     crit_multiplier, crit_type = roll_crit(enrage_active)
     damage = MAX(1.0, (base_damage - effective_armor) × crit_multiplier)
     block_hp -= damage
     
  6. QUAKE AOE (if charges available):
     IF quake_charges > 0:
       FOR each background_block on current floor:
         background_block.hp -= roll_quake_damage()
       ENDFOR
       quake_charges -= 1
     ENDIF
     
  7. BLOCK DEATH & REWARDS:
     IF block_hp <= 0:
       Collect fragments, XP, trigger mods
       Spawn next ore in PATH_ORDER
       IF all 24 blocks cleared:
         Move to next floor
       ENDIF
     ENDIF

END LOOP
```

**Key Timing Mechanics**:
- Time advances with **every hit** (not just block deaths)
- Attack speed determines tick rate: faster attacks = more ticks per second
- Crosshair timer accumulates continuously and can trigger multiple spawns in one tick if enough time passed
- Ability cooldowns tick down in real-time based on `time_passed` for each hit

**Design Decisions**:
- Crosshair spawns checked every tick (can spawn multiple per tick if timer >= interval)
- Stamina cost: 1.0 per hit, 0.0 to start mining an ore
- Overkill damage is wasted (doesn't carry over to next block)
- Armor applies before crits for melee/quake/crosshairs (consistent formula)

---

#### Speed Pool Mechanic

Speed Mods don't grant a timed buff - they add charges to a pool:

```
SPEED MOD TRIGGER (when killing a block with Speed Mod):
  speed_pool += speed_mod_gain
  
  Where speed_mod_gain is calculated as:
    base = (10 + 15 × Block_Bonker_Speed_skill) 
         × (1 + "All Mod Multipliers" upgrade #55 
              + Corr stat × (0.01 + "[Corruption Buff]" #52 second value))
    
  Block Bonker is a skill tree node (0 if not purchased, 1 if purchased)
  
  Value range:
    - Minimum (no upgrades/skills): 10 charges
    - With Block Bonker only: 25 charges
    - Maximum (all maxed): 34 charges
      = 25 × (1 + 10×0.02 + 14 × (0.01 + 10×0.0002))
      = 25 × (1 + 0.20 + 14 × 0.012)
      = 25 × 1.368
      = 34.2 → 34 (after rounding)

DURING COMBAT (every attack):
  IF speed_pool > 0:
    current_attack_speed ×= 2.0 (double speed!)
    speed_pool -= 1 (consume one charge)
  ELSE:
    current_attack_speed = base_attack_speed
  ENDIF
```

**Speed Pool Accumulation Mechanics**:

The Speed Pool behavior changes dramatically during progression:

**Speed Mod Chance** (probability to trigger Speed Mod on block kill):
- Affected by: "All Mod Chances" upgrades (#24, #44)
- Agi stat × (0.002 + "Max Sta/Mod Chance" #26 second value)
- Luck stat × 0.002
- Div4 Infernal card

**Early/Mid Game**: Low mod chance means speed charges are gained slower than consumed, pool drains during combat.

**Late Game**: After acquiring key mod chance upgrades and sufficient Luck stat, speed charges accumulate faster than consumption. This creates an ever-growing pool that eventually provides permanent 2× attack speed, as new charges are gained faster than they can be spent.

This transition point occurs after reaching sufficient Arch level (for stat points) and purchasing critical mod chance upgrades.

---

## 5. Frontend: React Application

### 5.1 State Management (`src/store.js`)

**Technology**: Zustand with IndexedDB persistence

**Why Zustand Over Redux**:
- Simpler API (no actions/reducers/dispatch)
- Better TypeScript support
- Smaller bundle size (~1KB vs ~15KB)
- Direct state mutations (no immutability constraints)

**Key State Categories**:

```javascript
{
  // Global Settings
  theme: 'dark' | 'light',
  activeTab: 'welcome' | 'setup' | 'simulations' | ...,
  cpuProfile: 'eco' | 'balanced' | 'max',
  
  // Player Data
  baseStats: { Str: 0, Agi: 0, ... },
  upgradeLevels: { 3: 1, 8: 1, ... },
  cards: { dirt1: 0, common1: 1, ... },
  externalUpgrades: { hestia: 0, hades: 0, ... },
  
  // Profiles System
  profiles: [{ name: 'Main', data: {...} }],
  
  // Simulation Results
  optimizerResults: [...],
  pathfinderTimeline: [...],
  synthesisResults: null,
  
  // Sandbox (temporary testing)
  sandboxStats: { Str: 50, ... },
}
```

**Persistence Strategy**:

```javascript
// Uses IndexedDB to bypass 5MB localStorage limit
const idbStorage = {
  getItem: async (name) => await get(name) || null,
  setItem: async (name, value) => await set(name, value),
}

// Partial persistence (excludes ephemeral tour state)
persist(
  (set, get) => ({ /* state and actions */ }),
  {
    name: 'iom-arch-store',
    storage: createJSONStorage(() => idbStorage),
    partialize: (state) => ({
      ...state,
      tourState: undefined  // Don't persist guided tour progress
    })
  }
)
```

**Why IndexedDB**: Allows storing 100+ MB of optimization results and stamina traces without browser limits.

---

### 5.2 Component Architecture

**UI Theme System**: The application supports both light and dark modes with theme state persisted in Zustand/IndexedDB. Tailwind CSS custom theme variables (defined in `tailwind.config.js`) provide consistent color schemes across all components. Theme toggle is available in the navigation header, and AG Grid tables dynamically adapt via CSS variable injection (see `Simulations.jsx` for grid theme integration).

**Tab-Based Navigation** with 6 main sections:

```
App.jsx (Root)
├── TourGuide.jsx (Overlay, conditional)
├── Tab Navigation
│   ├── Welcome.jsx
│   ├── PlayerSetup.jsx (4 sub-tabs)
│   ├── CalculatedStats.jsx
│   ├── BlockCompendium.jsx
│   ├── Simulations.jsx (7 sub-tabs)
│   │   ├── OptimizerTab.jsx
│   │   ├── PathfinderTab.jsx
│   │   ├── ForecasterTab.jsx
│   │   ├── SandboxTab.jsx
│   │   ├── DuelTab.jsx
│   │   ├── SynthesisTab.jsx
│   │   └── ResultsDashboard.jsx
│   └── About.jsx
└── BackToTop button (floating)
```

**Deep Linking**: URL hash reflects active tab for browser back/forward support

```javascript
// Examples
#/welcome
#/setup/stats
#/simulations/optimizer
#/about
```

#### 5.2.1 ErrorBoundary (Global Safety Net)

**Purpose**: React Error Boundary that catches and gracefully handles fatal JavaScript errors

**Implementation**: Class component wrapping the entire App.jsx tree to prevent full application crashes

**Error Handling Strategy**:
- Catches uncaught exceptions in any child component
- Displays user-friendly error screen with stack trace
- Provides two recovery options:
  1. **Refresh Page**: Soft reset (preserves IndexedDB state)
  2. **Hard Reset**: Wipes all stored data and reloads

**Common Trigger Scenarios**:
- Pyodide worker runs out of browser memory (large optimization runs)
- Corrupted IndexedDB state from interrupted persistence
- WebAssembly initialization failures
- Invalid state mutations causing render crashes

**Design Decision**: Intentionally uses class component (not hooks) to leverage React's `componentDidCatch` lifecycle method, which is unavailable in functional components.

**Location**: `src/components/ErrorBoundary.jsx` (wraps `<App />` in `main.jsx`)

---

#### 5.2.2 TourGuide (Interactive Onboarding)

**Purpose**: Guided tour system powered by React Joyride for first-time user onboarding

**Implementation**: Conditional overlay component that provides step-by-step walkthroughs across different tabs and features

**Tour Coverage** (3 main tours, 75+ total steps):

1. **Player Setup Tour** (~25 steps):
   - Profile management basics
   - JSON import/export
   - Global settings (Ascension, Arch Level, Max Floor)
   - Base stats allocation
   - Internal upgrades with "Hide Maxed" toggle
   - Block cards and Infernal multiplier
   - External upgrades (idols, pets, skills)
   - Stat Troubleshooter intro

2. **Optimizer & Synthesis Tour** (~35 steps):
   - Optimization goal selection
   - Target fragment/block configuration
   - Stat constraint locking system
   - Time limit and precision gauge
   - Scout run workflow
   - Synthesis tab and build history
   - ResultsDashboard deep dive (Build/Data/ROI tabs)
   - Meta-Build history log
   - Card drop time calculator
   - Collateral loot breakdown

3. **Sandbox Tour** (~15 steps):
   - Breakpoint concept explanation
   - Isolated stat editor
   - Floor scaling
   - Minimum hits filter
   - Baseline locking and diff visualization
   - Target filters
   - Detailed crit toggles

**Key Features**:

- **Smart Navigation**: Tour automatically switches tabs and clicks buttons when needed
- **Conditional Progression**: "Next" button locks until user performs required action (e.g., "Click this tab first")
- **DOM Verification**: Skips missing elements to prevent crashes if component isn't rendered
- **Perfect Scrolling**: Centers tour targets without breaking overflow containers
- **Custom Tooltips**: Conditional button disabling with helpful tooltips ("Wait for completion")
- **Persistent State**: Tour progress NOT saved to IndexedDB (intentional - fresh tour on each session)

**User Control**:
- Skip tour at any time
- Restart tours from About tab
- Tours are opt-in (not auto-started)
- Can freely interact with UI during tour

**Implementation Details**:
- Library: React Joyride 3.1.0
- Location: `src/components/TourGuide.jsx`
- Tour steps defined via `add()` helper function with conditional logic
- Uses `data-tour` attributes for target element selection
- Zustand state: `tourActive`, `tourName`, `tourStepIndex`

**Design Decision**: Tours designed for "unlocked" interaction - users can click anywhere, type values, and explore freely. The tour tooltip simply follows along and provides guidance without blocking UI access.

---

#### 5.2.3 Welcome Tab

**Purpose**: Onboarding and workflow guide for new users

**Key Features**:
- **Preset Templates**: Three one-click builds (Early/Mid/Late game) that populate all player data
- **Workflow Guidance**: Clear 5-step path from setup to optimization
- **Quick Tips**: Collapsible section explaining "Suicide Farming", Stat Plateaus, Auto-Save, and Stat Locks
- **Ko-fi Donation Link**: Supports developer

**User Flow**:
1. User arrives at app → sees welcome screen
2. Can immediately test with preset template OR proceed to manual setup
3. Guided through optimal analysis workflow
4. Tips provide context for counter-intuitive mechanics

**UI Enhancements**:
- Fade-in animation on mount
- Responsive grid with hover states on preset buttons
- Collapsible details with arrow rotation
- Dark mode support throughout

---

#### 5.2.4 PlayerSetup Tab

**Purpose**: Comprehensive player configuration interface with 4 sub-tabs

**Sub-Tabs**:
1. **Base Stats (📊)**: Allocate stat points (Str, Agi, Per, Int, Luck, Div, Corr) with budget system based on Arch Level
2. **Internal Upgrades (⬆️)**: Manage 40+ upgrades with "Hide Maxed" toggle and dynamic cost calculations
3. **External Upgrades (🌟)**: Configure idols, pets, skills, bundles, Arch Ability card
4. **Block Cards (🎴)**: Manage 36 block cards across 9 types and 4 tiers with Infernal multiplier display

**Key Features**:

**Profile Management System**:
- Create, load, save, rename, delete multiple profiles
- Deep equality comparison detects unsaved changes
- Visual "Unsaved" badge with diff modal showing granular changes
- Profile sync copies upgrades/cards between profiles while preserving stats
- Field-level undo in diff viewer

**Profile System Details**:

1. **Profile Storage Structure**:
   ```javascript
   profile = {
     id: 'prof_1234567890',  // Unique timestamp-based ID
     name: 'My Build',         // User-editable display name
     data: {                   // Snapshot of entire player state
       asc1_unlocked, asc2_unlocked, arch_level, current_max_floor,
       base_stats, upgrade_levels, external_levels, cards, ...
     }
   }
   ```

2. **Profile Operations**:
   - **Create**: Captures current workspace state into new profile
   - **Load**: Replaces workspace with saved profile data (sets activeProfileId)
   - **Save**: Updates existing profile with current workspace snapshot
   - **Rename**: Updates display name (preserves data)
   - **Delete**: Removes profile; auto-loads first remaining profile if deleting active profile
   - **Sync**: Selective merge - copies upgrades/cards from workspace into profile while preserving profile's base stats

3. **Unsaved Changes Detection**:
   - Uses deep equality comparison between workspace and active profile
   - Compares all state fields (stats, upgrades, cards, settings)
   - Visual badge appears when workspace differs from saved profile
   - Diff modal shows field-by-field comparison with "Revert" buttons

4. **Smart Auto-Matcher** (JSON Import Healing):
   - When importing JSON, performs semantic comparison against existing profiles
   - If imported data mathematically matches a saved profile → auto-links to that profile
   - Prevents false "Unsaved" badges from reference inequality
   - Implementation: Deep equality check on all numeric fields

5. **Storage Limits**:
   - No hard limit on profile count (stored in IndexedDB)
   - Practical limit: ~50-100 profiles before UI performance degrades
   - Each profile snapshot: ~5-10 KB (compressed in IndexedDB)

6. **Use Cases**:
   - **Multi-Build Testing**: Save Farm build, Load Push build, compare results
   - **Ascension Snapshots**: Save pre-Ascension state, test Ascension 1 changes
   - **Build Variants**: Create base build, then save minor variations (Glass Cannon vs Balanced)
   - **Backup/Restore**: Export JSON before risky changes, re-import if needed

**JSON Import/Export**:
- Human-readable exports with upgrade names
- Drag-and-drop or file browser import
- Strict validation (app-generated only)
- Sanitizes and preserves all state

**Data Validation**:
- Input clamping to caps
- Conditional rendering based on Ascension (Div locked pre-Asc1, Corr pre-Asc2)
- Dynamic max levels (Gem Upgrades #3-5 capped by Arch Level)
- Floor-based unlock gating
- Ascension simulation prompts to reset internal upgrades

**UI Enhancements**:
- Responsive grids (2-4 columns for stats, 3-9 for cards)
- Pixelated sprite rendering for retro aesthetic
- -5/+5/Max buttons for quick adjustments
- Cost display with k/m/b formatters
- Animated modal with backdrop blur
- Tour integration for guided onboarding

**Role**: Central configuration hub ensuring validated, consistent player state for all downstream simulations

---

#### 5.2.5 CalculatedStats Tab & Stat Troubleshooter

**Purpose**: Real-time display of derived combat statistics calculated from player configuration

**User Flow**:
1. User inputs base stats, upgrades, and cards in PlayerSetup tab
2. calc_worker.js automatically recalculates all derived stats (damage, crit chances, max stamina, etc.)
3. CalculatedStats tab displays these values in real-time
4. User compares displayed values against in-game Arch Stats UI to verify accuracy

**Stat Troubleshooter Feature**:

The Stat Troubleshooter is a collapsible diagnostic tool that helps users identify data entry mistakes or missing inputs:

**How It Works**:
- User selects a stat category (e.g., "Damage", "Max Stamina", "Crit Chances")
- Tool displays detailed breakdown showing:
  - Base values
  - Every upgrade contributing to that stat (with calculated contribution, e.g., "+50 Flat", "+15% Multi")
  - Every card contributing to that stat
  - Every external upgrade (idols, skills, pets)
  - Base stats (Str, Agi, etc.) with their calculated effects
- User can then compare their inputs against the final calculated values shown in the main CalculatedStats display below

**Use Cases**:
- **Verification**: User notices in-game damage is 1250 but calculator shows 1180 → Opens troubleshooter → Discovers they forgot to input "Damage Up/Armor Pen" upgrade #36
- **Understanding**: User wonders why their crit damage changed → Opens troubleshooter → Sees Str stat contributes via (0.03 + "Damage Up/Crit Dmg Up" upgrade #47 second value) multiplier
- **Debugging**: User imported a JSON profile or manually edited data → Uses troubleshooter to verify all upgrades transferred correctly and no data was lost or corrupted

**Implementation Details**:
- Located in `src/components/CalculatedStats.jsx`
- Uses `TROUBLESHOOT_MAP` to define which upgrades/cards affect each stat category
- Dynamically shows only relevant inputs based on selected stat
- Includes special formatting for floor-capped bonuses (e.g., Block Bonker at floor 100)

**UI Enhancements**:
- Collapsible by default to reduce clutter
- Clear call-to-action: "Click here if your UI numbers don't match the game!"
- Dropdown selector for easy stat category selection
- Color-coded contribution amounts
- Integrated into guided tour system

---

#### 5.2.6 BlockCompendium Tab

**Purpose**: Reference encyclopedia showing statistical properties of all block types

**Key Features**:
- **AG Grid Table**: Sortable, filterable, resizable columns with pinned Block/Icon columns
- **Modified Stats Toggle**: Switch between baseline wiki stats and player-modified calculations
- **Floor-Level Calculator**: See how stats scale at specific floors
- **Smart Armor Display**: Tooltip shows base armor when effective differs due to armor pen

**Data Display**:
- Block icons (pixelated rendering)
- HP, Armor, XP Yield, Fragment Yield, Fragment Type
- Dynamic calculations apply player multipliers, card effects, floor scaling

**UI Enhancements**:
- 700px fixed height with custom centered styling
- Dark/light mode support (Quartz theme)
- Reset Filters button
- Credits IoM Wiki Team with source link
- Responsive controls (row → column on mobile)

**Role**: Quick reference for block stats, helps users understand optimization targets

---

#### 5.2.7 Simulations Tab (7 Sub-Tabs)

The Simulations tab contains the core optimization and analysis tools:

##### 5.2.7.1 OptimizerTab

**Purpose**: Monte Carlo stat optimizer using Successive Halving algorithm

**Key Algorithms**:
- **3-Phase Successive Halving**: Coarse → Fine → Exact search narrowing
- **Adaptive Step Profiling**: Dynamic granularity based on dimensional complexity
- **Multi-threaded**: EngineWorkerPool for parallel simulations

**Input Parameters**:
- Optimization target: Max Floor Push, Max EXP, Fragment Farming, Card Farming
- Time limit (10-600 seconds)
- Stat constraints/locks (exact/min/max/range)
- Allow unspent points (crippled builds)

**Output/Visualization**:
- Optimal stat distribution
- Phase convergence chart (hill climb)
- Floor distribution histogram
- Performance metrics (avg/max/worst)
- Loot breakdown by fragment type
- Full ResultsDashboard visualizations (see [Section 5.2.7.3](#5273-resultsdashboard-shared-component))

**Workflow Role**: Primary entry point; results feed Synthesis for refinement

**Implementation Details**: See [Section 6.1](#61-multi-phase-successive-halving) for detailed explanation of the Successive Halving algorithm, ranking logic, and seed injection.

---

##### 5.2.7.2 SynthesisTab

**Purpose**: Merges multiple optimizer runs to find true global optimum

**Key Algorithms**:
- **3-Round Tournament**: Scout (10 runs) → Filter (40 runs) → Marathon (450 runs)
- **Hybrid Generation**: Statistical center + permutations (±1/2/3 points)
- **Algorithm Immunity**: User-selected runs always survive culling
- **Ceiling Score**: Average of top 3-5 floor results (per build) breaks RNG ties

**Input Parameters**:
- Selected historical optimizer runs (2-10 recommended)
- Filter by optimization target
- Auto-managed precision (~500 total sims)

**Output/Visualization**:
- Meta-Build stat distribution
- Performance comparison chart (history vs meta-build)
- Meta-Build History Log (AG Grid)
- Full ResultsDashboard visualizations (see [Section 5.2.7.3](#5273-resultsdashboard-shared-component))

**Workflow Role**: Final refinement step after running Optimizer 2-5 times with different constraints

**Implementation Details**: See [Section 6.3](#63-synthesis-tab-hybrid-generation--tournament) for detailed explanation of hybrid generation, permutation neighborhood, 3-round tournament elimination, ceiling score calculation, and algorithm immunity.

---

##### 5.2.7.3 ResultsDashboard (Shared Component)

**Purpose**: Unified results display embedded in both OptimizerTab and SynthesisTab

**3-Tab Interface**:
1. **Build Tab**: Stat distribution with apply buttons (Global/Sandbox/Duel)
2. **Data Tab**: 
   - Performance: Push probability, yield metrics, hill climb chart
   - Cards: Drop time estimates with Gamma distribution probabilities
   - Loot: Collateral fragment bar chart
   - Wall: Floor histogram with stamina depletion traces
3. **ROI Tab**: 4 ranked lists (Stats, Upgrades, Externals, Cards) with apply buttons

**Key Features**:
- **ROI Analyzer**: Runs marginal +1 simulations for every stat/upgrade
- **Statistical Projections**: Gamma/Erlang for card drop probabilities
- **Interactive Calculators**: Level-up time, card drop time, push probability

**Input Parameters**:
- ROI precision (15/30/50/100 runs)
- Fragment count for card drops
- Current/Target EXP
- Selected block for drops

**Limitations**:
- **ROI Tab Disabled for Floor Push**: When optimization target is `highest_floor`, ROI analyzer is unavailable because floor progression relies on discrete breakpoints where +1 to a stat rarely shows immediate gains. Users should use ForecasterTab for ROI analysis on floor push builds.

**Workflow Role**: Embedded analysis component; ROI results link directly to Player Setup with auto-scroll

---

##### 5.2.7.4 DuelTab

**Purpose**: Head-to-head comparison with deep 500-run telemetry

**Key Features**:
- **Fixed 500 Runs**: High-precision Monte Carlo per build
- **20+ Telemetry Metrics**: Swings, damage types, refunds, ability casts
- **Side-by-Side Comparison**: Highlights winner and % difference

**Input Parameters**:
- Optimization target
- Target fragment/block (if applicable)
- Build A stats (manual, or imported from Global Base Stats/Optimizer/Synthesis/Sandbox)
- Build B stats (manual, or imported from Global Base Stats/Optimizer/Synthesis/Sandbox)

**Output/Visualization**:
- Comprehensive telemetry table
- Color-coded winners (green) and losers
- Metrics: max floor, yield rates, stamina stats, damage breakdown

**Workflow Role**: Validate micro-adjustments or compare completely different strategies

**Implementation Note**: DuelTab runs fixed 500-simulation Monte Carlo for each build using EngineWorkerPool for parallelization (same infrastructure as OptimizerTab). Unlike Optimizer/Synthesis, it doesn't use elimination algorithms—all 500 runs execute for both builds to provide high-confidence telemetry comparison.

---

##### 5.2.7.5 SandboxTab

**Purpose**: Interactive block hit calculator for real-time breakpoint exploration

**Key Features**:
- **Deterministic Math**: Pure calculation (no RNG)
- **Baseline Diff System**: Lock reference state, see colored deltas
- **Comprehensive Metrics**: 
  - HP, Armor, EDPS (Expected Damage Per Swing), Enraged EDPS
  - Regular Hit damage and Enraged Hit damage
  - Avg Hits to Kill (calculated from EDPS, accounts for all crit types)
  - Max Hits to Kill (based on regular (or enraged) non-crit damage only)
  - Optional toggle: Detailed damage amounts for each crit type (Crit/sCrit/uCrit for both regular and enraged)

**Input Parameters**:
- Manual stat sliders with +5/-5/Max buttons
- Target floor (determines block stat scaling and which blocks are reachable)
- Minimum avg hits filter
- Show unreachable blocks toggle
- Show detailed crits toggle

**Output/Visualization**:
- AG Grid table with block stats and EDPS
- Color-coded diffs (green=better, red=worse) when baseline state is locked
- Optional detailed crit breakdowns

**UI Enhancements**:
- Sync with Global setup
- Push stats back to Global
- Send builds to Duel tab
- Real-time recalculation on any change

**Workflow Role**: Fine-tune builds by manually exploring 1-point stat adjustments

---

##### 5.2.7.6 ForecasterTab

**Purpose**: Future-state projection with hypothetical upgrade testing

**Two Modes**:
1. **Wall Breaker**: Test if you can reach target floor with upgrade purchases
2. **Economy Pivot**: Compare current vs reoptimized builds after upgrades (⚠️ Dev Mode only - not fully released)

**Key Algorithms**:
- Hybrid Monte Carlo + deterministic gauntlet math
- Smart caching (skips redundant MC when only floor changes)
- Shopping Cart System for cumulative upgrade testing
- ROI scanning ranks all available upgrades

**Input Parameters**:
- Wall Mode: Target floor, push budget, precision (100/500/1000 sims)
- Pivot Mode: Target fragment, strategy/ROI precision
- Cart items (stats, upgrades, cards, externals)

**Output/Visualization**:
- Push probability analysis (50%/90% confidence)
- Required runs calculation
- Status Quo vs Meta Pivot comparison
- Shopping lists ranked by effectiveness
- Hardest block analysis

**Workflow Role**: Used after Optimizer/Synthesis to plan next upgrades before spending resources

**Implementation Details**: See [Section 6.4](#64-forecaster-tab-shopping-cart--recalculation-logic) for detailed explanation of shopping cart system, two-phase analysis, smart recalculation triggers, and ROI scanning logic.

---

##### 5.2.7.7 PathfinderTab

**Purpose**: Progression timeline simulator (Macro-Stepper)

**Key Features**:
- **Event-Driven Simulation**: Arch Level ups, Max Floor increases, upgrades, card drops, card upgrades (fragments)
- **Dual-Track Optimization**: Separate Farm and Push builds
- **Opportunity Cost Analysis**: XP vs Fragments decision-making
- **Multi-Floor Push Optimizer**: Wilson Score confidence intervals
- **Interactive Timeline**: 4000px master chart with event nodes

**Input Parameters**:

**Starting Point** (Choose one):
- **Fresh Asc2 Start (Template)**: Choose from preset configurations (Founder_Asc2_Start or F2p_Asc2_Start)
- **Current Workspace State**: Uses global player state from Player Setup tab
  - Includes current fragments, card progress, EXP, and speed pool
  - User must manually enter fragment banks and card progress when using this mode
- **Node-Graph Snapshot**: Apply Player State from any event in a previous Pathfinder run
  - Loads exact state at that moment into workspace
  - Allows "leapfrogging" to simulate next progression segment

**Simulation Parameters**:
- Target Arch Level (not max floor - typically 5-10 levels ahead)
- Push Safety (Win Rate %): Minimum confidence threshold for floor push attempts
- Starting Arch Seconds (optional time offset)
- Auto-buy Gem Upgrades toggle

**Optimization Strategy** (Auto-managed):
- Min Win Rate requirement for max floor progression
- XP priority vs Fragment priority balancing for farm builds
- Opportunity cost analysis for upgrade timing

**Output/Visualization**:
- Interactive timeline with expandable events
- Build transitions (Farm ↔ Push)
- Resource accumulation curves
- Milestone predictions (card completions, idol levels)

**Workflow Role**: Long-term planning tool for entire Ascension progression

**Implementation Details**: See [Section 6.5](#65-simulated-annealing-pathfinder-optimizer) for the optimization algorithm and [Section 6.6](#66-pathfinder-macro-stepper) for detailed explanation of event-driven architecture, multi-floor push optimizer, and Wilson Score confidence intervals.

---

#### 5.2.8 About Tab

**Purpose**: Informational hub and community engagement

**Key Features**:

**Architecture Diagram**:
- Visual 5-layer architecture flowchart
- Shows 3-Phase Successive Halving
- Highlights True-Time Micro-Tick Engine
- Emphasizes 1:1 GML math emulation

**FAQ System** (4 collapsible sections):
- Crippled Farming (suicide farming paradox)
- 32-bit Float Drift (GameMaker precision)
- Stat Plateaus (whole-hit breakpoints)
- Build Duels & Telemetry guide

**Feedback Form**:
- Type dropdown (Bug/Feature/UI/General)
- Discord webhook routing to appropriate channels
- File attachments (.png, .jpg, .json)
- Fallback to GitHub issue if webhook unconfigured
- Color-coded Discord embeds

**Community Links**:
- Discord server invitation
- GitHub repository and releases
- Ko-fi developer support
- Beta testers wall of fame (7 contributors)

**UI Enhancements**:
- Two-column responsive layout (7/12 content, 5/12 sticky form)
- Loading states during submission
- Status notifications (success/error)
- Hover effects on all links

**Role**: Documentation, community building, and feedback collection

---

### 5.3 Data Flow Architecture

**Worker Architecture & Data Flow**:

The application uses separate worker systems for different simulation and analysis tools:

```
USER INPUT (Zustand State)
     |
     ├─→ [REAL-TIME UI FEEDBACK]
     │   calc_worker.js (single persistent instance)
     │    └─→ Pyodide → player.py
     │         └─→ Calculated stats displayed in UI (CalculatedStats component)
     │             └─→ Triggers on ANY state change (< 50ms latency)
     │
     ├─→ [OPTIMIZER TAB]
     │   User clicks "Optimize" → optimizer.js
     │    ├─→ Reads base player state from Zustand
     │    ├─→ Generates candidate grid (Backtracking/Successive Halving)
     │    ├─→ EngineWorkerPool (N parallel workers)
     │    │    └─→ engine_worker.js × N → Pyodide → combat_loop.py
     │    │         └─→ 3-Phase Tournament (15%/35%/50% budget)
     │    └─→ Best build → ResultsDashboard → User can apply or send to other tabs
     │
     ├─→ [SYNTHESIS TAB]
     │   User clicks "Synthesize" → SynthesisTab.jsx
     │    ├─→ Reads selected historical runs from Zustand
     │    ├─→ Calculates statistical center (centroid)
     │    ├─→ Generates permutation neighborhood (±1/2/3 radii)
     │    ├─→ EngineWorkerPool (N parallel workers)
     │    │    └─→ 3-Round Tournament: Scout (10) → Filter (40) → Marathon (450)
     │    │         └─→ Ceiling Score ranking (top 3-5 floors average)
     │    └─→ Meta-Build → ResultsDashboard → Meta-Build History Log
     │
     ├─→ [DUEL TAB]
     │   User clicks "Run Duel" → DuelTab.jsx
     │    ├─→ Reads Build A and Build B stats
     │    ├─→ EngineWorkerPool (N parallel workers)
     │    │    └─→ Fixed 500 runs per build (no elimination)
     │    │         └─→ Collects 20+ telemetry metrics
     │    └─→ Side-by-side comparison table with color-coded winners
     │
     ├─→ [FORECASTER TAB]
     │   User clicks "Analyze" → ForecasterTab.jsx (Wall Breaker Mode)
     │    ├─→ Reads global state + shopping cart items
     │    ├─→ Merges cart into effective state
     │    ├─→ [PHASE 1: Monte Carlo Baseline] (0-50% progress)
     │    │    └─→ EngineWorkerPool → N simulations → Floor distribution
     │    ├─→ [PHASE 2: Deterministic Gauntlet] (50-100% progress)
     │    │    └─→ calc_worker.js → Block stats at target floor
     │    │         └─→ Finds hardest block (highest avg_hits)
     │    │         └─→ ROI scan: Test +1 level for all upgrades
     │    └─→ Push probability + Shopping lists (4 ranked categories)
     │         └─→ User can apply cart items to global state or add from ROI lists
     │
     ├─→ [SANDBOX TAB]
     │   User edits manual stat sliders → SandboxTab.jsx
     │    └─→ calc_worker.js (deterministic math only)
     │         └─→ Block stats table with baseline diffs (if locked)
     │             └─→ Real-time recalculation on any slider change
     │
     └─→ [PATHFINDER TAB]
         User clicks "Run Pathfinder" → pathfinder_engine.js
          ├─→ Reads starting state (Template/Current/Snapshot)
          ├─→ Event-Driven Loop: Simulates level-ups, upgrades, card drops
          │    ├─→ At each decision point:
          │    │    └─→ Calls optimizer.js (Simulated Annealing variant)
          │    │         └─→ EngineWorkerPool for Farm/Push build optimization
          │    ├─→ Multi-Floor Push Optimizer (Wilson Score confidence)
          │    └─→ Jumps to nearest milestone (level/upgrade/card)
          └─→ Interactive timeline + Node-graph log → Export/Leapfrog
```

**Key Architectural Points**:

1. **Worker Isolation**: calc_worker and engine_worker never communicate directly
2. **Shared State**: All workflows read from the same Zustand state store
3. **Shared Infrastructure**: EngineWorkerPool reused across Optimizer/Synthesis/Duel/Forecaster/Pathfinder
4. **Smart Caching**: ForecasterTab caches Monte Carlo when only floor changes (see Section 6.4)
5. **Independent Tabs**: Each simulation tab manages its own execution state (not globally blocked)
6. **State Synchronization**: calc_worker triggers automatically; engine pool syncs once per job

**Worker Communication Patterns**:

```javascript
// ============================================================
// PATTERN 1: CALC WORKER (Real-time stat calculations)
// ============================================================
// Initialize once on app mount in App.jsx or store
calcWorker.postMessage({
  command: 'CALC_STATS',
  payload: { base_stats, upgrade_levels, cards, external_levels, ... }
});

// Calc worker responds with derived stats
calcWorker.onmessage = (e) => {
  if (e.data.type === 'CALC_RESULT') {
    store.setCalculatedStats(e.data.payload);
  }
};

// TRIGGER: React useEffect watches Zustand state changes
// Any change to base_stats, upgrade_levels, cards, or external_levels
// automatically triggers calc_worker to recalculate and update UI
// This provides instant feedback as user modifies player configuration

// Used by: PlayerSetup, CalculatedStats, SandboxTab, Forecaster (Phase 2)

// ============================================================
// PATTERN 2: ENGINE WORKER POOL (Monte Carlo simulations)
// ============================================================
// Create pool when optimizer/synthesis/duel/forecaster/pathfinder needs it
const pool = new EngineWorkerPool();
await pool.init();  // Spawns N workers based on CPU cores
await pool.syncState(basePlayerState);  // One-time state sync (cached)

// Dispatch parallel simulations
for (const candidate of testCandidates) {
  const promise = pool.runTask(candidate).then(result => {
    // Accumulate results
    results.push(result);
  });
  promises.push(promise);
}
await Promise.all(promises);

// Cleanup (important!)
pool.terminate();

// Used by: OptimizerTab, SynthesisTab, DuelTab, Forecaster (Phase 1), PathfinderTab

// ============================================================
// PATTERN 3: FORECASTER TWO-PHASE (Hybrid Monte Carlo + Deterministic)
// ============================================================
async function handleAnalyzeWall(skipMonteCarlo = false) {
  if (!skipMonteCarlo) {
    // PHASE 1: Monte Carlo (expensive, parallel)
    const pool = new EngineWorkerPool();
    await pool.init();
    await pool.syncState(effectiveState);
    
    // Run simulations
    for (let i = 0; i < simPrecision; i++) {
      await pool.runTask(stats);
    }
    pool.terminate();
  }
  
  // PHASE 2: Deterministic Gauntlet (fast, single-threaded)
  const result = await calcWorker.postMessage({
    command: 'CALC_STATS',
    payload: { ...effectiveState, compendium_target_floor: targetFloor }
  });
  
  // Find hardest block and run ROI scan
  const hardestBlock = findHardestBlock(result.blocks_data);
  const roiResults = scanAllUpgrades(hardestBlock);
}

// Smart caching: skipMonteCarlo=true when only target max floor changes from inputs

// ============================================================
// PATTERN 4: PATHFINDER NESTED OPTIMIZATION
// ============================================================
async function runPathfinderSimulation(startState, targetLevel) {
  while (currentLevel < targetLevel) {
    // Event-driven loop: advance to next milestone
    const nextEvent = findNextEvent(levelUp, upgradeReady, cardDrop);
    
    // At each decision point, run full optimization
    const pool = new EngineWorkerPool();
    await pool.init();
    await pool.syncState(currentState);
    
    // Run Simulated Annealing to find best Farm/Push builds
    const farmBuild = await optimizeFarmBuild(pool);
    const pushBuild = await optimizePushBuild(pool);
    
    pool.terminate();
    
    // Advance time and resolve event
    time += nextEvent.timeToReach;
    resolveEvent(nextEvent);
  }
}

// Creates/destroys multiple pools throughout timeline simulation

// ============================================================
// PATTERN 5: SANDBOX (Deterministic Only)
// ============================================================
// No engine pool - only calc_worker for instant feedback
useEffect(() => {
  calcWorker.postMessage({
    command: 'CALC_STATS',
    payload: { 
      base_stats: sandboxStats,  // Manual slider values
      compendium_target_floor: sandboxFloor,
      do_full_sim: false
    }
  });
}, [sandboxStats, sandboxFloor]);

// Real-time recalculation on any slider change (< 50ms)
```

**Why These Different Patterns**:

| Tool | Calc Worker | Engine Pool | Pattern Reason |
|------|-------------|-------------|----------------|
| **PlayerSetup** | ✅ Always | ❌ Never | Real-time stat display only |
| **OptimizerTab** | ❌ No | ✅ Yes | Pure Monte Carlo optimization |
| **SynthesisTab** | ❌ No | ✅ Yes | Pure Monte Carlo tournament |
| **DuelTab** | ❌ No | ✅ Yes | Fixed 500 runs per build |
| **SandboxTab** | ✅ Always | ❌ Never | Deterministic breakpoint analysis |
| **ForecasterTab** | ✅ Phase 2 | ✅ Phase 1 | Hybrid: MC baseline + deterministic ROI |
| **PathfinderTab** | ❌ No* | ✅ Repeatedly | Nested optimization calls |

*PathfinderTab may use calc_worker indirectly through optimizer.js calls

**Performance Characteristics**:
- **calc_worker**: < 50ms latency, single-threaded, deterministic
- **engine_worker pool**: 10-300 seconds, configurable CPU usage (see below), stochastic
  - **Eco Mode** (Mobile/Battery): 25% of cores, max 2 workers
  - **Balanced** (Default): 50% of cores, capped at 6 to prevent thermal issues
  - **Max Mode** (Performance): All cores minus 1 (reserves 1 for UI responsiveness)
- **State caching**: Avoids repeated JSON serialization (30-50× gain)
- **Progressive enhancement**: Tools gracefully degrade if workers fail

---

## 6. Optimization Algorithms

### 6.1 Multi-Phase Successive Halving

**Purpose**: Efficiently search stat distribution space using tournament-style elimination

**Algorithm** (`src/utils/optimizer.js`):

```javascript
// Phase 1: Test ALL candidates with small sample (15% of simulation budget per candidate)
// Phase 2: Keep top 20% of candidates, test with medium sample (35% of budget per candidate)
// Phase 3: Keep top 10% of candidates, test with full sample (50% of budget per candidate)
//
// "samples" = number of Monte Carlo simulation runs per candidate
// "survival_rate" = fraction of candidates that advance to next round

const rounds = [
    [iterations * 0.15, 0.20],  // Phase 1: (15 sims/candidate, keep 20%)
    [iterations * 0.35, 0.10],  // Phase 2: (35 sims/candidate, keep 10%)
    [iterations * 0.50, 1.00]   // Phase 3: (50 sims/candidate, all advance)
];

// Example: 100-iteration budget
// Phase 1: 15 simulations × 1000 candidates = 15,000 total runs → Keep 200 best
// Phase 2: 35 simulations × 200 candidates = 7,000 total runs → Keep 20 best
// Phase 3: 50 simulations × 20 candidates = 1,000 total runs → Winner declared

for (const [samples, keepRate] of rounds) {
    // Run N simulations for EACH candidate in this round
    results = await runParallel(candidates, samples);
    
    // Sort candidates by performance and eliminate losers
    candidates = sortByMetric(results).slice(0, candidates.length * keepRate);
}
```

**Ranking Logic**:
- **For `highest_floor`**: 
  - Primary: Sort by absolute max floor reached (across all simulation runs)
  - Tiebreaker: If two candidates reach same max floor, use average floor across runs
  - Rationale: Prioritizes ceiling potential, but prefers consistency when ceilings tie
- **For yields** (XP/fragments): 
  - Primary: Sort by average metric value
  - Tiebreaker: Average floor reached (proxy for survivability)
  - Rationale: Consistency matters more than outlier peaks for farming

**Seed Injection (Elitism)**:

```javascript
// Always include user's current build
if (!grid.includes(userCurrentBuild)) {
    grid.push(userCurrentBuild);
}
```

**Why**: Guarantees optimizer never outputs a build worse than user's starting point.

---

### 6.2 Backtracking Grid Generator

**Purpose**: Exhaustively enumerate stat combinations within bounds

```javascript
function generateDistributions(stats, totalBudget, step, bounds) {
    const results = [];
    
    function backtrack(idx, currentSum, currentDist) {
        if (idx === stats.length - 1) {
            // Last stat gets remainder
            remainder = totalBudget - currentSum;
            if (remainder >= bounds[stats[idx]].min && 
                remainder <= bounds[stats[idx]].max) {
                results.push({...currentDist, [stats[idx]]: remainder});
            }
            return;
        }
        
        const stat = stats[idx];
        const maxPossible = Math.min(
            bounds[stat].max,
            totalBudget - currentSum - sumOfMins(stats.slice(idx+1))
        );
        
        for (let val = bounds[stat].min; val <= maxPossible; val += step) {
            backtrack(idx + 1, currentSum + val, {...currentDist, [stat]: val});
        }
    }
    
    backtrack(0, 0, {});
    return results;
}
```

**Complexity**: O(n^d) where n=budget/step, d=stat_dimensions

**Mitigation Strategies**:
- **Tight bounds**: User stat locks reduce search space dramatically
- **Dynamic step sizing**: Adaptive granularity based on budget and candidate count
  - Budget 1-7: step=1 (exact)
  - Budget 8-15: step=2
  - Budget 16-29: step=3
  - Budget 30-59: step=4
  - Budget 60+: step=5+
  - Auto-increments further if candidate count > 300 (prevents combinatorial explosion)
- **Memory-safe counting**: `countDistributions()` calculates size without allocating arrays
  - Runs BEFORE `generateDistributions()` to prevent browser OOM crashes
  - If count > 300 candidates, automatically increases step size
  - Critical for high-budget scenarios (e.g., Arch Level 100+ or crippled builds with many unpent points in 8th stat bucket)

---

### 6.3 Synthesis Tab: Hybrid Generation & Tournament

**Purpose**: Merge multiple optimizer runs to find global optimum through statistical center + local permutations

**Algorithm** (`src/components/simulations/SynthesisTab.jsx`):

**Note**: The code examples below show the general algorithm flow. The primary difference between **floor push** and **farming** builds is in the **ranking/sorting logic** (see Step 3 below). Center calculation, permutation generation, and tournament structure are identical for both target types.

**Step 1: Calculate Statistical Center**

```javascript
// Find average distribution across selected runs
const avgDist = {};
statKeys.forEach(s => {
    const avg = Math.round(sanitizedRuns.reduce((acc, r) => acc + r[s], 0) / sanitizedRuns.length);
    avgDist[s] = avg;
});

// Budget normalization: Ensure center sums to max historical budget
const targetBudget = Math.max(...sanitizedRuns.map(r => sum(r.stats)));
let diff = targetBudget - sum(avgDist);

// Greedy top-up/reduction respecting stat locks and caps
if (diff > 0) {
    // Add points to highest stats first
    unlockedStats.sort((a, b) => avgDist[b] - avgDist[a]);
    for (const s of unlockedStats) {
        const room = cap[s] - avgDist[s];
        const add = Math.min(room, diff);
        avgDist[s] += add;
        diff -= add;
    }
}
```

**Step 2: Generate Permutation Neighborhood**

```javascript
const candidatesMap = new Map();
candidatesMap.set(JSON.stringify(avgDist), avgDist); // Add center

// Generate ±1, ±2, ±3 point swaps around center
const radii = [1, 2, 3];
radii.forEach(radius => {
    statKeys.forEach(sFrom => {
        statKeys.forEach(sTo => {
            if (sFrom !== sTo && 
                avgDist[sFrom] - radius >= bounds[sFrom].min &&
                avgDist[sTo] + radius <= bounds[sTo].max) {
                
                const neighbor = { ...avgDist };
                neighbor[sFrom] -= radius;
                neighbor[sTo] += radius;
                candidatesMap.set(JSON.stringify(neighbor), neighbor);
            }
        });
    });
});

// Include original user-selected builds (Algorithm Immunity)
sanitizedRuns.forEach(r => candidatesMap.set(JSON.stringify(r.stats), r.stats));
```

**Key Design Decisions**:
- Only permute around **center**, not around original builds (avoids N² explosion)
- Original builds already optimized by Phase 3 of Optimizer
- Radii of 1/2/3 capture most local improvements without excessive search

---

**Step 3: 3-Round Tournament Elimination**

```javascript
const rounds = [
    { label: "1/3: Scouting",    runs: 10,  keepTop: "20%" },
    { label: "2/3: Filtering",   runs: 40,  keepTop: 5 },
    { label: "3/3: Deep Marathon", runs: 450, keepTop: 1 }
];

let currentPool = Array.from(candidatesMap.keys());

for (const round of rounds) {
    // Run simulations for all candidates in current pool
    for (const buildId of currentPool) {
        for (let i = 0; i < round.runs; i++) {
            result = await pool.runTask(buildRes.get(buildId).dist);
            buildRes.get(buildId).floors.push(result.highest_floor);
            // ... accumulate metrics
        }
    }
    
    // Sort by Ceiling Score and eliminate losers
    // ⚠️ KEY DIFFERENCE: Ranking logic varies by target type
    if (targetMetric === "highest_floor") {
        // FLOOR PUSH: Rank by ceiling score (top 3 average during rounds)
        currentPool.sort((a, b) => 
            getCeilingScore(buildRes.get(b).floors, 3) - 
            getCeilingScore(buildRes.get(a).floors, 3)
        );
    } else {
        // FARMING: Rank by total yield average across all runs
        currentPool.sort((a, b) => buildRes.get(b).sum_t - buildRes.get(a).sum_t);
    }
    
    // Keep top N, but always preserve original user builds (Algorithm Immunity)
    const survivors = currentPool.slice(0, round.keepTop);
    currentPool = [...new Set([...survivors, ...originalBuildIds])];
}
```

**Ranking Differences by Target Type**:

| Target Type | Elimination Rounds (1-2) | Final Ranking (Round 3) | Rationale |
|-------------|-------------------------|------------------------|-----------|
| **Floor Push** | Ceiling Score (top 3) | Ceiling Score (top 5) | Emphasizes peak potential; RNG luck matters |
| **Farming** (XP/Frags) | Total yield average | Total yield average | Consistency matters; outliers less important |


**Ceiling Score** (Tie-Breaker):

```javascript
function getCeilingScore(floors, count = 3) {
    const sorted = [...floors].sort((a, b) => b - a);
    const topN = sorted.slice(0, count);
    return topN.reduce((sum, f) => sum + f, 0) / topN.length;
}
```

- Takes average of **top 3 runs** (during elimination) or **top 5 runs** (final ranking)
- Breaks ties when builds reach same floor but with different RNG luck
- Emphasizes peak performance, not just average

**Algorithm Immunity**:
- User-selected builds **always survive culling** in every round
- Prevents valuable edge-case builds from being eliminated early
- Final tournament includes user picks + AI-generated hybrids

**Total Simulation Budget**: ~500 runs
- Scout phase: N candidates × 10 runs
- Filter phase: ~20% survivors × 40 runs
- Marathon phase: ~5 finalists × 450 runs

---

### 6.4 Forecaster Tab: Shopping Cart & Recalculation Logic

**Purpose**: Test hypothetical future states with a cumulative "shopping cart" of pending upgrades

**The Shopping Cart System** (`getEffectiveState()`):

The cart merges pending upgrades into current player state:

```javascript
function getEffectiveState() {
    const eff = {
        base_stats: { ...store.base_stats },
        upgrade_levels: { ...store.upgrade_levels },
        external_levels: { ...store.external_levels },
        cards: { ...store.cards }
    };
    
    // Apply all cart items cumulatively
    cartItems.forEach(item => {
        if (item.type === 'stat') eff.base_stats[item.id] += item.qty;
        if (item.type === 'upg') eff.upgrade_levels[item.id] += item.qty;
        if (item.type === 'card') eff.cards[item.id] += item.qty;
        if (item.type === 'ext') {
            const group = EXTERNAL_UI_GROUPS.find(g => g.id === item.id);
            group.rows.forEach(r => eff.external_levels[r] += item.qty);
        }
    });
    
    return eff;
}
```

**Key Design**: Cart items stack additively. Order doesn't matter. All simulations use the merged state.

---

**Two-Phase Analysis** (Wall Breaker Mode):

1. **Phase 1: Monte Carlo Baseline** (Expensive, parallel)
   - Runs `simPrecision` full simulations (100/500/1000)
   - Uses EngineWorkerPool for parallelization
   - Calculates average max floor and run time
   - Builds floor distribution histogram
   - **Progress Bar**: 0% → 50%

2. **Phase 2: Deterministic Gauntlet** (Fast, single-threaded)
   - Uses calc_worker.js with `do_full_sim: false`
   - Calculates exact stats for all blocks at target floor without running full Monte Carlo
   - Finds hardest block (highest avg_hits)
   - Scans all available upgrades for marginal ROI
   - **Progress Bar**: 50% → 100%

---

**Smart Recalculation Triggers**:

ForecasterTab uses `useEffect` with dependency tracking to minimize redundant computation:

```javascript
useEffect(() => {
    const cartChanged = prev.cartItems !== cartItems;
    const precisionChanged = prev.simPrecision !== simPrecision;
    const targetFloorChanged = prev.targetFloor !== targetFloor;
    
    if (hasAnalyzed) {
        if (cartChanged || precisionChanged) {
            handleAnalyzeWall(false); // FULL recalculation (Phase 1 + 2)
        } else if (targetFloorChanged) {
            handleAnalyzeWall(true);  // SKIP Monte Carlo (Phase 2 only)
        }
    }
}, [cartItems, simPrecision, targetFloor]);
```

**Recalculation Rules**:

| Change | Monte Carlo Re-run? | Gauntlet Re-run? | Reason |
|--------|---------------------|------------------|--------|
| Add/remove cart item | ✅ Yes | ✅ Yes | Stats changed, invalidates baseline |
| Change precision | ✅ Yes | ✅ Yes | Sample size affects confidence |
| Change target floor | ❌ No (cached) | ✅ Yes | Block stats scale with floor |

**Why Cache Monte Carlo**: Changing target floor doesn't affect player power, only enemy stats. Reusing the floor distribution saves 30-120 seconds.

---

**ROI Scanning** (Phase 2):

After baseline calculation, scans all available upgrades:

```javascript
// For each available upgrade
for (const item of allUpgrades) {
    // Test +1 level with deterministic math
    const testState = { ...effState, [item]: +1 };
    const testBlock = calcBlockStats(testState, hardestBlockId, targetFloor);
    
    // Calculate marginal gains
    const d_edps = testBlock.edps - baseBlock.edps;
    const d_pen = testBlock.armor_pen - baseBlock.armor_pen;
    const d_sta = testBlock.max_sta - baseBlock.max_sta;
    
    // Rank by composite benefit
    fullList.push({ id: item, d_edps, d_pen, d_sta, ...cost });
}

// Categorize into 4 ranked lists
topEDPS = fullList.sort((a,b) => b.d_edps - a.d_edps).slice(0, 10);
topPen = fullList.sort((a,b) => b.d_pen - a.d_pen).slice(0, 10);
topSta = fullList.sort((a,b) => b.d_sta - a.d_sta).slice(0, 10);
topNetSta = fullList.sort((a,b) => b.d_net_sta - a.d_net_sta).slice(0, 10);
```

**Key Assumptions**:
- ROI scan uses **deterministic math only** (no Monte Carlo)
- Marginal gains calculated against **hardest block** at target floor
- Rankings show **raw gain**, not cost efficiency (user must weigh fragment costs)
- Stats ranked independently; doesn't account for diminishing returns or synergies

**Limitations**:
- Only tests +1 level at a time (no combo analysis)
- Deterministic math may not capture RNG-heavy benefits (crit chains, mod streaks)
- "Hardest block" heuristic may not represent actual wall (could be tanky block with high Luck bypass)

---

### 6.5 Pathfinder Macro-Stepper

**Purpose**: Simulate entire progression timeline from level X→Y with automated decisions

**Event-Driven Architecture**:

```javascript
while (level < targetLevel) {
    // 1. Calculate rates
    xp_rate = calculate_xp_per_min();
    frag_rate = calculate_frags_per_min();
    card_rate = calculate_card_drops_per_min();
    
    // 2. Time-to-next-milestone
    t_level = exp_needed / xp_rate;
    t_upgrade = (cost - bank) / frag_rate;
    t_card = (target - progress) / card_rate;
    
    // 3. Jump to nearest event
    t_step = min(t_level, t_upgrade, t_card);
    time += t_step;
    resources += rates * t_step;
    
    // 4. Resolve event
    if (t_step === t_level) level_up();
    else if (t_step === t_upgrade) buy_upgrade();
    else if (t_step === t_card) craft_card();
    
    // 5. Re-optimize if power changed
    if (combat_power_changed) {
        rebuild_farm_stats();        // Uses Section 6.6 algorithm below
        if (attempting_floor_push) rebuild_push_stats();  // Uses Section 6.6 algorithm below
    }
}
```

**Multi-Floor Push Optimizer**:

```javascript
// Test absolute ceiling
highest_floors = run_uncapped_simulations(150_samples);

// Evaluate each floor cumulatively
for (let f = current+1; f <= max(highest_floors); f++) {
    successes = highest_floors.filter(hf => hf >= f).length;
    winRate = successes / samples;
    
    // Wilson Score 95% confidence interval
    lowerBound = wilson_score_lower(winRate, samples, z=1.96);
    if (lowerBound < minWinRateReq) break;
    
    // Budget 90% success runs
    budgetRuns = ceil(log(0.10) / log(1 - winRate));
    timePenalty += budgetRuns * avgRunTime;
    
    if (timePenalty > maxTime) break;
    bestFloor = f;
}
```

**Why Wilson Score**: Provides statistical confidence intervals, not naive win rates. Critical for low-sample predictions.

---

### 6.6 Simulated Annealing (Pathfinder Build Optimizer)

**Purpose**: Optimize stat distributions at Pathfinder decision points using random walk exploration

**Context**: Called by Section 6.5 macro-stepper whenever combat power changes (level-ups, upgrades, cards)

**3-Phase Search** (`src/utils/pathfinder_engine.js`):

1. **Round 1: Coarse Grid** - Adaptive step sizing based on budget (see Section 6.2)
2. **Round 2: Micro-Neighbors** - Test ±1 and ±2 point swaps from best candidate
3. **Round 3: Deep Random Walks** - 200 passes for push builds, 25 for farm builds
   - Random walk distance: 1 to (step+1) points
   - Generates neighbor variants to escape local minima
   - More aggressive exploration for push builds due to rugged fitness landscape

**Dimension Reduction**: Empirical pruning reduces search space from ~10^6 to ~10^3 combinations
- At floor 25+: Int and Per capped at 3 points (armor pen plateaus)
- At floor 100+: Luck must stay near cap (crosshairs become critical)

**Key Difference from OptimizerTab**: Uses faster 3-phase local search instead of expensive Successive Halving, as Pathfinder calls optimizer repeatedly (10-50+ times per timeline)

---

## 7. Data Flow & Communication

### Request/Response Patterns by Tool

**Pattern 1: Real-Time Stat Calculation** (PlayerSetup, CalculatedStats)

```
User edits stat/upgrade/card
  ↓
Zustand state update
  ↓
useEffect trigger (watches specific state keys)
  ↓
postMessage(CALC_STATS) → calc_worker.js
  ↓
Pyodide loads player.py
  ↓
Calculate derived stats (< 50ms)
  ↓
onmessage(CALC_RESULT)
  ↓
UI updates instantly (damage, EDPS, armor pen, etc.)
```

**Used by**: All tabs that display calculated stats, triggered on ANY state change

---

**Pattern 2: Monte Carlo Optimization** (OptimizerTab)

```
User clicks "Optimize"
  ↓
optimizer.js generates candidate grid (backtracking/successive halving)
  ↓
EngineWorkerPool.init() spawns N workers (eco/balanced/max mode)
  ↓
syncState() sends player state once to all workers (cached)
  ↓
Phase 1: Test ALL candidates × 15% sim budget
  ├─→ postMessage(RUN_SIMULATION) × N workers in parallel
  ├─→ Progress: 0% → 15%
  └─→ Sort, keep top 20%
  ↓
Phase 2: Test survivors × 35% sim budget  
  ├─→ Progress: 15% → 50%
  └─→ Sort, keep top 10%
  ↓
Phase 3: Test finalists × 50% sim budget
  ├─→ Progress: 50% → 100%
  └─→ Winner declared
  ↓
pool.terminate()
  ↓
ResultsDashboard displays winner + analytics
```

**Simulation budget**: 100-600 total runs distributed across 3 phases

---

**Pattern 3: Synthesis Tournament** (SynthesisTab)

```
User selects 2-10 historical runs, clicks "Synthesize"
  ↓
Calculate statistical center (centroid)
  ↓
Generate permutation neighborhood (±1/2/3 radii)
  ↓
EngineWorkerPool.init()
  ↓
Round 1 (Scout): ALL candidates × 10 runs
  ├─→ Progress: 0% → ~20%
  └─→ Sort by ceiling score, keep top 20%
  ↓
Round 2 (Filter): Survivors × 40 runs
  ├─→ Progress: 20% → ~40%
  └─→ Sort, keep top 5 (+ original builds via Algorithm Immunity)
  ↓
Round 3 (Marathon): Finalists × 450 runs
  ├─→ Progress: 40% → 100%
  └─→ Meta-Build winner (top 5 floor average)
  ↓
pool.terminate()
  ↓
ResultsDashboard + Meta-Build History Log
```

**Total budget**: ~500 runs (10 + 40 + 450 = exactly 500 per finalist)

---

**Pattern 4: Duel Comparison** (DuelTab)

```
User sets Build A and Build B, clicks "Run Duel"
  ↓
EngineWorkerPool.init()
  ↓
Build A: 500 parallel simulations
  ├─→ Accumulate 20+ telemetry metrics
  ├─→ Progress: 0% → 50%
  └─→ Store results
  ↓
Build B: 500 parallel simulations
  ├─→ Accumulate 20+ telemetry metrics
  ├─→ Progress: 50% → 100%
  └─→ Store results
  ↓
pool.terminate()
  ↓
Side-by-side comparison table (color-coded winners)
```

**Fixed budget**: Exactly 500 runs per build (no elimination)

---

**Pattern 5: Sandbox Deterministic** (SandboxTab)

```
User adjusts stat sliders manually
  ↓
useEffect watches sandbox_stats state
  ↓
postMessage(CALC_STATS, do_full_sim=false, target_floor=sandboxFloor)
  ↓
calc_worker.js calculates block stats
  ↓
< 50ms latency >
  ↓
Display AG Grid table with:
  ├─→ HP, Armor, EDPS (regular + enraged)
  ├─→ Avg Hits to Kill (EDPS-based)
  ├─→ Max Hits to Kill (non-crit baseline)
  └─→ Optional: Detailed crit damage breakdown
  ↓
If baseline locked: Show color-coded diffs
```

**No Monte Carlo**: Pure deterministic math for instant feedback

---

**Pattern 6: Forecaster Two-Phase** (ForecasterTab)

**Overview**: ForecasterTab uses a hybrid Monte Carlo + deterministic analysis approach with smart caching to minimize redundant computation.

```
User adds items to shopping cart, clicks "Analyze"
  ↓
Merge cart items into effectiveState (see Section 6.4)
  ↓
Cache check: Has cart/precision changed?
  ├─→ YES: Run Phase 1 + Phase 2
  └─→ NO (only floor changed): Skip to Phase 2 (use cached MC results)
  ↓
PHASE 1: Monte Carlo Baseline (if needed)
  ├─→ EngineWorkerPool.init()
  ├─→ Run N simulations (100/500/1000 based on precision)
  ├─→ Build floor distribution histogram
  ├─→ Progress: 0% → 50%
  └─→ pool.terminate()
  ↓
PHASE 2: Deterministic Gauntlet (always runs)
  ├─→ calc_worker.js (do_full_sim=false)
  ├─→ Find hardest block at target floor
  ├─→ ROI scan all available upgrades
  ├─→ Progress: 50% → 100%
  └─→ Generate ranked shopping lists
  ↓
Display push probability + ROI recommendations
```

**Smart caching**: Skips expensive Phase 1 when only floor changes (30-120s savings)

**For detailed implementation**: See [Section 6.4](#64-forecaster-tab-shopping-cart--recalculation-logic) (shopping cart system, recalculation triggers, dependency tracking) and [Section 8.3](#83-forecaster-smart-caching) (caching performance optimization)

---

**Pattern 7: Pathfinder Timeline** (PathfinderTab)

```
User selects starting point (template/current/snapshot), clicks "Run Pathfinder"
  ↓
Initialize event-driven loop
  ↓
WHILE currentLevel < targetLevel:
  ├─→ Calculate rates (XP/frags/cards per minute)
  ├─→ Find next milestone: min(t_levelup, t_upgrade, t_card)
  ├─→ Fast-forward time to milestone
  ├─→ Resolve event (level up / buy upgrade / collect card)
  ├─→ IF combat power changed:
  │    ├─→ EngineWorkerPool.init()
  │    ├─→ Run Simulated Annealing optimization (Section 6.6)
  │    │    ├─→ Phase 1: Coarse grid (adaptive step)
  │    │    ├─→ Phase 2: Micro-neighbors (±1/±2)
  │    │    ├─→ Phase 3: Random walks (200 for push, 25 for farm)
  │    │    └─→ Find best Farm + Push builds
  │    └─→ pool.terminate()
  ├─→ Multi-floor push optimizer (Wilson Score confidence)
  └─→ Update progress bar and status message
  ↓
Generate interactive timeline + node-graph log
  ↓
User can export chunks or apply snapshots to continue
```

**Nested optimization**: Creates/destroys 10-50+ worker pools throughout timeline
**Duration**: Can take 5s for large level jumps (5-10 levels recommended)

---

### Communication Protocols (Shared Across Tools)

The following patterns are used by **all tools** that leverage EngineWorkerPool (Patterns 2-7 above):

**State Synchronization**:
```javascript
// One-time sync per job (cached in workers)
// Used by: Optimizer, Synthesis, Duel, Forecaster, Pathfinder
await pool.syncState({
  asc1_unlocked, asc2_unlocked, arch_level, current_max_floor,
  arch_ability_infernal_bonus, total_infernal_cards,
  base_stats, upgrade_levels, external_levels, cards
});
```
**Why once?** State is cached in worker memory. Avoids repeated JSON serialization overhead (30-50× faster).

**Task Dispatch**:
```javascript
// Test single candidate (most common)
const result = await pool.runTask(statDistribution);

// Or override specific player state properties (advanced)
// Used by Forecaster (shopping cart overrides) and Pathfinder (upgrade testing)
const result = await pool.runTask(stats, upgradeOverrides, externalOverrides, cardOverrides);
```

**Progress Tracking**:
```javascript
// Each tool implements custom progress calculation
// Optimizer: 3-phase successive halving (15%/35%/50% splits)
// Synthesis: 3-round tournament (10+40+450 runs)
// Duel: Build A (0-50%), Build B (50-100%)
// Forecaster: Phase 1 (0-50%), Phase 2 (50-100%)
// Pathfinder: Event count + optimization cycles

setProgressPct((completedSims / totalSims) * 100);
setProgressMsg(`Phase 2: Filtering (${completed}/${total})`);
```

---

## 8. Performance Optimizations

### 8.1 Worker Pool Scaling

```javascript
// CPU profile detection (used by all EngineWorkerPool consumers)
const cores = navigator.hardwareConcurrency || 4;
let workerCount;
if (cpuProfile === 'eco') workerCount = Math.min(2, Math.ceil(cores * 0.25));
else if (cpuProfile === 'balanced') workerCount = Math.min(6, Math.ceil(cores * 0.5));
else workerCount = Math.max(1, cores - 1);  // Leave 1 for UI
```

**Why Thermal Throttling Matters**: Uncapped workers melt laptops. "Eco" mode prevents overheating on mobile devices.

**Applies to**: OptimizerTab, SynthesisTab, DuelTab, ForecasterTab, PathfinderTab

**CPU Benchmark Tool**: Available in Simulations tab header. When clicked:
1. Initializes temporary EngineWorkerPool with current CPU profile
2. Dispatches 50 simultaneous simulation tasks
3. Measures total elapsed time
4. Calculates throughput: `simulations_per_second = 50 / elapsed_time`
5. Stores result in Zustand state for display

**Purpose**: Helps users understand their device's performance and set realistic time limits for optimization runs. A fast desktop might achieve 30-50 sims/sec, while a mobile device might only reach 5-10 sims/sec.

**Design Decision**: Benchmark is opt-in (not automatic) to avoid surprising users with CPU spike on page load.

---

### 8.2 State Caching Strategy

```javascript
// Instead of JSON.stringify(player) on every sim (expensive)
await worker.postMessage({ command: 'SYNC_STATE', player: fullState });

// Later sims only send stat mutations
await worker.postMessage({ 
    command: 'RUN_SIM',
    statMutation: { Str: 50, Agi: 45 }  // Tiny payload
});
```

**Impact**: 30-50× faster than naive JSON serialization approach.

**Applies to**: All tools using EngineWorkerPool (Optimizer, Synthesis, Duel, Forecaster, Pathfinder)

---

### 8.3 Forecaster Smart Caching

**Problem**: ForecasterTab's Monte Carlo Phase 1 takes 30-120 seconds. Changing target floor doesn't affect player power (only enemy stats), so re-running Monte Carlo is wasteful.

**Solution**: Cache Monte Carlo results and selectively skip Phase 1 when only the target floor changes.

**Implementation**: ForecasterTab tracks three dependencies (cartItems, simPrecision, targetFloor) using React's `useEffect` and intelligently decides whether to re-run Phase 1 or reuse cached results. For detailed recalculation logic and dependency tracking, see [Section 6.4](#64-forecaster-tab-shopping-cart--recalculation-logic).

**Example**:
```javascript
// Cart/precision change: Full recalculation (Phase 1 + Phase 2)
if (cartChanged || precisionChanged) {
    handleAnalyzeWall(false);
}
// Floor change only: Skip Phase 1, reuse cached Monte Carlo results
else if (targetFloorChanged) {
    handleAnalyzeWall(true);  // Phase 2 only
}
```

**Impact**: 30-120 second time savings when exploring different target floors with the same shopping cart configuration.

**Applies to**: ForecasterTab only

---

### 8.4 Loop Hoisting (Combat Simulation)

**Problem** (Slow):

```python
FOR each of 10,000 hits:
  damage = player.damage           # Recalculates from base stats every time
  crit_chance = player.crit_chance # Dictionary lookup + formula
ENDFOR
```

**Solution** (Fast):

```python
BEFORE LOOP:
  cached_damage = player.damage           # Calculate once
  cached_crit_chance = player.crit_chance # Calculate once
  # Cache ~30 properties before loop starts

FOR each of 10,000 hits:
  damage = cached_damage           # Simple variable access
  crit_chance = cached_crit_chance
ENDFOR
```

**Impact**: 3-5× speedup in combat loop. Essential for Monte Carlo simulations that run millions of combat ticks.

**Applies to**: All Monte Carlo tools (Optimizer, Synthesis, Duel, Forecaster Phase 1, Pathfinder's nested optimizations)

**Implementation**: `public/engine/combat_loop.py` lines 120-150 (loop hoisting section)

---

### 8.5 Memory-Safe Candidate Counting

```javascript
// BEFORE generating candidates array (prevents OOM crashes)
let count = countDistributions(stats, budget, step, bounds);

// If combinatorial explosion detected, increase step size
while (count > 300 && step < budget) {
    step++;
    count = countDistributions(stats, budget, step, bounds);
}

// NOW safe to generate array
let grid = generateDistributions(stats, budget, step, bounds);
```

**Why**: Backtracking grid generator can create millions of candidates with high budgets. Counting first (without arrays) prevents browser crashes.

**Impact**: Prevents out-of-memory crashes on Arch Level 100+ with 200+ stat points

**Applies to**: OptimizerTab (backtracking), PathfinderTab (simulated annealing)

---

### 8.6 Synthesis Permutation Pruning

**Problem** (Combinatorial Explosion):
```javascript
// Generate permutations around ALL N selected builds
// Results in N² candidate growth
selectedBuilds.forEach(build => {
    generatePermutations(build, [1,2,3]);  // BAD: N × permutations
});
```

**Solution** (Linear Growth):
```javascript
// Only permute around statistical center
const center = calculateCentroid(selectedBuilds);
generatePermutations(center, [1,2,3]);

// But include originals via Algorithm Immunity
selectedBuilds.forEach(build => candidatesMap.add(build));
```

**Why**: Selected builds already optimized by Optimizer Phase 3. Searching around them is redundant and causes N² explosion.

**Impact**: Synthesis with 10 builds generates ~100 candidates instead of ~1000

**Applies to**: SynthesisTab only

---

### 8.7 Lazy Code Splitting

```javascript
// Vite config: Manual chunks for large dependencies
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('plotly.js')) return 'plotly';  // ~1.2MB (charts)
        if (id.includes('ag-grid')) return 'aggrid';    // ~800KB (tables)
        if (id.includes('pyodide')) return 'pyodide';   // ~6MB (Python engine)
      }
    }
  }
}
```

**Why**: User doesn't need charting libraries until viewing results. Lazy load for faster initial page load.

**Applies to**: All tabs
- Plotly: Used by Optimizer, Synthesis, Forecaster, Pathfinder (charts)
- AG Grid: Used by BlockCompendium, Synthesis history, Sandbox
- Pyodide: Used by calc_worker and engine_worker (all simulations)

---

## 9. Hard-Coded Values & Game Constants

### 9.1 Spawn Probabilities

Located in `public/engine/floor_map.py`, these control block rarity distribution by floor:

```
FLOOR BRACKET SPAWN CHANCES (1-in-X format):
                    [Dirt, Common, Rare, Epic, Leg, Myth, Div]
  Floor 150+:       [  3,     6,    6,    6,   6,   10,   15]
  Floor 100-149:    [  3,     6,    7,    7,   7,   14,   30]
  Floor 75-99:      [  3,     7,    8,    8,   8,   21,   60]
  ... (9 more brackets down to Floor 1)

EXAMPLE (Floor 100-149):
  - Dirt:      1-in-3  = 33.3% chance per slot
  - Common:    1-in-6  = 16.7%
  - Rare:      1-in-7  = 14.3%
  - Divine:    1-in-30 = 3.3%
```

### 9.2 Combat Constants

Hard-coded values that define core combat mechanics:

```
STAMINA_COST_PER_HIT = 1.0
  → Every melee attack costs 1 stamina (immutable)

STAMINA_COST_PER_ORE = 0.0
  → Starting to mine a block costs 0 stamina (only hits cost stamina)

CROSSHAIR_SPAWN_INTERVAL = 3.5 seconds
  → Crosshairs appear every 3.5 seconds (configurable in code)
  → Note: This is a rough estimate from limited empirical measurements,
    not extracted from game code. Actual in-game value may differ.

PATH_ORDER = [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6, ...]
  → Serpentine mining path (left-to-right, then right-to-left)
  → Determines which block is mined next after current one dies
```

### 9.3 Tier Unlock Thresholds

Each block rarity has 4 tiers that unlock at specific floors:

```
TIER UNLOCK FLOORS:
                   [T1,  T2,  T3,   T4]
  Dirt:            [1,   12,  24,   81]
  Common:          [1,   12,  24,   81]
  Rare:            [7,   16,  28,   82]
  Epic:            [10,  18,  32,   83]
  Legendary:       [13,  20,  36,   84]
  Mythic:          [21,  30,  40,   85]
  Divine:          [50,  75,  100,  150]

EXAMPLE:
  - Dirt Tier 1 unlocks at Floor 1
  - Dirt Tier 4 unlocks at Floor 81
  - Divine Tier 1 unlocks at Floor 50
  - Divine Tier 4 unlocks at Floor 150
```

### 9.4 Upgrade Cost Scaling

Different upgrade types use different cost formulas:

```
GEM UPGRADES (Upgrades 3, 4, 5):
  cost = base × (1.05 ^ level)
  → Gentle 5% increase per level
  → First level capped at 1000 gems

FRAGMENT UPGRADES (Most upgrades):
  cost = base × (1.2 ^ level)
  → 20% increase per level
  → Standard scaling for most upgrades

EXPENSIVE UPGRADES (12, 17, 27):
  cost = base × (2.0 ^ level)
  → Doubles every level (exponential!)
  → Used for powerful/game-changing upgrades

EXAMPLE (Upgrade with base cost 100):
  Level 1: 100
  Level 2: 120 (fragment) or 200 (expensive)
  Level 3: 144 (fragment) or 400 (expensive)
  Level 4: 173 (fragment) or 800 (expensive)
```

### 9.5 Boss Floor Distributions

Special floor milestones have fixed block distributions instead of random spawns:

```
BOSS FLOORS (Fixed 24-slot layouts):
  Floor 100: "Block Bonker" milestone
    - 12× Mythic Tier 3
    - 12× Divine Tier 1
    - Triggers achievement/upgrade unlocks
  
  Floor 150: First Divine Tier 4 unlock
    - Distribution hardcoded in floor_map.py
    - Mix of high-tier blocks
  
  Floor 200, 250, 300: Additional milestones
    - Special distributions documented in floor_map.py
    - Used for progression checkpoints
```

**Why Fixed**: Ensures consistent progression experience for all players at major milestones

**Implementation**: `public/engine/floor_map.py` - `get_floor_blocks()` has special cases for these floors

---

### 9.6 Upgrade Unlock Rules

Upgrades have two types of requirements before they become available:

```
FLOOR REQUIREMENTS (UPGRADE_LEVEL_REQS):
  Stored in: src/game_data.js
  
  Examples:
    Upgrade #41 (Major upgrade): Requires Floor 25+
    Upgrade #42 (Major upgrade): Requires Floor 50+
    Upgrade #43 (Major upgrade): Requires Floor 75+
    Upgrade #44 (Major upgrade): Requires Floor 100+
    Upgrade #45 (Stat Cap Increase): Requires Floor 125+
  
  Logic: current_max_floor >= UPGRADE_LEVEL_REQS[upgrade_id]

ASCENSION LOCKS (ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS):
  Stored in: src/game_data.js
  
  ASC1_LOCKED_UPGS = [41, 42, 43, 44, 45, ...]
    → Unavailable until Ascension 1 unlocked
  
  ASC2_LOCKED_UPGS = [subset of ASC1 list]
    → Unavailable until Ascension 2 unlocked
  
  Logic: Filter out locked upgrades based on asc1_unlocked / asc2_unlocked flags

UPGRADE CAPS (INTERNAL_UPGRADE_CAPS):
  Stored in: src/game_data.js
  
  Examples:
    Upgrade #12 (Stat Budget): Max 200 levels
    Upgrade #45 (Stat Cap): Max 10 levels
    Most upgrades: Max 1-50 levels
  
  Logic: Used by Forecaster ROI scan to skip maxed upgrades
```

**Used by**: ForecasterTab (ROI filtering), PlayerSetup (UI availability), all optimizers (constraint validation)

---

### 9.7 Block Compendium Data

Complete block statistics database used by all simulation tools:

```
STORED IN: src/game_data.js (BLOCK_DATA constant)

PER-BLOCK PROPERTIES (28 total block types × 4 tiers = 112 entries):
  - name: Display name (e.g., "Dirt", "Common", "Divine")
  - icon: Asset path for UI rendering
  - base_hp: Starting HP at floor 1
  - base_armor: Starting armor at floor 1
  - xp_yield: Base experience per kill
  - frag_yield: Base fragment drops per kill
  - frag_type: Which fragment type drops (0-6)
  - min_floor: Unlock floor for this tier
  - tier: 1-4 (affects card drop rates)

SCALING FORMULAS (Applied at runtime):
  HP Scaling:   
    scaled_hp = base_hp × (1 + 0.1 × floor)
    → 10% HP increase per floor
  
  Armor Scaling:
    scaled_armor = base_armor × (1 + 0.05 × floor)
    → 5% armor increase per floor
  
  XP Scaling:
    scaled_xp = base_xp × (1 + 0.08 × floor)
    → 8% XP increase per floor
  
  Fragment Scaling:
    scaled_frags = base_frags × (1 + 0.06 × floor)
    → 6% fragment increase per floor

PLAYER MODIFIERS (Applied after scaling):
  - Card bonuses: Each card grants % boosts to specific block types
  - Hestia Idol: Global fragment multiplier
  - Upgrade #4, #11, #38: XP multipliers
  - Upgrade #5, #16, #27, #42: Fragment multipliers
  - Floor Bonker Cap: Scaling stops at floor 100 for this modifier
```

**Used by**:
- **BlockCompendium**: Displays full table with/without player mods
- **SandboxTab**: Real-time calculations at specific floor
- **ForecasterTab**: Phase 2 deterministic gauntlet
- **calc_worker**: Generates blocks_data for all UI stat displays
- **engine_worker**: Combat loop needs HP/Armor for damage calculations
- **All optimizers**: Need accurate yield estimates for ranking builds

**Implementation**: 
- Data definition: `src/game_data.js` (BLOCK_DATA constant)
- Scaling logic: `public/core/block.py` (Block class constructor)

---

### 9.8 Card Drop Rates

Card fragments have different drop rates based on tier and card level:

```
BASE CARD (Level 1) DROP RATES:
  Tier 1-3 blocks: 1 / 1,500   = 0.067% chance per kill
  Tier 4 blocks:   1 / 15,000  = 0.0067% (10× rarer)

POLYCHROME FRAGMENT (Level 3) DROP RATES:
  Tier 1-3 blocks: 1 / 7,500   = 0.013%
  Tier 4 blocks:   1 / 75,000  = 0.0013%

INFERNAL FRAGMENT (Level 4) DROP RATES:
  ALL blocks:      1 / 200,000 = 0.0005% (flat rate for all)

CRAFTING REQUIREMENTS:
  Base → Gilded (L2):        1 base card drop
  Gilded → Polychrome (L3):  10 polychrome fragment drops
  Polychrome → Infernal (L4): 10 infernal fragment drops
```

---

## 10. Trade-Off Decisions

### 10.1 Accuracy vs Speed

**Decision**: Prioritize accuracy, optimize algorithmically

**Rationale**: Users wait minutes for results anyway. Better to be slow and correct than fast and wrong.

**Implementation**:
- Coarse step sizes (3-5) for <60s results
- Fine step sizes (1-2) for optimal builds (5-10 minutes)
- Auto-scaler balances based on user's time limit

### 10.2 Monte Carlo Sample Sizes

**Decision**: Adaptive sampling based on target

| Target | Samples | Reason |
|--------|---------|--------|
| Push builds | 25-50 | High variance, binary success |
| Farm builds | 3-10 | Low variance, continuous yields |
| Tie-breakers | 500 | Eliminate RNG noise |

**Trade-Off**: More samples = tighter confidence, slower execution

### 10.3 Phase 3 Annealing Intensity

**Decision**: 200 passes for push, 25 for farm

**Rationale**:
- Push: Floor success is chaotic (1 extra floor = exponential HP jump)
- Farm: Yields are smooth (1 extra stat point = linear gain)

### 10.4 WebAssembly vs Server

**Decision**: Run Python in browser via Pyodide

**Pros**:
- Zero server costs (scales to millions of users)
- Zero latency (no network round trips)
- Privacy (player data never leaves device)
- Works offline after initial load

**Cons**:
- 70-80% of native Python speed (WebAssembly overhead)
- Slower cold start (loads 6MB Pyodide runtime)
- Limited to browser capabilities (no filesystem, databases)

**Why This Trade-Off**: For an idle game optimizer, serverless scalability beats raw speed.

---

## 11. Known Issues & Technical Debt

### 11.1 Known Game Bugs (Tracked)

**Floor Scaling Bugs** (`public/core/block.py`):

The game has two confirmed bugs in its floor scaling logic:

```
FLOOR 150 Discrepancy (may not be a BUG):
  HP doubles (correct)
  Armor DOES NOT scale (should multiply by 1.5)
  → Makes Floor 150 slightly easier than intended

FLOOR 300 BUG (should be fixed in IoM v2.2 release):
  The scaling code triggers TWICE at exactly Floor 300
  → HP quadruples (2× twice) instead of doubling
  → Armor gets ×2.25 (1.5 × 1.5) instead of ×1.5
  → Makes Floor 300 significantly harder than intended
```

**Impact**: 
- Simulator preserves both bugs for accuracy
- Will be removed when game developer patches the issues
- Documented in code with TODO comments for future cleanup

**"Flat Dmg/Enrage Cooldown" upgrade #32 Bug** (`GameMechanics.md`):
- Intended: Only reduces Enrage cooldown
- Actual: Reduces all 3 skill cooldowns
- Status: Acknowledged by game dev, will fix eventually

### 11.2 Missing Data

**Geoduck Tribute Cap** (`public/core/player.py`):

The Geoduck pet provides a tribute bonus that's capped based on Ascension level:

```
KNOWN VALUES:
  Ascension 0: UNKNOWN (assumed 50% until player data available)
  Ascension 1: 50% cap (confirmed)
  Ascension 2: 75% cap (confirmed)

TODO: Need player with Ascension 0 account to test and confirm the actual cap.
      Simulator currently assumes it matches Asc1 (50%) until proven otherwise.
```

**Status**: Low priority - affects <1% of calculations. Community members welcome to test and report findings.

### 11.3 Technical Debt

1. **No Automated Tests**: Entire codebase lacks unit tests
   - **Risk**: Refactors could break math silently
   - **Mitigation**: Extensive manual testing by community

2. **Hard-Coded UI Strings**: No i18n framework
   - **Risk**: Can't translate to other languages
   - **Mitigation**: English-only acceptable for niche audience

3. **No Error Boundaries**: Limited error handling in workers
   - **Risk**: Worker crashes could hang optimizer
   - **Mitigation**: ErrorBoundary in React catches UI errors

4. **Tight Coupling**: Optimizer.js and pathfinder_engine.js have duplicate code
   - **Risk**: Bug fixes need to be applied twice
   - **Mitigation**: Documented in code comments

---

## 12. Deployment Architecture

### 12.1 Infrastructure

```
GitHub Repository (Source of Truth)
         ↓
    git push (triggers)
         ↓
Cloudflare Pages (Auto-deploy)
         ↓
CDN Edge Nodes (Global)
         ↓
   User's Browser
```

**Zero Configuration**: Push to `main` branch auto-deploys to production.

### 12.2 Build Process

```bash
npm run build
  ↓
Vite builds production bundle
  ↓
Output: dist/
  ├── index.html
  ├── assets/
  │   ├── index-[hash].js      # Main bundle
  │   ├── plotly-[hash].js     # Lazy-loaded
  │   └── aggrid-[hash].js     # Lazy-loaded
  └── public/
      ├── core/                # Python files (copied as-is)
      ├── engine/              # Python files
      ├── calc_worker.js
      └── engine_worker.js
```

**Optimization**:
- Tree shaking removes unused code
- Minification reduces bundle size ~70%
- Code splitting defers non-critical libraries
- Asset hashing enables cache-forever strategy

### 12.3 Feedback Integration

**Discord Webhooks** (Optional):

```javascript
// .env configuration
VITE_DISCORD_WEBHOOK_BUG="https://discord.com/api/webhooks/..."
VITE_DISCORD_WEBHOOK_FEATURE="https://discord.com/api/webhooks/..."
```

**Fallback** (if webhooks not configured):

```javascript
// Opens GitHub issue with pre-filled template
const issueUrl = `https://github.com/user/repo/issues/new?body=${encodeURIComponent(feedback)}`;
window.open(issueUrl, '_blank');
```

**Design Decision**: Graceful degradation allows local development without Discord setup.

---

## 13. Future Improvements & Roadmap

### Potential Enhancements

1. **Automated Testing**: Add Jest + Playwright for regression testing
2. **Progressive Web App**: Add service worker for offline functionality
3. **Comparison Mode**: Side-by-side diff of two player profiles
4. **Historical Tracking**: Chart progression over time (levels, floors, upgrades)
5. **Mobile Optimization**: Touch-friendly controls, responsive charts
6. **Accessibility**: WCAG 2.1 compliance (screen readers, keyboard nav)

### Performance Optimizations

1. **Web Workers Pool Warm-Up**: Pre-initialize workers on page load
2. **Result Caching**: Cache simulation results for identical inputs
3. **Incremental Optimization**: Resume interrupted optimization runs

---

## 14. Conclusion

This architecture document provides a comprehensive overview of the IoM Arch Optimizer system. The application successfully:

- **Emulates complex game mechanics** with 1:1 mathematical accuracy
- **Scales to user hardware** via adaptive worker pools
- **Runs entirely client-side** with zero server costs
- **Handles combinatorial complexity** through sophisticated algorithms
- **Provides rich visualizations** for understanding results

The codebase demonstrates advanced React patterns, WebAssembly integration, and algorithmic optimization techniques suitable for production-grade applications.

---

**Document Version**: 1.0  
**Last Updated**: May 17, 2026  
**Maintained By**: Development Team  
**Feedback**: Submit via About tab in application
