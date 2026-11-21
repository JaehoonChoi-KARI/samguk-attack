// Numbers derived from a save: squad stats, the lord's stats, equipment and talent bonuses,
// the lord's abilities, and the setup object a battle starts from.

import {
  TROOPS, TROOP_KEYS, TROOP_UNLOCK, LORDS, SKILLS, equipFx, cmdPower, leadership, troopLevelMult,
  ITEM_KEYS, diffOf, GENERALS, GEN_SPECIALS, GENERAL_PICKS, GENERAL_HP, GENERAL_ATK, generalsOf,
  weatherKey, stageChallenge, lordHpAt, lordAtkAt, LORD_WEAPONS,
} from './data.js';
import { stageLayout } from './maps.js';
import { stageArmy } from './camps.js';
import { talentFx, skillLevel } from './talents.js';

// Equipment and talents add up into one set of bonuses.
export function equipTotals(save) {
  const tot = talentFx(save);
  for (const slot of ['weapon', 'armor', 'treasure']) {
    const key = save.equipped[slot];
    const it = key && save.equips.find(e => e.key === key);
    if (!it) continue;
    for (const [k, v] of Object.entries(equipFx(key, it.up))) tot[k] = (tot[k] || 0) + v;
  }
  return tot;
}

export function troopStats(save, type) {
  const T = TROOPS[type];
  const tf = LORDS[save.lord].traitFx;
  const fx = equipTotals(save);
  const lv = save.troops[type] || 1;
  const m = troopLevelMult(lv);
  const hpM = 1 + (tf.troopHp || 0) + (fx.troopHp || 0) + (fx[`hp_${type}`] || 0);
  let atkM = 1 + (fx.troopAtk || 0) + (fx[`atk_${type}`] || 0);
  let rangeM = 1 + (fx[`range_${type}`] || 0);
  if (!T.melee) {
    atkM += tf.rangedAtk || 0;
    rangeM += tf.rangedRange || 0;
  }
  if (type === 'strategist') atkM += fx.stratAtk || 0;
  return {
    hp: Math.round(T.hp * m * hpM),
    atk: T.atk * m * atkM,
    cd: T.cd,
    range: T.melee ? T.reach : Math.round(T.range * rangeM),
    speed: T.speed,
    summonCd: T.summonCd * (1 - Math.min(0.5, (fx.summonCd || 0) + (tf.summonCd || 0))),
    lead: T.lead,
    lv,
  };
}

// The lord on the field: health, one swing (or arrow), speed and weapon.
export function lordStats(save) {
  const L = LORDS[save.lord];
  const tf = L.traitFx;
  const fx = equipTotals(save);
  const W = LORD_WEAPONS[L.weapon];
  return {
    weapon: L.weapon,
    hp: Math.round(lordHpAt(save.level) * (1 + (fx.lordHp || 0) + 0.5 * (fx.troopHp || 0))),
    atk: lordAtkAt(save.level) * W.mult * (1 + (fx.lordAtk || 0) + (tf.lordAtk || 0) + 0.5 * (fx.troopAtk || 0)),
    def: Math.min(0.5, 0.5 * (fx.troopDef || 0)),
    regen: tf.regen || 1,
  };
}

export const lordLeadership = save => leadership(save.level) + (equipTotals(save).lead || 0);
export const troopUnlocked = (save, t) => save.progress >= TROOP_UNLOCK[t];
export const unlockedTroops = save => TROOP_KEYS.filter(t => troopUnlocked(save, t));

// The lord's three abilities: { key, lv, cd, power } or null while still locked.
export function skillList(save) {
  const fx = equipTotals(save);
  return LORDS[save.lord].skills.map((key, i) => {
    const lv = skillLevel(save, i);
    if (!lv) return null;
    const def = SKILLS[key];
    return { key, lv, cd: def.cd * (1 - Math.min(0.5, fx.skillCd || 0)), power: def.power(lv) * (1 + (fx.skillDmg || 0)) };
  });
}

export function battleSetup(save, stageIdx, stage, opts = {}) {
  const n = stageIdx + 1;
  const layout = stageLayout(n, stage);
  const D = diffOf(save);
  const fx = equipTotals(save);
  const tf = LORDS[save.lord].traitFx;
  const troops = {};
  for (const t of unlockedTroops(save)) troops[t] = troopStats(save, t);
  const items = {};
  for (const k of ITEM_KEYS) items[k] = Math.min(save.items[k] || 0, save.carry[k] || 0);
  return {
    n,
    stage,
    stageIdx,
    seed: opts.seed || 'play',
    level: save.level,
    weather: weatherKey(stage),
    challenge: stageChallenge(stage, n),
    diff: D,
    lordKey: save.lord,
    layout,
    army: stageArmy(stage, n, layout),
    power: cmdPower(save.level),
    lord: lordStats(save),
    troops,
    lead: lordLeadership(save),
    items,
    skills: skillList(save),
    generals: pickedGenerals(save).map(k => generalStats(save, k)),
    mods: {
      skillDur: fx.skillDur || 0,
      counter: fx.counter || 0,
      genSpec: Math.min(0.5, fx.genSpec || 0),
      genRecover: fx.genRecover || 0,
      troopDef: Math.min(0.5, fx.troopDef || 0),
      aura: fx.aura || 0,
      regen: tf.regen || 1,
    },
  };
}

// ---- generals ---------------------------------------------------------------------

export const generalUnlocked = (save, key) => GENERALS[key].faction === LORDS[save.lord].faction && save.progress >= GENERALS[key].unlock;
export const unlockedGenerals = save => generalsOf(LORDS[save.lord].faction).filter(k => generalUnlocked(save, k));
export const pickedGenerals = save => (save.picks || []).filter(k => GENERALS[k] && generalUnlocked(save, k)).slice(0, GENERAL_PICKS);

// A general fights like a very strong squad of its troop type and grows with the lord's level.
export function generalStats(save, key) {
  const G = GENERALS[key];
  const base = troopStats({ ...save, troops: { ...save.troops, [G.type]: save.level } }, G.type);
  const sp = GEN_SPECIALS[G.kind];
  const gp = 1 + (equipTotals(save).genPower || 0);
  return {
    key,
    type: G.type,
    kind: G.kind,
    hp: Math.round(base.hp * GENERAL_HP * gp),
    atk: base.atk * GENERAL_ATK * gp,
    cd: base.cd,
    range: TROOPS[G.type].melee ? base.range + 6 : Math.round(base.range * 1.1),
    speed: Math.max(150, base.speed),
    block: TROOPS[G.type].melee ? (G.kind === 'guard' ? sp.block : 3) : 0,
    dr: G.kind === 'guard' ? sp.dr : 0,
  };
}
