# timer

A command-line-style pomodoro / countdown timer that runs in your browser. **HTML / CSS / JS** *only*. Open **`timer.html`** and go. No server necessary. Session history lives in **localStorage**.

The project follows a standard **HTML / CSS / JS** stack with each covering the **page, style, and logic** respectively.

**Docs:** this README is the full reference. In-app **help** copy lives in **`timer.html`** (`#help-body`); short hints only.

**Code map:** in **`timer.js`**, search for `// =========` — sections are **CONSTANTS**, **STORE**, **CHIME**, **UI**, **COMMANDS**, **ENTRY**.

**Storage keys:** `timer_log` (session history JSON array), `timer_settings` (JSON: `workMin`, `breakMin`, `sound`, `light` — defaults 25, 5, true, false).

---

## Commands

Type a line and press **enter**.

| Command | Notes |
| ------- | ----- |
| **start** | `start` uses the default work duration (25 min). `start N` sets an explicit duration in minutes. Interrupts any active session, logging elapsed time as partial. |
| **break** | `break` uses the default break duration (5 min). `break N` sets an explicit duration. |
| **pause** | Pauses the running timer. Countdown freezes. |
| **resume** | Resumes a paused timer. |
| **stop** | Stops the current session and discards the remainder. Elapsed time is logged as a partial session. |
| **extend** | `extend N` — adds *N* minutes to the current session (running or paused). |
| **status** | Shows current session state, type, and remaining time in the feedback bar. |
| **log** | Opens the session log panel. Sessions are grouped by day with a daily focus total. |
| **clear log** | Clears all session history from localStorage. |
| **settings** | Opens the settings panel. Adjustable: default work/break durations, chime on/off, light mode. Saved immediately on change. |
| **help** | Opens the help panel. |

**Line input:** **↑** recalls last command when empty; **↓** clears.

**Mouse:** **log** header button opens session log; click empty area to refocus input.

---

## Display

The large countdown shows remaining time. The progress bar fills left-to-right as the session runs. Colors shift by state: **gold** for work, **green** for break, **grey** for paused.

The tab title updates live (e.g. `▶ 23:47 — timer`) so the countdown is visible when minimized.

A soft three-tone chime plays on session completion if sound is enabled and the browser allows it. The chime is synthesized via Web Audio — no external files required.

Partial sessions (stopped early or interrupted by a new session) are logged and marked accordingly in the session log.

---

Invalid command → short error hint. Success/error text appears under the input for a few seconds.
