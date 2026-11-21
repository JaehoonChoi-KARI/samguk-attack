// The battle screen: runs the Sim, draws it with BattleView, and owns the HUD (the lord's
// health, generals, squad buttons 1~6, abilities Q/W/E, items A/S/D, 돌격/모여라) and the
// controls: arrow keys + Space with a keyboard, a joystick and buttons on a touch screen.

import { TROOPS, SKILLS, ITEMS, ITEM_KEYS, GENERALS, LORDS, FACTIONS, TROOP_KEYS, weakTo } from './data.js';
import { battleSetup } from './army.js';
import { Sim } from './sim.js';
import { BattleView } from './render.js';
import { input } from './input.js';
import { troopIcon, generalIcon, lordIcon } from './sprites.js';
import { sfx } from './audio.js';
import { playMusic } from './music.js';

const STEP = 1 / 60;
const JOY_R = 56; // how far the joystick knob travels, in CSS px
const SKILL_CODES = ['KeyQ', 'KeyW', 'KeyE'];
const ITEM_CODES = { KeyA: 'bomb', KeyS: 'happy', KeyD: 'scroll' };
const DENY = {
  cd: '아직 기다려야 해요',
  lead: '통솔력이 모자라요. 부대가 쓰러지면 다시 부를 수 있어요',
  locked: '아직 쓸 수 없어요',
  none: '가진 게 없어요',
  noTarget: '그 병종의 적이 없어요',
};

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class BattleController {
  constructor(game, stageIdx, stage, opts = {}) {
    this.game = game;
    this.stageIdx = stageIdx;
    this.stage = stage;
    this.setup = battleSetup(game.save, stageIdx, stage, opts);
    this.sim = new Sim(this.setup);
    this.view = new BattleView(this.sim);
    this.acc = 0;
    this.ended = false;
    this.endWait = 0;
    this.picker = null;
    this.guide = null;
    this.us = FACTIONS[LORDS[game.save.lord].faction];
    this.them = FACTIONS[stage.enemy] || FACTIONS.yellow;
    this.buildHud();
    this.offPress = input.onPress(code => this.onKey(code));
    input.clear();
    this.view.bannerText(`🎯 성문을 깨고 적장 ${stage.boss.name}을(를) 쓰러뜨려라!`, '#fff3b0', 3);
    if (!game.save.seen.controls && !opts.noGuide) this.showGuide();
  }

  // ---- HUD -------------------------------------------------------------------------

  buildHud() {
    const s = this.setup;
    const root = this.game.hudRoot;
    root.innerHTML = '';
    const L = LORDS[s.lordKey];
    const troopBtn = t => {
      const T = TROOPS[t];
      const ok = !!s.troops[t];
      return `
        <button class="sq-btn ${ok ? '' : 'locked'}" data-t="${t}" type="button">
          <img src="${troopIcon(t, this.us, 56)}" alt="">
          <span class="key kbd-only">${T.key}</span>
          <span class="ld">🚩${T.lead}</span>
          <span class="cd"></span>
          ${ok ? '' : '<span class="lock">🔒</span>'}
        </button>`;
    };
    const skillBtn = (sk, i) => {
      const key = L.skills[i];
      const def = SKILLS[key];
      return `
        <button class="sk-btn ${sk ? '' : 'locked'}" data-i="${i}" type="button">
          <span class="ico">${def.icon}</span>
          <span class="key">${'QWE'[i]}</span>
          <span class="nm">${def.name}</span>
          <span class="cd"></span>
          ${sk ? '' : '<span class="lock">🔒</span>'}
        </button>`;
    };
    const itemBtn = k => {
      const I = ITEMS[k];
      return `
        <button class="it-btn" data-k="${k}" type="button">
          <span class="ico">${I.icon}</span>
          <span class="key">${I.key}</span>
          <span class="cnt"></span>
        </button>`;
    };
    root.appendChild(h(`
      <div class="bhud">
        <div class="joy-zone touch-only"></div>
        <div class="joy-base"><div class="joy-knob"></div></div>
        <div class="hud-tl">
          <div class="hud-lord">
            <img src="${lordIcon(s.lordKey, 72)}" alt="">
            <div class="lc-mid">
              <div class="lc-name">${L.name} <small>Lv ${s.level}</small></div>
              <div class="lc-hp"><i></i><span></span></div>
            </div>
          </div>
          <div class="hud-gens">${s.generals.map((g, i) => `
            <div class="gen-chip" data-i="${i}">
              <img src="${generalIcon(g.type, GENERALS[g.key].letter, this.us, 44)}" alt="">
              <div class="gc-hp"><i></i></div>
              <span class="gc-down"></span>
            </div>`).join('')}</div>
        </div>
        <div class="hud-tr">
          <div class="stage-chip">${this.stageIdx + 1}. ${this.stage.title}</div>
          <button class="pause-btn" type="button">⏸</button>
        </div>
        <div class="hud-boss hidden"><b></b><div class="bb"><i></i></div></div>
        <div class="hud-bottom">
          <button class="mode-btn" type="button"><span class="mi"></span><span class="key kbd-only">R</span></button>
          <div class="lead-chip"></div>
          <div class="sq-row">${TROOP_KEYS.map(troopBtn).join('')}</div>
        </div>
        <div class="hud-br">
          <div class="it-row">${ITEM_KEYS.map(itemBtn).join('')}</div>
          <div class="sk-row">${s.skills.map(skillBtn).join('')}</div>
          <button class="atk-btn touch-only" type="button">⚔️</button>
        </div>
        <div class="hud-msg"></div>
      </div>`));
    this.hud = root.querySelector('.bhud');
    const $ = q => this.hud.querySelector(q);
    this.el = {
      hp: $('.lc-hp i'), hpTxt: $('.lc-hp span'), gens: [...this.hud.querySelectorAll('.gen-chip')],
      sq: [...this.hud.querySelectorAll('.sq-btn')], sk: [...this.hud.querySelectorAll('.sk-btn')], it: [...this.hud.querySelectorAll('.it-btn')],
      mode: $('.mode-btn'), lead: $('.lead-chip'), boss: $('.hud-boss'), msg: $('.hud-msg'),
    };
    // buttons work with a finger and a mouse alike; pointerdown so they answer at once
    const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.markTouch(e); fn(); });
    this.el.sq.forEach(b => tap(b, () => this.summon(b.dataset.t)));
    this.el.sk.forEach(b => tap(b, () => this.skill(+b.dataset.i)));
    this.el.it.forEach(b => tap(b, () => this.item(b.dataset.k)));
    tap(this.el.mode, () => this.toggleMode());
    tap($('.pause-btn'), () => this.game.pause());
    this.setupAttackButton($('.atk-btn'));
    this.setupJoystick();
    this.paintHud(true);
  }

  markTouch(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.game.setInputMode('touch');
  }

  setupAttackButton(btn) {
    let pid = null;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.markTouch(e);
      if (pid !== null) return;
      pid = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic events in tests */ }
      btn.classList.add('pressed');
      this.touchAttack = true;
    });
    const up = e => {
      if (e.pointerId !== pid) return;
      pid = null;
      btn.classList.remove('pressed');
      this.touchAttack = false;
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }

  setupJoystick() {
    const zone = this.hud.querySelector('.joy-zone');
    const base = this.hud.querySelector('.joy-base');
    const knob = this.hud.querySelector('.joy-knob');
    let joyId = null, ox = 0, oy = 0;
    const reset = () => {
      joyId = null;
      input.setAxis(0, 0);
      knob.style.transform = '';
      base.classList.remove('active');
      base.style.left = base.style.top = '';
    };
    this.resetJoy = reset;
    zone.addEventListener('pointerdown', e => {
      this.markTouch(e);
      if (joyId !== null) return;
      e.preventDefault();
      joyId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic events in tests */ }
      const r = this.hud.getBoundingClientRect();
      const sc = r.width / this.hud.offsetWidth || 1;
      ox = (e.clientX - r.left) / sc;
      oy = (e.clientY - r.top) / sc;
      this.joyScale = sc;
      base.style.left = ox + 'px';
      base.style.top = oy + 'px';
      base.classList.add('active');
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      const r = this.hud.getBoundingClientRect();
      const sc = this.joyScale || 1;
      let dx = (e.clientX - r.left) / sc - ox, dy = (e.clientY - r.top) / sc - oy;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.setAxis(dx / JOY_R, dy / JOY_R);
    });
    const end = e => { if (e.pointerId === joyId) reset(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  // Refreshes numbers and cooldown shades (cheap: a few style writes per frame).
  paintHud(all = false) {
    const sim = this.sim;
    const L = sim.lord;
    const s = this.setup;
    this.el.hp.style.width = `${Math.max(0, (L.hp / L.maxHp) * 100)}%`;
    this.el.hp.classList.toggle('low', L.hp / L.maxHp < 0.3);
    const hpText = `${Math.max(0, Math.ceil(L.hp))} / ${L.maxHp}`;
    if (this.el.hpTxt.textContent !== hpText) this.el.hpTxt.textContent = hpText;
    const gens = sim.units.filter(u => u.gen);
    this.el.gens.forEach((c, i) => {
      const g = gens.find(u => u.gen.slot === i);
      if (!g) return;
      const down = g.gen.down > 0;
      c.classList.toggle('down', down);
      c.querySelector('.gc-hp i').style.width = `${down ? 0 : (g.hp / g.maxHp) * 100}%`;
      const t = down ? `${Math.ceil(g.gen.down)}` : '';
      const el = c.querySelector('.gc-down');
      if (el.textContent !== t) el.textContent = t;
    });
    const used = sim.leadUsed();
    const leadTxt = `🚩 ${used}/${s.lead}`;
    if (this.el.lead.textContent !== leadTxt) this.el.lead.textContent = leadTxt;
    for (const b of this.el.sq) {
      const t = b.dataset.t;
      const T = s.troops[t];
      if (!T) continue;
      const cd = sim.summonCd[t] || 0;
      b.querySelector('.cd').style.height = `${Math.min(100, (cd / T.summonCd) * 100)}%`;
      b.classList.toggle('full', used + T.lead > s.lead);
      b.classList.toggle('ready', cd <= 0 && used + T.lead <= s.lead);
    }
    this.el.sk.forEach((b, i) => {
      const sk = s.skills[i];
      if (!sk) return;
      const cd = sim.skillCd[i];
      b.querySelector('.cd').style.height = `${Math.min(100, (cd / sk.cd) * 100)}%`;
      b.classList.toggle('ready', cd <= 0);
    });
    for (const b of this.el.it) {
      const k = b.dataset.k;
      const n = sim.items[k] || 0;
      const t = `${n}`;
      const c = b.querySelector('.cnt');
      if (c.textContent !== t) c.textContent = t;
      b.classList.toggle('empty', n <= 0);
      b.classList.toggle('hidden-item', !!ITEMS[k].hidden && n <= 0 && !(this.game.save.found?.scroll > 0));
    }
    const mt = sim.mode === 'rally' ? '🚩 모여라' : '⚔️ 돌격';
    const mi = this.el.mode.querySelector('.mi');
    if (mi.textContent !== mt || all) { mi.textContent = mt; this.el.mode.classList.toggle('rally', sim.mode === 'rally'); }
    const b = sim.boss;
    if (b && !b.dead) {
      this.el.boss.classList.remove('hidden');
      const nm = `적장 ${b.name} · ${TROOPS[b.type].name}`;
      const bb = this.el.boss.querySelector('b');
      if (bb.textContent !== nm) bb.textContent = nm;
      this.el.boss.querySelector('i').style.width = `${(b.hp / b.maxHp) * 100}%`;
    } else this.el.boss.classList.add('hidden');
  }

  say(text, bad = false) {
    const m = this.el.msg;
    m.textContent = text;
    m.classList.toggle('bad', bad);
    m.classList.remove('show');
    void m.offsetWidth;
    m.classList.add('show');
  }

  // ---- commands ----------------------------------------------------------------------

  summon(t) {
    if (this.blocked()) return;
    const why = this.sim.summon(t);
    if (why) { sfx.denied(); this.say(why === 'locked' ? `${TROOPS[t].name}은(는) 아직 부를 수 없어요` : DENY[why] || '', true); }
  }

  skill(i) {
    if (this.blocked()) return;
    const why = this.sim.useSkill(i);
    if (why) { sfx.denied(); this.say(why === 'locked' ? `군주 레벨이 오르면 배워요` : DENY[why] || '', true); }
  }

  item(k) {
    if (this.blocked()) return;
    if (!(this.sim.items[k] > 0)) { sfx.denied(); this.say(DENY.none, true); return; }
    if (k === 'bomb') { this.openPicker(); return; }
    const why = this.sim.useItem(k);
    if (why) { sfx.denied(); this.say(DENY[why] || '', true); }
  }

  toggleMode() {
    if (this.blocked()) return;
    this.sim.toggleMode();
  }

  blocked() { return this.ended || this.game.paused || this.guide || this.picker; }

  // 벽력탄: pick which enemy type to hit (the closest squad of it falls). The battle waits.
  openPicker() {
    const types = TROOP_KEYS.filter(t => this.sim.foes().some(f => f.kind === 'squad' && f.type === t));
    if (!types.length) { sfx.denied(); this.say('쓰러뜨릴 적 부대가 없어요', true); return; }
    const el = h(`
      <div class="bomb-pick">
        <div class="bp-panel">
          <div class="bp-title">💣 벽력탄: 어느 병종을 쓰러뜨릴까요? <small>가장 가까운 한 부대</small></div>
          <div class="bp-row">${TROOP_KEYS.map(t => `
            <button class="bp-btn ${types.includes(t) ? '' : 'off'}" data-t="${t}" type="button" ${types.includes(t) ? '' : 'disabled'}>
              <img src="${troopIcon(t, this.them, 56)}" alt=""><b>${TROOPS[t].name}</b><span class="key kbd-only">${TROOPS[t].key}</span>
            </button>`).join('')}</div>
          <button class="bp-cancel" type="button">취소 <span class="kbd-only">(Esc)</span></button>
        </div>
      </div>`);
    el.querySelectorAll('.bp-btn:not(.off)').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); this.pickBomb(b.dataset.t); }));
    el.querySelector('.bp-cancel').addEventListener('pointerdown', e => { e.preventDefault(); this.closePicker(); });
    this.hud.appendChild(el);
    this.picker = { el, types };
    sfx.select();
  }

  pickBomb(t) {
    if (!this.picker) return;
    if (!this.picker.types.includes(t)) { sfx.denied(); return; }
    this.closePicker();
    const why = this.sim.useItem('bomb', t);
    if (why) { sfx.denied(); this.say(DENY[why] || '', true); }
  }

  closePicker() {
    this.picker?.el.remove();
    this.picker = null;
  }

  // The first battle starts with how to play (keyboard and touch). Any key or tap closes it.
  showGuide() {
    const kb = this.game.inputMode !== 'touch';
    const el = h(`
      <div class="guide">
        <div class="g-panel">
          <h2>⚔️ 이렇게 싸워요</h2>
          <div class="g-cols">
            <div class="g-col ${kb ? 'on' : ''}">
              <h3>⌨️ 키보드</h3>
              <p><b>← ↑ → ↓</b> 군주 움직이기</p>
              <p><b>Space</b> 공격 (누르고 있으면 계속)</p>
              <p><b>1 ~ 6</b> 부대 부르기 (보병·창병·기마병·궁수·책사·투석기)</p>
              <p><b>Q W E</b> 군주 특수능력</p>
              <p><b>A S D</b> 아이템</p>
              <p><b>R</b> 돌격 ↔ 모여라 · <b>Esc</b> 멈춤</p>
            </div>
            <div class="g-col ${kb ? '' : 'on'}">
              <h3>👆 터치</h3>
              <p>왼쪽 아무 곳이나 누르고 끌면 <b>조이스틱</b></p>
              <p>오른쪽 아래 <b>⚔️</b> 공격 (누르고 있으면 계속)</p>
              <p>아래 그림 버튼으로 <b>부대 부르기</b></p>
              <p>오른쪽 버튼으로 <b>특수능력</b>과 <b>아이템</b></p>
            </div>
          </div>
          <p class="g-goal">🎯 길을 따라 쳐들어가 <b>망루</b>를 부수고, <b>성문</b>을 깨고, 나오는 <b>적장</b>을 쓰러뜨리면 이겨요.<br>군주가 쓰러지면 져요! 위험하면 뒤로 물러나 부대를 먼저 보내세요.</p>
          <button class="btn primary big g-go" type="button">시작! ▶</button>
        </div>
      </div>`);
    const close = () => {
      if (!this.guide) return;
      this.guide.remove();
      this.guide = null;
      this.game.save.seen.controls = true;
      this.game.persist();
      sfx.confirm();
    };
    el.addEventListener('pointerdown', e => { e.preventDefault(); this.markTouch(e); close(); });
    this.guide = el;
    this.closeGuide = close;
    this.hud.appendChild(el);
  }

  onKey(code) {
    if (this.ended) return;
    if (this.guide) { if (code !== 'Escape') this.closeGuide(); return; }
    if (this.game.paused) return;
    if (this.picker) {
      if (code === 'Escape') { this.closePicker(); return; }
      const t = TROOP_KEYS.find(k => `Digit${TROOPS[k].key}` === code);
      if (t) this.pickBomb(t);
      return;
    }
    const t = TROOP_KEYS.find(k => `Digit${TROOPS[k].key}` === code);
    if (t) { this.summon(t); return; }
    const si = SKILL_CODES.indexOf(code);
    if (si >= 0) { this.skill(si); return; }
    if (ITEM_CODES[code]) { this.item(ITEM_CODES[code]); return; }
    if (code === 'KeyR') { this.toggleMode(); return; }
    if (code === 'Escape' || code === 'KeyP') this.game.pause();
  }

  // ---- loop -------------------------------------------------------------------------

  readInput() {
    const k = c => (input.isDown(c) ? 1 : 0);
    let mx = k('ArrowRight') - k('ArrowLeft');
    let my = k('ArrowDown') - k('ArrowUp');
    const ax = input.axis();
    if (!mx && !my && (ax.x || ax.y)) { mx = ax.x; my = ax.y; }
    const sim = this.sim;
    if (this.bot) return; // the autotest's bot drives
    sim.input.mx = mx;
    sim.input.my = my;
    sim.input.attack = input.isDown('Space') || !!this.touchAttack;
  }

  update(dt) {
    if (this.guide || this.picker) return;
    if (this.ended) {
      this.endWait -= dt;
      if (this.endWait <= 0 && !this.reported) {
        this.reported = true;
        const r = this.sim.result();
        this.game.onBattleEnd(r);
      }
      return;
    }
    this.readInput();
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.bot?.act(STEP);
      this.sim.step(STEP);
      if (this.sim.over) break;
    }
    if (this.sim.over && !this.ended) {
      this.ended = true;
      this.endWait = 1.2;
      if (this.sim.won) sfx.clear(); else sfx.death();
    }
  }

  render(ctx, view, dt) {
    const ev = this.sim.events;
    this.sounds(ev);
    this.view.insetB = this.game.inputMode === 'touch' ? 120 : 90;
    this.view.absorb(ev);
    ev.length = 0;
    this.view.render(ctx, view, dt);
    this.paintHud();
  }

  sounds(events) {
    let hits = 0;
    for (const e of events) {
      switch (e.e) {
        case 'hit': hits++; if (e.lord) sfx.hurt(); break;
        case 'summon': sfx.deploy(); break;
        case 'slash': sfx.swing(); break;
        case 'die': if (e.side === 'us' && e.kind === 'squad') sfx.squadDown(); break;
        case 'skill': sfx.horn(); break;
        case 'item': sfx.upgrade(); break;
        case 'boom': sfx.explode(); break;
        case 'fireHit': sfx.fireball(); break;
        case 'stoneHit': sfx.stone(); break;
        case 'gate': sfx.gateHit(); break;
        case 'boss': sfx.boss(); playMusic('boss'); break;
        case 'tower': sfx.smash(); break;
        case 'pickup': sfx.levelUp(); break;
        case 'genDown': sfx.hurt(); break;
        case 'genBack': sfx.heal(); break;
        case 'mode': sfx.select(); break;
        case 'reinforce': sfx.drum(); break;
        case 'bossSkill': sfx.horn(); break;
        case 'sfx': if (sfx[e.name]) sfx[e.name](); break;
        default: break;
      }
    }
    if (hits) sfx.hit();
  }

  destroy() {
    this.offPress?.();
    this.resetJoy?.();
    input.clear();
    this.game.hudRoot.innerHTML = '';
  }
}

// Tip for the result screen after a loss.
export function lossTip(stage, r) {
  const b = stage.boss;
  if (r.gateDown) return `💡 적장 <b>${b.name}</b>은(는) <b>${TROOPS[b.type].name}</b>이라 ${weakTo(b.type).map(t => TROOPS[t].name).join(', ')}이(가) 강해요. 적장이 나오기 전에 부대를 가득 불러 두고, 특수능력을 아껴 두었다가 적장에게 쓰세요.`;
  return '💡 군주가 혼자 앞서가면 위험해요. 부대를 먼저 보내고 뒤에서 함께 싸우세요. 체력이 낮으면 뒤로 물러나면 다시 차올라요. 병영에서 병종을 강화하는 것도 좋아요.';
}
