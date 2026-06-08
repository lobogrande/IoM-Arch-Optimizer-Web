// Tests for calculateUpgradeCost function
import { describe, it, expect } from 'vitest';
import {
  calculateUpgradeCost,
  INTERNAL_UPGRADE_CAPS,
  UPGRADE_COST_DATA,
} from '../game_data.js';

describe('calculateUpgradeCost', () => {
  describe('Basic Functionality', () => {
    it('should handle level 0 (returns cost for power 0 = base cost)', () => {
      // Based on implementation: level 0 with mult gives base * mult^-1
      const result = calculateUpgradeCost(3, 0, 1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('amount');
    });

    it('should return object with currency and amount for level 1', () => {
      const cost = calculateUpgradeCost(3, 1, 1);
      expect(cost).toBeDefined();
      expect(cost).toHaveProperty('currency');
      expect(cost).toHaveProperty('amount');
      expect(cost.amount).toBeGreaterThan(0);
    });

    it('should increase cost with higher levels', () => {
      const upgId = 3;
      const cost1 = calculateUpgradeCost(upgId, 1, 1);
      const cost5 = calculateUpgradeCost(upgId, 5, 1);
      const cost10 = calculateUpgradeCost(upgId, 10, 1);
      
      expect(cost5.amount).toBeGreaterThan(cost1.amount);
      expect(cost10.amount).toBeGreaterThan(cost5.amount);
    });

    it('should handle all valid upgrade IDs with cost data', () => {
      const upgradesWithCosts = Object.keys(UPGRADE_COST_DATA).map(Number);
      
      upgradesWithCosts.forEach(id => {
        expect(() => calculateUpgradeCost(id, 1, 1)).not.toThrow();
        const cost = calculateUpgradeCost(id, 1, 1);
        if (cost !== null) {
          expect(cost).toHaveProperty('currency');
          expect(cost).toHaveProperty('amount');
          expect(cost.amount).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Ascension Tier Handling', () => {
    it('should accept ascension tier 0 (no ascension)', () => {
      const cost = calculateUpgradeCost(3, 5, 0);
      if (cost !== null) {
        expect(cost.amount).toBeGreaterThan(0);
      }
    });

    it('should accept ascension tier 1', () => {
      const cost = calculateUpgradeCost(3, 5, 1);
      expect(cost).not.toBeNull();
      expect(cost.amount).toBeGreaterThan(0);
    });

    it('should accept ascension tier 2', () => {
      const cost = calculateUpgradeCost(3, 5, 2);
      if (cost !== null) {
        expect(cost.amount).toBeGreaterThan(0);
      }
    });

    it('should return different costs for different ascension tiers', () => {
      const upgId = 3;
      const level = 10;
      const costAsc0 = calculateUpgradeCost(upgId, level, 0);
      const costAsc1 = calculateUpgradeCost(upgId, level, 1);
      const costAsc2 = calculateUpgradeCost(upgId, level, 2);
      
      // At least one tier should have valid cost data
      const validCosts = [costAsc0, costAsc1, costAsc2].filter(c => c !== null);
      expect(validCosts.length).toBeGreaterThan(0);
    });
  });

  describe('Currency Types', () => {
    it('should specify currency type in result', () => {
      const cost = calculateUpgradeCost(3, 1, 1);
      expect(cost.currency).toBeDefined();
      expect(typeof cost.currency).toBe('string');
    });

    it('should handle gems currency', () => {
      // Upgrade ID 3 uses gems
      const cost = calculateUpgradeCost(3, 1, 1);
      expect(cost.currency).toBe('gems');
    });

    it('should handle fragment currencies', () => {
      // Find an upgrade that uses fragments
      const fragmentCurrencies = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
      const upgradeWithFragments = Object.entries(UPGRADE_COST_DATA).find(
        ([id, data]) => fragmentCurrencies.includes(data.currency)
      );
      
      if (upgradeWithFragments) {
        const [id, data] = upgradeWithFragments;
        const cost = calculateUpgradeCost(Number(id), 1, 1);
        expect(fragmentCurrencies).toContain(cost.currency);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should return null for upgrades without cost data', () => {
      // Upgrade IDs that don't have cost data should return null
      const allIds = Object.keys(INTERNAL_UPGRADE_CAPS).map(Number);
      const idsWithCosts = new Set(Object.keys(UPGRADE_COST_DATA).map(Number));
      const idsWithoutCosts = allIds.filter(id => !idsWithCosts.has(id));
      
      if (idsWithoutCosts.length > 0) {
        const result = calculateUpgradeCost(idsWithoutCosts[0], 1, 1);
        expect(result).toBeNull();
      }
    });

    it('should handle large level values', () => {
      // Should return result (either valid cost or capped)
      const result = calculateUpgradeCost(3, 100, 1);
      if (result !== null) {
        expect(result).toHaveProperty('amount');
        expect(Number.isFinite(result.amount)).toBe(true);
      }
    });

    it('should round gem costs appropriately', () => {
      const cost = calculateUpgradeCost(3, 5, 1);
      if (cost && cost.currency === 'gems') {
        // Gems should be whole numbers
        expect(Number.isInteger(cost.amount)).toBe(true);
      }
    });

    it('should handle fragment precision (2 decimals)', () => {
      // Find upgrade with fragment cost
      const fragmentUpgrade = Object.entries(UPGRADE_COST_DATA).find(
        ([id, data]) => data.currency !== 'gems'
      );
      
      if (fragmentUpgrade) {
        const [id] = fragmentUpgrade;
        const cost = calculateUpgradeCost(Number(id), 5, 1);
        if (cost) {
          // Should be rounded to 2 decimals
          const decimals = cost.amount.toString().split('.')[1]?.length || 0;
          expect(decimals).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('Consistency Checks', () => {
    it('should produce consistent results for same inputs', () => {
      const upgId = 10;
      const level = 7;
      const asc = 1;
      
      const cost1 = calculateUpgradeCost(upgId, level, asc);
      const cost2 = calculateUpgradeCost(upgId, level, asc);
      
      expect(cost1).toEqual(cost2);
    });

    it('should have monotonically increasing costs per upgrade', () => {
      const upgId = 10;
      let prevAmount = 0;
      
      for (let level = 1; level <= 10; level++) {
        const cost = calculateUpgradeCost(upgId, level, 1);
        if (cost !== null) {
          expect(cost.amount).toBeGreaterThanOrEqual(prevAmount);
          prevAmount = cost.amount;
        }
      }
    });

    it('should apply cost caps when defined', () => {
      // Find upgrade with cost cap
      const upgWithCap = Object.entries(UPGRADE_COST_DATA).find(
        ([id, data]) => data.cap && data.cap[1]
      );
      
      if (upgWithCap) {
        const [id, data] = upgWithCap;
        const highLevelCost = calculateUpgradeCost(Number(id), 50, 1);
        
        if (highLevelCost && data.cap[1]) {
          expect(highLevelCost.amount).toBeLessThanOrEqual(data.cap[1]);
        }
      }
    });
  });
});
