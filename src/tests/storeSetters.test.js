// Tests for store.js - State Setters and Reset
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../store.js';

describe.sequential('[CRITICAL] Store - State Setters', () => {
  beforeEach(() => {
    useStore.getState().resetState();
  });

  describe('setBaseStat', () => {
    it('should update individual base stat', () => {
      const store = useStore.getState();
      
      store.setBaseStat('Str', 50);
      
      expect(useStore.getState().base_stats.Str).toBe(50);
    });

    it('should handle all stat types', () => {
      const store = useStore.getState();
      const stats = ['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'];
      
      stats.forEach((stat, index) => {
        store.setBaseStat(stat, index * 10);
      });
      
      const state = useStore.getState();
      stats.forEach((stat, index) => {
        expect(state.base_stats[stat]).toBe(index * 10);
      });
    });

    it('should not affect other stats', () => {
      const store = useStore.getState();
      
      store.setBaseStat('Agi', 30);
      
      const state = useStore.getState();
      expect(state.base_stats.Str).toBe(0);
      expect(state.base_stats.Agi).toBe(30);
      expect(state.base_stats.Per).toBe(0);
    });
  });

  describe('setUpgradeLevel', () => {
    it('should set upgrade level with cap enforcement', () => {
      const store = useStore.getState();
      
      // Set a level that's within the cap for upgrade 3 (cap is 50)
      store.setUpgradeLevel(3, 10);
      
      // enforceUpgradeCap is called, but 10 is within cap
      const level = useStore.getState().upgrade_levels[3];
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(50); // Cap for upgrade 3
    });

    it('should handle multiple upgrades independently', () => {
      const store = useStore.getState();
      
      store.setUpgradeLevel(3, 5);
      store.setUpgradeLevel(10, 5);
      store.setUpgradeLevel(12, 3);
      
      const state = useStore.getState();
      // Levels should be set (possibly capped)
      expect(state.upgrade_levels[3]).toBeGreaterThan(0);
      expect(state.upgrade_levels[10]).toBeGreaterThan(0);
      expect(state.upgrade_levels[12]).toBeGreaterThan(0);
    });
  });

  describe('setCardLevel', () => {
    it('should set card level', () => {
      const store = useStore.getState();
      
      store.setCardLevel('dirt1', 2);
      
      expect(useStore.getState().cards['dirt1']).toBe(2);
    });

    it('should handle multiple cards', () => {
      const store = useStore.getState();
      
      store.setCardLevel('dirt1', 1);
      store.setCardLevel('com2', 3);
      store.setCardLevel('myth4', 4);
      
      const state = useStore.getState();
      expect(state.cards['dirt1']).toBe(1);
      expect(state.cards['com2']).toBe(3);
      expect(state.cards['myth4']).toBe(4);
    });
  });

  describe('setSetting', () => {
    it('should update arch_level', () => {
      const store = useStore.getState();
      
      store.setSetting('arch_level', 50);
      
      expect(useStore.getState().arch_level).toBe(50);
    });

    it('should update boolean settings', () => {
      const store = useStore.getState();
      
      store.setSetting('asc1_unlocked', true);
      store.setSetting('asc2_unlocked', false);
      
      const state = useStore.getState();
      expect(state.asc1_unlocked).toBe(true);
      expect(state.asc2_unlocked).toBe(false);
    });

    it('should update numeric settings', () => {
      const store = useStore.getState();
      
      store.setSetting('current_max_floor', 75);
      store.setSetting('starting_speed_pool', 100);
      
      const state = useStore.getState();
      expect(state.current_max_floor).toBe(75);
      expect(state.starting_speed_pool).toBe(100);
    });
  });

  describe('setSetting Validation', () => {
    it('should clamp arch_level to minimum of 1', () => {
      const store = useStore.getState();
      
      store.setSetting('arch_level', 0);
      expect(useStore.getState().arch_level).toBe(1);
      
      store.setSetting('arch_level', -10);
      expect(useStore.getState().arch_level).toBe(1);
    });

    it('should accept any positive arch_level (no maximum)', () => {
      const store = useStore.getState();
      
      store.setSetting('arch_level', 250);
      expect(useStore.getState().arch_level).toBe(250);
      
      store.setSetting('arch_level', 1000);
      expect(useStore.getState().arch_level).toBe(1000);
    });

    it('should parse arch_level from string to number', () => {
      const store = useStore.getState();
      
      store.setSetting('arch_level', '50');
      
      const level = useStore.getState().arch_level;
      expect(typeof level).toBe('number');
      expect(level).toBe(50);
    });

    it('should default arch_level to 1 for non-numeric strings', () => {
      const store = useStore.getState();
      
      store.setSetting('arch_level', 'invalid');
      expect(useStore.getState().arch_level).toBe(1);
      
      store.setSetting('arch_level', '');
      expect(useStore.getState().arch_level).toBe(1);
    });

    it('should clamp current_max_floor to minimum of 1', () => {
      const store = useStore.getState();
      
      store.setSetting('current_max_floor', 0);
      expect(useStore.getState().current_max_floor).toBe(1);
      
      store.setSetting('current_max_floor', -50);
      expect(useStore.getState().current_max_floor).toBe(1);
    });

    it('should accept any positive current_max_floor (no maximum)', () => {
      const store = useStore.getState();
      
      store.setSetting('current_max_floor', 500);
      expect(useStore.getState().current_max_floor).toBe(500);
      
      store.setSetting('current_max_floor', 9999);
      expect(useStore.getState().current_max_floor).toBe(9999);
    });

    it('should clamp starting_speed_pool to minimum of 0', () => {
      const store = useStore.getState();
      
      store.setSetting('starting_speed_pool', -10);
      expect(useStore.getState().starting_speed_pool).toBe(0);
    });

    it('should coerce boolean settings to boolean type', () => {
      const store = useStore.getState();
      
      // Numeric values should be coerced to boolean
      store.setSetting('asc1_unlocked', 1);
      store.setSetting('asc2_unlocked', 0);
      
      const state = useStore.getState();
      expect(typeof state.asc1_unlocked).toBe('boolean');
      expect(state.asc1_unlocked).toBe(true);
      expect(typeof state.asc2_unlocked).toBe('boolean');
      expect(state.asc2_unlocked).toBe(false);
    });

    it('should handle asc2_unlocked=false sanitization correctly', () => {
      const store = useStore.getState();
      
      // Set up Corruption stat and ASC2 cards
      store.setSetting('asc2_unlocked', true);
      store.setBaseStat('Corr', 50);
      store.setCardLevel('myth4', 3);
      
      // Disable ASC2
      store.setSetting('asc2_unlocked', false);
      
      // Should clear Corruption and level 4 cards
      const state = useStore.getState();
      expect(state.asc2_unlocked).toBe(false);
      expect(state.base_stats.Corr).toBe(0);
      expect(state.cards['myth4']).toBe(0);
    });

    it('should handle asc1_unlocked=false sanitization correctly', () => {
      const store = useStore.getState();
      
      // Set up Divine and Corruption stats
      store.setSetting('asc1_unlocked', true);
      store.setSetting('asc2_unlocked', true);
      store.setBaseStat('Div', 30);
      store.setBaseStat('Corr', 20);
      store.setCardLevel('div1', 2);
      
      // Disable ASC1 (should cascade to ASC2)
      store.setSetting('asc1_unlocked', false);
      
      // Should clear both Div and Corr, and cascade asc2
      const state = useStore.getState();
      expect(state.asc1_unlocked).toBe(false);
      expect(state.asc2_unlocked).toBe(false);
      expect(state.base_stats.Div).toBe(0);
      expect(state.base_stats.Corr).toBe(0);
      expect(state.cards['div1']).toBe(0);
    });
  });

  describe('setExternalGroup Edge Cases', () => {
    it('should handle empty array gracefully', () => {
      const store = useStore.getState();
      
      // Empty array should not crash, but also won't modify state
      store.setExternalGroup([], 5);
      
      // external_levels should exist (may be empty object)
      const ext = useStore.getState().external_levels;
      expect(ext).toBeDefined();
      expect(typeof ext).toBe('object');
    });

    it('should handle single row array', () => {
      const store = useStore.getState();
      
      // Set level for single external upgrade
      store.setExternalGroup([999], 5);
      
      const ext = useStore.getState().external_levels;
      expect(ext[999]).toBe(5);
    });

    it('should handle multiple row arrays', () => {
      const store = useStore.getState();
      
      // Set level for multiple external upgrades
      store.setExternalGroup([101, 102, 103], 7);
      
      const ext = useStore.getState().external_levels;
      expect(ext[101]).toBe(7);
      expect(ext[102]).toBe(7);
      expect(ext[103]).toBe(7);
    });
  });
});

