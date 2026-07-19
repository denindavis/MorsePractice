/**
 * morse.js
 * ----------------------------------------------------------------------
 * Core International Morse Code encode / decode logic.
 *
 * This module owns the character <-> Morse mapping table and exposes
 * pure functions for converting plain text to Morse and back again.
 * It has no knowledge of the DOM, audio, or LEDs — it is intentionally
 * kept dependency-free so it can be tested or reused in isolation.
 *
 * The table below is an embedded, authoritative copy of
 * data/morse.json. It is embedded directly (rather than fetched) so
 * the application works identically whether it is opened directly as
 * a local file (file://) or hosted on a web server / GitHub Pages —
 * browsers block fetch() of local files for security reasons, so an
 * external JSON dependency would silently break the file:// use case.
 * If you change data/morse.json for documentation purposes, mirror the
 * change here.
 *
 * Everything in this file attaches itself to the shared MorseApp
 * namespace instead of declaring global variables.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const CHAR_TO_MORSE = {
    // Letters
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
    G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
    M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    // Digits
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    // Punctuation supported by International Morse Code
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
    '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
    '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
    '$': '...-..-', '@': '.--.-.'
  };

  // Reverse lookup table built once for fast decoding.
  const MORSE_TO_CHAR = {};
  Object.keys(CHAR_TO_MORSE).forEach((char) => {
    MORSE_TO_CHAR[CHAR_TO_MORSE[char]] = char;
  });

  const WORD_SEPARATOR = '/';
  const LETTER_SEPARATOR = ' ';

  /**
   * Converts plain text into a Morse code string.
   * Letters are separated by a single space, words by " / ".
   * Unknown/unsupported characters are safely ignored.
   * @param {string} text
   * @returns {string}
   */
  function textToMorse(text) {
    if (!text) return '';

    const words = text.toUpperCase().split(/\s+/).filter(Boolean);

    const morseWords = words.map((word) => {
      const letters = word.split('');
      const morseLetters = letters
        .map((char) => CHAR_TO_MORSE[char])
        .filter(Boolean); // drop unsupported characters safely
      return morseLetters.join(LETTER_SEPARATOR);
    });

    return morseWords.filter(Boolean).join(` ${WORD_SEPARATOR} `);
  }

  /**
   * Converts a Morse code string back into plain text.
   * Accepts "/" as a word separator and tolerates extra/irregular
   * whitespace between tokens. Unknown Morse sequences are ignored.
   * @param {string} morse
   * @returns {string}
   */
  function morseToText(morse) {
    if (!morse) return '';

    // Normalize: collapse runs of whitespace, trim, and make sure the
    // word separator "/" is always surrounded by spaces so it tokenizes
    // cleanly regardless of how the user typed it (e.g. "...  /..").
    const normalized = morse
      .trim()
      .replace(/\s*\/\s*/g, ' / ')
      .replace(/\s+/g, ' ');

    if (!normalized) return '';

    const words = normalized.split(` ${WORD_SEPARATOR} `);

    const textWords = words.map((word) => {
      const symbols = word.split(' ').filter(Boolean);
      const chars = symbols
        .map((symbol) => MORSE_TO_CHAR[symbol])
        .filter(Boolean);
      return chars.join('');
    });

    return textWords.filter(Boolean).join(' ');
  }

  /**
   * Returns the Morse representation for a single character, or null
   * if the character has no Morse equivalent (e.g. unsupported symbol).
   * @param {string} char
   * @returns {string|null}
   */
  function getMorseForChar(char) {
    if (!char) return null;
    return CHAR_TO_MORSE[char.toUpperCase()] || null;
  }

  /**
   * Validates whether a string looks like well-formed Morse code
   * (only dots, dashes, spaces, and word separators).
   * @param {string} morse
   * @returns {boolean}
   */
  function isValidMorse(morse) {
    return /^[.\-\/\s]*$/.test(morse);
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Morse = {
    CHAR_TO_MORSE,
    MORSE_TO_CHAR,
    WORD_SEPARATOR,
    LETTER_SEPARATOR,
    textToMorse,
    morseToText,
    getMorseForChar,
    isValidMorse
  };
})(window);
