// src/game_data.js

// ==============================================================================
// BLOCK APPEARANCE RANGES (Mirrored from project_config.py ASC_ORE_RESTRICTIONS)
// ==============================================================================
export const BLOCK_MIN_FLOORS = {
  'dirt1': 1, 'com1': 1, 'rare1': 3, 'epic1': 6, 'leg1': 12, 'myth1': 20, 'div1': 50,
  'dirt2': 12, 'com2': 18, 'rare2': 26, 'epic2': 30, 'leg2': 32, 'myth2': 36, 'div2': 75,
  'dirt3': 24, 'com3': 30, 'rare3': 36, 'epic3': 42, 'leg3': 45, 'myth3': 50, 'div3': 100,
  'dirt4': 81, 'com4': 96, 'rare4': 111, 'epic4': 126, 'leg4': 136, 'myth4': 141, 'div4': 150
};

export const INTERNAL_UPGRADE_CAPS = {
  3: 50, 4: 25, 5: 25, 8: 3, 9: 25, 10: 25, 11: 25, 12: 5, 13: 25, 
  14: 20, 15: 20, 16: 10, 17: 15, 18: 15, 19: 30, 20: 25, 21: 20, 
  22: 10, 23: 5, 24: 30, 25: 5, 26: 5, 27: 30, 28: 15, 29: 10, 
  30: 20, 31: 10, 32: 5, 33: 5, 34: 5, 35: 5, 36: 20, 37: 20, 
  38: 20, 39: 20, 40: 20, 41: 1, 42: 1, 43: 1, 44: 1, 45: 1,  
  46: 30, 47: 1, 48: 5, 49: 5, 50: 25, 51: 5, 52: 10, 53: 40, 
  54: 50, 55: 10
};

export const UPGRADE_NAMES = {
  3: "Gem Stamina", 4: "Gem Exp", 5: "Gem Loot", 8: "Unlock New Ability", 9: "Flat Damage", 10: "Armor Pen.", 
  11: "Exp. Gain", 12: "Stat Points", 13: "Crit Chance/Damage", 14: "Max Sta/Sta Mod Chance", 
  15: "Flat Damage", 16: "Loot Mod Gain", 17: "Unlock Fairy/Armor Pen", 18: "Enrage&Crit Dmg/Enrage CD", 
  19: "Gleaming Floor Chance", 20: "Flat Dmg/Super Crit", 21: "Exp Gain/Frag Gain", 22: "Flurry Sta Gain/Flurry CD", 
  23: "Max Sta/Sta Mod Gain", 24: "All Mod Chances", 25: "Flat Dmg/Damage Up", 26: "Max Sta/Mod Chance", 
  27: "Ability Fairy/Loot Mod", 28: "Exp Gain/Max Sta", 29: "Armor Pen/Ability CDs", 30: "Crit Dmg/Super Crit Dmg", 
  31: "Quake Atks/Cooldown", 32: "Flat Dmg/Enrage CD", 33: "Mod Chance/Armor Pen", 34: "Buff Divinity", 
  35: "Exp Gain/Mod Ch.", 36: "Damage Up/Armor Pen", 37: "Super Crit/Ultra Crit Chance", 38: "Exp Mod Gain/Chance", 
  39: "Ability Insta Chance/Max Sta", 40: "Ultra Crit Dmg/Sta Mod Chance", 41: "Poly Card Bonus", 42: "Frag Gain Mult", 
  43: "Sta Mod Gain", 44: "All Mod Chances", 45: "Exp Gain/Stat Cap Inc.", 46: "Gleaming Floor Multi", 
  47: "Damage Up/Crit Dmg Up", 48: "Gold Crosshair/Auto-Tap", 49: "Flat Dmg/Ultra Crit", 50: "Insta Chance/Sta Mod", 
  51: "Dmg Up/Exp Gain", 52: "Dmg Up / Mod Multi Up", 53: "Super Crit Dmg/Exp Mod", 54: "Max Sta/Auto-Tap Chance", 
  55: "All Mod Multipliers"
};

export const ASC1_LOCKED_UPGS =[12, 17, 24, 32, 40, 47, 48, 49, 50, 51, 53, 54];
export const ASC2_LOCKED_UPGS =[19, 27, 34, 46, 52, 55];

