// Game rules and numbers: troop types and counters, the lord who fights on the field, the
// lords' special abilities, generals, enemy camps and castles, equipment, items and growth
// formulas. Balance knobs live here.

export const VERSION = '1.0.0'; // keep in sync with CACHE in sw.js
export const GAME_NAME = '천하통일 어택';
export const STAGE_COUNT = 20;
export const MAX_LORD_LEVEL = 30;
export const MAX_TROOP_LEVEL = 20;
export const MAX_SKILL_LEVEL = 5;
export const MAX_ENHANCE = 10;
export const ITEM_CARRY_MAX = 3;

// ---- Troops (both armies use the same six types) ------------------------------

export const TROOP_KEYS = ['infantry', 'spear', 'cavalry', 'archer', 'strategist', 'catapult'];

// Our squads, called onto the field with keys 1~6 next to the lord.
// summonCd = seconds before that type can be called again (the kid's plan, 1차).
// lead = 통솔력 a squad on the field takes; when it falls the room comes back.
// reach = how close a melee squad gets to hit; range = how far a ranged squad shoots.
// speed = how fast it walks. block = how many enemies a melee squad can hold at once
// (enemies held stop and fight it instead of walking past).
export const TROOPS = {
  infantry: {
    name: '보병', short: '보병', key: '1', melee: true, summonCd: 3, lead: 2,
    hp: 430, atk: 12, cd: 1.0, reach: 34, speed: 82, block: 3,
    trait: { icon: '🛡️', name: '방패벽', dr: 0.12, arrowDr: 0.5, text: '방패로 받는 피해를 줄여요 (화살은 절반)' },
    desc: '칼과 방패. 앞에서 오래 버텨요.',
  },
  spear: {
    name: '창병', short: '창병', key: '2', melee: true, summonCd: 3, lead: 2,
    hp: 290, atk: 12, cd: 1.4, reach: 62, speed: 82, block: 2,
    trait: { icon: '🔱', name: '긴 창', pierce: 3, text: '창이 길어 적이 닿기 전에 먼저 찌르고, 한 번에 3명까지 꿰뚫어요' },
    desc: '긴 창으로 찔러요. 기마병을 잘 막아요.',
  },
  cavalry: {
    name: '기마병', short: '기마', key: '3', melee: true, summonCd: 4.5, lead: 3,
    hp: 330, atk: 28, cd: 1.1, reach: 38, speed: 150, block: 1,
    trait: { icon: '🐎', name: '돌격', charge: 1.6, text: '빠르게 달려가 처음 부딪히는 적을 1.6배로 들이받아요' },
    desc: '빠르게 달려 나가 강하게 들이받아요.',
  },
  archer: {
    name: '궁수', short: '궁수', key: '4', melee: false, summonCd: 3.5, lead: 2,
    hp: 160, atk: 16, cd: 0.8, range: 220, speed: 76,
    role: '한 명씩 빠르게',
    trait: { icon: '🏹', name: '속사', text: '0.8초마다 빠르게 쏴요' },
    desc: '멀리 있는 적을 빠르게 쏴요.',
  },
  strategist: {
    name: '책사', short: '책사', key: '5', melee: false, summonCd: 5, lead: 3,
    hp: 150, atk: 20, cd: 2.2, range: 200, speed: 72, splash: 52, burn: 0.5, slow: 0.3,
    role: '불로 둘레 여럿을',
    trait: { icon: '🔥', name: '화계', text: '불을 던져 둘레의 적까지 태우고, 맞은 적은 잠깐 느려져요' },
    desc: '책략으로 불을 질러요. 맞은 적은 불타고 느려져요.',
  },
  catapult: {
    name: '투석기', short: '투석', key: '6', melee: false, summonCd: 6, lead: 4,
    hp: 210, atk: 23, cd: 3.2, range: 300, speed: 52, splash: 66, siege: 2.5,
    role: '가장 멀리, 여럿을',
    trait: { icon: '🪨', name: '바위 세례', text: '가장 멀리 던져 여럿을 한꺼번에 때리고, 망루와 성문에는 2.5배' },
    desc: '아주 멀리 큰 돌을 던져요. 망루와 성문을 잘 부숴요.',
  },
};

// How far a squad notices enemies around itself (돌격 mode), and around the lord (모여라 mode).
export const AGGRO = 330;
export const RALLY_AGGRO = 230;
// Squads in 돌격 mode never run more than this far ahead of the lord.
export const AHEAD_MAX = 650;

