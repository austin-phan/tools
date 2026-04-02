/**
 * Tasks app (single file, no ES modules — works when opening tasks.html via file://).
 *
 * Layout:
 *   CONSTANTS → STORE → DUE → FONT → UI → COMMANDS → ENTRY
 */
(function () {
  'use strict';

  // =============================================================================
  // CONSTANTS — storage keys, font presets, due regexes, user-facing strings
  // =============================================================================

  /** Clears #feedback after ui.feedback(); module scope avoids a global on `window`. */
  let feedbackHideTimer = null;

  const STORAGE_KEY = 'tasks';
  const FONT_PREF_KEY = 'tasks_font';
  const SETTINGS_KEY = 'tasks_settings';

  /** When true, new tasks must use the `add` keyword; when false (default), plain lines add tasks. */
  let requireAddKeyword = false;

  /** When true, `html` gets class `light`; false (default) is dark mode. */
  let lightMode = false;

  function applyTheme() {
    document.documentElement.classList.toggle('light', lightMode);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        requireAddKeyword = false;
        lightMode = false;
        applyTheme();
        return;
      }
      const o = JSON.parse(raw);
      requireAddKeyword = !!o.requireAddKeyword;
      lightMode = !!o.lightMode;
      applyTheme();
    } catch {
      requireAddKeyword = false;
      lightMode = false;
      applyTheme();
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ requireAddKeyword, lightMode })
      );
    } catch {
      try {
        ui.feedback('could not save settings — storage may be full or blocked', 'error');
      } catch (_) {
        /* ignore */
      }
    }
  }

  const FONT_PRESETS = {
    consolas: {
      label: 'Consolas',
      stack: "ui-monospace, 'Consolas', 'Menlo', 'Monaco', 'Segoe UI Mono', 'Liberation Mono', monospace"
    },
    ubuntu: {
      label: 'Ubuntu Mono',
      stack: "'Ubuntu Mono', 'Liberation Mono', 'DejaVu Sans Mono', ui-monospace, monospace"
    },
    'ui-mono': {
      label: 'ui-monospace',
      stack: 'ui-monospace, monospace'
    },
    courier: {
      label: 'Courier New',
      stack: "'Courier New', Courier, 'Liberation Mono', monospace"
    }
  };

  const FONT_BY_NUM = { 1: 'consolas', 2: 'ubuntu', 3: 'ui-mono', 4: 'courier' };

  const DUE_RELATIVE_ALT = 'today|tdy|tonight|tn|tomorrow|tmrw';
  const DUE_PARSE_PATTERNS = [
    new RegExp(`\\bdue:\\s*(${DUE_RELATIVE_ALT}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)`, 'i'),
    new RegExp(`(?:^|\\s)due\\s+(${DUE_RELATIVE_ALT}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)`, 'i'),
    new RegExp(`@(${DUE_RELATIVE_ALT}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)`, 'i')
  ];

  const MSG_UNKNOWN_CMD =
    'use: add …   edit …   defer …   done …   rm …   clear …   find …   sort …   undo   export   import   help   finished   settings   font';
  const MSG_DEFER_USAGE =
    'use: defer N today | tdy | tonight | tn | tomorrow | tmrw | mm/dd   or   defer text … (same)';

  // =============================================================================
  // STORE — task list state, localStorage, one-step undo, queries / mutations
  // (_render is set from UI once render() exists.)
  // =============================================================================

  let _render = () => {};

  const store = {
    state: {
      tasks: [],
      undoPrev: null,
      cmdHistory: [],
      cmdHistoryIndex: null,
      listFilter: null
    },
    setRender(fn) {
      _render = fn;
    },
    newId() {
      return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    },
    snapshotTasks() {
      return JSON.parse(JSON.stringify(store.state.tasks));
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state.tasks));
      } catch {
        try {
          ui.feedback('could not save tasks — storage may be full or blocked', 'error');
        } catch (_) {
          /* ignore */
        }
      }
    },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        store.state.tasks = raw ? JSON.parse(raw) || [] : [];
      } catch {
        store.state.tasks = [];
      }
      store.state.tasks.forEach(t => {
        if (!t.id) t.id = store.newId();
        if (t.done && t.completedAt == null) t.completedAt = t.created || Date.now();
      });
      store.state.undoPrev = null;
    },
    pushUndo() {
      store.state.undoPrev = store.snapshotTasks();
    },
    popUndo() {
      if (!store.state.undoPrev) return false;
      store.state.tasks = store.state.undoPrev;
      store.state.undoPrev = null;
      store.save();
      _render();
      return true;
    },
    pushCmdHistory(cmd) {
      store.state.cmdHistory.push(cmd);
      if (store.state.cmdHistory.length > 5) store.state.cmdHistory.shift();
      store.state.cmdHistoryIndex = null;
    },
    browseCmdHistory(step) {
      const history = store.state.cmdHistory;
      if (!history.length) return null;
      if (step < 0) {
        if (store.state.cmdHistoryIndex == null) {
          store.state.cmdHistoryIndex = history.length - 1;
        } else if (store.state.cmdHistoryIndex > 0) {
          store.state.cmdHistoryIndex -= 1;
        }
        return history[store.state.cmdHistoryIndex];
      }
      if (store.state.cmdHistoryIndex == null) return '';
      if (store.state.cmdHistoryIndex < history.length - 1) {
        store.state.cmdHistoryIndex += 1;
        return history[store.state.cmdHistoryIndex];
      }
      store.state.cmdHistoryIndex = null;
      return '';
    },
    resetCmdHistoryBrowse() {
      store.state.cmdHistoryIndex = null;
    },
    openTasks() {
      return store.state.tasks.filter(t => !t.done);
    },
    doneTasks() {
      return store.state.tasks
        .filter(t => t.done)
        .slice()
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    },
    visibleOpenTasks() {
      const open = store.openTasks();
      if (store.state.listFilter == null || store.state.listFilter === '') return open;
      return open.filter(t => t.name.toLowerCase().includes(store.state.listFilter));
    },
    findOpenBySubstring(query) {
      const lower = query.toLowerCase();
      return store.openTasks().find(t => t.name.toLowerCase().includes(lower)) || null;
    },
    findAnyTaskBySubstring(query) {
      const lower = query.toLowerCase();
      let hit = store.openTasks().find(t => t.name.toLowerCase().includes(lower));
      if (!hit) hit = store.state.tasks.find(t => t.done && t.name.toLowerCase().includes(lower));
      return hit || null;
    },
    sortOpenTasksInPlace(mode) {
      const open = store.openTasks();
      const done = store.state.tasks.filter(t => t.done);
      if (mode === 'due') {
        open.sort((a, b) => {
          if (!a.due && !b.due) return (b.created || 0) - (a.created || 0);
          if (!a.due) return 1;
          if (!b.due) return -1;
          const c = a.due.localeCompare(b.due);
          if (c !== 0) return c;
          return (b.created || 0) - (a.created || 0);
        });
      } else {
        open.sort((a, b) => (b.created || 0) - (a.created || 0));
      }
      store.state.tasks = open.concat(done);
    },
    removeById(id) {
      const idx = store.state.tasks.findIndex(x => x.id === id);
      if (idx === -1) return null;
      return store.state.tasks.splice(idx, 1)[0];
    },
    toggleDone(id) {
      const t = store.state.tasks.find(x => x.id === id);
      if (!t) return;
      store.pushUndo();
      if (!t.done) {
        t.done = true;
        t.completedAt = Date.now();
      } else {
        t.done = false;
        t.completedAt = null;
      }
      store.save();
      _render();
    }
  };

  // =============================================================================
  // DUE — calendar math, parsing due text on task lines, list-cell due labels
  // =============================================================================

  const due = {
    datePartsToIso(dateStr) {
      const parts = dateStr.split('/');
      const m = parseInt(parts[0]);
      const d = parseInt(parts[1]);
      let y = new Date().getFullYear();
      if (parts[2]) {
        y = parseInt(parts[2]);
        if (y < 100) y += 2000;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    },
    isoDateFromLocal(d) {
      const y = d.getFullYear();
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },
    todayIso() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return due.isoDateFromLocal(d);
    },
    tomorrowIso() {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return due.isoDateFromLocal(d);
    },
    dueOffsetDays(dueIso) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dt = new Date(dueIso + 'T00:00:00');
      return Math.round((dt - today) / 86400000);
    },
    dueTokenToIso(token) {
      const s = String(token).toLowerCase();
      if (s === 'today' || s === 'tdy' || s === 'tonight' || s === 'tn') return due.todayIso();
      if (s === 'tomorrow' || s === 'tmrw') return due.tomorrowIso();
      return due.datePartsToIso(token);
    },
    parseDueOnly(raw) {
      const s = raw.trim().toLowerCase();
      if (s === 'today' || s === 'tdy' || s === 'tonight' || s === 'tn') return due.todayIso();
      if (s === 'tomorrow' || s === 'tmrw') return due.tomorrowIso();
      const m = s.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
      if (m) return due.datePartsToIso(m[1]);
      return null;
    },
    dueHuman(iso) {
      if (!iso) return '';
      if (iso === due.todayIso()) return 'today';
      if (iso === due.tomorrowIso()) return 'tomorrow';
      return iso.slice(5).replace('-', '/');
    },
    parseInput(raw) {
      let dueVal = null;
      let name = raw;
      for (const re of DUE_PARSE_PATTERNS) {
        const match = raw.match(re);
        if (match) {
          dueVal = due.dueTokenToIso(match[1]);
          name = raw.replace(re, ' ').replace(/\s+/g, ' ').trim();
          break;
        }
      }
      return { name, due: dueVal };
    },
    applyEditTaskFromParsed(t, rawText) {
      const parsed = due.parseInput(rawText.trim());
      if (!parsed.name && parsed.due === null) return false;
      if (parsed.name) t.name = parsed.name;
      t.due = parsed.due;
      return true;
    },
    taskToEditLine(t) {
      if (!t.due) return t.name;
      let duePart = t.due.slice(5).replace('-', '/');
      if (t.due === due.todayIso()) duePart = 'today';
      else if (t.due === due.tomorrowIso()) duePart = 'tomorrow';
      return `${t.name} due ${duePart}`;
    },
    dueListLabel(dueIso) {
      if (!dueIso) return { text: '', cls: '' };
      const diff = due.dueOffsetDays(dueIso);
      const mmdd = dueIso.slice(5).replace('-', '/');
      if (diff < 0) {
        return { text: `${mmdd} overdue`, cls: 'overdue' };
      }
      if (diff === 0) return { text: 'today', cls: 'soon' };
      if (diff === 1) return { text: 'tomorrow', cls: 'soon' };
      if (diff <= 3) return { text: mmdd, cls: 'soon' };
      return { text: mmdd, cls: '' };
    }
  };

  // =============================================================================
  // FONT — preset stacks, preview strip, saved preference in localStorage
  // =============================================================================

  const font = {
    normalizeFontId(raw) {
      if (!raw) return null;
      return FONT_PRESETS[raw] ? raw : null;
    },
    applyFontPreset(id, persist) {
      const p = FONT_PRESETS[id];
      if (!p) return false;
      document.documentElement.style.setProperty('--font', p.stack);
      if (persist) {
        try {
          localStorage.setItem(FONT_PREF_KEY, id);
        } catch {
          try {
            ui.feedback('could not save font — storage may be full or blocked', 'error');
          } catch (_) {
            /* ignore */
          }
        }
      }
      return true;
    },
    loadFontPreference() {
      let raw = null;
      try {
        raw = localStorage.getItem(FONT_PREF_KEY);
      } catch {
        raw = null;
      }
      const id = font.normalizeFontId(raw);
      if (!id || !FONT_PRESETS[id]) {
        document.documentElement.style.removeProperty('--font');
        return;
      }
      font.applyFontPreset(id, false);
    },
    resetFontPreference() {
      document.documentElement.style.removeProperty('--font');
      try {
        localStorage.removeItem(FONT_PREF_KEY);
      } catch { /* ignore */ }
    },
    getSavedFontId() {
      try {
        const raw = localStorage.getItem(FONT_PREF_KEY);
        const id = font.normalizeFontId(raw);
        if (id && FONT_PRESETS[id]) return id;
      } catch { /* ignore */ }
      return null;
    },
    hideFontPreview() {
      const el = document.getElementById('font-preview');
      if (!el) return;
      el.classList.add('is-hidden');
      el.replaceChildren();
    },
    isFontPreviewOpen() {
      const el = document.getElementById('font-preview');
      return !!(el && !el.classList.contains('is-hidden'));
    },
    renderFontPreview() {
      const el = document.getElementById('font-preview');
      if (!el) return;
      el.classList.remove('is-hidden');
      el.replaceChildren();
      const current = font.getSavedFontId();
      Object.keys(FONT_PRESETS).forEach((id, i) => {
        const p = FONT_PRESETS[id];
        const num = i + 1;
        const btn = document.createElement('button');
        btn.type = 'button';
        const isDefault = current === null && id === 'consolas';
        btn.className = 'font-preview-row' + (current === id || isDefault ? ' is-current' : '');
        btn.dataset.fontId = id;
        btn.style.fontFamily = p.stack;
        btn.textContent = `${num} ${p.label} — The quick brown fox jumps over the lazy dog.`;
        el.appendChild(btn);
      });
    }
  };

  // =============================================================================
  // UI — escape helpers, task rows, empty states, modals
  // =============================================================================

  const OVERLAY_IDS = ['help-overlay', 'finished-overlay', 'settings-overlay'];

  const ui = {
    escHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    escAttr(s) {
      return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    },
    feedback(msg, type = '') {
      const el = document.getElementById('feedback');
      if (!el) return;
      el.textContent = msg;
      el.className = type;
      clearTimeout(feedbackHideTimer);
      feedbackHideTimer = setTimeout(() => {
        el.textContent = '';
        el.className = '';
        feedbackHideTimer = null;
      }, 2500);
    },
    rowHtml(t, displayNum, title, extraClass) {
      const { text, cls } = due.dueListLabel(t.due);
      const dueHtml = t.due
        ? `<span class="task-due ${cls}">${text}</span>`
        : '<span class="task-due"></span>';
      return `
      <div class="task ${extraClass}" data-id="${ui.escAttr(t.id)}">
        <button type="button" class="task-check" title="${ui.escAttr(title)}">${displayNum}</button>
        <span class="task-name" title="edit">${ui.escHtml(t.name)}</span>
        ${dueHtml}
      </div>`;
    },
    setFinishedCount() {
      const n = store.doneTasks().length;
      const el = document.getElementById('finished-count');
      if (el) el.textContent = n > 0 ? ` (${n})` : '';
    },
    render() {
      const openEl = document.getElementById('task-list-open');
      const finEl = document.getElementById('task-list-finished');

      if (openEl) {
        const open = store.openTasks();
        const visible = store.visibleOpenTasks();
        if (open.length === 0) {
          openEl.innerHTML = '<div class="empty-state">no open tasks.</div>';
        } else if (visible.length === 0) {
          openEl.innerHTML = `<div class="empty-state">no open tasks match find: ${ui.escHtml(store.state.listFilter)}</div>`;
        } else {
          openEl.innerHTML = visible.map((t, i) => ui.rowHtml(t, i + 1, 'mark done', '')).join('');
        }
      }

      if (finEl) {
        const done = store.doneTasks();
        if (done.length === 0) {
          finEl.innerHTML = '<div class="empty-state">none yet.</div>';
        } else {
          finEl.innerHTML = done.map((t, i) => ui.rowHtml(t, i + 1, 'restore to open', 'finished')).join('');
        }
      }

      ui.setFinishedCount();
    },
    closeModal(overlayId) {
      const overlay = document.getElementById(overlayId);
      if (!overlay || !overlay.classList.contains('is-open')) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      if (overlayId === 'finished-overlay') {
        const btn = document.getElementById('btn-finished');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
      const cmdEl = document.getElementById('cmd');
      if (cmdEl && typeof cmdEl.focus === 'function') cmdEl.focus();
    },
    openModal(overlayId) {
      for (const id of OVERLAY_IDS) {
        if (id !== overlayId) ui.closeModal(id);
      }
      const overlay = document.getElementById(overlayId);
      if (!overlay) return;
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (overlayId === 'finished-overlay') {
        const btn = document.getElementById('btn-finished');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
      const CLOSE_BTN_BY_OVERLAY = {
        'help-overlay': 'btn-close-help',
        'finished-overlay': 'btn-close-finished',
        'settings-overlay': 'btn-close-settings'
      };
      const closeBtnId = CLOSE_BTN_BY_OVERLAY[overlayId];
      if (closeBtnId) {
        const closeBtn = document.getElementById(closeBtnId);
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      }
    },
    openHelpPanel() {
      ui.openModal('help-overlay');
    },
    openFinishedPanel() {
      ui.openModal('finished-overlay');
    },
    openSettingsPanel() {
      const cbAdd = document.getElementById('setting-require-add');
      if (cbAdd) cbAdd.checked = requireAddKeyword;
      const cbLight = document.getElementById('setting-light-mode');
      if (cbLight) cbLight.checked = lightMode;
      ui.openModal('settings-overlay');
    }
  };

  // =============================================================================
  // COMMANDS — command line: handleCommand, try* parsers, add helper
  // =============================================================================

  function addTaskFromLine(body) {
    const { name, due: dueVal } = due.parseInput(body.trim());
    if (!name) {
      ui.feedback('empty task name', 'error');
      return;
    }
    store.pushUndo();
    store.state.tasks.push({
      id: store.newId(),
      name,
      due: dueVal,
      done: false,
      created: Date.now(),
      completedAt: null
    });
    store.save();
    ui.render();
    ui.feedback(`added: ${name}${dueVal ? ' (due ' + due.dueHuman(dueVal) + ')' : ''}`, 'ok');
  }

  function tryUndo(t) {
    if (!/^undo$/i.test(t)) return false;
    if (!store.popUndo()) ui.feedback('nothing to undo', 'error');
    else ui.feedback('undone', 'ok');
    return true;
  }

  function tryHelp(t) {
    if (!/^help$/i.test(t)) return false;
    ui.openHelpPanel();
    return true;
  }

  function tryFinished(t) {
    if (!/^finished$/i.test(t)) return false;
    ui.openFinishedPanel();
    return true;
  }

  function trySettings(t) {
    if (!/^settings$/i.test(t)) return false;
    ui.openSettingsPanel();
    return true;
  }

  function tryFind(t) {
    const m = t.match(/^find(?:\s+(.+))?$/i);
    if (!m) return false;
    const arg = (m[1] || '').trim();
    if (arg === '' || /^(clear|off|reset)$/i.test(arg)) {
      store.state.listFilter = null;
      ui.render();
      ui.feedback('find cleared', 'ok');
      return true;
    }
    store.state.listFilter = arg.toLowerCase();
    ui.render();
    const vis = store.visibleOpenTasks();
    const total = store.openTasks().length;
    if (vis.length === 0) ui.feedback(`no open tasks match "${arg}"`, 'error');
    else ui.feedback(`showing ${vis.length} of ${total} (find: ${arg})`, 'ok');
    return true;
  }

  function trySort(t) {
    const m = t.match(/^sort\s+(.+)$/i);
    if (!m) return false;
    const arg = m[1].trim().toLowerCase();
    if (arg !== 'due' && arg !== 'added' && arg !== 'created') {
      ui.feedback('use: sort due   |   sort added', 'error');
      return true;
    }
    const open = store.openTasks();
    if (open.length === 0) {
      ui.feedback('no open tasks', 'error');
      return true;
    }
    store.pushUndo();
    store.sortOpenTasksInPlace(arg === 'due' ? 'due' : 'added');
    store.save();
    ui.render();
    ui.feedback(
      arg === 'due' ? 'sorted open tasks by due date' : 'sorted open tasks by added (newest first)',
      'ok'
    );
    return true;
  }

  function tryFont(t) {
    const m = t.match(/^font(?:\s+(.+))?$/i);
    if (!m) return false;
    const arg = (m[1] || '').trim().toLowerCase();
    if (!arg || arg === 'list') {
      ui.feedback('font presets below — or type font consolas, ubuntu, ui-mono, courier (1–4)', 'ok');
      font.renderFontPreview();
      return true;
    }
    if (arg === 'reset') {
      font.resetFontPreference();
      ui.feedback('font reset (CSS default)', 'ok');
      font.hideFontPreview();
      return true;
    }
    const id = FONT_BY_NUM[arg] || (FONT_PRESETS[arg] ? arg : null);
    if (!id || !FONT_PRESETS[id]) {
      ui.feedback('unknown preset — type font or font list', 'error');
      return true;
    }
    font.applyFontPreset(id, true);
    ui.feedback(`font: ${FONT_PRESETS[id].label}`, 'ok');
    font.hideFontPreview();
    return true;
  }

  function tryDone(t) {
    const m = t.match(/^(?:done|finish)\s+(.+)$/i);
    if (!m) return false;
    const arg = m[1].trim();
    const lower = arg.toLowerCase();

    if (lower === 'all' || arg === '*') {
      const open = store.openTasks();
      if (open.length === 0) {
        ui.feedback('no open tasks', 'error');
        return true;
      }
      store.pushUndo();
      const now = Date.now();
      for (const x of open) {
        x.done = true;
        x.completedAt = now;
      }
      store.save();
      ui.render();
      ui.feedback(`finished ${open.length} task${open.length === 1 ? '' : 's'}`, 'ok');
      return true;
    }

    const num = parseInt(arg, 10);
    if (!isNaN(num) && String(num) === arg) {
      const open = store.visibleOpenTasks();
      const idx = num - 1;
      if (idx < 0 || idx >= open.length) {
        ui.feedback(`no open task #${num}`, 'error');
        return true;
      }
      store.pushUndo();
      const task = open[idx];
      task.done = true;
      task.completedAt = Date.now();
      store.save();
      ui.render();
      ui.feedback(`finished: ${task.name}`, 'ok');
      return true;
    }

    const hit = store.findOpenBySubstring(arg);
    if (!hit) {
      ui.feedback(`no open task matching "${arg}"`, 'error');
      return true;
    }
    store.pushUndo();
    hit.done = true;
    hit.completedAt = Date.now();
    store.save();
    ui.render();
    ui.feedback(`finished: ${hit.name}`, 'ok');
    return true;
  }

  function tryRm(t) {
    const m = t.match(/^rm\s+(.+)$/i);
    if (!m) return false;
    const arg = m[1].trim();
    const lower = arg.toLowerCase();

    if (lower === 'all' || arg === '*') {
      const n = store.openTasks().length;
      if (n === 0) {
        ui.feedback('no open tasks', 'error');
        return true;
      }
      store.pushUndo();
      store.state.tasks = store.state.tasks.filter(x => x.done);
      store.save();
      ui.render();
      ui.feedback(`removed ${n} open task${n === 1 ? '' : 's'}`, 'ok');
      return true;
    }

    const num = parseInt(arg, 10);
    if (!isNaN(num) && String(num) === arg) {
      const open = store.visibleOpenTasks();
      const idx = num - 1;
      if (idx < 0 || idx >= open.length) {
        ui.feedback(`no open task #${num}`, 'error');
        return true;
      }
      store.pushUndo();
      const removed = store.removeById(open[idx].id);
      store.save();
      ui.render();
      ui.feedback(`removed: ${removed.name}`, 'ok');
      return true;
    }

    const hit = store.findAnyTaskBySubstring(arg);
    if (!hit) {
      ui.feedback(`no task matching "${arg}"`, 'error');
      return true;
    }
    store.pushUndo();
    const removed = store.removeById(hit.id);
    store.save();
    ui.render();
    ui.feedback(`removed: ${removed.name}`, 'ok');
    return true;
  }

  function tryClear(t) {
    const m = t.match(/^clear(\s+(.+))?$/i);
    if (!m) return false;
    const arg = (m[2] || '').trim().toLowerCase();
    if (arg === '' || arg === 'all') {
      const n = store.state.tasks.length;
      if (n === 0) {
        ui.feedback('nothing to clear', '');
        return true;
      }
      store.pushUndo();
      store.state.tasks = [];
      store.state.listFilter = null;
      store.save();
      ui.render();
      ui.feedback(`cleared all (${n})`, 'ok');
      return true;
    }
    if (arg === 'finished') {
      const n = store.state.tasks.filter(x => x.done).length;
      if (n === 0) {
        ui.feedback('no finished tasks', '');
        return true;
      }
      store.pushUndo();
      store.state.tasks = store.state.tasks.filter(x => !x.done);
      store.state.listFilter = null;
      store.save();
      ui.render();
      ui.feedback(`cleared ${n} finished`, 'ok');
      return true;
    }
    ui.feedback('use: clear   |   clear all   |   clear finished', 'error');
    return true;
  }

  function tryEditByNum(t) {
    const m = t.match(/^edit\s+(\d+)\s+(.+)$/i);
    if (!m) return false;
    const n = parseInt(m[1], 10);
    const rest = m[2].trim();
    const open = store.visibleOpenTasks();
    if (n < 1 || n > open.length) {
      ui.feedback(`no open task #${n}`, 'error');
      return true;
    }
    const parsed = due.parseInput(rest);
    if (!parsed.name && parsed.due === null) {
      ui.feedback('nothing to set', 'error');
      return true;
    }
    store.pushUndo();
    due.applyEditTaskFromParsed(open[n - 1], rest);
    store.save();
    ui.render();
    ui.feedback(`updated: ${open[n - 1].name}`, 'ok');
    return true;
  }

  function tryEditBySub(t) {
    const m = t.match(/^edit\s+(\S+)\s+(.+)$/i);
    if (!m) return false;
    const key = m[1];
    const rest = m[2].trim();
    if (/^\d+$/.test(key)) {
      ui.feedback('use: edit N new text   or   edit word new text', 'error');
      return true;
    }
    const hit = store.findAnyTaskBySubstring(key);
    if (!hit) {
      ui.feedback(`no task matching "${key}"`, 'error');
      return true;
    }
    const parsed = due.parseInput(rest);
    if (!parsed.name && parsed.due === null) {
      ui.feedback('nothing to set', 'error');
      return true;
    }
    store.pushUndo();
    due.applyEditTaskFromParsed(hit, rest);
    store.save();
    ui.render();
    ui.feedback(`updated: ${hit.name}`, 'ok');
    return true;
  }

  function tryDeferByNum(t) {
    const m = t.match(/^defer\s+(\d+)\s+(.+)$/i);
    if (!m) return false;
    const n = parseInt(m[1], 10);
    const dueStr = m[2].trim();
    const dueIso = due.parseDueOnly(dueStr);
    if (!dueIso) {
      ui.feedback(MSG_DEFER_USAGE, 'error');
      return true;
    }
    const open = store.visibleOpenTasks();
    if (n < 1 || n > open.length) {
      ui.feedback(`no open task #${n}`, 'error');
      return true;
    }
    store.pushUndo();
    open[n - 1].due = dueIso;
    store.save();
    ui.render();
    ui.feedback(`deferred: ${open[n - 1].name} (due ${due.dueHuman(dueIso)})`, 'ok');
    return true;
  }

  function tryDeferLoose(t) {
    const m = t.match(/^defer\s+(.+)$/i);
    if (!m) return false;
    const rest = m[1].trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      ui.feedback(MSG_DEFER_USAGE, 'error');
      return true;
    }
    const last = parts[parts.length - 1];
    const dueIso = due.parseDueOnly(last);
    if (!dueIso) {
      ui.feedback(MSG_DEFER_USAGE, 'error');
      return true;
    }
    const needle = parts.slice(0, -1).join(' ');
    const hit = store.findOpenBySubstring(needle);
    if (!hit) {
      ui.feedback(`no open task matching "${needle}"`, 'error');
      return true;
    }
    store.pushUndo();
    hit.due = dueIso;
    store.save();
    ui.render();
    ui.feedback(`deferred: ${hit.name} (due ${due.dueHuman(dueIso)})`, 'ok');
    return true;
  }

  function tryAdd(t) {
    const m = t.match(/^add\s+(.+)$/i);
    if (!m) return false;
    addTaskFromLine(m[1].trim());
    return true;
  }

  function normalizeImportedTaskRecord(raw, usedIds) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) return null;
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : store.newId();
    if (usedIds.has(id)) id = store.newId();
    usedIds.add(id);
    const done = !!raw.done;
    let due = null;
    if (raw.due != null && raw.due !== '') {
      const ds = String(raw.due).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) due = ds;
    }
    const created =
      typeof raw.created === 'number' && Number.isFinite(raw.created) ? raw.created : Date.now();
    let completedAt = null;
    if (done) {
      completedAt =
        typeof raw.completedAt === 'number' && Number.isFinite(raw.completedAt)
          ? raw.completedAt
          : created;
    }
    return { id, name, due, done, created, completedAt };
  }

  function tasksArrayFromImportedJson(parsed) {
    let arr = parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.tasks)) {
      arr = parsed.tasks;
    }
    if (!Array.isArray(arr)) {
      if (parsed == null || typeof parsed !== 'object') {
        throw new Error(
          'This file is JSON, but it must be an array of tasks, or an object like { "tasks": [ … ] }.'
        );
      }
      throw new Error(
        'This file is JSON, but it must be either a top-level array of tasks, or an object with a "tasks" array.'
      );
    }
    const usedIds = new Set();
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const row = normalizeImportedTaskRecord(arr[i], usedIds);
      if (!row) {
        throw new Error(
          `Task at index ${i} is invalid — each entry must be an object with a non-empty "name" string.`
        );
      }
      out.push(row);
    }
    return out;
  }

  function applyImportedTasksFromJsonText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const detail = e.message || String(e);
      throw new Error(`This file is not valid JSON (${detail}).`);
    }
    const tasks = tasksArrayFromImportedJson(parsed);
    store.pushUndo();
    store.state.tasks = tasks;
    store.state.listFilter = null;
    store.save();
    ui.render();
    ui.feedback(`imported ${tasks.length} task(s) — undo restores previous list`, 'ok');
  }

  function downloadTasksExport(filename) {
    const text = JSON.stringify(store.state.tasks, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    queueMicrotask(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    });
  }

  const EXPORT_NAME_RE = /^[\w.-]+$/;

  function exportFilenameFromArg(token) {
    const t = String(token).trim();
    if (/\.json$/i.test(t)) {
      const base = t.slice(0, -5);
      if (!EXPORT_NAME_RE.test(base) || !base) return null;
      return `${base}.json`;
    }
    if (!EXPORT_NAME_RE.test(t)) return null;
    return `${t}.json`;
  }

  function tryExport(t) {
    const s = t.trim();
    if (!/^export/i.test(s)) return false;
    if (/^export$/i.test(s)) {
      downloadTasksExport('tasks.json');
      ui.feedback(`exported ${store.state.tasks.length} task(s) → tasks.json`, 'ok');
      return true;
    }
    const m = s.match(/^export\s+(\S+)$/i);
    if (!m) {
      ui.feedback('use: export   or   export name (→ name.json)', 'error');
      return true;
    }
    const filename = exportFilenameFromArg(m[1]);
    if (!filename) {
      ui.feedback('export: name may only use letters, digits, . - _ (optional .json suffix)', 'error');
      return true;
    }
    downloadTasksExport(filename);
    ui.feedback(`exported ${store.state.tasks.length} task(s) → ${filename}`, 'ok');
    return true;
  }

  function tryImport(t) {
    const s = t.trim();
    if (!/^import/i.test(s)) return false;
    if (!/^import$/i.test(s)) {
      ui.feedback('use: import (no arguments — pick a JSON file)', 'error');
      return true;
    }
    const input = document.getElementById('import-file');
    if (!input) {
      ui.feedback('import: file picker missing', 'error');
      return true;
    }
    input.click();
    return true;
  }

  function tryCd(t) {
    if (t.trim().toLowerCase() !== 'cd ..') return false;
    window.location.href = '../index.html';
    return true;
  }

  function handleCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (font.isFontPreviewOpen()) font.hideFontPreview();
      return;
    }
    if (!/^font/i.test(trimmed)) font.hideFontPreview();

    const chain = [
      tryCd,
      tryUndo,
      tryHelp,
      tryFinished,
      trySettings,
      tryFind,
      trySort,
      tryFont,
      tryExport,
      tryImport,
      tryDone,
      tryRm,
      tryClear,
      tryEditByNum,
      tryEditBySub,
      tryDeferByNum,
      tryDeferLoose,
      tryAdd
    ];
    for (const step of chain) {
      if (step(trimmed)) return;
    }
    if (!requireAddKeyword) {
      addTaskFromLine(trimmed);
      return;
    }
    ui.feedback(MSG_UNKNOWN_CMD, 'error');
  }

  // =============================================================================
  // ENTRY — connect store to ui.render, inline row edit, event listeners, boot
  // =============================================================================

  store.setRender(ui.render);

  function startEditTaskRow(row) {
    if (row.querySelector('.task-name-edit')) return;
    const id = row.dataset.id;
    const task = store.state.tasks.find(x => x.id === id);
    if (!task) return;
    const span = row.querySelector('.task-name');
    if (!span) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-name-edit';
    input.value = due.taskToEditLine(task);
    input.autocomplete = 'off';
    input.spellcheck = false;
    span.replaceWith(input);
    input.focus();
    input.select();

    function finish(commit) {
      input.removeEventListener('blur', onBlur);
      if (!commit) {
        ui.render();
        return;
      }
      const raw = input.value;
      const parsed = due.parseInput(raw.trim());
      if (!parsed.name && parsed.due === null) {
        ui.feedback('nothing to set', 'error');
        ui.render();
        return;
      }
      store.pushUndo();
      due.applyEditTaskFromParsed(task, raw);
      store.save();
      ui.render();
      ui.feedback(`updated: ${task.name}`, 'ok');
    }

    function onBlur() {
      finish(true);
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        input.removeEventListener('blur', onBlur);
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.removeEventListener('blur', onBlur);
        finish(false);
      }
    });
    input.addEventListener('blur', onBlur);
  }

  /** True if this page click should move focus to the command line (inert areas only). */
  function shouldRefocusCmdFromPageClick(e) {
    const t = e.target;
    if (t.closest('input, textarea, select, button, a, label')) return false;
    if (t.closest('[aria-modal="true"]')) return false;
    if (t.closest('.task')) return false;
    const fp = t.closest('#font-preview');
    if (fp && !fp.classList.contains('is-hidden')) return false;
    return true;
  }

  function bind() {
    const cmdEl = document.getElementById('cmd');
    if (!cmdEl) return;

    cmdEl.addEventListener('keydown', e => {
      if (e.key === 'Escape' && font.isFontPreviewOpen()) {
        e.preventDefault();
        font.hideFontPreview();
        return;
      }
      if (e.key === 'ArrowUp') {
        const nextCmd = store.browseCmdHistory(-1);
        if (nextCmd == null) return;
        e.preventDefault();
        e.target.value = nextCmd;
        const len = nextCmd.length;
        queueMicrotask(() => e.target.setSelectionRange(len, len));
        return;
      }
      if (e.key === 'ArrowDown') {
        const nextCmd = store.browseCmdHistory(1);
        e.preventDefault();
        e.target.value = nextCmd;
        const len = nextCmd.length;
        queueMicrotask(() => e.target.setSelectionRange(len, len));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        for (const oid of OVERLAY_IDS) {
          const el = document.getElementById(oid);
          if (el && el.classList.contains('is-open')) {
            ui.closeModal(oid);
            break;
          }
        }
        const line = e.target.value;
        handleCommand(line);
        if (line.length) store.pushCmdHistory(line);
        e.target.value = '';
        store.resetCmdHistoryBrowse();
        return;
      }
      store.resetCmdHistoryBrowse();
    });

    document.body.addEventListener('click', e => {
      const nameEl = e.target.closest('.task-name');
      if (nameEl) {
        const r = nameEl.closest('.task');
        if (r && r.dataset.id) {
          startEditTaskRow(r);
          return;
        }
      }
      const btn = e.target.closest('.task-check');
      if (btn) {
        const r = btn.closest('.task');
        if (r && r.dataset.id) store.toggleDone(r.dataset.id);
        return;
      }
      if (shouldRefocusCmdFromPageClick(e)) cmdEl.focus();
    });

    const btnCloseHelp = document.getElementById('btn-close-help');
    const helpBackdrop = document.getElementById('help-backdrop');
    if (btnCloseHelp) btnCloseHelp.addEventListener('click', () => ui.closeModal('help-overlay'));
    if (helpBackdrop) helpBackdrop.addEventListener('click', () => ui.closeModal('help-overlay'));

    const btnFinished = document.getElementById('btn-finished');
    const btnCloseFinished = document.getElementById('btn-close-finished');
    const finishedBackdrop = document.getElementById('finished-backdrop');
    if (btnFinished) btnFinished.addEventListener('click', () => ui.openFinishedPanel());
    if (btnCloseFinished) btnCloseFinished.addEventListener('click', () => ui.closeModal('finished-overlay'));
    if (finishedBackdrop) finishedBackdrop.addEventListener('click', () => ui.closeModal('finished-overlay'));

    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsBackdrop = document.getElementById('settings-backdrop');
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => ui.closeModal('settings-overlay'));
    if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => ui.closeModal('settings-overlay'));

    const settingRequireAdd = document.getElementById('setting-require-add');
    if (settingRequireAdd) {
      settingRequireAdd.addEventListener('change', e => {
        requireAddKeyword = e.target.checked;
        saveSettings();
        ui.feedback('settings saved', 'ok');
      });
    }

    const settingLightMode = document.getElementById('setting-light-mode');
    if (settingLightMode) {
      settingLightMode.addEventListener('change', e => {
        lightMode = e.target.checked;
        applyTheme();
        saveSettings();
        ui.feedback('settings saved', 'ok');
      });
    }

    const importFile = document.getElementById('import-file');
    if (importFile) {
      importFile.addEventListener('change', e => {
        const input = e.target;
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            applyImportedTasksFromJsonText(reader.result);
          } catch (err) {
            ui.feedback(err.message || 'import failed', 'error');
          }
        };
        reader.onerror = () => ui.feedback('import failed — could not read that file', 'error');
        reader.readAsText(f, 'UTF-8');
      });
    }

    const fontPreview = document.getElementById('font-preview');
    if (fontPreview) {
      fontPreview.addEventListener('click', e => {
        const row = e.target.closest('.font-preview-row[data-font-id]');
        if (!row) return;
        const fid = row.dataset.fontId;
        if (!fid || !FONT_PRESETS[fid]) return;
        font.applyFontPreset(fid, true);
        ui.feedback(`font: ${FONT_PRESETS[fid].label}`, 'ok');
        font.hideFontPreview();
      });
    }

    document.addEventListener(
      'keydown',
      e => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        let openId = null;
        for (const id of OVERLAY_IDS) {
          const el = document.getElementById(id);
          if (el && el.classList.contains('is-open')) {
            openId = id;
            break;
          }
        }
        if (!openId) return;
        if (e.target.closest && e.target.closest('.task-name-edit')) return;
        if (e.key === 'Enter' && e.target && e.target.id === 'cmd') return;
        e.preventDefault();
        e.stopPropagation();
        ui.closeModal(openId);
      },
      true
    );
  }

  loadSettings();
  store.load();
  font.loadFontPreference();
  ui.render();
  bind();
})();