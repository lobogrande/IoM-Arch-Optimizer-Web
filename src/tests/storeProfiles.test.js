// Tests for store.js - Profile Management
// Note: Testing Zustand store requires working with singleton state
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../store.js';

describe.sequential('[CRITICAL] Store - Profile Management', () => {
  beforeEach(() => {
    // Reset store to clean state before each test
    useStore.getState().resetState();
  });

  describe('createProfile', () => {
    it('should create a new profile with workspace snapshot', () => {
      const store = useStore.getState();
      const initialCount = store.profiles.length;
      
      store.createProfile('Test Profile');
      
      const newStore = useStore.getState();
      expect(newStore.profiles.length).toBe(initialCount + 1);
      
      const newProfile = newStore.profiles[newStore.profiles.length - 1];
      expect(newProfile.name).toBe('Test Profile');
      expect(newProfile).toHaveProperty('id');
      expect(newProfile).toHaveProperty('data');
      expect(newProfile.id).toMatch(/^prof_\d+$/);
    });

    it('should capture current workspace state', () => {
      const store = useStore.getState();
      
      // Set some state
      store.setBaseStat('Str', 50);
      store.setSetting('arch_level', 20);
      
      store.createProfile('Snapshot Test');
      
      const profile = useStore.getState().profiles[0];
      expect(profile.data.base_stats.Str).toBe(50);
      expect(profile.data.arch_level).toBe(20);
    });

    it('should set new profile as active', () => {
      const store = useStore.getState();
      
      store.createProfile('Active Profile');
      
      const newProfile = useStore.getState().profiles[0];
      expect(useStore.getState().activeProfileId).toBe(newProfile.id);
    });
  });

  describe('loadProfile', () => {
    it('should restore profile data to workspace', () => {
      const store = useStore.getState();
      
      // Create profile with specific state
      store.setBaseStat('Str', 100);
      store.createProfile('Load Test');
      const profileId = useStore.getState().profiles[0].id;
      
      // Change workspace
      store.setBaseStat('Str', 50);
      expect(useStore.getState().base_stats.Str).toBe(50);
      
      // Load profile
      store.loadProfile(profileId);
      expect(useStore.getState().base_stats.Str).toBe(100);
    });

    it('should set activeProfileId when loading', () => {
      const store = useStore.getState();
      
      store.createProfile('Profile A');
      const idA = useStore.getState().profiles[0].id;
      
      store.createProfile('Profile B');
      
      store.loadProfile(idA);
      expect(useStore.getState().activeProfileId).toBe(idA);
    });
  });

  describe('saveToProfile', () => {
    it('should update existing profile with current workspace', () => {
      const store = useStore.getState();
      
      // Create profile
      store.setBaseStat('Agi', 20);
      store.createProfile('Save Test');
      const profileId = useStore.getState().profiles[0].id;
      
      // Change workspace
      store.setBaseStat('Agi', 80);
      
      // Save to profile
      store.saveToProfile(profileId);
      
      const updatedProfile = useStore.getState().profiles.find(p => p.id === profileId);
      expect(updatedProfile.data.base_stats.Agi).toBe(80);
    });
  });

  describe('renameProfile', () => {
    it('should update profile name', () => {
      const store = useStore.getState();
      
      store.createProfile('Old Name');
      const profileId = useStore.getState().profiles[0].id;
      
      store.renameProfile(profileId, 'New Name');
      
      const profile = useStore.getState().profiles.find(p => p.id === profileId);
      expect(profile.name).toBe('New Name');
    });
  });

  describe('deleteProfile', () => {
    it('should remove profile from array', () => {
      const store = useStore.getState();
      
      store.createProfile('To Delete');
      const profileId = useStore.getState().profiles[0].id;
      const initialCount = useStore.getState().profiles.length;
      
      store.deleteProfile(profileId);
      
      expect(useStore.getState().profiles.length).toBe(initialCount - 1);
      expect(useStore.getState().profiles.find(p => p.id === profileId)).toBeUndefined();
    });

    it('should set activeProfileId to null when deleting last profile', () => {
      const store = useStore.getState();
      
      store.createProfile('Only Profile');
      const profileId = useStore.getState().profiles[0].id;
      
      store.deleteProfile(profileId);
      
      expect(useStore.getState().activeProfileId).toBeNull();
      expect(useStore.getState().profiles.length).toBe(0);
    });
  });

  describe('Profile Workflow Integration', () => {
    it('should support full workflow: create, modify, save, load', () => {
      const store = useStore.getState();
      
      // Create initial profile
      store.setBaseStat('Luck', 10);
      store.createProfile('Workflow Test');
      const profileId = useStore.getState().profiles[0].id;
      
      // Modify workspace
      store.setBaseStat('Luck', 50);
      store.setBaseStat('Div', 20);
      
      // Save changes to profile
      store.saveToProfile(profileId);
      
      // Clear workspace
      store.setBaseStat('Luck', 0);
      store.setBaseStat('Div', 0);
      
      // Load profile
      store.loadProfile(profileId);
      
      // Should restore saved state
      const state = useStore.getState();
      expect(state.base_stats.Luck).toBe(50);
      expect(state.base_stats.Div).toBe(20);
    });
  });

  describe('Profile Edge Cases', () => {
    it('should handle loading non-existent profile gracefully', () => {
      const store = useStore.getState();
      
      // Set some baseline state
      store.setBaseStat('Str', 50);
      
      // Try to load a profile that doesn't exist
      store.loadProfile('non_existent_id_12345');
      
      // State should be unchanged since profile doesn't exist
      expect(useStore.getState().base_stats.Str).toBe(50);
      expect(useStore.getState().activeProfileId).toBeNull();
    });

    it('should handle saving to non-existent profile gracefully', () => {
      const store = useStore.getState();
      
      // Create one valid profile
      store.createProfile('Valid Profile');
      const initialCount = useStore.getState().profiles.length;
      
      // Try to save to non-existent profile - should not crash
      store.saveToProfile('non_existent_id_67890');
      
      // Should not create a new profile or modify existing ones
      expect(useStore.getState().profiles.length).toBe(initialCount);
    });

    it('should handle deleting when activeProfileId is null', () => {
      const store = useStore.getState();
      
      // Ensure activeProfileId is null
      expect(store.activeProfileId).toBeNull();
      
      // Try to delete with some random ID - should not crash
      store.deleteProfile('random_id');
      
      // State should be unchanged
      expect(useStore.getState().profiles.length).toBe(0);
      expect(useStore.getState().activeProfileId).toBeNull();
    });

    it('should handle renaming non-existent profile gracefully', () => {
      const store = useStore.getState();
      
      // Create one profile
      store.createProfile('Existing Profile');
      const existingProfile = useStore.getState().profiles[0];
      
      // Try to rename a profile that doesn't exist
      store.renameProfile('non_existent_id_99999', 'New Name');
      
      // Existing profile should be unchanged
      const stillExisting = useStore.getState().profiles.find(p => p.id === existingProfile.id);
      expect(stillExisting.name).toBe('Existing Profile');
    });
  });
});
