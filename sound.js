// 바람·풍경·목탁·종은 실시간 합성, 염불은 tools/render_yeombul.py로 렌더링한 음원을 반복 재생한다.
const CHANT_URL = 'audio/yeombul.mp3?v=2';
const CHANT_PAD = 0.25;   // 렌더러의 PAD와 같아야 한다
const CHANT_LOOP = 64;    // 렌더러의 LOOP와 같아야 한다

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
    this.chantGate.connect(this.buses.chant);
    this.percSend = ctx.createGain(); this.percSend.gain.value = 0.5;
    this.percSend.connect(this.reverb);
    this.buses.perc.connect(this.percSend);
    this.applyVolumes();
    this.startWind();
    this.chimeTimer = setTimeout(() => this.windChime(), 9000);
    ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const curve = (v) => Math.pow(v / 100, 1.6);
    this.buses.wind.gain.setTargetAtTime(curve(this.vol.wind) * 0.6, t, 0.05);
    this.buses.chant.gain.setTargetAtTime(curve(this.vol.chant) * 1.3, t, 0.05);
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

  loadChant() {
    this.chantBuf ??= fetch(CHANT_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((b) => this.ctx.decodeAudioData(b))
      .catch((e) => { this.chantBuf = null; throw e; });
    return this.chantBuf;
  }

  async setChant(on) {
    this.chantOn = on;
    if (!this.ctx) return;
    this.ctx.resume();
    const t = this.ctx.currentTime;
    this.chantGate.gain.cancelScheduledValues(t);
    if (!on) {
      this.chantGate.gain.setTargetAtTime(0, t, 0.35);
      const src = this.chantSrc; this.chantSrc = null;
      src?.stop(t + 2);
      return;
    }
    const buf = await this.loadChant();
    if (!this.chantOn || this.chantSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.loopStart = CHANT_PAD; src.loopEnd = CHANT_PAD + CHANT_LOOP;
    src.connect(this.chantGate);
    const now = this.ctx.currentTime;
    src.start(now, CHANT_PAD);
    this.chantGate.gain.cancelScheduledValues(now);
    this.chantGate.gain.setTargetAtTime(1, now, 0.4);
    this.chantSrc = src;
  }
}
