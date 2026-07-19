/**
 * playback.js
 * ----------------------------------------------------------------------
 * The audio/timing engine. Converts plain text into a precise timeline
 * of tone and silence elements (using accurate International Morse
 * timing with optional Farnsworth spacing), then plays it back through
 * the Web Audio API while notifying listeners (LED, UI, statistics) in
 * sync via a requestAnimationFrame loop that reads the AudioContext's
 * own clock - so audio stays the single source of truth for timing and
 * visuals never drift from what is actually heard.
 *
 * Pause/resume is implemented using AudioContext.suspend()/resume(),
 * which freezes and un-freezes the context's clock in place. Because
 * every oscillator in the timeline is scheduled up front against
 * absolute AudioContext time, suspending simply pauses that clock and
 * resuming continues exactly where it left off - no manual timeline
 * bookkeeping required.
 * ----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const Morse = global.MorseApp.Morse;

  const STATE = Object.freeze({
    IDLE: 'idle',
    PLAYING: 'playing',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    COMPLETE: 'complete'
  });

  /**
   * Computes dot/dash/gap durations (in seconds) from WPM settings,
   * applying Farnsworth spacing when farnsworthWpm < speedWpm.
   * @param {number} speedWpm - character speed
   * @param {number} farnsworthWpm - overall/spacing speed
   * @returns {Object} duration constants in seconds
   */
  function computeTiming(speedWpm, farnsworthWpm) {
    const ws = Math.max(1, speedWpm);
    const wf = Math.min(Math.max(1, farnsworthWpm), ws); // never faster than ws

    const dotDuration = 1.2 / ws; // "ta": standard PARIS-based dot length

    // Farnsworth spacing unit ("ts"). Reduces to dotDuration when wf === ws.
    const spacingUnit = wf === ws
      ? dotDuration
      : (60 * ws - 37.2 * wf) / (19 * ws * wf);

    return {
      dot: dotDuration,
      dash: dotDuration * 3,
      intraCharacterGap: dotDuration,
      letterGap: spacingUnit * 3,
      wordGap: spacingUnit * 7
    };
  }

  /**
   * Builds a flat timeline of playback elements from plain text.
   * Each element is either a tone (dot/dash) or a silence (gap), with
   * enough metadata to drive the LED, statistics, and progress bar.
   * @param {string} text
   * @param {Object} timing - output of computeTiming()
   * @returns {{elements: Array<Object>, totalDuration: number}}
   */
  function buildTimeline(text, timing) {
    const elements = [];
    let cursor = 0;

    const words = text.toUpperCase().split(/\s+/).filter(Boolean);

    words.forEach((word, wordIndex) => {
      const letters = word.split('').filter((char) => Morse.getMorseForChar(char));

      letters.forEach((char, letterIndex) => {
        const symbols = Morse.getMorseForChar(char).split('');

        symbols.forEach((symbol, symbolIndex) => {
          const duration = symbol === '.' ? timing.dot : timing.dash;
          elements.push({
            type: 'tone',
            symbol,
            char,
            wordIndex,
            letterIndex,
            start: cursor,
            duration
          });
          cursor += duration;

          const isLastSymbolInLetter = symbolIndex === symbols.length - 1;
          if (!isLastSymbolInLetter) {
            elements.push({
              type: 'silence',
              reason: 'intra-character',
              start: cursor,
              duration: timing.intraCharacterGap
            });
            cursor += timing.intraCharacterGap;
          }
        });

        const isLastLetterInWord = letterIndex === letters.length - 1;
        if (!isLastLetterInWord) {
          elements.push({
            type: 'silence',
            reason: 'letter-gap',
            start: cursor,
            duration: timing.letterGap
          });
          cursor += timing.letterGap;
        }
      });

      const isLastWord = wordIndex === words.length - 1;
      if (!isLastWord) {
        elements.push({
          type: 'silence',
          reason: 'word-gap',
          start: cursor,
          duration: timing.wordGap
        });
        cursor += timing.wordGap;
      }
    });

    return { elements, totalDuration: cursor };
  }

  /**
   * MorsePlayer manages a single playback session: audio graph,
   * scheduling, pause/resume, and the sync loop that drives callbacks.
   */
  class MorsePlayer {
    constructor(callbacks = {}) {
      this.callbacks = {
        onStateChange: callbacks.onStateChange || (() => {}),
        onLedChange: callbacks.onLedChange || (() => {}),
        onProgress: callbacks.onProgress || (() => {}),
        onCharacter: callbacks.onCharacter || (() => {}),
        onComplete: callbacks.onComplete || (() => {})
      };

      this.audioContext = null;
      this.masterGain = null;
      this.scheduledNodes = [];
      this.timeline = { elements: [], totalDuration: 0 };
      this.startContextTime = 0;
      this.state = STATE.IDLE;
      this.animationFrameId = null;
      this.lastLedOn = false;
      this.lastActiveIndex = -1;
      this.currentText = null;
      this.currentOptions = null;
      this.soundEnabled = true;
      this.volume = 0.6;
    }

    /**
     * Applies the current soundEnabled/volume state to the master
     * gain node immediately, if the audio graph already exists. This
     * is what makes unchecking "Sound" (or dragging the volume
     * slider) take effect instantly, even mid-playback, rather than
     * only on the next Play press.
     */
    applyGain() {
      if (!this.masterGain || !this.audioContext) return;
      const targetGain = this.soundEnabled ? this.volume : 0;
      this.masterGain.gain.setValueAtTime(targetGain, this.audioContext.currentTime);
    }

    /**
     * Enables or disables audible output immediately, independent of
     * play/pause state. Does not affect the LED or timing.
     * @param {boolean} enabled
     */
    setSoundEnabled(enabled) {
      this.soundEnabled = enabled;
      this.applyGain();
    }

    /**
     * Sets the output volume (0..1) immediately.
     * @param {number} volume
     */
    setVolume(volume) {
      this.volume = volume;
      this.applyGain();
    }

    /**
     * Lazily creates the AudioContext on first use (required by some
     * browsers' autoplay policies, which need a user gesture first).
     */
    ensureAudioContext() {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
      }
      return this.audioContext;
    }

    /**
     * Starts playback of the given plain text from the beginning.
     * @param {string} text
     * @param {Object} options
     * @param {number} options.pitchHz
     * @param {number} options.volume - 0..1
     * @param {number} options.speedWpm
     * @param {number} options.farnsworthWpm
     * @param {string} options.soundType - sine|square|triangle|sawtooth
     * @param {boolean} options.soundEnabled
     * @param {number} [startOffsetSeconds] - position within the
     *   timeline to begin playback at (used for word-level seeking)
     */
    play(text, options, startOffsetSeconds = 0) {
      this.stop(); // ensure a clean slate

      const timing = computeTiming(options.speedWpm, options.farnsworthWpm);
      this.timeline = buildTimeline(text, timing);
      this.currentText = text;
      this.currentOptions = options;

      if (this.timeline.elements.length === 0 || startOffsetSeconds >= this.timeline.totalDuration) {
        this.state = STATE.COMPLETE;
        this.callbacks.onStateChange(this.state);
        this.callbacks.onComplete();
        return;
      }

      const ctx = this.ensureAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      this.masterGain.gain.setValueAtTime(0, ctx.currentTime); // silence any lead-in click
      this.soundEnabled = options.soundEnabled;
      this.volume = options.volume;
      this.applyGain();

      // "origin" is a virtual timeline-zero point in AudioContext time.
      // elapsed = ctx.currentTime - origin always equals the current
      // position within the full timeline, whether or not we started
      // partway through (startOffsetSeconds > 0).
      this.startContextTime = ctx.currentTime + 0.05 - startOffsetSeconds;

      this.timeline.elements
        .filter((el) => el.type === 'tone' && el.start >= startOffsetSeconds - 1e-6)
        .forEach((el) => this.scheduleTone(el, options));

      this.lastLedOn = false;
      this.lastActiveIndex = -1;
      this.state = STATE.PLAYING;
      this.callbacks.onStateChange(this.state);
      this.runSyncLoop();
    }

    /**
     * Jumps playback to a specific point in the timeline (in seconds),
     * preserving whether playback was playing or paused. Used by the
     * Previous/Next word buttons. Does nothing if playback is idle -
     * callers should track a "pending offset" themselves for that case
     * and pass it into the next play() call instead.
     * @param {number} offsetSeconds
     */
    seek(offsetSeconds) {
      if (!this.currentText || (!this.isPlaying() && !this.isPaused())) return;
      const wasPaused = this.isPaused();
      this.play(this.currentText, this.currentOptions, Math.max(0, offsetSeconds));
      if (wasPaused && this.audioContext) {
        this.audioContext.suspend();
        this.state = STATE.PAUSED;
        this.callbacks.onStateChange(this.state);
      }
    }

    /**
     * Schedules a single oscillator burst for a tone element, with a
     * short gain ramp at the edges to avoid audible clicks.
     * @param {Object} element
     * @param {Object} options
     */
    scheduleTone(element, options) {
      const ctx = this.audioContext;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = options.soundType;
      oscillator.frequency.setValueAtTime(options.pitchHz, ctx.currentTime);

      const absoluteStart = this.startContextTime + element.start;
      const absoluteEnd = absoluteStart + element.duration;
      const rampTime = Math.min(0.005, element.duration / 4);

      gainNode.gain.setValueAtTime(0, absoluteStart);
      gainNode.gain.linearRampToValueAtTime(1, absoluteStart + rampTime);
      gainNode.gain.setValueAtTime(1, absoluteEnd - rampTime);
      gainNode.gain.linearRampToValueAtTime(0, absoluteEnd);

      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);

      oscillator.start(absoluteStart);
      oscillator.stop(absoluteEnd + 0.01);

      this.scheduledNodes.push(oscillator, gainNode);
    }

    /**
     * Drives LED/UI callbacks by comparing the AudioContext clock
     * against the precomputed timeline, once per animation frame.
     */
    runSyncLoop() {
      const ctx = this.audioContext;

      const tick = () => {
        if (this.state !== STATE.PLAYING) return;

        const elapsed = ctx.currentTime - this.startContextTime;
        const activeIndex = this.timeline.elements.findIndex(
          (el) => elapsed >= el.start && elapsed < el.start + el.duration
        );

        if (activeIndex !== this.lastActiveIndex) {
          this.lastActiveIndex = activeIndex;
          const active = activeIndex >= 0 ? this.timeline.elements[activeIndex] : null;

          const isLedOn = !!active && active.type === 'tone';
          if (isLedOn !== this.lastLedOn) {
            this.lastLedOn = isLedOn;
            this.callbacks.onLedChange(isLedOn);
          }

          if (active && active.type === 'tone') {
            this.callbacks.onCharacter({
              char: active.char,
              symbol: active.symbol,
              wordIndex: active.wordIndex,
              letterIndex: active.letterIndex
            });
          }
        }

        const percent = this.timeline.totalDuration > 0
          ? global.MorseApp.Utils.clamp(elapsed / this.timeline.totalDuration, 0, 1)
          : 1;
        this.callbacks.onProgress({
          elapsedSeconds: Math.max(0, elapsed),
          totalSeconds: this.timeline.totalDuration,
          percent
        });

        if (elapsed >= this.timeline.totalDuration) {
          this.state = STATE.COMPLETE;
          this.callbacks.onStateChange(this.state);
          this.callbacks.onLedChange(false);
          this.callbacks.onComplete();
          this.cancelSyncLoop();
          return;
        }

        this.animationFrameId = requestAnimationFrame(tick);
      };

      this.animationFrameId = requestAnimationFrame(tick);
    }

    cancelSyncLoop() {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    /** Pauses playback in place by freezing the AudioContext clock. */
    pause() {
      if (this.state !== STATE.PLAYING || !this.audioContext) return;
      this.audioContext.suspend();
      this.state = STATE.PAUSED;
      this.callbacks.onStateChange(this.state);
    }

    /** Resumes playback from exactly where it was paused. */
    resume() {
      if (this.state !== STATE.PAUSED || !this.audioContext) return;
      this.audioContext.resume();
      this.state = STATE.PLAYING;
      this.callbacks.onStateChange(this.state);
      this.runSyncLoop();
    }

    /** Immediately stops playback and clears all scheduled audio. */
    stop() {
      this.cancelSyncLoop();

      this.scheduledNodes.forEach((node) => {
        try {
          if (typeof node.stop === 'function') node.stop(0);
          node.disconnect();
        } catch (error) {
          // Node may already be stopped/disconnected - safe to ignore.
        }
      });
      this.scheduledNodes = [];

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.lastLedOn = false;
      this.lastActiveIndex = -1;
      this.callbacks.onLedChange(false);

      const wasIdle = this.state === STATE.IDLE;
      this.state = STATE.STOPPED;
      if (!wasIdle) this.callbacks.onStateChange(this.state);
    }

    /** Returns whether playback is currently active (not paused/idle). */
    isPlaying() {
      return this.state === STATE.PLAYING;
    }

    isPaused() {
      return this.state === STATE.PAUSED;
    }
  }

  global.MorseApp = global.MorseApp || {};
  global.MorseApp.Playback = {
    STATE,
    computeTiming,
    buildTimeline,
    MorsePlayer
  };
})(window);
