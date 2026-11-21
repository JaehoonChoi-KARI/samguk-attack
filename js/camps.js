// The enemy army of a stage: camps along the road (a 망루 and guard squads each), two
// towers on the castle wall, the reinforcement mix and the enemy general. Built from the
// stage's `mix` in stories.js and always the same for the same stage.

import { TROOP_KEYS, campCount, campGuards, TROOP_UNLOCK } from './data.js';
import { pathAt, rng } from './maps.js';

// Pick a type from a mix like { infantry: 3, archer: 2 }.
function pickType(mix, r) {
  const list = Object.entries(mix).filter(([t, w]) => TROOP_KEYS.includes(t) && w > 0);
  if (!list.length) return 'infantry';
  let x = r() * list.reduce((s, [, w]) => s + w, 0);
  for (const [t, w] of list) { x -= w; if (x <= 0) return t; }
  return list[list.length - 1][0];
}

// Stage 1-2 enemies never bring types the player cannot answer yet.
function fairMix(mix, n) {
  const out = {};
  for (const [t, w] of Object.entries(mix || {})) if (TROOP_KEYS.includes(t) && (n > 2 || TROOP_UNLOCK[t] <= 2)) out[t] = w;
  return Object.keys(out).length ? out : { infantry: 1 };
}

export function stageArmy(stage, n, layout) {
  const r = rng(`${stage.id}:army`);
  const mix = fairMix(stage.mix, n);
  const main = layout.main;
  const count = campCount(n);
  const camps = [];
  for (let i = 0; i < count; i++) {
    const f = 0.2 + (0.68 * (i + 0.5)) / count;
    const q = pathAt(main, main.len * f);
    const side = i % 2 ? 1 : -1;
    const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
    const tower = { x: q.x + nx * side * 105, y: q.y + ny * side * 105 };
    const guards = [];
    const g = campGuards(n) + (i === count - 1 ? 1 : 0);
    for (let k = 0; k < g; k++) {
      const a = (k / g) * Math.PI * 2 + r();
      guards.push({ type: pickType(mix, r), x: q.x + Math.cos(a) * 55, y: q.y + Math.sin(a) * 40 });
    }
    camps.push({ x: q.x, y: q.y, tower, guards });
  }
  // the side road gets a small camp of its own
  if (layout.paths[1]) {
    const p = layout.paths[1];
    const q = pathAt(p, p.len / 2);
    camps.push({
      x: q.x, y: q.y, side: true,
      tower: { x: q.x, y: q.y + (q.y < layout.h / 2 ? -95 : 95) },
      guards: [0, 1].map(k => ({ type: pickType(mix, r), x: q.x + (k ? 40 : -40), y: q.y })),
    });
  }
  camps.sort((a, b) => a.x - b.x);
  const g = layout.gate;
  return {
    mix,
    camps,
    castleTowers: [{ x: g.x + 40, y: g.y - 170 }, { x: g.x + 40, y: g.y + 170 }],
    boss: stage.boss,
  };
}

// For the scouting report: squads by type the stage starts with (guards only).
export function armySummary(army) {
  const sum = {};
  for (const c of army.camps) for (const gd of c.guards) sum[gd.type] = (sum[gd.type] || 0) + 1;
  return sum;
}
