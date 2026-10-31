// 음원 파일 없이 Web Audio로 전부 합성한다.
const SYLLABLES = [
  { v: 'a', p: 0, b: 1 }, { v: 'u', p: 0, b: 1 }, { v: 'a', p: 2, b: 1 },
  { v: 'i', p: 0, b: 1 }, { v: 'a', p: -2, b: 1 }, { v: 'u', p: 0, b: 3 },
];
const FORMANTS = { a: [730, 1090, 2440], u: [320, 870, 2240], i: [300, 2200, 3000] };
const BEAT = 0.62;
const ROOT = 110;

export class Sound {
  constructor(vol) { this.vol = vol; this.ctx = null; this.chantOn = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createDynamicsCompressor();
    this.master.connect(ctx.destination);
    this.analyser = ctx.createAnalyser(); this.master.connect(this.analyser);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.6);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    this.reverb.connect(wet); wet.connect(this.master);

    this.buses = {};
    for (const k of ['wind', 'chant', 'perc']) {
      const g = ctx.createGain(); g.connect(this.master);
      this.buses[k] = g;
    }
    this.chantGate = ctx.createGain(); this.chantGate.gain.value = 0;
    this.chantGate.connect(this.buses.chant); this.chantGate.connect(this.reverb);
    this.percSend = ctx.createGain(); this.percSend.gain.value = 0.5;
    this.percSend.connect(this.reverb);
    this.buses.perc.connect(this.percSend);
    this.applyVolumes();
    this.startWind();
    this.chantTimer = setInterval(() => this.scheduleChant(), 300);
    this.chimeTimer = setTimeout(() => this.windChime(), 9000);
    ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const curve = (v) => Math.pow(v / 100, 1.6);
    this.buses.wind.gain.setTargetAtTime(curve(this.vol.wind) * 0.6, t, 0.05);
    this.buses.chant.gain.setTargetAtTime(curve(this.vol.chant) * 0.9, t, 0.05);
    this.buses.perc.gain.setTargetAtTime(curve(this.vol.perc), t, 0.05);
  }

  impulse(sec) {
    const { ctx } = this, n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return b;
  }

  startWind() {
    const { ctx } = this, n = ctx.sampleRate * 5, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.08; d[i] = last; }
    // 이음매 없이 잇기
    const fade = Math.floor(ctx.sampleRate * 0.5);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = d[i] * k + d[n - fade + i] * (1 - k); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = (n - fade) / ctx.sampleRate;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain(); lfo.frequency.value = 0.07; lfoAmt.gain.value = 300;
    const swell = ctx.createGain(); swell.gain.value = 0.72;
    const lfo2 = ctx.createOscillator(), lfo2Amt = ctx.createGain(); lfo2.frequency.value = 0.043; lfo2Amt.gain.value = 0.28;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency);
    lfo2.connect(lfo2Amt); lfo2Amt.connect(swell.gain);
    src.connect(lp); lp.connect(swell); swell.connect(this.buses.wind);
    src.start(); lfo.start(); lfo2.start();
  }

  windChime() {
    if (this.ctx) {
      const t = this.ctx.currentTime, base = 1500 + Math.random() * 500;
      for (const [r, a, dec] of [[1, 0.05, 2.6], [2.42, 0.025, 1.4], [3.9, 0.012, 0.8]]) {
        this.tone(base * r, t, dec, a, this.buses.wind, this.reverb);
      }
    }
    this.chimeTimer = setTimeout(() => this.windChime(), 14000 + Math.random() * 26000);
  }

  tone(freq, t, decay, amp, out, send) {
    const { ctx } = this, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0002), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(out); if (send) g.connect(send);
    o.start(t); o.stop(t + decay + 0.05);
  }

  moktak(level = 1, t = null, out = null) {
    if (!this.ctx) return;
    const at = t ?? this.ctx.currentTime, bus = out || this.buses.perc;
    const { ctx } = this, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(760, at);
    o.frequency.exponentialRampToValueAtTime(420, at + 0.05);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5 * level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
    o.connect(g); g.connect(bus);
    o.start(at); o.stop(at + 0.2);
    this.tone(1520, at, 0.05, 0.1 * level, bus);
  }

  bead() { if (this.ctx) this.tone(1050 + Math.random() * 90, this.ctx.currentTime, 0.09, 0.09, this.buses.perc); }

  bell(level = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02, base = 96;
    const P = [[0.5, 0.42, 16], [1, 0.34, 13], [1.012, 0.2, 12], [1.19, 0.15, 10], [1.5, 0.12, 8], [2, 0.11, 6.5], [2.51, 0.07, 4.5], [3.01, 0.05, 3.2], [4.17, 0.03, 2]];
    for (const [r, a, d] of P) this.tone(base * r, t, d, a * level, this.buses.perc, this.percSend);
    this.tone(70, t, 0.25, 0.25 * level, this.buses.perc);
  }

  setChant(on) {
    this.chantOn = on;
    if (!this.ctx) return;
    this.ctx.resume();
    const t = this.ctx.currentTime;
    this.chantGate.gain.cancelScheduledValues(t);
    this.chantGate.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.5 : 0.35);
    if (on) { this.next = t + 0.6; this.sylIdx = 0; }
  }

  scheduleChant() {
    if (!this.chantOn || !this.ctx) return;
    const horizon = this.ctx.currentTime + 1.6;
    if (this.next < this.ctx.currentTime) this.next = this.ctx.currentTime + 0.1;
    while (this.next < horizon) {
      const s = SYLLABLES[this.sylIdx], dur = s.b * BEAT;
      this.sing(this.next, dur * (s.b > 1 ? 0.82 : 0.92), s);
      for (let i = 0; i < s.b; i++) this.moktak(0.32, this.next + i * BEAT, this.chantGate);
      this.next += dur;
      this.sylIdx = (this.sylIdx + 1) % SYLLABLES.length;
      if (this.sylIdx === 0) this.next += BEAT;
    }
  }

  sing(t, dur, s) {
    const { ctx } = this, f0 = ROOT * Math.pow(2, s.p / 12);
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0.0001, t);
    voice.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
    voice.gain.setValueAtTime(0.5, t + Math.max(0.1, dur - 0.16));
    voice.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    FORMANTS[s.v].forEach((f, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
      const g = ctx.createGain(); g.gain.value = [1.8, 0.8, 0.28][i];
      voice.connect(bp); bp.connect(g); g.connect(this.chantGate);
    });
    const low = ctx.createGain(); low.gain.value = 0.11; voice.connect(low); low.connect(this.chantGate);
    for (const [ratio, det, amp] of [[1, -5, 0.5], [1, 6, 0.5], [0.5, 0, 0.42]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f0 * ratio; o.detune.value = det; g.gain.value = amp;
      o.connect(g); g.connect(voice);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
}
