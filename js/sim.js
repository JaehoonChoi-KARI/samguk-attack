// Battle rules, with no drawing or DOM. The lord moves and swings from `input`; squads called
// with 1~6, the generals and every enemy think for themselves. The renderer reads units,
// structs, shots, zones and pickups, and drains `events` every frame.

import {
  TROOPS, LORD_WEAPONS, LORD_STATS, counterMult, counterLevel, SKILLS, ITEMS, skillDur, AURA_R,
  GEN_SPECIALS, GENERAL_RECOVER, GENERAL_LEASH, AGGRO, RALLY_AGGRO, AHEAD_MAX, FOE_HP, FOE_ATK, FOE_SPEED,
  TOWER, CASTLE, REINFORCE, BOSS, SCROLL_DROP, STAR_HP, stageHpMult, stageAtkMult, diffScale, WEATHER, earlyEase,
} from './data.js';
import { pathAt, nearestOnPath, rng } from './maps.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RETARGET = 0.25; // seconds between target searches
const GUARD_AGGRO = 270; // enemy guards wake up when one of ours comes this close
const GUARD_LEASH = 520; // and never chase further than this from their camp
const MARCH_AGGRO = 280;
const GEN_SLOTS = [[-46, -44], [-46, 44], [-92, -22], [-92, 22]]; // around the lord, facing right
const BODY = { lord: 18, general: 20, squad: 18, boss: 26 };

export class Sim {
  constructor(setup) {
    this.setup = setup;
    this.n = setup.n;
    this.layout = setup.layout;
    this.r = rng(`${setup.seed || 'battle'}:${setup.stage.id}`);
    const D = setup.diff || { hp: 1, atk: 1 };
    this.hpScale = stageHpMult(this.n) * diffScale(D.hp, this.n);
    this.atkScale = stageAtkMult(this.n) * diffScale(D.atk, this.n);
    this.weather = WEATHER[setup.weather] || WEATHER.clear;
    this.mods = setup.mods || {};
    this.t = 0;
    this.nextId = 1;
    this.units = [];
    this.structs = [];
    this.shots = [];
    this.zones = [];
    this.pickups = [];
    this.events = [];
    this.buffs = {};
    this.mode = 'charge'; // 'charge' (돌격) or 'rally' (모여라)
    this.input = { mx: 0, my: 0, attack: false };
    this.summonCd = {};
    for (const t of Object.keys(setup.troops)) this.summonCd[t] = 0;
    this.skillCd = setup.skills.map(() => 0);
    this.items = { ...setup.items };
    this.itemsUsed = {};
    this.found = { scroll: 0 };
    this.summoned = {};
    this.kills = 0;
    this.gensFell = 0;
    this.over = false;
    this.won = false;
    this.endTimer = 0;
    this.gateDown = false;
    this.boss = null;
    this.reinforceAt = REINFORCE.first;
    this.reinforceEvery = Math.max(REINFORCE.everyMin, REINFORCE.every - 0.5 * (this.n - 1));

    const c = this.layout.camp;
    const L = setup.lord;
    this.lord = this.addUnit({
      side: 'us', kind: 'lord', type: null, x: c.x, y: c.y, hp: L.hp, atk: L.atk, speed: LORD_STATS.speed,
      weapon: L.weapon, def: L.def, regen: L.regen, cd: LORD_WEAPONS[L.weapon].cd,
      range: LORD_WEAPONS[L.weapon].reach || LORD_WEAPONS[L.weapon].range,
    });
    this.lord.dir = { x: 1, y: 0 };
    setup.generals.forEach((g, i) => {
      const [ox, oy] = GEN_SLOTS[i];
      this.addUnit({
        side: 'us', kind: 'general', type: g.type, x: c.x + ox, y: c.y + oy, hp: g.hp, atk: g.atk, cd: g.cd,
        range: g.range, speed: g.speed, dr: g.dr,
        gen: { key: g.key, kind: g.kind, slot: i, specCd: (GEN_SPECIALS[g.kind].cd || 0) * 0.5, down: 0 },
      });
    });
    this.buildEnemy(setup.army);
  }

  // ---- setup -------------------------------------------------------------------------

  addUnit(o) {
    const u = {
      id: this.nextId++, face: o.side === 'us' ? 1 : -1, cdLeft: 0, maxHp: o.hp, dead: false,
      stun: 0, slowT: 0, slowAmt: 0, burnT: 0, burnDps: 0, hitT: -99, target: null, think: 0,
      r: BODY[o.kind] + (o.type === 'cavalry' || o.type === 'catapult' ? 4 : 0), moving: false, walk: 0, atkAnim: 0,
      ...o,
    };
    this.units.push(u);
    return u;
  }

  foeStats(type) {
    const T = TROOPS[type];
    return {
      hp: T.hp * FOE_HP * this.hpScale,
      atk: T.atk * FOE_ATK * this.atkScale,
      cd: T.cd,
      range: T.melee ? T.reach : T.range,
      speed: T.speed * FOE_SPEED,
    };
  }

  addFoe(type, x, y, extra = {}) {
    const s = this.foeStats(type);
    return this.addUnit({ side: 'them', kind: 'squad', type, x, y, ...s, ...extra });
  }

