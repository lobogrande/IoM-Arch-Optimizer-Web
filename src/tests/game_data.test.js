// Basic tests for game_data.js constants
import { describe, it, expect } from 'vitest';
import {
  UPGRADE_NAMES,
  INTERNAL_UPGRADE_CAPS,
  CARD_TYPES,
} from '../game_data.js';

describe('game_data.js - Constants', () => {
  describe('UPGRADE_NAMES', () => {
    it('should have 51 upgrades', () => {
      expect(Object.keys(UPGRADE_NAMES).length).toBe(51);
    });

    it('should have non-empty names', () => {
      Object.values(UPGRADE_NAMES).forEach(name => {
        expect(name).toBeTruthy();
        expect(typeof name).toBe('string');
      });
    });
  });

  describe('INTERNAL_UPGRADE_CAPS', () => {
    it('should have 51 caps', () => {
      expect(Object.keys(INTERNAL_UPGRADE_CAPS).length).toBe(51);
    });

    it('should have positive cap values', () => {
      Object.values(INTERNAL_UPGRADE_CAPS).forEach(cap => {
        expect(cap).toBeGreaterThan(0);
      });
    });
  });

  describe('CARD_TYPES', () => {
    it('should have 7 card types', () => {
      expect(CARD_TYPES.length).toBe(7);
    });

    it('should contain expected types', () => {
      const expected = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
      expected.forEach(type => expect(CARD_TYPES).toContain(type));
    });
  });
});
