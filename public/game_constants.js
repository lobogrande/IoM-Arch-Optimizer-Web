// public/game_constants.js
// Shared game constants that need to be accessible from web workers
// Uses plain JavaScript (no ES6 modules) so it can be loaded via importScripts() in workers
//
// ⚠️ IMPORTANT: Keep these values in sync with src/game_data.js
// This is a necessary duplication because:
// - Web workers can only use importScripts(), not ES6 imports
// - React components need ES6 exports
// - There's no way to share a single file between both contexts

// ==============================================================================
// CARD DROP ODDS (1 in X chance per block kill)
// Source of truth: src/game_data.js - keep this copy in sync!
// ==============================================================================
const CARD_DROP_ODDS = {
  // Tier 1-3 blocks (regular, gilded, poly)
  tier_1_3: {
    base_card: 1500,        // 1 in 1,500 for base card drop
    poly_fragment: 7500,    // 1 in 7,500 for poly fragment drop
    infernal_fragment: 75000 // 1 in 75,000 for infernal fragment drop
  },
  // Tier 4 blocks (infernal)
  tier_4: {
    base_card: 5000,        // 1 in 5,000 for base card drop
    poly_fragment: 35000,   // 1 in 35,000 for poly fragment drop
    infernal_fragment: 75000 // 1 in 75,000 for infernal fragment drop
  }
};

// Export for ES6 modules (React components)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CARD_DROP_ODDS };
}

// Make available globally for web workers loaded via importScripts()
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.CARD_DROP_ODDS = CARD_DROP_ODDS;
}