// Counters: each type is very strong against one type and strong against another, and the
// mirror for weak. The very-strong links form one ring a kid can remember:
// 창병 ⇒ 기마병 ⇒ 궁수 ⇒ 책사 ⇒ 투석기 ⇒ 보병 ⇒ 창병.
export const STRONG = { // [very strong, strong]
  spear: ['cavalry', 'catapult'],
  cavalry: ['archer', 'infantry'],
  archer: ['strategist', 'spear'],
  strategist: ['catapult', 'cavalry'],
  catapult: ['infantry', 'archer'],
  infantry: ['spear', 'strategist'],
};
export const RING = ['spear', 'cavalry', 'archer', 'strategist', 'catapult', 'infantry'];
// Why, in words a kid remembers (shown in the counter chart).
export const STRONG_WHY = {
  'spear>cavalry': '긴 창으로 말을 막아요',
  'spear>catapult': '투석기에 달려들어 부숴요',
  'cavalry>infantry': '말을 타고 짓밟아요',
  'cavalry>archer': '빠르게 궁수를 덮쳐요',
  'infantry>spear': '방패로 막고 창 안쪽으로 파고들어요',
  'infantry>strategist': '책사를 붙잡아요',
  'archer>strategist': '약한 책사를 노려 쏴요',
  'archer>spear': '방패 없는 창병에게 화살 비',
  'strategist>catapult': '화계로 나무 투석기를 태워요',
  'strategist>cavalry': '함정과 매복으로 말을 묶어요',
  'catapult>archer': '모여 있는 궁수에게 바위',
  'catapult>infantry': '무거운 보병 대열에 바위',
};
// level: 2 아주 강함, 1 강함, 0 보통, -1 약함, -2 아주 약함
export const COUNTER_MULT = { 2: 2.0, 1: 1.4, 0: 1, '-1': 0.7, '-2': 0.5 };
export const COUNTER_MARK = { 2: '▲▲', 1: '▲', 0: '', '-1': '▼', '-2': '▼▼' };
export const COUNTER_NAME = { 2: '아주 강함', 1: '강함', 0: '보통', '-1': '약함', '-2': '아주 약함' };

export function counterLevel(att, def) {
  if (!att || !def || !STRONG[att] || !STRONG[def]) return 0;
  const a = STRONG[att].indexOf(def);
  if (a >= 0) return a === 0 ? 2 : 1;
  const d = STRONG[def].indexOf(att);
  if (d >= 0) return d === 0 ? -2 : -1;
  return 0;
}
export const counterMult = (att, def) => COUNTER_MULT[counterLevel(att, def)];
// Who beats t, the very strong one first.
export const weakTo = t => [...TROOP_KEYS.filter(k => STRONG[k][0] === t), ...TROOP_KEYS.filter(k => STRONG[k][1] === t)];

// Number of first-time stage clears needed before a troop type can be called.
export const TROOP_UNLOCK = { infantry: 0, archer: 0, spear: 2, cavalry: 3, strategist: 5, catapult: 7 };

// For the ▲ marks: how well type t does against the strongest-countered of `foes`.
export const bestLevel = (t, foes) => foes.reduce((m, f) => Math.max(m, counterLevel(t, f)), 0);
// Counter lines for one type: [[other, level], ...], very strong / very weak first.
export const relations = t => ({
  good: STRONG[t].map((x, i) => [x, i === 0 ? 2 : 1]),
  bad: weakTo(t).map(x => [x, counterLevel(t, x)]),
});

export const troopLevelMult = lv => 1 + 0.12 * (lv - 1);
export const troopUpCost = lv => Math.round(80 * 1.18 ** (lv - 1)); // gold for lv → lv+1

// ---- The lord on the field -------------------------------------------------------
// The lord walks with the arrow keys and fights with Space. If the lord falls the battle is lost.
// atk is one swing (or one arrow for a bow lord); a swing hits up to `hits` enemies in front.

export const LORD_STATS = {
  hp: 1300, hpUp: 0.07, atk: 30, atkUp: 0.07, speed: 175,
  regenDelay: 4, regen: 0.015, // of max HP per second after this many seconds without being hit
};
export const LORD_WEAPONS = {
  sword: { cd: 0.42, reach: 78, hits: 5, mult: 1 },
  twin: { cd: 0.36, reach: 72, hits: 5, mult: 0.9 },
  bow: { cd: 0.4, range: 320, pierce: 2, mult: 0.85 },
};
export const lordHpAt = lv => LORD_STATS.hp * (1 + LORD_STATS.hpUp * (lv - 1));
export const lordAtkAt = lv => LORD_STATS.atk * (1 + LORD_STATS.atkUp * (lv - 1));

// ---- Generals (bodyguards) ---------------------------------------------------------
// Up to four come along and walk beside the lord, fight on their own and use their special
// by themselves. They join as the lord's story goes on (unlock = first-time clears needed)
// and grow with the lord's level. A fallen general comes back after GENERAL_RECOVER seconds.

export const GENERAL_PICKS = 4;
export const GENERAL_RECOVER = 25;
export const GENERAL_HP = 2.0; // × the troop type's squad stats at the lord's level
export const GENERAL_ATK = 1.8;
export const GENERAL_LEASH = 300; // a general never strays further than this from the lord