describe.sequential('[CRITICAL] Store - resetState', () => {
  it('should reset all base stats to 0', () => {
    const store = useStore.getState();
    
    store.setBaseStat('Str', 100);
    store.setBaseStat('Agi', 50);
    
    store.resetState();
    
    const state = useStore.getState();
    expect(state.base_stats.Str).toBe(0);
    expect(state.base_stats.Agi).toBe(0);
    expect(state.base_stats.Per).toBe(0);
  });

  it('should reset arch level to 1', () => {
    const store = useStore.getState();
    
    store.setSetting('arch_level', 100);
    store.resetState();
    
    expect(useStore.getState().arch_level).toBe(1);
  });

  it('should reset ascensions to false', () => {
    const store = useStore.getState();
    
    store.setSetting('asc1_unlocked', true);
    store.setSetting('asc2_unlocked', true);
    
    store.resetState();
    
    const state = useStore.getState();
    expect(state.asc1_unlocked).toBe(false);
    expect(state.asc2_unlocked).toBe(false);
  });

  it('should clear all upgrade levels', () => {
    const store = useStore.getState();
    
    store.setUpgradeLevel(3, 10);
    store.setUpgradeLevel(10, 15);
    
    store.resetState();
    
    expect(Object.keys(useStore.getState().upgrade_levels).length).toBe(0);
  });

  it('should clear all cards', () => {
    const store = useStore.getState();
    
    store.setCardLevel('dirt1', 2);
    store.setCardLevel('myth4', 4);
    
    store.resetState();
    
    expect(Object.keys(useStore.getState().cards).length).toBe(0);
  });

  it('should clear all profiles', () => {
    const store = useStore.getState();
    
    store.createProfile('Test Profile');
    store.resetState();
    
    const state = useStore.getState();
    expect(state.profiles.length).toBe(0);
    expect(state.activeProfileId).toBeNull();
  });

  it('should reset current_max_floor to 1', () => {
    const store = useStore.getState();
    
    store.setSetting('current_max_floor', 150);
    store.resetState();
    
    expect(useStore.getState().current_max_floor).toBe(1);
  });
});
