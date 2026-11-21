const SoundFX = (() => {
  let ctx = null;
  let enabled = true;

  function ensureContext() {
    if (!enabled) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  ['touchstart', 'pointerdown', 'click'].forEach((evt) => {
    window.addEventListener(evt, () => ensureContext(), { passive: true });
  });

  function tone(freq, duration, type = 'sine', gainVal = 0.12, endFreq = null) {
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function noiseBurst(duration, filterFreq = 1200, gainVal = 0.14) {
    const c = ensureContext();
    if (!c) return;
    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainVal, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  return {
    isEnabled: () => enabled,
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    chock() { tone(110, 0.14, 'triangle', 0.2, 55); },
    jack() { tone(240, 0.09, 'sawtooth', 0.1, 360); },
    impact() {
      noiseBurst(0.18, 900, 0.18);
      tone(140, 0.18, 'square', 0.1, 85);
    },
    scan() { tone(520, 0.35, 'sine', 0.09, 1040); },
    air() { noiseBurst(0.22, 2400, 0.12); },
    torqueClick() {
      tone(880, 0.05, 'triangle', 0.16, 420);
      setTimeout(() => tone(1320, 0.04, 'sine', 0.12), 45);
    },
    error() { tone(160, 0.28, 'sawtooth', 0.16, 95); },
    success() {
      tone(523.25, 0.12, 'triangle', 0.14);
      setTimeout(() => tone(659.25, 0.12, 'triangle', 0.14), 110);
      setTimeout(() => tone(783.99, 0.22, 'triangle', 0.16), 220);
    }
  };
})();

