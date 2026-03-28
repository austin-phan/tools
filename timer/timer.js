/**
 * Timer app (single file, no ES modules — works when opening timer.html via file://).
 *
 * Layout:
 *   CONSTANTS → STORE → CHIME → UI → COMMANDS → ENTRY
 */
(function () {
  'use strict';

  // =============================================================================
  // CONSTANTS
  // =============================================================================

  let feedbackHideTimer = null;

  const LOG_KEY      = 'timer_log';
  const SETTINGS_KEY = 'timer_settings';

  const DEFAULT_WORK_MIN  = 25;
  const DEFAULT_BREAK_MIN = 5;

  /** Settings (loaded from localStorage). */
  let cfg = {
    workMin:  DEFAULT_WORK_MIN,
    breakMin: DEFAULT_BREAK_MIN,
    sound:    true,
    light:    false
  };

  function applyTheme() {
    document.documentElement.classList.toggle('light', cfg.light);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (typeof o.workMin  === 'number' && o.workMin  >= 1) cfg.workMin  = o.workMin;
        if (typeof o.breakMin === 'number' && o.breakMin >= 1) cfg.breakMin = o.breakMin;
        if (typeof o.sound    === 'boolean') cfg.sound = o.sound;
        if (typeof o.light    === 'boolean') cfg.light = o.light;
      }
    } catch { /* ignore */ }
    applyTheme();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
    } catch { /* ignore */ }
  }

  // =============================================================================
  // STORE — timer state, session log, localStorage
  // =============================================================================

  /**
   * Timer state machine:
   *   idle → running → paused → running → finished → idle
   *                  → idle (stop)
   */
  const timer = {
    state: 'idle',   // 'idle' | 'running' | 'paused' | 'finished'
    type:  'work',   // 'work' | 'break'
    totalSecs: 0,    // original duration in seconds
    remainSecs: 0,   // seconds remaining
    intervalId: null,
    startedAt: null  // Date.now() when this session started (for logging)
  };

  /** Session log stored in localStorage: array of { type, durationMin, startedAt, finishedAt } */
  const log = {
    entries: [],
    load() {
      try {
        const raw = localStorage.getItem(LOG_KEY);
        log.entries = raw ? JSON.parse(raw) || [] : [];
      } catch { log.entries = []; }
    },
    save() {
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(log.entries));
      } catch { /* ignore */ }
    },
    push(entry) {
      log.entries.push(entry);
      log.save();
    },
    clear() {
      log.entries = [];
      log.save();
    },
    todayEntries() {
      const todayStr = new Date().toDateString();
      return log.entries.filter(e => new Date(e.startedAt).toDateString() === todayStr);
    },
    todayWorkSecs() {
      return log.todayEntries()
        .filter(e => e.type === 'work')
        .reduce((sum, e) => sum + e.durationSecs, 0);
    },
    /** Group all entries by calendar date string, newest first. */
    grouped() {
      const groups = {};
      for (const e of log.entries) {
        const key = new Date(e.startedAt).toDateString();
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
      }
      // sort keys newest-first
      return Object.entries(groups)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]));
    }
  };

  // =============================================================================
  // CHIME — a tiny web-audio beep, no external files needed
  // =============================================================================

  const chime = {
    ctx: null,
    getCtx() {
      if (!chime.ctx) {
        try {
          chime.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch { return null; }
      }
      return chime.ctx;
    },
    play() {
      if (!cfg.sound) return;
      const ctx = chime.getCtx();
      if (!ctx) return;
      try {
        // two-tone chime: 880 Hz then 660 Hz
        const tones = [880, 660, 880];
        tones.forEach((freq, i) => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = freq;
          const t = ctx.currentTime + i * 0.22;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
          osc.start(t);
          osc.stop(t + 0.22);
        });
      } catch { /* ignore */ }
    }
  };

  // =============================================================================
  // TIMER LOGIC — tick, start, stop, pause, resume
  // =============================================================================

  function tick() {
    if (timer.state !== 'running') return;
    timer.remainSecs -= 1;
    ui.renderDisplay();
    ui.updateTitle();
    if (timer.remainSecs <= 0) {
      finishSession();
    }
  }

  function startTicking() {
    if (timer.intervalId) clearInterval(timer.intervalId);
    timer.intervalId = setInterval(tick, 1000);
  }

  function stopTicking() {
    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
  }

  function finishSession() {
    stopTicking();
    const durationSecs = timer.totalSecs;
    log.push({
      type: timer.type,
      durationSecs,
      startedAt: timer.startedAt,
      finishedAt: Date.now(),
      completed: true
    });
    timer.state     = 'idle';
    timer.remainSecs = 0;
    ui.renderDisplay();
    ui.renderTodaySummary();
    ui.updateTitle();
    ui.setLogCount();
    chime.play();
    const label = timer.type === 'work' ? 'work session' : 'break';
    ui.feedback(`${label} complete — ${fmtMins(durationSecs)}`, 'ok');
  }

  function cmdStart(mins, type) {
    if (timer.state === 'running' || timer.state === 'paused') {
      // log the interrupted session as partial
      const elapsed = timer.totalSecs - timer.remainSecs;
      if (elapsed > 0) {
        log.push({
          type: timer.type,
          durationSecs: elapsed,
          startedAt: timer.startedAt,
          finishedAt: Date.now(),
          completed: false
        });
        ui.setLogCount();
      }
      stopTicking();
    }
    const secs     = mins * 60;
    timer.type      = type;
    timer.state     = 'running';
    timer.totalSecs = secs;
    timer.remainSecs = secs;
    timer.startedAt = Date.now();
    startTicking();
    ui.renderDisplay();
    ui.updateTitle();
    ui.renderTodaySummary();
  }

  function cmdPause() {
    if (timer.state !== 'running') return false;
    timer.state = 'paused';
    stopTicking();
    ui.renderDisplay();
    ui.updateTitle();
    return true;
  }

  function cmdResume() {
    if (timer.state !== 'paused') return false;
    timer.state = 'running';
    startTicking();
    ui.renderDisplay();
    ui.updateTitle();
    return true;
  }

  function cmdStop() {
    if (timer.state === 'idle') return false;
    const elapsed = timer.totalSecs - timer.remainSecs;
    if (elapsed > 0) {
      log.push({
        type: timer.type,
        durationSecs: elapsed,
        startedAt: timer.startedAt,
        finishedAt: Date.now(),
        completed: false
      });
      ui.setLogCount();
      log.save();
    }
    stopTicking();
    timer.state      = 'idle';
    timer.remainSecs = 0;
    timer.totalSecs  = 0;
    ui.renderDisplay();
    ui.updateTitle();
    ui.renderTodaySummary();
    return true;
  }

  function cmdExtend(mins) {
    if (timer.state === 'idle') return false;
    const addSecs = mins * 60;
    timer.totalSecs  += addSecs;
    timer.remainSecs += addSecs;
    ui.renderDisplay();
    return true;
  }

  // =============================================================================
  // FORMATTING HELPERS
  // =============================================================================

  function fmtCountdown(secs) {
    const s = Math.max(0, secs);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function fmtMins(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }

  function fmtHoursMin(secs) {
    const total = Math.floor(secs / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12  = h % 12 || 12;
    return `${h12}:${m}${ampm}`;
  }

  function fmtDateHeading(dateStr) {
    const d = new Date(dateStr);
    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (dateStr === today)     return 'today';
    if (dateStr === yesterday) return 'yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // =============================================================================
  // UI — display rendering, title, modals, feedback
  // =============================================================================

  const OVERLAY_IDS = ['log-overlay', 'help-overlay', 'settings-overlay'];

  const ui = {
    escHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      }, 3000);
    },

    renderDisplay() {
      const countdownEl  = document.getElementById('countdown');
      const labelEl      = document.getElementById('session-label');
      const barEl        = document.getElementById('progress-bar');

      if (!countdownEl || !labelEl || !barEl) return;

      const s = timer.state;
      const t = timer.type;

      if (s === 'idle') {
        const defaultMins = cfg.workMin;
        countdownEl.textContent = fmtCountdown(defaultMins * 60);
        countdownEl.className   = 'idle';
        labelEl.textContent     = 'idle';
        labelEl.className       = '';
        barEl.style.width       = '0%';
        barEl.className         = '';
        return;
      }

      countdownEl.textContent = fmtCountdown(timer.remainSecs);

      const stateClass = s === 'paused' ? 'paused' : t;
      countdownEl.className = stateClass;

      if (s === 'paused') {
        labelEl.textContent = t === 'work' ? 'work — paused' : 'break — paused';
        labelEl.className   = 'paused';
      } else {
        labelEl.textContent = t === 'work' ? 'work' : 'break';
        labelEl.className   = t;
      }

      const pct = timer.totalSecs > 0
        ? ((timer.totalSecs - timer.remainSecs) / timer.totalSecs) * 100
        : 0;
      barEl.style.width = `${Math.min(100, pct)}%`;
      barEl.className   = stateClass;
    },

    renderTodaySummary() {
      const el = document.getElementById('today-summary');
      if (!el) return;
      const todayWork = log.todayWorkSecs();
      const sessions  = log.todayEntries().filter(e => e.type === 'work' && e.completed).length;
      if (sessions === 0 && timer.state === 'idle') {
        el.textContent = '';
        return;
      }
      const parts = [];
      if (todayWork > 0) {
        parts.push(`today: <span>${fmtHoursMin(todayWork)}</span> focused`);
      }
      if (sessions > 0) {
        parts.push(`<span>${sessions}</span> session${sessions === 1 ? '' : 's'} completed`);
      }
      if (timer.state === 'running' || timer.state === 'paused') {
        const elapsed = timer.totalSecs - timer.remainSecs;
        if (elapsed > 0 && timer.type === 'work') {
          parts.push(`<span>${fmtMins(elapsed)}</span> in current session`);
        }
      }
      el.innerHTML = parts.join(' · ');
    },

    updateTitle() {
      if (timer.state === 'running' || timer.state === 'paused') {
        const indicator = timer.state === 'paused' ? '⏸ ' : (timer.type === 'work' ? '▶ ' : '☕ ');
        document.title = `${indicator}${fmtCountdown(timer.remainSecs)} — timer`;
      } else {
        document.title = 'timer';
      }
    },

    setLogCount() {
      const n = log.entries.length;
      const el = document.getElementById('log-count');
      if (el) el.textContent = n > 0 ? ` (${n})` : '';
    },

    renderLogPanel() {
      const el = document.getElementById('log-list');
      if (!el) return;
      const grouped = log.grouped();
      if (grouped.length === 0) {
        el.innerHTML = '<div class="empty-state">no sessions yet.</div>';
        return;
      }
      let html = '';
      for (const [dateStr, entries] of grouped) {
        const workSecs = entries.filter(e => e.type === 'work').reduce((s, e) => s + e.durationSecs, 0);
        html += `<div class="log-day-group">`;
        html += `<div class="log-day-heading">${ui.escHtml(fmtDateHeading(dateStr))}</div>`;
        for (const e of entries) {
          const labelClass = e.type === 'break' ? 'log-entry-label break-type' : 'log-entry-label';
          const label = e.type === 'work'
            ? (e.completed ? 'work' : 'work (stopped early)')
            : (e.completed ? 'break' : 'break (stopped early)');
          html += `<div class="log-entry">
            <span class="${labelClass}">${ui.escHtml(label)}</span>
            <span class="log-entry-duration">${ui.escHtml(fmtMins(e.durationSecs))}</span>
            <span class="log-entry-time">${ui.escHtml(fmtTime(e.startedAt))}</span>
          </div>`;
        }
        if (workSecs > 0) {
          html += `<div class="log-day-total">total focus: <span>${ui.escHtml(fmtHoursMin(workSecs))}</span></div>`;
        }
        html += `</div>`;
      }
      el.innerHTML = html;
    },

    closeModal(overlayId) {
      const overlay = document.getElementById(overlayId);
      if (!overlay || !overlay.classList.contains('is-open')) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      if (overlayId === 'log-overlay') {
        const btn = document.getElementById('btn-log');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
      const cmdEl = document.getElementById('cmd');
      if (cmdEl) cmdEl.focus();
    },

    openModal(overlayId) {
      for (const id of OVERLAY_IDS) {
        if (id !== overlayId) ui.closeModal(id);
      }
      const overlay = document.getElementById(overlayId);
      if (!overlay) return;
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (overlayId === 'log-overlay') {
        const btn = document.getElementById('btn-log');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        ui.renderLogPanel();
      }
      const CLOSE_BTN = {
        'log-overlay': 'btn-close-log',
        'help-overlay': 'btn-close-help',
        'settings-overlay': 'btn-close-settings'
      };
      const cbId = CLOSE_BTN[overlayId];
      if (cbId) {
        const cb = document.getElementById(cbId);
        if (cb) cb.focus();
      }
    },

    openLogPanel()      { ui.openModal('log-overlay'); },
    openHelpPanel()     { ui.openModal('help-overlay'); },
    openSettingsPanel() {
      const wEl = document.getElementById('setting-work-min');
      const bEl = document.getElementById('setting-break-min');
      const sEl = document.getElementById('setting-sound');
      const lEl = document.getElementById('setting-light-mode');
      if (wEl) wEl.value   = cfg.workMin;
      if (bEl) bEl.value   = cfg.breakMin;
      if (sEl) sEl.checked = cfg.sound;
      if (lEl) lEl.checked = cfg.light;
      ui.openModal('settings-overlay');
    }
  };

  // =============================================================================
  // COMMANDS
  // =============================================================================

  function tryStart(t) {
    const m = t.match(/^start(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (!m) return false;
    const mins = m[1] ? parseFloat(m[1]) : cfg.workMin;
    if (mins <= 0 || mins > 480) {
      ui.feedback('duration must be between 1 and 480 minutes', 'error');
      return true;
    }
    cmdStart(mins, 'work');
    ui.feedback(`work session started — ${mins}m`, 'ok');
    return true;
  }

  function tryBreak(t) {
    const m = t.match(/^break(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (!m) return false;
    const mins = m[1] ? parseFloat(m[1]) : cfg.breakMin;
    if (mins <= 0 || mins > 120) {
      ui.feedback('break must be between 1 and 120 minutes', 'error');
      return true;
    }
    cmdStart(mins, 'break');
    ui.feedback(`break started — ${mins}m`, 'ok');
    return true;
  }

  function tryPause(t) {
    if (!/^pause$/i.test(t)) return false;
    if (!cmdPause()) ui.feedback('nothing is running', 'error');
    else ui.feedback('paused', '');
    return true;
  }

  function tryResume(t) {
    if (!/^resume$/i.test(t)) return false;
    if (!cmdResume()) ui.feedback('nothing is paused', 'error');
    else ui.feedback('resumed', 'ok');
    return true;
  }

  function tryStop(t) {
    if (!/^stop$/i.test(t)) return false;
    if (!cmdStop()) ui.feedback('nothing is running', 'error');
    else ui.feedback('stopped', '');
    return true;
  }

  function tryExtend(t) {
    const m = t.match(/^extend\s+(\d+(?:\.\d+)?)$/i);
    if (!m) return false;
    const mins = parseFloat(m[1]);
    if (mins <= 0) {
      ui.feedback('extend: minutes must be > 0', 'error');
      return true;
    }
    if (!cmdExtend(mins)) {
      ui.feedback('no active session to extend', 'error');
    } else {
      ui.feedback(`extended by ${mins}m`, 'ok');
    }
    return true;
  }

  function tryStatus(t) {
    if (!/^status$/i.test(t)) return false;
    if (timer.state === 'idle') {
      ui.feedback('idle — type start or break to begin', '');
      return true;
    }
    const stateLabel = timer.state === 'paused' ? 'paused' : 'running';
    const typeLabel  = timer.type === 'work' ? 'work' : 'break';
    ui.feedback(`${typeLabel} · ${stateLabel} · ${fmtCountdown(timer.remainSecs)} remaining`, '');
    return true;
  }

  function tryLog(t) {
    if (!/^log$/i.test(t)) return false;
    ui.openLogPanel();
    return true;
  }

  function tryClearLog(t) {
    if (!/^clear\s+log$/i.test(t)) return false;
    const n = log.entries.length;
    if (n === 0) {
      ui.feedback('log is already empty', '');
      return true;
    }
    log.clear();
    ui.setLogCount();
    ui.renderTodaySummary();
    ui.feedback(`cleared ${n} session${n === 1 ? '' : 's'}`, 'ok');
    return true;
  }

  function tryHelp(t) {
    if (!/^help$/i.test(t)) return false;
    ui.openHelpPanel();
    return true;
  }

  function trySettings(t) {
    if (!/^settings$/i.test(t)) return false;
    ui.openSettingsPanel();
    return true;
  }

  function tryCd(t) {
    if (t.trim().toLowerCase() !== 'cd ..') return false;
    window.location.href = '../tools.html';
    return true;
  }

  function handleCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const chain = [
      tryCd,
      tryStart,
      tryBreak,
      tryPause,
      tryResume,
      tryStop,
      tryExtend,
      tryStatus,
      tryLog,
      tryClearLog,
      tryHelp,
      trySettings
    ];

    for (const step of chain) {
      if (step(trimmed)) return;
    }

    ui.feedback(
      'use: start [N] · break [N] · pause · resume · stop · extend N · status · log · settings · help',
      'error'
    );
  }

  // =============================================================================
  // ENTRY — event listeners, boot
  // =============================================================================

  let lastCmd = '';

  function shouldRefocusCmd(e) {
    const t = e.target;
    if (t.closest('input, textarea, select, button, a, label')) return false;
    if (t.closest('[aria-modal="true"]')) return false;
    return true;
  }

  function bind() {
    const cmdEl = document.getElementById('cmd');
    if (!cmdEl) return;

    cmdEl.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' && lastCmd && e.target.value.trim() === '') {
        e.preventDefault();
        e.target.value = lastCmd;
        queueMicrotask(() => e.target.setSelectionRange(lastCmd.length, lastCmd.length));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.target.value = '';
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        // close any open modal first
        for (const oid of OVERLAY_IDS) {
          const el = document.getElementById(oid);
          if (el && el.classList.contains('is-open')) {
            ui.closeModal(oid);
            break;
          }
        }
        const line = e.target.value;
        handleCommand(line);
        if (line.trim().length) lastCmd = line;
        e.target.value = '';
      }
    });

    document.body.addEventListener('click', e => {
      if (shouldRefocusCmd(e)) cmdEl.focus();
    });

    // log button + close
    const btnLog         = document.getElementById('btn-log');
    const btnCloseLog    = document.getElementById('btn-close-log');
    const logBackdrop    = document.getElementById('log-backdrop');
    if (btnLog)      btnLog.addEventListener('click', () => ui.openLogPanel());
    if (btnCloseLog) btnCloseLog.addEventListener('click', () => ui.closeModal('log-overlay'));
    if (logBackdrop) logBackdrop.addEventListener('click', () => ui.closeModal('log-overlay'));

    // help close
    const btnCloseHelp  = document.getElementById('btn-close-help');
    const helpBackdrop  = document.getElementById('help-backdrop');
    if (btnCloseHelp) btnCloseHelp.addEventListener('click', () => ui.closeModal('help-overlay'));
    if (helpBackdrop) helpBackdrop.addEventListener('click', () => ui.closeModal('help-overlay'));

    // settings close + live save
    const btnCloseSettings  = document.getElementById('btn-close-settings');
    const settingsBackdrop  = document.getElementById('settings-backdrop');
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => ui.closeModal('settings-overlay'));
    if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => ui.closeModal('settings-overlay'));

    const workMinEl = document.getElementById('setting-work-min');
    if (workMinEl) {
      workMinEl.addEventListener('change', e => {
        const v = parseInt(e.target.value, 10);
        if (v >= 1 && v <= 120) {
          cfg.workMin = v;
          saveSettings();
          ui.feedback('settings saved', 'ok');
          if (timer.state === 'idle') ui.renderDisplay();
        } else {
          e.target.value = cfg.workMin;
        }
      });
    }

    const breakMinEl = document.getElementById('setting-break-min');
    if (breakMinEl) {
      breakMinEl.addEventListener('change', e => {
        const v = parseInt(e.target.value, 10);
        if (v >= 1 && v <= 60) {
          cfg.breakMin = v;
          saveSettings();
          ui.feedback('settings saved', 'ok');
        } else {
          e.target.value = cfg.breakMin;
        }
      });
    }

    const soundEl = document.getElementById('setting-sound');
    if (soundEl) {
      soundEl.addEventListener('change', e => {
        cfg.sound = e.target.checked;
        saveSettings();
        ui.feedback('settings saved', 'ok');
      });
    }

    const lightEl = document.getElementById('setting-light-mode');
    if (lightEl) {
      lightEl.addEventListener('change', e => {
        cfg.light = e.target.checked;
        applyTheme();
        saveSettings();
        ui.feedback('settings saved', 'ok');
      });
    }

    // global Escape closes open modal
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      for (const id of OVERLAY_IDS) {
        const el = document.getElementById(id);
        if (el && el.classList.contains('is-open')) {
          e.preventDefault();
          ui.closeModal(id);
          return;
        }
      }
    }, true);

    // resume AudioContext on first user gesture (browser autoplay policy)
    document.addEventListener('click', () => {
      const ctx = chime.getCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }, { once: true });
  }

  // boot
  loadSettings();
  log.load();
  ui.renderDisplay();
  ui.renderTodaySummary();
  ui.setLogCount();
  ui.updateTitle();
  bind();

})();
