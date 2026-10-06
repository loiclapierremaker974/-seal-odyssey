const CARE_COPY = Object.freeze({
  caress: {
    label: 'Caresser',
    instruction: 'Faites glisser lentement votre doigt le long du dos de Luma.',
  },
  clean: {
    label: 'Nettoyer',
    instruction: 'Rincez doucement Luma avec plusieurs gestes souples.',
  },
  'belly-tap': {
    label: 'Ventre',
    instruction: 'Trois tapotements doux et reguliers. Luma peut refuser si la confiance manque.',
  },
  feed: {
    label: 'Nourrir',
    instruction: 'Proposez une ration de maree et observez sa preference.',
  },
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export class CarePanel {
  constructor({ mount = document.body, onInteraction, onClose } = {}) {
    if (!(mount instanceof Element)) {
      throw new TypeError('CarePanel mount must be a DOM element.');
    }

    this.onInteraction = onInteraction;
    this.onClose = onClose;
    this.mode = 'caress';
    this.pointer = null;
    this.tapTimes = [];
    this.previousFocus = null;
    this.inertState = [];
    this.abortController = new AbortController();

    this.element = document.createElement('section');
    this.element.className = 'care-panel';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'care-title');
    this.element.innerHTML = `
      <div class="care-panel__backdrop" data-care-close></div>
      <div class="care-card glass-panel">
        <header class="care-card__header">
          <div>
            <p>Soin tactile</p>
            <h2 id="care-title">Un moment avec Luma</h2>
          </div>
          <div class="care-summary" aria-label="Etat de Luma">
            <span>Confiance <strong data-care-trust>0</strong></span>
            <span>Humeur <strong data-care-mood>curieuse</strong></span>
          </div>
          <button type="button" class="icon-button" data-care-close aria-label="Fermer le soin">×</button>
        </header>

        <div class="care-card__body">
          <div
            class="care-surface"
            data-care-surface
            role="application"
            tabindex="0"
            aria-label="Zone tactile de soin de Luma"
          >
            <div class="care-trail" data-care-trail aria-hidden="true"></div>
            <div class="care-progress" aria-hidden="true"><i data-care-progress></i></div>
          </div>

          <div class="care-actions" role="toolbar" aria-label="Choisir un soin">
            ${Object.entries(CARE_COPY)
              .map(
                ([id, copy]) => `
                  <button type="button" data-care-mode="${id}" aria-pressed="${id === 'caress'}">
                    <span aria-hidden="true">${id === 'caress' ? '≈' : id === 'clean' ? '◌' : id === 'belly-tap' ? '···' : '◇'}</span>
                    ${copy.label}
                  </button>`,
              )
              .join('')}
          </div>

          <p class="care-instruction" data-care-instruction>${CARE_COPY.caress.instruction}</p>
          <p class="care-feedback" data-care-feedback role="status" aria-live="polite">
            Observez les signaux de Luma et adaptez votre geste.
          </p>
        </div>
      </div>
    `;
    mount.append(this.element);
    this.refs = {
      card: this.element.querySelector('.care-card'),
      surface: this.element.querySelector('[data-care-surface]'),
      trail: this.element.querySelector('[data-care-trail]'),
      progress: this.element.querySelector('[data-care-progress]'),
      trust: this.element.querySelector('[data-care-trust]'),
      mood: this.element.querySelector('[data-care-mood]'),
      instruction: this.element.querySelector('[data-care-instruction]'),
      feedback: this.element.querySelector('[data-care-feedback]'),
    };
    this.#bind();
  }

  #bind() {
    const { signal } = this.abortController;
    this.element.querySelectorAll('[data-care-close]').forEach((button) => {
      button.addEventListener('click', () => this.close(), { signal });
    });
    this.element.querySelectorAll('[data-care-mode]').forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.careMode), {
        signal,
      });
    });

    this.refs.surface.addEventListener('pointerdown', (event) => this.#pointerDown(event), {
      signal,
    });
    this.refs.surface.addEventListener('pointermove', (event) => this.#pointerMove(event), {
      signal,
    });
    this.refs.surface.addEventListener('pointerup', (event) => this.#pointerUp(event), {
      signal,
    });
    this.refs.surface.addEventListener('pointercancel', () => this.#resetGesture(), {
      signal,
    });
    this.refs.surface.addEventListener(
      'keydown',
      (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        if (this.mode === 'feed') this.#completeInteraction();
        else if (this.mode === 'belly-tap') this.#registerTap(performance.now());
        else {
          const progress = Math.min(1, (this.keyboardProgress || 0) + 0.34);
          this.#setProgress(progress);
          if (progress >= 1) this.#completeInteraction();
        }
      },
      { signal },
    );
    window.addEventListener(
      'keydown',
      (event) => {
        if (this.element.hidden) return;
        if (event.key === 'Escape') {
          this.close();
          return;
        }
        if (event.key === 'Tab') this.#trapFocus(event);
      },
      { signal },
    );
  }

  #trapFocus(event) {
    const focusable = [...this.element.querySelectorAll(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #pointerDown(event) {
    event.preventDefault();
    this.refs.surface.setPointerCapture?.(event.pointerId);
    if (this.mode === 'feed') {
      this.#completeInteraction();
      return;
    }
    if (this.mode === 'belly-tap') {
      this.#registerTap(event.timeStamp || performance.now());
      return;
    }
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: event.timeStamp || performance.now(),
      distance: 0,
    };
    this.refs.surface.classList.add('is-touching');
    this.#placeTrail(event);
  }

  #pointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    event.preventDefault();
    const distance = Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y);
    this.pointer.distance += Math.min(distance, 45);
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.#placeTrail(event);

    const needed = this.mode === 'clean' ? 280 : 170;
    const progress = clamp01(this.pointer.distance / needed);
    this.#setProgress(progress);
    if (progress >= 1) {
      const duration = (event.timeStamp || performance.now()) - this.pointer.startedAt;
      if (this.mode === 'caress' && duration < 520) {
        this.refs.feedback.textContent = 'Luma se crispe un peu : ralentissez le geste.';
        this.#resetGesture();
        return;
      }
      this.#completeInteraction();
    }
  }

  #pointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    if (this.pointer.distance < 45) {
      this.refs.feedback.textContent =
        this.mode === 'clean'
          ? 'Continuez le rinçage avec des gestes doux.'
          : 'Faites un geste plus long et plus lent le long du dos.';
    }
    this.#resetGesture();
  }

  #registerTap(timestamp) {
    const last = this.tapTimes.at(-1);
    if (last && timestamp - last < 180) {
      this.tapTimes = [];
      this.refs.feedback.textContent = 'Trop rapide : laissez un petit intervalle entre les tapotements.';
      this.#setProgress(0);
      return;
    }
    if (last && timestamp - last > 1200) this.tapTimes = [];
    this.tapTimes.push(timestamp);
    this.#setProgress(this.tapTimes.length / 3);
    this.refs.surface.classList.remove('is-tapping');
    requestAnimationFrame(() => this.refs.surface.classList.add('is-tapping'));
    if (this.tapTimes.length >= 3) this.#completeInteraction();
  }

  #placeTrail(event) {
    const rect = this.refs.surface.getBoundingClientRect();
    this.refs.trail.style.setProperty('--care-x', `${event.clientX - rect.left}px`);
    this.refs.trail.style.setProperty('--care-y', `${event.clientY - rect.top}px`);
  }

  #setProgress(value) {
    const normalized = clamp01(value);
    this.keyboardProgress = normalized;
    this.refs.progress.style.setProperty('--care-progress', `${normalized * 100}%`);
  }

  #completeInteraction() {
    const payloads = {
      caress: { zone: 'back', style: 'slow', intensity: 0.3 },
      clean: {
        temperature: 'lukewarm',
        intensity: 'gentle',
        tool: 'freshwater-rinse',
        zone: 'body',
      },
      'belly-tap': { rhythm: 'gentle-steady', intensity: 0.2 },
      feed: { foodId: 'tide-ration' },
    };
    this.onInteraction?.(this.mode, payloads[this.mode]);
    this.refs.surface.classList.add('is-reacting');
    window.setTimeout(() => this.refs.surface.classList.remove('is-reacting'), 480);
    this.#resetGesture();
  }

  #resetGesture() {
    this.pointer = null;
    this.tapTimes = [];
    this.keyboardProgress = 0;
    this.refs.surface.classList.remove('is-touching', 'is-tapping');
    this.#setProgress(0);
  }

  setMode(mode) {
    if (!CARE_COPY[mode]) return;
    this.mode = mode;
    this.#resetGesture();
    this.element.querySelectorAll('[data-care-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.careMode === mode));
    });
    this.refs.instruction.textContent = CARE_COPY[mode].instruction;
    this.refs.feedback.textContent =
      mode === 'feed'
        ? 'Touchez Luma pour lui proposer la ration.'
        : 'Observez sa posture avant de commencer.';
  }

  /** Mount for the existing live 3D canvas; the panel owns no renderer. */
  getSceneMount() { return this.refs.surface; }

  setSeal(seal) {
    const trust = seal?.relationships?.guardianTrust ?? 0;
    const mood = seal?.mood?.state ?? 'neutre';
    this.refs.trust.textContent = `${Math.round(trust)}%`;
    this.refs.mood.textContent = String(mood);
  }

  setFeedback(message, { accepted = true } = {}) {
    this.refs.feedback.textContent = String(message || 'Luma vous observe.');
    this.refs.feedback.dataset.accepted = String(Boolean(accepted));
  }

  open(seal) {
    this.setSeal(seal);
    this.previousFocus = document.activeElement;
    this.inertState = [...this.element.parentElement.children]
      .filter((element) => element !== this.element)
      .map((element) => ({
        element,
        inert: Boolean(element.inert),
        ariaHidden: element.getAttribute('aria-hidden'),
      }));
    this.inertState.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });
    this.element.hidden = false;
    document.body.classList.add('care-open');
    this.refs.card.querySelector('[data-care-close]')?.focus({ preventScroll: true });
  }

  close() {
    if (this.element.hidden) return;
    this.element.hidden = true;
    document.body.classList.remove('care-open');
    this.inertState.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    });
    this.inertState = [];
    this.#resetGesture();
    this.onClose?.();
    this.previousFocus?.focus?.({ preventScroll: true });
    this.previousFocus = null;
  }

  destroy() {
    this.close();
    this.abortController.abort();
    this.element.remove();
  }
}

export default CarePanel;
