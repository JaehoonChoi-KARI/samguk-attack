import { stageLength } from './data.js';

// Map data: places on the China campaign map and the battle road layouts.

// ---- Campaign map (1200 × 800 map units) -----------------------------------------

export const PLACES = {
  zhuo: { name: '탁군', x: 835, y: 175 },
  liaodong: { name: '요동', x: 1060, y: 110 },
  bailang: { name: '백랑산', x: 930, y: 98 },
  guangzong: { name: '광종', x: 848, y: 232 },
  ye: { name: '업', x: 798, y: 262 },
  beihai: { name: '북해', x: 990, y: 262 },
  baima: { name: '백마', x: 838, y: 292 },
  puyang: { name: '복양', x: 880, y: 306 },
  guandu: { name: '관도', x: 808, y: 322 },
  chenliu: { name: '진류', x: 848, y: 346 },
  luoyang: { name: '낙양', x: 676, y: 322 },
  hulao: { name: '호뢰관', x: 706, y: 322 },
  sishui: { name: '사수관', x: 752, y: 294 },
  xingyang: { name: '형양', x: 760, y: 340 },
  changan: { name: '장안', x: 545, y: 335 },
  tongguan: { name: '동관', x: 610, y: 330 },
  tianshui: { name: '천수', x: 420, y: 330 },
  qishan: { name: '기산', x: 448, y: 380 },
  wuzhang: { name: '오장원', x: 505, y: 362 },
  yingchuan: { name: '영천', x: 742, y: 382 },
  xuchang: { name: '허창', x: 792, y: 388 },
  xiaopei: { name: '소패', x: 905, y: 345 },
  xuzhou: { name: '서주', x: 948, y: 366 },
  xiapi: { name: '하비', x: 982, y: 392 },
  wancheng: { name: '완성', x: 698, y: 432 },
  bowang: { name: '박망파', x: 728, y: 458 },
  xinye: { name: '신야', x: 700, y: 478 },
  fancheng: { name: '번성', x: 726, y: 496 },
  xiangyang: { name: '양양', x: 692, y: 514 },
  changban: { name: '장판파', x: 708, y: 546 },
  jiangling: { name: '강릉', x: 672, y: 578 },
  maicheng: { name: '맥성', x: 636, y: 552 },
  yiling: { name: '이릉', x: 600, y: 566 },
  chibi: { name: '적벽', x: 762, y: 594 },
  jiangxia: { name: '강하', x: 796, y: 562 },
  changsha: { name: '장사', x: 745, y: 658 },
  chaisang: { name: '시상', x: 862, y: 590 },
  hefei: { name: '합비', x: 905, y: 472 },
  ruxu: { name: '유수구', x: 948, y: 506 },
  shiting: { name: '석정', x: 866, y: 524 },
  jianye: { name: '건업', x: 1000, y: 524 },
  qua: { name: '곡아', x: 1032, y: 552 },
  wujun: { name: '오군', x: 1062, y: 578 },
  kuaiji: { name: '회계', x: 1050, y: 628 },
  hanzhong: { name: '한중', x: 522, y: 430 },
  yangping: { name: '양평관', x: 488, y: 442 },
  dingjun: { name: '정군산', x: 466, y: 462 },
  jiameng: { name: '가맹관', x: 470, y: 502 },
  luocheng: { name: '낙성', x: 432, y: 560 },
  chengdu: { name: '성도', x: 400, y: 588 },
  nanman: { name: '남만', x: 380, y: 722 },
};

// Faint province labels drawn on the campaign map.
export const PROVINCES = [
  ['유주', 905, 150], ['기주', 820, 210], ['청주', 1000, 300], ['연주', 900, 330], ['서주', 985, 420],
  ['사례', 640, 290], ['예주', 800, 430], ['옹주', 480, 290], ['양주', 330, 230], ['익주', 380, 520],
  ['형주', 680, 620], ['양주', 960, 600], ['교주', 640, 760],
];