export const GEN_SPECIALS = {
  cleave: { cd: 8, radius: 100, power: 3, text: '8초마다 주변 적을 한꺼번에 베어요 (공격력 3배)' },
  stun: { cd: 12, radius: 140, stun: 2, power: 1, text: '12초마다 주변 적을 2초 동안 얼어붙게 해요' },
  snipe: { cd: 7, rangeMult: 1.6, power: 5, text: '7초마다 아주 멀리 있는 가장 강한 적을 저격해요 (공격력 5배)' },
  fire: { cd: 12, radius: 95, dur: 5, power: 0.45, slow: 0.3, text: '12초마다 적이 몰린 곳에 불을 질러요 (5초 동안 불바다)' },
  slow: { cd: 10, slow: 0.45, dur: 4, power: 0.8, radius: 260, text: '10초마다 둘레의 모든 적을 4초 동안 느리게 해요' },
  multishot: { targets: 3, text: '한 번에 적 3명까지 공격해요' },
  guard: { block: 5, dr: 0.35, text: '적을 5명까지 막고, 받는 피해가 35% 줄어요' },
  charge: { cd: 10, length: 260, width: 60, power: 3, text: '10초마다 앞으로 돌격해 지나가는 적을 쳐요 (공격력 3배)' },
  rally: { radius: 220, atk: 0.25, text: '주변 아군의 공격력이 25% 올라요' },
  food: { cd: 8, radius: 260, heal: 0.06, text: '8초마다 둘레의 아군과 군주 체력을 6% 회복해요 (보급)' },
  barrage: { cd: 10, shots: 5, power: 1, text: '10초마다 돌 5개를 한꺼번에 날려요' },
};

export const GENERALS = {
  // 촉 (유비)
  guanyu: { name: '관우', faction: 'shu', type: 'infantry', unlock: 0, kind: 'cleave', skill: '청룡참', letter: '관', desc: '청룡언월도를 든 의리의 장수' },
  zhangfei: { name: '장비', faction: 'shu', type: 'spear', unlock: 0, kind: 'stun', skill: '장판교 호통', letter: '장', desc: '고함 한 번에 적이 얼어붙는 맹장' },
  zhaoyun: { name: '조운', faction: 'shu', type: 'cavalry', unlock: 8, kind: 'multishot', skill: '칠진칠출', letter: '조', desc: '적진을 일곱 번 드나든 상산의 조자룡' },
  zhugeliang: { name: '제갈량', faction: 'shu', type: 'strategist', unlock: 9, kind: 'slow', skill: '팔진도', letter: '제', desc: '와룡 선생, 촉의 군사' },
  pangtong: { name: '방통', faction: 'shu', type: 'strategist', unlock: 13, kind: 'fire', skill: '연환계', letter: '방', desc: '봉추 선생, 적벽에서 연환계를 낸 책사' },
  huangzhong: { name: '황충', faction: 'shu', type: 'archer', unlock: 14, kind: 'snipe', skill: '백보천양', letter: '황', desc: '백 걸음 밖 버들잎도 맞히는 노장' },
  weiyan: { name: '위연', faction: 'shu', type: 'spear', unlock: 14, kind: 'rally', skill: '선봉장의 기세', letter: '위', desc: '언제나 앞장서는 용맹한 선봉장' },
  machao: { name: '마초', faction: 'shu', type: 'cavalry', unlock: 16, kind: 'charge', skill: '서량 철기', letter: '마', desc: '서량의 비단 마초, 금마초' },
  // 위 (조조)
  xiahoudun: { name: '하후돈', faction: 'wei', type: 'infantry', unlock: 0, kind: 'cleave', skill: '외눈의 맹장', letter: '돈', desc: '조조의 가장 믿음직한 장수' },
  xiahouyuan: { name: '하후연', faction: 'wei', type: 'archer', unlock: 0, kind: 'multishot', skill: '질풍 속사', letter: '연', desc: '바람처럼 빠른 활솜씨의 장수' },
  xunyu: { name: '순욱', faction: 'wei', type: 'strategist', unlock: 3, kind: 'food', skill: '왕좌지재', letter: '순', desc: '나라 살림을 맡은 조조의 참모' },
  dianwei: { name: '전위', faction: 'wei', type: 'spear', unlock: 4, kind: 'guard', skill: '쌍철극 철벽', letter: '전', desc: '조조를 지키는 쌍철극의 호위 무사' },
  xuchu: { name: '허저', faction: 'wei', type: 'infantry', unlock: 5, kind: 'stun', skill: '호치의 괴력', letter: '허', desc: '호랑이처럼 힘센 호위 장수' },
  guojia: { name: '곽가', faction: 'wei', type: 'strategist', unlock: 6, kind: 'slow', skill: '귀재의 계책', letter: '곽', desc: '앞날을 내다보는 천재 책사' },
  zhangliao: { name: '장료', faction: 'wei', type: 'cavalry', unlock: 7, kind: 'charge', skill: '위진소요진', letter: '료', desc: '이름만 들어도 적이 떠는 명장' },
  liuye: { name: '유엽', faction: 'wei', type: 'catapult', unlock: 9, kind: 'barrage', skill: '벽력거', letter: '엽', desc: '관도에서 벽력거를 만든 발명가' },
  simayi: { name: '사마의', faction: 'wei', type: 'strategist', unlock: 14, kind: 'rally', skill: '천하의 지략', letter: '사', desc: '참을성 많은 위의 대도독' },
  // 오 (손권)
  sunce: { name: '손책', faction: 'wu', type: 'cavalry', unlock: 0, kind: 'cleave', skill: '소패왕', letter: '책', desc: '강동을 휩쓴 손권의 형' },
  huanggai: { name: '황개', faction: 'wu', type: 'infantry', unlock: 0, kind: 'guard', skill: '노장의 투지', letter: '개', desc: '손씨 집안을 3대째 지킨 노장' },
  zhouyu: { name: '주유', faction: 'wu', type: 'strategist', unlock: 4, kind: 'fire', skill: '적벽 화공', letter: '주', desc: '적벽을 불태운 오의 대도독' },
  taishici: { name: '태사자', faction: 'wu', type: 'archer', unlock: 5, kind: 'multishot', skill: '신궁', letter: '태', desc: '손책과 겨룬 뒤 친구가 된 명궁' },
  lusu: { name: '노숙', faction: 'wu', type: 'strategist', unlock: 7, kind: 'food', skill: '군량 지원', letter: '노', desc: '창고를 열어 군량을 보태는 마음 넓은 책사' },
  ganning: { name: '감녕', faction: 'wu', type: 'infantry', unlock: 8, kind: 'charge', skill: '백기겁영', letter: '감', desc: '방울 소리와 함께 나타나는 용장' },
  lumeng: { name: '여몽', faction: 'wu', type: 'spear', unlock: 10, kind: 'rally', skill: '괄목상대', letter: '몽', desc: '공부해서 몰라보게 달라진 장수' },
  luxun: { name: '육손', faction: 'wu', type: 'strategist', unlock: 13, kind: 'stun', skill: '화소연영', letter: '육', desc: '젊은 나이에 대도독이 된 지략가' },
};
export const generalsOf = faction => Object.keys(GENERALS).filter(k => GENERALS[k].faction === faction);

