// public/combat_kernel.js
// JavaScript port of the combat micro-tick + reward-processing pipeline from
// public/engine/combat_loop.py.  Entry point is `tickFloor`, which runs the
// full per-slot iteration for one generated floor: micro-tick combat,
// Quake AoE, and _process_kill_rewards-equivalent tallying — all inside JS
// so Python only has to bridge once per floor (~80 crossings per sim) instead
// of once per block (~2,400 crossings).
//
// Off by default. The engine worker only invokes this kernel when the
// useJsKernel store flag is true; the Python engine remains the source
// of truth and the default code path.
//
// IMPORTANT: this is NOT bit-identical to the Python engine. It uses a
// mulberry32 PRNG instead of Python's Mersenne Twister, so per-seed outputs
// will differ. Validation is distributional (see scripts/diff_baselines.mjs).
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
  const STAMINA_COST_PER_ORE = 0.0;

  // ---- Deterministic PRNG --------------------------------------------------

  // mulberry32 — 5-line 32-bit PRNG. Deterministic per seed; NOT
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

  // Mirrors combat_loop.py roll_crit. Increments hit_counts in place and
  // returns just the multiplier (same shape as the Python version after the
  // recent tuple-elimination quick win).
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
  // Returns total flat-stamina restored by Flurry casts during this tick.
  function tickSkills(skillState, cfg, dt, rng) {
    let staminaRestored = 0;

    if (skillState.enrageCd > 0) skillState.enrageCd -= dt;
    if (skillState.flurryCd > 0) skillState.flurryCd -= dt;
    if (skillState.quakeCd > 0)  skillState.quakeCd  -= dt;

    if (skillState.flurryTimer > 0) {
      skillState.flurryTimer -= dt;
      if (skillState.flurryTimer < 0) skillState.flurryTimer = 0.0;
    }

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
        } else { break; }
      }
    }

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
        } else { break; }
      }
    }

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
        } else { break; }
      }
    }

    return staminaRestored;
  }

  function consumeAttack(skillState) {
    let quakeTriggered = false;
    if (skillState.enrageCharges > 0) skillState.enrageCharges -= 1;
    if (skillState.quakeCharges > 0) {
      skillState.quakeCharges -= 1;
      quakeTriggered = true;
    }
    return quakeTriggered;
  }

  // ---- Kill-reward processing ----------------------------------------------

  // Mirrors combat_loop.py _process_kill_rewards. Applies both the inline
  // effects (stamina/speed mods) AND the telemetry tallies (xp, loot,
  // blocks_mined, specific tracking, div-tier tracking).
  function applyKillRewards(block, floorData, state, cfg) {
    const xpYield = block.xp * block.modExpMulti * floorData.gleamingMulti;
    state.totalXp += xpYield;

    const lootYield = block.fragAmt * block.modLootMulti * floorData.gleamingMulti;
    // totalFrags is a 7-element array indexed by frag tier (0..6).
    if (block.fragType >= 0 && block.fragType < state.totalFrags.length) {
      state.totalFrags[block.fragType] += lootYield;
      if (block.blockId.startsWith('div')) {
        if (block.blockId in state.divTierKills) {
          state.divTierKills[block.blockId] += 1;
          state.divTierFrags[block.blockId] += lootYield;
        }
      }
    }

    if (block.modStaGain > 0) {
      const actualGain = Math.min(cfg.pMaxSta - state.stamina, block.modStaGain);
      state.stamina += actualGain;
      state.staminaRefundedMods += actualGain;
      state.staminaWastedOvercap += block.modStaGain - actualGain;
    }

    if (block.modSpeedActive) {
      state.speedPool += block.modSpeedGain;
    }

    state.blocksMined += 1;

    const bid = block.blockId;
    state.specificBlocksMined[bid] = (state.specificBlocksMined[bid] || 0) + 1;
    state.specificBlocksFrags[bid] = (state.specificBlocksFrags[bid] || 0) + lootYield;
  }

  // ---- Inner micro-tick (per-block) ---------------------------------------

  // Internal helper. Runs the per-block micro-tick for slot PATH_ORDER[pathOrderIdx]
  // until the target dies or stamina runs out. Quake AoE may damage and kill
  // background blocks; their rewards are applied inline to match Python
  // ordering (so a kill mid-tick's stamina_gain affects subsequent ticks
  // within the same call).
  function microTick(cfg, pathOrderIdx, floorData, state, skillState, rng) {
    const slotIdx = PATH_ORDER[pathOrderIdx];
    const blocks = floorData.blocks;
    const target = blocks[slotIdx];
    if (target == null || target.hp <= 0) return;

    const hc = state.hitCounts;

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

      // We have to flush stamina back into the state object before tickSkills
      // /  applyKillRewards, since those read state.stamina directly.
      state.stamina = stamina;
      state.speedPool = speedPool;

      const staRestored = tickSkills(skillState, cfg, timePassed, rng);
      if (staRestored > 0) {
        const actualGain = Math.min(cfg.pMaxSta - state.stamina, staRestored);
        state.stamina += actualGain;
        state.staminaRefundedFlurry += actualGain;
        state.staminaWastedOvercap += staRestored - actualGain;
      }
      // Resync after Flurry stamina refund (may have raised state.stamina).
      stamina = state.stamina;

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

      const quakeTriggered = consumeAttack(skillState);
      if (quakeTriggered) {
        const qBase = baseDmg * cfg.pQuakeDmgToAll;
        for (let j = pathOrderIdx + 1; j < PATH_ORDER.length; j++) {
          const bgSlot = PATH_ORDER[j];
          const bgBlock = blocks[bgSlot];
          if (bgBlock != null && bgBlock.hp > 0) {
            const qCrit = rollCrit(isEnrage, cfg, hc, rng);
            const bgEffArmor = Math.max(0, bgBlock.armor - cfg.pArmorPen);
            const qDmg = Math.max(1.0, (qBase - bgEffArmor) * qCrit);

            const qEff = Math.min(qDmg, bgBlock.hp);
            state.overkillDamage += qDmg - qEff;
            state.quakeDamage += qDmg;
            bgBlock.hp -= qDmg;

            if (bgBlock.hp <= 0) {
              // Sync hot locals so applyKillRewards reads consistent stamina.
              state.stamina = stamina;
              state.speedPool = speedPool;
              applyKillRewards(bgBlock, floorData, state, cfg);
              // Re-load — applyKillRewards may have raised stamina + speed_pool
              stamina = state.stamina;
              speedPool = state.speedPool;
            }
          }
        }
      }
    }

    state.stamina = stamina;
    state.speedPool = speedPool;
    state.crosshairTimer = crosshairTimer;
    state.totalTime = totalTime;
  }

  // ---- Public per-floor entry ---------------------------------------------

  // Iterates PATH_ORDER for one floor: per-slot stamina cost, inner micro-tick,
  // kill-reward processing, per-slot telemetry snapshot. Returns when stamina
  // exhausts or all slots are processed.
  function tickFloor(cfg, floorData, state, skillState, rng) {
    const blocks = floorData.blocks;

    for (let i = 0; i < PATH_ORDER.length; i++) {
      if (state.stamina <= 0) break;
      const slotIdx = PATH_ORDER[i];
      const target = blocks[slotIdx];
      if (target == null || target.hp <= 0) continue;

      state.stamina -= STAMINA_COST_PER_ORE;
      state.totalStaminaSpent += STAMINA_COST_PER_ORE;

      microTick(cfg, i, floorData, state, skillState, rng);

      if (target.hp <= 0) {
        applyKillRewards(target, floorData, state, cfg);
      }

      // Per-slot telemetry snapshot — matches Python's state.record_telemetry()
      state.historyFloor.push(state.highestFloor);
      state.historyStamina.push(state.stamina);
    }
  }

  // ---- Public surface ------------------------------------------------------

  global.IoMCombatKernel = {
    createRng: createRng,
    tickFloor: tickFloor,
    tickSkills: tickSkills,
    PATH_ORDER: PATH_ORDER,
  };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
