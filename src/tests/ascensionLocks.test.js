// Tests for ascension locks and unlock requirements - CRITICAL
import { describe, it, expect } from 'vitest';
import {
  ASC1_LOCKED_UPGS,
  ASC2_LOCKED_UPGS,
  UPGRADE_LEVEL_REQS,
  UPGRADE_NAMES,
  INTERNAL_UPGRADE_CAPS,
} from '../game_data.js';

describe('Ascension Locked Upgrades - Critical Game Logic', () => {
  describe('ASC1_LOCKED_UPGS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ASC1_LOCKED_UPGS)).toBe(true);
    });

    it('should have at least one locked upgrade', () => {
      expect(ASC1_LOCKED_UPGS.length).toBeGreaterThan(0);
    });

    it('should contain valid upgrade IDs', () => {
      ASC1_LOCKED_UPGS.forEach(upgId => {
        expect(UPGRADE_NAMES).toHaveProperty(String(upgId));
      });
    });

    it('should have upgrade caps defined for all locked upgrades', () => {
      ASC1_LOCKED_UPGS.forEach(upgId => {
        expect(INTERNAL_UPGRADE_CAPS).toHaveProperty(String(upgId));
        expect(INTERNAL_UPGRADE_CAPS[upgId]).toBeGreaterThan(0);
      });
    });

    it('should not have duplicate IDs', () => {
      const uniqueIds = new Set(ASC1_LOCKED_UPGS);
      expect(uniqueIds.size).toBe(ASC1_LOCKED_UPGS.length);
    });

    it('should have IDs in valid range', () => {
      ASC1_LOCKED_UPGS.forEach(upgId => {
        expect(upgId).toBeGreaterThanOrEqual(0);
        expect(upgId).toBeLessThan(100); // Reasonable upper bound
      });
    });
  });

  describe('ASC2_LOCKED_UPGS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ASC2_LOCKED_UPGS)).toBe(true);
    });

    it('should have at least one locked upgrade', () => {
      expect(ASC2_LOCKED_UPGS.length).toBeGreaterThan(0);
    });

    it('should contain valid upgrade IDs', () => {
      ASC2_LOCKED_UPGS.forEach(upgId => {
        expect(UPGRADE_NAMES).toHaveProperty(String(upgId));
      });
    });

    it('should have upgrade caps defined for all locked upgrades', () => {
      ASC2_LOCKED_UPGS.forEach(upgId => {
        expect(INTERNAL_UPGRADE_CAPS).toHaveProperty(String(upgId));
        expect(INTERNAL_UPGRADE_CAPS[upgId]).toBeGreaterThan(0);
      });
    });

    it('should not have duplicate IDs', () => {
      const uniqueIds = new Set(ASC2_LOCKED_UPGS);
      expect(uniqueIds.size).toBe(ASC2_LOCKED_UPGS.length);
    });
  });

  describe('Ascension Lock Integrity', () => {
    it('should not have overlapping upgrades between Asc1 and Asc2', () => {
      const asc1Set = new Set(ASC1_LOCKED_UPGS);
      const asc2Set = new Set(ASC2_LOCKED_UPGS);
      
      ASC1_LOCKED_UPGS.forEach(upgId => {
        expect(asc2Set.has(upgId)).toBe(false);
      });
      
      ASC2_LOCKED_UPGS.forEach(upgId => {
        expect(asc1Set.has(upgId)).toBe(false);
      });
    });

    it('should have combined locks that are subset of all upgrades', () => {
      const allLockedIds = [...ASC1_LOCKED_UPGS, ...ASC2_LOCKED_UPGS];
      const totalUpgradeIds = Object.keys(UPGRADE_NAMES).map(Number);
      
      allLockedIds.forEach(id => {
        expect(totalUpgradeIds).toContain(id);
      });
    });

    it('should have some upgrades that are not locked', () => {
      const allLockedIds = new Set([...ASC1_LOCKED_UPGS, ...ASC2_LOCKED_UPGS]);
      const totalUpgradeCount = Object.keys(UPGRADE_NAMES).length;
      
      expect(allLockedIds.size).toBeLessThan(totalUpgradeCount);
    });
  });
});