// ---- Factions -----------------------------------------------------------------

export const FACTIONS = {
  shu: { name: '촉', army: '유비군', color: '#2f9e44', dark: '#1d6b2c' },
  wei: { name: '위', army: '조조군', color: '#2f6fd6', dark: '#1d4793' },
  wu: { name: '오', army: '손권군', color: '#d6402f', dark: '#922a1f' },
  yellow: { name: '황건', army: '황건적', color: '#e2bd1c', dark: '#9b8010' },
  dong: { name: '동탁', army: '동탁군', color: '#7040a8', dark: '#4a2a70' },
  lubu: { name: '여포', army: '여포군', color: '#b02f6a', dark: '#701c43' },
  yuanshao: { name: '원소', army: '원소군', color: '#b8862b', dark: '#7a5818' },
  yuanshu: { name: '원술', army: '원술군', color: '#a0522d', dark: '#6b371e' },
  zhangxiu: { name: '장수', army: '장수군', color: '#62803a', dark: '#405526' },
  jing: { name: '형주', army: '형주군', color: '#23918e', dark: '#17605e' },
  yi: { name: '익주', army: '익주군', color: '#8a8f2a', dark: '#5c5f1b' },
  liang: { name: '서량', army: '서량군', color: '#d0782a', dark: '#8c4f1a' },
  wuhuan: { name: '오환', army: '오환족', color: '#80705e', dark: '#544a3e' },
  jiangdong: { name: '강동', army: '강동 호족', color: '#4f7090', dark: '#344a60' },
  zhanglu: { name: '장로', army: '장로군', color: '#8f5fb0', dark: '#5f3f75' },
  nanman: { name: '남만', army: '남만군', color: '#5f8f2a', dark: '#3f5f1b' },
};

// ---- Lords ------------------------------------------------------------------

export const LORDS = {
  liubei: {
    name: '유비', title: '인덕의 군주', faction: 'shu', weapon: 'twin',
    trait: '인덕: 모든 부대 체력 +15%, 군주 체력 회복 2배',
    traitFx: { troopHp: 0.15, regen: 2 },
    style: '쌍고검을 들고 싸워요. 부대가 튼튼해요',
    skills: ['lb_heal', 'lb_oath', 'lb_blade'],
  },
  caocao: {
    name: '조조', title: '난세의 간웅', faction: 'wei', weapon: 'sword',
    trait: '간웅: 부대 부르기 대기 -15%, 군주 공격 +10%',
    traitFx: { summonCd: 0.15, lordAtk: 0.1 },
    style: '칼을 들고 싸워요. 부대를 빨리 불러요',
    skills: ['cc_roar', 'cc_tiger', 'cc_haste'],
  },
  sunquan: {
    name: '손권', title: '강동의 호랑이', faction: 'wu', weapon: 'bow',
    trait: '강동: 원거리 부대 사거리 +12%, 공격 +10%',
    traitFx: { rangedRange: 0.12, rangedAtk: 0.1 },
    style: '활을 쏘며 싸워요. 궁수·책사·투석기가 강해요',
    skills: ['sq_volley', 'sq_fire', 'sq_tiger'],
  },
};
export const LORD_KEYS = ['liubei', 'caocao', 'sunquan'];

export const expNeed = lv => Math.round(60 * 1.18 ** (lv - 1));
// 통솔력 caps how many squads stand on the field at once (squads cost nothing else here).
export const leadership = lv => 8 + lv;

