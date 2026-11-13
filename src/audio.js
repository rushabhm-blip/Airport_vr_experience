// Spoken guidance. Order of preference for every line:
//   1. a recorded file listed in assets/voice/manifest.json  ({ "exact sentence": "file.mp3" })  <- soft, human voice
//   2. the best female system voice the device offers (slow, gentle)
// plus soft UI chimes (WebAudio). If neither speech path exists the lesson still works from on-screen text.
const PREFER = [/neerja|heera|veena|kalpana/i, /natural|neural|online/i, /google uk english female/i, /samantha|serena|karen|moira|tessa|fiona|susan|hazel/i, /aria|jenny|zira|libby|sonia/i, /female|woman/i];

export class Voice {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this.last = '';
    this.manifest = {};
    this.audio = null;
    this.voice = null;
    this.log = new Set();               // every distinct line spoken (used to build the recording script)
    fetch('./assets/voice/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { this.manifest = m || {}; }).catch(() => {});
    if (this.synth) { this._pick(); this.synth.addEventListener?.('voiceschanged', () => this._pick()); }
  }

  _pick() {
    const vs = this.synth.getVoices?.() || [];
    if (!vs.length) return;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    let best = null;
    for (const re of PREFER) { best = en.find((v) => re.test(v.name)); if (best) break; }
    this.voice = best || en.find((v) => /en[-_]IN/i.test(v.lang)) || en[0] || null;
  }

  say(text) {
    if (!text) return;
    this.last = text; this.log.add(text);
    if (!this.enabled) { this._speakUntil = 0; return; }
    this.stop();
    this._speakUntil = performance.now() + Math.min(18000, 1500 + String(text).split(/s+/).length * 430);      // roughly how long the line takes at this pace: the watch tour waits for it
    const file = this.manifest[text];
    if (file) {
      try { this.audio = new Audio('./assets/voice/' + file); this.audio.volume = 0.95; this.audio.play().catch(() => this._tts(text)); return; } catch { /* fall through */ }
    }
    this._tts(text);
  }

  _tts(text) {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-IN';
      u.rate = 0.82; u.pitch = 1.08; u.volume = 1;   // slower and slightly warmer than the default
      this.synth.speak(u);
    } catch { /* ignore */ }
  }

  /** True while a spoken line is probably still playing (used to pace the watch tour). */
  get busy() { return this.enabled && performance.now() < (this._speakUntil || 0); }
  repeat() { if (this.last) this.say(this.last); }
  stop() {
    try { this.synth?.cancel(); } catch { /* ignore */ }
    if (this.audio) { try { this.audio.pause(); } catch { /* ignore */ } this.audio = null; }
  }

  _ctx() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    this.ctx?.resume?.();
    return this.ctx;
  }
  tone(freqs, dur = 0.18, gain = 0.06) {
    const c = this._ctx(); if (!c) return;
    const t0 = c.currentTime;
    freqs.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + i * dur); g.gain.linearRampToValueAtTime(gain, t0 + i * dur + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * dur + dur);
      o.connect(g).connect(c.destination); o.start(t0 + i * dur); o.stop(t0 + i * dur + dur + 0.02);
    });
  }
  success() { this.tone([659, 880, 1175], 0.14); }
  soft() { this.tone([523], 0.12, 0.04); }
  retry() { this.tone([330, 294], 0.16, 0.04); }
  beep() { this.tone([1046], 0.09, 0.05); }
}
