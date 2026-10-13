// @notrealstudio/keymap — hot keys as data. A table of bindings `{action, keys, when?}` in layers
// (scheme defaults → plugins → the user's overrides), a chord grammar, matching a key event to an
// action, collisions, hints for tooltips. Pure: no DOM beyond reading a KeyboardEvent-like object;
// the overrides' storage is one seam (`load/save`). Grew out of Trempel's editor keymap (MIT).
//
// A chord is `mod+ctrl+shift+alt+<key>`: mod — ⌘ on a Mac, Ctrl elsewhere; ctrl — the Control key
// itself (Blender's Ctrl+. on a Mac too). Letters match by physical key (event.code), so a Russian
// layout gives the same chords; digits and punctuation under ⌘/Ctrl — by physical key as well
// (⌘, on a Russian layout is «⌘б» by event.key); other keys by event.key.

/** One line of the table: an action and its chords. `A` — the caller's action ids. */
export interface Binding<A extends string = string> {
  action: A;
  /** Chords; the first is the one hints show. `[]` — the action is unbound. */
  keys: readonly string[];
  /** For the palette and the help line. */
  title?: string;
  /**
   * When the binding is live, over the caller's context: `name`, `!name`, `&&`, `||`
   * (`'!editable && !palette'`). No `when` — always, except the default rule for text fields
   * (see {@link actionOf}).
   */
  when?: string;
}

/** A binding with its layer: where it came from (`core`, `plugin:<id>`, `user`). */
export interface SourcedBinding<A extends string = string> extends Binding<A> {
  source: string;
}

/** A layer of the table: scheme defaults, a plugin's keys, … */
export interface Layer<A extends string = string> {
  source: string;
  bindings: readonly Binding<A>[];
}

/** The user's overrides: action → chords (`[]` — unbound by hand). */
export type Overrides<A extends string = string> = Partial<Record<A, readonly string[]>>;

/** The source of an override's line in {@link resolve}. */
export const USER = 'user';

/**
 * The live table from layers, bottom to top, and the user's overrides on top. A layer that names
 * an action replaces everything the layers below said about it (a plugin's scheme over the
 * defaults); an override replaces the keys and keeps `when` and `title` of what it overrides.
 * Order — of an action's first appearance.
 */
export function resolve<A extends string>(layers: readonly Layer<A>[], overrides: Overrides<A> = {}): SourcedBinding<A>[] {
  const by = new Map<A, SourcedBinding<A>[]>();
  for (const l of layers) {
    const mine = new Map<A, SourcedBinding<A>[]>();
    for (const b of l.bindings) {
      const list = mine.get(b.action) ?? [];
      list.push({ ...b, keys: [...b.keys], source: l.source });
      mine.set(b.action, list);
    }
    for (const [action, list] of mine) by.set(action, list);
  }
  for (const action of Object.keys(overrides) as A[]) {
    const keys = overrides[action];
    if (!keys) continue;
    const was = by.get(action)?.[0];
    by.set(action, [
      {
        action,
        keys: [...keys],
        source: USER,
        ...(was?.title !== undefined ? { title: was.title } : {}),
        ...(was?.when !== undefined ? { when: was.when } : {}),
      },
    ]);
  }
  return [...by.values()].flat();
}

// ────────────────────────────────────────────────────────────────────────────
// Chords
// ────────────────────────────────────────────────────────────────────────────

const MODS = ['mod', 'ctrl', 'shift', 'alt'] as const;

const MOD_ALIAS: Record<string, string> = {
  cmd: 'mod',
  command: 'mod',
  meta: 'mod',
  control: 'ctrl',
  option: 'alt',
  opt: 'alt',
};

const KEY_ALIAS: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  ' ': 'space',
};

/** A chord written canonically: modifiers in the order mod, ctrl, shift, alt; the key lower-case. */
export function normalizeChord(chord: string, mac: boolean): string {
  const parts = chord.toLowerCase().split('+');
  let key = parts.pop()!;
  if (key === '' && chord.endsWith('+')) key = '+'; // "+" itself
  key = KEY_ALIAS[key] ?? key;
  const mods = new Set(parts.filter(Boolean).map((m) => MOD_ALIAS[m] ?? m));
  // on a non-Mac ⌘ is Ctrl: «mod» and «ctrl» are one key
  if (!mac && mods.has('ctrl')) {
    mods.delete('ctrl');
    mods.add('mod');
  }
  return [...MODS.filter((m) => mods.has(m)), key].join('+');
}