// The lord's special abilities (Q/W/E). The lord is on the field now, so they last a short
// while and come back sooner than the castle orders of the first game. They unlock at lord
// levels 1, 3, 6. Abilities that hit a place aim at the biggest crowd of enemies near the
// lord (or straight ahead), so a kid never has to aim. Names marked 이름 미정 in DESIGN.md
// are placeholders until the kid names them.
export const SKILL_UNLOCK = [1, 3, 6];
export const SKILL_CD = 45;
export const SKILL_DUR = 15;
export const cmdPower = lv => 30 * 1.08 ** (lv - 1); // damage base for abilities that hit
const grow = (base, step) => lv => base + step * (lv - 1);
const lvPct = lv => pct(1 + 0.2 * (lv - 1)); // strength of damage abilities against level 1
export const SKILLS = {
  lb_heal: {
    name: '인덕의 손길', icon: '💚', cd: SKILL_CD, dur: SKILL_DUR,
    power: grow(0.3, 0.06),
    desc: lv => `군주와 장수, 모든 부대의 체력을 ${pct(grow(0.3, 0.06)(lv))} 바로 회복하고, ${SKILL_DUR}초 동안 계속 조금씩 회복해요`,
  },
  lb_oath: {
    name: '도원결의', icon: '🍑', cd: SKILL_CD, dur: SKILL_DUR, dr: 0.3,
    power: grow(0.5, 0.1),
    desc: lv => `쓰러진 장수가 바로 돌아오고, ${SKILL_DUR}초 동안 장수 공격 +${pct(grow(0.5, 0.1)(lv))}, 받는 피해 -30%`,
  },
  lb_blade: {
    name: '형제의 칼날', icon: '⚔️', cd: SKILL_CD, dur: SKILL_DUR,
    power: grow(0.4, 0.08),
    desc: lv => `${SKILL_DUR}초 동안 군주와 근접 부대(보병·창병·기마병)·근접 장수의 공격 +${pct(grow(0.4, 0.08)(lv))}`,
  },
  cc_roar: {
    name: '패왕의 호령', icon: '📯', cd: SKILL_CD, dur: SKILL_DUR,
    power: grow(0.3, 0.06),
    desc: lv => `사기를 북돋아 ${SKILL_DUR}초 동안 군주와 장수, 모든 부대의 공격 +${pct(grow(0.3, 0.06)(lv))}`,
  },
  cc_tiger: {
    name: '호표기 출격', icon: '🐎', cd: SKILL_CD, length: 560, width: 130, stun: 2.5,
    power: lv => 10 * (1 + 0.2 * (lv - 1)),
    desc: lv => `정예 기병이 군주 뒤에서 앞으로 달려 나가 부딪힌 적을 짓밟고 2.5초 동안 기절시켜요 (위력 ${lvPct(lv)})`,
  },
  cc_haste: {
    name: '질풍 행군', icon: '💨', cd: SKILL_CD, dur: SKILL_DUR, move: 0.4,
    power: grow(0.2, 0.04),
    desc: lv => `${SKILL_DUR}초 동안 군주와 장수, 모든 부대가 40% 빨리 걷고 ${pct(grow(0.2, 0.04)(lv))} 빨리 공격해요`,
  },
  sq_volley: {
    name: '궁노 일제 사격', icon: '🏹', cd: SKILL_CD, dur: SKILL_DUR,
    power: grow(0.4, 0.08),
    desc: lv => `${SKILL_DUR}초 동안 군주의 활과 궁수·책사·투석기, 원거리 장수가 ${pct(grow(0.4, 0.08)(lv))} 더 빨리 쏴요`,
  },
  sq_fire: {
    name: '화공', icon: '🔥', cd: SKILL_CD, radius: 150, dur: 8, slow: 0.35,
    power: lv => 0.8 * (1 + 0.2 * (lv - 1)),
    desc: lv => `적이 가장 많이 모인 곳에 불을 질러 8초 동안 불바다, 적이 느려져요 (위력 ${lvPct(lv)}, 동남풍이면 2배)`,
  },
  sq_tiger: {
    name: '강동의 호랑이', icon: '🐯', cd: SKILL_CD, dur: SKILL_DUR, all: 0.2,
    power: grow(0.6, 0.12),
    desc: lv => `${SKILL_DUR}초 동안 군주의 공격 +${pct(grow(0.6, 0.12)(lv))}, 장수와 모든 부대의 공격 +20%`,
  },
};
// Talents and treasure can stretch how long an ability lasts.
export const skillDur = (def, mods) => (def.dur || 0) * (1 + (mods?.skillDur || 0));
export const AURA_R = 240; // 군주의 위엄 reaches squads and generals this close to the lord

// ---- Equipment -------------------------------------------------------------------

export const GRADES = [
  { name: '일반', color: '#6f6a60', enh: 70 },
  { name: '희귀', color: '#1f7fd0', enh: 140 },
  { name: '영웅', color: '#9b3fd6', enh: 280 },
  { name: '전설', color: '#d88400', enh: 520 },
  { name: '신화', color: '#e0294a', enh: 900 },
];
export const SLOTS = { weapon: '무기', armor: '갑옷', treasure: '보물' };

