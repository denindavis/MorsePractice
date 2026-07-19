/**
 * led.js
 * ----------------------------------------------------------------------
 * Controls the visual state of the LED indicator element. Kept
 * deliberately tiny and dumb: it only knows how to turn a light on or
 * off (by toggling a CSS class that the animations/CSS files react
 * to). All *timing* of when the LED should be on/off lives in
 * playback.js - this module never starts its own timers, which is
 * what keeps it perfectly in sync with the audio.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const ACTIVE_CLASS = 'led--active';

  /**
   * Creates a controller bound to a specific LED DOM element.
   * @param {HTMLElement} ledElement
   * @returns {{turnOn: Function, turnOff: Function, isOn: Function, flash: Function}}
   */
  function createController(ledElement) {
    let on = false;

    function turnOn() {
      if (on) return;
      on = true;
      ledElement.classList.add(ACTIVE_CLASS);
      ledElement.setAttribute('aria-label', 'Signal light: on');
    }

    function turnOff() {
      if (!on) return;
      on = false;
      ledElement.classList.remove(ACTIVE_CLASS);
      ledElement.setAttribute('aria-label', 'Signal light: off');
    }

    function isOn() {
      return on;
    }

    /**
     * Briefly flashes the LED (used for non-playback feedback, such as
     * confirming a button press) without affecting playback sync.
     * @param {number} durationMs
     */
    function flash(durationMs = 150) {
      turnOn();
      setTimeout(turnOff, durationMs);
    }

    // Start in a known, dark, accessible state.
    ledElement.setAttribute('role', 'img');
    ledElement.setAttribute('aria-label', 'Signal light: off');

    return { turnOn, turnOff, isOn, flash };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.LED = { createController };
})(window);
