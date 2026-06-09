//! Constants ported from `public/project_config.py`.  These are the
//! game's static data tables — block base stats, ascension-dependent ore
//! restrictions, base-stat caps, internal-upgrade caps.  Boss-floor layouts
//! (`ASC_BOSS_DATA`) land in Phase 5 alongside the FloorGenerator port.
//!
//! Block IDs are encoded as a `BlockId` enum so the rest of the engine can
//! index arrays without string hashing.  Layout: tier-major then rarity:
//! `index(BlockId) = (tier - 1) * 7 + rarity_idx`, where tier ∈ {1..4} and
//! rarity_idx ∈ {dirt=0, com=1, rare=2, epic=3, leg=4, myth=5, div=6}.

/// 7 possible ore rarities.  Index matches the fragment type (`ft`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Rarity {
    Dirt = 0,
    Com = 1,
    Rare = 2,
    Epic = 3,
    Leg = 4,
    Myth = 5,
    Div = 6,
}

/// 28 distinct block IDs.  Order matches the layout in `BLOCK_BASE_STATS`,
/// `ORE_RESTRICTIONS_ASC1`, etc.  `as usize` gives the canonical index.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BlockId {
    Dirt1 = 0,  Com1,  Rare1,  Epic1,  Leg1,  Myth1,  Div1,
    Dirt2,      Com2,  Rare2,  Epic2,  Leg2,  Myth2,  Div2,
    Dirt3,      Com3,  Rare3,  Epic3,  Leg3,  Myth3,  Div3,
    Dirt4,      Com4,  Rare4,  Epic4,  Leg4,  Myth4,  Div4,
}

impl BlockId {
    pub const COUNT: usize = 28;

    /// Parse a block ID from its game-data string (e.g. "rare3").  Returns
    /// None for unknown strings.  Used at sim setup to translate the
    /// store/save format into engine indices.
    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "dirt1" => Self::Dirt1, "com1" => Self::Com1, "rare1" => Self::Rare1,
            "epic1" => Self::Epic1, "leg1" => Self::Leg1, "myth1" => Self::Myth1, "div1" => Self::Div1,
            "dirt2" => Self::Dirt2, "com2" => Self::Com2, "rare2" => Self::Rare2,
            "epic2" => Self::Epic2, "leg2" => Self::Leg2, "myth2" => Self::Myth2, "div2" => Self::Div2,
            "dirt3" => Self::Dirt3, "com3" => Self::Com3, "rare3" => Self::Rare3,
            "epic3" => Self::Epic3, "leg3" => Self::Leg3, "myth3" => Self::Myth3, "div3" => Self::Div3,
            "dirt4" => Self::Dirt4, "com4" => Self::Com4, "rare4" => Self::Rare4,
            "epic4" => Self::Epic4, "leg4" => Self::Leg4, "myth4" => Self::Myth4, "div4" => Self::Div4,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        BLOCK_ID_STRINGS[self as usize]
    }

    pub fn idx(self) -> usize {
        self as usize
    }

    pub fn tier(self) -> u8 {
        (self.idx() / 7) as u8 + 1
    }

    /// Construct a BlockId from a (rarity_idx, tier) pair.
    /// rarity ∈ 0..=6 (dirt..=div), tier ∈ 1..=4.  Used by floor_map's
    /// spawn algorithm to translate `(rarity, tier)` rolls into block IDs.
    pub fn from_rarity_tier(rarity: u8, tier: u8) -> Self {
        assert!(rarity < 7 && (1..=4).contains(&tier));
        let idx = (tier as usize - 1) * 7 + rarity as usize;
        // SAFETY: idx ∈ 0..28, BlockId is #[repr(u8)] with that exact layout.
        unsafe { std::mem::transmute::<u8, BlockId>(idx as u8) }
    }

    /// BlockId from its 0..28 index (the same value as `idx()`).
    /// Returns None for out-of-range indices.
    pub fn from_idx(idx: usize) -> Option<Self> {
        if idx >= Self::COUNT {
            return None;
        }
        // SAFETY: idx ∈ 0..28, BlockId is #[repr(u8)] with sequential layout.
        Some(unsafe { std::mem::transmute::<u8, BlockId>(idx as u8) })
    }

    pub fn rarity(self) -> Rarity {
        match self.idx() % 7 {
            0 => Rarity::Dirt, 1 => Rarity::Com, 2 => Rarity::Rare, 3 => Rarity::Epic,
            4 => Rarity::Leg, 5 => Rarity::Myth, 6 => Rarity::Div, _ => unreachable!(),
        }
    }
}