// fx keys: troopAtk%, troopHp%, troopDef% (damage taken), genPower%, atk_/hp_<type>%,
// skillDmg% (ability effect), skillCd%, skillDur%, summonCd% (call squads sooner),
// lordAtk%, lordHp%, stratAtk%. Weapons and armour also help the lord by half their troop numbers.
export const EQUIPS = {
  w_iron: { slot: 'weapon', name: '철검', g: 0, icon: '🗡️', fx: { troopAtk: 0.03 }, price: 120 },
  w_saber: { slot: 'weapon', name: '환수도', g: 0, icon: '🔪', fx: { troopAtk: 0.045 }, price: 240 },
  w_twin: { slot: 'weapon', name: '쌍고검', g: 1, icon: '⚔️', fx: { troopAtk: 0.06, genPower: 0.05 } },
  w_guding: { slot: 'weapon', name: '고정도', g: 1, icon: '🗡️', fx: { troopAtk: 0.065, skillDmg: 0.08 } },
  w_yitian: { slot: 'weapon', name: '의천검', g: 2, icon: '⚔️', fx: { troopAtk: 0.09, skillDmg: 0.12 } },
  w_qinggang: { slot: 'weapon', name: '청강검', g: 2, icon: '🗡️', fx: { troopAtk: 0.1, genPower: 0.06 } },
  w_qinglong: { slot: 'weapon', name: '청룡언월도', g: 3, icon: '🐉', fx: { troopAtk: 0.12, genPower: 0.1 } },
  w_zhangba: { slot: 'weapon', name: '장팔사모', g: 3, icon: '🔱', fx: { troopAtk: 0.12, skillDmg: 0.12 } },
  w_fangtian: { slot: 'weapon', name: '방천화극', g: 3, icon: '🔱', fx: { troopAtk: 0.15 } },
  w_heaven: { slot: 'weapon', name: '천하무쌍검', g: 4, icon: '✨', fx: { troopAtk: 0.19, skillDmg: 0.15 } },

  a_leather: { slot: 'armor', name: '가죽 갑옷', g: 0, icon: '🦺', fx: { troopHp: 0.04 }, price: 100 },
  a_iron: { slot: 'armor', name: '철갑', g: 0, icon: '🛡️', fx: { troopHp: 0.05, troopDef: 0.02 }, price: 260 },
  a_scale: { slot: 'armor', name: '어린갑', g: 1, icon: '🛡️', fx: { troopHp: 0.08, troopDef: 0.03 }, price: 900, shopAfter: 6 },
  a_bright: { slot: 'armor', name: '명광개', g: 2, icon: '🛡️', fx: { troopHp: 0.11, troopDef: 0.04 } },
  a_silver: { slot: 'armor', name: '백은 갑옷', g: 3, icon: '🛡️', fx: { troopHp: 0.14, troopDef: 0.05 } },
  a_dragon: { slot: 'armor', name: '황금 용린갑', g: 4, icon: '🐲', fx: { troopHp: 0.18, troopDef: 0.07 } },

  t_bingfa: { slot: 'treasure', name: '병법서', g: 0, icon: '📘', fx: { skillCd: 0.08 }, price: 220 },
  t_hufu: { slot: 'treasure', name: '호부', g: 1, icon: '🐯', fx: { troopHp: 0.08 }, price: 900, shopAfter: 4 },
  t_seven: { slot: 'treasure', name: '칠성보도', g: 1, icon: '🌟', fx: { genPower: 0.12 } },
  t_taiping: { slot: 'treasure', name: '태평요술서', g: 1, icon: '📗', fx: { skillDmg: 0.2 } },
  t_dilu: { slot: 'treasure', name: '적로마', g: 2, icon: '🐴', fx: { atk_cavalry: 0.15, hp_cavalry: 0.15 } },
  t_sunzi: { slot: 'treasure', name: '손자병법', g: 2, icon: '📜', fx: { troopAtk: 0.1 } },
  t_mengde: { slot: 'treasure', name: '맹덕신서', g: 2, icon: '📕', fx: { lordAtk: 0.12, summonCd: 0.05 } },
  t_seal: { slot: 'treasure', name: '전국옥새', g: 3, icon: '🀄', fx: { lordHp: 0.15, summonCd: 0.12 } },
  t_redhare: { slot: 'treasure', name: '적토마', g: 3, icon: '🐎', fx: { atk_cavalry: 0.2, hp_cavalry: 0.2, skillDur: 0.15 } },
  t_feather: { slot: 'treasure', name: '백우선', g: 4, icon: '🪶', fx: { skillCd: 0.2, stratAtk: 0.25 } },
};

const FX_TEXT = {
  troopAtk: v => `모든 부대 공격 +${pct(v)}`,
  troopHp: v => `모든 부대 체력 +${pct(v)}`,
  troopDef: v => `모든 부대 받는 피해 -${pct(v)}`,
  genPower: v => `장수 체력·공격 +${pct(v)}`,
  atk_cavalry: v => `기마병 공격 +${pct(v)}`,
  hp_cavalry: v => `기마병 체력 +${pct(v)}`,
  skillDmg: v => `특수능력 효과 +${pct(v)}`,
  skillCd: v => `특수능력 대기 -${pct(v)}`,
  skillDur: v => `특수능력 지속 +${pct(v)}`,
  summonCd: v => `부대 부르기 대기 -${pct(v)}`,
  lordAtk: v => `군주 공격 +${pct(v)}`,
  lordHp: v => `군주 체력 +${pct(v)}`,
  stratAtk: v => `책사 부대 공격 +${pct(v)}`,
};

