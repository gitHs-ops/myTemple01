// 샤갈풍 스테인드글라스. 실제 작품을 옮긴 것이 아니라 그 색과 분위기를 따라 새로 그린 그림이다
// 짙은 한 색이 창 전체를 물들이고, 자유로운 납선 위로 사람과 짐승, 달과 별이 떠다닌다
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const PALETTES = [
  { name: 'blue', base: ['#0b2a8f', '#123ca8', '#0a1f6e', '#1a4fc4', '#08185a'], glow: ['#3f86e8', '#7fb6f2'], accent: ['#d62b3a', '#f2c230', '#2b9d63', '#e8e2c8'] },
  { name: 'violet', base: ['#1c1f8c', '#2c2aa6', '#141470', '#3a35c0', '#0e0e55'], glow: ['#6a6af0', '#a7a2f5'], accent: ['#e0475c', '#f4cf4a', '#35b5a0', '#f0e8d0'] },
  { name: 'green', base: ['#0c6b4a', '#13845a', '#08503a', '#1b9d68', '#063d2d'], glow: ['#46c98d', '#a4e8b8'], accent: ['#1a45b8', '#f2c230', '#d62b3a', '#eef0d0'] },
  { name: 'ruby', base: ['#a3122a', '#c11c33', '#7e0c20', '#d92f3f', '#5e0818'], glow: ['#ef6a6a', '#f9b08e'], accent: ['#1a45b8', '#f4cf4a', '#2b9d63', '#f4e8d0'] },
  { name: 'gold', base: ['#c98a0c', '#e0a312', '#a66d08', '#efbb2a', '#845306'], glow: ['#f8d966', '#fdeeb0'], accent: ['#1a45b8', '#c11c33', '#1b8a5c', '#ffffff'] },
  { name: 'azure', base: ['#0d58b8', '#1270d0', '#0a4596', '#2c8ae0', '#07336f'], glow: ['#6db8f2', '#bfe2fa'], accent: ['#e0475c', '#f4cf4a', '#2fa36f', '#f6efd6'] },
];

// 쓱쓱 그린 듯한 선
function stroke(g, pts, color, w) {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]); g.stroke();
}
function blob(g, pts, fill) {
  g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath(); g.fill();
}
const INK = 'rgba(8,8,26,.92)';

