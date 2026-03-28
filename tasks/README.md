# tasks

Do you **hate using your mouse**. Maybe you're tired of bloated apps, but you don't want to manage everything in a test file. 

Tasks is a command line-style to-do list that runs right in your browser. **HTML / CSS / JS** only — open `**tasks.html`** (double-click works). State lives in `**localStorage**`.


| File         | Purpose                                                  |
| ------------ | -------------------------------------------------------- |
| `tasks.html` | Page                                                     |
| `tasks.css`  | Styles                                                   |
| `tasks.js`   | Logic |


**Docs:** this README is the full reference. In-app **help** copy lives in **`tasks.html`** (`#help-body`); short hints only.

**Code map:** in `**tasks.js`**, search for `// =========` — sections are **CONSTANTS**, **STORE**, **DUE**, **FONT**, **UI**, **COMMANDS**, **ENTRY**.

**Storage keys:** `tasks` (task list JSON), `tasks_font` (font preset id), `tasks_settings` (JSON: `requireAddKeyword`, `lightMode` — both default false; off means plain-line add and dark theme).

---

## Commands

Type a line and press **Enter**. If **add** is optional (default), a line that is not another command is treated like `**add …`**. If **Require `add` keyword** is on in **settings**, only the `**add`** form adds tasks; other non-commands show the unknown-command hint.


| Area                    | Notes                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **add**                 | `add …` always works. Example: `add buy milk due tomorrow`. Dates: `due mm/dd`, `due today`/`tdy`/`tonight`/`tn`, `due tomorrow`/`tmrw`, `due:mm/dd`, `@mm/dd` (year optional).                   |
| **settings**            | Opens the **settings** panel (same centered layout as **help** / **finished**). Toggles **Require `add` keyword** and **Light mode** (default off = dark); saved in `**localStorage`**. |
| **edit**                | `edit N …` — *N*th open task (or *N*th visible row if **find** is on). `edit word …` — match task by substring, then new text. Clearing due in the new text clears the task’s due. |
| **defer**               | `defer N due` or `defer … due` — last word is the due; leading text matches an open task name. Same date tokens as **add**.                                                        |
| **find**                | Substring filter on open tasks. `find` / `find clear` clears. With a filter, **#**-based commands use the visible list.                                                            |
| **sort**                | `sort due` or `sort added` (alias `created`) — reorders open tasks only.                                                                                                           |
| **done** / **finish**   | Number, `all`/`*`, or substring. Open tasks only for matching.                                                                                                                     |
| **rm**                  | Number, `all`/`*`, or substring — open tasks for bulk; substring can hit finished if no open match.                                                                                |
| **clear**               | `clear` / `clear all` — everything. `clear finished` — finished only.                                                                                                              |
| **export**              | `export` → **`tasks.json`**. `export name` → **`name.json`**. `export name.json` allowed if the base name uses only letters, digits, `.`, `-`, `_`. Same JSON shape as the `tasks` `localStorage` value. |
| **import**              | `import` (no arguments) opens a **file** picker; choose any `.json` (or related) file. Replaces the list from an array or `{ "tasks": [ … ] }`. Clear errors if the file isn’t valid JSON or the right shape. **`undo`** restores prior. |
| **undo**                | One step; exact word `undo`. Covers add/edit/defer/done/rm/clear/sort, **import**, and **#** clicks.                                                                                 |
| **help** / **finished** | Centered panels + backdrop. Close: button, backdrop, **Enter**, **Esc**.                                                                                                           |
| **font**                | `font` / `font list`, `font 1`–`4` or preset names, `font reset`. Not part of undo.                                                                                                |


**Line input:** **↑** recalls last line when empty; **↓** clears.

**Mouse:** **#** toggles done; **finished** header opens done tasks; click task name to edit (**Enter** save, **Esc** cancel).

---

Invalid command → short error hint. Success/error text appears under the input for a few seconds.