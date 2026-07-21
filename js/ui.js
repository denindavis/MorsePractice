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

    const textCaptionTrack = document.getElementById('textCaptionTrack');
    const morseCaptionTrack = document.getElementById('morseCaptionTrack');
    const textCaptionInner = document.getElementById('textCaptionInner');
    const morseCaptionInner = document.getElementById('morseCaptionInner');

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
      showTextCaptionCheckbox: document.getElementById('showTextCaptionCheckbox'),
      showMorseCaptionCheckbox: document.getElementById('showMorseCaptionCheckbox'),
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

    // Per-letter data (one entry per letter, in playback order) used
    // to render the optional Text/Morse caption tracks, plus the
    // spans currently rendered for each track so they can be
    // highlighted without a full rebuild on every animation frame.
    let letterTrack = [];
    let textCaptionSpans = [];
    let morseCaptionSpans = [];

    // Pixels-per-second scale shared by BOTH caption tracks' inner
    // strips - deliberately the same value for both, so they always
    // scroll at identical speed. When a sentence is short enough,
    // this equals containerWidth / totalDuration and the strips
    // exactly fill the visible area (no scrolling). When letters
    // would otherwise overlap in either track, the scale widens just
    // enough to keep a minimum gap between them, making the strips
    // wider than the viewport - at that point they auto-scroll (via a
    // CSS transform, not native scrolling) to keep the current letter
    // aligned with the progress bar cursor.
    let sharedTrackPxPerSecond = 0;
    let lastKnownElapsedSeconds = 0;
    let lastKnownTotalDuration = 0;
    let lastHighlightedWordIndex = -1;
    let lastHighlightedLetterIndex = -1;
    const MIN_LETTER_SPACING_TEXT_PX = 20;
    // Approximate rendered glyph widths, used to size each letter's
    // required gap individually rather than reserving the same flat
    // minimum everywhere - a "." only needs a sliver of room, while a
    // "-----" needs noticeably more, so only the letters that
    // actually need extra room get it.
    const MORSE_SYMBOL_WIDTH_PX = 8; // per dot/dash, at the caption's monospace font size
    const LETTER_GAP_PADDING_PX = 6; // breathing room after a glyph before the next one starts
    const CAPTION_WIDTH_FALLBACK_PX = 320; // used only if the track is momentarily unmeasurable (e.g. hidden)

    // Previous/Next now "cue and pause": seek to a word, wait briefly,
    // then auto-play. This timer tracks that pending auto-play so a
    // second press (or Stop/Clear/manual Play) can cancel it cleanly
    // instead of letting two auto-plays race each other.
    let pendingResumeTimer = null;
    const WORD_JUMP_PAUSE_MS = 1000;
    // How long into the current word we must already be before
    // Previous restarts that word instead of jumping further back -
    // this is what makes a quick second press go to the previous
    // word, matching standard media-player "previous track" behavior.
    const PREVIOUS_WORD_GRACE_SECONDS = 1.0;

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
    // Delayed word navigation helpers (used by Previous/Next)
    // ---------------------------------------------------------------
    function cancelPendingResume() {
      if (pendingResumeTimer !== null) {
        clearTimeout(pendingResumeTimer);
        pendingResumeTimer = null;
      }
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

      // Group tone elements into one entry per letter (start time +
      // full Morse pattern) for the optional caption tracks.
      const letterEntriesByKey = new Map();
      elements
        .filter((el) => el.type === 'tone')
        .forEach((el) => {
          const key = `${el.wordIndex}:${el.letterIndex}`;
          if (!letterEntriesByKey.has(key)) {
            letterEntriesByKey.set(key, {
              wordIndex: el.wordIndex,
              letterIndex: el.letterIndex,
              char: el.char,
              start: el.start,
              morseSymbols: []
            });
          }
          letterEntriesByKey.get(key).morseSymbols.push(el.symbol);
        });
      letterTrack = Array.from(letterEntriesByKey.values()).sort((a, b) => a.start - b.start);
      renderCaptionTracks(totalDuration);
      updateCaptionScroll(0, totalDuration);

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
    // Caption tracks (optional synced Text/Morse strips)
    // ---------------------------------------------------------------
    /**
     * Picks a pixels-per-second scale for a caption track: fast enough
     * to exactly fill the container when the sentence is short, but
     * never so tight that a letter's own glyph would run into the
     * next letter - it widens the scale (making the strip wider than
     * the container, which triggers auto-scroll) only as much as each
     * specific gap actually needs, so short glyphs (like ".") don't
     * get stretched out just because some other letter is longer.
     * @param {Array<{start:number}>} entries - sorted by start time
     * @param {number} containerWidthPx
     * @param {number} totalDuration
     * @param {(entry: Object) => number} getRequiredWidthPx - returns
     *   how many pixels the given entry's glyph needs before the next
     *   letter may begin
     * @returns {number} pixels per second
     */
    function computeCaptionPxPerSecond(entries, containerWidthPx, totalDuration, getRequiredWidthPx) {
      if (totalDuration <= 0) return 0;
      const fitPxPerSecond = containerWidthPx / totalDuration;

      let maxRequiredPxPerSecond = 0;
      for (let i = 1; i < entries.length; i += 1) {
        const delta = entries[i].start - entries[i - 1].start;
        if (delta <= 0) continue; // simultaneous entries can't be spaced apart in time
        const requiredPxPerSecond = getRequiredWidthPx(entries[i - 1]) / delta;
        if (requiredPxPerSecond > maxRequiredPxPerSecond) maxRequiredPxPerSecond = requiredPxPerSecond;
      }

      return Math.max(fitPxPerSecond, maxRequiredPxPerSecond);
    }

    /**
     * Rebuilds the Text/Morse caption tracks: one pixel-positioned
     * span per letter inside each track's scrolling inner wrapper,
     * both using the same shared pixels-per-second scale so they
     * always scroll at the same speed.
     * @param {number} totalDuration
     */
    function renderCaptionTracks(totalDuration) {
      textCaptionInner.innerHTML = '';
      morseCaptionInner.innerHTML = '';
      textCaptionSpans = [];
      morseCaptionSpans = [];

      if (totalDuration <= 0) {
        sharedTrackPxPerSecond = 0;
        return;
      }

      const containerWidthPx = Math.max(
        textCaptionTrack.clientWidth || 0,
        morseCaptionTrack.clientWidth || 0
      ) || CAPTION_WIDTH_FALLBACK_PX;

      // Use whichever track needs more room for a given letter - keeps
      // both legible without overlap - but apply that one scale to
      // both, so Text and Morse always scroll in lockstep.
      const textPxPerSecond = computeCaptionPxPerSecond(
        letterTrack, containerWidthPx, totalDuration,
        () => MIN_LETTER_SPACING_TEXT_PX
      );
      const morsePxPerSecond = computeCaptionPxPerSecond(
        letterTrack, containerWidthPx, totalDuration,
        (entry) => entry.morseSymbols.length * MORSE_SYMBOL_WIDTH_PX + LETTER_GAP_PADDING_PX
      );
      sharedTrackPxPerSecond = Math.max(textPxPerSecond, morsePxPerSecond);

      letterTrack.forEach((entry) => {
        const leftPx = entry.start * sharedTrackPxPerSecond;

        const textSpan = document.createElement('span');
        textSpan.className = 'caption-track__letter';
        textSpan.style.left = `${leftPx}px`;
        textSpan.textContent = entry.char;
        textCaptionInner.appendChild(textSpan);
        textCaptionSpans.push({ wordIndex: entry.wordIndex, letterIndex: entry.letterIndex, element: textSpan });

        const morseSpan = document.createElement('span');
        morseSpan.className = 'caption-track__letter';
        morseSpan.style.left = `${leftPx}px`;
        morseSpan.textContent = entry.morseSymbols.join('');
        morseCaptionInner.appendChild(morseSpan);
        morseCaptionSpans.push({ wordIndex: entry.wordIndex, letterIndex: entry.letterIndex, element: morseSpan });
      });
    }

    /**
     * Slides each caption track's inner wrapper so the point in the
     * strip corresponding to `elapsedSeconds` lands at the same x
     * position the progress bar's fill currently reaches - i.e. the
     * currently-playing letter always sits next to the seekbar
     * cursor. Both tracks share the same pxPerSecond scale, so they
     * scroll together at identical speed. Doubles as the "no manual
     * scrolling" mechanism: the user has nothing to grab (overflow is
     * hidden), only this transform ever moves the content, and only
     * forward/backward with playback.
     * @param {number} elapsedSeconds
     * @param {number} totalDuration
     */
    function updateCaptionScroll(elapsedSeconds, totalDuration) {
      lastKnownElapsedSeconds = elapsedSeconds;
      lastKnownTotalDuration = totalDuration;

      const currentContentX = elapsedSeconds * sharedTrackPxPerSecond;

      [
        { track: textCaptionTrack, inner: textCaptionInner },
        { track: morseCaptionTrack, inner: morseCaptionInner }
      ].forEach(({ track, inner }) => {
        const containerWidthPx = track.clientWidth || CAPTION_WIDTH_FALLBACK_PX;
        const targetX = totalDuration > 0 ? (elapsedSeconds / totalDuration) * containerWidthPx : 0;
        inner.style.transform = `translateX(${targetX - currentContentX}px)`;
      });
    }

    /**
     * Re-measures and rebuilds the caption tracks against their
     * current rendered width (e.g. after a window resize, or right
     * after the user enables a track that was previously hidden and
     * therefore unmeasurable), then re-applies the last known scroll
     * position so the view doesn't jump.
     */
    function refreshCaptionLayout() {
      if (lastKnownTotalDuration > 0) {
        renderCaptionTracks(lastKnownTotalDuration);
        applyCaptionHighlight(lastHighlightedWordIndex, lastHighlightedLetterIndex);
        updateCaptionScroll(lastKnownElapsedSeconds, lastKnownTotalDuration);
      }
    }

    /**
     * Highlights the letter/word currently playing (or cued) in both
     * caption tracks. Pass -1, -1 to clear all highlighting.
     * @param {number} wordIndex
     * @param {number} letterIndex
     */
    function applyCaptionHighlight(wordIndex, letterIndex) {
      lastHighlightedWordIndex = wordIndex;
      lastHighlightedLetterIndex = letterIndex;
      [textCaptionSpans, morseCaptionSpans].forEach((spans) => {
        spans.forEach((entry) => {
          const isCurrentWord = entry.wordIndex === wordIndex;
          const isCurrentLetter = isCurrentWord && entry.letterIndex === letterIndex;
          entry.element.classList.toggle('caption-track__letter--current-word', isCurrentWord);
          entry.element.classList.toggle('caption-track__letter--current-letter', isCurrentLetter);
        });
      });
    }

    /** Shows/hides each caption track according to its Configure checkbox. */
    function applyCaptionVisibility() {
      textCaptionTrack.classList.toggle('caption-track--visible', settings.showTextCaption);
      morseCaptionTrack.classList.toggle('caption-track--visible', settings.showMorseCaption);
      // The track was unmeasurable (0 width) while hidden, so its
      // layout may be stale - rebuild now that it can be measured.
      refreshCaptionLayout();
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
      updateCaptionScroll(offsetSeconds, totalDuration);
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
          updateCaptionScroll(elapsedSeconds, totalSeconds);
        },
        onCharacter({ wordIndex, letterIndex }) {
          // Tracked silently (current char/symbol are no longer shown
          // in the stats bar) so Previous/Next jump relative to the
          // word actually sounding right now, and so the caption
          // tracks (if enabled) stay highlighted in sync.
          currentWordIndex = wordIndex;
          applyCaptionHighlight(wordIndex, letterIndex);
        },
        onComplete() {
          setToolbarPlayingState(false, false);
          ledController.turnOff();
          currentWordIndex = 0;
          pendingOffsetSeconds = 0;
          applyCaptionHighlight(-1, -1);
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
      cancelPendingResume();
      if (player.isPlaying()) {
        player.pause();
      } else if (player.isPaused()) {
        player.resume();
      } else {
        startPlayback();
      }
    }

    function handleStop() {
      cancelPendingResume();
      player.stop();
      setToolbarPlayingState(false, false);
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      renderProgressPreview(0);
      applyCaptionHighlight(-1, -1);
    }

    function stopIfActive() {
      if (player && (player.isPlaying() || player.isPaused())) {
        handleStop();
      }
    }

    /** Restarts playback of the current text from the very beginning. */
    function handleRestart() {
      cancelPendingResume();
      player.stop();
      currentWordIndex = 0;
      pendingOffsetSeconds = 0;
      renderProgressPreview(0);
      applyCaptionHighlight(0, 0);
      startPlayback();
    }

    // ---------------------------------------------------------------
    // Word navigation (Previous / Next)
    // ---------------------------------------------------------------
    /**
     * Seeks to the start of the given word, pauses briefly (LED off,
     * silent), then automatically starts playing from there. Used by
     * both Previous and Next so a rapid second press cleanly cancels
     * and replaces the pending auto-play instead of racing it.
     * @param {number} targetWordIndex
     */
    function seekAndDelayedPlay(targetWordIndex) {
      cancelPendingResume();
      player.stop();

      currentWordIndex = targetWordIndex;
      pendingOffsetSeconds = wordStartTimes[targetWordIndex] || 0;
      renderProgressPreview(pendingOffsetSeconds);
      applyCaptionHighlight(targetWordIndex, 0); // every word's first letter is letterIndex 0
      setToolbarPlayingState(false, false);

      if (!plainTextInput.value.trim()) return;

      pendingResumeTimer = setTimeout(() => {
        pendingResumeTimer = null;
        startPlayback();
      }, WORD_JUMP_PAUSE_MS);
    }

    function handleNext() {
      if (totalWords === 0) return;
      const targetWordIndex = Utils.clamp(currentWordIndex + 1, 0, totalWords - 1);
      seekAndDelayedPlay(targetWordIndex);
    }

    /**
     * First press: if we're more than a beat into the current word,
     * jump back to that word's own start. A quick second press (or
     * pressing Previous again shortly after) instead jumps to the
     * previous word - the same "restart track vs. previous track"
     * pattern most media players use for their Previous button.
     */
    function handlePrevious() {
      if (totalWords === 0) return;

      const isActive = player.isPlaying() || player.isPaused();
      const currentPosition = isActive ? player.getCurrentPosition() : pendingOffsetSeconds;
      const currentWordStart = wordStartTimes[currentWordIndex] || 0;
      const elapsedInWord = currentPosition - currentWordStart;

      const targetWordIndex = elapsedInWord > PREVIOUS_WORD_GRACE_SECONDS
        ? currentWordIndex
        : Utils.clamp(currentWordIndex - 1, 0, totalWords - 1);

      seekAndDelayedPlay(targetWordIndex);
    }

    // ---------------------------------------------------------------
    // Toolbar actions
    // ---------------------------------------------------------------
    function handleClear() {
      cancelPendingResume();
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
        applyCaptionVisibility();
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
      applyCaptionVisibility();

      plainTextInput.addEventListener('input', () => {
        cancelPendingResume();
        stopIfActive();
        currentWordIndex = 0;
        pendingOffsetSeconds = 0;
        syncFromPlainText();
      });

      morseTextInput.addEventListener('input', () => {
        cancelPendingResume();
        stopIfActive();
        currentWordIndex = 0;
        pendingOffsetSeconds = 0;
        syncFromMorseText();
      });

      playPauseButton.addEventListener('click', handlePlayPauseButton);
      previousButton.addEventListener('click', handlePrevious);
      nextButton.addEventListener('click', handleNext);
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

      window.addEventListener('resize', Utils.debounce(refreshCaptionLayout, 200));
    }

    return { init };
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.UI = { createApp };
})(window);
