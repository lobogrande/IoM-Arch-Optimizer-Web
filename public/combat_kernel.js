// public/combat_kernel.js
// JavaScript port of the inner combat micro-tick from
// public/engine/combat_loop.py (lines 246-335) and the auto-cast logic
// from public/engine/skills.py SkillManager.tick().
//
// Off by default. The engine worker only invokes this kernel when the
// useJsKernel store flag is true; the Python engine remains the source
// of truth and the default code path.
//
// IMPORTANT: this is NOT bit-identical to the Python engine. It uses a
// mulberry32 PRNG instead of Python's Mersenne Twister, so per-seed
// outputs will differ. Validation is distributional only (see
// scripts/diff_baselines.mjs).
//
// Classic script (not an ES module) so the Web Worker can importScripts()
// it directly; the Node harness loads the same file via Node's `vm` module.

(function (global) {
  'use strict';

  // ---- Constants -----------------------------------------------------------

  // Mirrors PATH_ORDER in combat_loop.py:28
  const PATH_ORDER = [
    0, 1, 2, 3, 4, 5,
    11, 10, 9, 8, 7, 6,
    12, 13, 14, 15, 16, 17,
    23, 22, 21, 20, 19, 18,
  ];
  const STAMINA_COST_PER_HIT = 1.0;

  // ---- Deterministic PRNG --------------------------------------------------

  // mulberry32 — 5-line state-of-32-bits PRNG. Deterministic per seed; NOT
  // compatible with Python's MT stream. Distributional validation only.
  function createRng(seed) {
    let s = (seed | 0) >>> 0;
    return {
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
    };
  }

  // ---- Crit roll -----------------------------------------------------------

  // Mirrors combat_loop.py:186-210 roll_crit. Increments hit_counts in place
  // and returns just the multiplier (same shape as the Python version after
  // the recent tuple-elimination quick win).
  function rollCrit(isEnrage, cfg, hc, rng) {
    if (rng.next() < cfg.pCritCh) {
      const baseCDmg = isEnrage ? cfg.pEnragedCritDmg : cfg.pCritDmg;
      if (rng.next() < cfg.pSCritCh) {
        if (rng.next() < cfg.pUCritCh) {
          hc[3] += 1; // ultra
          return baseCDmg * cfg.pSCritDmg * cfg.pUCritDmg;
        }
        hc[2] += 1;   // super
        return baseCDmg * cfg.pSCritDmg;
      }
      hc[1] += 1;     // crit
      return baseCDmg;
    }
    hc[0] += 1;       // normal
    return 1.0;
  }

  // ---- Skill auto-cast tick ------------------------------------------------

  // Mirrors skills.py SkillManager.tick(). Mutates skillState in place.
  // Returns the total flat-stamina restored by Flurry casts during this tick.
  function tickSkills(skillState, cfg, dt, rng) {
    let staminaRestored = 0;

    if (skillState.enrageCd > 0) skillState.enrageCd -= dt;
    if (skillState.flurryCd > 0) skillState.flurryCd -= dt;
    if (skillState.quakeCd > 0)  skillState.quakeCd  -= dt;

    if (skillState.flurryTimer > 0) {
      skillState.flurryTimer -= dt;
      if (skillState.flurryTimer < 0) skillState.flurryTimer = 0.0;
    }

    // Enrage
    if (cfg.autoEnrage) {
      let chain = 0;
      while (skillState.enrageCd <= 0 && chain < 100) {
        skillState.enrageCharges += cfg.pEnrageChargesMax;
        skillState.enrageCd = cfg.pEnrageCdMax;
        skillState.totalEnrageCasts += 1;
        if (rng.next() < cfg.pAbilityInsta) {
          skillState.enrageCd = 0.0;
          skillState.totalInstacharges += 1;
          chain += 1;
        } else {
          break;
        }
      }
    }

    // Flurry
    if (cfg.autoFlurry) {
      let chain = 0;
      while (skillState.flurryCd <= 0 && chain < 100) {
        skillState.flurryTimer += cfg.pFlurryDuration;
        skillState.flurryCd = cfg.pFlurryCdMax;
        skillState.totalFlurryCasts += 1;
        staminaRestored += cfg.pFlurrySta;
        if (rng.next() < cfg.pAbilityInsta) {
          skillState.flurryCd = 0.0;
          skillState.totalInstacharges += 1;
          chain += 1;
        } else {
          break;
        }
      }
    }

    // Quake
    if (cfg.autoQuake) {
      let chain = 0;
      while (skillState.quakeCd <= 0 && chain < 100) {
        skillState.quakeCharges += cfg.pQuakeAttacksMax;
        skillState.quakeCd = cfg.pQuakeCdMax;
        skillState.totalQuakeCasts += 1;
        if (rng.next() < cfg.pAbilityInsta) {
          skillState.quakeCd = 0.0;
          skillState.totalInstacharges += 1;
          chain += 1;
        } else {
          break;
        }
      }
    }

    return staminaRestored;
  }

  // SkillManager.consume_attack() — drops one Enrage charge if present, and
  // returns true (signaling Quake AoE should fire) if a Quake charge was spent.
  function consumeAttack(skillState) {
    let quakeTriggered = false;
    if (skillState.enrageCharges > 0) skillState.enrageCharges -= 1;
    if (skillState.quakeCharges > 0) {
      skillState.quakeCharges -= 1;
      quakeTriggered = true;
    }
    return quakeTriggered;
  }

  // ---- Inner micro-tick ----------------------------------------------------

  // Port of combat_loop.py:246-335. Runs the per-block micro-tick for the
  // slot at PATH_ORDER[pathOrderIdx]. Mutates floorBlocks[slotIdx] hp until
  // the block dies or stamina runs out; Quake AoE may also mutate background
  // blocks (slot indices appended to state.deadBgSlots so Python can run
  // _process_kill_rewards for them after this call returns).
  function tickBlock(cfg, pathOrderIdx, floorBlocks, state, skillState, rng) {
    const slotIdx = PATH_ORDER[pathOrderIdx];
    const target = floorBlocks[slotIdx];
    if (target == null || target.hp <= 0) return;

    const hc = state.hitCounts;

    // Hot-path locals — keeps V8 happy and avoids repeated property loads.
    let stamina = state.stamina;
    let speedPool = state.speedPool;
    let crosshairTimer = state.crosshairTimer;
    let totalTime = state.totalTime;

    while (target.hp > 0 && stamina > 0) {
      const isFlurry = skillState.flurryTimer > 0;
      const isEnrage = skillState.enrageCharges > 0;

      const flurryMult = isFlurry ? 1.0 + cfg.pFlurryBonusAtkSpd : 1.0;

      let currentAtkSpd;
      if (speedPool > 0) {
        currentAtkSpd = cfg.pAtkSpd * cfg.pSpeedModAtkRate * flurryMult;
        speedPool -= 1;
      } else {
        currentAtkSpd = cfg.pAtkSpd * flurryMult;
      }

      const timePassed = 1.0 / currentAtkSpd;
      totalTime += timePassed;
      crosshairTimer += timePassed;

      // Crosshair spawn + auto-tap
      while (crosshairTimer >= cfg.crosshairInterval) {
        crosshairTimer -= cfg.crosshairInterval;
        state.crosshairSpawns += 1;

        if (rng.next() < cfg.pCrosshairAutoTap) {
          const chBaseDmg = isEnrage ? cfg.pEnragedDamage : cfg.pDamage;
          const chEffArmor = Math.max(0, target.armor - cfg.pArmorPen);

          let chActualDmg;
          if (rng.next() < cfg.pGoldCrosshairChance) {
            const chCritMult = rollCrit(isEnrage, cfg, hc, rng);
            chActualDmg = Math.max(
              1.0,
              (chBaseDmg - chEffArmor) * cfg.pGoldCrosshairMult * chCritMult
            );
          } else {
            chActualDmg = Math.max(1.0, chBaseDmg - chEffArmor);
          }

          const effCh = Math.min(chActualDmg, target.hp);
          state.overkillDamage += chActualDmg - effCh;
          state.crosshairDamage += chActualDmg;
          target.hp -= chActualDmg;
        }
      }

      if (target.hp <= 0) break;

      // Skills tick + flurry stamina refund
      const staRestored = tickSkills(skillState, cfg, timePassed, rng);
      if (staRestored > 0) {
        const actualGain = Math.min(cfg.pMaxSta - stamina, staRestored);
        stamina += actualGain;
        state.staminaRefundedFlurry += actualGain;
        state.staminaWastedOvercap += staRestored - actualGain;
      }

      // Melee hit
      const critMult = rollCrit(isEnrage, cfg, hc, rng);
      const baseDmg = isEnrage ? cfg.pEnragedDamage : cfg.pDamage;
      const effArmor = Math.max(0, target.armor - cfg.pArmorPen);
      const actualDmg = Math.max(1.0, (baseDmg - effArmor) * critMult);

      const effMelee = Math.min(actualDmg, target.hp);
      state.overkillDamage += actualDmg - effMelee;
      state.meleeDamage += actualDmg;
      target.hp -= actualDmg;
      stamina -= STAMINA_COST_PER_HIT;
      state.totalStaminaSpent += STAMINA_COST_PER_HIT;

      // Quake AoE
      const quakeTriggered = consumeAttack(skillState);
      if (quakeTriggered) {
        const qBase = baseDmg * cfg.pQuakeDmgToAll;
        for (let j = pathOrderIdx + 1; j < PATH_ORDER.length; j++) {
          const bgSlot = PATH_ORDER[j];
          const bgBlock = floorBlocks[bgSlot];
          if (bgBlock != null && bgBlock.hp > 0) {
            const qCrit = rollCrit(isEnrage, cfg, hc, rng);
            const bgEffArmor = Math.max(0, bgBlock.armor - cfg.pArmorPen);
            const qDmg = Math.max(1.0, (qBase - bgEffArmor) * qCrit);

            const qEff = Math.min(qDmg, bgBlock.hp);
            state.overkillDamage += qDmg - qEff;
            state.quakeDamage += qDmg;
            bgBlock.hp -= qDmg;

            if (bgBlock.hp <= 0) {
              // Python's _process_kill_rewards applies inline stamina/speed
              // mod effects for bg kills. We defer that to Python after
              // tickBlock returns; for v1 we just record the slot index.
              // Distributional impact should be negligible (Quake-kills are
              // a small fraction of total kills); if validation flags this,
              // pass mod_sta_gain / mod_speed_gain through floor blocks and
              // apply here.
              state.deadBgSlots.push(bgSlot);
            }
          }
        }
      }
    }

    // Flush hot locals back to state
    state.stamina = stamina;
    state.speedPool = speedPool;
    state.crosshairTimer = crosshairTimer;
    state.totalTime = totalTime;
  }

  // ---- Public surface ------------------------------------------------------

  global.IoMCombatKernel = {
    createRng: createRng,
    tickBlock: tickBlock,
    tickSkills: tickSkills,
    consumeAttack: consumeAttack,
    PATH_ORDER: PATH_ORDER,
  };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
