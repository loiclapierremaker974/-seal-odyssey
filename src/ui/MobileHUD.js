const clamp = (value, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, Number(value) || 0));

const DEFAULT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0';
const DEFAULT_BUILD =
  typeof __BUILD_ID__ !== 'undefined'
    ? __BUILD_ID__
    : `p0-local-${DEFAULT_VERSION}`;

export const HUD_EVENTS = Object.freeze({
  CONTROL: 'seal:control',
  START: 'seal:start',
  INTRO_CHANGE: 'seal:intro-change',
  UPDATE_READY: 'seal:sw-update-ready',
});

const SVG = Object.freeze({
  oxygen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9.3 6 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-4.3-9-7-13Z"/></svg>',
  energy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.4 2-8 11h5.2l-1 9 9-12h-5.3l.1-8Z"/></svg>',
  echo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 8-8m-5 8a5 5 0 0 1 5-5m0 13a8 8 0 0 0 8-8m-3 0a5 5 0 0 1-5 5"/><circle cx="12" cy="12" r="2"/></svg>',
  action:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/><path d="m14 7 5-4 2 6-7-2Z"/></svg>',
  dive:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8c3-3 6-3 9 0s6 3 9 0M5 13c2-2 4-2 6 0s4 2 6 0m-5 2v6m-3-3 3 3 3-3"/></svg>',
  hop:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17Q12 3 20 17m-4-2 4 2 1-4M3 21h18"/></svg>',
  ascend:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8c3-3 6-3 9 0s6 3 9 0M5 13c2-2 4-2 6 0s4 2 6 0M12 21v-6m-3 3 3-3 3 3"/></svg>',
  sprint:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 5 4 3-4 3m-6 2h8m-8 4h5M4 9h6"/></svg>',
  care:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S4 15.6 4 9.8A4 4 0 0 1 11 7a4 4 0 0 1 7 2.8C18 15.6 12 20 12 20Z"/></svg>',
});

/**
 * Mobile-first HUD and touch input surface for Seal Odyssey.
 *
 * The HUD does not import the renderer or game state. Consumers may either use
 * `onControl(control, active, value)` or listen for bubbling `seal:control`
 * CustomEvents on the returned `element`/document.
 */
export class MobileHUD {
  constructor(options = {}) {
    const mount =
      typeof options.mount === 'string'
        ? document.querySelector(options.mount)
        : options.mount || document.body;

    if (!(mount instanceof Element)) {
      throw new TypeError('MobileHUD: `mount` doit être un élément du DOM.');
    }

    this.options = {
      version: DEFAULT_VERSION,
      build: DEFAULT_BUILD,
      autoShowIntro: true,
      requestFullscreen: true,
      requestLandscape: true,
      onControl: null,
      onStart: null,
      onCare: null,
      onSound: null,
      ...options,
    };
    this.abortController = new AbortController();
    this.inputState = {
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      action: false,
      dive: false,
      sprint: false,
      care: false,
    };
    this.movementMode = 'land';
    this.registration = null;
    this.toastTimer = null;
    this.keyboardVectors = {
      move: new Set(),
      look: new Set(),
    };

    this.element = document.createElement('div');
    this.element.className = 'mobile-hud';
    this.element.dataset.sealHud = '';
    this.element.innerHTML = this.#template();
    mount.append(this.element);

    this.refs = this.#collectRefs();
    this.#bindControls();
    this.#bindInterface();
    this.setVitals({ oxygen: 100, energy: 100, mode: 'Surface' });
    this.setEchoes(0, 3);
    this.setObjective('Rejoindre le premier Écho');
    this.setDebug({
      Build: this.options.build,
      Version: this.options.version,
      Rendu: 'Initialisation',
      Source: 'Fondation P0 locale',
    });

    if (this.options.autoShowIntro) this.showIntro();
    else this.hideIntro();

    if (window.__SEAL_SW_UPDATE__) {
      this.#showUpdate(window.__SEAL_SW_UPDATE__);
    }
  }

  #template() {
    const { version, build } = this.options;

