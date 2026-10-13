import { describe, expect, it } from 'vitest';
import {
  actionOf,
  bindingsOf,
  chordOf,
  collisions,
  evalWhen,
  formatChord,
  isMac,
  isTextChord,
  keyHint,
  localOverrides,
  normalizeChord,
  recordChord,
  resolve,
  type Binding,
  type KeyLike,
} from '../src/index';

const ev = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('chords', () => {
  it('normalizes: modifiers in order, aliases, Ctrl = mod off a Mac', () => {
    expect(normalizeChord('Shift+Mod+K', true)).toBe('mod+shift+k');
    expect(normalizeChord('cmd+opt+b', true)).toBe('mod+alt+b');
    expect(normalizeChord('ctrl+.', true)).toBe('ctrl+.');
    expect(normalizeChord('ctrl+.', false)).toBe('mod+.');
    expect(normalizeChord('mod++', true)).toBe('mod++');
    expect(normalizeChord('esc', true)).toBe('escape');
  });

  it('letters by physical key: a Russian layout gives the same chord', () => {
    expect(chordOf(ev('л', 'KeyK', { metaKey: true }), true)).toBe('mod+k');
    expect(chordOf(ev('з', 'KeyP', { ctrlKey: true }), false)).toBe('mod+p');
    expect(chordOf(ev('о', 'KeyJ', { metaKey: true, shiftKey: true }), true)).toBe('mod+shift+j');
    // ⌥ on a Mac changes the key (⌥B → ∫) — the physical key wins
    expect(chordOf(ev('∫', 'KeyB', { metaKey: true, altKey: true }), true)).toBe('mod+alt+b');
  });

  it('punctuation and digits under ⌘/Ctrl by physical key', () => {
    expect(chordOf(ev('б', 'Comma', { metaKey: true }), true)).toBe('mod+,');
    expect(chordOf(ev('.', 'Slash', { metaKey: true }), true)).toBe('mod+/');
    expect(chordOf(ev('+', 'Equal', { metaKey: true, shiftKey: true }), true)).toBe('mod+=');
    expect(chordOf(ev('-', 'Minus', { ctrlKey: true }), false)).toBe('mod+-');
    expect(chordOf(ev('0', 'Digit0', { metaKey: true }), true)).toBe('mod+0');
    // without ⌘ — the character itself (the «.» key of a Russian layout is «ю»)
    expect(chordOf(ev('?', 'Digit7', { shiftKey: true }), true)).toBe('?');
    expect(chordOf(ev('+', 'Equal', { shiftKey: true }), true)).toBe('+');
  });

  it('Mac vs not: ⌘ is mod on a Mac, Ctrl elsewhere; Control on a Mac is ctrl', () => {
    expect(chordOf(ev('k', 'KeyK', { ctrlKey: true }), true)).toBe('ctrl+k');
    expect(chordOf(ev('k', 'KeyK', { ctrlKey: true }), false)).toBe('mod+k');
    expect(chordOf(ev('k', 'KeyK', { metaKey: true }), false)).toBe('k');
  });

  it('recording waits for a non-modifier key', () => {
    expect(recordChord(ev('Meta', 'MetaLeft', { metaKey: true }), true)).toBeNull();
    expect(recordChord(ev('Shift', 'ShiftLeft', { metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(recordChord(ev('J', 'KeyJ', { metaKey: true, shiftKey: true }), true)).toBe('mod+shift+j');
  });

  it('text chords', () => {
    expect(isTextChord('a', true)).toBe(true);
    expect(isTextChord('?', true)).toBe(true);
    expect(isTextChord('shift+enter', true)).toBe(true);
    expect(isTextChord('escape', true)).toBe(false);
    expect(isTextChord('f3', true)).toBe(false);
    expect(isTextChord('mod+k', true)).toBe(false);
    expect(isTextChord('alt+arrowdown', true)).toBe(false);
  });
});

describe('platform', () => {
  it('navigator.platform first (headless Chromium says «Windows» in userAgentData on a Mac)', () => {
    const was = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const set = (v: unknown) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
    try {
      set({ platform: 'MacIntel', userAgentData: { platform: 'Windows' } });
      expect(isMac()).toBe(true);
      set({ platform: 'Win32' });
      expect(isMac()).toBe(false);
      set({ platform: '', userAgentData: { platform: 'macOS' } });
      expect(isMac()).toBe(true);
      set(undefined);
      expect(isMac()).toBe(false);
    } finally {
      if (was) Object.defineProperty(globalThis, 'navigator', was);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});

describe('hints', () => {
  it('Mac symbols, words elsewhere', () => {
    expect(formatChord('mod+shift+j', true)).toBe('⌘⇧J');
    expect(formatChord('mod+shift+j', false)).toBe('Ctrl+Shift+J');
    expect(formatChord('mod+alt+b', true)).toBe('⌘⌥B');
    expect(formatChord('alt+arrowdown', false)).toBe('Alt+↓');
    expect(formatChord('mod+-', true)).toBe('⌘−');
    expect(formatChord('escape', true)).toBe('Esc');
    expect(formatChord('f3', true)).toBe('F3');
    expect(formatChord('ctrl+.', true)).toBe('⌃.');
  });

  it('keyHint — the first key of the action; unbound — empty', () => {
    const t: Binding[] = [{ action: 'a', keys: ['mod+d', 'shift+d'] }, { action: 'b', keys: [] }];
    expect(keyHint('a', t, true)).toBe('⌘D');
    expect(keyHint('b', t, true)).toBe('');
    expect(keyHint('c', t, true)).toBe('');
  });
});

describe('when and text fields', () => {
  const table: Binding[] = [
    { action: 'palette', keys: ['mod+k'] },
    { action: 'help', keys: ['?', 'mod+/'] },
    { action: 'close', keys: ['escape'], when: 'overlay' },
    { action: 'cancel', keys: ['escape'], when: '!overlay && running' },
    { action: 'next', keys: ['alt+arrowdown'], when: '!editable' },
    { action: 'send', keys: ['enter'], when: 'editable && composer' },
  ];

  it('evalWhen: !, &&, ||, unknown is false', () => {
    expect(evalWhen(undefined, {})).toBe(true);
    expect(evalWhen('a && !b', { a: true })).toBe(true);
    expect(evalWhen('a && !b', { a: true, b: true })).toBe(false);
    expect(evalWhen('a || b', { b: true })).toBe(true);
    expect(evalWhen('zzz', {})).toBe(false);
  });

  it('a text chord in a field is the field’s; ⌘-chords and Esc are not', () => {
    const editable = { mac: true, context: { editable: true } };
    expect(actionOf(ev('?', 'Slash', { shiftKey: true }), table, editable)).toBeNull();
    expect(actionOf(ev('?', 'Slash', { shiftKey: true }), table, { mac: true })).toBe('help');
    expect(actionOf(ev('k', 'KeyK', { metaKey: true }), table, editable)).toBe('palette');
    expect(actionOf(ev('Escape', 'Escape'), table, { mac: true, context: { editable: true, running: true } })).toBe('cancel');
    // `when` that names `editable` takes the field
    expect(actionOf(ev('Enter', 'Enter'), table, { mac: true, context: { editable: true, composer: true } })).toBe('send');
    expect(actionOf(ev('ArrowDown', 'ArrowDown', { altKey: true }), table, editable)).toBeNull();
  });

  it('one chord, different `when`: the live one', () => {
    expect(actionOf(ev('Escape', 'Escape'), table, { mac: true, context: { overlay: true, running: true } })).toBe('close');
    expect(actionOf(ev('Escape', 'Escape'), table, { mac: true, context: { running: true } })).toBe('cancel');
    expect(actionOf(ev('Escape', 'Escape'), table, { mac: true, context: {} })).toBeNull();
  });
});

describe('collisions', () => {
  it('same chord and same `when` — a collision; different `when` — not', () => {
    const t: Binding[] = [
      { action: 'a', keys: ['mod+k'] },
      { action: 'b', keys: ['cmd+K'] },
      { action: 'c', keys: ['escape'], when: 'x' },
      { action: 'd', keys: ['escape'], when: '!x' },
      { action: 'e', keys: ['ctrl+.'] },
      { action: 'f', keys: ['mod+.'] },
    ];
    expect(collisions(t, true)).toEqual([['mod+k', ['a', 'b']]]);
    // off a Mac Ctrl and ⌘ are one key
    expect(collisions(t, false)).toEqual([
      ['mod+k', ['a', 'b']],
      ['mod+.', ['e', 'f']],
    ]);
    expect(bindingsOf('escape', t, true).map((b) => b.action)).toEqual(['c', 'd']);
  });
});

describe('layers', () => {
  const core = { source: 'core', bindings: [{ action: 'palette', keys: ['mod+k'] }, { action: 'bottom', keys: ['mod+j'], title: 'Panel' }] };
  const plugin = { source: 'plugin:x', bindings: [{ action: 'x.open', keys: ['mod+shift+x'] }, { action: 'palette', keys: ['f1'] }] };

  it('defaults → plugins → user: an upper layer replaces the action, the user replaces keys', () => {
    const t = resolve([core, plugin], { bottom: ['mod+shift+j'] });
    expect(t).toEqual([
      { action: 'palette', keys: ['f1'], source: 'plugin:x' },
      { action: 'bottom', keys: ['mod+shift+j'], title: 'Panel', source: 'user' },
      { action: 'x.open', keys: ['mod+shift+x'], source: 'plugin:x' },
    ]);
    expect(actionOf(ev('j', 'KeyJ', { metaKey: true, shiftKey: true }), t, { mac: true })).toBe('bottom');
    expect(actionOf(ev('j', 'KeyJ', { metaKey: true }), t, { mac: true })).toBeNull();
  });

  it('the user can unbind; `when` survives an override', () => {
    const t = resolve([{ source: 'core', bindings: [{ action: 'cancel', keys: ['escape'], when: 'running' }] }], { cancel: ['mod+.'] });
    expect(t).toEqual([{ action: 'cancel', keys: ['mod+.'], when: 'running', source: 'user' }]);
    expect(resolve([core], { palette: [] })[0]).toEqual({ action: 'palette', keys: [], source: 'user' });
  });

  it('overrides in a storage: round trip, garbage and a broken storage are empty', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const s = localOverrides('keys', storage);
    expect(s.load()).toEqual({});
    s.save({ bottom: ['mod+shift+j'] });
    expect(localOverrides('keys', storage).load()).toEqual({ bottom: ['mod+shift+j'] });
    s.save({});
    expect(mem.has('keys')).toBe(false);
    mem.set('keys', '{bad');
    expect(s.load()).toEqual({});
    mem.set('keys', JSON.stringify({ a: 'mod+k', b: ['x'] }));
    expect(s.load()).toEqual({ b: ['x'] });
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
    expect(localOverrides('keys', broken).load()).toEqual({});
    expect(() => localOverrides('keys', broken).save({ a: ['x'] })).not.toThrow();
  });
});