pub const BLOCK_ID_STRINGS: [&str; BlockId::COUNT] = [
    "dirt1", "com1", "rare1", "epic1", "leg1", "myth1", "div1",
    "dirt2", "com2", "rare2", "epic2", "leg2", "myth2", "div2",
    "dirt3", "com3", "rare3", "epic3", "leg3", "myth3", "div3",
    "dirt4", "com4", "rare4", "epic4", "leg4", "myth4", "div4",
];

/// Block base stats (HP / Armor / XP / FragType / FragAmt).  These are the
/// pre-scaling values from `project_config.py:BLOCK_BASE_STATS`.
#[derive(Debug, Clone, Copy)]
pub struct BlockBaseStat {
    pub hp: f64,
    pub xp: f64,
    pub armor: f64,
    pub frag_type: u8,
    pub frag_amt: f64,
}

pub const BLOCK_BASE_STATS: [BlockBaseStat; BlockId::COUNT] = [
    // Tier 1
    BlockBaseStat { hp:   100.0, xp:  0.05, armor:   0.0, frag_type: 0, frag_amt: 0.0  },  // dirt1
    BlockBaseStat { hp:   250.0, xp:  0.15, armor:   5.0, frag_type: 1, frag_amt: 0.01 },  // com1
    BlockBaseStat { hp:   550.0, xp:  0.35, armor:  12.0, frag_type: 2, frag_amt: 0.01 },  // rare1
    BlockBaseStat { hp:  1150.0, xp:  1.0,  armor:  25.0, frag_type: 3, frag_amt: 0.01 },  // epic1
    BlockBaseStat { hp:  1950.0, xp:  3.5,  armor:  50.0, frag_type: 4, frag_amt: 0.01 },  // leg1
    BlockBaseStat { hp:  3500.0, xp:  7.5,  armor: 150.0, frag_type: 5, frag_amt: 0.01 },  // myth1
    BlockBaseStat { hp: 25000.0, xp: 20.0,  armor: 300.0, frag_type: 6, frag_amt: 0.01 },  // div1
    // Tier 2
    BlockBaseStat { hp:   300.0, xp:  0.15, armor:   0.0, frag_type: 0, frag_amt: 0.0  },  // dirt2
    BlockBaseStat { hp:   750.0, xp:  0.45, armor:   8.0, frag_type: 1, frag_amt: 0.02 },  // com2
    BlockBaseStat { hp:  1650.0, xp:  1.05, armor:  20.0, frag_type: 2, frag_amt: 0.02 },  // rare2
    BlockBaseStat { hp:  3450.0, xp:  3.0,  armor:  41.0, frag_type: 3, frag_amt: 0.02 },  // epic2
    BlockBaseStat { hp:  5850.0, xp: 10.5,  armor:  83.0, frag_type: 4, frag_amt: 0.02 },  // leg2
    BlockBaseStat { hp: 10500.0, xp: 22.5,  armor: 248.0, frag_type: 5, frag_amt: 0.02 },  // myth2
    BlockBaseStat { hp: 75000.0, xp: 60.0,  armor: 495.0, frag_type: 6, frag_amt: 0.02 },  // div2
    // Tier 3
    BlockBaseStat { hp:    900.0, xp:   0.45, armor:   0.0, frag_type: 0, frag_amt: 0.0  },  // dirt3
    BlockBaseStat { hp:   2250.0, xp:   1.35, armor:  14.0, frag_type: 1, frag_amt: 0.04 },  // com3
    BlockBaseStat { hp:   4950.0, xp:   3.15, armor:  33.0, frag_type: 2, frag_amt: 0.04 },  // rare3
    BlockBaseStat { hp:  10350.0, xp:   9.0,  armor:  68.0, frag_type: 3, frag_amt: 0.04 },  // epic3
    BlockBaseStat { hp:  17550.0, xp:  31.5,  armor: 136.0, frag_type: 4, frag_amt: 0.04 },  // leg3
    BlockBaseStat { hp:  31500.0, xp:  67.5,  armor: 408.0, frag_type: 5, frag_amt: 0.04 },  // myth3
    BlockBaseStat { hp: 225000.0, xp: 180.0,  armor: 817.0, frag_type: 6, frag_amt: 0.04 },  // div3
    // Tier 4
    BlockBaseStat { hp:   2700.0, xp:   1.35,  armor:    0.0, frag_type: 0, frag_amt: 0.0  },  // dirt4
    BlockBaseStat { hp:   6750.0, xp:   4.05,  armor:   22.0, frag_type: 1, frag_amt: 0.08 },  // com4
    BlockBaseStat { hp:  14850.0, xp:   9.45,  armor:   54.0, frag_type: 2, frag_amt: 0.08 },  // rare4
    BlockBaseStat { hp:  31050.0, xp:  27.0,   armor:  112.0, frag_type: 3, frag_amt: 0.08 },  // epic4
    BlockBaseStat { hp:  52650.0, xp:  94.5,   armor:  225.0, frag_type: 4, frag_amt: 0.08 },  // leg4
    BlockBaseStat { hp:  94500.0, xp: 202.5,   armor:  674.0, frag_type: 5, frag_amt: 0.08 },  // myth4
    BlockBaseStat { hp: 675000.0, xp: 540.0,   armor: 1348.0, frag_type: 6, frag_amt: 0.08 },  // div4
];

