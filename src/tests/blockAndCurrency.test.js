// Tests for block and currency data structures
import { describe, it, expect } from 'vitest';
import {
  BLOCK_MIN_FLOORS,
  CURRENCY_TYPES,
  CARD_TYPES,
  FRAG_NAMES,
  FRAG_ICONS,
} from '../game_data.js';

describe('BLOCK_MIN_FLOORS - Floor Appearance', () => {
  it('should have 28 block entries (7 types × 4 tiers)', () => {
    expect(Object.keys(BLOCK_MIN_FLOORS).length).toBe(28);
  });

  it('should have blocks for all 4 tiers of each type', () => {
    const types = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
    
    types.forEach(type => {
      for (let tier = 1; tier <= 4; tier++) {
        const key = `${type}${tier}`;
        expect(BLOCK_MIN_FLOORS).toHaveProperty(key);
        expect(BLOCK_MIN_FLOORS[key]).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('should have increasing min floors for higher tiers of same type', () => {
    const types = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
    
    types.forEach(type => {
      for (let tier = 1; tier < 4; tier++) {
        const current = BLOCK_MIN_FLOORS[`${type}${tier}`];
        const next = BLOCK_MIN_FLOORS[`${type}${tier + 1}`];
        expect(next).toBeGreaterThan(current);
      }
    });
  });

  it('should have reasonable floor values (<200)', () => {
    Object.values(BLOCK_MIN_FLOORS).forEach(floor => {
      expect(floor).toBeGreaterThanOrEqual(1);
      expect(floor).toBeLessThan(200);
    });
  });
});

describe('CURRENCY_TYPES', () => {
  it('should include gems', () => {
    expect(CURRENCY_TYPES).toContain('gems');
  });

  it('should include all fragment types except dirt', () => {
    const fragments = ['com', 'rare', 'epic', 'leg', 'myth', 'div'];
    fragments.forEach(frag => {
      expect(CURRENCY_TYPES).toContain(frag);
    });
  });

  it('should have 7 currency types', () => {
    expect(CURRENCY_TYPES.length).toBe(7);
  });

  it('should not have duplicates', () => {
    const unique = new Set(CURRENCY_TYPES);
    expect(unique.size).toBe(CURRENCY_TYPES.length);
  });
});

describe('FRAG_NAMES', () => {
  it('should have names for 7 fragment types', () => {
    expect(Object.keys(FRAG_NAMES).length).toBe(7);
  });

  it('should have names for indices 0-6', () => {
    for (let i = 0; i < 7; i++) {
      expect(FRAG_NAMES).toHaveProperty(String(i));
      expect(typeof FRAG_NAMES[i]).toBe('string');
      expect(FRAG_NAMES[i].length).toBeGreaterThan(0);
    }
  });
});

describe('FRAG_ICONS', () => {
  it('should have icons for 7 fragment types plus gems', () => {
    expect(Object.keys(FRAG_ICONS).length).toBe(8);
  });

  it('should have paths for all fragment indices', () => {
    for (let i = 0; i < 7; i++) {
      expect(FRAG_ICONS).toHaveProperty(String(i));
      expect(FRAG_ICONS[i]).toContain('/assets/fragments/');
      expect(FRAG_ICONS[i]).toContain('.png');
    }
  });

  it('should have gem icon', () => {
    expect(FRAG_ICONS).toHaveProperty('gems');
    expect(FRAG_ICONS.gems).toContain('/assets/fragments/');
  });
});
