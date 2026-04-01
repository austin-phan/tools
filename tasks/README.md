# tasks

Do you **hate using your mouse?** Maybe you're tired of bloated apps taking forever to load and autostarting, but you don't want to manage everything in a text file.

Tasks is a command-line-style to-do list that runs in your browser. **HTML / CSS / JS** *only*. That means, you can open **`tasks.html`** and get going. No server hosting necessary. The current state lives in **localStorage**.

The project follows a standard **HTML / CSS / JS** stack with each covering the **page, style, and logic** respectively.


**Docs:** this README is the full reference. In-app **help** copy lives in **`tasks.html`** (`#help-body`); short hints only.

**Code map:** in **`tasks.js`**, search for `// =========` — sections are **CONSTANTS**, **STORE**, **DUE**, **FONT**, **UI**, **COMMANDS**, **ENTRY**.

**Storage keys:** `tasks` (task list JSON), `tasks_font` (font preset id), `tasks_settings` (JSON: `requireAddKeyword`, `lightMode` — both default false; off means plain-line add and dark theme).

---

## Commands

Type a line and press **enter**. If **add** is optional (default), a line that is not another command is treated like **`add …`**. If **require `add` keyword** is on in **settings**, only the **`add …`** form adds tasks; other non-commands show the unknown-command hint.


| Commands                | Notes
| ----------------------- | ---
| **add**                 | `add …` always works. Example: `add homework due tomorrow`. Dates: `due mm/dd`, `due today`/`tdy`/`tonight`/`tn`, `due tomorrow`/`tmrw`, `due:mm/dd`, `@mm/dd` (year optional).
| **edit**                | `edit N …` : *N*th open task (or *N*th visible row if **find** is on). `edit word …` : match task by substring, then new text.
| **defer**               | `defer N due` or `defer … due` : last word is the due; leading text matches an open task name. Same date tokens as **add**.
| **find**                | Substring filter on open tasks. `find` / `find clear` clears. With a filter, **#**-based commands use the visible list.
| **sort**                | `sort due` or `sort added` (alias `created`).
| **done** / **finish**   | Number, `all`/`*`, or substring. Open tasks only for matching.
| **rm**                  | Number, `all`/`*`, or substring. Works with substrings.
| **clear**               | `clear` / `clear all` : everything. `clear finished` : finished only.
| **undo**                | One step; `undo`.
| **font**                | `font` / `font list`, `font 1`–`4` or preset names, `font reset`
| **import**              | `import` (no arguments) opens a **file** picker; choose a compatible `.json` file.
| **export**              | `export` → **`tasks.json`**. `export name` → **`name.json`**. Same JSON shape as the `tasks` `localStorage` value.
| **finished**            | Opens **finished** task panel.
| **help**                | Opens the **help** panel with information on commands.
| **settings**            | Opens the **settings** panel. Toggles **require `add` keyword** and **light mode**. Saved in **localStorage**. 


**Line input:** **↑** navigates backwards through up to 5 previous commands; **↓** moves forward through history and clears the input after the most recent entry is reached. Denote this does mean that the pending input is lost.

**Mouse:** pressing any **#** toggles done; **finished** header opens done tasks; click task name to edit (**Enter** save, **Esc** cancel).

---

Invalid command → short error hint. Success/error text appears under the input for a few seconds.