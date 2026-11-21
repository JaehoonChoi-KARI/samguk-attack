// Draws a battle: a camera that follows the lord over a long field (terrain cached once),
// then camps, the castle, units, shots and effects every frame, and a small map of the
// whole field at the top.

import { TROOPS, FACTIONS, LORDS, SKILLS, ITEMS, RALLY_AGGRO, GENERALS } from './data.js';
import { pathAt, nearestOnPath, rng } from './maps.js';
import { drawSquad, drawLord, drawGate, drawGeneral, shadow } from './sprites.js';
import { uiScale } from './device.js';

const TERRAIN = {
  plain: { base: '#86ad5c', patch: ['#7aa352', '#93b866', '#a3c16f'], road: '#c9a96e', edge: '#9c7f4c', deco: 'plain' },
  forest: { base: '#5f8f45', patch: ['#557f3c', '#6b9a4f', '#4c7536'], road: '#b8995f', edge: '#7f6538', deco: 'forest' },
  mountain: { base: '#a79a74', patch: ['#968a66', '#b5a882', '#8c8060'], road: '#d2bb8a', edge: '#8c7650', deco: 'mountain' },
  river: { base: '#82ab60', patch: ['#76a055', '#90b86c', '#a0c47a'], road: '#c9a96e', edge: '#9c7f4c', deco: 'river' },
  castle: { base: '#a8a08a', patch: ['#9b937c', '#b3ab95', '#8f876f'], road: '#d8ccb0', edge: '#8a7f66', deco: 'castle' },
  snow: { base: '#e6edf2', patch: ['#d8e2ea', '#f2f6f9', '#cfdbe4'], road: '#b9b0a0', edge: '#8c8476', deco: 'snow' },
  desert: { base: '#d8b878', patch: ['#cdaa68', '#e2c48a', '#c49f5e'], road: '#b8935a', edge: '#8c6c3a', deco: 'desert' },
};

const faction = key => FACTIONS[key] || FACTIONS.yellow;
const VIEW_H = 640; // world units shown from top to bottom on a tall screen
const MAX_CACHE_PX = 12e6; // terrain cache size limit (iPad memory)

const SKILL_SAY = {
  lb_heal: { text: '인덕의 손길! 체력 회복', color: '#7dff9a' },
  lb_oath: { text: '도원결의! 장수가 힘을 내요', color: '#ffb0c8' },
  lb_blade: { text: '형제의 칼날! 근접 공격 UP', color: '#ffe08a' },
  cc_roar: { text: '패왕의 호령! 공격 UP', color: '#ffb0a0' },
  cc_tiger: { text: '호표기 출격!', color: '#ffd54f' },
  cc_haste: { text: '질풍 행군! 빠르게', color: '#bfe6ff' },
  sq_volley: { text: '궁노 일제 사격!', color: '#d8f0ff' },
  sq_fire: { text: '화공!', color: '#ffb070' },
  sq_tiger: { text: '강동의 호랑이! 공격 UP', color: '#ffcf70' },
};

export class BattleView {
  constructor(sim) {
    this.sim = sim;
    this.stage = sim.setup.stage;
    this.layout = sim.layout;
    this.terrain = TERRAIN[this.stage.terrain] || TERRAIN.plain;
    this.lordKey = sim.setup.lordKey;
    this.us = faction(LORDS[this.lordKey].faction);
    this.them = faction(this.stage.enemy);
    this.headband = this.stage.enemy === 'yellow' ? '#f2d21b' : null;
    this.fx = [];
    this.texts = [];
    this.corpses = [];
    this.banner = null;
    this.shake = 0;
    this.flash = 0;
    this.cache = null;
    this.cacheK = 0;
    this.t = 0;
    this.cam = { x: sim.lord.x, y: sim.lord.y, s: 1 };
    this.insetB = 0; // screen px covered by the bottom HUD
  }

  // ---- camera ------------------------------------------------------------------------

  fit(view) {
    const s = Math.max(0.55, Math.min(1.6, view.h / VIEW_H));
    this.cam.s = s;
    this.vw = view.w / s;
    this.vh = view.h / s;
  }

