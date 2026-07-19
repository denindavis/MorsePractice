/**
 * storage.js
 * ----------------------------------------------------------------------
 * Thin wrapper around LocalStorage for persisting user settings between
 * visits: theme, audio settings, checkbox states, practice filters,
 * selected category, etc. All keys are namespaced to avoid clashing
 * with anything else that might share the same origin.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'morsePracticeTool.settings.v1';

  const DEFAULT_SETTINGS = {
    pitchHz: 600,
    volume: 0.6,
    speedWpm: 18,
    farnsworthWpm: 18,
    soundType: 'sine',
    lightEnabled: true,
    soundEnabled: true,
    hidePlainText: false,
    hideMorseText: false,
    onlyAlphabet: true,
    includeNumbers: false,
    includePunctuation: false,
    category: 'common',
    theme: 'normal',
    ledRadius: 48,
    ledColor: '#39ff88'
  };

  /**
   * Reads persisted settings, merged over the defaults so new fields
   * introduced in later versions of the app always have a sane value.
   * @returns {Object}
   */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (error) {
      // Corrupted or inaccessible storage (e.g. private browsing) -
      // fall back to defaults rather than breaking the app.
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Persists the given settings object, merged over whatever is
   * currently stored so partial updates don't clobber other fields.
   * @param {Object} partialSettings
   * @returns {Object} the full settings object after merging
   */
  function saveSettings(partialSettings) {
    const current = loadSettings();
    const updated = { ...current, ...partialSettings };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      // Storage may be full or disabled - fail silently, in-memory
      // state still works for the current session.
    }
    return updated;
  }

  /**
   * Resets stored settings back to defaults.
   * @returns {Object}
   */
  function resetSettings() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // ignore
    }
    return { ...DEFAULT_SETTINGS };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Storage = {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    resetSettings
  };
})(window);