  buildEnemy(army) {
    this.towersTotal = 0;
    army.camps.forEach((c, i) => {
      this.addStruct({ kind: 'tower', x: c.tower.x, y: c.tower.y, hp: TOWER.hp * this.hpScale, camp: i });
      for (const g of c.guards) this.addFoe(g.type, g.x, g.y, { home: { x: g.x, y: g.y }, guard: true, camp: i });
    });
    for (const t of army.castleTowers) this.addStruct({ kind: 'tower', x: t.x, y: t.y, hp: CASTLE.towerHp * this.hpScale, castle: true });
    const g = this.layout.gate;
    this.gate = this.addStruct({ kind: 'gate', x: g.x + 22, y: g.y, hp: CASTLE.gateHp * (1 + CASTLE.gateUp * (this.n - 1)) * this.hpScale * earlyEase(this.n), r: 64, shoot: false });
    // a few guards wait in front of the gate
    const mix = Object.keys(army.mix);
    for (let k = 0; k < 2 + Math.floor(this.n / 6); k++) {
      const x = g.x - 70 - (k % 2) * 40, y = g.y - 60 + k * 45;
      this.addFoe(mix[k % mix.length], x, y, { home: { x, y }, guard: true, camp: -1 });
    }
  }

  addStruct(o) {
    const s = {
      id: this.nextId++, side: 'them', dead: false, maxHp: o.hp, r: o.r || 32, cdLeft: 1, stun: 0, hitT: -99,
      atk: TOWER.atk * this.atkScale, cd: TOWER.cd, range: TOWER.range, shoot: true, ...o,
    };
    if (s.kind === 'tower') this.towersTotal++;
    this.structs.push(s);
    return s;
  }

  // ---- queries ---------------------------------------------------------------------

  alive(side) { return this.units.filter(u => !u.dead && u.side === side && !(u.gen && u.gen.down > 0)); }
  ourSquads() { return this.units.filter(u => !u.dead && u.side === 'us' && u.kind === 'squad'); }
  leadUsed() { return this.ourSquads().reduce((s, u) => s + u.lead, 0); }
  foes() { return this.units.filter(u => !u.dead && u.side === 'them'); }
  liveStructs() { return this.structs.filter(s => !s.dead); }
  isActive(u) { return !u.dead && !(u.gen && u.gen.down > 0); }

  // Hostile things (units, and for our side the enemy structures) a unit could go for.
  hostiles(side) {
    if (side === 'us') return [...this.units.filter(u => u.side === 'them' && !u.dead), ...this.structs.filter(s => !s.dead)];
    return this.units.filter(u => u.side === 'us' && this.isActive(u));
  }

  // Best target for u within `radius` of `center`: the closest, with structures counting as
  // further away (catapults like them instead).
  pickTarget(u, center, radius) {
    let best = null, bestScore = Infinity;
    for (const h of this.hostiles(u.side)) {
      const d = dist(center, h) - (h.r || 0);
      if (d > radius) continue;
      let score = dist(u, h);
      if (h.kind === 'tower' || h.kind === 'gate') score += u.type === 'catapult' ? -150 : 140;
      if (u.side === 'us' && u.kind === 'squad' && h.x > this.lord.x + AHEAD_MAX + 120) continue;
      if (score < bestScore) { bestScore = score; best = h; }
    }
    return best;
  }

  // ---- buffs -----------------------------------------------------------------------

  buff(name) { return this.buffs[name] && this.buffs[name].t > 0 ? this.buffs[name] : null; }

  atkMul(u) {
    let m = 1;
    if (u.side === 'us') {
      const b = this.buffs;
      if (this.buff('roar')) m += b.roar.power;
      if (this.buff('blade') && (u.kind === 'lord' || TROOPS[u.type]?.melee)) m += b.blade.power;
      if (this.buff('tiger')) m += u.kind === 'lord' ? b.tiger.power : b.tiger.all;
      if (this.buff('oath') && u.kind === 'general') m += b.oath.power;
      if (this.mods.aura && u.kind !== 'lord' && dist(u, this.lord) < AURA_R) m += this.mods.aura;
      for (const g of this.units) {
        if (g.gen?.kind === 'rally' && this.isActive(g) && g !== u && dist(g, u) < GEN_SPECIALS.rally.radius) { m += GEN_SPECIALS.rally.atk; break; }
      }
    } else if (u.rallyT > 0) m += 0.3;
    return m;
  }

  // Attack interval multiplier (smaller is faster).
  cdMul(u) {
    let haste = 0;
    if (u.side === 'us') {
      if (this.buff('haste')) haste += this.buffs.haste.power;
      if (this.buff('volley') && (u.kind === 'lord' ? u.weapon === 'bow' : !TROOPS[u.type]?.melee)) haste += this.buffs.volley.power;
      if (this.buff('happy')) haste += ITEMS.happy.haste;
    }
    return 1 / (1 + haste);
  }

  speedMul(u) {
    let m = this.weather.speed || 1;
    if (u.slowT > 0) m *= 1 - u.slowAmt;
    if (u.side === 'us' && this.buff('haste')) m *= 1 + SKILLS.cc_haste.move;
    if (u.side === 'them' && this.buff('happy')) m *= 1 - ITEMS.happy.slow;
    if (u.side === 'them' && u.rallyT > 0) m *= 1.2;
    return m;
  }

  // ---- damage ----------------------------------------------------------------------

  hurt(target, amount, src, kind = 'melee') {
    if (!target || target.dead || (target.gen && target.gen.down > 0)) return 0;
    let dmg = amount;
    const isStruct = target.kind === 'tower' || target.kind === 'gate';
    if (isStruct) {
      if (src?.type === 'catapult') dmg *= TROOPS.catapult.siege;
    } else if (src && src.type && target.type) {
      dmg *= counterMult(src.type, target.type);
      if (src.side === 'us' && this.mods.counter && counterLevel(src.type, target.type) > 0) dmg *= 1 + this.mods.counter;
    }
    if (!isStruct) {
      const tr = TROOPS[target.type]?.trait;
      if (tr?.dr) dmg *= 1 - (kind === 'arrow' ? tr.arrowDr : tr.dr);
      if (target.dr) dmg *= 1 - target.dr;
      if (target.side === 'us') {
        if (target.kind === 'lord') dmg *= 1 - (target.def || 0);
        else dmg *= 1 - (this.mods.troopDef || 0);
        if (target.kind === 'general' && this.buff('oath')) dmg *= 1 - SKILLS.lb_oath.dr;
      }
    }
    if (kind === 'fire') dmg *= this.weather.fire || 1;
    target.hp -= dmg;
    target.hitT = this.t;
    this.events.push({ e: 'hit', x: target.x, y: target.y - 20, amt: dmg, side: target.side, lord: target.kind === 'lord' });
    if (target.hp <= 0) this.kill(target, src);
    return dmg;
  }

