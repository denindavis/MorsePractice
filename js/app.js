/**
 * app.js
 * ----------------------------------------------------------------------
 * Application entry point. Waits for the DOM to be ready, then boots
 * the UI layer, which in turn wires up every other module.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  function boot() {
    const app = global.MorseApp.UI.createApp();
    app.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