// Land outline, rivers and mountains for the campaign map.
export const LAND = [
  [-600, -400], [1180, -400], [1150, 95], [1135, 150], [1080, 175],
  [1040, 200], [1005, 215], [1050, 245], [1090, 275], [1060, 300], [1015, 320], [1010, 360],
  [1050, 410], [1070, 470], [1095, 520], [1110, 580], [1085, 640], [1040, 690], [960, 730],
  [880, 760], [780, 790], [600, 800], [440, 800], [300, 820], [100, 1000], [-600, 1300],
];
export const RIVERS = [
  { name: '황하', pts: [[330, 300], [420, 280], [480, 200], [540, 130], [620, 130], [650, 200], [640, 300], [700, 300], [780, 292], [860, 268], [930, 240], [1000, 222], [1030, 218]] },
  { name: '장강', pts: [[300, 610], [380, 620], [470, 600], [560, 578], [620, 566], [680, 590], [740, 600], [800, 576], [860, 572], [920, 548], [980, 532], [1040, 540], [1100, 548]] },
  { name: '한수', pts: [[470, 440], [540, 438], [620, 450], [690, 495], [730, 530], [780, 562]] },
];
export const MOUNTAINS = [
  [330, 380], [360, 440], [300, 480], [560, 400], [600, 420], [430, 420], [520, 500], [540, 640], [460, 680],
  [600, 690], [380, 260], [330, 170], [430, 130], [700, 200], [620, 470], [880, 660], [960, 680],
];

// ---- Battle layouts (1200 × 840 world units) ------------------------------------

// ---- battle maps -------------------------------------------------------------------
// A stage is a long field: our camp on the left, the enemy castle on the right, a winding
// road between them (and on some stages a side road that splits off and joins again).
// The lord walks anywhere on the field; the road is where the enemy camps stand.

export const WORLD_H = 900;
export const CASTLE_DEPTH = 220; // from the gate to the right edge of the field

// Seeded random numbers (mulberry32 on a string hash) so a stage always looks the same.
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rounds the corners of a polyline (Chaikin) so roads look smooth.
function smooth(pts, rounds = 3) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      if (i < p.length - 2) out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export function makePath(pts) {
  const p = smooth(pts).map(([x, y]) => ({ x, y }));
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  return { pts: p, cum, len: cum[cum.length - 1] };
}

// Position and heading at distance d along a path.
export function pathAt(path, d) {
  const { pts, cum } = path;
  if (d <= 0) return { x: pts[0].x, y: pts[0].y, ang: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
  if (d >= path.len) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Closest point on a path to (x, y): { x, y, d (distance along path), dist (to the point) }.
export function nearestOnPath(path, x, y) {
  let best = null;
  const { pts, cum } = path;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
    const px = a.x + vx * t, py = a.y + vy * t;
    const dist = Math.hypot(x - px, y - py);
    if (!best || dist < best.dist) best = { x: px, y: py, d: cum[i] + t * Math.sqrt(l2), dist };
  }
  return best;
}

export function nearestOnPaths(paths, x, y) {
  let best = null;
  paths.forEach((p, i) => {
    const r = nearestOnPath(p, x, y);
    if (!best || r.dist < best.dist) best = { ...r, path: i };
  });
  return best;
}

const layoutCache = new Map();

// Battle map for stage n (1..20): { w, h, paths, main, camp, gate, wallX }.
export function stageLayout(n, stage = null) {
  const id = stage?.id || `n${n}`;
  if (layoutCache.has(id)) return layoutCache.get(id);
  const r = rng(`${id}:layout`);
  const w = stageLength(n);
  const h = WORLD_H;
  const gateX = w - CASTLE_DEPTH;
  const mid = h / 2;
  // main road: a control point every ~420 units, swinging up and down
  const pts = [[-40, mid + (r() - 0.5) * 120]];
  const steps = Math.round((gateX - 200) / 420);
  for (let i = 1; i <= steps; i++) {
    const x = 120 + (gateX - 320) * (i / steps);
    const swing = (i % 2 ? 1 : -1) * (90 + r() * 140);
    pts.push([x, Math.max(170, Math.min(h - 170, mid + swing))]);
  }
  pts.push([gateX - 80, mid], [gateX + 40, mid]);
  const main = makePath(pts);
  const paths = [main];
  // a side road on every third stage: it leaves the main road and joins it again
  if (n % 3 === 0) {
    const a = 0.25 + r() * 0.1, b = a + 0.3;
    const pa = pathAt(main, main.len * a), pb = pathAt(main, main.len * b);
    const side = pa.y < mid ? 1 : -1;
    const off = 230 + r() * 60;
    const yy = y => Math.max(90, Math.min(h - 90, y));
    paths.push(makePath([
      [pa.x, pa.y], [pa.x + 120, yy(pa.y + side * off * 0.7)], [(pa.x + pb.x) / 2, yy(mid + side * off)],
      [pb.x - 120, yy(pb.y + side * off * 0.7)], [pb.x, pb.y],
    ]));
  }
  const start = pathAt(main, 80);
  const layout = {
    w, h, paths, main,
    camp: { x: 110, y: start.y }, // where the lord starts
    gate: { x: gateX, y: mid },
    wallX: gateX + 18, // nothing of ours passes this while the gate stands
  };
  layoutCache.set(id, layout);
  return layout;
}