  heal(u, amount) {
    if (!this.isActive(u) || u.kind === 'tower') return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (u.hp - before > 1) this.events.push({ e: 'heal', x: u.x, y: u.y - 26, amt: u.hp - before });
  }

  kill(u, src) {
    if (u.gen) {
      u.hp = 0;
      u.gen.down = Math.max(1, GENERAL_RECOVER - (this.mods.genRecover || 0));
      u.target = null;
      this.gensFell++;
      this.events.push({ e: 'genDown', x: u.x, y: u.y, key: u.gen.key });
      return;
    }
    u.dead = true;
    u.hp = 0;
    this.events.push({ e: 'die', x: u.x, y: u.y, side: u.side, kind: u.kind, type: u.type });
    if (u.kind === 'lord') { this.finish(false, 'lord'); return; }
    if (u.side === 'them') {
      if (u.kind !== 'tower' && u.kind !== 'gate') this.kills++;
      if (u.kind === 'tower') {
        this.events.push({ e: 'tower', x: u.x, y: u.y });
        if (this.r() < SCROLL_DROP) this.pickups.push({ key: 'scroll', x: u.x, y: u.y + 30, t: 0 });
      }
      if (u.kind === 'gate') this.openGate();
      if (u.kind === 'boss') { this.events.push({ e: 'bossDown', x: u.x, y: u.y }); this.endTimer = 1.6; this.winPending = true; }
    }
    void src;
  }

  openGate() {
    this.gateDown = true;
    const g = this.layout.gate;
    const b = this.setup.army.boss;
    const s = this.foeStats(b.type);
    this.boss = this.addUnit({
      side: 'them', kind: 'boss', type: b.type, x: g.x + 60, y: g.y,
      hp: s.hp * BOSS.hp * earlyEase(this.n), atk: s.atk * BOSS.atk, cd: s.cd, range: s.range + (TROOPS[b.type].melee ? 8 : 40),
      speed: s.speed * BOSS.speed, name: b.name, title: b.title, bossSkill: b.skill, skillCdLeft: 4,
    });
    const mix = Object.keys(this.setup.army.mix);
    for (let k = 0; k < BOSS.guards; k++) this.addFoe(mix[k % mix.length], g.x + 40, g.y - 60 + k * 60);
    this.events.push({ e: 'gate', x: g.x, y: g.y });
    this.events.push({ e: 'boss', name: b.name });
  }