/** The chord's key and modifiers. */
export function parseChord(chord: string, mac: boolean): { key: string; mods: Set<string> } {
  const parts = normalizeChord(chord, mac).split('+');
  let key = parts.pop()!;
  if (key === '') key = '+';
  return { key, mods: new Set(parts.filter(Boolean)) };
}

export interface KeyLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Punctuation by physical key under ⌘/Ctrl: a Russian layout has letters there. */
const PUNCT: Record<string, string> = {
  Period: '.',
  Comma: ',',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Backslash: '\\',
};

/** The chord of a key event (letters by physical key: a Russian layout gives the same chord). */
export function chordOf(e: KeyLike, mac: boolean): string {
  let key = e.key.toLowerCase();
  const held = e.metaKey || e.ctrlKey;
  if (e.code && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (e.code && /^Digit\d$/.test(e.code) && held) key = e.code.slice(5);
  else if (e.code && held && PUNCT[e.code] !== undefined) key = PUNCT[e.code]!;
  key = KEY_ALIAS[key] ?? key;
  const mods: string[] = [];
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod) mods.push('mod');
  if (mac && e.ctrlKey) mods.push('ctrl');
  // Shift is part of the character for + and _ (and the like): not a modifier there
  if (e.shiftKey && !(key.length === 1 && !/[a-z0-9.]/.test(key))) mods.push('shift');
  if (e.altKey) mods.push('alt');
  return [...mods, key].join('+');
}

const MODIFIER_KEYS = new Set(['meta', 'control', 'shift', 'alt', 'altgraph', 'capslock', 'fn', 'os', 'hyper', 'super']);

/** A chord being recorded (a click on a key in a «Keys» screen): `null` while only modifiers are down. */
export function recordChord(e: KeyLike, mac: boolean): string | null {
  if (MODIFIER_KEYS.has(e.key.toLowerCase())) return null;
  return chordOf(e, mac);
}

/**
 * A chord that types or edits text: no ⌘/Ctrl/⌥ and not Escape or F1–F24. In a text field such
 * chords belong to the field.
 */
export function isTextChord(chord: string, mac: boolean): boolean {
  const { key, mods } = parseChord(chord, mac);
  if (mods.has('mod') || mods.has('ctrl') || mods.has('alt')) return false;
  return key !== 'escape' && !/^f\d{1,2}$/.test(key);
}

// ────────────────────────────────────────────────────────────────────────────
// Context and matching
// ────────────────────────────────────────────────────────────────────────────

/** Context keys for `when`: `editable` (focus in a text field), `palette`, `fullscreen`, the caller's own. */
export type KeyContext = Readonly<Record<string, boolean | undefined>>;

/** A `when` expression over the context: `||` of `&&` of `name` / `!name`. Empty — true. */
export function evalWhen(when: string | undefined, ctx: KeyContext): boolean {
  if (!when || when.trim() === '') return true;
  return when.split('||').some((any) =>
    any.split('&&').every((term) => {
      const t = term.trim();
      const neg = t.startsWith('!');
      const name = (neg ? t.slice(1) : t).trim();
      return Boolean(ctx[name]) !== neg;
    }),
  );
}

/** The context keys a `when` reads. */
export function whenKeys(when: string | undefined): string[] {
  if (!when) return [];
  return [...new Set(when.split(/\|\||&&/).map((t) => t.trim().replace(/^!\s*/, '')).filter(Boolean))];
}

export interface MatchOptions {
  mac: boolean;
  context?: KeyContext;
}

/** Is this binding live for this chord in this context. */
export function live(b: Binding, chord: string, opts: MatchOptions): boolean {
  const ctx = opts.context ?? {};
  for (const k of b.keys) {
    const c = normalizeChord(k, opts.mac);
    if (c !== chord) continue;
    // the default rule: a text chord in a text field is the field's — unless `when` speaks of `editable`
    if (ctx.editable && isTextChord(c, opts.mac) && !whenKeys(b.when).includes('editable')) continue;
    if (evalWhen(b.when, ctx)) return true;
  }
  return false;
}

/**
 * The action bound to a key event (null — none): the first live binding, top layers first is the
 * caller's order (use {@link resolve}). In a text field (`context.editable`) a chord without
 * ⌘/Ctrl/⌥ — a letter, `?`, Enter, arrows — is not intercepted unless the binding's `when` names
 * `editable`.
 */
export function actionOf<A extends string>(e: KeyLike, bindings: readonly Binding<A>[], opts: MatchOptions): A | null {
  const chord = chordOf(e, opts.mac);
  for (const b of bindings) if (live(b, chord, opts)) return b.action;
  return null;
}