/// Ore floor ranges (inclusive) for Asc1.  Index by `BlockId as usize`.
/// `(0, 0)` means the block does not appear in this ascension.
pub const ORE_RESTRICTIONS_ASC1: [(u32, u32); BlockId::COUNT] = [
    (1, 11), (1, 17), (3, 25), (6, 29), (12, 31), (20, 34), (50, 74),         // Tier 1
    (12, 23), (18, 28), (26, 35), (30, 41), (32, 44), (36, 49), (75, 99),     // Tier 2
    (24, 999), (30, 999), (36, 999), (42, 999), (45, 999), (50, 999), (100, 999), // Tier 3
    (0, 0), (0, 0), (0, 0), (0, 0), (0, 0), (0, 0), (0, 0),                   // Tier 4 — locked pre-Asc2
];

/// Ore floor ranges (inclusive) for Asc2.
pub const ORE_RESTRICTIONS_ASC2: [(u32, u32); BlockId::COUNT] = [
    (1, 11), (1, 17), (3, 25), (6, 29), (12, 31), (20, 34), (50, 74),         // Tier 1
    (12, 23), (18, 28), (26, 35), (30, 41), (32, 44), (36, 49), (75, 99),     // Tier 2
    (24, 80), (30, 95), (36, 110), (42, 125), (45, 135), (50, 140), (100, 149),// Tier 3 (capped in Asc2)
    (81, 999), (96, 999), (111, 999), (126, 999), (136, 999), (141, 999), (150, 999), // Tier 4
];

/// 7 base stats.  Index matches the `Stat` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Stat {
    Str = 0, Agi = 1, Per = 2, Int = 3, Luck = 4, Div = 5, Corr = 6,
}

impl Stat {
    pub const COUNT: usize = 7;
    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "Str" => Self::Str, "Agi" => Self::Agi, "Per" => Self::Per,
            "Int" => Self::Int, "Luck" => Self::Luck,
            "Div" => Self::Div, "Corr" => Self::Corr,
            _ => return None,
        })
    }
}

/// Pre-Asc cap on each base stat.  Per `project_config.py:BASE_STAT_CAPS`.
/// "Exp Gain/All Stat Cap Inc." upgrade #45 adds +5 to each at level 1.
pub const BASE_STAT_CAPS: [u32; Stat::COUNT] = [50, 50, 25, 25, 25, 10, 10];

