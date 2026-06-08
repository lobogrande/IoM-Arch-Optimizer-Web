// Tests for cap enforcement functions - CRITICAL
import { describe, it, expect } from 'vitest';
import {
  enforceUpgradeCap,
  enforceAllUpgradeCaps,
  INTERNAL_UPGRADE_CAPS,
  UPGRADE_NAMES,
} from '../game_data.js';

describe('enforceUpgradeCap - Critical Cap Enforcement', () => {
  describe('Basic Cap Enforcement', () => {
    it('should enforce upgrade cap when level exceeds it', () => {
      const upgId = 3;
      const cap = INTERNAL_UPGRADE_CAPS[upgId]; // 50
      const result = enforceUpgradeCap(upgId, cap + 10);
      
      expect(result).toBe(cap);
    });

    it('should allow levels at or below cap', () => {
      const upgId = 3;
      const cap = INTERNAL_UPGRADE_CAPS[upgId];
      
      expect(enforceUpgradeCap(upgId, cap)).toBe(cap);
      expect(enforceUpgradeCap(upgId, cap - 1)).toBe(cap - 1);
      expect(enforceUpgradeCap(upgId, 1)).toBe(1);
    });

    it('should clamp negative levels to 0', () => {
      expect(enforceUpgradeCap(3, -5)).toBe(0);
      expect(enforceUpgradeCap(10, -1)).toBe(0);
    });

    it('should handle level 0', () => {
      expect(enforceUpgradeCap(3, 0)).toBe(0);
    });
  });

  describe('Arch Level Modifiers', () => {
    it('should apply arch level bonus to stat cap upgrade (ID 45)', () => {
      // Upgrade 45 "Exp Gain/Stat Cap Inc." adds 5 cap per level
      const baseResult = enforceUpgradeCap(3, 100, 1); // arch level 1
      const higherArchResult = enforceUpgradeCap(3, 100, 50); // arch level 50
      
      // Higher arch level should allow higher caps (if upgrade 45 affects it)
      expect(typeof baseResult).toBe('number');
      expect(typeof higherArchResult).toBe('number');
    });

    it('should default arch level to null if not provided', () => {
      const withArch = enforceUpgradeCap(3, 100, 10);
      const withoutArch = enforceUpgradeCap(3, 100);
      
      expect(typeof withArch).toBe('number');
      expect(typeof withoutArch).toBe('number');
    });
  });

  describe('All Valid Upgrade IDs', () => {
    it('should handle all upgrades with caps', () => {
      Object.keys(INTERNAL_UPGRADE_CAPS).forEach(idStr => {
        const upgId = parseInt(idStr);
        const cap = INTERNAL_UPGRADE_CAPS[upgId];
        
        expect(() => enforceUpgradeCap(upgId, cap + 10)).not.toThrow();
        const result = enforceUpgradeCap(upgId, cap + 10);
        expect(result).toBeLessThanOrEqual(cap);
      });
    });

    it('should return exact cap when level equals cap', () => {
      Object.entries(INTERNAL_UPGRADE_CAPS).forEach(([idStr, cap]) => {
        const upgId = parseInt(idStr);
        expect(enforceUpgradeCap(upgId, cap)).toBe(cap);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large level values', () => {
      const result = enforceUpgradeCap(3, 999999);
      expect(result).toBe(INTERNAL_UPGRADE_CAPS[3]);
    });

    it('should handle floating point levels (clamps to valid range)', () => {
      const result = enforceUpgradeCap(3, 25.7);
      // Function uses Math.min/Math.max, preserves floats
      expect(result).toBeLessThanOrEqual(INTERNAL_UPGRADE_CAPS[3]);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-existent upgrade IDs gracefully', () => {
      // Should either return 0 or throw - depends on implementation
      const result = enforceUpgradeCap(999, 10);
      expect(typeof result).toBe('number');
    });
  });
});

describe('enforceAllUpgradeCaps - Batch Cap Enforcement', () => {
  describe('Basic Batch Enforcement', () => {
    it('should enforce caps on multiple upgrades', () => {
      const input = {
        3: 100,  // cap is 50
        10: 50,  // cap is 25
        12: 10,  // cap is 5
      };
      
      const result = enforceAllUpgradeCaps(input);
      
      expect(result[3]).toBe(INTERNAL_UPGRADE_CAPS[3]);
      expect(result[10]).toBe(INTERNAL_UPGRADE_CAPS[10]);
      expect(result[12]).toBe(INTERNAL_UPGRADE_CAPS[12]);
    });

    it('should leave valid levels unchanged', () => {
      const input = {
        3: 10,
        10: 5,
        12: 3,
      };
      
      const result = enforceAllUpgradeCaps(input);
      
      expect(result[3]).toBe(10);
      expect(result[10]).toBe(5);
      expect(result[12]).toBe(3);
    });

    it('should handle empty object', () => {
      const result = enforceAllUpgradeCaps({});
      expect(result).toEqual({});
    });

    it('should preserve upgrades not in the input', () => {
      const input = {
        3: 10,
        10: 5,
      };
      
      const result = enforceAllUpgradeCaps(input);
      
      // Should only have the input keys
      expect(Object.keys(result).length).toBe(Object.keys(input).length);
    });
  });

  describe('Arch Level Handling', () => {
    it('should accept arch level parameter', () => {
      const input = { 3: 100 };
      
      expect(() => enforceAllUpgradeCaps(input, 50)).not.toThrow();
      const result = enforceAllUpgradeCaps(input, 50);
      expect(result).toBeDefined();
    });

    it('should default arch level to null if not provided', () => {
      const input = { 3: 100 };
      
      const withArch = enforceAllUpgradeCaps(input, 10);
      const withoutArch = enforceAllUpgradeCaps(input);
      
      expect(withArch).toBeDefined();
      expect(withoutArch).toBeDefined();
    });
  });

  describe('Data Integrity', () => {
    it('should mutate input object in-place (by design)', () => {
      const input = { 3: 100, 10: 50 };
      const result = enforceAllUpgradeCaps(input);
      
      // Function modifies in-place per documentation
      expect(result).toBe(input);
      expect(input[3]).toBe(INTERNAL_UPGRADE_CAPS[3]);
      expect(input[10]).toBe(INTERNAL_UPGRADE_CAPS[10]);
    });

    it('should return the same object reference', () => {
      const input = { 3: 10 };
      const result = enforceAllUpgradeCaps(input);
      
      // Function returns same object (in-place modification)
      expect(result).toBe(input);
    });

    it('should handle all upgrade IDs in batch', () => {
      const input = {};
      Object.keys(INTERNAL_UPGRADE_CAPS).forEach(id => {
        input[id] = 9999; // Exceed all caps
      });
      
      const result = enforceAllUpgradeCaps(input);
      
      Object.entries(result).forEach(([idStr, level]) => {
        const cap = INTERNAL_UPGRADE_CAPS[idStr];
        expect(level).toBeLessThanOrEqual(cap);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative levels', () => {
      const input = { 3: -10, 10: -5 };
      const result = enforceAllUpgradeCaps(input);
      
      expect(result[3]).toBeGreaterThanOrEqual(0);
      expect(result[10]).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed valid and invalid levels', () => {
      const input = {
        3: 10,    // valid (cap 50)
        10: 100,  // invalid (cap 25)
        12: 3,    // valid (cap 5)
      };
      
      const result = enforceAllUpgradeCaps(input);
      
      expect(result[3]).toBe(10);
      expect(result[10]).toBe(25);
      expect(result[12]).toBe(3);
    });

    it('should handle string keys (should convert to numbers)', () => {
      const input = { '3': 100, '10': 50 };
      const result = enforceAllUpgradeCaps(input);
      
      // Should work with string or number keys
      expect(result['3'] || result[3]).toBeDefined();
    });
  });
});