  follow(dt, snap = false) {
    const L = this.sim.lord;
    const tx = L.x + L.face * this.vw * 0.12;
    const ty = L.y + this.insetB / this.cam.s * 0.35;
    const k = snap ? 1 : Math.min(1, dt * 4);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    const W = this.layout.w, H = this.layout.h;
    this.cam.x = this.vw >= W ? W / 2 : Math.max(this.vw / 2, Math.min(W - this.vw / 2, this.cam.x));
    this.cam.y = this.vh >= H ? H / 2 : Math.max(this.vh / 2, Math.min(H - this.vh / 2, this.cam.y));
  }

  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.s + this.vw * this.cam.s / 2, y: (y - this.cam.y) * this.cam.s + this.vh * this.cam.s / 2 };
  }

  // ---- terrain (cached once for the whole field) ---------------------------------------

  buildCache(view) {
    const W = this.layout.w, H = this.layout.h;
    const k = Math.min(this.cam.s * view.dpr, Math.sqrt(MAX_CACHE_PX / (W * H)));
    if (this.cache && Math.abs(k - this.cacheK) < 0.05) return;
    this.cacheK = k;
    const c = this.cache || document.createElement('canvas');
    c.width = Math.ceil(W * k);
    c.height = Math.ceil(H * k);
    this.cache = c;
    const ctx = c.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.paintTerrain(ctx);
  }

  paintTerrain(ctx) {
    const T = this.terrain;
    const L = this.layout;
    const r = rng(this.stage.id + ':terrain');
    ctx.fillStyle = T.base;
    ctx.fillRect(0, 0, L.w, L.h);
    const area = L.w * L.h / (1200 * 840);
    for (let i = 0; i < 260 * area; i++) {
      ctx.beginPath();
      ctx.ellipse(r() * L.w, r() * L.h, 30 + r() * 90, 14 + r() * 40, r() * 3, 0, Math.PI * 2);
      ctx.fillStyle = T.patch[i % T.patch.length];
      ctx.globalAlpha = 0.35 + r() * 0.35;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 700 * area; i++) {
      ctx.fillStyle = T.patch[(i + 1) % T.patch.length];
      ctx.fillRect(r() * L.w, r() * L.h, 2, 3);
    }
    // the castle yard behind the gate
    ctx.fillStyle = 'rgba(120,110,95,0.55)';
    ctx.fillRect(L.gate.x + 40, 0, L.w - L.gate.x, L.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let y = 0; y < L.h; y += 28) {
      for (let x = L.gate.x + 40 + ((y / 28) % 2) * 20; x < L.w; x += 40) ctx.strokeRect(x, y, 40, 28);
    }
    // roads
    for (const [w, col] of [[60, T.edge], [48, T.road]]) {
      for (const p of L.paths) {
        ctx.beginPath();
        p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    for (const p of L.paths) {
      for (let d = 0; d < p.len; d += 9) {
        const q = pathAt(p, d);
        const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
        if (r() < 0.35) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          const o = (r() - 0.5) * 36;
          ctx.fillRect(q.x + nx * o, q.y + ny * o, 2.5, 2.5);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(q.x + nx * 10 - 1, q.y + ny * 10 - 1, 3, 3);
        ctx.fillRect(q.x - nx * 10 - 1, q.y - ny * 10 - 1, 3, 3);
      }
    }
    // our camp: tents and a banner where the lord starts
    const c = L.camp;
    for (const [ox, oy] of [[-60, -90], [-70, 80], [-20, -150]]) this.tent(ctx, c.x + ox, c.y + oy, this.us);
    this.paintDeco(ctx, r);
  }

  clearOfThings(x, y, pad) {
    const L = this.layout;
    for (const p of L.paths) if (nearestOnPath(p, x, y).dist < pad) return false;
    if (x > L.gate.x - 120) return false;
    if (Math.hypot(x - L.camp.x, y - L.camp.y) < 200) return false;
    for (const c of this.sim.setup.army.camps) {
      if (Math.hypot(x - c.tower.x, y - c.tower.y) < 70 || Math.hypot(x - c.x, y - c.y) < 110) return false;
    }
    return true;
  }

  paintDeco(ctx, r) {
    const kind = this.terrain.deco;
    const L = this.layout;
    const per = { plain: 60, forest: 170, mountain: 90, river: 60, castle: 40, snow: 90, desert: 50 }[kind] || 60;
    const count = Math.round(per * L.w / 1200);
    const items = [];
    for (let i = 0; i < count * 3 && items.length < count; i++) {
      const x = r() * L.w, y = 20 + r() * (L.h - 20);
      if (!this.clearOfThings(x, y, 50)) continue;
      items.push({ x, y, v: r(), s: 0.7 + r() * 0.6 });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (kind === 'forest' || (kind === 'plain' && it.v < 0.45) || (kind === 'river' && it.v < 0.4)) this.tree(ctx, it.x, it.y, it.s, it.v);
      else if (kind === 'snow') this.pine(ctx, it.x, it.y, it.s, true);
      else if (kind === 'mountain') (it.v < 0.6 ? this.rock(ctx, it.x, it.y, it.s * 1.4) : this.pine(ctx, it.x, it.y, it.s, false));
      else if (kind === 'desert') (it.v < 0.6 ? this.rock(ctx, it.x, it.y, it.s) : this.dune(ctx, it.x, it.y, it.s));
      else if (kind === 'castle') (it.v < 0.5 ? this.house(ctx, it.x, it.y, it.s) : this.tree(ctx, it.x, it.y, it.s * 0.8, it.v));
      else this.bush(ctx, it.x, it.y, it.s);
    }
  }

  tree(ctx, x, y, s, v) {
    shadow(ctx, x, y + 2, 16 * s);
    ctx.fillStyle = '#6b4520';
    ctx.fillRect(x - 2.5 * s, y - 12 * s, 5 * s, 13 * s);
    const greens = ['#3f7a33', '#4b8a3b', '#357029'];
    for (const [ox, oy, rr] of [[0, -24, 13], [-9, -17, 10], [9, -17, 10]]) {
      ctx.beginPath();
      ctx.arc(x + ox * s, y + oy * s, rr * s, 0, Math.PI * 2);
      ctx.fillStyle = greens[Math.floor(v * 3) % 3];
      ctx.fill();
    }
  }

  pine(ctx, x, y, s, snow) {
    shadow(ctx, x, y + 2, 12 * s);
    ctx.fillStyle = '#5c3a1a';
    ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 9 * s);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - (14 - i * 3) * s, y - (6 + i * 9) * s);
      ctx.lineTo(x, y - (24 + i * 9) * s);
      ctx.lineTo(x + (14 - i * 3) * s, y - (6 + i * 9) * s);
      ctx.closePath();
      ctx.fillStyle = '#2f5f3a';
      ctx.fill();
      if (snow) {
        ctx.beginPath();
        ctx.moveTo(x - (6 - i) * s, y - (19 + i * 9) * s);
        ctx.lineTo(x, y - (24 + i * 9) * s);
        ctx.lineTo(x + (6 - i) * s, y - (19 + i * 9) * s);
        ctx.closePath();
        ctx.fillStyle = '#f4f8fb';
        ctx.fill();
      }
    }
  }

  rock(ctx, x, y, s) {
    shadow(ctx, x, y + 1, 14 * s);
    ctx.beginPath();
    ctx.moveTo(x - 14 * s, y);
    ctx.lineTo(x - 9 * s, y - 12 * s);
    ctx.lineTo(x + 2 * s, y - 16 * s);
    ctx.lineTo(x + 12 * s, y - 7 * s);
    ctx.lineTo(x + 14 * s, y);
    ctx.closePath();
    ctx.fillStyle = '#8f877a';
    ctx.fill();
    ctx.strokeStyle = '#5f584d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  bush(ctx, x, y, s) {
    shadow(ctx, x, y + 1, 10 * s);
    for (const [ox, oy, rr] of [[-5, -5, 6], [4, -6, 7], [0, -10, 6]]) {
      ctx.beginPath();
      ctx.arc(x + ox * s, y + oy * s, rr * s, 0, Math.PI * 2);
      ctx.fillStyle = '#4f8a3a';
      ctx.fill();
    }
  }

  dune(ctx, x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 30 * s, 9 * s, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#e6cb93';
    ctx.fill();
  }

  house(ctx, x, y, s) {
    shadow(ctx, x, y + 2, 22 * s);
    ctx.fillStyle = '#d8cbb0';
    ctx.fillRect(x - 16 * s, y - 16 * s, 32 * s, 16 * s);
    ctx.beginPath();
    ctx.moveTo(x - 22 * s, y - 15 * s);
    ctx.quadraticCurveTo(x, y - 34 * s, x + 22 * s, y - 15 * s);
    ctx.closePath();
    ctx.fillStyle = '#4a5a6a';
    ctx.fill();
  }

  tent(ctx, x, y, col) {
    shadow(ctx, x, y + 2, 26);
    ctx.beginPath();
    ctx.moveTo(x - 26, y); ctx.lineTo(x, y - 34); ctx.lineTo(x + 26, y);
    ctx.closePath();
    ctx.fillStyle = '#efe2c0';
    ctx.fill();
    ctx.strokeStyle = '#8a7650';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 18); ctx.lineTo(x + 6, y);
    ctx.fill();
    ctx.fillStyle = col.color;
    ctx.fillRect(x, y - 52, 14, 9);
    ctx.fillStyle = '#5c3a1a';
    ctx.fillRect(x - 1, y - 52, 2, 20);
  }

  // ---- events → effects ----------------------------------------------------------------

  absorb(events) {
    for (const ev of events) {
      switch (ev.e) {
        case 'hit':
          if (ev.lord) this.text(ev.x, ev.y, `-${Math.round(ev.amt)}`, '#ff6b6b', 15, 0.8);
          else if (ev.amt >= 1) this.fx.push({ k: 'spark', x: ev.x + (Math.random() - 0.5) * 10, y: ev.y, t: 0, life: 0.25, color: ev.side === 'us' ? '#ff8a80' : '#fff3b0' });
          break;
        case 'heal': this.text(ev.x, ev.y, `+${Math.round(ev.amt)}`, '#7dff9a', 13, 0.8); break;
        case 'die':
          this.corpses.push({ x: ev.x, y: ev.y, t: 0, side: ev.side, type: ev.type, kind: ev.kind });
          this.burst(ev.x, ev.y - 10, ev.side === 'us' ? '#d8d0c0' : '#c8b8a0', 8);
          break;
        case 'slash': this.fx.push({ k: 'slash', x: ev.x, y: ev.y, ang: ev.ang, r: ev.r, t: 0, life: 0.18 }); break;
        case 'summon': this.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 30, t: 0, life: 0.4, color: this.us.color }); break;
        case 'skill': {
          const say = SKILL_SAY[ev.key];
          if (say) this.bannerText(say.text, say.color);
          this.flash = 0.25;
          this.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 160, t: 0, life: 0.6, color: say?.color || '#fff' });
          break;
        }
        case 'item': {
          const I = ITEMS[ev.key];
          this.bannerText(`${I.icon} ${I.name}!`, '#fff3b0');
          if (ev.key !== 'bomb') this.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 260, t: 0, life: 0.7, color: '#fff3b0' });
          break;
        }
        case 'boom':
          this.fx.push({ k: 'boom', x: ev.x, y: ev.y, r: 70, t: 0, life: 0.5 });
          this.shake = Math.max(this.shake, 8);
          break;
        case 'fireHit': this.fx.push({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, life: 0.35, fire: true }); break;
        case 'stoneHit': this.fx.push({ k: 'dust', x: ev.x, y: ev.y, r: ev.r, t: 0, life: 0.4 }); this.shake = Math.max(this.shake, 2); break;
        case 'ring': this.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0, life: 0.5, color: ev.color }); break;
        case 'dash': this.fx.push({ k: 'trail', ...ev, t: 0, life: 0.4 }); break;
        case 'tigerRun': this.fx.push({ k: 'tiger', ...ev, t: 0, life: 0.9 }); this.shake = Math.max(this.shake, 6); break;
        case 'volley': this.fx.push({ k: 'volley', x: ev.x, y: ev.y, r: ev.r, t: 0, life: 0.6 }); break;
        case 'gate':
          this.shake = 14;
          this.bannerText('성문이 무너졌다!', '#ffd54f');
          this.burst(ev.x + 20, ev.y, '#a39a86', 24);
          break;
        case 'boss': this.bannerText(`적장 ${ev.name} 등장!`, '#ff8a80', 2.4); break;
        case 'bossDown': this.bannerText('적장을 쓰러뜨렸다!', '#ffd54f', 2.4); this.shake = 10; break;
        case 'tower': this.burst(ev.x, ev.y - 30, '#8a5a2b', 16); this.text(ev.x, ev.y - 70, '망루 격파!', '#ffd54f', 18, 1.2); this.shake = Math.max(this.shake, 5); break;
        case 'pickup': this.text(ev.x, ev.y - 30, `${ITEMS[ev.key].icon} ${ITEMS[ev.key].name}을(를) 찾았다!`, '#ffe08a', 18, 2); break;
        case 'genDown': this.text(ev.x, ev.y - 40, `${GENERALS[ev.key].name} 쓰러짐...`, '#ff8a80', 15, 1.4); break;
        case 'genBack': this.text(ev.x, ev.y - 40, `${GENERALS[ev.key].name} 복귀!`, '#7dff9a', 15, 1.2); this.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: 40, t: 0, life: 0.5, color: '#ffd54f' }); break;
        case 'mode': this.bannerText(ev.mode === 'rally' ? '🚩 모여라! 군주 곁으로' : '⚔️ 돌격! 앞으로', '#fff', 1.2); break;
        case 'reinforce': this.text(ev.x - 80, ev.y - 120, '적 지원군이 나왔다!', '#ff8a80', 16, 1.6); break;
        case 'bossSkill': this.text(ev.x, ev.y - 70, ({ charge: '돌격!', summon: '지원군!', heal: '요술!', rally: '호령!', volley: '일제 사격!' })[ev.key] || '', '#ff8a80', 16, 1.2); break;
        default: break;
      }
    }
  }

  text(x, y, s, color, size, life) { this.texts.push({ x, y, s, color, size, life, t: 0 }); }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
      this.fx.push({ k: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.6 + Math.random() * 0.3, color });
    }
  }

  bannerText(text, color, life = 1.6) { this.banner = { text, color, t: 0, life }; }

  // ---- frame -----------------------------------------------------------------------------

  render(ctx, view, dt) {
    this.t += dt;
    this.fit(view);
    if (!this.started) { this.follow(dt, true); this.started = true; } else this.follow(dt);
    this.buildCache(view);
    const sim = this.sim;
    const s = this.cam.s;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#2a2016';
    ctx.fillRect(0, 0, view.w, view.h);
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 30);
    }
    // terrain
    const x0 = this.cam.x - this.vw / 2, y0 = this.cam.y - this.vh / 2;
    const k = this.cacheK;
    ctx.drawImage(this.cache, x0 * k, y0 * k, this.vw * k, this.vh * k, sx, sy, view.w, view.h);
    // world space
    ctx.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (sx - x0 * s), view.dpr * (sy - y0 * s));
    const inView = (x, y, pad = 120) => x > x0 - pad && x < x0 + this.vw + pad && y > y0 - pad && y < y0 + this.vh + pad;

    for (const z of sim.zones) this.drawZone(ctx, z);
    if (sim.mode === 'rally') {
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.ellipse(sim.lord.x, sim.lord.y, RALLY_AGGRO, RALLY_AGGRO * 0.6, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const c of this.corpses) this.drawCorpse(ctx, c, dt);
    this.corpses = this.corpses.filter(c => c.t < 2.5);
    for (const p of sim.pickups) this.drawPickup(ctx, p);

    // castle wall behind everything that stands
    this.drawCastle(ctx);
    const things = [
      ...sim.structs.filter(st => st.kind === 'tower' && inView(st.x, st.y)),
      ...sim.units.filter(u => !u.dead && !(u.gen && u.gen.down > 0) && inView(u.x, u.y)),
    ].sort((a, b) => a.y - b.y);
    for (const o of things) {
      if (o.kind === 'tower') this.drawTower(ctx, o);
      else this.drawUnit(ctx, o);
    }
    for (const p of sim.shots) this.drawShot(ctx, p);
    this.drawFx(ctx, dt);
    for (const tx of this.texts) {
      tx.t += dt;
      const a = Math.max(0, 1 - tx.t / tx.life);
      ctx.globalAlpha = a;
      ctx.font = `900 ${tx.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(tx.s, tx.x, tx.y - tx.t * 26);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.s, tx.x, tx.y - tx.t * 26);
      ctx.globalAlpha = 1;
    }
    this.texts = this.texts.filter(tx => tx.t < tx.life);

    // screen space
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    this.drawWeather(ctx, view, dt);
    this.drawPointer(ctx, view);
    this.drawMinimap(ctx, view);
    const L = sim.lord;
    if (L.hp / L.maxHp < 0.3) {
      const g = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.3, view.w / 2, view.h / 2, view.h * 0.8);
      g.addColorStop(0, 'rgba(180,0,0,0)');
      g.addColorStop(1, `rgba(180,0,0,${0.25 + 0.15 * Math.sin(this.t * 6)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,230,${this.flash})`;
      ctx.fillRect(0, 0, view.w, view.h);
      this.flash = Math.max(0, this.flash - dt);
    }
    if (this.banner) {
      const b = this.banner;
      b.t += dt;
      const a = Math.min(1, b.t * 5, (b.life - b.t) * 3);
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.font = '900 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const y = view.h * 0.3;
        ctx.strokeText(b.text, view.w / 2, y);
        ctx.fillStyle = b.color;
        ctx.fillText(b.text, view.w / 2, y);
        ctx.globalAlpha = 1;
      }
      if (b.t > b.life) this.banner = null;
    }
  }

  // ---- pieces ----------------------------------------------------------------------------

  hpBar(ctx, x, y, w, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, ratio), 4);
  }

  drawUnit(ctx, u) {
    const sim = this.sim;
    const col = u.side === 'us' ? this.us : this.them;
    const opt = { face: u.face, walk: u.walk, moving: u.moving, atk: u.atkAnim, headband: u.side === 'them' ? this.headband : null };
    if (u.stun > 0) ctx.globalAlpha = 0.75;
    if (u.kind === 'lord') {
      drawLord(ctx, this.lordKey, u.x, u.y, { ...opt, ring: '#fff3b0', scale: 1.1 });
      this.hpBar(ctx, u.x, u.y - 78, 54, u.hp / u.maxHp, '#4cd964');
    } else if (u.kind === 'general') {
      const G = GENERALS[u.gen.key];
      drawGeneral(ctx, u.type, u.x, u.y, col, { ...opt, letter: G.letter });
      if (u.hp < u.maxHp) this.hpBar(ctx, u.x, u.y - 62, 36, u.hp / u.maxHp, '#ffd54f');
    } else if (u.kind === 'boss') {
      ctx.beginPath();
      ctx.ellipse(u.x, u.y, 34, 13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawGeneral(ctx, u.type, u.x, u.y, col, { ...opt, letter: u.name[0], scale: 1.3 });
      this.hpBar(ctx, u.x, u.y - 84, 64, u.hp / u.maxHp, '#ff5252');
      ctx.font = '900 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(u.name, u.x, u.y - 90);
      ctx.fillText(u.name, u.x, u.y - 90);
    } else {
      // a ring under the squad tells sides apart at a glance
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 4, 22, 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = u.side === 'us' ? 'rgba(120,255,140,0.75)' : 'rgba(255,90,80,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawSquad(ctx, u.type, u.x, u.y, col, opt);
      if (u.hp < u.maxHp) this.hpBar(ctx, u.x, u.y - 44, 30, u.hp / u.maxHp, u.side === 'us' ? '#4cd964' : '#ff5252');
    }
    ctx.globalAlpha = 1;
    if (u.stun > 0) {
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💫', u.x, u.y - 50);
    }
    if (u.burnT > 0) {
      ctx.fillStyle = `rgba(255,${120 + Math.random() * 80},40,0.8)`;
      ctx.beginPath();
      ctx.arc(u.x + (Math.random() - 0.5) * 16, u.y - 20 - Math.random() * 14, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    void sim;
  }

  drawTower(ctx, t) {
    const col = this.them;
    const x = t.x, y = t.y;
    shadow(ctx, x, y + 4, 34, 11);
    if (t.dead) return;
    const hurt = t.hitT > this.sim.t - 0.12;
    ctx.save();
    ctx.translate(x, y);
    // legs
    ctx.strokeStyle = '#5c3a1a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-14, -56);
    ctx.moveTo(22, 0); ctx.lineTo(14, -56);
    ctx.moveTo(-18, -18); ctx.lineTo(18, -36);
    ctx.moveTo(18, -18); ctx.lineTo(-18, -36);
    ctx.stroke();
    // platform and roof
    ctx.fillStyle = hurt ? '#c9874a' : '#8a5a2b';
    ctx.fillRect(-24, -74, 48, 20);
    ctx.strokeStyle = '#4a2c12';
    ctx.lineWidth = 2;
    ctx.strokeRect(-24, -74, 48, 20);
    ctx.beginPath();
    ctx.moveTo(-30, -74); ctx.lineTo(0, -96); ctx.lineTo(30, -74);
    ctx.closePath();
    ctx.fillStyle = '#6b2f20';
    ctx.fill();
    ctx.stroke();
    // flag
    ctx.fillStyle = '#4a2c12';
    ctx.fillRect(-1, -120, 2, 26);
    ctx.fillStyle = col.color;
    ctx.fillRect(1, -120, 16, 11);
    // archer head
    ctx.fillStyle = '#f1c48f';
    ctx.beginPath();
    ctx.arc(0, -80, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.hpBar(ctx, x, y - 132, 50, t.hp / t.maxHp, '#ff5252');
  }

  drawCastle(ctx) {
    const sim = this.sim;
    const g = this.layout.gate;
    const col = this.them;
    // the wall runs the whole height of the field
    ctx.fillStyle = '#8e8574';
    ctx.fillRect(g.x + 18, 0, 34, this.layout.h);
    ctx.strokeStyle = '#5a5244';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x + 18, 0, 34, this.layout.h);
    for (let yy = 0; yy < this.layout.h; yy += 18) {
      ctx.fillStyle = '#9d9482';
      ctx.fillRect(g.x + 14, yy, 10, 10);
    }
    const gate = sim.gate;
    drawGate(ctx, g.x, g.y, 1, col, gate.dead ? 0 : gate.hp / gate.maxHp);
    if (gate.dead) {
      // broken open: the door is gone, rubble on the ground
      ctx.fillStyle = this.terrain.road;
      ctx.beginPath();
      ctx.moveTo(g.x + 4, g.y + 42); ctx.lineTo(g.x + 4, g.y + 2); ctx.quadraticCurveTo(g.x + 20, g.y - 24, g.x + 36, g.y + 2); ctx.lineTo(g.x + 36, g.y + 42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a705e';
      for (let i = 0; i < 9; i++) ctx.fillRect(g.x - 14 + (i * 13) % 60, g.y + 30 + (i * 7) % 20, 9, 6);
    } else {
      this.hpBar(ctx, g.x + 34, g.y - 100, 80, gate.hp / gate.maxHp, '#ff5252');
      if (gate.hitT > sim.t - 0.12) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(g.x + 4, g.y - 58, 60, 100);
      }
    }
    // castle towers on the wall
    for (const t of sim.structs) if (t.castle) this.drawTower(ctx, t);
  }

  drawCorpse(ctx, c, dt) {
    c.t += dt;
    ctx.globalAlpha = Math.max(0, 0.55 - c.t * 0.22);
    ctx.fillStyle = c.side === 'us' ? '#5a4a3a' : '#4a3a2a';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawPickup(ctx, p) {
    const bob = Math.sin(this.t * 4) * 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 14 + bob, 18 + Math.sin(this.t * 6) * 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,230,120,0.35)';
    ctx.fill();
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ITEMS[p.key].icon, p.x, p.y - 14 + bob);
    ctx.textBaseline = 'alphabetic';
  }

  drawZone(ctx, z) {
    const a = Math.min(1, z.t) * 0.55;
    const g = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(255,170,40,${a})`);
    g.addColorStop(0.7, `rgba(230,70,20,${a * 0.7})`);
    g.addColorStop(1, 'rgba(200,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const fx = z.x + Math.sin(this.t * 3 + i * 1.7) * z.r * 0.6;
      const fy = z.y + Math.cos(this.t * 2.3 + i) * z.r * 0.3;
      ctx.fillStyle = `rgba(255,${150 + i * 15},40,${a})`;
      ctx.beginPath();
      ctx.moveTo(fx - 6, fy); ctx.quadraticCurveTo(fx, fy - 22 - Math.sin(this.t * 9 + i) * 6, fx + 6, fy);
      ctx.fill();
    }
  }

  drawShot(ctx, p) {
    if (p.kind === 'arrow') {
      const a = Math.atan2(p.ty - p.y, p.tx - p.x);
      ctx.strokeStyle = p.side === 'us' ? '#fff8e0' : '#3a2412';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * 12, p.y - Math.sin(a) * 12);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      const f = Math.min(1, p.travel / p.total);
      const lift = Math.sin(f * Math.PI) * Math.min(90, p.total * 0.3);
      shadow(ctx, p.x, p.y + 10, 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y - lift, p.kind === 'fire' ? 7 : 8, 0, Math.PI * 2);
      ctx.fillStyle = p.kind === 'fire' ? '#ff7a2a' : '#7a7064';
      ctx.fill();
      if (p.kind === 'fire') {
        ctx.fillStyle = 'rgba(255,220,80,0.8)';
        ctx.beginPath();
        ctx.arc(p.x, p.y - lift, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawFx(ctx, dt) {
    for (const f of this.fx) {
      f.t += dt;
      const p = f.t / f.life;
      const a = Math.max(0, 1 - p);
      ctx.globalAlpha = a;
      if (f.k === 'slash') {
        ctx.strokeStyle = '#fffbe0';
        ctx.lineWidth = 5 * a + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.7 + p * 0.3), f.ang - 1.1 + p * 0.6, f.ang + 1.1 + p * 0.6);
        ctx.stroke();
      } else if (f.k === 'ring') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.r * (0.4 + p * 0.6), f.r * (0.4 + p * 0.6) * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.k === 'spark') {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y - p * 10, 4 * a + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.k === 'bit') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt;
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
      } else if (f.k === 'boom') {
        const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r * (0.5 + p));
        g.addColorStop(0, f.fire ? 'rgba(255,220,90,0.9)' : 'rgba(255,240,180,0.95)');
        g.addColorStop(0.6, f.fire ? 'rgba(255,90,30,0.7)' : 'rgba(255,120,40,0.8)');
        g.addColorStop(1, 'rgba(120,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.5 + p), 0, Math.PI * 2);
        ctx.fill();
      } else if (f.k === 'dust') {
        ctx.fillStyle = 'rgba(150,130,100,0.6)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.r * (0.5 + p * 0.6), f.r * 0.35 * (0.5 + p * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.k === 'trail') {
        ctx.strokeStyle = f.foe ? 'rgba(255,90,80,0.8)' : 'rgba(255,230,140,0.8)';
        ctx.lineWidth = 14 * a;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.x0, f.y0);
        ctx.lineTo(f.x1, f.y1);
        ctx.stroke();
      } else if (f.k === 'tiger') {
        // a line of horsemen thundering across
        const x = f.x0 + (f.x1 - f.x0) * Math.min(1, p * 1.3);
        for (let i = 0; i < 5; i++) {
          drawSquad(ctx, 'cavalry', x - f.dir * i * 26, f.y - 50 + i * 25, this.us, { face: f.dir, moving: true, walk: this.t * 2 + i });
        }
      } else if (f.k === 'volley') {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const ax = f.x + Math.sin(i * 2.3) * f.r * 0.8, ay = f.y + Math.cos(i * 1.7) * f.r * 0.5;
          const h = (1 - p) * 120;
          ctx.beginPath();
          ctx.moveTo(ax, ay - h - 12);
          ctx.lineTo(ax, ay - h);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    this.fx = this.fx.filter(f => f.t < f.life);
  }

  drawWeather(ctx, view, dt) {
    const key = this.sim.setup.weather;
    void dt;
    if (key === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 80; i++) {
        const x = (i * 97 + this.t * 300) % view.w, y = (i * 53 + this.t * 700) % view.h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 12); ctx.stroke();
      }
    } else if (key === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 70; i++) {
        const x = (i * 97 + Math.sin(this.t + i) * 20 + this.t * 30) % view.w, y = (i * 53 + this.t * 60) % view.h;
        ctx.fillRect(x, y, 3, 3);
      }
    } else if (key === 'fog') {
      ctx.fillStyle = 'rgba(230,235,240,0.22)';
      ctx.fillRect(0, 0, view.w, view.h);
    } else if (key === 'night') {
      ctx.fillStyle = 'rgba(10,20,60,0.3)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  // An arrow at the screen edge pointing to the next enemy camp (or the castle) when it is
  // off screen, so a kid always knows where to go.
  drawPointer(ctx, view) {
    const sim = this.sim;
    const L = sim.lord;
    const targets = [...sim.structs.filter(s => !s.dead), ...(sim.boss && !sim.boss.dead ? [sim.boss] : [])];
    const goal = targets.filter(t => t.x > L.x - 200).sort((a, b) => a.x - b.x)[0] || targets[0];
    if (!goal) return;
    const p = this.toScreen(goal.x, goal.y);
    if (p.x > 40 && p.x < view.w - 40 && p.y > 60 && p.y < view.h - 60) return;
    const cx = view.w / 2, cy = view.h / 2;
    const ang = Math.atan2(p.y - cy, p.x - cx);
    const ex = Math.max(36, Math.min(view.w - 36, cx + Math.cos(ang) * view.w));
    const ey = Math.max(90, Math.min(view.h - 120, cy + Math.sin(ang) * view.h));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.t * 5);
    ctx.fillStyle = '#ffd54f';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // The whole field as a strip at the top: our army, enemies, towers, the castle.
  drawMinimap(ctx, view) {
    const sim = this.sim;
    const L = this.layout;
    // sized like the HUD (a phone shrinks both), and never taller than the gap above the boss bar
    const w = Math.min(330, view.w * 0.34 / uiScale) * uiScale, h = Math.min(108 * uiScale, w * L.h / L.w);
    const x = (view.w - w) / 2, y = 8 * uiScale;
    const k = w / L.w, ky = h / L.h;
    ctx.fillStyle = 'rgba(20,14,8,0.55)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = 'rgba(134,173,92,0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(201,169,110,0.9)';
    ctx.lineWidth = 2;
    for (const p of L.paths) {
      ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(x + q.x * k, y + q.y * ky) : ctx.moveTo(x + q.x * k, y + q.y * ky)));
      ctx.stroke();
    }
    ctx.fillStyle = sim.gateDown ? '#6a6050' : '#a39a86';
    ctx.fillRect(x + L.gate.x * k, y, 4, h);
    for (const s of sim.structs) {
      if (s.dead || s.kind !== 'tower') continue;
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(x + s.x * k - 2.5, y + s.y * ky - 2.5, 5, 5);
    }
    for (const u of sim.units) {
      if (u.dead || (u.gen && u.gen.down > 0) || u.kind === 'lord') continue;
      ctx.fillStyle = u.side === 'us' ? '#7dff9a' : u.kind === 'boss' ? '#ff1744' : '#ff8a80';
      const r = u.kind === 'boss' ? 3 : 1.6;
      ctx.fillRect(x + u.x * k - r, y + u.y * ky - r, r * 2, r * 2);
    }
    // what the camera sees
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + (this.cam.x - this.vw / 2) * k, y + Math.max(0, this.cam.y - this.vh / 2) * ky, this.vw * k, Math.min(L.h, this.vh) * ky);
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(x + sim.lord.x * k, y + sim.lord.y * ky, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export { SKILLS };
void TROOPS;
