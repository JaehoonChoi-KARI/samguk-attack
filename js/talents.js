// Lord talents (특성): a point for every lord level after the first, spent in three trees.
// A row opens once enough points sit in the rows above it in the same tree, and every point
// can be taken back for free outside battle, so the player decides where the few points go.

import { SKILLS, LORDS, SKILL_UNLOCK, MAX_SKILL_LEVEL, pct } from './data.js';

export const TALENT_ROWS = [0, 3, 6, 10]; // points needed in the rows above to open each row

const troopFx = (types, key, v) => Object.fromEntries(types.map(t => [`${key}_${t}`, v]));

// fx is per point; say(total fx) describes the node at a given number of points.
export const TALENT_TREES = [
  {
    key: 'lord', name: '군주', icon: '👑', desc: '군주의 특수능력을 강하게',
    nodes: [
      { key: 'sk1', row: 0, max: MAX_SKILL_LEVEL - 1, skill: 0 },
      { key: 'longCmd', row: 0, max: 3, icon: '⏳', name: '긴 호령', fx: { skillDur: 0.1 }, say: f => `특수능력 지속 시간 +${pct(f.skillDur)}` },
      { key: 'sk2', row: 1, max: MAX_SKILL_LEVEL - 1, skill: 1 },
      { key: 'aura', row: 1, max: 3, icon: '🏯', name: '군주의 위엄', fx: { aura: 0.05 }, say: f => `군주 가까이 있는 부대·장수 공격 +${pct(f.aura)}` },
      { key: 'sk3', row: 2, max: MAX_SKILL_LEVEL - 1, skill: 2 },
      { key: 'skillCd', row: 2, max: 3, icon: '⏱️', name: '신속한 지휘', fx: { skillCd: 0.07 }, say: f => `특수능력 대기 시간 -${pct(f.skillCd)}` },
      { key: 'mandate', row: 3, max: 1, icon: '🌟', name: '천명', fx: { skillDmg: 0.2, skillDur: 0.2 }, say: () => '특수능력 효과 +20%, 지속 시간 +20%' },
    ],
  },
  {
    key: 'troop', name: '병종', icon: '⚔️', desc: '데려가는 부대를 강하게',
    nodes: [
      { key: 'meleeHp', row: 0, max: 3, icon: '🛡️', name: '근접 단련', fx: troopFx(['infantry', 'spear', 'cavalry'], 'hp', 0.06), say: f => `보병·창병·기마병 체력 +${pct(f.hp_infantry)}` },
      { key: 'rangedAtk', row: 0, max: 3, icon: '🎯', name: '원거리 단련', fx: troopFx(['archer', 'strategist', 'catapult'], 'atk', 0.05), say: f => `궁수·책사·투석기 공격 +${pct(f.atk_archer)}` },
      { key: 'eliteFoot', row: 1, max: 3, icon: '🗡️', name: '보병·창병 정예', fx: troopFx(['infantry', 'spear'], 'atk', 0.08), say: f => `보병·창병 공격 +${pct(f.atk_infantry)}` },
      { key: 'eliteBow', row: 1, max: 3, icon: '🏹', name: '궁수 정예', fx: { atk_archer: 0.08, range_archer: 0.04 }, say: f => `궁수 공격 +${pct(f.atk_archer)}, 사거리 +${pct(f.range_archer)}` },
      { key: 'eliteHorse', row: 2, max: 3, icon: '🐎', name: '기마병 정예', fx: { atk_cavalry: 0.08, hp_cavalry: 0.08 }, say: f => `기마병 공격·체력 +${pct(f.atk_cavalry)}` },
      { key: 'eliteSiege', row: 2, max: 3, icon: '🔥', name: '책사·투석기 정예', fx: troopFx(['strategist', 'catapult'], 'atk', 0.08), say: f => `책사·투석기 공격 +${pct(f.atk_strategist)}` },
      { key: 'counter', row: 3, max: 1, icon: '♟️', name: '상성 달인', fx: { counter: 0.2 }, say: () => '상성으로 이기는 적에게 주는 피해 +20%' },
    ],
  },
  {
    key: 'plan', name: '전략', icon: '📜', desc: '군주의 몸과 장수, 통솔력',
    nodes: [
      { key: 'lordHp', row: 0, max: 3, icon: '❤️', name: '강인한 몸', fx: { lordHp: 0.1 }, say: f => `군주 체력 +${pct(f.lordHp)}` },
      { key: 'quick', row: 0, max: 3, icon: '📣', name: '빠른 소집', fx: { summonCd: 0.06 }, say: f => `부대 부르기 대기 -${pct(f.summonCd)}` },
      { key: 'lordAtk', row: 1, max: 3, icon: '🗡️', name: '무예 수련', fx: { lordAtk: 0.1 }, say: f => `군주 공격 +${pct(f.lordAtk)}` },
      { key: 'honor', row: 1, max: 3, icon: '🏅', name: '장수 우대', fx: { genPower: 0.08 }, say: f => `장수 체력·공격 +${pct(f.genPower)}` },
      { key: 'command', row: 2, max: 3, icon: '🚩', name: '통솔', fx: { lead: 2 }, say: f => `통솔력 +${f.lead}` },
      { key: 'secret', row: 2, max: 3, icon: '📯', name: '장수 비기', fx: { genSpec: 0.08 }, say: f => `장수 특수 능력 대기 -${pct(f.genSpec)}` },
      { key: 'rally', row: 3, max: 1, icon: '⚡', name: '명장의 귀환', fx: { genRecover: 10 }, say: () => '쓰러진 장수가 돌아오는 시간 25초 → 15초' },
    ],
  },
];

