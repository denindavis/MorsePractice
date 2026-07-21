/**
 * settings.js
 * ----------------------------------------------------------------------
 * Owns the Configure modal: opening/closing (Escape key, click outside,
 * close button), speed presets, and binding all of the individual
 * inputs (sliders, dropdowns, checkboxes) to a single settings object.
 * Persistence itself is delegated to storage.js; this module just
 * knows how to read the DOM into a settings object and write a
 * settings object back into the DOM.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SPEED_PRESETS = {
    beginner: 5,
    casual: 10,
    standard: 18,
    expert: 30
  };

  /**
   * Creates a settings controller bound to the modal's DOM elements.
   * @param {Object} elements - references to the relevant DOM nodes
   * @param {Function} onChange - called with the full settings object
   *   whenever any control changes
   * @returns {Object} controller API
   */
  function createSettingsController(elements, onChange) {
    let currentSettings = {};
    let lastFocusedElement = null;

    /** Opens the modal with an animated entrance and traps focus. */
    function openModal() {
      lastFocusedElement = document.activeElement;
      elements.modalOverlay.classList.add('modal-overlay--visible');
      elements.modalOverlay.setAttribute('aria-hidden', 'false');
      elements.modalDialog.focus();
      document.addEventListener('keydown', handleKeydown);
    }

    /** Closes the modal and restores focus to whatever opened it. */
    function closeModal() {
      elements.modalOverlay.classList.remove('modal-overlay--visible');
      elements.modalOverlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleKeydown);
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    }

    function handleOverlayClick(event) {
      if (event.target === elements.modalOverlay) {
        closeModal();
      }
    }

    /**
     * Applies a settings object to every input in the modal so the UI
     * reflects the current state (used on load and after presets).
     * @param {Object} settings
     */
    function renderSettings(settings) {
      currentSettings = { ...settings };

      elements.pitchSlider.value = settings.pitchHz;
      elements.pitchValue.textContent = `${settings.pitchHz} Hz`;

      elements.volumeSlider.value = Math.round(settings.volume * 100);
      elements.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;

      elements.speedSlider.value = settings.speedWpm;
      elements.speedValue.textContent = `${settings.speedWpm} WPM`;

      elements.farnsworthSlider.value = settings.farnsworthWpm;
      elements.farnsworthValue.textContent = `${settings.farnsworthWpm} WPM`;

      elements.soundTypeSelect.value = settings.soundType;

      elements.themeSelect.value = settings.theme;

      elements.ledRadiusSlider.value = settings.ledRadius;
      elements.ledRadiusValue.textContent = `${settings.ledRadius} px`;
      elements.ledColorPicker.value = settings.ledColor;

      elements.onlyAlphabetCheckbox.checked = settings.onlyAlphabet;
      elements.includeNumbersCheckbox.checked = settings.includeNumbers;
      elements.includePunctuationCheckbox.checked = settings.includePunctuation;

      elements.showTextCaptionCheckbox.checked = settings.showTextCaption;
      elements.showMorseCaptionCheckbox.checked = settings.showMorseCaption;

      elements.categorySelect.value = settings.category;

      updateActivePresetButton(settings.speedWpm);
    }

    /** Highlights whichever preset button matches the current speed. */
    function updateActivePresetButton(speedWpm) {
      elements.presetButtons.forEach((button) => {
        const presetSpeed = SPEED_PRESETS[button.dataset.preset];
        button.classList.toggle('preset-button--active', presetSpeed === speedWpm);
      });
    }

    function emitChange(patch) {
      currentSettings = { ...currentSettings, ...patch };
      onChange(currentSettings);
    }

    function bindEvents() {
      elements.closeButton.addEventListener('click', closeModal);
      elements.modalOverlay.addEventListener('click', handleOverlayClick);

      elements.presetButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const speedWpm = SPEED_PRESETS[button.dataset.preset];
          elements.speedSlider.value = speedWpm;
          elements.speedValue.textContent = `${speedWpm} WPM`;
          // Farnsworth follows character speed by default when using a
          // preset, so newcomers get consistent, non-confusing timing.
          elements.farnsworthSlider.value = speedWpm;
          elements.farnsworthValue.textContent = `${speedWpm} WPM`;
          updateActivePresetButton(speedWpm);
          emitChange({ speedWpm, farnsworthWpm: speedWpm });
        });
      });

      elements.pitchSlider.addEventListener('input', () => {
        const pitchHz = Number(elements.pitchSlider.value);
        elements.pitchValue.textContent = `${pitchHz} Hz`;
        emitChange({ pitchHz });
      });

      elements.volumeSlider.addEventListener('input', () => {
        const volumePercent = Number(elements.volumeSlider.value);
        elements.volumeValue.textContent = `${volumePercent}%`;
        emitChange({ volume: volumePercent / 100 });
      });

      elements.speedSlider.addEventListener('input', () => {
        const speedWpm = Number(elements.speedSlider.value);
        elements.speedValue.textContent = `${speedWpm} WPM`;
        updateActivePresetButton(speedWpm);
        emitChange({ speedWpm });
      });

      elements.farnsworthSlider.addEventListener('input', () => {
        const farnsworthWpm = Number(elements.farnsworthSlider.value);
        elements.farnsworthValue.textContent = `${farnsworthWpm} WPM`;
        emitChange({ farnsworthWpm });
      });

      elements.soundTypeSelect.addEventListener('change', () => {
        emitChange({ soundType: elements.soundTypeSelect.value });
      });

      elements.themeSelect.addEventListener('change', () => {
        emitChange({ theme: elements.themeSelect.value });
      });

      elements.ledRadiusSlider.addEventListener('input', () => {
        const ledRadius = Number(elements.ledRadiusSlider.value);
        elements.ledRadiusValue.textContent = `${ledRadius} px`;
        emitChange({ ledRadius });
      });

      elements.ledColorPicker.addEventListener('input', () => {
        emitChange({ ledColor: elements.ledColorPicker.value });
      });

      elements.onlyAlphabetCheckbox.addEventListener('change', () => {
        emitChange({ onlyAlphabet: elements.onlyAlphabetCheckbox.checked });
      });

      elements.includeNumbersCheckbox.addEventListener('change', () => {
        emitChange({ includeNumbers: elements.includeNumbersCheckbox.checked });
      });

      elements.includePunctuationCheckbox.addEventListener('change', () => {
        emitChange({ includePunctuation: elements.includePunctuationCheckbox.checked });
      });

      elements.showTextCaptionCheckbox.addEventListener('change', () => {
        emitChange({ showTextCaption: elements.showTextCaptionCheckbox.checked });
      });

      elements.showMorseCaptionCheckbox.addEventListener('change', () => {
        emitChange({ showMorseCaption: elements.showMorseCaptionCheckbox.checked });
      });

      elements.categorySelect.addEventListener('change', () => {
        emitChange({ category: elements.categorySelect.value });
      });
    }

    bindEvents();

    return {
      openModal,
      closeModal,
      renderSettings,
      SPEED_PRESETS
    };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Settings = {
    SPEED_PRESETS,
    createSettingsController
  };
})(window);
