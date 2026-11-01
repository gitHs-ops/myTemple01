// 풍경·목탁·종은 실시간 합성, 염불은 tools/render_yeombul.py로 렌더링한 음원, 배경음은 실제 녹음(audio/CREDITS.txt)을 반복 재생한다.
const chantUrl = (id) => `audio/${id}.mp3?v=4`;
const CHANT_PAD = 0.25;   // 렌더러의 PAD와 같아야 한다
const CHANT_LOOP = 64;    // 렌더러의 LOOP와 같아야 한다
const AMB_LOOP = { wind: 58, stream: 60, rain: 57, forest: 47, night: 27 };   // tools/render_ambience.py의 고리 길이(초)
const AMB_LEVEL = { wind: 3, stream: 2, rain: 2, forest: 3, night: 3 };   // 소리 사이 크기 맞춤
const ambUrl = (id) => `audio/amb_${id}.mp3?v=2`;

export class Sound {
  constructor(vol) { this.vol = vol; this.ctx = null; this.chantOn = false; this.ambId = 'wind'; }

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
    this.setAmbient(this.ambId).catch((e) => this.onAmbError?.(e));
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

  // 배경음. id는 wind, stream, rain, forest, night, off. 처음 고를 때 받아 오고 서서히 바꾼다
  async setAmbient(id) {
    this.ambId = id;
    if (!this.ctx) return;
    this.ctx.resume();
    this.scenes ??= {}; this.ambLoads ??= {};
    const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.scenes)) if (k !== id) g.gain.setTargetAtTime(0, t, 0.5);
    this.waterGain?.gain.setTargetAtTime(this.gardenOn && id === 'wind' ? 1 : 0, t, 0.6);
    if (id === 'off') return;
    if (!this.scenes[id]) {
      this.ambLoads[id] ??= fetch(ambUrl(id))
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((b) => this.ctx.decodeAudioData(b))
        .catch((e) => { delete this.ambLoads[id]; throw e; });
      const buf = await this.ambLoads[id];
      if (!this.scenes[id]) {
        const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
        src.buffer = buf; src.loop = true;
        src.loopStart = CHANT_PAD; src.loopEnd = CHANT_PAD + AMB_LOOP[id];
        g.gain.value = 0;
        src.connect(g); g.connect(this.buses.wind);
        src.start(0, CHANT_PAD);
        this.scenes[id] = g;
      }
    }
    if (this.ambId === id) this.scenes[id].gain.setTargetAtTime(AMB_LEVEL[id], this.ctx.currentTime, 0.5);
  }

  windChime() {
    if (this.ctx && this.ambId === 'wind') {
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

  setGarden(on) {
    this.gardenOn = on;
    if (!this.ctx) return;
    if (!this.waterGain) this.startWater();
    this.waterGain.gain.setTargetAtTime(on && this.ambId === 'wind' ? 1 : 0, this.ctx.currentTime, 0.6);
  }

  startWater() {
    const { ctx } = this;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    this.waterGain.connect(this.buses.wind);
    const trickle = () => {
      if (this.gardenOn) {
        const t = ctx.currentTime, f = 480 + Math.random() * 900, o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g); g.connect(this.waterGain); o.start(t); o.stop(t + 0.1);
      }
      setTimeout(trickle, 70 + Math.random() * 620);
    };
    trickle();
    const bird = () => {
      const h = new Date().getHours();
      if (this.gardenOn && h >= 5 && h < 19) {
        const base = 2500 + Math.random() * 1300, count = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          const t = ctx.currentTime + i * (0.13 + Math.random() * 0.05), o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.14 + Math.random() * 0.18), t + 0.075);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.014, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
          o.connect(g); g.connect(this.waterGain); o.start(t); o.stop(t + 0.12);
        }
      }
      setTimeout(bird, 7000 + Math.random() * 19000);
    };
    setTimeout(bird, 3000);
  }

  stone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1900, t, 0.05, 0.13, this.buses.perc);
    this.tone(760, t, 0.08, 0.1, this.buses.perc);
  }

  plop() {
    if (!this.ctx) return;
    const { ctx } = this, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.13);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.buses.perc); o.start(t); o.stop(t + 0.22);
  }

  loadChant(id) {
    this.chantBufs ??= {};
    this.chantBufs[id] ??= fetch(chantUrl(id))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((b) => this.ctx.decodeAudioData(b))
      .catch((e) => { delete this.chantBufs[id]; throw e; });
    return this.chantBufs[id];
  }

  // id를 null로 주면 멈춘다. 곡을 바꾸면 앞 곡은 서서히 줄어든다
  async playChant(id) {
    const token = (this.chantToken = (this.chantToken || 0) + 1);
    this.chantId = id;
    this.chantOn = !!id;
    if (!this.ctx) return;
    this.ctx.resume();
    const fadeOut = this.chantSrc, fadeGain = this.chantSrcGain;
    this.chantSrc = null; this.chantSrcGain = null;
    if (fadeOut) {
      const t = this.ctx.currentTime;
      fadeGain.gain.cancelScheduledValues(t);
      fadeGain.gain.setTargetAtTime(0, t, 0.35);
      fadeOut.stop(t + 2);
    }
    if (!id) return;
    this.chantGate.gain.value = 1;
    const buf = await this.loadChant(id);
    if (token !== this.chantToken) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; src.loop = true;
    src.loopStart = CHANT_PAD; src.loopEnd = CHANT_PAD + CHANT_LOOP;
    g.gain.value = 0;
    src.connect(g); g.connect(this.chantGate);
    const now = this.ctx.currentTime;
    src.start(now, CHANT_PAD);
    g.gain.setTargetAtTime(1, now, 0.4);
    this.chantSrc = src; this.chantSrcGain = g;
  }
}
