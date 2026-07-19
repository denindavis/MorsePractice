/**
 * shortcuts.js
 * ----------------------------------------------------------------------
 * Registers the application's global keyboard shortcuts:
 *
 *   Space      Play / Pause
 *   Escape     Stop
 *   Ctrl+R     Random sentence
 *   Ctrl+L     Clear
 *   Ctrl+,     Open Configure dialog
 *
 * Shortcuts are suppressed while the user is typing in a text field,
 * textarea, or any other editable element (except Space's play/pause
 * behavior, which intentionally still works from the practice
 * textareas since that is the primary place users will be sitting
 * while practicing).
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /**
   * @param {Object} handlers
   * @param {Function} handlers.onPlayPause
   * @param {Function} handlers.onStop
   * @param {Function} handlers.onRandom
   * @param {Function} handlers.onClear
   * @param {Function} handlers.onConfigure
   * @param {Function} handlers.isModalOpen - returns true if the modal is open
   */
  function registerShortcuts(handlers) {
    function isEditableElement(element) {
      if (!element) return false;
      const tag = element.tagName;
      return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || element.isContentEditable;
    }

    function handleKeydown(event) {
      const target = event.target;
      const modalOpen = handlers.isModalOpen();

      // Escape always stops playback, even from within an input, and
      // also closes the modal if it happens to be open (handled by
      // settings.js's own listener - we skip Stop while the modal owns
      // the Escape key so the two don't fight over the same keypress).
      if (event.key === 'Escape') {
        if (!modalOpen) {
          handlers.onStop();
        }
        return;
      }

      if (modalOpen) return; // don't fire other shortcuts while configuring

      if (event.code === 'Space' && !isEditableElement(target)) {
        event.preventDefault();
        handlers.onPlayPause();
        return;
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (!isCtrlOrCmd) return;

      switch (event.key.toLowerCase()) {
        case 'r':
          event.preventDefault();
          handlers.onRandom();
          break;
        case 'l':
          event.preventDefault();
          handlers.onClear();
          break;
        case ',':
          event.preventDefault();
          handlers.onConfigure();
          break;
        default:
          break;
      }
    }

    document.addEventListener('keydown', handleKeydown);

    return {
      unregister() {
        document.removeEventListener('keydown', handleKeydown);
      }
    };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Shortcuts = { registerShortcuts };
})(window);
