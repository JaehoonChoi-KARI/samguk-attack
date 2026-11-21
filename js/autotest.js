// ?autotest=1 runs data checks, bot battles and the whole screen flow (keyboard and touch),
// then prints a JSON report into <pre id="test-out">. ?shot=<scene> freezes a scene for a
// screenshot: title, slots, lord, base, map, prep, battle, boss, result, guide, touch.

import { LORD_KEYS, TROOP_KEYS, STAGE_COUNT, BOSS_SKILLS, TROOPS, FACTIONS } from './data.js';
import { STORIES } from './stories.js';
import { stageLayout } from './maps.js';
import { stageArmy } from './camps.js';
import { battleSetup } from './army.js';
import { autoplay, expectedSave, Bot } from './bot.js';
import { input } from './input.js';
import { defaultSave } from './save.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = q => document.querySelector(q);

function out(report) {
  let pre = $('#test-out');
  if (!pre) {
    pre = document.createElement('pre');
    pre.id = 'test-out';
    pre.style.cssText = 'position:fixed;left:0;top:0;max-height:100%;overflow:auto;background:#fff;color:#000;font:11px monospace;z-index:99;margin:0;padding:6px;';
    document.body.appendChild(pre);
  }
  pre.textContent = JSON.stringify(report, null, 1);
}

function tapEl(el, type = 'touch') {
  if (!el) throw new Error('nothing to tap');
  const o = { bubbles: true, cancelable: true, pointerType: type, pointerId: 7, clientX: 10, clientY: 10, isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.click();
}

async function key(code, ms = 60) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  await wait(ms);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
}

function dataChecks(report) {
  let stages = 0;
  for (const lord of LORD_KEYS) {
    const st = STORIES[lord].stages;
    if (st.length !== STAGE_COUNT) report.errors.push(`${lord}: ${st.length} stages`);
    st.forEach((stage, i) => {
      const n = i + 1;
      const L = stageLayout(n, stage);
      const A = stageArmy(stage, n, L);
      if (!A.camps.length) report.errors.push(`${stage.id}: no camps`);
      if (!TROOP_KEYS.includes(stage.boss.type)) report.errors.push(`${stage.id}: boss type`);
      if (!BOSS_SKILLS[stage.boss.skill]) report.errors.push(`${stage.id}: boss skill`);
      if (!FACTIONS[stage.enemy]) report.errors.push(`${stage.id}: enemy faction`);
      for (const c of A.camps) {
        if (c.tower.x < 0 || c.tower.x > L.w || c.tower.y < 40 || c.tower.y > L.h - 30) report.errors.push(`${stage.id}: tower off field`);
      }
      stages++;
    });
  }
  report.checks.push({ stages });
}

function botBattles(report) {
  const rows = [];
  for (const lord of LORD_KEYS) {
    for (const n of [1, 4, 8, 12, 16, 20]) {
      const save = expectedSave(lord, n, 1);
      const stage = STORIES[lord].stages[n - 1];
      const r = autoplay(battleSetup(save, n - 1, stage, { seed: 'test' }), { maxTime: 900 });
      rows.push(`${lord} ${n}: ${r.won ? 'WIN' : r.timeout ? 'TIME' : 'lose'} ${Math.round(r.time)}s hp${Math.round(r.lordHp * 100)} towers ${r.towersDown}/${r.towersTotal} gate ${r.gateDown ? 'down' : 'up'} kills ${r.kills}`);
    }
  }
  report.checks.push({ bot: rows });
}

