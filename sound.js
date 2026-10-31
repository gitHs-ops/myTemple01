// 바람·풍경·목탁·종은 실시간 합성, 염불은 tools/render_yeombul.py로 렌더링한 음원을 반복 재생한다.
const chantUrl = (id) => `audio/${id}.mp3?v=3`;
const CHANT_PAD = 0.25;   // 렌더러의 PAD와 같아야 한다
const CHANT_LOOP = 64;    // 렌더러의 LOOP와 같아야 한다
const AMB_LEVEL = { wind: 1, stream: 10, rain: 5.6, forest: 8, night: 10 };   // 장면 사이 크기 맞춤

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
    this.setAmbient(this.ambId);
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

  // 배경음. id는 wind, stream, rain, forest, night, off. 장면은 처음 고를 때 만들고 서서히 바꾼다
  setAmbient(id) {
    this.ambId = id;
    if (!this.ctx) return;
    this.ctx.resume();
    this.scenes ??= {};
    if (id !== 'off' && !this.scenes[id]) {
      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.buses.wind);
      this.scenes[id] = g;
      ({ wind: () => this.startWind(g), stream: () => this.startStream(g), rain: () => this.startRain(g), forest: () => this.startForest(g), night: () => this.startNight(g) })[id]();
    }
    const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.scenes)) g.gain.setTargetAtTime(k === id ? AMB_LEVEL[k] : 0, t, 0.5);
    this.waterGain?.gain.setTargetAtTime(this.gardenOn && id !== 'off' ? 1 : 0, t, 0.6);
  }

  // 걸러낸 잡음 한 겹. 필터를 돌려주어 LFO를 걸 수 있게 한다
  noiseLayer(out, type, freq, q, level) {
    const { ctx } = this;
    if (!this.noiseBuf) {
      const n = ctx.sampleRate * 4;
      this.noiseBuf = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = this.noiseBuf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level;
    src.connect(f); f.connect(g); g.connect(out);
    src.start(0, Math.random() * 4);
    return f;
  }

  lfo(param, rate, depth) {
    const o = this.ctx.createOscillator(), a = this.ctx.createGain();
    o.frequency.value = rate; a.gain.value = depth;
    o.connect(a); a.connect(param); o.start();
  }

  // 왼쪽·오른쪽에 놓은 짧은 음 하나
  blip(out, t, f0, f1, dur, amp, pan) {
    const { ctx } = this, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  startStream(out) {
    this.lfo(this.noiseLayer(out, 'bandpass', 520, 0.6, 0.075).frequency, 0.13, 140);
    this.lfo(this.noiseLayer(out, 'bandpass', 1500, 0.7, 0.045).frequency, 0.29, 420);
    this.noiseLayer(out, 'highpass', 3600, 0.4, 0.008);
    const tick = () => {
      if (this.ambId === 'stream') {
        const f = 420 + Math.random() * 900;
        this.blip(out, this.ctx.currentTime + 0.01, f, f * 1.45, 0.08, 0.016 + Math.random() * 0.012, Math.random() * 1.4 - 0.7);
      }
      setTimeout(tick, 60 + Math.random() * 380);
    };
    tick();
  }

  startRain(out) {
    this.noiseLayer(out, 'bandpass', 4200, 0.35, 0.055);
    this.lfo(this.noiseLayer(out, 'bandpass', 1100, 0.5, 0.05).frequency, 0.07, 260);
    this.noiseLayer(out, 'lowpass', 260, 0.3, 0.09);
    const tick = () => {
      if (this.ambId === 'rain') {
        const f = 1800 + Math.random() * 2600;
        this.blip(out, this.ctx.currentTime + 0.01, f, f * 0.7, 0.025, 0.012 + Math.random() * 0.018, Math.random() * 1.8 - 0.9);
      }
      setTimeout(tick, 40 + Math.random() * 170);
    };
    tick();
  }

  startForest(out) {
    this.lfo(this.noiseLayer(out, 'lowpass', 420, 0.3, 0.1).frequency, 0.06, 150);
    const SONG = [[2600, 1.2, 0.09, 0.15, 3], [3400, 0.82, 0.14, 0.21, 2], [1900, 1.06, 0.2, 0.34, 2]];
    const tick = () => {
      if (this.ambId === 'forest') {
        const [base, bend, dur, gap, reps] = SONG[Math.floor(Math.random() * SONG.length)];
        const f = base * (0.92 + Math.random() * 0.16), pan = Math.random() * 1.6 - 0.8, t = this.ctx.currentTime + 0.02;
        const count = reps + Math.floor(Math.random() * 3), amp = 0.012 + Math.random() * 0.012;
        for (let i = 0; i < count; i++) {
          this.blip(out, t + i * gap, f, f * bend, dur, amp, pan);
          this.blip(this.reverb, t + i * gap, f, f * bend, dur, amp * 3, pan);
        }
      }
      setTimeout(tick, 1800 + Math.random() * 5200);
    };
    setTimeout(tick, 600);
  }

  startNight(out) {
    this.lfo(this.noiseLayer(out, 'lowpass', 300, 0.3, 0.07).frequency, 0.05, 90);
    // 풀벌레 세 마리: 음높이, 울음 간격, 위치를 달리한다
    for (const [f, period, pan, amp] of [[4300, 0.62, -0.6, 0.0085], [4750, 0.87, 0.55, 0.0065], [3900, 1.19, 0.05, 0.005]]) {
      const tick = () => {
        if (this.ambId === 'night') {
          const t = this.ctx.currentTime + 0.02;
          for (let i = 0; i < 3; i++) this.blip(out, t + i * 0.05, f, f * 1.01, 0.035, amp, pan);
        }
        setTimeout(tick, period * 1000 * (0.94 + Math.random() * 0.12));
      };
      setTimeout(tick, Math.random() * 900);
    }
  }

  startWind(out) {
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
    src.connect(lp); lp.connect(swell); swell.connect(out);
    src.start(); lfo.start(); lfo2.start();
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
    this.waterGain.gain.setTargetAtTime(on && this.ambId !== 'off' ? 1 : 0, this.ctx.currentTime, 0.6);
  }

  startWater() {
    const { ctx } = this, n = ctx.sampleRate * 4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.55;
    const lfo = ctx.createOscillator(), amt = ctx.createGain(); lfo.frequency.value = 0.31; amt.gain.value = 500;
    lfo.connect(amt); amt.connect(bp.frequency); lfo.start();
    const lvl = ctx.createGain(); lvl.gain.value = 0.055;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    src.connect(bp); bp.connect(lvl); lvl.connect(this.waterGain); this.waterGain.connect(this.buses.wind);
    src.start();
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