export const TALENTS = Object.fromEntries(TALENT_TREES.flatMap(t => t.nodes.map(n => [n.key, { ...n, tree: t.key }])));
export const TALENT_KEYS = Object.keys(TALENTS);

// Nodes renamed between versions: their points move to the new key (none yet).
export const TALENT_RENAMED = {};

// The order the 추천 button (and the balance bot) spends points in: abilities first, then the
// lord's body, then troops.
export const TALENT_PLAN = [
  'sk1', 'sk1', 'longCmd', 'sk2', 'sk2', 'sk1', 'sk2', 'aura', 'sk3', 'sk3', 'sk3', 'sk1', 'sk2', 'sk3',
  'lordHp', 'lordHp', 'skillCd', 'skillCd', 'skillCd', 'mandate', 'meleeHp', 'rangedAtk', 'longCmd', 'aura', 'meleeHp', 'rangedAtk',
  'lordHp', 'quick', 'longCmd', 'aura', 'meleeHp', 'rangedAtk',
  ...TALENT_KEYS,
];

// Name and icon of a node; skill nodes take them from the lord's skill.
export function talentLabel(lord, key) {
  const n = TALENTS[key];
  if (n.skill === undefined) return { icon: n.icon, name: n.name };
  const def = SKILLS[LORDS[lord].skills[n.skill]];
  return { icon: def.icon, name: def.name };
}

export function talentFxAt(key, r) {
  const n = TALENTS[key];
  const out = {};
  for (const [k, v] of Object.entries(n.fx || {})) out[k] = v * r;
  return out;
}

// What a node does with r points in it.
export function talentText(lord, key, r) {
  const n = TALENTS[key];
  if (n.skill !== undefined) {
    const def = SKILLS[LORDS[lord].skills[n.skill]];
    return `특수능력 Lv ${1 + r}: ${def.desc(1 + r)}`;
  }
  return n.say(talentFxAt(key, Math.max(1, r)));
}

export const talentPoints = save => Math.max(0, save.level - 1);
export const talentSpent = save => TALENT_KEYS.reduce((s, k) => s + (save.talents?.[k] || 0), 0);
export const freePoints = save => talentPoints(save) - talentSpent(save);
export const treeSpent = (save, tree, belowRow = 99) =>
  TALENT_TREES.find(t => t.key === tree).nodes.reduce((s, n) => s + (n.row < belowRow ? save.talents?.[n.key] || 0 : 0), 0);

// Why a point cannot go into this node right now ('' when it can).
export function addBlock(save, key) {
  const n = TALENTS[key];
  const r = save.talents[key] || 0;
  if (r >= n.max) return 'max';
  if (n.skill !== undefined && save.level < SKILL_UNLOCK[n.skill]) return 'skill';
  if (treeSpent(save, n.tree, n.row) < TALENT_ROWS[n.row]) return 'row';
  if (freePoints(save) <= 0) return 'points';
  return '';
}

// A point can come back out as long as every deeper row stays open.
export function canRemove(save, key) {
  const n = TALENTS[key];
  if (!(save.talents[key] > 0)) return false;
  const t = { ...save.talents, [key]: save.talents[key] - 1 };
  const tree = TALENT_TREES.find(x => x.key === n.tree);
  return tree.nodes.every(m => !(t[m.key] > 0) || treeSpent({ talents: t }, n.tree, m.row) >= TALENT_ROWS[m.row]);
}

export function addTalent(save, key) {
  if (addBlock(save, key)) return false;
  save.talents[key] = (save.talents[key] || 0) + 1;
  return true;
}

export function removeTalent(save, key) {
  if (!canRemove(save, key)) return false;
  save.talents[key]--;
  if (!save.talents[key]) delete save.talents[key];
  return true;
}

export function resetTalents(save) { save.talents = {}; }

// Spends every free point along TALENT_PLAN (or another order of keys).
export function autoTalents(save, plan = TALENT_PLAN) {
  for (let guard = 0; freePoints(save) > 0 && guard < 200; guard++) {
    const want = {};
    let done = false;
    for (const k of plan) {
      want[k] = (want[k] || 0) + 1;
      if ((save.talents[k] || 0) >= want[k]) continue;
      if (addTalent(save, k)) { done = true; break; }
    }
    if (!done) break;
  }
}

// Throws away anything a save cannot have (unknown nodes, too many points, closed rows).
export function cleanTalents(save) {
  const t = {};
  const src = { ...save.talents };
  for (const [from, to] of Object.entries(TALENT_RENAMED)) {
    if (src[from] && !src[to]) src[to] = src[from];
    delete src[from];
  }
  for (const k of TALENT_KEYS) {
    const v = Math.floor(src[k] || 0);
    if (v > 0) t[k] = Math.min(v, TALENTS[k].max);
  }
  save.talents = t;
  const ok = freePoints(save) >= 0 && TALENT_KEYS.every(k => !t[k] ||
    (treeSpent(save, TALENTS[k].tree, TALENTS[k].row) >= TALENT_ROWS[TALENTS[k].row] &&
     (TALENTS[k].skill === undefined || save.level >= SKILL_UNLOCK[TALENTS[k].skill])));
  if (!ok) save.talents = {};
  return ok;
}

// Sum of every talent's fx.
export function talentFx(save) {
  const out = {};
  for (const [k, r] of Object.entries(save.talents || {})) {
    for (const [f, v] of Object.entries(talentFxAt(k, r))) out[f] = (out[f] || 0) + v;
  }
  return out;
}

// Skill level: 1 once learned, plus the points in its talent.
export function skillLevel(save, i) {
  if (save.level < SKILL_UNLOCK[i]) return 0;
  return Math.min(MAX_SKILL_LEVEL, 1 + (save.talents?.[`sk${i + 1}`] || 0));
}