// Enhancement: every + adds 10% of the item's numbers.
export const enhMult = up => 1 + 0.1 * up;
export function equipFx(key, up = 0) {
  const e = EQUIPS[key];
  const out = {};
  for (const [k, v] of Object.entries(e.fx)) out[k] = v * enhMult(up);
  return out;
}
export const fxText = fx => Object.entries(fx).filter(([k]) => FX_TEXT[k]).map(([k, v]) => FX_TEXT[k](v)).join(', ');
export const enhanceCost = (key, up) => Math.round(GRADES[EQUIPS[key].g].enh * (1 + 0.35 * up)); // up → up+1
export const sellPrice = key => Math.round((EQUIPS[key].price || GRADES[EQUIPS[key].g].enh * 2) * 0.3);

// ---- Items (A / S / D) ----------------------------------------------------------------
// From the kid's plan (1차). 둔갑천서 is hidden: it cannot be bought, a 망루 sometimes drops it.

export const ITEM_KEYS = ['bomb', 'happy', 'scroll'];
export const ITEMS = {
  bomb: {
    name: '벽력탄', icon: '💣', key: 'A', price: 80,
    desc: '고른 병종의 적 한 부대(가장 가까운 부대)를 바로 쓰러뜨려요. 적장과 망루에는 안 통해요',
  },
  happy: {
    name: '축제의 북', icon: '🥁', key: 'S', price: 120, dur: 12, haste: 0.5, heal: 0.4, slow: 0.4,
    desc: '12초 동안 모든 아군이 빨리 공격하고 체력이 40%까지 다시 차오르며, 적은 느려져요',
  },
  scroll: {
    name: '둔갑천서', icon: '📜', key: 'D', hidden: true, dur: 60, summon: 0.5, freeze: 5,
    desc: '60초 동안 부대를 2배 빨리 부르고, 적은 딱 5초 동안 공격도 못 하고 움직이지도 못해요 (히든 아이템: 망루를 부수면 가끔 나와요)',
  },
};
export const SCROLL_DROP = 0.08; // chance a 망루 drops 둔갑천서

// ---- Enemies -----------------------------------------------------------------------
// Enemy squads use the same six types; at stage 1 on 보통 they have FOE_HP / FOE_ATK of our
// level-1 squad's numbers, then stage and difficulty scaling multiply that.

export const FOE_HP = 1.5;
export const FOE_ATK = 1.25;
export const FOE_SPEED = 0.85; // × our speed of the same type
// 망루: a wooden tower beside the road that shoots at whoever comes near.
export const TOWER = { hp: 2200, atk: 22, cd: 1.5, range: 290 };
// The enemy castle: a gate that must be broken, two towers on the wall.
// The gate grows with the stage beyond the usual scaling: the army that breaks it grows faster
// than one enemy (more 통솔력, troop levels and generals).
export const CASTLE = { gateHp: 5000, gateUp: 0.08, towerHp: 3000 };
// Reinforcements march out of the castle now and then.
export const REINFORCE = { first: 20, every: 20, everyMin: 13, maxFoes: 22 };
// Enemy general: comes out when the gate breaks. Beat it to win.
export const BOSS = { hp: 28, atk: 2.6, speed: 0.9, skillCd: 9, guards: 5 };
// The first stages are a kid's first battles: the gate and the enemy general are lighter there.
export const EARLY_EASE = [0.6, 0.75, 0.9]; // stages 1, 2, 3
export const earlyEase = n => EARLY_EASE[n - 1] || 1;
export const BOSS_SKILLS = {
  charge: '돌격: 빠르게 달려와 들이받아요',
  summon: '지원군: 병사들을 더 불러요',
  heal: '요술: 주변 병사를 치료해요 (자기는 못 고쳐요)',
  rally: '호령: 주변 병사가 빠르고 강해져요',
  volley: '일제 사격: 우리 군에 화살비를 내려요',
};
// How a stage is laid out: camps along the road, guards at each.
export const campCount = n => Math.min(6, 2 + Math.floor((n + 1) / 4)); // 2..6
export const campGuards = n => 3 + Math.floor((n - 1) / 4); // 3..7
export const stageLength = n => 2700 + 55 * (n - 1);

// ---- Stage scaling & rewards ------------------------------------------------------

export const stageHpMult = n => 1.088 ** (n - 1); // n = 1..20
export const stageAtkMult = n => 1.07 ** (n - 1);
export const stageGold = n => Math.round(165 * 1.16 ** (n - 1));
export const stageExp = n => Math.round(60 * 1.18 ** (n - 1));
export const starGold = n => Math.round(stageGold(n) * 0.25);
export const recLevel = n => n;
export const REPLAY_RATE = 0.5;
export const NO_REWARD_GAP = 2; // lord level ≥ recommended + this → replays give only LOW_REWARD of the usual
export const LOW_REWARD = 0.25;
// Stars from the lord's health left when the enemy general falls.
export const STAR_HP = [0.35, 0.7];