/** The bindings of a chord, whatever the context (for a «this chord is taken» warning). */
export function bindingsOf<A extends string>(chord: string, bindings: readonly Binding<A>[], mac: boolean): Binding<A>[] {
  const c = normalizeChord(chord, mac);
  return bindings.filter((b) => b.keys.some((k) => normalizeChord(k, mac) === c));
}

/**
 * Chord collisions: one chord, several actions, the same `when` ([chord, actions]). Bindings
 * under different `when` (Esc closes a dialog / Esc cancels a run) are not a collision.
 */
export function collisions<A extends string>(bindings: readonly Binding<A>[], mac: boolean): [string, A[]][] {
  const by = new Map<string, Set<A>>();
  for (const b of bindings)
    for (const k of b.keys) {
      const c = normalizeChord(k, mac);
      const at = `${c}\u0000${(b.when ?? '').replace(/\s+/g, '')}`;
      if (!by.has(at)) by.set(at, new Set());
      by.get(at)!.add(b.action);
    }
  const out = new Map<string, Set<A>>();
  for (const [at, a] of by) {
    if (a.size < 2) continue;
    const c = at.split('\u0000')[0]!;
    const set = out.get(c) ?? new Set<A>();
    for (const x of a) set.add(x);
    out.set(c, set);
  }
  return [...out].map(([c, a]) => [c, [...a]]);
}

// ────────────────────────────────────────────────────────────────────────────
// Hints
// ────────────────────────────────────────────────────────────────────────────

const MAC_NAMES: Record<string, string> = { mod: '⌘', ctrl: '⌃', shift: '⇧', alt: '⌥' };
const PC_NAMES: Record<string, string> = { mod: 'Ctrl+', ctrl: 'Ctrl+', shift: 'Shift+', alt: 'Alt+' };
const KEY_NAMES: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  delete: 'Del',
  backspace: '⌫',
  space: 'Space',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
  '-': '−',
};

/** A chord for people: «⌘⇧J» on a Mac, «Ctrl+Shift+J» elsewhere. */
export function formatChord(chord: string, mac: boolean): string {
  const { key, mods } = parseChord(chord, mac);
  const names = mac ? MAC_NAMES : PC_NAMES;
  const k = KEY_NAMES[key] ?? (/^f\d{1,2}$/.test(key) ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1));
  return MODS.filter((m) => mods.has(m)).map((m) => names[m]).join('') + k;
}

/** The first key of an action, for hints («G», «⌘D»); '' — unbound. */
export function keyHint<A extends string>(action: A, bindings: readonly Binding<A>[], mac: boolean): string {
  const k = bindings.find((x) => x.action === action && x.keys.length > 0)?.keys[0];
  return k ? formatChord(k, mac) : '';
}

/** All keys of an action, in the table's order. */
export function keysOf<A extends string>(action: A, bindings: readonly Binding<A>[]): string[] {
  return bindings.filter((b) => b.action === action).flatMap((b) => [...b.keys]);
}

/** Running on a Mac (⌘ is `mod`). Outside a browser — false. */
export function isMac(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string; userAgentData?: { platform?: string }; userAgent?: string } }).navigator;
  if (!nav) return false;
  const p = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '';
  return /mac|iphone|ipad|ipod/i.test(p);
}

// ────────────────────────────────────────────────────────────────────────────
// Overrides storage — one seam
// ────────────────────────────────────────────────────────────────────────────

export interface OverridesStore<A extends string = string> {
  load(): Overrides<A>;
  save(overrides: Overrides<A>): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Overrides in localStorage (or any Storage-like) under one key. A private window or a broken
 * value — empty overrides; the table lives for the page.
 */
export function localOverrides<A extends string = string>(key: string, storage?: StorageLike): OverridesStore<A> {
  const store = (): StorageLike | null => storage ?? ((globalThis as { localStorage?: StorageLike }).localStorage ?? null);
  return {
    load() {
      try {
        const raw = store()?.getItem(key);
        if (!raw) return {};
        const v = JSON.parse(raw) as unknown;
        if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
        const out: Record<string, string[]> = {};
        for (const [a, keys] of Object.entries(v)) if (Array.isArray(keys) && keys.every((k) => typeof k === 'string')) out[a] = keys;
        return out as unknown as Overrides<A>;
      } catch {
        return {};
      }
    },
    save(overrides) {
      try {
        const s = store();
        if (!s) return;
        if (Object.keys(overrides).length === 0) s.removeItem(key);
        else s.setItem(key, JSON.stringify(overrides));
      } catch {
        // private window: the overrides live for the page
      }
    },
  };
}