/// Internal upgrade caps. Index = upgrade ID (0..=55). 0 means "no upgrade
/// at this ID" (IDs 0,1,2,6,7 are unused per the game's numbering).
pub const INTERNAL_UPGRADE_CAPS: [u32; 56] = {
    let mut caps = [0u32; 56];
    caps[3]  = 50; caps[4]  = 25; caps[5]  = 25; caps[8]  = 3;  caps[9]  = 25;
    caps[10] = 25; caps[11] = 25; caps[12] = 5;  caps[13] = 25; caps[14] = 20;
    caps[15] = 20; caps[16] = 10; caps[17] = 15; caps[18] = 15; caps[19] = 30;
    caps[20] = 25; caps[21] = 20; caps[22] = 10; caps[23] = 5;  caps[24] = 30;
    caps[25] = 5;  caps[26] = 5;  caps[27] = 30; caps[28] = 15; caps[29] = 10;
    caps[30] = 20; caps[31] = 10; caps[32] = 5;  caps[33] = 5;  caps[34] = 5;
    caps[35] = 5;  caps[36] = 20; caps[37] = 20; caps[38] = 20; caps[39] = 20;
    caps[40] = 20; caps[41] = 1;  caps[42] = 1;  caps[43] = 1;  caps[44] = 1;
    caps[45] = 1;  caps[46] = 30; caps[47] = 1;  caps[48] = 5;  caps[49] = 5;
    caps[50] = 25; caps[51] = 5;  caps[52] = 10; caps[53] = 40; caps[54] = 50;
    caps[55] = 10;
    caps
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_id_round_trip() {
        for i in 0..BlockId::COUNT {
            let s = BLOCK_ID_STRINGS[i];
            let parsed = BlockId::from_str(s).unwrap();
            assert_eq!(parsed.idx(), i, "round-trip failed for {s}");
            assert_eq!(parsed.as_str(), s);
        }
        assert!(BlockId::from_str("nonsense").is_none());
    }

    #[test]
    fn block_id_layout() {
        assert_eq!(BlockId::Dirt1.tier(), 1);
        assert_eq!(BlockId::Div4.tier(), 4);
        assert_eq!(BlockId::Rare2.rarity(), Rarity::Rare);
        assert_eq!(BlockId::Div1.rarity(), Rarity::Div);
    }

    #[test]
    fn block_stats_align_with_ids() {
        // Spot check a few well-known values from project_config.py
        let dirt1 = BLOCK_BASE_STATS[BlockId::Dirt1.idx()];
        assert_eq!(dirt1.hp, 100.0);
        assert_eq!(dirt1.armor, 0.0);

        let div4 = BLOCK_BASE_STATS[BlockId::Div4.idx()];
        assert_eq!(div4.hp, 675_000.0);
        assert_eq!(div4.armor, 1348.0);
        assert_eq!(div4.frag_type, 6);
    }

    #[test]
    fn upgrade_caps_match_python() {
        // Spot check against project_config.py:INTERNAL_UPGRADE_CAPS
        assert_eq!(INTERNAL_UPGRADE_CAPS[3],  50);
        assert_eq!(INTERNAL_UPGRADE_CAPS[8],  3);
        assert_eq!(INTERNAL_UPGRADE_CAPS[54], 50);
        assert_eq!(INTERNAL_UPGRADE_CAPS[55], 10);
        // IDs 0, 1, 2, 6, 7 are unused
        assert_eq!(INTERNAL_UPGRADE_CAPS[0], 0);
        assert_eq!(INTERNAL_UPGRADE_CAPS[6], 0);
        assert_eq!(INTERNAL_UPGRADE_CAPS[7], 0);
    }

    #[test]
    fn stat_round_trip() {
        for s in ["Str", "Agi", "Per", "Int", "Luck", "Div", "Corr"] {
            assert!(Stat::from_str(s).is_some(), "{s} should parse");
        }
        assert!(Stat::from_str("Nope").is_none());
    }
}