export const CARD_TYPES =['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];

export const INFERNAL_CARD_BONUSES = {
  'dirt1': { text: "Loot Mod Gain", base: 0.1, dec: 4, isPct: true },
  'dirt2': { text: "Exp Gain Mult", base: 0.12, dec: 4, isPct: true },
  'dirt3': { text: "Frag Gain Mult", base: 0.08, dec: 4, isPct: true },
  'dirt4': { text: "Gleaming Multi", base: 0.1, dec: 4, isPct: true },
  'com1':  { text: "Crit Dmg", base: 0.06, dec: 4, isPct: true },
  'com2':  { text: "sCrit Dmg", base: 0.07, dec: 4, isPct: true },
  'com3':  { text: "uCrit Dmg", base: 0.08, dec: 4, isPct: true },
  'com4':  { text: "All Crit Chances", base: 0.015, dec: 4, isPct: true },
  'rare1': { text: "Auto-Tap Chance", base: 0.05, dec: 4, isPct: true },
  'rare2': { text: "Flat Damage", base: 20.0, dec: 0, isPct: false },
  'rare3': { text: "Armor Pen Multi", base: 0.4, dec: 4, isPct: true },
  'rare4': { text: "Loot Mod Gain", base: 0.08, dec: 4, isPct: true },
  'epic1': { text: "Gold Crosshair Multi", base: 0.3, dec: 4, isPct: true },
  'epic2': { text: "sCrit Chance", base: 0.04, dec: 4, isPct: true },
  'epic3': { text: "Max Sta Multi", base: 0.05, dec: 4, isPct: true },
  'epic4': { text: "Crit Dmg", base: 0.1, dec: 4, isPct: true },
  'leg1':  { text: "Frag Gain Mult", base: 0.04, dec: 4, isPct: true },
  'leg2':  { text: "Gold Crosshair Chance", base: 0.05, dec: 4, isPct: true },
  'leg3':  { text: "Flat Armor Pen", base: 40.0, dec: 0, isPct: false },
  'leg4':  { text: "Flat Max Sta", base: 20.0, dec: 0, isPct: false },
  'myth1': { text: "Gleaming Chance", base: 0.013, dec: 4, isPct: true },
  'myth2': { text: "Loot Mod Chance", base: 0.008, dec: 4, isPct: true },
  'myth3': { text: "Sta Mod Chance", base: 0.007, dec: 4, isPct: true },
  'myth4': { text: "Ability Insta Charge", base: 0.01, dec: 4, isPct: true },
  'div1':  { text: "Damage Multi", base: 0.1, dec: 4, isPct: true },
  'div2':  { text: "Gleaming Chance", base: 0.0125, dec: 4, isPct: true },
  'div3':  { text: "Sta Mod Gain", base: 1.126, dec: 0, isPct: false },
  'div4':  { text: "All Mod Chances", base: 0.005, dec: 4, isPct: true }
};

export const EXTERNAL_UI_GROUPS =[
    {id: "hestia", name: "Hestia Idol", rows:[4], ui_type: "number", max: 3000, img: "4_hestia.png"},
    {id: "hades", name: "Hades Idol", rows:[21], ui_type: "number", max: 6666},
    {id: "axolotl", name: "Axolotl Pet Quest Rank", rows:[5], ui_type: "pet", max: 11, img: "5_axolotl.png"},
    {id: "dino", name: "Dino Pet Quest Rank", rows: [6, 7], ui_type: "pet", max: 11, img: "6_7_dino.png"},
    {id: "geoduck", name: "Geoduck Tribute", rows: [8], ui_type: "number", max: 9999, img: "8_geoduck.png"},
    {id: "avada", name: "Avada Keda- Skill", rows:[9, 10, 11], ui_type: "skill", imgs:["9_11_avada-keda_1.png", "9_11_avada-keda_2.png"]},
    {id: "block", name: "Block Bonker Skill", rows:[12, 13, 14], ui_type: "skill", imgs:["12_14_block-bonker_1.png", "12_14_block-bonker_2.png"]},
    {id: "arch_bundle", name: "Archaeology Bundle", rows: [15], ui_type: "bundle"},
    {id: "asc_bundle", "name": "Ascension Bundle", rows:[16, 17, 18, 19], ui_type: "bundle"},
    {id: "arch_card", name: "Arch Ability Card", rows: [20], ui_type: "card", max: 4}
];

export const UPGRADE_LEVEL_REQS = {
  8: 0, 9: 0, 10: 2, 11: 3, 12: 4, 13: 4, 14: 5, 15: 6, 16: 6, 17: 7, 18: 7,
  19: 8, 20: 9, 21: 10, 22: 11, 23: 12, 24: 12, 25: 13, 26: 15, 27: 16, 28: 17,
  29: 18, 30: 20, 31: 20, 32: 21, 33: 22, 34: 23, 35: 24, 36: 26, 37: 28, 38: 30,
  39: 32, 40: 33, 41: 34, 42: 36, 43: 38, 44: 40, 45: 42, 46: 45, 47: 50, 48: 55,
  49: 60, 50: 65, 51: 70, 52: 72, 53: 85, 54: 90, 55: 92
};

export const CURRENCY_TYPES =['gems', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];

export const UPGRADE_COST_DATA = {
  3: { currency: 'gems', base:[300, 15000, 30000], mult: 1.05, cap:[1000, null, null] },
  4: { currency: 'gems', base:[400, 20000, 40000], mult: 1.05, cap: [1000, null, null] },
  5: { currency: 'gems', base:[500, 25000, 50000], mult: 1.05, cap: [1000, null, null] },
  8: { type: 'custom', costs: [
      { currency: 'com', amount:[100000, 500000, 1000000] },
      { currency: 'rare', amount:[750000, 3750000, 7500000] },
      { currency: 'epic', amount:[1500000, 7500000, 15000000] }
  ]},
  9:  { currency: 'com', base:[0.5, 2.5, 5], mult: 1.2 },
  10: { currency: 'com', base:[0.75, 3.75, 7.5], mult: 1.2 },
  11: { currency: 'com', base:[1, 5, 10], mult: 1.2 },
  12: { currency: 'com', base:[null, 7.25, 14.5], mult: 2.0 },
  13: { currency: 'com', base:[2, 10, 20], mult: 1.2 },
  14: { currency: 'rare', base:[2, 10, 20], mult: 1.2 },
  15: { currency: 'rare', base:[3, 15, 30], mult: 1.2 },
  16: { currency: 'rare', base:[4.5, 22.5, 45], mult: 1.2 },
  17: { currency: 'rare', base:[null, 37.5, 75], mult: 1.35 },
  18: { currency: 'rare', base:[6, 30, 60], mult: 1.2 },
  19: { currency: 'com', base:[null, null, 200], mult: 1.2 },
  20: { currency: 'epic', base:[3.5, 17.5, 35], mult: 1.2 },
  21: { currency: 'epic', base:[5, 25, 50], mult: 1.2 },
  22: { currency: 'epic', base:[7.5, 37.5, 75], mult: 1.2 },
  23: { currency: 'epic', base:[25, 125, 250], mult: 1.2 },
  24: { currency: 'epic', base:[null, 175, 350], mult: 1.2 },
  25: { currency: 'com', base:[100, 500, 1000], mult: 1.2 },
  26: { currency: 'rare', base:[50, 250, 500], mult: 1.2 },
  27: { currency: 'rare', base:[null, null, 1000], mult: 1.35 },
  28: { currency: 'leg', base:[7, 35, 70], mult: 1.2 },
  29: { currency: 'leg', base:[9, 45, 90], mult: 1.2 },
  30: { currency: 'leg', base:[12, 60, 120], mult: 1.2 },
  31: { currency: 'leg', base:[15, 75, 150], mult: 1.2 },
  32: { currency: 'leg', base:[null, 225, 450], mult: 1.2 },
  33: { currency: 'rare', base:[150, 750, 1500], mult: 1.2 },
  34: { currency: 'epic', base:[null, null, 5000], mult: 1.2 },
  35: { currency: 'epic', base:[125, 625, 1250], mult: 1.2 },
  36: { currency: 'myth', base:[6, 30, 60], mult: 1.2 },
  37: { currency: 'myth', base:[10, 50, 100], mult: 1.2 },
  38: { currency: 'myth', base:[15, 75, 150], mult: 1.2 },
  39: { currency: 'myth', base:[20, 100, 200], mult: 1.2 },
  40: { currency: 'myth', base:[null, 175, 350], mult: 1.2 },
  41: { currency: 'com', base:[10000, 50000, 100000], mult: 1.2 },
  42: { currency: 'rare', base:[9000, 45000, 90000], mult: 1.2 },
  43: { currency: 'epic', base:[8000, 40000, 80000], mult: 1.2 },
  44: { currency: 'leg', base:[7000, 35000, 70000], mult: 1.2 },
  45: { currency: 'myth', base:[5000, 25000, 50000], mult: 1.2 },
  46: { currency: 'leg', base:[null, null, 2500], mult: 1.2 },
  47: { currency: 'div', base:[null, 10, 20], mult: 1.2 },
  48: { currency: 'div', base:[null, 7.5, 15], mult: 1.2 },
  49: { currency: 'div', base:[null, 12.5, 25], mult: 1.2 },
  50: { currency: 'div', base:[null, 25, 50], mult: 1.2 },
  51: { currency: 'div', base:[null, 250, 500], mult: 1.2 },
  52: { currency: 'myth', base:[null, null, 8000], mult: 1.2 },
  53: { currency: 'leg', base:[null, 375, 750], mult: 1.2 },
  54: { currency: 'myth', base:[null, 475, 950], mult: 1.2 },
  55: { currency: 'div', base:[null, null, 7500], mult: 1.2 }
};

export const calculateUpgradeCost = (upgId, targetLevel, ascTier) => {
  const data = UPGRADE_COST_DATA[upgId];
  if (!data) return null;

  if (data.type === 'custom') {
    const step = data.costs[targetLevel - 1];
    if (!step) return null;
    return { currency: step.currency, amount: step.amount[ascTier] };
  }

  const base = data.base[ascTier];
  if (base === undefined || base === null) return null;

  let amount = base;
  if (data.mult) {
    amount = base * Math.pow(data.mult, targetLevel - 1);
  }

  if (data.cap && data.cap[ascTier] && amount > data.cap[ascTier]) {
    amount = data.cap[ascTier];
  }

  if (data.currency === 'gems') {
    amount = ascTier === 0 ? Math.floor(amount) : Math.round(amount);
  } else {
    // Fragments use exact 2-decimal rounding
    amount = Math.round(amount * 100) / 100;
  }

  return { currency: data.currency, amount };
};