describe('UPGRADE_LEVEL_REQS - Unlock Requirements', () => {
  describe('Basic Structure', () => {
    it('should be an object', () => {
      expect(typeof UPGRADE_LEVEL_REQS).toBe('object');
      expect(UPGRADE_LEVEL_REQS).not.toBeNull();
    });

    it('should have requirements for multiple upgrades', () => {
      expect(Object.keys(UPGRADE_LEVEL_REQS).length).toBeGreaterThan(0);
    });

    it('should have all upgrade IDs in UPGRADE_NAMES', () => {
      Object.keys(UPGRADE_LEVEL_REQS).forEach(idStr => {
        expect(UPGRADE_NAMES).toHaveProperty(idStr);
      });
    });
  });

  describe('Requirement Values', () => {
    it('should have non-negative arch level requirements', () => {
      Object.values(UPGRADE_LEVEL_REQS).forEach(archLevel => {
        expect(archLevel).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(archLevel)).toBe(true);
      });
    });

    it('should have reasonable arch level requirements (<200)', () => {
      Object.values(UPGRADE_LEVEL_REQS).forEach(archLevel => {
        expect(archLevel).toBeLessThan(200);
      });
    });

    it('should have some upgrades available at arch level 0', () => {
      const level0Upgrades = Object.entries(UPGRADE_LEVEL_REQS)
        .filter(([id, level]) => level === 0);
      
      expect(level0Upgrades.length).toBeGreaterThan(0);
    });
  });

  describe('Unlock Progression', () => {
    it('should have generally increasing requirements for higher upgrade IDs', () => {
      const entries = Object.entries(UPGRADE_LEVEL_REQS)
        .map(([id, level]) => ({ id: Number(id), level }))
        .sort((a, b) => a.id - b.id);
      
      // Not strictly increasing, but generally trending up
      const firstHalfAvg = entries.slice(0, Math.floor(entries.length / 2))
        .reduce((sum, e) => sum + e.level, 0) / Math.floor(entries.length / 2);
      
      const secondHalfAvg = entries.slice(Math.floor(entries.length / 2))
        .reduce((sum, e) => sum + e.level, 0) / (entries.length - Math.floor(entries.length / 2));
      
      expect(secondHalfAvg).toBeGreaterThanOrEqual(firstHalfAvg);
    });

    it('should have contiguous or near-contiguous unlock levels', () => {
      const levels = Object.values(UPGRADE_LEVEL_REQS).sort((a, b) => a - b);
      const uniqueLevels = [...new Set(levels)];
      
      // Should have multiple distinct unlock thresholds
      expect(uniqueLevels.length).toBeGreaterThan(1);
      
      // Max gap between levels shouldn't be huge
      for (let i = 1; i < uniqueLevels.length; i++) {
        const gap = uniqueLevels[i] - uniqueLevels[i - 1];
        expect(gap).toBeLessThan(20); // Reasonable gap
      }
    });
  });

  describe('Data Integrity', () => {
    it('should match upgrade IDs that have caps', () => {
      Object.keys(UPGRADE_LEVEL_REQS).forEach(idStr => {
        expect(INTERNAL_UPGRADE_CAPS).toHaveProperty(idStr);
      });
    });

    it('should not have requirements for non-existent upgrades', () => {
      const validUpgradeIds = new Set(Object.keys(UPGRADE_NAMES).map(Number));
      
      Object.keys(UPGRADE_LEVEL_REQS).forEach(idStr => {
        const id = Number(idStr);
        expect(validUpgradeIds.has(id)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle string and number keys consistently', () => {
      const firstKey = Object.keys(UPGRADE_LEVEL_REQS)[0];
      const stringAccess = UPGRADE_LEVEL_REQS[firstKey];
      const numberAccess = UPGRADE_LEVEL_REQS[Number(firstKey)];
      
      expect(stringAccess).toBe(numberAccess);
    });
  });
});

describe('Integration - Locks & Requirements', () => {
  it('should have unlock requirements for Asc1 locked upgrades', () => {
    ASC1_LOCKED_UPGS.forEach(upgId => {
      // Asc1 locked upgrades should have arch level requirements
      expect(UPGRADE_LEVEL_REQS).toHaveProperty(String(upgId));
    });
  });

  it('should have unlock requirements for Asc2 locked upgrades', () => {
    ASC2_LOCKED_UPGS.forEach(upgId => {
      // Asc2 locked upgrades should have arch level requirements
      expect(UPGRADE_LEVEL_REQS).toHaveProperty(String(upgId));
    });
  });

  it('should have higher requirements for Asc2 locked upgrades than Asc1', () => {
    const asc1MinLevel = Math.min(...ASC1_LOCKED_UPGS.map(id => UPGRADE_LEVEL_REQS[id] || 0));
    const asc2MinLevel = Math.min(...ASC2_LOCKED_UPGS.map(id => UPGRADE_LEVEL_REQS[id] || 0));
    
    // Asc2 upgrades should generally require higher arch levels
    expect(asc2MinLevel).toBeGreaterThanOrEqual(asc1MinLevel);
  });
});
