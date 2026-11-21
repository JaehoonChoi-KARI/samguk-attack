// The auto-player: drives a Sim the way a sensible kid would (walk toward the enemy, swing,
// call squads that beat the enemy in front, use abilities on crowds). Used by the autotest
// and the balance page. Also builds "a typical save at stage n" for measurements.

import {
  TROOPS, TROOP_KEYS, counterMult, LORD_WEAPONS, stageGold, troopUpCost, TROOP_UNLOCK, MAX_TROOP_LEVEL,
  EQUIPS, DIFFS, GENERALS, LORDS, generalsOf,
} from './data.js';
import { Sim } from './sim.js';
import { defaultSave } from './save.js';
import { autoTalents } from './talents.js';
import { STORIES } from './stories.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Bot {
  constructor(sim, { items = true } = {}) {
    this.sim = sim;
    this.items = items;
    this.thinkT = 0;
  }

  act(dt) {
    const sim = this.sim;
    const L = sim.lord;
    if (L.dead || sim.over) return;
    const W = LORD_WEAPONS[L.weapon];
    const reach = W.range || W.reach;
    const foes = sim.foes();
    const hostiles = sim.hostiles('us');
    const near = r => foes.filter(f => dist(f, L) < r);
    const hp = L.hp / L.maxHp;

    // where to stand: a little behind our front line, close enough to hit
    let goal = null;
    const closeFoe = foes.filter(f => dist(f, L) < 420).sort((a, b) => dist(a, L) - dist(b, L))[0];
    const target = closeFoe || sim.nextObjective(L);
    if (target) goal = target;
    const squads = sim.ourSquads();
    const front = squads.reduce((m, u) => Math.max(m, u.x), L.x);
    let mx = 0, my = 0;
    if (hp < 0.3 && near(220).length) {
      mx = -1; // step back toward the army while hurt
      my = 0;
    } else if (goal) {
      const want = (W.range ? reach * 0.75 : reach * 0.6) + (goal.r || 0);
      const d = dist(L, goal);
      const wait = squads.length < 2 && goal.x > L.x + 250 && sim.leadUsed() < sim.setup.lead - 2;
      if (d > want && !wait && !(goal.x > front + 160 && squads.length >= 2)) {
        mx = (goal.x - L.x) / d;
        my = (goal.y - L.y) / d;
      } else if (d < want * 0.5 && W.range) {
        mx = -(goal.x - L.x) / d * 0.6;
        my = -(goal.y - L.y) / d * 0.6;
      }
    }
    sim.input.mx = mx;
    sim.input.my = my;
    sim.input.attack = hostiles.some(h => dist(h, L) - (h.r || 0) < reach + 10);

    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.25;

    // squads: whatever beats the enemy in front best, keeping a melee wall
    const ahead = (closeFoe || foes.filter(f => f.x > L.x - 100).sort((a, b) => a.x - b.x)[0]);
    const foeType = ahead?.type || Object.keys(sim.setup.army.mix)[0];
    const types = Object.keys(sim.setup.troops).filter(t => sim.summonCd[t] <= 0 && sim.leadUsed() + sim.setup.troops[t].lead <= sim.setup.lead);
    if (types.length) {
      const melee = squads.filter(u => TROOPS[u.type].melee).length;
      types.sort((a, b) => {
        const s = t => counterMult(t, foeType) * 10 + (melee < 2 && TROOPS[t].melee ? 6 : 0) + (sim.structs.some(st => !st.dead && dist(st, L) < 500) && t === 'catapult' ? 4 : 0);
        return s(b) - s(a);
      });
      sim.summon(types[0]);
    }

    // abilities
    const crowd = near(340).length;
    const boss = sim.boss && !sim.boss.dead && dist(sim.boss, L) < 450;
    sim.setup.skills.forEach((sk, i) => {
      if (!sk || sim.skillCd[i] > 0) return;
      if (sk.key === 'lb_heal') { if (hp < 0.55) sim.useSkill(i); return; }
      if (sk.key === 'lb_oath') { if (sim.units.some(u => u.gen && u.gen.down > 0) || boss) sim.useSkill(i); return; }
      if (crowd >= 3 || boss) sim.useSkill(i);
    });

    // items
    if (!this.items) return;
    if (sim.items.happy > 0 && hp < 0.4 && crowd) sim.useItem('happy');
    if (sim.items.scroll > 0 && (boss || crowd >= 6)) sim.useItem('scroll');
    if (sim.items.bomb > 0 && crowd >= 3) {
      const threat = near(300).filter(f => f.kind === 'squad').sort((a, b) => b.atk - a.atk)[0];
      if (threat) sim.useItem('bomb', threat.type);
    }
  }
}

