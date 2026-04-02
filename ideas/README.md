# ideas

A command-line-style ideas/notepad app that runs locally in your browser. **HTML / CSS / JS** *only*. Open **`timer.html`** and go. No server necessary. Session history lives in **localStorage**.

The project follows a standard **HTML / CSS / JS** stack with each covering the **page, style, and logic** respectively.

**Docs:** this README is the full reference. In-app **help** copy lives in **`ideas.html`** (`#help-body`); short hints only.

**Code map:** in **`tasks.js`**, search for `// =========` — sections are **CONSTANTS**, **STORE**, **DUE**, **FONT**, **UI**, **COMMANDS**, **ENTRY**.

**Storage keys:** `timer_log` (session history JSON array), `timer_settings` (JSON: `workMin`, `breakMin`, `sound`, `light` — defaults 25, 5, true, false).

---

**Storage keys:** `tasks` (task list JSON), `tasks_font` (font preset id), `tasks_settings` (JSON: `requireAddKeyword`, `lightMode` — both default false; off means plain-line add and dark theme).

---

## Commands

Type a line and press **enter**. If **add** is optional (default), a line that is not another command is treated like **`add …`**. If **require `add` keyword** is on in **settings**, only the **`add …`** form adds ideas; other non-commands show the unknown-command hint.


| Commands                | Notes
| ----------------------- | ---
| **add**                 | `add …` always works. Example: `add I should call her`.
| **edit**                | `edit N …` : *N*th open idea (or *N*th visible row if **find** is on). `edit idea …` : match idea by substring, then new text.
| **find**                | Substring filter on open ideas. `find` / `find clear` clears. With a filter, **#**-based commands use the visible list.
| **sort**                | `sort due` or `sort added` (alias `created`).
| **archive**             | Number, `all`/`*`, or substring. Open ideas only for matching.
| **rm**                  | Number, `all`/`*`, or substring. Works with substrings.
| **clear**               | `clear` / `clear all` : everything. `clear archives` : archives only.
| **undo**                | One step; `undo`.
| **font**                | `font` / `font list`, `font 1`–`4` or preset names, `font reset`
| **import**              | `import` (no arguments) opens a **file** picker; choose a compatible `.json` file.
| **export**              | `export` → **`ideas.json`**. `export name` → **`ideas.json`**. Same JSON shape as the `ideas` `localStorage` value.
| **archived**            | Opens **archived** task panel.
| **help**                | Opens the **help** panel with information on commands.
| **settings**            | Opens the **settings** panel. Toggles **require `add` keyword** and **light mode**. Saved in **localStorage**. 



**Line input:** **↑** navigates backwards through up to 5 previous commands; **↓** moves forward through history and clears the input after the most recent entry is reached. Denote this does mean that the pending input is lost.

**Mouse:** pressing any **#** toggles done; **finished** header opens done tasks; click task name to edit (**Enter** save, **Esc** cancel).

---

Invalid command → short error hint. Success/error text appears under the input for a few seconds.