/* 떠다니는 것들: 모두 머리에서 내려 그은 소박한 그림이다 */
const MOTIFS = {
  angel(g, pal) {
    blob(g, [[-8, -36], [10, -38], [30, -10], [44, 34], [8, 46], [-34, 44], [-24, 2]], pal.glow[1]);
    // 날개
    blob(g, [[-16, -14], [-58, -44], [-72, -10], [-36, 12]], pal.accent[3]);
    blob(g, [[16, -14], [62, -36], [70, 4], [28, 12]], pal.accent[3]);
    g.fillStyle = '#f7ead2'; g.beginPath(); g.ellipse(0, -48, 14, 17, 0.25, 0, 6.3); g.fill();
    g.fillStyle = pal.accent[1]; g.globalAlpha = 0.85; g.beginPath(); g.arc(0, -54, 22, 3.3, 6.1); g.lineTo(0, -52); g.fill(); g.globalAlpha = 1;
    stroke(g, [[-8, -36], [10, -38], [30, -10], [44, 34]], INK, 3);
    stroke(g, [[-8, -36], [-24, 2], [-34, 44]], INK, 3);
    stroke(g, [[-58, -44], [-72, -10], [-36, 12]], INK, 2.5);
    stroke(g, [[62, -36], [70, 4], [28, 12]], INK, 2.5);
    stroke(g, [[-5, -52], [-2, -50]], INK, 2); stroke(g, [[5, -52], [8, -50]], INK, 2);
    stroke(g, [[0, 0], [8, 22], [2, 44]], INK, 1.8); stroke(g, [[-14, 6], [-16, 26], [-18, 42]], INK, 1.8);
  },
  couple(g, pal) {
    blob(g, [[-30, -20], [-6, -26], [4, 18], [-10, 54], [-46, 46]], pal.accent[0]);
    blob(g, [[6, -22], [30, -28], [46, 40], [14, 56], [0, 18]], pal.glow[1]);
    g.fillStyle = '#f7ead2';
    g.beginPath(); g.ellipse(-14, -36, 12, 15, -0.3, 0, 6.3); g.fill();
    g.beginPath(); g.ellipse(14, -40, 12, 15, 0.3, 0, 6.3); g.fill();
    stroke(g, [[-30, -20], [-46, 46], [-10, 54]], INK, 3);
    stroke(g, [[30, -28], [46, 40], [14, 56]], INK, 3);
    stroke(g, [[-14, -50], [-2, -58], [14, -55]], INK, 2.5);
    stroke(g, [[-8, -6], [6, 2], [18, -4]], INK, 2.5);
  },
  bird(g, pal) {
    blob(g, [[-38, 6], [-8, -14], [32, -8], [52, -18], [38, 12], [-4, 22]], pal.accent[3]);
    blob(g, [[-6, -6], [8, -48], [26, -44], [18, -6]], pal.glow[1]);
    stroke(g, [[-38, 6], [-8, -14], [32, -8], [52, -18]], INK, 3);
    stroke(g, [[52, -18], [38, 12], [-4, 22], [-38, 6]], INK, 3);
    stroke(g, [[-6, -6], [8, -48], [26, -44], [18, -6]], INK, 2.5);
    g.fillStyle = INK; g.beginPath(); g.arc(-22, 2, 2.4, 0, 6.3); g.fill();
    stroke(g, [[-38, 6], [-48, 10]], pal.accent[1], 3);
  },
  fish(g, pal) {
    blob(g, [[-50, 0], [-14, -22], [26, -14], [50, -24], [44, 2], [50, 26], [24, 14], [-14, 22]], pal.accent[1]);
    stroke(g, [[-50, 0], [-14, -22], [26, -14], [50, -24]], INK, 3);
    stroke(g, [[50, 26], [24, 14], [-14, 22], [-50, 0]], INK, 3);
    stroke(g, [[-20, -14], [-12, 0], [-20, 14]], INK, 2);
    for (let i = 0; i < 4; i++) stroke(g, [[-4 + i * 9, -8], [2 + i * 9, 0], [-4 + i * 9, 8]], INK, 1.6);
    g.fillStyle = INK; g.beginPath(); g.arc(-34, -3, 2.5, 0, 6.3); g.fill();
  },
  goat(g, pal) {
    blob(g, [[-44, -8], [-6, -18], [36, -14], [46, 14], [14, 24], [-30, 22]], pal.glow[1]);
    g.fillStyle = pal.glow[1]; g.beginPath(); g.ellipse(-48, -22, 15, 12, -0.4, 0, 6.3); g.fill();
    stroke(g, [[-44, -8], [-6, -18], [36, -14], [46, 14]], INK, 3);
    stroke(g, [[46, 14], [14, 24], [-30, 22], [-44, -8]], INK, 3);
    [[-30, 22], [-14, 24], [20, 22], [36, 18]].forEach(([x, y]) => stroke(g, [[x, y], [x + 2, y + 24]], INK, 3));
    stroke(g, [[-54, -32], [-62, -50], [-72, -54]], INK, 2.6); stroke(g, [[-44, -32], [-46, -52], [-56, -60]], INK, 2.6);
    stroke(g, [[-58, -14], [-64, -6], [-58, 0]], INK, 2);
    g.fillStyle = INK; g.beginPath(); g.arc(-52, -24, 2.2, 0, 6.3); g.fill();
    stroke(g, [[46, -4], [58, -16]], INK, 3);
  },
  moon(g, pal) {
    g.fillStyle = pal.accent[3]; g.beginPath(); g.arc(0, 0, 40, 0.9, 5.4); g.quadraticCurveTo(18, 0, 25, 31); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    stroke(g, [[-20, -10], [-12, -6]], INK, 2); stroke(g, [[-24, 14], [-12, 18]], INK, 2);
  },
  sun(g, pal) {
    g.fillStyle = pal.accent[1]; g.beginPath(); g.arc(0, 0, 32, 0, 6.3); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.28;
      stroke(g, [[Math.cos(a) * 38, Math.sin(a) * 38], [Math.cos(a + 0.1) * 54, Math.sin(a + 0.1) * 54]], pal.accent[1], 4);
    }
  },
  candle(g, pal) {
    // 일곱 갈래 촛대
    stroke(g, [[0, 54], [0, -34]], INK, 5);
    stroke(g, [[-22, 54], [22, 54]], INK, 6);
    for (const k of [1, 2, 3]) {
      [-1, 1].forEach((s) => stroke(g, [[0, 26 - k * 3], [s * k * 15, 24], [s * k * 15, -32]], INK, 4));
    }
    [-45, -30, -15, 0, 15, 30, 45].forEach((x) => {
      g.fillStyle = pal.accent[1]; g.beginPath(); g.ellipse(x, -44, 5, 11, 0, 0, 6.3); g.fill();
    });
  },
  tree(g, pal) {
    stroke(g, [[0, 66], [-3, 20], [2, -18]], INK, 6);
    stroke(g, [[-2, 20], [-30, -4]], INK, 4); stroke(g, [[1, 8], [32, -14]], INK, 4);
    [[0, -44, 40], [-36, -20, 26], [36, -28, 28]].forEach(([x, y, r]) => {
      g.fillStyle = pal.accent[2]; g.globalAlpha = 0.85; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
    });
    for (let i = 0; i < 12; i++) {
      const a = (i * 2.4), r = 8 + i * 3;
      g.fillStyle = pal.accent[0]; g.beginPath(); g.arc(Math.cos(a) * r, -36 + Math.sin(a) * r * 0.7, 3.4, 0, 6.3); g.fill();
    }
  },
  ladder(g, pal) {
    stroke(g, [[-16, 76], [-8, -76]], INK, 4); stroke(g, [[16, 76], [22, -76]], INK, 4);
    for (let i = 0; i < 9; i++) {
      const y = 62 - i * 16, k = i / 9;
      stroke(g, [[-15 + k * 7, y], [15 + k * 7, y]], pal.accent[3], 3.2);
    }
  },
  star(g, pal) {
    g.fillStyle = pal.accent[1]; g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.283, r = i % 2 ? 7 : 18;
      if (i) g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); else g.moveTo(0, -r);
    }
    g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
  },
};