async function flow(game, report) {
  const step = name => report.flow.push(name);
  game.show('title');
  await wait(400);
  tapEl($('.title-screen'), 'mouse');
  await wait(200);
  if (game.screenName !== 'slots') throw new Error('title → slots');
  step('slots');
  tapEl($('.slot[data-i="0"]'), 'mouse');
  await wait(200);
  if (game.screenName !== 'lordSelect') throw new Error('slot → lordSelect');
  step('lordSelect');
  tapEl($('.lord-card[data-k="liubei"]'), 'mouse');
  tapEl($('.start-lord'), 'mouse');
  await wait(200);
  if (game.screenName !== 'story') throw new Error('→ story');
  tapEl($('.story'), 'mouse');
  tapEl($('.story'), 'mouse');
  await wait(200);
  if (game.screenName !== 'base') throw new Error('story → base');
  step('base');
  tapEl($('.go-card'), 'mouse');
  await wait(300);
  if (game.screenName !== 'map') throw new Error('base → map');
  step('map');
  tapEl($('.mc-go'), 'mouse');
  await wait(200);
  if (game.screenName !== 'prep') throw new Error('map → prep');
  step('prep');
  if (document.querySelectorAll('.gro.on').length < 2) report.errors.push('prep: generals not picked');
  tapEl($('.go'), 'mouse');
  await wait(300);
  const b = game.battle;
  if (!b) throw new Error('prep → battle');
  step('battle');
  if (!$('.guide')) report.errors.push('first battle: no controls guide');
  await key('KeyX');
  await wait(100);
  if ($('.guide')) report.errors.push('guide did not close on a key');
  // keyboard: walk right, swing, call a squad, use an ability
  const x0 = b.sim.lord.x;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
  await wait(1200);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
  if (!(b.sim.lord.x > x0 + 80)) report.errors.push(`arrow key did not move the lord (${Math.round(x0)} → ${Math.round(b.sim.lord.x)})`);
  await key('Space', 300);
  await key('Digit1');
  await wait(100);
  if (!b.sim.summoned.infantry) report.errors.push('key 1 did not call infantry');
  await key('KeyQ');
  await wait(100);
  if (!(b.sim.skillCd[0] > 0)) report.errors.push('Q did not use the first ability');
  await key('KeyR');
  if (b.sim.mode !== 'rally') report.errors.push('R did not switch to 모여라');
  await key('KeyR');
  step('keyboard');
  if (game.inputMode !== 'keyboard') report.errors.push('keys did not set keyboard mode');
  // touch: a finger switches the screen to touch mode and the buttons work
  tapEl($('.sq-btn[data-t="archer"]'), 'touch');
  await wait(100);
  if (game.inputMode !== 'touch') report.errors.push('a touch did not switch to touch mode');
  if (!b.sim.summoned.archer) report.errors.push('touch button did not call archers');
  if (!document.body.classList.contains('touch-mode')) report.errors.push('no touch-mode class');
  const zone = $('.joy-zone');
  const r = zone.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 3, clientX: r.left + 100, clientY: r.top + r.height / 2 };
  zone.dispatchEvent(new PointerEvent('pointerdown', o));
  zone.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: o.clientX + 60 }));
  const x1 = b.sim.lord.x;
  await wait(800);
  zone.dispatchEvent(new PointerEvent('pointerup', o));
  if (!(b.sim.lord.x > x1 + 40)) report.errors.push(`joystick did not move the lord (${Math.round(x1)} → ${Math.round(b.sim.lord.x)})`);
  step('touch');
  // every HUD button must be on screen
  const W = window.innerWidth, H = window.innerHeight;
  for (const el of document.querySelectorAll('.bhud button')) {
    if (el.offsetParent === null) continue;
    const q = el.getBoundingClientRect();
    if (q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1) report.errors.push(`off screen: ${el.className} ${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.right)},${Math.round(q.bottom)} in ${W}x${H}`);
  }
  // the bomb picker
  b.sim.items.bomb = 1;
  tapEl($('.it-btn[data-k="bomb"]'), 'touch');
  await wait(100);
  if ($('.bomb-pick')) {
    tapEl($('.bp-cancel'), 'touch');
    await wait(50);
    if ($('.bomb-pick')) report.errors.push('bomb picker did not close');
  }
  step('bomb');
  // pause, quit to the map
  game.pause();
  await wait(100);
  if (game.screenName !== 'pause') throw new Error('pause screen');
  tapEl($('.quit'), 'mouse');
  await wait(50);
  tapEl($('.confirm .yes'), 'mouse');
  await wait(200);
  if (game.screenName !== 'map') throw new Error('quit → map');
  step('quit');
  // a battle the bot plays to the end shows the result screen
  game.save = expectedSave('liubei', 1, 0);
  game.slot = 1;
  game.startBattle(0, { noGuide: true });
  game.battle.bot = new Bot(game.battle.sim);
  for (let i = 0; i < 200 && !game.screenName.startsWith('result'); i++) {
    // run the battle faster than real time
    for (let k = 0; k < 600 && game.battle && !game.battle.sim.over; k++) { game.battle.bot.act(1 / 60); game.battle.sim.step(1 / 60); }
    await wait(50);
  }
  if (game.screenName !== 'result') report.errors.push('bot battle did not reach the result screen');
  else step(`result ${$('.result h1')?.textContent || ''}`);
}

async function shot(game, params) {
  const name = params.get('shot');
  const n = +(params.get('n') || 4);
  const lord = params.get('lord') || 'liubei';
  if (params.get('touch') === '1') game.setInputMode('touch');
  if (name === 'title') { game.show('title'); return; }
  if (name === 'slots') { game.show('slots'); return; }
  if (name === 'lord') { game.show('lordSelect', { slot: 1 }); return; }
  game.save = expectedSave(lord, n, 1);
  game.slot = 1;
  if (name === 'base') { game.show('base'); return; }
  if (name === 'map') { game.show('map', { sel: n - 1 }); return; }
  if (name === 'prep') { game.show('prep', { stageIdx: n - 1 }); return; }
  if (name === 'guide') { game.save.seen.controls = false; game.startBattle(n - 1); return; }
  game.startBattle(n - 1, { noGuide: true });
  const b = game.battle;
  const bot = new Bot(b.sim);
  const secs = +(params.get('t') || (name === 'boss' ? 600 : 25));
  for (let t = 0; t < secs && !b.sim.over; t += 1 / 30) {
    bot.act(1 / 30);
    b.sim.step(1 / 30);
    b.view.absorb(b.sim.events);
    b.sim.events.length = 0;
    if (name === 'boss' && b.sim.boss && b.sim.t > (b.bossSeen ||= b.sim.t) + 4) break;
  }
  if (name === 'result') { b.sim.finish(true, 'boss'); return; }
  game.paused = true; // freeze the scene; render keeps drawing it
  if (params.get('bomb') === '1') { game.paused = false; b.sim.items.bomb = 1; b.openPicker(); }
}

export async function run({ game, params }) {
  if (params.has('shot')) { await shot(game, params); return; }
  const report = { ok: false, errors: [], checks: [], flow: [] };
  window.addEventListener('error', e => report.errors.push(`error: ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', e => report.errors.push(`rejection: ${e.reason?.message || e.reason}`));
  try {
    dataChecks(report);
    if (params.get('bot') !== '0') botBattles(report);
    await flow(game, report);
  } catch (e) {
    report.errors.push(`${e.message} ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
  }
  report.ok = report.errors.length === 0;
  out(report);
  void defaultSave; void TROOPS; void input;
}