// Plays a battle to the end without drawing. Returns the Sim's result (+ timeout flag).
export function autoplay(setup, { dt = 1 / 30, maxTime = 900, items = true } = {}) {
  const sim = new Sim(setup);
  const bot = new Bot(sim, { items });
  while (!sim.over && sim.t < maxTime) {
    bot.act(dt);
    sim.step(dt);
    sim.events.length = 0;
  }
  const r = sim.result();
  if (!sim.over) r.timeout = true;
  return r;
}

// ---- a typical save for stage n (1..20), for tests and balance measurements -----------

// A player who cleared stages 1..n-1 once with about 2.5 stars, kept a few items, spent the
// rest of the gold evenly on the troop types they have and brings their four newest generals.
export function expectedSave(lord, n, diff = 1, { levelBonus = 0, troopBonus = 0, talents = 'plan' } = {}) {
  const s = defaultSave(lord);
  s.diff = diff;
  s.level = Math.max(1, n + levelBonus);
  s.progress = n - 1;
  s.talents = {};
  if (talents !== 'none') autoTalents(s, talents === 'plan' ? undefined : talents);
  let gold = 150;
  for (let k = 1; k < n; k++) gold += stageGold(k) * DIFFS[diff].gold * 1.62;
  gold -= (n - 1) * 110; // items
  gold *= 0.88; // a bit goes to equipment
  const types = TROOP_KEYS.filter(t => TROOP_UNLOCK[t] <= s.progress);
  for (;;) {
    types.sort((a, b) => s.troops[a] - s.troops[b]);
    const t = types[0];
    if (s.troops[t] >= MAX_TROOP_LEVEL) break;
    const c = troopUpCost(s.troops[t]);
    if (c > gold) break;
    gold -= c;
    s.troops[t]++;
  }
  for (const t of types) s.troops[t] = Math.min(MAX_TROOP_LEVEL, s.troops[t] + troopBonus);
  const stages = STORIES[lord].stages;
  for (let k = 0; k < n - 1; k++) {
    const key = stages[k].reward;
    if (key && !s.equips.some(e => e.key === key)) s.equips.push({ key, up: 0 });
  }
  for (const e of s.equips) e.up = Math.min(5, Math.floor(n / 3));
  for (const slot of ['weapon', 'armor', 'treasure']) {
    const best = s.equips.filter(e => EQUIPS[e.key].slot === slot).sort((a, b) => EQUIPS[b.key].g - EQUIPS[a.key].g)[0];
    s.equipped[slot] = best ? best.key : null;
  }
  s.picks = generalsOf(LORDS[lord].faction).filter(k => GENERALS[k].unlock <= s.progress).sort((a, b) => GENERALS[b].unlock - GENERALS[a].unlock).slice(0, 4);
  s.items = { bomb: 2, happy: 1, scroll: 0 };
  s.carry = { bomb: 2, happy: 1, scroll: 0 };
  s.stages.forEach((st, i) => { if (i < n - 1) { st.clears = 1; st.stars = 2; } });
  s.gold = Math.max(0, Math.round(gold));
  return s;
}