  finish(won, reason) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    this.reason = reason;
  }

  // ---- player commands -----------------------------------------------------------------

  // Call a squad of `type` beside the lord. Returns '' or why not.
  summon(type) {
    const T = this.setup.troops[type];
    if (!T) return 'locked';
    if (this.over) return 'over';
    if (this.summonCd[type] > 0) return 'cd';
    if (this.leadUsed() + T.lead > this.setup.lead) return 'lead';
    const L = this.lord;
    const k = this.ourSquads().length;
    const x = clamp(L.x - 40 * L.face + (this.r() - 0.5) * 20, 30, this.layout.wallX - 40);
    const y = clamp(L.y + ((k % 3) - 1) * 34 + (this.r() - 0.5) * 16, 60, this.layout.h - 50);
    this.addUnit({
      side: 'us', kind: 'squad', type, x, y, hp: T.hp, atk: T.atk, cd: T.cd, range: T.range, speed: T.speed,
      lead: T.lead, chargeRun: 0,
    });
    this.summonCd[type] = T.summonCd * (this.buff('scroll') ? ITEMS.scroll.summon : 1);
    this.summoned[type] = (this.summoned[type] || 0) + 1;
    this.events.push({ e: 'summon', x, y, type });
    return '';
  }

  toggleMode() {
    this.mode = this.mode === 'charge' ? 'rally' : 'charge';
    this.events.push({ e: 'mode', mode: this.mode });
  }

  // Lord ability i (0..2). Returns '' or why not.
  useSkill(i) {
    const sk = this.setup.skills[i];
    if (!sk) return 'locked';
    if (this.over) return 'over';
    if (this.skillCd[i] > 0) return 'cd';
    const def = SKILLS[sk.key];
    const dur = skillDur(def, this.mods);
    const L = this.lord;
    const us = this.units.filter(u => u.side === 'us' && this.isActive(u));
    switch (sk.key) {
      case 'lb_heal':
        for (const u of us) this.heal(u, u.maxHp * sk.power);
        this.buffs.regen = { t: dur, rate: 0.015 };
        break;
      case 'lb_oath':
        for (const g of this.units) {
          if (g.gen && g.gen.down > 0) this.reviveGeneral(g, 0.6);
        }
        this.buffs.oath = { t: dur, power: sk.power };
        break;
      case 'lb_blade': this.buffs.blade = { t: dur, power: sk.power }; break;
      case 'cc_roar': this.buffs.roar = { t: dur, power: sk.power }; break;
      case 'cc_haste': this.buffs.haste = { t: dur, power: sk.power }; break;
      case 'sq_volley': this.buffs.volley = { t: dur, power: sk.power }; break;
      case 'sq_tiger': this.buffs.tiger = { t: dur, power: sk.power, all: def.all }; break;
      case 'cc_tiger': {
        const dir = L.face;
        const x0 = L.x - 120 * dir, x1 = L.x + (def.length - 120) * dir;
        const dmg = sk.power * this.setup.power;
        for (const f of this.foes()) {
          if ((f.x - x0) * dir >= -20 && (x1 - f.x) * dir >= -20 && Math.abs(f.y - L.y) < def.width / 2 + f.r) {
            this.hurt(f, dmg, null, 'melee');
            if (!f.dead) f.stun = Math.max(f.stun, def.stun);
          }
        }
        this.events.push({ e: 'tigerRun', x0, x1, y: L.y, dir });
        break;
      }
      case 'sq_fire': {
        const p = this.crowdPoint(L, 480) || { x: L.x + 220 * L.face, y: L.y };
        this.zones.push({ kind: 'fire', x: p.x, y: p.y, r: def.radius, t: def.dur, dps: sk.power * this.setup.power * 0.5, slow: def.slow, side: 'us' });
        break;
      }
      default: break;
    }
    this.skillCd[i] = sk.cd;
    this.events.push({ e: 'skill', key: sk.key, x: L.x, y: L.y });
    return '';
  }

  // Item k (bomb needs the enemy type to hit). Returns '' or why not.
  useItem(k, type = null) {
    if (this.over) return 'over';
    if (!(this.items[k] > 0)) return 'none';
    const L = this.lord;
    if (k === 'bomb') {
      const list = this.foes().filter(f => f.kind === 'squad' && f.type === type);
      if (!list.length) return 'noTarget';
      list.sort((a, b) => dist(a, L) - dist(b, L));
      const f = list[0];
      this.events.push({ e: 'boom', x: f.x, y: f.y });
      this.kill(f, L);
    } else if (k === 'happy') {
      const I = ITEMS.happy;
      this.buffs.happy = { t: I.dur, rate: I.heal / I.dur };
    } else if (k === 'scroll') {
      const I = ITEMS.scroll;
      this.buffs.scroll = { t: I.dur };
      for (const t of Object.keys(this.summonCd)) this.summonCd[t] *= I.summon;
      for (const f of this.foes()) f.stun = Math.max(f.stun, I.freeze);
      for (const s of this.liveStructs()) s.stun = Math.max(s.stun, I.freeze);
    }
    this.items[k]--;
    this.itemsUsed[k] = (this.itemsUsed[k] || 0) + 1;
    this.events.push({ e: 'item', key: k, x: L.x, y: L.y });
    return '';
  }

  // Middle of the biggest group of enemies within `radius` of p.
  crowdPoint(p, radius) {
    const near = this.foes().filter(f => dist(f, p) < radius);
    let best = null, bestN = 0;
    for (const f of near) {
      const n = near.filter(g => dist(f, g) < 140).length;
      if (n > bestN) { bestN = n; best = f; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  reviveGeneral(g, frac) {
    g.gen.down = 0;
    g.hp = g.maxHp * frac;
    const [ox, oy] = GEN_SLOTS[g.gen.slot];
    g.x = clamp(this.lord.x + ox * this.lord.face, 30, this.layout.wallX - 30);
    g.y = clamp(this.lord.y + oy, 60, this.layout.h - 50);
    g.stun = 0; g.slowT = 0; g.burnT = 0;
    this.events.push({ e: 'genBack', x: g.x, y: g.y, key: g.gen.key });
  }

  // ---- the main step ------------------------------------------------------------------

  step(dt) {
    if (this.over) return;
    this.t += dt;
    for (const b of Object.values(this.buffs)) b.t -= dt;
    for (const t of Object.keys(this.summonCd)) this.summonCd[t] = Math.max(0, this.summonCd[t] - dt);
    this.skillCd = this.skillCd.map(c => Math.max(0, c - dt));

    this.stepLord(dt);
    for (const u of this.units) {
      if (u.dead || u.kind === 'lord') continue;
      if (u.gen && u.gen.down > 0) {
        u.gen.down -= dt;
        if (u.gen.down <= 0) this.reviveGeneral(u, 1);
        continue;
      }
      this.status(u, dt);
      if (u.stun > 0) { u.moving = false; continue; }
      if (u.kind === 'general') this.thinkGeneral(u, dt);
      else if (u.kind === 'boss') this.thinkBoss(u, dt);
      else if (u.side === 'us') this.thinkSquad(u, dt);
      else this.thinkFoe(u, dt);
    }
    this.stepStructs(dt);
    this.stepShots(dt);
    this.stepZones(dt);
    this.separate();
    this.stepRegen(dt);
    this.stepPickups();
    this.stepReinforce(dt);
    this.units = this.units.filter(u => !u.dead || u.kind === 'lord');
    if (this.winPending) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(true, 'boss');
    }
  }

  status(u, dt) {
    if (u.stun > 0) u.stun -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.rallyT > 0) u.rallyT -= dt;
    if (u.burnT > 0) {
      u.burnT -= dt;
      u.hp -= u.burnDps * dt;
      u.hitT = this.t;
      if (u.hp <= 0 && !u.dead) this.kill(u, null);
    }
    u.cdLeft -= dt;
    u.atkAnim = Math.max(0, u.atkAnim - dt * 3);
  }

  stepLord(dt) {
    const L = this.lord;
    if (L.dead) return;
    this.status(L, dt);
    const { mx, my } = this.input;
    const m = Math.hypot(mx, my);
    if (m > 0.05 && L.stun <= 0) {
      const k = Math.min(1, m);
      const sp = L.speed * this.speedMul(L) * k;
      L.x += (mx / m) * sp * dt;
      L.y += (my / m) * sp * dt;
      L.dir = { x: mx / m, y: my / m };
      if (Math.abs(mx) > 0.15) L.face = mx > 0 ? 1 : -1;
      L.moving = true;
      L.walk += dt * k;
    } else L.moving = false;
    this.bound(L);
    if (this.input.attack && L.cdLeft <= 0 && L.stun <= 0) this.lordAttack();
  }

  lordAttack() {
    const L = this.lord;
    const W = LORD_WEAPONS[L.weapon];
    const atk = L.atk * this.atkMul(L);
    L.cdLeft = W.cd * this.cdMul(L);
    L.atkAnim = 1;
    if (W.range) {
      const t = this.pickTarget(L, L, W.range * (this.weather.range || 1));
      if (t) {
        if (Math.abs(t.x - L.x) > 4) L.face = t.x > L.x ? 1 : -1;
        this.shoot(L, t, { kind: 'arrow', dmg: atk, pierce: W.pierce });
      } else this.events.push({ e: 'sfx', name: 'bow' });
      return;
    }
    // a sword swing: face the closest enemy if one is right there, hit everything in front
    const near = this.pickTarget(L, L, W.reach + 60);
    if (near) {
      const d = dist(L, near) || 1;
      L.dir = { x: (near.x - L.x) / d, y: (near.y - L.y) / d };
      if (Math.abs(near.x - L.x) > 4) L.face = near.x > L.x ? 1 : -1;
    }
    const hit = this.hostiles('us')
      .filter(h => {
        const dx = h.x - L.x, dy = h.y - L.y;
        const d = Math.hypot(dx, dy);
        return d - (h.r || 0) < W.reach && (d < 20 || (dx * L.dir.x + dy * L.dir.y) / d > -0.15);
      })
      .sort((a, b) => dist(a, L) - dist(b, L))
      .slice(0, W.hits);
    for (const h of hit) this.hurt(h, atk, L, 'melee');
    this.events.push({ e: 'slash', x: L.x, y: L.y - 12, ang: Math.atan2(L.dir.y, L.dir.x), r: W.reach, hit: hit.length });
  }

  bound(u) {
    const r = u.r || 16;
    const maxX = u.side === 'us' && !this.gateDown ? this.layout.wallX - r - 6 : this.layout.w - 20;
    u.x = clamp(u.x, 20, maxX);
    u.y = clamp(u.y, 50, this.layout.h - 36);
  }

  moveToward(u, x, y, dt, stopAt = 0) {
    const dx = x - u.x, dy = y - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopAt + 0.5) { u.moving = false; return true; }
    const step = Math.min(d - stopAt, u.speed * this.speedMul(u) * dt);
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    if (Math.abs(dx) > 3) u.face = dx > 0 ? 1 : -1;
    u.moving = true;
    u.walk += dt;
    if (u.chargeRun !== undefined) u.chargeRun += step;
    this.bound(u);
    return false;
  }

  // Go for target t: walk into range, then attack when ready.
  engage(u, t, dt) {
    const reach = u.range * (TROOPS[u.type]?.melee ? 1 : this.weather.range || 1);
    const d = dist(u, t) - (t.r || 0) - u.r * 0.5;
    if (d > reach) { this.moveToward(u, t.x, t.y, dt, (t.r || 0) + reach * 0.8); return; }
    u.moving = false;
    if (Math.abs(t.x - u.x) > 3) u.face = t.x > u.x ? 1 : -1;
    if (u.cdLeft > 0) return;
    u.cdLeft = u.cd * this.cdMul(u);
    u.atkAnim = 1;
    this.attack(u, t);
  }

  attack(u, t) {
    const T = TROOPS[u.type];
    const atk = u.atk * this.atkMul(u);
    const multi = u.gen?.kind === 'multishot' ? GEN_SPECIALS.multishot.targets : 1;
    const targets = [t];
    if (multi > 1) {
      for (const h of this.hostiles(u.side)) {
        if (targets.length >= multi) break;
        if (h !== t && dist(u, h) - (h.r || 0) < u.range + 40) targets.push(h);
      }
    }
    for (const tg of targets) {
      if (T.melee) {
        let dmg = atk;
        if (T.trait?.charge && (u.chargeRun || 0) > 120) dmg *= T.trait.charge;
        if (u.chargeRun !== undefined) u.chargeRun = 0;
        this.hurt(tg, dmg, u, 'melee');
        if (T.trait?.pierce) {
          const extra = this.hostiles(u.side).filter(h => h !== tg && dist(h, tg) < 50 && !(h.kind === 'tower' || h.kind === 'gate')).slice(0, T.trait.pierce - 1);
          for (const h of extra) this.hurt(h, dmg * 0.7, u, 'melee');
        }
        this.events.push({ e: 'swing', x: u.x, y: u.y, side: u.side });
      } else if (u.type === 'archer') {
        this.shoot(u, tg, { kind: 'arrow', dmg: atk });
      } else if (u.type === 'strategist') {
        this.shoot(u, tg, { kind: 'fire', dmg: atk, splash: T.splash, burn: T.burn, slow: T.slow });
      } else {
        this.shoot(u, tg, { kind: 'stone', dmg: atk, splash: T.splash });
      }
    }
  }

  shoot(src, t, o) {
    const speed = o.kind === 'arrow' ? 620 : o.kind === 'fire' ? 420 : 330;
    this.shots.push({
      ...o, x: src.x, y: src.y - 18, sx: src.x, sy: src.y - 18, tx: t.x, ty: t.y, target: t, speed,
      side: src.side, src: { type: src.type, side: src.side, kind: src.kind }, travel: 0,
      total: Math.max(1, dist(src, t)),
    });
    if (o.kind === 'arrow') this.events.push({ e: 'sfx', name: 'bow' });
  }

  stepShots(dt) {
    for (const s of this.shots) {
      if (s.target && !s.target.dead && s.kind === 'arrow') { s.tx = s.target.x; s.ty = s.target.y - 10; }
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      s.travel += step;
      if (d <= step) {
        s.x = s.tx; s.y = s.ty; s.done = true;
        this.land(s);
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
    }
    this.shots = this.shots.filter(s => !s.done);
  }

  land(s) {
    const src = s.src;
    if (s.kind === 'arrow') {
      if (s.target && !s.target.dead) {
        this.hurt(s.target, s.dmg, src, 'arrow');
        if (s.pierce > 1) {
          const next = this.hostiles(s.side).find(h => h !== s.target && dist(h, s.target) < 60);
          if (next) this.hurt(next, s.dmg * 0.6, src, 'arrow');
        }
      }
      return;
    }
    const kind = s.kind === 'fire' ? 'fire' : 'melee';
    for (const h of this.hostiles(s.side)) {
      if (dist(h, s) - (h.r || 0) * 0.6 > s.splash) continue;
      this.hurt(h, s.dmg, src, kind);
      if (s.burn && !h.dead && h.burnDps !== undefined) {
        h.burnT = 2.5;
        h.burnDps = s.dmg * s.burn / 2.5 * (this.weather.fire || 1);
      }
      if (s.slow && !h.dead && h.slowT !== undefined) { h.slowT = 2; h.slowAmt = Math.max(h.slowAmt || 0, s.slow); }
    }
    this.events.push({ e: s.kind === 'fire' ? 'fireHit' : 'stoneHit', x: s.x, y: s.y, r: s.splash });
  }

  stepZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      const hostile = z.side === 'us' ? this.foes() : this.alive('us');
      for (const h of hostile) {
        if (dist(h, z) > z.r) continue;
        h.hp -= z.dps * dt * (this.weather.fire || 1);
        h.hitT = this.t;
        if (z.slow) { h.slowT = Math.max(h.slowT, 0.3); h.slowAmt = Math.max(h.slowAmt || 0, z.slow); }
        if (h.hp <= 0 && !h.dead) this.kill(h, null);
      }
    }
    this.zones = this.zones.filter(z => z.t > 0);
  }

  stepStructs(dt) {
    for (const s of this.structs) {
      if (s.dead || !s.shoot) continue;
      if (s.stun > 0) { s.stun -= dt; continue; }
      s.cdLeft -= dt;
      if (s.cdLeft > 0) continue;
      let best = null, bd = Infinity;
      for (const u of this.alive('us')) {
        const d = dist(u, s);
        if (d < s.range * (this.weather.range || 1) && d < bd) { bd = d; best = u; }
      }
      if (!best) continue;
      s.cdLeft = s.cd;
      this.shoot({ x: s.x, y: s.y - 50, side: 'them', type: null, kind: 'tower' }, best, { kind: 'arrow', dmg: s.atk });
    }
  }

  // ---- thinking --------------------------------------------------------------------

  thinkSquad(u, dt) {
    const L = this.lord;
    u.think -= dt;
    if (u.think <= 0 || (u.target && (u.target.dead || (u.target.gen && u.target.gen.down > 0)))) {
      u.think = RETARGET;
      u.target = this.mode === 'rally' ? this.pickTarget(u, L, RALLY_AGGRO) : this.pickTarget(u, u, AGGRO);
    }
    if (u.target) { this.engage(u, u.target, dt); return; }
    if (this.mode === 'rally') {
      const k = this.ourSquads().indexOf(u);
      const row = Math.floor(k / 4), col = k % 4;
      const gx = L.x - (110 + row * 42) * L.face, gy = L.y + (col - 1.5) * 40;
      this.moveToward(u, gx, gy, dt, 12);
      return;
    }
    // 돌격: walk on toward the next enemy thing ahead, but not too far in front of the lord
    const goal = this.nextObjective(u);
    const capX = L.x + AHEAD_MAX;
    if (goal) {
      const gx = Math.min(goal.x - (u.range || 30), capX);
      const near = nearestOnPath(this.layout.main, gx, goal.y);
      this.moveToward(u, gx, (near.y * 2 + goal.y) / 3, dt, 20);
    } else u.moving = false;
  }

  nextObjective(u) {
    let best = null, bd = Infinity;
    for (const h of [...this.liveStructs(), ...this.foes()]) {
      if (h.x < u.x - 120) continue;
      const d = Math.abs(h.x - u.x) + Math.abs(h.y - u.y) * 0.5;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  thinkGeneral(u, dt) {
    const L = this.lord;
    const sp = GEN_SPECIALS[u.gen.kind];
    if (sp.cd) {
      u.gen.specCd -= dt;
      if (u.gen.specCd <= 0 && this.genSpecial(u, sp)) u.gen.specCd = sp.cd * (1 - (this.mods.genSpec || 0));
    }
    const far = dist(u, L) > GENERAL_LEASH;
    u.think -= dt;
    if (u.think <= 0 || (u.target && u.target.dead)) {
      u.think = RETARGET;
      u.target = far ? null : this.pickTarget(u, L, 250);
    }
    if (u.target && !far) { this.engage(u, u.target, dt); return; }
    const [ox, oy] = GEN_SLOTS[u.gen.slot];
    this.moveToward(u, L.x + ox * L.face, L.y + oy, dt, 10);
  }

  // A general's special. Returns true when it went off (so the wait starts).
  genSpecial(u, sp) {
    const foes = this.foes();
    const near = r => foes.filter(f => dist(f, u) < r);
    switch (u.gen.kind) {
      case 'cleave': {
        const list = near(sp.radius);
        if (!list.length) return false;
        for (const f of list) this.hurt(f, u.atk * sp.power * this.atkMul(u), u);
        this.events.push({ e: 'ring', x: u.x, y: u.y, r: sp.radius, color: '#ffd54f' });
        return true;
      }
      case 'stun': {
        const list = near(sp.radius);
        if (!list.length) return false;
        for (const f of list) { this.hurt(f, u.atk * sp.power, u); if (!f.dead) f.stun = Math.max(f.stun, sp.stun); }
        this.events.push({ e: 'ring', x: u.x, y: u.y, r: sp.radius, color: '#bfe6ff' });
        return true;
      }
      case 'snipe': {
        const list = foes.filter(f => dist(f, u) < u.range * sp.rangeMult).sort((a, b) => b.maxHp - a.maxHp);
        if (!list.length) return false;
        this.shoot(u, list[0], { kind: 'arrow', dmg: u.atk * sp.power * this.atkMul(u) });
        return true;
      }
      case 'fire': {
        const p = this.crowdPoint(u, 320);
        if (!p) return false;
        this.zones.push({ kind: 'fire', x: p.x, y: p.y, r: sp.radius, t: sp.dur, dps: u.atk * sp.power, slow: sp.slow, side: 'us' });
        return true;
      }
      case 'slow': {
        const list = near(sp.radius);
        if (!list.length) return false;
        for (const f of list) { this.hurt(f, u.atk * sp.power, u); if (!f.dead) { f.slowT = sp.dur; f.slowAmt = Math.max(f.slowAmt || 0, sp.slow); } }
        this.events.push({ e: 'ring', x: u.x, y: u.y, r: sp.radius, color: '#c9a7ff' });
        return true;
      }
      case 'charge': {
        const t = u.target || near(300)[0];
        if (!t) return false;
        const d = dist(u, t) || 1;
        const vx = (t.x - u.x) / d, vy = (t.y - u.y) / d;
        const x0 = u.x, y0 = u.y;
        for (const f of foes) {
          const px = f.x - x0, py = f.y - y0;
          const along = px * vx + py * vy, across = Math.abs(px * vy - py * vx);
          if (along > -10 && along < sp.length && across < sp.width / 2 + f.r) this.hurt(f, u.atk * sp.power * this.atkMul(u), u);
        }
        u.x += vx * Math.min(sp.length, d);
        u.y += vy * Math.min(sp.length, d);
        this.bound(u);
        this.events.push({ e: 'dash', x0, y0, x1: u.x, y1: u.y });
        return true;
      }
      case 'food': {
        const list = this.units.filter(f => f.side === 'us' && this.isActive(f) && dist(f, u) < sp.radius && f.hp < f.maxHp);
        if (!list.length) return false;
        for (const f of list) this.heal(f, f.maxHp * sp.heal);
        this.events.push({ e: 'ring', x: u.x, y: u.y, r: sp.radius, color: '#7dff9a' });
        return true;
      }
      case 'barrage': {
        const list = foes.filter(f => dist(f, u) < u.range * 1.2);
        if (!list.length) return false;
        for (let k = 0; k < sp.shots; k++) this.shoot(u, list[Math.floor(this.r() * list.length)], { kind: 'stone', dmg: u.atk * sp.power, splash: 50 });
        return true;
      }
      default: return false;
    }
  }

  thinkFoe(u, dt) {
    u.think -= dt;
    if (u.think <= 0 || (u.target && !this.isActive(u.target))) {
      u.think = RETARGET;
      if (u.guard) {
        const t = this.pickTarget(u, u, GUARD_AGGRO);
        u.target = t && dist(t, u.home) < GUARD_LEASH ? t : null;
        // a camp wakes up together
        if (u.target && u.camp !== undefined) {
          for (const f of this.units) if (f.guard && f.camp === u.camp && !f.target && !f.dead) { f.target = u.target; f.think = RETARGET; }
        }
      } else u.target = this.pickTarget(u, u, MARCH_AGGRO);
    }
    if (u.target && u.guard && dist(u, u.home) > GUARD_LEASH) u.target = null;
    if (u.target) { this.engage(u, u.target, dt); return; }
    if (u.guard) {
      if (this.moveToward(u, u.home.x, u.home.y, dt, 6)) this.heal(u, u.maxHp * 0.03 * dt);
      return;
    }
    // marching from the castle toward our camp along the main road
    const p = this.layout.main;
    u.march = Math.max(0, (u.march ?? nearestOnPath(p, u.x, u.y).d) - u.speed * this.speedMul(u) * dt);
    const q = pathAt(p, u.march);
    this.moveToward(u, q.x + (u.lane || 0), q.y + (u.lane || 0) * 0.6, dt, 2);
  }

  thinkBoss(u, dt) {
    u.skillCdLeft -= dt;
    u.think -= dt;
    if (u.think <= 0 || (u.target && !this.isActive(u.target))) {
      u.think = RETARGET;
      u.target = this.pickTarget(u, u, 700) || this.lord;
    }
    if (u.skillCdLeft <= 0 && u.target && dist(u, u.target) < 420) {
      u.skillCdLeft = BOSS.skillCd;
      this.bossSkill(u);
    }
    if (u.target) this.engage(u, u.target, dt);
  }

  bossSkill(b) {
    const t = b.target;
    switch (b.bossSkill) {
      case 'charge': {
        const d = dist(b, t) || 1;
        const vx = (t.x - b.x) / d, vy = (t.y - b.y) / d;
        const len = Math.min(300, d);
        const x0 = b.x, y0 = b.y;
        for (const u of this.alive('us')) {
          const px = u.x - x0, py = u.y - y0;
          const along = px * vx + py * vy, across = Math.abs(px * vy - py * vx);
          if (along > -10 && along < len + 20 && across < 50) this.hurt(u, b.atk * 1.6, b);
        }
        b.x += vx * len; b.y += vy * len;
        this.bound(b);
        this.events.push({ e: 'dash', x0, y0, x1: b.x, y1: b.y, foe: true });
        break;
      }
      case 'summon': {
        const mix = Object.keys(this.setup.army.mix);
        for (let k = 0; k < 2; k++) this.addFoe(mix[Math.floor(this.r() * mix.length)], b.x + 30, b.y + (k ? 50 : -50));
        this.events.push({ e: 'ring', x: b.x, y: b.y, r: 90, color: '#ff8a80' });
        break;
      }
      case 'heal':
        // the soldiers around it, not itself (it would outheal a young army forever)
        for (const f of this.foes()) if (f !== b && dist(f, b) < 240) this.heal(f, f.maxHp * 0.2);
        this.events.push({ e: 'ring', x: b.x, y: b.y, r: 240, color: '#7dff9a' });
        break;
      case 'rally':
        for (const f of this.foes()) if (dist(f, b) < 260) f.rallyT = 6;
        this.events.push({ e: 'ring', x: b.x, y: b.y, r: 260, color: '#ffb0a0' });
        break;
      case 'volley': {
        const p = { x: t.x, y: t.y };
        for (const u of this.alive('us')) if (dist(u, p) < 130) this.hurt(u, b.atk * 0.9, b, 'arrow');
        this.events.push({ e: 'volley', x: p.x, y: p.y, r: 130 });
        break;
      }
      default: break;
    }
    this.events.push({ e: 'bossSkill', key: b.bossSkill, x: b.x, y: b.y });
  }

  // ---- upkeep --------------------------------------------------------------------------

  separate() {
    const list = this.units.filter(u => this.isActive(u));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.r + b.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
        const wa = a.kind === 'lord' || a.kind === 'boss' ? 0.3 : 1, wb = b.kind === 'lord' || b.kind === 'boss' ? 0.3 : 1;
        a.x -= ux * push * wa; a.y -= uy * push * wa;
        b.x += ux * push * wb; b.y += uy * push * wb;
      }
      for (const s of this.structs) {
        if (s.dead) continue;
        const dx = a.x - s.x, dy = a.y - s.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = s.r + a.r * 0.6;
        if (d < min) { a.x = s.x + (dx / d) * min; a.y = s.y + (dy / d) * min; }
      }
      this.bound(a);
    }
  }

  stepRegen(dt) {
    const regen = this.buff('regen'), happy = this.buff('happy');
    for (const u of this.units) {
      if (!this.isActive(u) || u.side !== 'us') continue;
      let rate = 0;
      if ((u.kind === 'lord' || u.kind === 'general') && this.t - u.hitT > LORD_STATS.regenDelay) rate += LORD_STATS.regen * (u.kind === 'lord' ? u.regen || 1 : 1);
      if (regen) rate += regen.rate;
      if (happy) rate += happy.rate;
      if (rate > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * rate * dt);
    }
  }

  stepPickups() {
    for (const p of this.pickups) {
      p.t += 1 / 60;
      if (dist(p, this.lord) < 44) {
        p.taken = true;
        this.items[p.key] = (this.items[p.key] || 0) + 1;
        this.found[p.key] = (this.found[p.key] || 0) + 1;
        this.events.push({ e: 'pickup', x: p.x, y: p.y, key: p.key });
      }
    }
    this.pickups = this.pickups.filter(p => !p.taken);
  }

  stepReinforce() {
    if (this.gateDown || this.t < this.reinforceAt) return;
    this.reinforceAt = this.t + this.reinforceEvery;
    const marching = this.foes().filter(f => !f.guard && f.kind === 'squad').length;
    if (this.foes().length >= REINFORCE.maxFoes || marching > 6) return;
    const mix = this.setup.army.mix;
    const types = Object.entries(mix).flatMap(([t, w]) => Array(Math.max(1, Math.round(w))).fill(t));
    const size = 1 + Math.floor(this.n / 7) + (this.r() < 0.5 ? 1 : 0);
    const g = this.layout.gate;
    const start = nearestOnPath(this.layout.main, g.x - 40, g.y).d;
    for (let k = 0; k < size; k++) {
      const t = types[Math.floor(this.r() * types.length)];
      const f = this.addFoe(t, g.x - 50 - k * 30, g.y + (k % 2 ? 30 : -30));
      f.march = start - k * 30;
      f.lane = (k % 3 - 1) * 26;
    }
    this.events.push({ e: 'reinforce', x: g.x, y: g.y });
  }

  // ---- results -----------------------------------------------------------------------

  towersDown() { return this.structs.filter(s => s.kind === 'tower' && s.dead).length; }

  result() {
    const L = this.lord;
    const hpRatio = Math.max(0, L.hp / L.maxHp);
    const stars = !this.won ? 0 : hpRatio >= STAR_HP[1] ? 3 : hpRatio >= STAR_HP[0] ? 2 : 1;
    const ch = { ...this.setup.challenge };
    const used = Object.values(this.itemsUsed).reduce((s, v) => s + v, 0);
    if (this.won) {
      ch.done = {
        noItems: used === 0,
        noType: !this.summoned[ch.type],
        lordHalf: hpRatio > 0.5,
        allTowers: this.towersDown() >= this.towersTotal,
        noGenFall: this.gensFell === 0 && this.setup.generals.length > 0,
        fast: this.t <= (ch.sec || 0),
      }[ch.key] || false;
    } else ch.done = false;
    return {
      stageIdx: this.setup.stageIdx,
      won: this.won,
      reason: this.reason,
      stars,
      lordHp: hpRatio,
      kills: this.kills,
      itemsUsed: { ...this.itemsUsed },
      found: { ...this.found },
      summoned: { ...this.summoned },
      gensFell: this.gensFell,
      towersDown: this.towersDown(),
      towersTotal: this.towersTotal,
      gateDown: this.gateDown,
      time: this.t,
      challenge: ch,
    };
  }
}
