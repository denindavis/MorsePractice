/**
 * utils.js
 * ----------------------------------------------------------------------
 * Small, generic helper functions shared across the app. Nothing in
 * here knows about Morse code, audio, or the DOM structure of this
 * specific page — these are the kind of utilities you'd reach for in
 * any project.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /**
   * Clamps a number between a minimum and maximum value.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Debounces a function so it only runs after a pause in calls.
   * Used to avoid re-rendering on every single keystroke.
   * @param {Function} fn
   * @param {number} delayMs
   * @returns {Function}
   */
  function debounce(fn, delayMs) {
    let timeoutId = null;
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delayMs);
    };
  }

  /**
   * Formats a duration in seconds as M:SS (or S.s for durations < 1
   * minute, showing one decimal for very short spans).
   * @param {number} totalSeconds
   * @returns {string}
   */
  function formatDuration(totalSeconds) {
    if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Picks a random integer in [0, max).
   * @param {number} max
   * @returns {number}
   */
  function randomIndex(max) {
    return Math.floor(Math.random() * max);
  }

  /**
   * Fisher-Yates shuffle. Returns a new shuffled array; does not
   * mutate the input.
   * @param {Array} array
   * @returns {Array}
   */
  function shuffleArray(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Creates a DOM element with optional attributes and children in
   * one call, to keep dynamic UI code readable.
   * @param {string} tag
   * @param {Object} [attrs]
   * @param {Array<Node|string>} [children]
   * @returns {HTMLElement}
   */
  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') {
        el.className = value;
      } else if (key === 'dataset') {
        Object.entries(value).forEach(([dKey, dVal]) => {
          el.dataset[dKey] = dVal;
        });
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value);
      }
    });
    children.forEach((child) => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
    return el;
  }

  /**
   * Safely attempts a fetch() call and falls back gracefully. Used for
   * the optional "load sentences from JSON over http(s)" path, which
   * does not work when the app is opened as a local file.
   * @param {string} url
   * @returns {Promise<any|null>}
   */
  async function tryFetchJson(url) {
    try {
      // file:// origins resolve fetch() with a network error in most
      // browsers, so this simply rejects and we fall back gracefully.
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  /**
   * Converts a "#rrggbb" hex color into an "rgba(r, g, b, alpha)" string.
   * Falls back to a neutral gray if parsing fails.
   * @param {string} hex
   * @param {number} alpha - 0..1
   * @returns {string}
   */
  function hexToRgba(hex, alpha) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return `rgba(150, 150, 150, ${alpha})`;
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Darkens (or lightens) a "#rrggbb" hex color by a percentage,
   * used to derive a gradient's outer stop from its main color.
   * @param {string} hex
   * @param {number} percent - negative to darken, positive to lighten
   * @returns {string} "#rrggbb"
   */
  function shadeHexColor(hex, percent) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return hex;
    const channels = [match[1], match[2], match[3]].map((h) => {
      const value = parseInt(h, 16);
      const shaded = clamp(Math.round(value + (percent / 100) * 255), 0, 255);
      return shaded.toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Utils = {
    clamp,
    debounce,
    formatDuration,
    randomIndex,
    shuffleArray,
    createElement,
    tryFetchJson,
    hexToRgba,
    shadeHexColor
  };
})(window);