    return `
      <header class="hud-top" aria-label="État de l'exploration">
        <section class="hud-vitals" aria-label="Jauges vitales">
          <div class="vital vital--oxygen" data-vital="oxygen">
            <span class="vital__icon">${SVG.oxygen}</span>
            <span class="vital__label">O₂</span>
            <meter min="0" max="100" value="100" aria-label="Oxygène"></meter>
            <output>100%</output>
          </div>
          <div class="vital vital--energy" data-vital="energy">
            <span class="vital__icon">${SVG.energy}</span>
            <span class="vital__label">Énergie</span>
            <meter min="0" max="100" value="100" aria-label="Énergie"></meter>
            <output>100%</output>
          </div>
          <span class="mode-chip" data-mode>Surface</span>
        </section>

        <section class="hud-objective" aria-live="polite" aria-atomic="true">
          <span class="hud-kicker">Cap actuel</span>
          <strong data-objective>Rejoindre le premier Écho</strong>
        </section>

        <section class="echo-counter" data-echo-counter aria-label="0 Écho sur 3">
          <span class="echo-counter__icon">${SVG.echo}</span>
          <span class="echo-dots" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <output><b data-echo-current>0</b>/<span data-echo-total>3</span></output>
        </section>

        <div class="hud-tools">
        <button type="button" class="sound-toggle" data-sound aria-pressed="false" aria-label="Activer le son">Son coupé</button>
        <button
          class="build-badge"
          type="button"
          aria-expanded="false"
          aria-controls="seal-debug-panel"
          title="Afficher les informations techniques"
        >
          <span class="build-badge__dot" aria-hidden="true"></span>
          <span>P0 · v${version}</span>
        </button>
        </div>
      </header>

      <aside id="seal-debug-panel" class="debug-panel glass-panel" hidden>
        <div class="debug-panel__heading">
          <strong>État de la build</strong>
          <button type="button" class="icon-button" data-debug-close aria-label="Fermer les informations techniques">×</button>
        </div>
        <dl data-debug-list></dl>
        <small>${build}</small>
      </aside>

      <main class="touch-controls" aria-label="Commandes tactiles">
        <section class="control-zone control-zone--move" aria-label="Déplacement">
          <button
            type="button"
            class="analog-control analog-control--move"
            data-analog="move"
            aria-label="Joystick de déplacement. Glisser ou utiliser les flèches."
          >
            <span class="analog-control__guide" aria-hidden="true"></span>
            <span class="analog-control__knob" aria-hidden="true"></span>
          </button>
          <span class="control-caption" aria-hidden="true">Déplacer</span>
        </section>

        <section class="control-zone control-zone--actions" aria-label="Actions">
          <button type="button" class="action-control action-control--sprint" data-control="sprint" aria-label="Glisser plus vite" title="Glisser plus vite">
            ${SVG.sprint}<span>Sprint</span>
          </button>
          <button type="button" class="action-control action-control--dive" data-control="dive" aria-label="Petit bond sur le ventre" title="Petit bond sur le ventre">
            ${SVG.hop}<span>Bondir</span>
          </button>
          <button type="button" class="action-control action-control--primary" data-control="action" aria-label="Interagir">
            ${SVG.action}<span>Action</span>
          </button>
          <button type="button" class="action-control action-control--care" data-control="care" aria-label="Prendre soin de Luma">
            ${SVG.care}<span>Soin</span>
          </button>
        </section>

        <section class="control-zone control-zone--look" aria-label="Caméra">
          <button
            type="button"
            class="analog-control analog-control--look"
            data-analog="look"
            aria-label="Contrôle de caméra. Glisser ou utiliser les flèches."
          >
            <span class="look-arrows" aria-hidden="true">‹ · ›</span>
          </button>
          <span class="control-caption" aria-hidden="true">Caméra</span>
        </section>
      </main>

      <section class="portrait-notice glass-panel" role="status" aria-label="Orientation recommandée">
        <span class="phone-rotate" aria-hidden="true"></span>
        <strong>Tournez l'iPhone</strong>
        <span>Seal Odyssey se joue en paysage.</span>
      </section>

      <section class="intro-screen" data-intro role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-description intro-source">
        <div class="intro-screen__veil" aria-hidden="true"></div>
        <div class="intro-card glass-panel">
          <p class="intro-eyebrow">Aqualys · Onde Première</p>
          <h1 id="intro-title"><span>Seal</span> Odyssey</h1>
          <p id="intro-description" class="intro-lead">
            Accompagnez Luma du Rivage d’Aelys à la Lagune des Murmures. Écoutez les trois Échos et réveillez le Site Ancien.
          </p>
          <p id="intro-source" class="source-warning">
            Prototype en cours de création : les personnages, les paysages et les sons évolueront au fil du développement.
          </p>
          <ul class="intro-features" aria-label="Contenu de cette fondation">
            <li><span aria-hidden="true">◌</span> Explorer en paysage</li>
            <li><span aria-hidden="true">≈</span> Glisser et bondir</li>
            <li><span aria-hidden="true">✦</span> Retrouver 3 Échos</li>
          </ul>
          <button type="button" class="start-button" data-start>
            <span>Entrer dans Aqualys</span><span aria-hidden="true">→</span>
          </button>
          <small>Son optionnel · Casque conseillé · v${version}</small>
        </div>
      </section>

      <section class="update-banner glass-panel" data-update hidden aria-live="polite">
        <span>Une nouvelle build est prête.</span>
        <button type="button" data-update-apply>Mettre à jour</button>
        <button type="button" class="icon-button" data-update-dismiss aria-label="Ignorer cette mise à jour">×</button>
      </section>

      <div class="hud-toast glass-panel" data-toast role="status" aria-live="polite" hidden></div>
      <p class="sr-only" data-live aria-live="polite"></p>
    `;
  }

  #collectRefs() {
    const find = (selector) => this.element.querySelector(selector);
    return {
      intro: find('[data-intro]'),
      start: find('[data-start]'),
      sound: find('[data-sound]'),
      objective: find('[data-objective]'),
      mode: find('[data-mode]'),
      motionControl: find('[data-control="dive"]'),
      sprintControl: find('[data-control="sprint"]'),
      oxygen: find('[data-vital="oxygen"]'),
      energy: find('[data-vital="energy"]'),
      echoCounter: find('[data-echo-counter]'),
      echoCurrent: find('[data-echo-current]'),
      echoTotal: find('[data-echo-total]'),
      buildBadge: find('.build-badge'),
      debugPanel: find('.debug-panel'),
      debugClose: find('[data-debug-close]'),
      debugList: find('[data-debug-list]'),
      update: find('[data-update]'),
      updateApply: find('[data-update-apply]'),
      updateDismiss: find('[data-update-dismiss]'),
      toast: find('[data-toast]'),
      live: find('[data-live]'),
      hudTop: find('.hud-top'),
      touchControls: find('.touch-controls'),
    };
  }

  #bindControls() {
    this.element.querySelectorAll('[data-analog]').forEach((control) => {
      this.#bindAnalog(control, control.dataset.analog);
    });

    this.element.querySelectorAll('[data-control]').forEach((control) => {
      this.#bindPress(control, control.dataset.control);
    });
  }

  #bindAnalog(control, name) {
    const { signal } = this.abortController;
    let pointerId = null;

    const updateFromPointer = (event) => {
      if (event.pointerId !== pointerId) return;
      const rect = control.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.38);
      let x = (event.clientX - (rect.left + rect.width / 2)) / radius;
      let y = ((rect.top + rect.height / 2) - event.clientY) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      this.#setAnalog(name, x, y, control);
    };

    const release = (event) => {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      const releasedPointer = pointerId;
      pointerId = null;
      if (control.hasPointerCapture?.(releasedPointer)) {
        control.releasePointerCapture(releasedPointer);
      }
      control.classList.remove('is-active');
      this.#setAnalog(name, 0, 0, control, false);
    };

    control.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        control.setPointerCapture?.(pointerId);
        control.classList.add('is-active');
        updateFromPointer(event);
      },
      { signal },
    );
    control.addEventListener('pointermove', updateFromPointer, { signal });
    control.addEventListener('pointerup', release, { signal });
    control.addEventListener('pointercancel', release, { signal });
    control.addEventListener('lostpointercapture', release, { signal });

    const keys = this.keyboardVectors[name];
    control.addEventListener(
      'keydown',
      (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        keys.add(event.key);
        this.#setAnalogFromKeys(name, control);
      },
      { signal },
    );
    control.addEventListener(
      'keyup',
      (event) => {
        if (!keys.has(event.key)) return;
        event.preventDefault();
        keys.delete(event.key);
        this.#setAnalogFromKeys(name, control);
      },
      { signal },
    );
    control.addEventListener(
      'blur',
      () => {
        keys.clear();
        this.#setAnalog(name, 0, 0, control, false);
      },
      { signal },
    );
  }

  #setAnalogFromKeys(name, control) {
    const keys = this.keyboardVectors[name];
    const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    const y = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
    const length = Math.max(1, Math.hypot(x, y));
    this.#setAnalog(name, x / length, y / length, control, x !== 0 || y !== 0);
  }

  #setAnalog(name, x, y, control, active = Math.abs(x) + Math.abs(y) > 0.01) {
    const value = {
      x: Number(clamp(x, -1, 1).toFixed(3)),
      y: Number(clamp(y, -1, 1).toFixed(3)),
    };
    this.inputState[name] = value;
    control.style.setProperty('--stick-x', `${value.x * 34}%`);
    control.style.setProperty('--stick-y', `${value.y * -34}%`);
    this.#emitControl(name, active, value);
  }

  #bindPress(control, name) {
    const { signal } = this.abortController;
    let pointerId = null;
    let keyboardPressed = false;
    let suppressSyntheticClick = false;

    const press = () => {
      if (this.inputState[name]) return;
      this.inputState[name] = true;
      control.classList.add('is-active');
      control.setAttribute('aria-pressed', 'true');
      this.#emitControl(name, true, true);
      if (name === 'care') this.options.onCare?.(true);
    };
    const release = () => {
      if (!this.inputState[name]) return;
      this.inputState[name] = false;
      control.classList.remove('is-active');
      control.setAttribute('aria-pressed', 'false');
      this.#emitControl(name, false, false);
      if (name === 'care') this.options.onCare?.(false);
    };

    control.setAttribute('aria-pressed', 'false');
    control.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        control.setPointerCapture?.(pointerId);
        press();
      },
      { signal },
    );
    const pointerRelease = (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      pointerId = null;
      release();
    };
    control.addEventListener('pointerup', pointerRelease, { signal });
    control.addEventListener('pointercancel', pointerRelease, { signal });
    control.addEventListener('lostpointercapture', pointerRelease, { signal });
    control.addEventListener(
      'keydown',
      (event) => {
        if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
        event.preventDefault();
        keyboardPressed = true;
        suppressSyntheticClick = true;
        press();
      },
      { signal },
    );
    control.addEventListener(
      'keyup',
      (event) => {
        if (!keyboardPressed || ![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        keyboardPressed = false;
        release();
        window.setTimeout(() => {
          suppressSyntheticClick = false;
        }, 0);
      },
      { signal },
    );
    control.addEventListener(
      'click',
      (event) => {
        // Screen readers can activate a button by emitting only a synthetic
        // click. Pointer and keyboard paths above already preserve hold state.
        if (event.detail !== 0 || keyboardPressed || suppressSyntheticClick) return;
        press();
        window.setTimeout(release, 120);
      },
      { signal },
    );
    control.addEventListener('blur', release, { signal });
  }

  #bindInterface() {
    const { signal } = this.abortController;

    this.refs.start.addEventListener(
      'click',
      async () => {
        // Start callbacks run inside the user gesture (Web Audio on iOS).
        this.options.onStart?.();
        this.hideIntro();
        await this.#requestImmersiveMode();
        this.element.dispatchEvent(
          new CustomEvent(HUD_EVENTS.START, { bubbles: true, composed: true }),
        );
      },
      { signal },
    );

    this.refs.sound.addEventListener('click', () => this.options.onSound?.(), { signal });

    const toggleDebug = (open) => {
      const shouldOpen = open ?? this.refs.debugPanel.hidden;
      this.refs.debugPanel.hidden = !shouldOpen;
      this.refs.buildBadge.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) this.refs.debugClose.focus({ preventScroll: true });
    };
    this.refs.buildBadge.addEventListener('click', () => toggleDebug(), { signal });
    this.refs.debugClose.addEventListener('click', () => toggleDebug(false), { signal });

    window.addEventListener(
      HUD_EVENTS.UPDATE_READY,
      (event) => this.#showUpdate(event.detail?.registration),
      { signal },
    );
    this.refs.updateApply.addEventListener(
      'click',
      () => {
        const waiting = this.registration?.waiting;
        if (waiting) {
          this.refs.updateApply.disabled = true;
          this.refs.updateApply.textContent = 'Mise à jour…';
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      },
      { signal },
    );
    this.refs.updateDismiss.addEventListener(
      'click',
      () => {
        this.refs.update.hidden = true;
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !this.refs.debugPanel.hidden) toggleDebug(false);
      },
      { signal },
    );
    document.addEventListener('contextmenu', this.#preventContextMenu, { signal });
  }

  #preventContextMenu = (event) => {
    if (this.element.contains(event.target)) event.preventDefault();
  };

  async #requestImmersiveMode() {
    const requests = [];
    if (this.options.requestFullscreen && document.documentElement.requestFullscreen) {
      requests.push(document.documentElement.requestFullscreen().catch(() => undefined));
    }
    if (this.options.requestLandscape && screen.orientation?.lock) {
      requests.push(screen.orientation.lock('landscape').catch(() => undefined));
    }
    await Promise.allSettled(requests);
  }

  #emitControl(control, active, value) {
    const detail = {
      control,
      active: Boolean(active),
      value,
      timestamp: performance.now(),
    };
    this.options.onControl?.(control, detail.active, value, detail);
    this.element.dispatchEvent(
      new CustomEvent(HUD_EVENTS.CONTROL, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  #showUpdate(registration) {
    if (!registration?.waiting) return;
    this.registration = registration;
    this.refs.update.hidden = false;
  }

  /** Update the same motion button so hold listeners and focus persist. */
  setMovementMode(mode = 'land') {
    const nextMode = mode === 'surface' || mode === 'underwater' ? mode : 'land';
    if (this.movementMode === nextMode) return;
    this.movementMode = nextMode;
    const settings = {
      land: {label:'Bondir',aria:'Petit bond sur le ventre',icon:SVG.hop},
      surface: {label:'Plonger',aria:'Plonger sous la surface',icon:SVG.dive},
      underwater: {label:'Remonter',aria:'Remonter à la surface',icon:SVG.ascend},
    }[nextMode];
    this.refs.motionControl.innerHTML = `${settings.icon}<span>${settings.label}</span>`;
    this.refs.motionControl.setAttribute('aria-label',settings.aria);
    this.refs.motionControl.title = settings.aria;
    const sprintLabel = nextMode === 'land' ? 'Glisser plus vite' : 'Nager plus vite';
    this.refs.sprintControl.setAttribute('aria-label',sprintLabel);
    this.refs.sprintControl.title = sprintLabel;
  }

  setVitals({ oxygen, energy, mode } = {}) {
    if (oxygen !== undefined) this.#setVital(this.refs.oxygen, oxygen);
    if (energy !== undefined) this.#setVital(this.refs.energy, energy);
    if (mode !== undefined) this.refs.mode.textContent = String(mode);
  }

  #setVital(container, value) {
    const normalized = clamp(value);
    container.querySelector('meter').value = normalized;
    container.querySelector('output').value = `${Math.round(normalized)}%`;
    container.dataset.level =
      normalized <= 20 ? 'critical' : normalized <= 45 ? 'warning' : 'normal';
  }

  setEchoes(current, total = 3) {
    const normalizedTotal = Math.max(1, Math.round(Number(total) || 3));
    const normalizedCurrent = Math.round(clamp(current, 0, normalizedTotal));
    this.refs.echoCurrent.textContent = String(normalizedCurrent);
    this.refs.echoTotal.textContent = String(normalizedTotal);
    this.refs.echoCounter.setAttribute(
      'aria-label',
      `${normalizedCurrent} Écho${normalizedCurrent > 1 ? 's' : ''} sur ${normalizedTotal}`,
    );

    const dots = this.refs.echoCounter.querySelector('.echo-dots');
    dots.replaceChildren();
    for (let index = 0; index < normalizedTotal; index += 1) {
      const dot = document.createElement('i');
      dot.classList.toggle('is-found', index < normalizedCurrent);
      dots.append(dot);
    }
  }

  setObjective(objective) {
    this.refs.objective.textContent = String(objective || 'Explorer Aqualys');
  }

  setDebug(details) {
    const entries =
      typeof details === 'string'
        ? [['État', details]]
        : Object.entries(details || {});
    this.refs.debugList.replaceChildren();

    entries.forEach(([label, value]) => {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = String(value);
      this.refs.debugList.append(term, description);
    });
  }

  setBuildStatus(label, state = 'ready') {
    const text = this.refs.buildBadge.querySelector('span:last-child');
    text.textContent = String(label);
    this.refs.buildBadge.dataset.state = state;
  }

  setSoundEnabled(enabled) {
    this.refs.sound.setAttribute('aria-pressed', String(Boolean(enabled)));
    this.refs.sound.setAttribute('aria-label', enabled ? 'Couper le son' : 'Activer le son');
    this.refs.sound.textContent = enabled ? 'Son actif' : 'Son coupé';
  }

  setControlEnabled(name, enabled) {
    const control = [...this.element.querySelectorAll('[data-control], [data-analog]')]
      .find((candidate) =>
        candidate.dataset.control === name || candidate.dataset.analog === name,
      );
    if (control) control.disabled = !enabled;
  }

  setCareMode(active) {
    this.element.classList.toggle('is-care-mode', Boolean(active));
    const control = this.element.querySelector('[data-control="care"]');
    control?.setAttribute('aria-pressed', String(Boolean(active)));
  }

  showIntro() {
    this.refs.intro.hidden = false;
    this.refs.hudTop.inert = true;
    this.refs.touchControls.inert = true;
    this.element.classList.add('is-intro-open');
    this.refs.start.focus({ preventScroll: true });
    this.element.dispatchEvent(
      new CustomEvent(HUD_EVENTS.INTRO_CHANGE, {
        detail: { open: true },
        bubbles: true,
      }),
    );
  }

  hideIntro() {
    this.refs.intro.hidden = true;
    this.refs.hudTop.inert = false;
    this.refs.touchControls.inert = false;
    this.element.classList.remove('is-intro-open');
    this.element.dispatchEvent(
      new CustomEvent(HUD_EVENTS.INTRO_CHANGE, {
        detail: { open: false },
        bubbles: true,
      }),
    );
  }

  showToast(message, { tone = 'info', duration = 2600 } = {}) {
    window.clearTimeout(this.toastTimer);
    this.refs.toast.textContent = String(message);
    this.refs.toast.dataset.tone = tone;
    this.refs.toast.hidden = false;
    this.refs.live.textContent = String(message);
    this.toastTimer = window.setTimeout(() => {
      this.refs.toast.hidden = true;
    }, Math.max(0, duration));
  }

  getInputState() {
    return {
      ...this.inputState,
      move: { ...this.inputState.move },
      look: { ...this.inputState.look },
    };
  }

  setVisible(visible) {
    this.element.hidden = !visible;
  }

  destroy() {
    window.clearTimeout(this.toastTimer);
    this.abortController.abort();
    this.element.remove();
  }
}

export function createMobileHUD(options) {
  return new MobileHUD(options);
}

export default createMobileHUD;
