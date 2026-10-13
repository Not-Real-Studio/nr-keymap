# @notrealstudio/keymap

Горячие клавиши как данные. Таблица привязок `{action, keys, when?}` слоями (умолчания схемы →
привязки плагинов → переопределения пользователя), аккорды по физической клавише (русская раскладка
даёт те же сочетания), контекст `when`, коллизии, подсказки для тултипов («⌘⇧J» / «Ctrl+Shift+J»).
Без зависимостей и без DOM: читает только объект, похожий на `KeyboardEvent`. Выросло из keymap
редактора Trempel (MIT); им пользуются Trempel и NRChat.

```
npm i @notrealstudio/keymap
```

## Быстрый старт

```ts
import { actionOf, collisions, isMac, keyHint, localOverrides, resolve, type Layer } from '@notrealstudio/keymap'

type Action = 'palette' | 'panel.bottom' | 'help' | 'cancel'
const core: Layer<Action> = {
  source: 'core',
  bindings: [
    { action: 'palette', keys: ['mod+k'] },
    { action: 'panel.bottom', keys: ['mod+j'] },
    { action: 'help', keys: ['?', 'mod+/'] },          // «?» в поле ввода не перехватывается
    { action: 'cancel', keys: ['escape'], when: 'running' },
  ],
}
const store = localOverrides<Action>('my-app.keys')      // шов хранения: load/save
const table = resolve([core /*, слои плагинов */], store.load())
const mac = isMac()

addEventListener('keydown', (e) => {
  const editable = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
  const action = actionOf(e, table, { mac, context: { editable, running: isRunning() } })
  if (action) { e.preventDefault(); run(action) }
})

button.title = `Нижняя панель (${keyHint('panel.bottom', table, mac)})`   // «⌘J»
console.warn(collisions(table, mac))                                       // [['mod+k', ['palette', 'x']]]
```

## Аккорд

`mod+ctrl+shift+alt+<клавиша>`, регистр не важен, порядок модификаторов любой (`normalizeChord`
приводит к каноническому).

- `mod` — ⌘ на Mac, Ctrl иначе; `ctrl` — сама клавиша Control (на не-Mac `ctrl` и `mod` — одно).
- Буквы — по физической клавише (`event.code`); цифры и пунктуация при ⌘/Ctrl — тоже (⌘, на русской
  раскладке — «⌘б» по `event.key`); прочее — по `event.key` (`?`, `+`, `f3`, `escape`, `arrowdown`).
- Shift — часть символа у `+`, `_`, `?` и подобных: `shift+=` записывается как `+`.
- Синонимы: `cmd`/`meta` → `mod`, `opt`/`option` → `alt`, `esc`, `del`, `up`/`down`/`left`/`right`.

## API

| | |
|---|---|
| `resolve(layers, overrides?)` | живая таблица: слой, назвавший действие, заменяет всё, что о нём сказали нижние; переопределение заменяет клавиши (`[]` — снять), `when` и `title` остаются; источник строки — `source` слоя или `'user'` |
| `actionOf(e, table, {mac, context})` | действие события или `null`. В поле ввода (`context.editable`) аккорд без ⌘/Ctrl/⌥ (буква, `?`, Enter, стрелки) не перехватывается, если `when` привязки не упоминает `editable`; Esc и F-клавиши — перехватываются |
| `chordOf(e, mac)`, `recordChord(e, mac)` | аккорд события; запись — `null`, пока зажаты только модификаторы |
| `evalWhen(expr, ctx)` | `name`, `!name`, `&&`, `\|\|`; неизвестное имя — false |
| `collisions(table, mac)` | `[аккорд, действия][]`: один аккорд, несколько действий, один и тот же `when` |
| `bindingsOf(chord, table, mac)` | кто занимает аккорд (предупреждение при записи) |
| `keyHint(action, table, mac)`, `formatChord(chord, mac)` | «⌘⇧J» на Mac, «Ctrl+Shift+J» иначе; `''` — не назначено |
| `keysOf(action, table)`, `isTextChord`, `normalizeChord`, `parseChord`, `isMac()` | |
| `localOverrides(key, storage?)` | переопределения в localStorage (или любом Storage): `{load, save}`; приватное окно — пусто, живут до перезагрузки |

## Лицензия

MIT
