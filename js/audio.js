/* Sound effects, synthesised with oscillators.
 *
 * No audio files: nothing to host, nothing to 404 on GitHub Pages, and no
 * loading delay before the first sound. iOS refuses to play audio from a
 * context created at page load, so the context is built inside the first real
 * user gesture -- see unlock() below.
 *
 * (If a phone is silent, check the hardware mute switch: iOS honours it for
 * WebAudio, so that is not necessarily a bug.)
 *
 * Safari needs more care than Chrome here: it has an extra context state and
 * drops out of 'running' on its own. See unlock().
 */

const Sound = (function () {
  let ctx = null;
  let muted = false;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();

      // WebKit stays mute until something has actually been played through the
      // context inside a gesture. Play a single silent sample to satisfy it.
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) { /* not fatal: the notes below may still sound */ }
    }

    // Anything that is not running, rather than only 'suspended'. Safari has a
    // third state Chrome does not -- 'interrupted' -- which it parks a context
    // in after a phone call, a route change, or a spell in the background. A
    // context sitting in 'interrupted' was never resumed here, so sound would
    // stop for good in Safari while Chrome carried on none the wiser.
    if (ctx.state !== 'running' && ctx.resume) {
      const resuming = ctx.resume();
      // Outside a gesture Safari rejects this; that is fine, the next tap
      // will try again. An unhandled rejection would show up in the console.
      if (resuming && resuming.catch) resuming.catch(function () {});
    }
  }

  function setMuted(value) { muted = !!value; }
  function isMuted() { return muted; }

  /* One note. `type` shapes the timbre, `t` is an offset in seconds. */
  function note(freq, start, duration, gain, type) {
    if (!ctx || muted) return;

    // A context that has drifted out of 'running' has a frozen clock, so
    // anything scheduled against it would land in the past once it restarts
    // and simply never be heard. Nudge it awake and give every note a moment
    // of lead time so it is always scheduled slightly ahead of now.
    if (ctx.state !== 'running') unlock();

    const t = ctx.currentTime + 0.005 + start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // A quick fade in and a smooth fade out; square edges click unpleasantly.
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function melody(freqs, step, duration, gain, type) {
    freqs.forEach(function (f, i) {
      note(f, i * step, duration, gain, type);
    });
  }

  // Notes we build the effects from (C major, which is hard to make sound sad).
  const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99;
  const A5 = 880.00, C6 = 1046.50, E6 = 1318.51, G6 = 1567.98;

  return {
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,

    // A soft tick when a cell is picked, so every tap answers back.
    select: function () { note(G5, 0, 0.09, 0.10, 'sine'); },

    // A digit went in. Bright, short, satisfying.
    place: function () { melody([E5, A5], 0.05, 0.16, 0.14, 'triangle'); },

    // Right answer, immediate-feedback levels.
    correct: function () { melody([E5, G5, C6], 0.07, 0.24, 0.15, 'triangle'); },

    // Wrong answer. Deliberately gentle -- a low, soft "try again", never a buzz.
    wrong: function () {
      note(300, 0, 0.16, 0.11, 'sine');
      note(225, 0.11, 0.22, 0.11, 'sine');
    },

    // Level finished.
    win: function () { melody([C5, E5, G5, C6, E6], 0.09, 0.42, 0.15, 'triangle'); },

    // Five in a row -- the level is mastered and the next one is unlocked.
    fanfare: function () {
      melody([C5, E5, G5, C6, E6, G6], 0.1, 0.5, 0.15, 'triangle');
      note(C6, 0.62, 0.9, 0.16, 'triangle');
      note(G6, 0.62, 0.9, 0.10, 'sine');
    },
  };
})();