// 한 색을 바탕으로 크기가 제각각인 유리 조각을 깔고 납선을 긋는다
function glassField(g, w, h, r, pal, cols, rows) {
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || i === cols || j === 0 || j === rows;
      row.push([(i / cols) * w + (edge ? 0 : (r() - 0.5) * (w / cols) * 0.9), (j / rows) * h + (edge ? 0 : (r() - 0.5) * (h / rows) * 0.9)]);
    }
    pts.push(row);
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
      const q = r();
      g.fillStyle = q < 0.82 ? pal.base[Math.floor(r() * pal.base.length)] : q < 0.93 ? pal.glow[Math.floor(r() * 2)] : pal.accent[Math.floor(r() * 3)];
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
      // 유리에 붓으로 그은 어두운 빗금
      g.save(); g.clip();
      g.globalAlpha = 0.16 + r() * 0.2; g.strokeStyle = '#04041c'; g.lineWidth = 1.4;
      const dir = r() * 3.14, n = 3 + Math.floor(r() * 8), cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
      for (let k = 0; k < n; k++) {
        const ox = (r() - 0.5) * (w / cols), oy = (r() - 0.5) * (h / rows), L = 10 + r() * 22;
        g.beginPath(); g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox + Math.cos(dir) * L, cy + oy + Math.sin(dir) * L); g.stroke();
      }
      g.restore();
    }
  }
  return pts;
}
function leadLines(g, pts, alpha = 0.95) {
  g.strokeStyle = `rgba(6,6,20,${alpha})`; g.lineWidth = 3; g.lineJoin = 'round';
  const rows = pts.length - 1, cols = pts[0].length - 1;
  for (let j = 0; j <= rows; j++) { g.beginPath(); pts[j].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  for (let i = 0; i <= cols; i++) { g.beginPath(); pts.forEach((row, j) => (j ? g.lineTo(row[i][0], row[i][1]) : g.moveTo(row[i][0], row[i][1]))); g.stroke(); }
}
// 빛이 번지는 자리
function bloom(g, x, y, R, color) {
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); g.globalCompositeOperation = 'source-over';
}
function place(g, name, pal, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  MOTIFS[name](g, pal);
  g.restore();
}

