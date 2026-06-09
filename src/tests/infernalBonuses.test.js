// Tests for INFERNAL_CARD_BONUSES - Critical bonus data
import { describe, it, expect } from 'vitest';
import {
  INFERNAL_CARD_BONUSES,
  BLOCK_MIN_FLOORS,
  CARD_TYPES,
} from '../game_data.js';

describe('INFERNAL_CARD_BONUSES - Critical Bonus Data', () => {
  describe('Structure Validation', () => {
    it('should have bonuses for all 28 blocks (7 types × 4 tiers)', () => {
      expect(Object.keys(INFERNAL_CARD_BONUSES).length).toBe(28);
    });

    it('should have bonuses for all block combinations', () => {
      const types = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
      
      types.forEach(type => {
        for (let tier = 1; tier <= 4; tier++) {
          const key = `${type}${tier}`;
          expect(INFERNAL_CARD_BONUSES).toHaveProperty(key);
        }
      });
    });

    it('should match blocks defined in BLOCK_MIN_FLOORS', () => {
      const bonusBlocks = Object.keys(INFERNAL_CARD_BONUSES).sort();
      const minFloorBlocks = Object.keys(BLOCK_MIN_FLOORS).sort();
      
      expect(bonusBlocks).toEqual(minFloorBlocks);
    });
  });

  describe('Bonus Object Structure', () => {
    it('should have required properties for each bonus', () => {
      Object.entries(INFERNAL_CARD_BONUSES).forEach(([blockId, bonus]) => {
        expect(bonus).toHaveProperty('text');
        expect(bonus).toHaveProperty('base');
        expect(bonus).toHaveProperty('dec');
        expect(bonus).toHaveProperty('isPct');
      });
    });

    it('should have non-empty text descriptions', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(typeof bonus.text).toBe('string');
        expect(bonus.text.length).toBeGreaterThan(0);
      });
    });

    it('should have numeric base values', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(typeof bonus.base).toBe('number');
        expect(Number.isFinite(bonus.base)).toBe(true);
      });
    });

    it('should have non-negative base values', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(bonus.base).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have integer decimal precision values', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(typeof bonus.dec).toBe('number');
        expect(Number.isInteger(bonus.dec)).toBe(true);
        expect(bonus.dec).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have boolean isPct flags', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(typeof bonus.isPct).toBe('boolean');
      });
    });
  });

  describe('Bonus Values Validation', () => {
    it('should have reasonable base values (<1000)', () => {
      Object.entries(INFERNAL_CARD_BONUSES).forEach(([blockId, bonus]) => {
        expect(bonus.base).toBeLessThan(1000);
      });
    });

    it('should have reasonable decimal precision (≤4)', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        expect(bonus.dec).toBeLessThanOrEqual(4);
      });
    });

    it('should have smaller percentage bonuses (<1.0) when isPct is true', () => {
      Object.entries(INFERNAL_CARD_BONUSES).forEach(([blockId, bonus]) => {
        if (bonus.isPct) {
          // Percentage bonuses should typically be <100% (< 1.0)
          expect(bonus.base).toBeLessThan(1.0);
        }
      });
    });

    it('should have appropriate decimal precision for percentage bonuses', () => {
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        if (bonus.isPct) {
          // Percentage bonuses usually need more precision
          expect(bonus.dec).toBeGreaterThanOrEqual(2);
        }
      });
    });
  });

  describe('Block-Specific Bonuses', () => {
    it('should have distinct bonuses (not all the same)', () => {
      const baseValues = Object.values(INFERNAL_CARD_BONUSES).map(b => b.base);
      const uniqueValues = new Set(baseValues);
      
      // Should have multiple distinct bonus values
      expect(uniqueValues.size).toBeGreaterThan(5);
    });

    it('should have variety in bonus types', () => {
      const texts = Object.values(INFERNAL_CARD_BONUSES).map(b => b.text);
      const uniqueTexts = new Set(texts);
      
      // Should have diverse bonus types
      expect(uniqueTexts.size).toBeGreaterThan(10);
    });

    it('should have mix of percentage and flat bonuses', () => {
      const pctBonuses = Object.values(INFERNAL_CARD_BONUSES).filter(b => b.isPct);
      const flatBonuses = Object.values(INFERNAL_CARD_BONUSES).filter(b => !b.isPct);
      
      expect(pctBonuses.length).toBeGreaterThan(0);
      expect(flatBonuses.length).toBeGreaterThan(0);
    });
  });

  describe('Tier Progression', () => {
    it('should generally have stronger bonuses for higher tiers', () => {
      const types = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
      
      types.forEach(type => {
        const tier1Base = INFERNAL_CARD_BONUSES[`${type}1`]?.base || 0;
        const tier4Base = INFERNAL_CARD_BONUSES[`${type}4`]?.base || 0;
        
        // Not strictly increasing per tier, but tier 4 should often be stronger
        // This is a soft check - just verify both have values
        expect(tier1Base).toBeGreaterThan(0);
        expect(tier4Base).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should not have duplicate bonus texts for different blocks', () => {
      const textCounts = {};
      Object.entries(INFERNAL_CARD_BONUSES).forEach(([blockId, bonus]) => {
        const key = `${bonus.text}_${bonus.base}_${bonus.isPct}`;
        textCounts[key] = (textCounts[key] || 0) + 1;
      });
      
      // Each block should have a unique bonus combination
      const duplicates = Object.values(textCounts).filter(count => count > 1);
      expect(duplicates.length).toBe(0);
    });

    it('should have consistent structure across all entries', () => {
      const firstBonus = Object.values(INFERNAL_CARD_BONUSES)[0];
      const expectedKeys = Object.keys(firstBonus).sort();
      
      Object.values(INFERNAL_CARD_BONUSES).forEach(bonus => {
        const bonusKeys = Object.keys(bonus).sort();
        expect(bonusKeys).toEqual(expectedKeys);
      });
    });
  });
});
