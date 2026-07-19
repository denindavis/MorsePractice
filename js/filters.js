/**
 * filters.js
 * ----------------------------------------------------------------------
 * Implements the "Practice Settings" character filtering rules that
 * apply only to the Random Sentence generator:
 *
 *   - "Only alphabets and spaces": strips digits and punctuation, and
 *     upper-cases the result.
 *   - "Include numbers": allows digits to survive the strip.
 *   - "Include punctuation": allows Morse-supported punctuation to
 *     survive the strip.
 *
 * This module is pure text transformation - it has no idea where the
 * sentence came from or how it will be displayed/played.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SUPPORTED_PUNCTUATION_PATTERN = /[.,?'!/()&:;=+\-_"$@]/;

  /**
   * Applies the practice character filters to a piece of text.
   * @param {string} text
   * @param {Object} filterSettings
   * @param {boolean} filterSettings.onlyAlphabet
   * @param {boolean} filterSettings.includeNumbers
   * @param {boolean} filterSettings.includePunctuation
   * @returns {string}
   */
  function applyPracticeFilters(text, filterSettings) {
    const { onlyAlphabet, includeNumbers, includePunctuation } = filterSettings;

    if (!onlyAlphabet) {
      // Base restriction is off entirely - pass the sentence through
      // untouched (aside from collapsing whitespace) regardless of the
      // sub-options, since there is nothing to relax them against.
      return text.replace(/\s+/g, ' ').trim();
    }

    const characters = text.split('');
    const kept = characters.filter((char) => {
      if (/[A-Za-z]/.test(char)) return true;
      if (char === ' ') return true;
      if (/[0-9]/.test(char)) return includeNumbers;
      if (SUPPORTED_PUNCTUATION_PATTERN.test(char)) return includePunctuation;
      return false; // drop anything else (unsupported symbols)
    });

    return kept
      .join('')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Filters a sentence database down to a single category (or all
   * categories, when category === 'all').
   * @param {Array<Object>} database
   * @param {string} category
   * @returns {Array<Object>}
   */
  function filterByCategory(database, category) {
    if (!category || category === 'all') return database.slice();
    return database.filter((entry) => entry.category === category);
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Filters = {
    applyPracticeFilters,
    filterByCategory
  };
})(window);
