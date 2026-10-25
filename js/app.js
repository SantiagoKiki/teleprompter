'use strict';

(() => {
  const STORAGE_KEY = 'teleprompter:v1';
  const THEMES = ['classic', 'amber', 'green'];
  const BAND_POSITIONS = ['top', 'center', 'bottom'];
  const LIMITS = {
    wpm: { min: 40, max: 400, step: 10 },
    fontSize: { min: 32, max: 220, step: 8 },
    markerPct: { min: 10, max: 60, step: 5 },
  };
  const DEFAULTS = {
    text:
      'Hola. Este es tu teleprompter.\n' +
      'Pega aquí tu guion y presiona Iniciar. El texto avanza de derecha a izquierda y la palabra que toca leer se resalta al pasar por la línea de lectura.\n' +
      'Usa la barra espaciadora para pausar, las flechas arriba y abajo para cambiar la velocidad, y las flechas izquierda y derecha para moverte palabra por palabra.',
    wpm: 140,
    fontSize: 96,
    markerPct: 30,
    bandPosition: 'top',
    theme: 'classic',
    mirror: false,
    countdown: true,
  };
  const COUNTDOWN_SECONDS = 3;
  const HUD_HIDE_MS = 2500;
  const DRAG_THRESHOLD_PX = 6;

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const el = {
    editor: $('editor'),
    script: $('script'),
    stats: $('stats'),
    openFile: $('open-file'),
    fileInput: $('file-input'),
    clearScript: $('clear-script'),
    speed: $('speed'),
    speedOut: $('speed-out'),
    fontSize: $('font-size'),
    fontSizeOut: $('font-size-out'),
    marker: $('marker'),
    markerOut: $('marker-out'),
    bandPosition: $('band-position'),
    mirror: $('mirror'),
    countdownToggle: $('countdown-toggle'),
    start: $('start'),
    prompter: $('prompter'),
    stage: $('stage'),
    band: $('band'),
    track: $('track'),
    countdownOverlay: $('countdown'),
    hud: $('hud'),
    progressBar: $('progress-bar'),
    timeLeft: $('time-left'),
    hudSpeed: $('hud-speed'),
    btnBack: $('btn-back'),
    btnRestart: $('btn-restart'),
    btnPlay: $('btn-play'),
    btnSlower: $('btn-slower'),
    btnFaster: $('btn-faster'),
    btnSmaller: $('btn-smaller'),
    btnBigger: $('btn-bigger'),
    btnMirror: $('btn-mirror'),
    btnFullscreen: $('btn-fullscreen'),
  };

  const settings = loadSettings();

  // Prompter state. `pos` is the x coordinate inside the track that sits
  // under the reading line; it grows as the text moves to the left.
  let wordEls = [];
  let wordStarts = [];
  let trackWidth = 0;
  let markerX = 0;
  let pxPerWord = 0;
  let lead = 0;
  let measuredFontSize = 0;
  let pos = 0;
  let currentIndex = -1;
  let playing = false;
  let rafId = 0;
  let lastFrame = 0;
  let countdownTimer = 0;
  let hudTimer = 0;
  let wakeLock = null;
  let drag = null;
  let timeLabel = '';

  // ---------- Settings ----------

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      // Storage unavailable or corrupt: fall back to defaults.
    }
    const s = { ...DEFAULTS, ...saved };
    for (const [key, { min, max }] of Object.entries(LIMITS)) {
      s[key] = Number.isFinite(Number(s[key])) ? clamp(Number(s[key]), min, max) : DEFAULTS[key];
    }
    if (typeof s.text !== 'string') s.text = DEFAULTS.text;
    if (!THEMES.includes(s.theme)) s.theme = DEFAULTS.theme;
    if (!BAND_POSITIONS.includes(s.bandPosition)) s.bandPosition = DEFAULTS.bandPosition;
    s.mirror = Boolean(s.mirror);
    s.countdown = Boolean(s.countdown);
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {
      // Private mode or storage full: settings just won't persist.
    }
  }

  // ---------- Editor ----------

  function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function updateStats() {
    const n = countWords(el.script.value);
    const label = n === 1 ? 'palabra' : 'palabras';
    el.stats.textContent = `${n} ${label} · ${formatTime((n / settings.wpm) * 60)} a ${settings.wpm} ppm`;
    el.start.disabled = n === 0;
  }

  function updateOutputs() {
    el.speedOut.textContent = `${settings.wpm} ppm`;
    el.fontSizeOut.textContent = `${settings.fontSize} px`;
    el.markerOut.textContent = `${settings.markerPct} %`;
  }

  function syncControls() {
    el.speed.value = settings.wpm;
    el.fontSize.value = settings.fontSize;
    el.marker.value = settings.markerPct;
    el.bandPosition.value = settings.bandPosition;
    el.mirror.checked = settings.mirror;
    el.countdownToggle.checked = settings.countdown;
    const theme = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
    if (theme) theme.checked = true;
    updateOutputs();
    updateStats();
  }

  function setScript(text) {
    el.script.value = text;
    settings.text = text;
    updateStats();
    saveSettings();
    el.script.focus();
  }

  async function loadFile(file) {
    if (!file) return;
    try {
      setScript(await file.text());
    } catch (_) {
      alert('No se pudo leer el archivo.');
    }
  }

  function bindEditor() {
    el.script.addEventListener('input', () => {
      settings.text = el.script.value;
      updateStats();
      saveSettings();
    });

    const ranges = [
      [el.speed, 'wpm'],
      [el.fontSize, 'fontSize'],
      [el.marker, 'markerPct'],
    ];
    for (const [input, key] of ranges) {
      Object.assign(input, LIMITS[key]);
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        updateOutputs();
        updateStats();
        saveSettings();
      });
    }

    el.bandPosition.addEventListener('change', () => {
      settings.bandPosition = el.bandPosition.value;
      saveSettings();
    });
    el.mirror.addEventListener('change', () => {
      settings.mirror = el.mirror.checked;
      saveSettings();
    });
    el.countdownToggle.addEventListener('change', () => {
      settings.countdown = el.countdownToggle.checked;
      saveSettings();
    });
    for (const radio of document.querySelectorAll('input[name="theme"]')) {
      radio.addEventListener('change', () => {
        settings.theme = radio.value;
        saveSettings();
      });
    }

    el.openFile.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', () => {
      loadFile(el.fileInput.files[0]);
      el.fileInput.value = '';
    });
    el.script.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault();
    });
    el.script.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      loadFile(file);
    });
    el.clearScript.addEventListener('click', () => {
      if (!el.script.value || confirm('¿Borrar todo el guion?')) setScript('');
    });

    el.start.addEventListener('click', openPrompter);
  }

  // ---------- Prompter: layout ----------

  // Words of each line; `null` marks a line break, shown as a separator.
  function tokenize(text) {
    const tokens = [];
    for (const line of text.split(/\r?\n/)) {
      const words = line.split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      if (tokens.length) tokens.push(null);
      for (const word of words) tokens.push(word);
    }
    return tokens;
  }

  function renderTrack() {
    const frag = document.createDocumentFragment();
    wordEls = [];
    tokenize(settings.text).forEach((token, i) => {
      if (i) frag.append(' ');
      const span = document.createElement('span');
      if (token === null) {
        span.className = 'sep';
        span.textContent = '•';
        span.setAttribute('aria-hidden', 'true');
      } else {
        span.className = 'word';
        span.textContent = token;
        wordEls.push(span);
      }
      frag.append(span);
    });
    el.track.replaceChildren(frag);
    currentIndex = -1;
  }

  // Reads sizes from the DOM. The position is kept relative to the word under
  // the reading line, so a font or window change stays on the same word.
  function measure() {
    const index = findWordAt(pos);
    const offset = measuredFontSize ? (pos - (wordStarts[index] ?? 0)) / measuredFontSize : 0;

    markerX = (el.band.clientWidth * settings.markerPct) / 100;
    trackWidth = el.track.scrollWidth;
    wordStarts = wordEls.map((w) => w.offsetLeft);
    pxPerWord = wordEls.length ? trackWidth / wordEls.length : 0;
    lead = settings.fontSize * 0.5;
    measuredFontSize = settings.fontSize;

    pos = clamp((wordStarts[index] ?? 0) + offset * settings.fontSize, -lead, trackWidth);
  }

  function applyPrompterSettings() {
    el.prompter.style.setProperty('--font-size', `${settings.fontSize}px`);
    el.prompter.style.setProperty('--marker', `${settings.markerPct}%`);
    el.prompter.dataset.band = settings.bandPosition;
    el.prompter.dataset.theme = settings.theme;
    el.stage.classList.toggle('is-mirrored', settings.mirror);
    el.btnMirror.setAttribute('aria-pressed', String(settings.mirror));
    el.hudSpeed.textContent = `${settings.wpm} ppm`;
  }

  // Index of the last word whose left edge has reached `x`, or -1.
  function findWordAt(x) {
    let lo = 0;
    let hi = wordStarts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wordStarts[mid] <= x) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  function pxPerSecond() {
    return (settings.wpm / 60) * pxPerWord;
  }

  function render() {
    el.track.style.transform = `translate3d(${markerX - pos}px, 0, 0)`;

    const index = findWordAt(pos);
    if (index !== currentIndex) {
      wordEls[currentIndex]?.classList.remove('is-current');
      wordEls[index]?.classList.add('is-current');
      currentIndex = index;
    }

    const progress = trackWidth ? clamp(pos / trackWidth, 0, 1) : 0;
    el.progressBar.style.transform = `scaleX(${progress})`;

    const speed = pxPerSecond();
    const label = speed ? `−${formatTime((trackWidth - Math.max(pos, 0)) / speed)}` : '';
    if (label !== timeLabel) {
      el.timeLeft.textContent = label;
      timeLabel = label;
    }
  }

  // ---------- Prompter: playback ----------

  function isAtEnd() {
    return trackWidth > 0 && pos >= trackWidth;
  }

  function tick(now) {
    // Cap the step so a stalled frame (e.g. a background tab) doesn't jump ahead.
    const dt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    pos += pxPerSecond() * dt;
    if (isAtEnd()) {
      pos = trackWidth;
      render();
      pause();
      return;
    }
    render();
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    cancelCountdown();
    if (playing || !wordEls.length) return;
    if (isAtEnd()) pos = -lead;
    playing = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
    updatePlayButton();
    requestWakeLock();
    scheduleHudHide();
  }

  function pause() {
    cancelCountdown();
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(rafId);
    updatePlayButton();
    releaseWakeLock();
    showHud();
  }

  function togglePlay() {
    if (countdownTimer) {
      cancelCountdown();
    } else if (playing) {
      pause();
    } else {
      if (isAtEnd()) {
        pos = -lead;
        render();
      }
      if (settings.countdown && pos <= 0) startCountdown();
      else play();
    }
  }

  function updatePlayButton() {
    const label = playing ? 'Pausar' : isAtEnd() ? 'Volver a empezar' : 'Reproducir';
    el.btnPlay.dataset.state = playing ? 'playing' : 'paused';
    el.btnPlay.setAttribute('aria-label', label);
    el.btnPlay.title = `${label} (Espacio)`;
  }

  function startCountdown() {
    cancelCountdown();
    let remaining = COUNTDOWN_SECONDS;
    const show = () => {
      el.countdownOverlay.textContent = remaining;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.countdownOverlay.animate(
          [
            { transform: 'scale(1.25)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1, offset: 0.2 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0.3 },
          ],
          { duration: 1000, easing: 'ease-out' },
        );
      }
    };
    el.countdownOverlay.hidden = false;
    show();
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) show();
      else play();
    }, 1000);
  }

  function cancelCountdown() {
    if (!countdownTimer) return;
    clearInterval(countdownTimer);
    countdownTimer = 0;
    el.countdownOverlay.hidden = true;
  }

  function restart() {
    pause();
    pos = -lead;
    render();
    updatePlayButton();
  }

  function seekBy(px) {
    pos = clamp(pos + px, -lead, trackWidth);
    render();
    updatePlayButton();
  }

  // Moves to the start of a word. Going back first snaps to the start of the
  // current word, like the "previous track" button on a music player.
  function seekWords(delta) {
    if (!wordStarts.length) return;
    const index = findWordAt(pos);
    let target;
    if (delta < 0) {
      const atWordStart = index >= 0 && pos - wordStarts[index] < settings.fontSize * 0.3;
      target = (atWordStart ? index : index + 1) + delta;
    } else {
      target = index + delta;
    }
    pos = wordStarts[clamp(target, 0, wordStarts.length - 1)];
    render();
    updatePlayButton();
  }

  function changeSpeed(delta) {
    settings.wpm = clamp(settings.wpm + delta, LIMITS.wpm.min, LIMITS.wpm.max);
    el.hudSpeed.textContent = `${settings.wpm} ppm`;
    render();
    saveSettings();
  }

  function changeFont(delta) {
    settings.fontSize = clamp(settings.fontSize + delta, LIMITS.fontSize.min, LIMITS.fontSize.max);
    applyPrompterSettings();
    measure();
    render();
    saveSettings();
  }

  function toggleMirror() {
    settings.mirror = !settings.mirror;
    applyPrompterSettings();
    saveSettings();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.prompter.requestFullscreen?.().catch(() => {});
  }

  function openPrompter() {
    settings.text = el.script.value;
    saveSettings();
    if (!countWords(settings.text)) return;

    el.editor.hidden = true;
    el.prompter.hidden = false;
    applyPrompterSettings();
    renderTrack();
    measure();
    pos = -lead;
    render();
    updatePlayButton();
    showHud();

    if (settings.countdown) startCountdown();
    else play();
  }

  function closePrompter() {
    pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    el.prompter.hidden = true;
    el.editor.hidden = false;
    syncControls();
    el.start.focus();
  }

  // ---------- Prompter: HUD, screen and input ----------

  function showHud() {
    el.prompter.classList.remove('is-idle');
    scheduleHudHide();
  }

  function scheduleHudHide() {
    clearTimeout(hudTimer);
    if (!playing) return;
    hudTimer = setTimeout(() => {
      if (playing && !el.hud.matches(':hover')) el.prompter.classList.add('is-idle');
    }, HUD_HIDE_MS);
  }

  async function requestWakeLock() {
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (_) {
      // Not allowed (e.g. battery saver); the screen may dim, nothing else to do.
    }
  }

  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function bindPrompter() {
    el.btnBack.addEventListener('click', closePrompter);
    el.btnRestart.addEventListener('click', restart);
    el.btnPlay.addEventListener('click', togglePlay);
    el.btnSlower.addEventListener('click', () => changeSpeed(-LIMITS.wpm.step));
    el.btnFaster.addEventListener('click', () => changeSpeed(LIMITS.wpm.step));
    el.btnSmaller.addEventListener('click', () => changeFont(-LIMITS.fontSize.step));
    el.btnBigger.addEventListener('click', () => changeFont(LIMITS.fontSize.step));
    el.btnMirror.addEventListener('click', toggleMirror);
    el.btnFullscreen.addEventListener('click', toggleFullscreen);

    // Mouse clicks shouldn't leave focus on a button, or Space would press it
    // again instead of toggling playback.
    el.hud.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && e.detail > 0) button.blur();
    });

    if (!document.fullscreenEnabled) el.btnFullscreen.hidden = true;
    document.addEventListener('fullscreenchange', () => {
      el.btnFullscreen.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
    });

    el.prompter.addEventListener('pointermove', showHud);

    // Tap toggles playback; dragging scrubs through the text.
    el.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, pos, moved: false, resume: false };
      el.stage.setPointerCapture(e.pointerId);
    });
    el.stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        drag.resume = playing || Boolean(countdownTimer);
        pause();
        drag.x = e.clientX;
        drag.pos = pos;
        el.stage.classList.add('is-dragging');
      }
      const dx = e.clientX - drag.x;
      pos = clamp(drag.pos + (settings.mirror ? dx : -dx), -lead, trackWidth);
      render();
    });
    const endDrag = (e) => {
      if (!drag) return;
      const { moved, resume } = drag;
      drag = null;
      el.stage.classList.remove('is-dragging');
      if (!moved) {
        if (e.type === 'pointerup') togglePlay();
        return;
      }
      updatePlayButton();
      if (resume) play();
    };
    el.stage.addEventListener('pointerup', endDrag);
    el.stage.addEventListener('pointercancel', endDrag);

    el.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.band.clientWidth : 1;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        seekBy(delta * unit);
        showHud();
      },
      { passive: false },
    );

    new ResizeObserver(() => {
      if (el.prompter.hidden) return;
      measure();
      render();
    }).observe(el.band);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && playing) requestWakeLock();
    });
  }

  function onKeyDown(e) {
    if (el.prompter.hidden) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        openPrompter();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Let a keyboard-focused HUD button handle its own activation.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')) return;

    const words = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        togglePlay();
        break;
      case 'ArrowUp':
        changeSpeed(LIMITS.wpm.step);
        break;
      case 'ArrowDown':
        changeSpeed(-LIMITS.wpm.step);
        break;
      case 'ArrowRight':
        seekWords(words);
        break;
      case 'ArrowLeft':
        seekWords(-words);
        break;
      case '+':
      case '=':
        changeFont(LIMITS.fontSize.step);
        break;
      case '-':
      case '_':
        changeFont(-LIMITS.fontSize.step);
        break;
      case 'r':
      case 'R':
      case 'Home':
        restart();
        break;
      case 'm':
      case 'M':
        toggleMirror();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'Escape':
        closePrompter();
        break;
      default:
        return;
    }
    e.preventDefault();
    showHud();
  }

  // ---------- Init ----------

  bindEditor();
  bindPrompter();
  document.addEventListener('keydown', onKeyDown);
  el.script.value = settings.text;
  syncControls();
})();