const SETS = [
  ['angel', 'moon', 'fish', 'star'], ['couple', 'bird', 'sun', 'star'], ['tree', 'goat', 'moon', 'star'],
  ['ladder', 'angel', 'star', 'bird'], ['candle', 'bird', 'moon', 'fish'], ['goat', 'couple', 'sun', 'star'],
];

export function lancetPainter(seed) {
  return (g, w, h) => {
    const r = seeded(seed), pal = PALETTES[seed % PALETTES.length], set = SETS[(seed * 5 + 1) % SETS.length];
    const outline = () => {
      g.beginPath(); g.moveTo(8, h - 6); g.lineTo(8, h * 0.3);
      g.quadraticCurveTo(14, h * 0.1, w / 2, 8); g.quadraticCurveTo(w - 14, h * 0.1, w - 8, h * 0.3);
      g.lineTo(w - 8, h - 6); g.closePath();
    };
    g.save(); outline(); g.clip();
    const pts = glassField(g, w, h, r, pal, 7, 17);
    bloom(g, w * (0.3 + r() * 0.4), h * (0.25 + r() * 0.2), w * 0.75, pal.glow[1] + '66');
    leadLines(g, pts);
    // 큰 그림 하나와 작은 그림들이 아래위로 떠 있다
    const ys = [0.42, 0.18, 0.68, 0.86];
    set.forEach((name, i) => {
      const big = i === 0, y = h * ys[i];
      const x = w * (big ? 0.5 + (r() - 0.5) * 0.14 : 0.25 + r() * 0.5);
      const s = (w / 320) * (big ? 1.75 : name === 'star' ? 1.2 : 1) * (0.9 + r() * 0.2);
      place(g, name, pal, x, y, s, (r() - 0.5) * (big ? 0.5 : 1.1));
    });
    g.restore();
    g.strokeStyle = '#17141c'; g.lineWidth = 12; outline(); g.stroke();
  };
}

export function rosePainter(seed = 9) {
  return (g, w) => {
    const c = w / 2, R = c - 8, r = seeded(seed), pal = PALETTES[0];
    g.save(); g.beginPath(); g.arc(c, c, R, 0, 6.3); g.clip();
    const pts = glassField(g, w, w, r, pal, 16, 16);
    bloom(g, c, c, R * 0.85, '#6fa4ff55');
    leadLines(g, pts);
    g.translate(c, c);
    // 바퀴처럼 도는 납선과 둘레의 색 조각
    g.strokeStyle = 'rgba(6,6,20,.95)'; g.lineWidth = 6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); g.quadraticCurveTo(Math.cos(a + 0.3) * R * 0.7, Math.sin(a + 0.3) * R * 0.7, Math.cos(a + 0.2) * R, Math.sin(a + 0.2) * R); g.stroke();
      place(g, 'star', pal, Math.cos(a + 0.26) * R * 0.76, Math.sin(a + 0.26) * R * 0.76, 1.1 + r() * 0.5, r() * 2);
    }
    g.globalAlpha = 0.9; g.fillStyle = '#f2c230'; g.beginPath(); g.arc(0, 0, R * 0.3, 0, 6.3); g.fill(); g.globalAlpha = 1;
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, R * 0.3, 0, 6.3); g.stroke();
    place(g, 'bird', { ...pal, accent: ['#d62b3a', '#d62b3a', '#2b9d63', '#ffffff'], glow: ['#ffffff', '#ffffff'] }, 0, 0, 1.9 * (w / 512), -0.25);
    g.restore();
    g.strokeStyle = '#17121c'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, R, 0, 6.3); g.stroke();
  };
}

// 바닥에 비치는 빛
export function washPainter(g, w, h) {
  const r = seeded(2), P = ['#123ca8', '#1a4fc4', '#2c8ae0', '#3f86e8', '#d62b3a', '#f2c230', '#0c6b4a'];
  for (let y = 0; y < h; y += 16) {
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = P[r() < 0.74 ? Math.floor(r() * 4) : 4 + Math.floor(r() * 3)];
      g.fillRect(x, y, 16, 16);
    }
  }
}