// Difficulty is chosen with the lord for a new game. 지옥 appears once an ending has been seen on this device.
export const DIFFS = [
  { key: 'easy', name: '쉬움', icon: '🌱', hp: 0.7, atk: 0.65, gold: 0.85, desc: '적이 약해요. 처음 하는 사람에게 추천' },
  { key: 'normal', name: '보통', icon: '⚔️', hp: 1, atk: 1, gold: 1, desc: '상성을 생각하며 싸우면 이길 수 있어요' },
  { key: 'hard', name: '어려움', icon: '🔥', hp: 1.45, atk: 1.3, gold: 1.25, desc: '특수능력과 아이템을 잘 써야 해요' },
  { key: 'hell', name: '지옥', icon: '💀', hp: 2.0, atk: 1.65, gold: 1.6, desc: '엔딩을 본 군주만 도전할 수 있는 진짜 시험' },
];
export const diffOf = save => DIFFS[save?.diff ?? 1] || DIFFS[1];
// Harder difficulties bite less in the first stages (a new 지옥 game still starts at Lv 1).
export const diffScale = (m, n) => 1 + (m - 1) * (n === 1 ? 0.5 : n === 2 ? 0.65 : 0.8 + 0.2 * (n - 1) / 19);

// Weather of a stage, from the story where it fits.
export const WEATHER = {
  clear: { name: '맑음', icon: '☀️', text: '특별한 효과가 없어요' },
  wind: { name: '동남풍', icon: '🌬️', text: '바람이 불길을 키워요: 불 공격 피해 2배 (책사·화공·불 특수 능력)', fire: 2 },
  rain: { name: '비', icon: '🌧️', text: '비가 불을 꺼요: 불 공격 피해 절반, 모두 10% 느려져요', fire: 0.5, speed: 0.9 },
  fog: { name: '안개', icon: '🌫️', text: '앞이 잘 안 보여요: 모든 원거리 사거리 -20%', range: 0.8 },
  night: { name: '밤', icon: '🌙', text: '어두워요: 모든 원거리 사거리 -20%', range: 0.8 },
  snow: { name: '눈보라', icon: '❄️', text: '눈 때문에 모두 15% 느려져요', speed: 0.85 },
};
const STAGE_WEATHER = {
  lb10: 'wind', lb11: 'wind', lb13: 'wind', lb19: 'wind', cc05: 'wind', cc13: 'wind', sq03: 'wind', sq09: 'wind', sq14: 'wind',
  lb08: 'rain', cc07: 'rain', cc18: 'rain', sq17: 'rain',
  cc04: 'fog', sq16: 'fog', cc06: 'night', sq02: 'night',
  cc11: 'snow', sq13: 'snow',
};
export const weatherKey = stage => STAGE_WEATHER[stage.id] || 'clear';

// A challenge for every stage; the first time it is met it pays extra gold.
export const CHALLENGES = {
  noItems: { icon: '🎒', text: () => '아이템을 쓰지 않고 이기기' },
  noType: { icon: '🚫', text: t => `${TROOPS[t].name}을(를) 부르지 않고 이기기` },
  lordHalf: { icon: '❤️', text: () => '군주 체력을 절반 넘게 남기고 이기기' },
  allTowers: { icon: '🗼', text: () => '망루를 모두 부수고 이기기' },
  noGenFall: { icon: '🎖️', text: () => '장수가 한 명도 쓰러지지 않고 이기기' },
  fast: { icon: '⏱️', text: (t, sec) => `${Math.round(sec / 60)}분 안에 이기기` },
};
const CHALLENGE_ORDER = [
  'allTowers', 'lordHalf', 'noItems', 'noGenFall', 'fast', 'noType', 'allTowers', 'lordHalf', 'noType', 'fast',
  'noGenFall', 'noItems', 'allTowers', 'noType', 'lordHalf', 'fast', 'noGenFall', 'noItems', 'noType', 'lordHalf',
];
export const challengeGold = n => Math.round(stageGold(n) * 0.5);
export const fastLimit = n => 180 + 6 * n; // seconds

// The stage's challenge: { key, type?, sec?, text, icon }. "Without X" names the troop type
// that beats the stage's most common enemy best.
export function stageChallenge(stage, n) {
  const key = CHALLENGE_ORDER[(n - 1) % CHALLENGE_ORDER.length];
  let type, sec;
  if (key === 'noType') {
    const main = Object.entries(stage.mix || { infantry: 1 }).sort((a, b) => b[1] - a[1])[0][0];
    type = TROOP_KEYS.filter(t => TROOP_UNLOCK[t] <= n - 1).sort((a, b) => counterMult(b, main) - counterMult(a, main))[0];
  }
  if (key === 'fast') sec = fastLimit(n);
  return { key, type, sec, icon: CHALLENGES[key].icon, text: CHALLENGES[key].text(type, sec) };
}

// ---- small helpers ---------------------------------------------------------------

export function pct(v) { return `${Math.round(v * 100)}%`; }
export const fmt = n => Math.round(n).toLocaleString('ko-KR');
