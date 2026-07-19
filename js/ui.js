/**
 * ui.js
 * ----------------------------------------------------------------------
 * Wires every other module together against the actual DOM: keeps the
 * Plain Text / Morse Code textareas in sync, drives the media-player
 * style toolbar and toggle checkboxes, renders statistics and the
 * progress bar, applies the active theme and LED appearance, and
 * connects the playback engine's callbacks to the LED and progress UI.
 * This is the only module that reaches into the concrete page
 * structure - all the others are reusable logic modules.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const { Morse, Utils, Storage, Filters, Random, Playback, LED, Settings, Shortcuts } = global.MorseApp;

  function createApp() {
    // ---------------------------------------------------------------
    // DOM references
    // ---------------------------------------------------------------
    const plainTextInput = document.getElementById('plainTextInput');
    const morseTextInput = document.getElementById('morseTextInput');
    const plainTextCount = document.getElementById('plainTextCount');
    const morseTextCount = document.getElementById('morseTextCount');
    const plainTextPanel = document.getElementById('plainTextPanel');
    const morseTextPanel = document.getElementById('morseTextPanel');
    const practiceModeMessage = document.getElementById('practiceModeMessage');

    const ledElement = document.getElementById('morseLed');

    const playPauseButton = document.getElementById('playPauseButton');
    const playIcon = playPauseButton.querySelector('.media-button__icon--play');
    const pauseIcon = playPauseButton.querySelector('.media-button__icon--pause');
    const previousButton = document.getElementById('previousButton');
    const nextButton = document.getElementById('nextButton');
    const restartButton = document.getElementById('restartButton');
    const clearButton = document.getElementById('clearButton');
    const randomButton = document.getElementById('randomButton');
    const configureButton = document.getElementById('configureButton');

    const lightToggle = document.getElementById('lightToggle');
    const soundToggle = document.getElementById('soundToggle');
    const hidePlainToggle = document.getElementById('hidePlainToggle');
    const hideMorseToggle = document.getElementById('hideMorseToggle');

    const statCharacters = document.getElementById('statCharacters');
    const statWords = document.getElementById('statWords');
    const statSymbols = document.getElementById('statSymbols');
    const statEstimatedTime = document.getElementById('statEstimatedTime');

    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressElapsed = document.getElementById('progressElapsed');
    const progressPercent = document.getElementById('progressPercent');
    const progressTotal = document.getElementById('progressTotal');

    const modalOverlay = document.getElementById('modalOverlay');
    const modalDialog = document.getElementById('modalDialog');
    const modalCloseButton = document.getElementById('modalCloseButton');
    const categorySelect = document.getElementById('categorySelect');

    const settingsElements = {
      modalOverlay,
      modalDialog,
      closeButton: modalCloseButton,
      presetButtons: Array.from(document.querySelectorAll('.preset-button')),
      pitchSlider: document.getElementById('pitchSlider'),
      pitchValue: document.getElementById('pitchValue'),
      volumeSlider: document.getElementById('volumeSlider'),
      volumeValue: document.getElementById('volumeValue'),
      speedSlider: document.getElementById('speedSlider'),
      speedValue: document.getElementById('speedValue'),
      farnsworthSlider: document.getElementById('farnsworthSlider'),
      farnsworthValue: document.getElementById('farnsworthValue'),
      soundTypeSelect: document.getElementById('soundTypeSelect'),
      themeSelect: document.getElementById('themeSelect'),
      ledRadiusSlider: document.getElementById('ledRadiusSlider'),
      ledRadiusValue: document.getElementById('ledRadiusValue'),
      ledColorPicker: document.getElementById('ledColorPicker'),
      onlyAlphabetCheckbox: document.getElementById('onlyAlphabetCheckbox'),
      includeNumbersCheckbox: document.getElementById('includeNumbersCheckbox'),
      includePunctuationCheckbox: document.getElementById('includePunctuationCheckbox'),
      categorySelect
    };

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let settings = Storage.loadSettings();
    let isSyncingTextareas = false; // guards against feedback loops
    let ledController = LED.createController(ledElement);
    let player = null;

    // Word-navigation state. wordStartTimes[i] is the timeline offset
    // (seconds) where word i begins; currentWordIndex tracks either
    // the actively-playing word (kept in sync via onCharacter) or,
    // while idle, the word Previous/Next has cued up to play next.
    let wordStartTimes = [];
    let totalWords = 0;
    let currentWordIndex = 0;
    let pendingOffsetSeconds = 0;

    // ---------------------------------------------------------------
    // Theme & LED appearance
    // ---------------------------------------------------------------
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }

    function applyLedAppearance() {
      const diameter = settings.ledRadius * 2;
      const root = document.documentElement;
      root.style.setProperty('--led-diameter', `${diameter}px`);

      // Scale the glow blur with the LED's own size so a tiny dot gets
      // a tiny halo and a large LED gets a broad one, rather than a
      // fixed blur radius that would swamp a small dot or look thin
      // on a large light.
      const glowBlur = Utils.clamp(Math.round(diameter * 0.55), 6, 140);
      root.style.setProperty('--led-glow-blur', `${glowBlur}px`);

      root.style.setProperty('--led-glow-color', settings.ledColor);
      root.style.setProperty('--led-glow-color-soft', Utils.hexToRgba(settings.ledColor, 0.55));
      root.style.setProperty('--led-glow-color-bright', Utils.shadeHexColor(settings.ledColor, 60));
      root.style.setProperty('--led-glow-color-dark', Utils.shadeHexColor(settings.ledColor, -55));
    }

    // ---------------------------------------------------------------
    // Text sync (Plain Text <-> Morse Code)
    // ---------------------------------------------------------------
    function updateCountsAndStats() {
      const plainText = plainTextInput.value;
      const morseText = morseTextInput.value;

      const characterCount = plainText.replace(/\s/g, '').length;
      const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
      const symbolCount = (morseText.match(/[.\-]/g) || []).length;

      plainTextCount.textContent = `${characterCount} character${characterCount === 1 ? '' : 's'}`;
      morseTextCount.textContent = `${symbolCount} symbol${symbolCount === 1 ? '' : 's'}`;

      statCharacters.textContent = String(characterCount);
      statWords.textContent = String(wordCount);
      statSymbols.textContent = String(symbolCount);

      const timing = Playback.computeTiming(settings.speedWpm, settings.farnsworthWpm);
      const { elements, totalDuration } = Playback.buildTimeline(plainText, timing);
      statEstimatedTime.textContent = Utils.formatDuration(totalDuration);

      // Recompute word boundaries for Previous/Next navigation.
      const startsByWord = {};
      elements
        .filter((el) => el.type === 'tone')
        .forEach((el) => {
          if (!(el.wordIndex in startsByWord)) startsByWord[el.wordIndex] = el.start;
        });
      wordStartTimes = Object.keys(startsByWord)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => startsByWord[key]);
      totalWords = wordStartTimes.length;
      currentWordIndex = Utils.clamp(currentWordIndex, 0, Math.max(0, totalWords - 1));

      const playerActive = player && (player.isPlaying() || player.isPaused());
      if (!playerActive) {
        progressTotal.textContent = Utils.formatDuration(totalDuration);
      }
    }

    function syncFromPlainText() {
      if (isSyncingTextareas) return;
      isSyncingTextareas = true;
      morseTextInput.value = Morse.textToMorse(plainTextInput.value);
      isSyncingTextareas = false;
      updateCountsAndStats();
    }

    function syncFromMorseText() {
      if (isSyncingTextareas) return;
      isSyncingTextareas = true;
      plainTextInput.value = Morse.morseToText(morseTextInput.value);
      isSyncingTextareas = false;
      updateCountsAndStats();
    }

    // ---------------------------------------------------------------
    // Visibility of panels ("Hide Plain Text" / "Hide Morse Code")
    // ---------------------------------------------------------------
    function updatePanelVisibility() {
      const hidePlain = hidePlainToggle.checked;
      const hideMorse = hideMorseToggle.checked;

      plainTextPanel.classList.toggle('text-panel--hidden', hidePlain);
      morseTextPanel.classList.toggle('text-panel--hidden', hideMorse);
      practiceModeMessage.hidden = !(hidePlain && hideMorse);

      plainTextPanel.classList.toggle('text-panel--expanded', hideMorse && !hidePlain);
      morseTextPanel.classList.toggle('text-panel--expanded', hidePlain && !hideMorse);
    }

    // ---------------------------------------------------------------
    // Progress bar rendering (used both live during playback and as a
    // static preview when idle/paused, e.g. after Previous/Next)
    // ---------------------------------------------------------------
    function renderProgressPreview(offsetSeconds) {
      const timing = Playback.computeTiming(settings.speedWpm, settings.farnsworthWpm);
      const { totalDuration } = Playback.buildTimeline(plainTextInput.value, timing);
      const percent = totalDuration > 0 ? Utils.clamp(offsetSeconds / totalDuration, 0, 1) : 0;

      progressFill.style.width = `${(percent * 100).toFixed(2)}%`;
      progressElapsed.textContent = Utils.formatDuration(offsetSeconds);
      progressTotal.textContent = Utils.formatDuration(totalDuration);
      progressPercent.textContent = `${Math.round(percent * 100)}%`;
      progressBar.setAttribute('aria-valuenow', String(Math.round(percent * 100)));
    }

    // ---------------------------------------------------------------
    // Playback wiring
    // ---------------------------------------------------------------
    function setToolbarPlayingState(isPlaying, isPaused) {
      // Exactly one of these two icons is ever shown at a time. We
      // deliberately toggle a CSS class rather than the native
      // `.hidden` property: `.hidden` only reliably reflects to the
      // `hidden` content attribute on HTMLElement, not on SVGElement,
      // so setting it directly on these <svg> icons could silently
      // fail to hide/show them in some environments.
      const showPauseIcon = isPlaying;
      playIcon.classList.toggle('media-button__icon--hidden', showPauseIcon);
      pauseIcon.classList.toggle('media-button__icon--hidden', !showPauseIcon);
      playPauseButton.dataset.state = isPlaying ? 'playing' : (isPaused ? 'paused-mid' : 'paused');
      playPauseButton.setAttribute('aria-label', isPlaying ? 'Pause' : (isPaused ? 'Resume' : 'Play'));
      playPauseButton.title = isPlaying ? 'Pause (Space)' : (isPaused ? 'Resume (Space)' : 'Play (Space)');
    }

    function createPlayer() {
      return new Playback.MorsePlayer({
        onStateChange(state) {
          const isPlaying = state === Playback.STATE.PLAYING;
          const isPaused = state === Playback.STATE.PAUSED;
          setToolbarPlayingState(isPlaying, isPaused);
        },
        onLedChange(isOn) {
          if (!settings.lightEnabled) return;
          if (isOn) ledController.turnOn();
          else ledController.turnOff();
        },
        onProgress({ elapsedSeconds, totalSeconds, percent }) {
          progressFill.style.width = `${(percent * 100).toFixed(2)}%`;
          progressElapsed.textContent = Utils.formatDuration(elapsedSeconds);
          progressTotal.textContent = Utils.formatDuration(totalSeconds);
          progressPercent.textContent = `${Math.round(percent * 100)}%`;
          progressBar.setAttribute('aria-valuenow', String(Math.round(percent * 100)));
        },
        onCharacter({ wordIndex }) {
          // Tracked silently (no longer displayed) so Previous/Next
          // during playback jump relative to the word actually
          // sounding right now, rather than a stale cued position.
          currentWordIndex = wordIndex;
        },
        onComplete() {
          setToolbarPlayingState(false, false);
          ledController.turnOff();
          currentWordIndex = 0;
          pendingOffsetSeconds = 0;
        }
      });
    }

    function startPlayback() {
      if (!plainTextInput.value.trim()) return;
      player.play(plainTextInput.value, {
        pitchHz: settings.pitchHz,
        volume: settings.volume,
        speedWpm: settings.speedWpm,
        farnsworthWpm: settings.farnsworthWpm,
        soundType: settings.soundType,
        soundEnabled: settings.soundEnabled
      }, pendingOffsetSeconds);
      pendingOffsetSeconds = 0;
    }

    function handlePlayPauseButton() {
      if (player.isPlaying()) {
        player.pause();
      } else if (player.isPaused()) {
        player.resume();
      } else {
        startPlayback();
      }
    }

    function handleStop() {
      player.stop();
      setToolbarPlayingState(false, false);
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      renderProgressPreview(0);
    }

    function stopIfActive() {
      if (player && (player.isPlaying() || player.isPaused())) {
        handleStop();
      }
    }

    /** Restarts playback of the current text from the very beginning. */
    function handleRestart() {
      player.stop();
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      renderProgressPreview(0);
      startPlayback();
    }

    // ---------------------------------------------------------------
    // Word navigation (Previous / Next)
    // ---------------------------------------------------------------
    function jumpToWord(delta) {
      if (totalWords === 0) return;
      currentWordIndex = Utils.clamp(currentWordIndex + delta, 0, totalWords - 1);
      const offset = wordStartTimes[currentWordIndex] || 0;

      if (player.isPlaying() || player.isPaused()) {
        player.seek(offset);
      } else {
        pendingOffsetSeconds = offset;
        renderProgressPreview(offset);
      }
    }

    // ---------------------------------------------------------------
    // Toolbar actions
    // ---------------------------------------------------------------
    function handleClear() {
      stopIfActive();
      plainTextInput.value = '';
      morseTextInput.value = '';
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      updateCountsAndStats();
      plainTextInput.focus();
    }

    function handleRandom() {
      stopIfActive();

      // Special case: if "Include numbers" is the only active practice
      // filter (letters-only mode off, punctuation off), generate a
      // random 5-10 digit number directly instead of pulling a
      // sentence and stripping it down to whatever digits it happens
      // to contain - this guarantees genuine numbers practice.
      const isNumbersOnlyMode = settings.includeNumbers
        && !settings.onlyAlphabet
        && !settings.includePunctuation;

      const plainResult = isNumbersOnlyMode
        ? Random.getRandomDigitsString(5, 10)
        : Filters.applyPracticeFilters(Random.getNextSentence(settings.category), {
          onlyAlphabet: settings.onlyAlphabet,
          includeNumbers: settings.includeNumbers,
          includePunctuation: settings.includePunctuation
        });

      plainTextInput.value = plainResult;
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      syncFromPlainText();
    }

    // ---------------------------------------------------------------
    // Toggle checkboxes (Light / Sound / Hide Plain / Hide Morse)
    // ---------------------------------------------------------------
    function bindToggles() {
      lightToggle.checked = settings.lightEnabled;
      soundToggle.checked = settings.soundEnabled;
      hidePlainToggle.checked = settings.hidePlainText;
      hideMorseToggle.checked = settings.hideMorseText;
      updatePanelVisibility();

      lightToggle.addEventListener('change', () => {
        settings = Storage.saveSettings({ lightEnabled: lightToggle.checked });
        if (!settings.lightEnabled) ledController.turnOff();
      });

      soundToggle.addEventListener('change', () => {
        settings = Storage.saveSettings({ soundEnabled: soundToggle.checked });
        if (player) player.setSoundEnabled(settings.soundEnabled);
      });

      hidePlainToggle.addEventListener('change', () => {
        settings = Storage.saveSettings({ hidePlainText: hidePlainToggle.checked });
        updatePanelVisibility();
      });

      hideMorseToggle.addEventListener('change', () => {
        settings = Storage.saveSettings({ hideMorseText: hideMorseToggle.checked });
        updatePanelVisibility();
      });
    }

    // ---------------------------------------------------------------
    // Settings modal
    // ---------------------------------------------------------------
    function initSettingsModal() {
      const controller = Settings.createSettingsController(settingsElements, (updatedSettings) => {
        settings = Storage.saveSettings(updatedSettings);
        applyTheme(settings.theme);
        applyLedAppearance();
        if (player) player.setVolume(settings.volume);
        updateCountsAndStats();
      });

      Random.getAvailableCategories().forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        categorySelect.appendChild(option);
      });

      controller.renderSettings(settings);
      return controller;
    }

    // ---------------------------------------------------------------
    // Wiring it all together
    // ---------------------------------------------------------------
    function init() {
      player = createPlayer();
      const settingsController = initSettingsModal();

      applyTheme(settings.theme);
      applyLedAppearance();

      plainTextInput.addEventListener('input', () => {
        stopIfActive();
        currentWordIndex = 0;
        pendingOffsetSeconds = 0;
        syncFromPlainText();
      });

      morseTextInput.addEventListener('input', () => {
        stopIfActive();
        currentWordIndex = 0;
        pendingOffsetSeconds = 0;
        syncFromMorseText();
      });

      playPauseButton.addEventListener('click', handlePlayPauseButton);
      previousButton.addEventListener('click', () => jumpToWord(-1));
      nextButton.addEventListener('click', () => jumpToWord(1));
      restartButton.addEventListener('click', handleRestart);
      clearButton.addEventListener('click', handleClear);
      randomButton.addEventListener('click', handleRandom);
      configureButton.addEventListener('click', () => settingsController.openModal());

      bindToggles();
      updateCountsAndStats();

      Shortcuts.registerShortcuts({
        onPlayPause: handlePlayPauseButton,
        onStop: handleStop,
        onRandom: handleRandom,
        onClear: handleClear,
        onConfigure: () => settingsController.openModal(),
        isModalOpen: () => modalOverlay.classList.contains('modal-overlay--visible')
      });

      Random.initialize().then(() => {
        // Refresh the category dropdown in case the hosted JSON file
        // introduced categories that weren't in the embedded fallback.
        const existingValues = new Set(Array.from(categorySelect.options).map((o) => o.value));
        Random.getAvailableCategories().forEach(({ value, label }) => {
          if (!existingValues.has(value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            categorySelect.appendChild(option);
          }
        });
        categorySelect.value = settings.category;
      });
    }

    return { init };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.UI = { createApp };
})(window);
