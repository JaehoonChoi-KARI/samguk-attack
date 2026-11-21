// Keyboard input (from 던전 용사). Uses KeyboardEvent.code so keys keep working when the
// iPad's input language is Korean; falls back to e.key (incl. 두벌식 jamo).

const JAMO = {
  'ㅂ': 'KeyQ', 'ㅃ': 'KeyQ', 'ㅈ': 'KeyW', 'ㅉ': 'KeyW', 'ㄷ': 'KeyE', 'ㄸ': 'KeyE', 'ㄱ': 'KeyR', 'ㄲ': 'KeyR',
  'ㅅ': 'KeyT', 'ㅆ': 'KeyT', 'ㅛ': 'KeyY', 'ㅕ': 'KeyU', 'ㅑ': 'KeyI', 'ㅐ': 'KeyO', 'ㅒ': 'KeyO', 'ㅔ': 'KeyP', 'ㅖ': 'KeyP',
  'ㅁ': 'KeyA', 'ㄴ': 'KeyS', 'ㅇ': 'KeyD', 'ㄹ': 'KeyF', 'ㅎ': 'KeyG', 'ㅗ': 'KeyH', 'ㅓ': 'KeyJ', 'ㅏ': 'KeyK', 'ㅣ': 'KeyL',
  'ㅋ': 'KeyZ', 'ㅌ': 'KeyX', 'ㅊ': 'KeyC', 'ㅍ': 'KeyV', 'ㅠ': 'KeyB', 'ㅜ': 'KeyN', 'ㅡ': 'KeyM',
};
const KEY_ALIASES = {
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  Esc: 'Escape', Spacebar: 'Space', ' ': 'Space',
};
// Number pad digits call squads too.
const NUMPAD = { Numpad1: 'Digit1', Numpad2: 'Digit2', Numpad3: 'Digit3', Numpad4: 'Digit4', Numpad5: 'Digit5', Numpad6: 'Digit6' };

export function codeOf(e) {
  if (e.code && e.code !== 'Unidentified') return NUMPAD[e.code] || e.code;
  const k = e.key || '';
  if (JAMO[k]) return JAMO[k];
  if (KEY_ALIASES[k]) return KEY_ALIASES[k];
  if (k.length === 1) {
    const u = k.toUpperCase();
    if (u >= 'A' && u <= 'Z') return 'Key' + u;
    if (u >= '0' && u <= '9') return 'Digit' + u;
  }
  return k;
}

const held = new Set();
const listeners = new Set();
const axis = { x: 0, y: 0 }; // analog direction from the touch joystick, length 0..1

function emit(code) {
  for (const fn of [...listeners]) fn(code);
}

export const input = {
  isDown: code => held.has(code),
  clear() { held.clear(); axis.x = axis.y = 0; },
  onPress(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  axis: () => axis,
  setAxis(x, y) { axis.x = x; axis.y = y; },

  // Virtual key presses: on-screen touch buttons and the automated test.
  simulateDown(code) {
    if (!held.has(code)) { held.add(code); emit(code); }
  },
  simulateUp(code) { held.delete(code); },
};

let started = false;
export function initInput(onKeyboard) {
  if (started) return;
  started = true;
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave system shortcuts alone
    const code = codeOf(e);
    onKeyboard?.(code);
    // keep page scrolling and button focus out of the way, but let typing into fields work
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault();
    const first = !held.has(code);
    held.add(code);
    if (first && !e.repeat) emit(code);
  });
  window.addEventListener('keyup', e => { held.delete(codeOf(e)); });
  window.addEventListener('blur', () => input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
}
